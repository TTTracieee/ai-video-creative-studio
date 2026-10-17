import { beforeAll, afterAll, afterEach, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  composePrompt,
  defaultProfile,
  emptyBrief,
  planDirtyRegions,
  readScene,
  sampleBrief,
  type Brief,
} from "../src/lib/domain";
import * as service from "../src/lib/service";
import { buildFirstCut } from "../src/lib/first-cut";
import { getAnalytics } from "../src/lib/analytics";
import { thumbnailResponse } from "../src/lib/media";
const directory = mkdtempSync(join(tmpdir(), "frame-experience-"));
const url = `file:${join(directory, "test.db")}`;
const context = { sessionId: "experience-test" };
const shoes: Brief = {
  ...sampleBrief,
  brandName: "Stride",
  productDescription: "Lightweight running shoes with blue mesh uppers",
  targetAudience: "Road runners",
  creativeConcept: "Track a runner from training to the finish line",
  visualStyle: "Crisp, energetic sports photography",
};
let db: PrismaClient;
beforeAll(() => {
  process.env.MEDIA_ROOT = join(directory, "media");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  db = new PrismaClient({ datasourceUrl: url });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await db.$disconnect();
  delete process.env.MEDIA_ROOT;
  rmSync(directory, { force: true, recursive: true });
});
async function project(origin = "user") {
  const p = await service.createProject(db, { brief: shoes, origin }, context);
  return service.generateBoard(db, p.id, { revision: 0 }, context);
}
type Plan = Awaited<ReturnType<typeof project>>;
const planInput = (p: Plan) => ({
  revision: p.revision,
  name: p.name,
  brief: p.brief,
  profile: p.profile,
  scenes: p.scenes,
});
async function complete(p: Plan, sceneIds = p.scenes.map((s) => s.id)) {
  const tasks = await service.startTasks(
    db,
    p.id,
    { revision: p.revision, sceneIds, idempotencyKey: randomUUID() },
    context,
  );
  for (const task of tasks)
    await service.syncTask(db, task.id, context, new Date(task.createdAt.getTime() + 7000));
  return service.getProject(db, p.id);
}
it("maps all five structured fields to submitted prompts and immutable snapshots without model calls", async () => {
  const transport = vi.fn().mockRejectedValue(new Error("No network allowed"));
  vi.stubGlobal("fetch", transport);
  let p = await project();
  const originals = [];
  for (const field of [
    "visualDescription",
    "subject",
    "cameraMovement",
    "lighting",
    "mood",
  ] as const) {
    const value = `Unique edited ${field}: low angle athlete motion`;
    p = await service.savePlan(
      db,
      p.id,
      { ...planInput(p), scenes: p.scenes.map((s, i) => (i ? s : { ...s, [field]: value })) },
      context,
    );
    const [task] = await service.startTasks(
      db,
      p.id,
      { revision: p.revision, sceneIds: [p.scenes[0].id], idempotencyKey: randomUUID() },
      context,
    );
    const snapshot = JSON.parse(JSON.stringify(task.snapshot));
    expect(snapshot.scene[field]).toBe(value);
    expect(snapshot.finalPrompt).toContain(value);
    expect(snapshot.scene.promptMode).toBe("structured");
    originals.push({ id: task.id, snapshot });
  }
  for (const old of originals)
    expect((await db.generationTask.findUniqueOrThrow({ where: { id: old.id } })).snapshot).toEqual(
      old.snapshot,
    );
  expect(transport).not.toHaveBeenCalled();
});
it("makes override explicit, retains both inputs, and preserves old prompts without changing task history", async () => {
  let p = await project();
  const override = "A charcoal trainer rotating on a red plinth.";
  p = await service.savePlan(
    db,
    p.id,
    {
      ...planInput(p),
      scenes: p.scenes.map((s, i) =>
        i ? s : { ...s, promptMode: "override", promptOverride: override },
      ),
      profile: { ...p.profile, brandElements: "ONLY approved Stride branding" },
    },
    context,
  );
  const text = composePrompt(p.scenes[0], p.profile);
  expect(text).toContain(override);
  expect(text).not.toContain(p.scenes[0].visualDescription);
  expect(text).toContain("ONLY approved Stride branding");
  expect(text).toContain("take precedence");
  const oldPrompt = p.scenes[0].prompt;
  const invalid = {
    ...planInput(p),
    name: "Must not be saved",
    scenes: p.scenes.map((s, i) => (i ? s : { ...s, promptOverride: "" })),
  };
  await expect(service.savePlan(db, p.id, invalid, context)).rejects.toThrow();
  expect((await service.getProject(db, p.id)).name).toBe(p.name);
  p = await service.savePlan(
    db,
    p.id,
    {
      ...planInput(p),
      scenes: p.scenes.map((s, i) => (i ? s : { ...s, promptMode: "structured" })),
    },
    context,
  );
  expect(composePrompt(p.scenes[0], p.profile)).toContain(p.scenes[0].visualDescription);
  expect(p.scenes[0].promptOverride).toBe(override);
  expect(p.scenes[0].prompt).toBe(oldPrompt);
  const { promptMode: _mode, promptOverride: _override, ...legacy } = p.scenes[0];
  void _mode;
  void _override;
  expect(readScene(legacy)).toMatchObject({ promptMode: "override", promptOverride: oldPrompt });
});
it("initializes a non-coffee brief and mock storyboard without unrelated people, packaging or environments", async () => {
  const p = await project();
  const text = JSON.stringify({ profile: p.profile, scenes: p.scenes }).toLowerCase();
  expect(text).not.toMatch(/coffee|ceramic|cream packaging|amber label|morning|beige knit|sweater/);
  const longBrief = { ...shoes, productDescription: "A".repeat(2000) };
  const longProject = await service.createProject(db, { brief: longBrief }, context);
  const recovered = await service.getProject(db, longProject.id);
  expect(recovered.profile.productAppearance).toBe(longBrief.productDescription);
  expect(p.profile.productAppearance).toBe(shoes.productDescription);
  expect(p.profile.characterIdentity).toBe("");
  expect(p.profile.visualStyle).toBe(shoes.visualStyle);
  expect(JSON.stringify(defaultProfile(emptyBrief))).not.toMatch(/coffee|cup|morning/i);
});
it("saves the whole plan atomically, identifies dirty regions, and preserves drafts on validation/conflict", async () => {
  let p = await project();
  const draft = {
    ...planInput(p),
    name: "Sprint campaign",
    brief: { ...p.brief, visualStyle: "Monochrome" },
    profile: { ...p.profile, characterIdentity: "A runner in a blue vest" },
    scenes: p.scenes.map((s, i) => (i ? s : { ...s, title: "Opening sprint" })),
  };
  expect(planDirtyRegions(p, draft)).toEqual(["Brief", "Creative Direction", "Scenes"]);
  const saved = await service.savePlan(db, p.id, draft, context);
  expect(saved.revision).toBe(p.revision + 1);
  expect(saved.profileVersion).toBe(p.profileVersion + 1);
  expect(saved.brief.visualStyle).toBe("Monochrome");
  expect(saved.profile.visualStyle).toBe(shoes.visualStyle);
  expect(saved.scenes[0].title).toBe("Opening sprint");
  expect(planDirtyRegions(saved, { ...draft, scenes: saved.scenes })).toEqual([]);
  await expect(service.savePlan(db, p.id, draft, context)).rejects.toMatchObject({
    code: "VERSION_CONFLICT",
  });
  const bad = {
    ...planInput(saved),
    name: "Invalid partial save",
    scenes: saved.scenes.map((s, i) => (i ? s : { ...s, subject: "" })),
  };
  expect(() => planDirtyRegions(saved, bad)).not.toThrow();
  await expect(service.savePlan(db, p.id, bad, context)).rejects.toThrow();
  p = await service.getProject(db, p.id);
  expect(p.name).toBe("Sprint campaign");
  expect(p.revision).toBe(saved.revision);
});
it("keeps an existing cut current through plan edits, supports old keys, and invalidates only media changes", async () => {
  let p = await complete(await project());
  const cut = await buildFirstCut(db, p.id, { revision: p.revision }, context);
  const legacyKey = createHash("sha256").update(JSON.stringify(cut.snapshot)).digest("hex");
  await db.projectOutput.update({ where: { id: cut.id }, data: { selectionKey: legacyKey } });
  p = await service.savePlan(
    db,
    p.id,
    {
      ...planInput(p),
      name: "Renamed",
      brief: {
        ...p.brief,
        creativeConcept: "A different future idea",
        duration: 30,
        aspectRatio: "16:9",
      },
      profile: { ...p.profile, visualStyle: "Future neon style" },
      scenes: p.scenes.map((s, i) =>
        i
          ? s
          : { ...s, title: "New title", duration: 4, cameraMovement: "A new camera instruction" },
      ),
    },
    context,
  );
  expect(p.outputIsCurrent).toBe(true);
  expect(p.output?.id).toBe(cut.id);
  expect(p.progress.label).toBe("Draft ready");
  expect((await buildFirstCut(db, p.id, { revision: p.revision }, context)).id).toBe(cut.id);
  expect((await db.projectOutput.findUniqueOrThrow({ where: { id: cut.id } })).snapshot).toEqual(
    cut.snapshot,
  );
  const reversed = await service.savePlan(
    db,
    p.id,
    { ...planInput(p), scenes: [...p.scenes].reverse() },
    context,
  );
  expect(reversed.outputIsCurrent).toBe(false);
  p = await service.savePlan(db, p.id, { ...planInput(reversed), scenes: p.scenes }, context);
  expect(p.outputIsCurrent).toBe(true);
  const firstId = p.scenes[0].id;
  const previous = p.scenes[0].selectedGenerationTaskId;
  p = await complete(p, [firstId]);
  expect(p.outputIsCurrent).toBe(true);
  const next = p.tasks.find((t) => t.sceneId === firstId && t.id !== previous)!;
  p = await service.selectSceneVersion(db, p.id, firstId, {
    revision: p.revision,
    taskId: next.id,
  });
  expect(p.outputIsCurrent).toBe(false);
});
it("records real build/export events once per artifact/action and separates execution mode and origin", async () => {
  const before = await getAnalytics(db, { mode: "mock", origin: "user" });
  const p = await complete(await project());
  const cut = await buildFirstCut(db, p.id, { revision: p.revision }, context);
  await buildFirstCut(db, p.id, { revision: p.revision }, context);
  const exportId = randomUUID();
  await service.recordMP4Export(db, cut.id, context, exportId);
  await service.recordMP4Export(db, cut.id, context, exportId);
  await service.recordMP4Export(db, cut.id, context, randomUUID());
  const metrics = await getAnalytics(db, { mode: "mock", origin: "user" });
  expect(metrics.firstCutsBuilt - before.firstCutsBuilt).toBe(1);
  expect(metrics.mp4Exports - before.mp4Exports).toBe(2);
  expect((await getAnalytics(db, { mode: "live", origin: "user" })).mp4Exports).toBe(0);
  expect((await getAnalytics(db, { mode: "mock", origin: "demo" })).mp4Exports).toBe(0);
  const sample = await complete(await project("demo"));
  const sampleCut = await buildFirstCut(db, sample.id, { revision: sample.revision }, context);
  await service.recordMP4Export(db, sampleCut.id, context, randomUUID());
  expect((await getAnalytics(db, { mode: "mock", origin: "user" })).mp4Exports).toBe(
    metrics.mp4Exports,
  );
  expect((await getAnalytics(db, { mode: "mock", origin: "demo" })).mp4Exports).toBe(1);
  await service.exportProject(db, p.id, context);
  expect((await getAnalytics(db, { mode: "mock", origin: "user" })).mp4Exports).toBe(
    metrics.mp4Exports,
  );
});
it("saves notes without stars and generates reusable real video thumbnails locally", async () => {
  const p = await complete(await project());
  const task = p.tasks[0];
  await service.reviewTask(
    db,
    task.id,
    { feedback: "Keep this version: clear product silhouette" },
    context,
  );
  const note = await db.review.findUniqueOrThrow({ where: { taskId: task.id } });
  expect(note.rating).toBeNull();
  expect(note.feedback).toContain("silhouette");
  const media = await db.generationTask.findUniqueOrThrow({ where: { id: task.id } });
  const response = await thumbnailResponse(db, media, new Request("http://localhost/thumb"));
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2)).toEqual(Buffer.from([255, 216]));
  const head = await thumbnailResponse(
    db,
    media,
    new Request("http://localhost/thumb", { method: "HEAD" }),
  );
  expect(Number(head.headers.get("content-length"))).toBeGreaterThan(10);
  expect(await head.text()).toBe("");
});

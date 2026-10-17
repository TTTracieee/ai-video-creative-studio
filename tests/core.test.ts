import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  briefSchema,
  composePrompt,
  defaultProfile,
  parseStoryboard,
  sampleBrief,
} from "../src/lib/domain";
import { MockStoryboardProvider, MockVideoProvider } from "../src/lib/providers/mock";
import { validateCapabilities } from "../src/lib/providers/types";
import * as service from "../src/lib/service";

const context = { sessionId: "test-session" };
const directory = mkdtempSync(path.join(tmpdir(), "frame-test-"));
const url = `file:${path.join(directory, "test.db")}`;
let db: PrismaClient;
beforeAll(() => {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  db = new PrismaClient({ datasourceUrl: url });
});
afterAll(async () => {
  await db?.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});
async function project() {
  const created = await service.createProject(db, { brief: sampleBrief }, context);
  return service.generateBoard(db, created.id, { revision: 0 }, context);
}

describe("storyboard contract", () => {
  it("rejects invalid inputs and malformed model output", () => {
    expect(briefSchema.safeParse({ ...sampleBrief, brandName: " " }).success).toBe(false);
    expect(briefSchema.safeParse({ ...sampleBrief, duration: 17 }).success).toBe(false);
    expect(() => parseStoryboard("not json", sampleBrief)).toThrow();
    expect(() => parseStoryboard({ scenes: [{ title: "missing fields" }] }, sampleBrief)).toThrow();
  });
  it("plans 15/30 seconds exactly and checks semantic constraints", async () => {
    const provider = new MockStoryboardProvider();
    for (const duration of [15, 30] as const) {
      const brief = { ...sampleBrief, duration };
      const scenes = await provider.generate(brief, defaultProfile(brief));
      expect(scenes).toHaveLength(duration === 15 ? 3 : 5);
      expect(scenes.reduce((n, s) => n + s.duration, 0)).toBe(duration);
    }
    const scenes = await provider.generate(sampleBrief, defaultProfile(sampleBrief));
    scenes[0].duration = 4;
    expect(() => parseStoryboard({ scenes }, sampleBrief)).toThrow("total duration");
  });
});
describe("persistent workflow", () => {
  it("saves edits, preserves IDs/order, regenerates and rejects stale saves", async () => {
    const p = await project();
    const scenes = [...p.scenes].reverse();
    scenes[0].title = "My edited scene";
    const saved = await service.saveBoard(db, p.id, { revision: p.revision, scenes }, context);
    expect(saved.scenes[0].title).toBe("My edited scene");
    expect(saved.scenes[0].id).toBe(scenes[0].id);
    await expect(
      service.saveBoard(db, p.id, { revision: p.revision, scenes }, context),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const rewritten = await service.regenerateScene(
      db,
      p.id,
      saved.scenes[0].id,
      { revision: saved.revision },
      context,
    );
    expect(rewritten.scenes[0].duration).toBe(5);
    expect(rewritten.scenes[0].prompt).not.toBe(saved.scenes[0].prompt);
    await db.$disconnect();
    const reconnected = new PrismaClient({ datasourceUrl: url });
    expect((await service.getProject(reconnected, p.id)).scenes[0].prompt).toBe(
      rewritten.scenes[0].prompt,
    );
    await reconnected.$disconnect();
  });
  it("snapshots the shared profile and leaves history intact after scene deletion", async () => {
    const p = await project();
    await service.updateProject(
      db,
      p.id,
      {
        revision: p.revision,
        profile: { ...p.profile, characterIdentity: "A person with a blue jacket" },
      },
      context,
    );
    const updated = await service.getProject(db, p.id);
    const [task] = await service.startTasks(
      db,
      p.id,
      { revision: updated.revision, sceneIds: [p.scenes[0].id], idempotencyKey: randomUUID() },
      context,
    );
    const snapshot = JSON.parse(JSON.stringify(task.snapshot));
    expect(snapshot.finalPrompt).toContain("blue jacket");
    expect(snapshot.profileVersion).toBe(2);
    await service.updateProject(
      db,
      p.id,
      { revision: updated.revision, profile: { ...p.profile, characterIdentity: "A red jacket" } },
      context,
    );
    const newer = await service.getProject(db, p.id);
    await service.saveBoard(
      db,
      p.id,
      { revision: newer.revision, scenes: newer.scenes.slice(1) },
      context,
    );
    const history = await db.generationTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(history.sceneId).toBeNull();
    expect(history.snapshot).toEqual(task.snapshot);
  });
  it("validates capabilities, keeps unbalanced drafts and blocks batch generation", async () => {
    const p = await project();
    const scenes = p.scenes.map((s, i) => ({ ...s, duration: i === 0 ? 9 : 5 }));
    const saved = await service.saveBoard(db, p.id, { revision: p.revision, scenes }, context);
    await expect(
      service.startTasks(
        db,
        p.id,
        {
          revision: saved.revision,
          sceneIds: saved.scenes.map((s) => s.id),
          idempotencyKey: randomUUID(),
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "DURATION_MISMATCH" });
    await expect(
      service.startTasks(
        db,
        p.id,
        { revision: saved.revision, sceneIds: [saved.scenes[0].id], idempotencyKey: randomUUID() },
        context,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_DURATION" });
    const snapshot = {
      scene: p.scenes[0],
      profile: p.profile,
      profileVersion: 1,
      finalPrompt: composePrompt(p.scenes[0], p.profile),
      aspectRatio: p.brief.aspectRatio,
    };
    expect(() =>
      validateCapabilities(
        { ...snapshot, finalPrompt: "x".repeat(10001) },
        new MockVideoProvider().capabilities,
      ),
    ).toThrow("Combined prompt");
  });
  it("transitions deterministically, deduplicates submits/events, retries and upserts ratings", async () => {
    const p = await project();
    const input = {
      revision: p.revision,
      sceneIds: [p.scenes[0].id],
      scenario: "fail",
      idempotencyKey: randomUUID(),
    };
    const [task] = await service.startTasks(db, p.id, input, context);
    const [duplicate] = await service.startTasks(db, p.id, input, context);
    expect(duplicate.id).toBe(task.id);
    expect(
      (await service.syncTask(db, task.id, context, new Date(task.createdAt.getTime() + 1000)))
        .status,
    ).toBe("pending");
    expect(
      (await service.syncTask(db, task.id, context, new Date(task.createdAt.getTime() + 2500)))
        .status,
    ).toBe("processing");
    expect(
      (await service.syncTask(db, task.id, context, new Date(task.createdAt.getTime() + 7000)))
        .status,
    ).toBe("failed");
    await service.syncTask(db, task.id, context, new Date(task.createdAt.getTime() + 8000));
    expect(await db.event.count({ where: { dedupKey: `terminal:${task.id}` } })).toBe(1);
    const [retry] = await service.retryTask(db, task.id, { idempotencyKey: randomUUID() }, context);
    expect(retry.retryOfId).toBe(task.id);
    await service.syncTask(db, retry.id, context, new Date(retry.createdAt.getTime() + 7000));
    await service.reviewTask(db, retry.id, { rating: 4, feedback: "Useful direction" }, context);
    await service.reviewTask(db, retry.id, { rating: 5, feedback: "Edited feedback" }, context);
    expect(await db.review.count({ where: { taskId: retry.id } })).toBe(1);
    expect((await db.review.findUniqueOrThrow({ where: { taskId: retry.id } })).rating).toBe(5);
    await expect(service.reviewTask(db, task.id, { rating: 6 }, context)).rejects.toThrow();
    const exported = await service.exportProject(db, p.id, context);
    expect(exported.schemaVersion).toBe(1);
    expect(exported.project.tasks).toHaveLength(2);
    const names = (await db.event.findMany({ where: { projectId: p.id } })).map((e) => e.name);
    for (const name of [
      "brief_created",
      "storyboard_generated",
      "generation_started",
      "generation_failed",
      "generation_retried",
      "generation_completed",
      "result_rated",
      "project_exported",
    ])
      expect(names).toContain(name);
  });
  it("recovers interrupted submissions without automatically replaying them", async () => {
    const p = await project();
    const [task] = await service.startTasks(
      db,
      p.id,
      { revision: p.revision, sceneIds: [p.scenes[0].id], idempotencyKey: randomUUID() },
      context,
    );
    await db.generationTask.update({ where: { id: task.id }, data: { providerTaskId: null } });
    expect(
      (await service.syncTask(db, task.id, context, new Date(task.createdAt.getTime() + 61000)))
        .status,
    ).toBe("failed");
    await expect(
      service.retryTask(db, task.id, { idempotencyKey: randomUUID() }, context),
    ).rejects.toMatchObject({ code: "DUPLICATE_RISK" });
    expect(await db.generationTask.count({ where: { projectId: p.id } })).toBe(1);
  });
});

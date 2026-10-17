import { beforeAll, afterAll, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sampleBrief } from "../src/lib/domain";
import * as service from "../src/lib/service";
import { buildFirstCut } from "../src/lib/first-cut";
import { mediaPath, probeMedia, videoResponse } from "../src/lib/media";
const directory = mkdtempSync(join(tmpdir(), "frame-cut-"));
const url = `file:${join(directory, "test.db")}`;
const context = { sessionId: "first-cut-test" };
let db: PrismaClient;
beforeAll(() => {
  process.env.MEDIA_ROOT = join(directory, "media");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  db = new PrismaClient({ datasourceUrl: url });
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
  delete process.env.MEDIA_ROOT;
});
async function project() {
  const p = await service.createProject(db, { brief: sampleBrief }, context);
  return service.generateBoard(db, p.id, { revision: 0 }, context);
}
async function complete(
  p: Awaited<ReturnType<typeof project>>,
  sceneIds = p.scenes.map((s) => s.id),
) {
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
it("selects the first success only; explicit replacement persists and validates ownership/status/revision", async () => {
  const p = await complete(await project());
  const original = p.scenes[0].selectedGenerationTaskId;
  expect(original).toBeTruthy();
  const next = await complete(p, [p.scenes[0].id]);
  expect(next.scenes[0].selectedGenerationTaskId).toBe(original);
  const newId = next.tasks.find((t) => t.sceneId === p.scenes[0].id && t.id !== original)!.id;
  await expect(
    service.selectSceneVersion(db, p.id, p.scenes[0].id, {
      revision: p.revision,
      taskId: p.scenes[1].selectedGenerationTaskId,
    }),
  ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
  const other = await complete(await project());
  await expect(
    service.selectSceneVersion(db, p.id, p.scenes[0].id, {
      revision: p.revision,
      taskId: other.tasks[0].id,
    }),
  ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
  await db.generationTask.update({ where: { id: newId }, data: { status: "processing" } });
  await expect(
    service.selectSceneVersion(db, p.id, p.scenes[0].id, { revision: p.revision, taskId: newId }),
  ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
  await db.generationTask.update({ where: { id: newId }, data: { status: "failed" } });
  await expect(
    service.selectSceneVersion(db, p.id, p.scenes[0].id, { revision: p.revision, taskId: newId }),
  ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
  await db.generationTask.update({ where: { id: newId }, data: { status: "completed" } });
  const selected = await service.selectSceneVersion(db, p.id, p.scenes[0].id, {
    revision: p.revision,
    taskId: newId,
  });
  await expect(
    service.selectSceneVersion(db, p.id, p.scenes[0].id, {
      revision: p.revision,
      taskId: original,
    }),
  ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  await db.$disconnect();
  expect((await service.getProject(db, p.id)).scenes[0].selectedGenerationTaskId).toBe(newId);
  expect(selected.tasks).toHaveLength(4);
});
it("requires complete selection, makes a playable cut using actual duration, preserves snapshots and rebuilds in new order", async () => {
  let p = await project();
  await expect(buildFirstCut(db, p.id, { revision: p.revision })).rejects.toMatchObject({
    code: "SELECTION_INCOMPLETE",
  });
  p = await complete(p);
  const cut = await buildFirstCut(db, p.id, { revision: p.revision });
  expect(cut.status).toBe("completed");
  expect(cut.duration).toBeCloseTo(9, 0); // Fixture footage is 3s each; planning target is 15s.
  expect((await probeMedia(mediaPath(cut.mediaPath!))).duration).toBeCloseTo(9, 0);
  expect((await buildFirstCut(db, p.id, { revision: p.revision })).id).toBe(cut.id);
  expect((await service.getProject(db, p.id)).progress.label).toBe("Draft ready");
  const reversed = await service.saveBoard(
    db,
    p.id,
    { revision: p.revision, scenes: [...p.scenes].reverse() },
    context,
  );
  expect(reversed.outputIsCurrent).toBe(false);
  expect(reversed.progress.label).toBe("Ready to assemble");
  await expect(buildFirstCut(db, p.id, { revision: p.revision })).rejects.toMatchObject({
    code: "VERSION_CONFLICT",
  });
  const rebuilt = await buildFirstCut(db, p.id, { revision: reversed.revision });
  expect(rebuilt.id).not.toBe(cut.id);
  expect(JSON.parse(JSON.stringify(rebuilt.snapshot)).scenes[0].sceneId).toBe(
    reversed.scenes[0].id,
  );
  expect((await db.projectOutput.findUniqueOrThrow({ where: { id: cut.id } })).snapshot).toEqual(
    cut.snapshot,
  );
  await db.$disconnect();
  expect((await service.getProject(db, p.id)).output?.id).toBe(rebuilt.id);
  const selected = await complete(await service.getProject(db, p.id), [reversed.scenes[0].id]);
  expect(selected.outputIsCurrent).toBe(true); // Another success alone never changes the chosen cut.
  const another = selected.tasks.find(
    (t) =>
      t.sceneId === reversed.scenes[0].id && t.id !== reversed.scenes[0].selectedGenerationTaskId,
  )!;
  const changed = await service.selectSceneVersion(db, p.id, reversed.scenes[0].id, {
    revision: selected.revision,
    taskId: another.id,
  });
  expect(changed.outputIsCurrent).toBe(false);
  await service.deleteProject(db, p.id, { revision: changed.revision });
  expect(existsSync(mediaPath(cut.mediaPath!))).toBe(false);
  expect(await db.projectOutput.count({ where: { projectId: p.id } })).toBe(0);
});
it("stores an actionable failure, preserves selection and permits recovery; interrupted builds become retryable", async () => {
  const p = await complete(await project());
  const taskId = p.scenes[0].selectedGenerationTaskId!;
  await db.generationTask.update({
    where: { id: taskId },
    data: { resultUrl: "/mock/missing.mp4" },
  });
  await expect(buildFirstCut(db, p.id, { revision: p.revision })).rejects.toMatchObject({
    code: "MEDIA_UNAVAILABLE",
  });
  const failed = await service.getProject(db, p.id);
  expect(failed.output?.status).toBe("failed");
  expect(failed.scenes[0].selectedGenerationTaskId).toBe(taskId);
  await db.generationTask.update({
    where: { id: taskId },
    data: { resultUrl: "/mock/portrait.mp4" },
  });
  const recovered = await buildFirstCut(db, p.id, { revision: p.revision });
  expect(recovered.id).toBe(failed.output?.id);
  await db.projectOutput.update({
    where: { id: recovered.id },
    data: { status: "processing", updatedAt: new Date(Date.now() - 16 * 60000) },
  });
  await expect(service.deleteProject(db, p.id, { revision: p.revision })).rejects.toMatchObject({
    code: "ACTIVE_TASKS",
  });
  expect((await service.getProject(db, p.id)).output?.status).toBe("failed");
  expect((await buildFirstCut(db, p.id, { revision: p.revision })).status).toBe("completed");
});
it("streams byte ranges, supports HEAD/download and rejects invalid or missing media", async () => {
  const file = join(directory, "range.mp4");
  writeFileSync(file, Buffer.from("0123456789"));
  const response = await videoResponse(
    file,
    new Request("http://localhost/video?download=1", { headers: { range: "bytes=2-5" } }),
    "Campaign.mp4",
  );
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(await response.text()).toBe("2345");
  expect(response.headers.get("content-disposition")).toContain("Campaign.mp4");
  const head = await videoResponse(file, new Request("http://localhost/video", { method: "HEAD" }));
  expect(head.headers.get("content-length")).toBe("10");
  expect(await head.text()).toBe("");
  expect(
    await (
      await videoResponse(
        file,
        new Request("http://localhost/video", { headers: { range: "bytes=-3" } }),
      )
    ).text(),
  ).toBe("789");
  expect(
    (
      await videoResponse(
        file,
        new Request("http://localhost/video", { headers: { range: "bytes=15-" } }),
      )
    ).status,
  ).toBe(416);
  expect(() => mediaPath("../escape")).toThrow();
  await expect(
    videoResponse(join(directory, "missing"), new Request("http://localhost/video")),
  ).rejects.toMatchObject({ code: "MEDIA_UNAVAILABLE" });
});
it("duplicates a plan without tasks, selected results or outputs", async () => {
  const p = await complete(await project());
  const copy = await service.duplicatePlan(db, p.id, context);
  expect(copy.brief).toEqual(p.brief);
  expect(copy.profile).toEqual(p.profile);
  expect(copy.origin).toBe("user");
  expect(copy.scenes).toHaveLength(3);
  expect(copy.tasks).toHaveLength(0);
  expect(copy.output).toBeNull();
  expect(copy.scenes.every((s) => s.selectedGenerationTaskId === null)).toBe(true);
});

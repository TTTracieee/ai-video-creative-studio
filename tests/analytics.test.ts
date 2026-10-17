import { beforeAll, afterAll, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAnalytics } from "../src/lib/analytics";
import { defaultProfile, sampleBrief } from "../src/lib/domain";
const directory = mkdtempSync(path.join(tmpdir(), "frame-analytics-")),
  url = `file:${path.join(directory, "test.db")}`;
let db: PrismaClient;
const from = new Date("2026-10-16T00:00:00Z"),
  to = new Date("2026-10-18T00:00:00Z"),
  createdAt = new Date("2026-10-17T00:00:00Z");
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
it("counts projects once, excludes unfinished attempts from success, and separates source/mode", async () => {
  const p = await db.project.create({
    data: { name: "Fixture", brief: sampleBrief, profile: defaultProfile(sampleBrief), createdAt },
  });
  await db.project.create({
    data: {
      name: "Unconverted",
      brief: sampleBrief,
      profile: defaultProfile(sampleBrief),
      createdAt,
    },
  });
  const demo = await db.project.create({
    data: {
      name: "Sample",
      brief: sampleBrief,
      profile: defaultProfile(sampleBrief),
      origin: "demo",
      createdAt,
    },
  });
  for (let i = 0; i < 2; i++)
    await db.event.create({
      data: {
        name: "storyboard_generated",
        projectId: p.id,
        sessionId: "test",
        origin: "user",
        mode: "mock",
        properties: {},
        timestamp: createdAt,
        dedupKey: randomUUID(),
      },
    });
  const base = { projectId: p.id, snapshot: {}, provider: "mock", mode: "mock", createdAt };
  const success = await db.generationTask.create({
    data: {
      ...base,
      idempotencyKey: randomUUID(),
      status: "completed",
      completedAt: new Date(createdAt.getTime() + 2000),
    },
  });
  const failed = await db.generationTask.create({
    data: {
      ...base,
      idempotencyKey: randomUUID(),
      status: "failed",
      completedAt: new Date(createdAt.getTime() + 3000),
    },
  });
  await db.generationTask.create({
    data: {
      ...base,
      idempotencyKey: randomUUID(),
      status: "processing",
      startedAt: new Date(createdAt.getTime() + 1000),
      retryOfId: failed.id,
    },
  });
  await db.generationTask.create({
    data: { ...base, idempotencyKey: randomUUID(), status: "pending" },
  });
  await db.generationTask.create({
    data: {
      ...base,
      idempotencyKey: randomUUID(),
      status: "completed",
      mode: "live",
      provider: "bach-v1",
      completedAt: new Date(createdAt.getTime() + 5000),
    },
  });
  await db.generationTask.create({
    data: {
      ...base,
      idempotencyKey: randomUUID(),
      projectId: demo.id,
      status: "completed",
      completedAt: new Date(createdAt.getTime() + 5000),
    },
  });
  await db.review.create({
    data: { taskId: success.id, rating: 4, feedback: "fixture", updatedAt: createdAt },
  });
  const result = await getAnalytics(
    db,
    { mode: "mock", origin: "user", from: from.toISOString(), to: to.toISOString() },
    to,
  );
  expect(result).toMatchObject({
    briefs: 2,
    converted: 1,
    conversion: 0.5,
    taskCount: 4,
    completed: 1,
    failed: 1,
    processing: 1,
    pending: 1,
    successRate: 0.5,
    failureRate: 0.5,
    retryRate: 0.25,
    averageRating: 4,
    ratingCount: 1,
    averageDuration: 2,
  });
  const live = await getAnalytics(
    db,
    { mode: "live", origin: "user", from: from.toISOString(), to: to.toISOString() },
    to,
  );
  expect(live.taskCount).toBe(1);
  expect(live.averageRating).toBeNull();
});
it("uses empty states for no samples and validates date range", async () => {
  const result = await getAnalytics(db, {
    from: "2025-01-01T00:00:00Z",
    to: "2025-01-02T00:00:00Z",
  });
  expect(result.successRate).toBeNull();
  expect(result.conversion).toBeNull();
  expect(result.averageRating).toBeNull();
  await expect(
    getAnalytics(db, { from: to.toISOString(), to: from.toISOString() }),
  ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
});

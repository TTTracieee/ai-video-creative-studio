import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sampleBrief, defaultProfile, snapshotSchema } from "../src/lib/domain";
import { MockStoryboardProvider } from "../src/lib/providers/mock";
import * as service from "../src/lib/service";

const directory = mkdtempSync(path.join(tmpdir(), "frame-live-contract-"));
const datasourceUrl = `file:${path.join(directory, "workflow.db")}`;
const context = { sessionId: "simulated-live-workflow" };
let db: PrismaClient;
beforeAll(() => {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: datasourceUrl },
    stdio: "pipe",
  });
  db = new PrismaClient({ datasourceUrl });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await db?.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

async function simulatedProviders(
  mode: "success" | "fail-first" | "unknown-first" = "success",
  brief = sampleBrief,
) {
  vi.stubEnv("STORYBOARD_PROVIDER", "qwen");
  vi.stubEnv("VIDEO_PROVIDER", "wan2.2");
  vi.stubEnv("DASHSCOPE_API_KEY", "synthetic-live-workflow-key");
  vi.stubEnv(
    "DASHSCOPE_BASE_URL",
    "https://test-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  );
  const fixture = await new MockStoryboardProvider().generate(brief, defaultProfile(brief));
  const scenes = fixture.map((s) => ({
    ...s,
    prompt: "A young professional enjoys coffee in warm morning light, slow push-in.",
    consistencyNotes: "",
  }));
  const submitted: { id: string; prompt: string }[] = [];
  const polls = new Map<string, number>();
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  const transport = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/chat/completions")) {
      const body = JSON.parse(init!.body as string);
      const rewrite = body.messages[1].content.startsWith("Rewrite scene");
      return reply({
        choices: [
          {
            message: {
              content: JSON.stringify(
                rewrite ? { ...scenes[0], title: "Rewritten opening" } : { scenes },
              ),
            },
            finish_reason: "stop",
          },
        ],
      });
    }
    if (url.endsWith("/video-synthesis")) {
      const body = JSON.parse(init!.body as string);
      const id = `wan-simulated-${submitted.length + 1}`;
      submitted.push({ id, prompt: body.input.prompt });
      if (mode === "unknown-first" && submitted.length === 1) return reply({}, 500);
      return reply({ output: { task_id: id, task_status: "PENDING" } });
    }
    const id = decodeURIComponent(url.split("/").at(-1)!);
    if (!submitted.some((s) => s.id === id)) throw new Error("Unexpected simulated request");
    const count = (polls.get(id) || 0) + 1;
    polls.set(id, count);
    const task_status =
      mode === "fail-first" && id === submitted[0].id
        ? "FAILED"
        : count === 1
          ? "RUNNING"
          : "SUCCEEDED";
    return reply({
      output: {
        task_id: id,
        task_status,
        ...(task_status === "SUCCEEDED"
          ? { video_url: `https://example.com/contract-only/${id}.mp4` }
          : {}),
      },
    });
  });
  vi.stubGlobal("fetch", transport);
  return { submitted, transport };
}

async function board(brief = sampleBrief) {
  const created = await service.createProject(db, { brief, origin: "demo" }, context);
  return service.generateBoard(db, created.id, { revision: 0 }, context);
}

describe("Qwen → Wan → Review persisted workflow (simulated paid-provider protocols, no real API calls)", () => {
  it("keeps the 30s five-scene default and requires explicit editing for 5s-only generation", async () => {
    const brief = { ...sampleBrief, duration: 30 as const };
    const remote = await simulatedProviders("success", brief);
    let project = await board(brief);
    expect(project.scenes).toHaveLength(5);
    expect(project.scenes.every((s) => s.duration === 6)).toBe(true);
    await expect(
      service.startTasks(
        db,
        project.id,
        {
          revision: project.revision,
          sceneIds: project.scenes.map((s) => s.id),
          idempotencyKey: randomUUID(),
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_DURATION" });
    expect(remote.submitted).toHaveLength(0);
    const edited = project.scenes.map((s) => ({ ...s, duration: 5 }));
    edited.push({ ...edited.at(-1)!, id: randomUUID(), title: "Closing brand moment" });
    project = await service.saveBoard(
      db,
      project.id,
      { revision: project.revision, scenes: edited },
      context,
    );
    const tasks = await service.startTasks(
      db,
      project.id,
      {
        revision: project.revision,
        sceneIds: project.scenes.map((s) => s.id),
        idempotencyKey: randomUUID(),
      },
      context,
    );
    expect(tasks).toHaveLength(6);
    expect(remote.submitted).toHaveLength(6);
    expect(tasks.every((t) => snapshotSchema.parse(t.snapshot).scene.duration === 5)).toBe(true);
  });
  it("edits shared context, rewrites, generates all clips once, reconnects and reviews", async () => {
    const remote = await simulatedProviders();
    let project = await board();
    expect(project.storyboardMode).toBe("live");
    await service.updateProject(
      db,
      project.id,
      {
        revision: project.revision,
        profile: {
          ...project.profile,
          characterIdentity: "One young professional wearing a blue jacket",
        },
      },
      context,
    );
    project = await service.getProject(db, project.id);
    project = await service.regenerateScene(
      db,
      project.id,
      project.scenes[0].id,
      { revision: project.revision },
      context,
    );
    expect(project.scenes[0].title).toBe("Rewritten opening");
    const input = {
      revision: project.revision,
      sceneIds: project.scenes.map((s) => s.id),
      idempotencyKey: randomUUID(),
    };
    const tasks = await service.startTasks(db, project.id, input, context);
    expect(tasks).toHaveLength(3);
    expect(
      tasks.every((t) => t.mode === "live" && t.provider === "wan2.2" && t.status === "pending"),
    ).toBe(true);
    await service.startTasks(db, project.id, input, context);
    expect(remote.submitted).toHaveLength(3);
    for (const task of tasks) {
      const snapshot = snapshotSchema.parse(task.snapshot);
      expect(snapshot.profileVersion).toBe(2);
      expect(snapshot.finalPrompt).toContain("blue jacket");
      expect(snapshot.finalPrompt.length).toBeLessThanOrEqual(800);
      expect(remote.submitted.find((r) => r.id === task.providerTaskId)?.prompt).toBe(
        snapshot.finalPrompt,
      );
      expect((await service.syncTask(db, task.id, context)).status).toBe("processing");
    }
    await db.$disconnect();
    db = new PrismaClient({ datasourceUrl });
    for (const task of tasks)
      expect((await service.syncTask(db, task.id, context)).status).toBe("completed");
    await service.reviewTask(
      db,
      tasks[0].id,
      { rating: 4, feedback: "Protocol fixture review; not a real model quality evaluation." },
      context,
    );
    const restored = await service.getProject(db, project.id);
    expect(restored.tasks).toHaveLength(3);
    expect(restored.tasks.find((t) => t.id === tasks[0].id)?.review?.rating).toBe(4);
    expect(
      restored.tasks.every((t) => t.resultUrl?.startsWith("https://example.com/contract-only/")),
    ).toBe(true);
    const exported = await service.exportProject(db, project.id, context);
    expect(exported.project.id).toBe(project.id);
    expect(
      await db.event.count({ where: { projectId: project.id, name: "generation_completed" } }),
    ).toBe(3);
    await service.syncTask(db, tasks[0].id, context);
    expect(remote.submitted).toHaveLength(3);
  });

  it("preserves a failed attempt and completes a separately submitted retry", async () => {
    const remote = await simulatedProviders("fail-first");
    const project = await board();
    const [first] = await service.startTasks(
      db,
      project.id,
      {
        revision: project.revision,
        sceneIds: [project.scenes[0].id],
        idempotencyKey: randomUUID(),
      },
      context,
    );
    expect((await service.syncTask(db, first.id, context)).status).toBe("failed");
    const [retry] = await service.retryTask(
      db,
      first.id,
      { idempotencyKey: randomUUID() },
      context,
    );
    expect(retry.retryOfId).toBe(first.id);
    expect(retry.snapshot).toEqual(first.snapshot);
    expect(retry.id).not.toBe(first.id);
    expect((await service.syncTask(db, retry.id, context)).status).toBe("processing");
    expect((await service.syncTask(db, retry.id, context)).status).toBe("completed");
    await service.reviewTask(
      db,
      retry.id,
      { rating: 3, feedback: "Simulated retry review" },
      context,
    );
    expect((await db.generationTask.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
      "failed",
    );
    expect(remote.submitted).toHaveLength(2);
  });

  it("never repeats an ambiguous paid submission without explicit duplicate-risk acceptance", async () => {
    const remote = await simulatedProviders("unknown-first");
    const project = await board();
    const [first] = await service.startTasks(
      db,
      project.id,
      {
        revision: project.revision,
        sceneIds: [project.scenes[0].id],
        idempotencyKey: randomUUID(),
      },
      context,
    );
    expect(first.errorCode).toBe("SUBMISSION_UNKNOWN");
    await expect(
      service.retryTask(db, first.id, { idempotencyKey: randomUUID() }, context),
    ).rejects.toMatchObject({ code: "DUPLICATE_RISK" });
    expect(remote.submitted).toHaveLength(1);
    const [retry] = await service.retryTask(
      db,
      first.id,
      { idempotencyKey: randomUUID(), acceptDuplicateRisk: true },
      context,
    );
    expect(retry.providerTaskId).toBe("wan-simulated-2");
    expect(remote.submitted).toHaveLength(2);
  });
});

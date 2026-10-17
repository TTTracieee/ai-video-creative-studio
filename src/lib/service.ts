import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  AppError,
  briefSchema,
  composePrompt,
  defaultProfile,
  profileSchema,
  revisionSchema,
  sceneRecordSchema,
  sceneSchema,
  snapshotSchema,
  type SceneContent,
  type Snapshot,
} from "./domain";
import { storyboardProvider, videoProvider } from "./providers";
import { validateCapabilities } from "./providers/types";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
type Tx = Prisma.TransactionClient;
type Context = { sessionId: string };
async function event(
  tx: Tx,
  project: { id: string; origin: string },
  context: Context,
  name: string,
  mode: string,
  properties: object = {},
  dedupKey: string = randomUUID(),
) {
  await tx.event.upsert({
    where: { dedupKey },
    update: {},
    create: {
      projectId: project.id,
      origin: project.origin,
      sessionId: context.sessionId,
      name,
      mode,
      properties: json(properties),
      dedupKey,
    },
  });
}
export async function getProject(db: PrismaClient, id: string) {
  const p = await db.project.findUnique({
    where: { id },
    include: {
      scenes: { orderBy: { position: "asc" } },
      tasks: { orderBy: { createdAt: "desc" }, include: { review: true } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND", "Project not found.", 404);
  return {
    ...p,
    brief: briefSchema.parse(p.brief),
    profile: profileSchema.parse(p.profile),
    scenes: p.scenes.map((s) => ({ ...sceneSchema.parse(s.content), id: s.id })),
  };
}
export async function createProject(db: PrismaClient, input: unknown, context: Context) {
  const { brief, origin } = z
    .object({ brief: briefSchema, origin: z.enum(["user", "demo"]).default("user") })
    .parse(input);
  return db.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name: `${brief.brandName} campaign`,
        brief: json(brief),
        profile: json(defaultProfile(brief)),
        origin,
      },
    });
    await event(tx, p, context, "brief_created", "neutral", {}, `brief:${p.id}`);
    return p;
  });
}
export async function updateProject(
  db: PrismaClient,
  id: string,
  input: unknown,
  context: Context,
) {
  const data = z
    .object({
      revision: revisionSchema,
      brief: briefSchema.optional(),
      profile: profileSchema.optional(),
      name: z.string().trim().min(1).max(150).optional(),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const result = await tx.project.updateMany({
      where: { id, revision: data.revision },
      data: {
        revision: { increment: 1 },
        ...(data.brief ? { brief: json(data.brief), briefUpdatedAt: new Date() } : {}),
        ...(data.profile ? { profile: json(data.profile), profileVersion: { increment: 1 } } : {}),
        ...(data.name ? { name: data.name } : {}),
      },
    });
    if (result.count !== 1)
      throw new AppError(
        "VERSION_CONFLICT",
        "Project changed. Reload before saving to avoid overwriting newer edits.",
        409,
      );
    const p = await tx.project.findUniqueOrThrow({ where: { id } });
    if (data.profile)
      await event(tx, p, context, "consistency_profile_updated", "neutral", {
        profileVersion: p.profileVersion,
      });
    return p;
  });
}
async function replaceScenes(
  db: PrismaClient,
  id: string,
  revision: number,
  scenes: { id?: string; content: SceneContent }[],
  context: Context,
  mode?: string,
) {
  return db.$transaction(async (tx) => {
    const update = await tx.project.updateMany({
      where: { id, revision },
      data: {
        revision: { increment: 1 },
        ...(mode ? { storyboardMode: mode, storyboardAt: new Date() } : {}),
      },
    });
    if (!update.count)
      throw new AppError(
        "VERSION_CONFLICT",
        "Storyboard changed. Reload to keep the latest edits.",
        409,
      );
    const existing = await tx.scene.findMany({ where: { projectId: id } });
    const keepIds = scenes.flatMap((s) =>
      s.id && existing.some((e) => e.id === s.id) ? [s.id] : [],
    );
    await tx.scene.deleteMany({ where: { projectId: id, id: { notIn: keepIds } } });
    for (const [position, scene] of scenes.entries()) {
      if (scene.id && keepIds.includes(scene.id))
        await tx.scene.update({
          where: { id: scene.id },
          data: { position, content: json(scene.content) },
        });
      else
        await tx.scene.create({ data: { projectId: id, position, content: json(scene.content) } });
    }
    const p = await tx.project.findUniqueOrThrow({ where: { id } });
    await event(
      tx,
      p,
      context,
      mode ? "storyboard_generated" : "scene_edited",
      mode || p.storyboardMode || "mock",
      { sceneCount: scenes.length, revision: p.revision },
    );
  });
}
export async function generateBoard(
  db: PrismaClient,
  id: string,
  input: unknown,
  context: Context,
) {
  const { revision } = z.object({ revision: revisionSchema }).parse(input);
  const p = await getProject(db, id);
  if (p.revision !== revision)
    throw new AppError("VERSION_CONFLICT", "Reload before generating.", 409);
  const provider = storyboardProvider();
  const scenes = await provider.generate(p.brief, p.profile);
  await replaceScenes(
    db,
    id,
    revision,
    scenes.map((content) => ({ content })),
    context,
    provider.mode,
  );
  return getProject(db, id);
}
export async function saveBoard(db: PrismaClient, id: string, input: unknown, context: Context) {
  const data = z
    .object({ revision: revisionSchema, scenes: z.array(sceneRecordSchema).min(1).max(12) })
    .parse(input);
  if (new Set(data.scenes.map((s) => s.id)).size !== data.scenes.length)
    throw new AppError("DUPLICATE_SCENE", "Scene IDs must be unique.");
  await replaceScenes(
    db,
    id,
    data.revision,
    data.scenes.map(({ id, ...content }) => ({ id, content })),
    context,
  );
  return getProject(db, id);
}
export async function regenerateScene(
  db: PrismaClient,
  id: string,
  sceneId: string,
  input: unknown,
  context: Context,
) {
  const { revision } = z.object({ revision: revisionSchema }).parse(input);
  const p = await getProject(db, id);
  const index = p.scenes.findIndex((s) => s.id === sceneId);
  if (index < 0) throw new AppError("NOT_FOUND", "Save the scene before regenerating it.", 404);
  if (p.revision !== revision)
    throw new AppError("VERSION_CONFLICT", "Reload before regenerating.", 409);
  const generated = sceneSchema.parse(
    await storyboardProvider().regenerateScene(p.brief, p.profile, p.scenes[index], index),
  );
  if (generated.duration !== p.scenes[index].duration)
    throw new AppError("INVALID_DURATION", "Regenerated scene changed the duration.", 422);
  const scenes = p.scenes.map((s, i) => ({
    id: s.id,
    content: i === index ? generated : sceneSchema.parse(s),
  }));
  await replaceScenes(db, id, revision, scenes, context);
  return getProject(db, id);
}
const taskInputSchema = z.object({
  revision: revisionSchema,
  sceneIds: z.array(z.string().min(1)).min(1).max(12),
  idempotencyKey: z.string().uuid(),
  scenario: z.enum(["success", "fail"]).default("success"),
});
async function submitAttempts(
  db: PrismaClient,
  project: { id: string; origin: string },
  inputs: { sceneId: string | null; snapshot: Snapshot; key: string; retryOfId?: string }[],
  providerName: string,
  scenario: string,
  context: Context,
) {
  const provider = videoProvider(providerName);
  if (provider.mode === "live" && scenario !== "success")
    throw new AppError("MOCK_ONLY", "Failure simulation is only available in Mock mode.");
  for (const input of inputs) validateCapabilities(input.snapshot, provider.capabilities);
  const keys = inputs.map((i) => i.key);
  const previous = await db.generationTask.findMany({ where: { idempotencyKey: { in: keys } } });
  if (previous.length === inputs.length) return previous;
  let tasks;
  try {
    tasks = await db.$transaction(async (tx) => {
      const created = [];
      for (const input of inputs) {
        const task = await tx.generationTask.create({
          data: {
            projectId: project.id,
            sceneId: input.sceneId,
            snapshot: json(input.snapshot),
            provider: provider.name,
            mode: provider.mode,
            scenario,
            retryOfId: input.retryOfId,
            idempotencyKey: input.key,
          },
        });
        await event(
          tx,
          project,
          context,
          "generation_started",
          provider.mode,
          { taskId: task.id },
          `start:${task.id}`,
        );
        if (input.retryOfId)
          await event(
            tx,
            project,
            context,
            "generation_retried",
            provider.mode,
            { taskId: task.id, retryOfId: input.retryOfId },
            `retry:${task.id}`,
          );
        created.push(task);
      }
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.generationTask.findMany({
        where: { idempotencyKey: { in: keys } },
      });
      if (existing.length === inputs.length) return existing;
    }
    throw error;
  }
  for (const task of tasks) {
    try {
      const result = await provider.submit({
        ...task,
        snapshot: snapshotSchema.parse(task.snapshot),
      });
      await db.generationTask.update({
        where: { id: task.id },
        data: { providerTaskId: result.providerTaskId },
      });
    } catch (error) {
      const safe =
        error instanceof AppError
          ? error
          : new AppError(
              "SUBMISSION_UNKNOWN",
              "Submission result is unknown. No automatic resubmission was made.",
              502,
            );
      await db.$transaction(async (tx) => {
        await tx.generationTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            errorCode: safe.code,
            errorMessage: safe.message,
          },
        });
        await event(
          tx,
          project,
          context,
          "generation_failed",
          provider.mode,
          { taskId: task.id, code: safe.code },
          `terminal:${task.id}`,
        );
      });
    }
  }
  return db.generationTask.findMany({ where: { idempotencyKey: { in: keys } } });
}
export async function startTasks(db: PrismaClient, id: string, input: unknown, context: Context) {
  const data = taskInputSchema.parse(input);
  const p = await getProject(db, id);
  if (data.revision !== p.revision)
    throw new AppError("VERSION_CONFLICT", "Save or reload the storyboard before generating.", 409);
  if (new Set(data.sceneIds).size !== data.sceneIds.length)
    throw new AppError("DUPLICATE_SCENE", "Duplicate scenes selected.");
  const selected = data.sceneIds.map((id) => {
    const scene = p.scenes.find((s) => s.id === id);
    if (!scene) throw new AppError("NOT_FOUND", "Scene not found. Save new scenes first.", 404);
    return scene;
  });
  if (selected.length > 1 && p.scenes.reduce((n, s) => n + s.duration, 0) !== p.brief.duration)
    throw new AppError(
      "DURATION_MISMATCH",
      "Balance the storyboard duration before generating multiple clips.",
      422,
    );
  return submitAttempts(
    db,
    p,
    selected.map((scene) => ({
      sceneId: scene.id,
      key: `${data.idempotencyKey}:${scene.id}`,
      snapshot: {
        scene: sceneSchema.parse(scene),
        profile: p.profile,
        profileVersion: p.profileVersion,
        finalPrompt: composePrompt(scene, p.profile),
        aspectRatio: p.brief.aspectRatio,
      },
    })),
    videoProvider().name,
    data.scenario,
    context,
  );
}
export async function syncTask(db: PrismaClient, id: string, context: Context, now = new Date()) {
  const task = await db.generationTask.findUnique({
    where: { id },
    include: { project: true, review: true },
  });
  if (!task) throw new AppError("NOT_FOUND", "Task not found.", 404);
  if (["completed", "failed"].includes(task.status)) return task;
  if (!task.providerTaskId) {
    if (now.getTime() - task.createdAt.getTime() < 60000) return task;
    return db.$transaction(async (tx) => {
      const changed = await tx.generationTask.updateMany({
        where: { id, status: task.status, providerTaskId: null },
        data: {
          status: "failed",
          completedAt: now,
          errorCode: "SUBMISSION_UNKNOWN",
          errorMessage:
            "Submission was interrupted before its ID was saved. It has not been automatically resubmitted.",
        },
      });
      if (changed.count)
        await event(
          tx,
          task.project,
          context,
          "generation_failed",
          task.mode,
          { taskId: id, code: "SUBMISSION_UNKNOWN" },
          `terminal:${id}`,
        );
      return tx.generationTask.findUniqueOrThrow({ where: { id }, include: { review: true } });
    });
  }
  const update = await videoProvider(task.provider).getStatus(
    { ...task, snapshot: snapshotSchema.parse(task.snapshot) },
    now,
  );
  if (task.status === "processing" && update.status === "pending") return task;
  await db.$transaction(async (tx) => {
    const changed = await tx.generationTask.updateMany({
      where: { id, status: task.status },
      data: update,
    });
    if (changed.count && ["completed", "failed"].includes(update.status))
      await event(
        tx,
        task.project,
        context,
        update.status === "completed" ? "generation_completed" : "generation_failed",
        task.mode,
        { taskId: id, code: update.errorCode },
        `terminal:${id}`,
      );
  });
  return db.generationTask.findUniqueOrThrow({ where: { id }, include: { review: true } });
}
export async function retryTask(db: PrismaClient, id: string, input: unknown, context: Context) {
  const { idempotencyKey, acceptDuplicateRisk } = z
    .object({ idempotencyKey: z.string().uuid(), acceptDuplicateRisk: z.boolean().default(false) })
    .parse(input);
  const task = await db.generationTask.findUnique({ where: { id }, include: { project: true } });
  if (!task) throw new AppError("NOT_FOUND", "Task not found.", 404);
  if (task.status !== "failed")
    throw new AppError("NOT_RETRYABLE", "Only failed tasks can be retried.", 409);
  if (task.errorCode === "SUBMISSION_UNKNOWN" && !acceptDuplicateRisk)
    throw new AppError(
      "DUPLICATE_RISK",
      "The provider may have accepted the previous request. Confirm possible duplicate charges before retrying.",
      409,
    );
  return submitAttempts(
    db,
    task.project,
    [
      {
        sceneId: task.sceneId,
        snapshot: snapshotSchema.parse(task.snapshot),
        key: idempotencyKey,
        retryOfId: task.id,
      },
    ],
    task.provider,
    "success",
    context,
  );
}
export async function reviewTask(db: PrismaClient, id: string, input: unknown, context: Context) {
  const review = z
    .object({
      rating: z.number().int().min(1).max(5),
      feedback: z.string().trim().max(3000).default(""),
    })
    .parse(input);
  return db.$transaction(async (tx) => {
    const task = await tx.generationTask.findUnique({ where: { id }, include: { project: true } });
    if (!task) throw new AppError("NOT_FOUND", "Task not found.", 404);
    if (task.status !== "completed")
      throw new AppError("NOT_COMPLETED", "Rate a completed result.", 409);
    const result = await tx.review.upsert({
      where: { taskId: id },
      update: review,
      create: { ...review, taskId: id },
    });
    await event(tx, task.project, context, "result_rated", task.mode, {
      taskId: id,
      rating: review.rating,
    });
    return result;
  });
}
export async function exportProject(db: PrismaClient, id: string, context: Context) {
  const p = await getProject(db, id);
  await db.$transaction((tx) =>
    event(tx, p, context, "project_exported", p.storyboardMode || "mock"),
  );
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    notice:
      "Planning and individual clips only. Mock media is not model-generated. External video links may expire.",
    project: { ...p, scenes: p.scenes.map((scene, i) => ({ ...scene, sceneNumber: i + 1 })) },
  };
}

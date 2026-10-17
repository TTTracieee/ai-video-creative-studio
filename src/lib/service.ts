import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  AppError,
  briefSchema,
  composePrompt,
  defaultProfile,
  editableSceneSchema,
  readScene,
  firstCutSnapshotSchema,
  type EditableScene,
  profileSchema,
  revisionSchema,
  sceneRecordSchema,
  sceneSchema,
  snapshotSchema,
  type Snapshot,
} from "./domain";
import { storyboardProvider, videoProvider } from "./providers";
import { validateCapabilities } from "./providers/types";
import { projectProgress, selectionKey, selectionSnapshot } from "./project-state";
import { mediaPath, removeProjectMedia } from "./media";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
type Tx = Prisma.TransactionClient;
type Context = { sessionId: string };
export async function event(
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
const projectInclude = {
  scenes: { orderBy: { position: "asc" as const } },
  tasks: { orderBy: { createdAt: "desc" as const }, include: { review: true } },
  outputs: { orderBy: { updatedAt: "desc" as const } },
};
function projectView(p: Prisma.ProjectGetPayload<{ include: typeof projectInclude }>) {
  const brief = briefSchema.parse(p.brief);
  const scenes = p.scenes.map((s) => ({
    ...readScene(s.content),
    id: s.id,
    selectedGenerationTaskId: s.selectedGenerationTaskId,
  }));
  const snapshot = selectionSnapshot(brief, scenes, p.tasks);
  const key = snapshot && selectionKey(snapshot);
  const outputMatches = (output: (typeof p.outputs)[number]) => {
    const parsed = firstCutSnapshotSchema.safeParse(output.snapshot);
    return parsed.success && selectionKey(parsed.data) === key;
  };
  const output = p.outputs.find(outputMatches) || p.outputs[0] || null;
  const current = !!output && outputMatches(output);
  const outputAvailable =
    output?.status === "completed" && !!output.mediaPath && existsSync(mediaPath(output.mediaPath));
  const selectedCount = scenes.filter((scene) =>
    p.tasks.some(
      (task) =>
        task.id === scene.selectedGenerationTaskId &&
        task.status === "completed" &&
        !!task.resultUrl,
    ),
  ).length;
  const activeCount = p.tasks.filter((task) =>
    ["pending", "processing"].includes(task.status),
  ).length;
  return {
    ...p,
    brief,
    profile: profileSchema.parse(p.profile),
    scenes: scenes.map((scene) => ({
      ...scene,
      thumbnailUrl: p.tasks.some((task) => task.sceneId === scene.id && task.status === "completed")
        ? `/api/media/thumbnails/${scene.selectedGenerationTaskId || p.tasks.find((task) => task.sceneId === scene.id && task.status === "completed")!.id}`
        : null,
    })),
    thumbnailUrl: (() => {
      const task =
        p.tasks.find((task) => task.id === scenes[0]?.selectedGenerationTaskId) ||
        p.tasks.find((task) => task.status === "completed" && task.resultUrl);
      return task ? `/api/media/thumbnails/${task.id}` : null;
    })(),
    tasks: p.tasks.map((task) => ({
      ...task,
      previewUrl:
        task.status === "completed" && task.resultUrl ? `/api/media/tasks/${task.id}` : null,
    })),
    output: output && {
      ...output,
      mediaUrl: outputAvailable ? `/api/media/outputs/${output.id}` : null,
    },
    outputIsCurrent: current,
    progress: {
      sceneCount: scenes.length,
      selectedCount,
      activeCount,
      label: projectProgress(
        scenes.length,
        selectedCount,
        activeCount,
        output?.status === "completed" && !outputAvailable ? "failed" : output?.status,
        current,
      ),
    },
    _count: { scenes: scenes.length, tasks: p.tasks.length },
  };
}
export async function getProject(db: PrismaClient, id: string) {
  await db.projectOutput.updateMany({
    where: {
      projectId: id,
      status: "processing",
      updatedAt: { lt: new Date(Date.now() - 15 * 60000) },
    },
    data: {
      status: "failed",
      errorMessage:
        "The build was interrupted. Your selected clips are safe; rebuild the first cut.",
    },
  });
  const p = await db.project.findUnique({ where: { id }, include: projectInclude });
  if (!p) throw new AppError("NOT_FOUND", "Project not found.", 404);
  return projectView(p);
}
export async function listProjects(db: PrismaClient) {
  return (
    await db.project.findMany({ orderBy: { updatedAt: "desc" }, include: projectInclude })
  ).map(projectView);
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
export async function deleteProject(db: PrismaClient, id: string, input: unknown) {
  const { revision } = z.object({ revision: revisionSchema }).parse(input);
  const deleted = await db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      select: { id: true, revision: true },
    });
    if (!project) throw new AppError("NOT_FOUND", "Project not found.", 404);
    if (project.revision !== revision)
      throw new AppError(
        "VERSION_CONFLICT",
        "Project changed. Close this dialog and reopen it before deleting.",
        409,
      );
    const active = { status: { in: ["pending", "processing"] } };
    if (await tx.generationTask.count({ where: { projectId: id, ...active } }))
      throw new AppError(
        "ACTIVE_TASKS",
        "This project still has active generation tasks. Wait for them to finish and refresh their status before deleting.",
        409,
      );
    if (await tx.projectOutput.count({ where: { projectId: id, status: "processing" } }))
      throw new AppError(
        "ACTIVE_TASKS",
        "Wait for the first cut build to finish before deleting this project.",
        409,
      );
    const result = await tx.project.deleteMany({
      where: { id, revision, tasks: { none: active } },
    });
    if (result.count !== 1)
      throw new AppError("VERSION_CONFLICT", "Project changed. Reload before deleting.", 409);
    return { id, deleted: true };
  });
  await removeProjectMedia(id);
  return deleted;
}

export async function selectSceneVersion(
  db: PrismaClient,
  id: string,
  sceneId: string,
  input: unknown,
) {
  const { revision, taskId } = z
    .object({ revision: revisionSchema, taskId: z.string().min(1) })
    .parse(input);
  await db.$transaction(async (tx) => {
    const scene = await tx.scene.findFirst({ where: { id: sceneId, projectId: id } });
    if (!scene) throw new AppError("NOT_FOUND", "Scene not found.", 404);
    const task = await tx.generationTask.findFirst({
      where: { id: taskId, projectId: id, sceneId, status: "completed", resultUrl: { not: null } },
    });
    if (!task?.resultUrl)
      throw new AppError("INVALID_SELECTION", "Choose a completed version from this scene.", 422);
    const changed = await tx.project.updateMany({
      where: { id, revision },
      data: { revision: { increment: 1 } },
    });
    if (!changed.count)
      throw new AppError(
        "VERSION_CONFLICT",
        "Your project changed. Reload before selecting a version.",
        409,
      );
    await tx.scene.update({ where: { id: sceneId }, data: { selectedGenerationTaskId: taskId } });
  });
  return getProject(db, id);
}

export async function duplicatePlan(db: PrismaClient, id: string, context: Context) {
  const p = await getProject(db, id);
  const copy = await createProject(db, { brief: p.brief, origin: "user" }, context);
  await db.project.update({
    where: { id: copy.id },
    data: { name: `${p.name} — copy`.slice(0, 150), profile: json(p.profile) },
  });
  if (p.scenes.length)
    await replaceScenes(
      db,
      copy.id,
      0,
      p.scenes.map((scene) => ({ content: editableSceneSchema.parse(scene) })),
      context,
      p.storyboardMode || undefined,
    );
  return getProject(db, copy.id);
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
async function writeScenes(tx: Tx, id: string, scenes: { id?: string; content: EditableScene }[]) {
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
    else await tx.scene.create({ data: { projectId: id, position, content: json(scene.content) } });
  }
}

export async function savePlan(db: PrismaClient, id: string, input: unknown, context: Context) {
  const data = z
    .object({
      revision: revisionSchema,
      name: z.string().trim().min(1).max(150),
      brief: briefSchema,
      profile: profileSchema,
      scenes: z.array(sceneRecordSchema).max(12),
    })
    .parse(input);
  if (new Set(data.scenes.map((scene) => scene.id)).size !== data.scenes.length)
    throw new AppError("DUPLICATE_SCENE", "Scene IDs must be unique.", 422);
  await db.$transaction(async (tx) => {
    const current = await tx.project.findUnique({ where: { id }, include: { scenes: true } });
    if (!current) throw new AppError("NOT_FOUND", "Project not found.", 404);
    if (
      data.scenes.some(
        (scene) =>
          !scene.id.startsWith("draft-") && !current.scenes.some((old) => old.id === scene.id),
      )
    )
      throw new AppError(
        "INVALID_SCENE",
        "Reload the plan: a scene does not belong to this project.",
        422,
      );
    const briefChanged =
      JSON.stringify(briefSchema.parse(current.brief)) !== JSON.stringify(data.brief);
    const profileChanged =
      JSON.stringify(profileSchema.parse(current.profile)) !== JSON.stringify(data.profile);
    const changed = await tx.project.updateMany({
      where: { id, revision: data.revision },
      data: {
        revision: { increment: 1 },
        name: data.name,
        brief: json(data.brief),
        profile: json(data.profile),
        ...(briefChanged ? { briefUpdatedAt: new Date() } : {}),
        ...(profileChanged ? { profileVersion: { increment: 1 } } : {}),
      },
    });
    if (!changed.count)
      throw new AppError(
        "VERSION_CONFLICT",
        "Plan changed elsewhere. Your edits are still here; reload before replacing them.",
        409,
      );
    await writeScenes(
      tx,
      id,
      data.scenes.map(({ id, ...content }) => ({ id, content })),
    );
    const project = await tx.project.findUniqueOrThrow({ where: { id } });
    await event(tx, project, context, "scene_edited", project.storyboardMode || "neutral", {
      sceneCount: data.scenes.length,
    });
    if (profileChanged)
      await event(tx, project, context, "consistency_profile_updated", "neutral", {
        profileVersion: project.profileVersion,
      });
  });
  return getProject(db, id);
}

async function replaceScenes(
  db: PrismaClient,
  id: string,
  revision: number,
  scenes: { id?: string; content: EditableScene }[],
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
    await writeScenes(tx, id, scenes);
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
  const scenes = await provider.generate(p.brief, p.profile, videoProvider().capabilities);
  await replaceScenes(
    db,
    id,
    revision,
    scenes.map((content) => ({ content: editableSceneSchema.parse(content) })),
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
    await storyboardProvider().regenerateScene(
      p.brief,
      p.profile,
      p.scenes[index],
      index,
      videoProvider().capabilities,
    ),
  );
  if (generated.duration !== p.scenes[index].duration)
    throw new AppError("INVALID_DURATION", "Regenerated scene changed the duration.", 422);
  const scenes = p.scenes.map((s, i) => ({
    id: s.id,
    content:
      i === index
        ? editableSceneSchema.parse({
            ...generated,
            promptMode: s.promptMode,
            promptOverride: s.promptOverride,
          })
        : editableSceneSchema.parse(s),
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
        scene: editableSceneSchema.parse(scene),
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
    if (changed.count && update.status === "completed" && task.sceneId && update.resultUrl)
      await tx.scene.updateMany({
        where: { id: task.sceneId, projectId: task.projectId, selectedGenerationTaskId: null },
        data: { selectedGenerationTaskId: task.id },
      });
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
      rating: z.number().int().min(1).max(5).nullable().optional(),
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
      update: {
        feedback: review.feedback,
        ...(review.rating !== undefined ? { rating: review.rating } : {}),
      },
      create: { ...review, taskId: id },
    });
    if (review.rating != null)
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
      "Project metadata, selected versions and first-cut snapshots. Download MP4 separately; JSON does not embed media. Illustrative test footage is not newly model-generated.",
    project: { ...p, scenes: p.scenes.map((scene, i) => ({ ...scene, sceneNumber: i + 1 })) },
  };
}

export async function recordMP4Export(
  db: PrismaClient,
  outputId: string,
  context: Context,
  exportId: string,
) {
  z.uuid().parse(exportId);
  await db.$transaction(async (tx) => {
    const output = await tx.projectOutput.findUniqueOrThrow({
      where: { id: outputId },
      include: { project: true },
    });
    if (output.status !== "completed")
      throw new AppError("NOT_READY", "The first cut is not ready to export.", 409);
    await event(
      tx,
      output.project,
      context,
      "mp4_exported",
      output.mode,
      { outputId },
      `mp4:${outputId}:${exportId}`,
    );
  });
}

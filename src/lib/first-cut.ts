import { mkdir, access } from "node:fs/promises";
import { dirname } from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError, briefSchema, revisionSchema, readScene, firstCutSnapshotSchema } from "./domain";
import { selectionKey, selectionSnapshot } from "./project-state";
import { event } from "./service";
import { cacheClip, concatenateClips, mediaPath } from "./media";

export async function buildFirstCut(
  db: PrismaClient,
  id: string,
  input: unknown,
  context = { sessionId: "local-build" },
) {
  const { revision } = z.object({ revision: revisionSchema }).parse(input);
  const p = await db.project.findUnique({
    where: { id },
    include: { scenes: { orderBy: { position: "asc" } }, tasks: true },
  });
  if (!p) throw new AppError("NOT_FOUND", "Project not found.", 404);
  if (p.revision !== revision)
    throw new AppError("VERSION_CONFLICT", "Your project changed. Reload before assembling.", 409);
  const scenes = p.scenes.map((scene) => ({
    ...readScene(scene.content),
    id: scene.id,
    selectedGenerationTaskId: scene.selectedGenerationTaskId,
  }));
  const snapshot = selectionSnapshot(briefSchema.parse(p.brief), scenes, p.tasks);
  if (!snapshot)
    throw new AppError(
      "SELECTION_INCOMPLETE",
      "Select one completed version for every scene before building a first cut.",
      422,
    );
  const key = selectionKey(snapshot);
  const selected = snapshot.scenes.map(
    (scene) => p.tasks.find((task) => task.id === scene.taskId)!,
  );
  const modes = new Set(selected.map((task) => task.mode));
  let output =
    (
      await db.projectOutput.findMany({ where: { projectId: id }, orderBy: { updatedAt: "desc" } })
    ).find((output) => {
      const parsed = firstCutSnapshotSchema.safeParse(output.snapshot);
      return parsed.success && selectionKey(parsed.data) === key;
    }) || null;
  if (output?.status === "completed" && output.mediaPath) {
    try {
      await access(mediaPath(output.mediaPath));
      return output;
    } catch {
      /* Rebuild a missing local output from its selected clips. */
    }
  }
  if (output?.status === "processing" && Date.now() - output.updatedAt.getTime() < 15 * 60000)
    return output;
  if (output) {
    const changed = await db.projectOutput.updateMany({
      where: { id: output.id, updatedAt: output.updatedAt },
      data: { status: "processing", errorMessage: null, updatedAt: new Date() },
    });
    if (!changed.count) return db.projectOutput.findUniqueOrThrow({ where: { id: output.id } });
    output = await db.projectOutput.findUniqueOrThrow({ where: { id: output.id } });
  } else {
    try {
      output = await db.$transaction(async (tx) => {
        const current = await tx.project.findUniqueOrThrow({
          where: { id },
          select: { revision: true },
        });
        if (current.revision !== revision)
          throw new AppError(
            "VERSION_CONFLICT",
            "Your selection changed. Reload before assembling.",
            409,
          );
        return tx.projectOutput.create({
          data: {
            projectId: id,
            selectionKey: key,
            snapshot: JSON.parse(JSON.stringify(snapshot)),
            mode: modes.size === 1 ? selected[0].mode : "mixed",
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        return db.projectOutput.findUniqueOrThrow({
          where: { projectId_selectionKey: { projectId: id, selectionKey: key } },
        });
      throw error;
    }
  }
  const outputKey = `${id}/outputs/${output.id}.mp4`;
  try {
    const paths = [];
    for (const task of selected) paths.push(await cacheClip(db, task));
    const destination = mediaPath(outputKey);
    await mkdir(dirname(destination), { recursive: true });
    const duration = await concatenateClips(paths, destination, snapshot.aspectRatio);
    return await db.$transaction(async (tx) => {
      const completed = await tx.projectOutput.update({
        where: { id: output.id },
        data: {
          status: "completed",
          mediaPath: outputKey,
          duration,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
      await event(
        tx,
        p,
        context,
        "first_cut_built",
        completed.mode,
        { outputId: completed.id },
        `first-cut:${completed.id}`,
      );
      return completed;
    });
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "The first cut could not be built. Your selected clips are preserved; try again.";
    await db.projectOutput.update({
      where: { id: output.id },
      data: { status: "failed", errorMessage: message },
    });
    throw error instanceof AppError ? error : new AppError("ASSEMBLY_FAILED", message, 422);
  }
}

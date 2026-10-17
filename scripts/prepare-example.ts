// Copies completed, already-paid results. This script never submits generation requests.
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cacheClip, concatenateClips } from "../src/lib/media";
import { briefSchema, sceneSchema } from "../src/lib/domain";
import { selectionKey } from "../src/lib/project-state";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db = new PrismaClient();
try {
  const sourceId = process.argv[2];
  if (!sourceId)
    throw new Error("Pass the existing completed project ID. No generation is performed.");
  const source = await db.project.findUniqueOrThrow({
    where: { id: sourceId },
    include: { scenes: { orderBy: { position: "asc" } }, tasks: { orderBy: { createdAt: "asc" } } },
  });
  const id = "example-morning-brew-v1";
  const folder = resolve("public/examples/morning-brew");
  await mkdir(folder, { recursive: true });
  const scenes = [];
  const tasks = [];
  const paths = [];
  for (const [i, scene] of source.scenes.entries()) {
    const task = source.tasks.find(
      (t) => t.sceneId === scene.id && t.status === "completed" && t.mode === "live" && t.resultUrl,
    );
    if (!task) throw new Error(`Scene ${i + 1} has no completed real result.`);
    const path = resolve(folder, `scene-${i + 1}.mp4`);
    await copyFile(await cacheClip(db, task), path);
    paths.push(path);
    const sceneId = `${id}-scene-${i + 1}`,
      taskId = `${id}-task-${i + 1}`;
    scenes.push({
      id: sceneId,
      position: i,
      content: sceneSchema.parse(scene.content),
      selectedGenerationTaskId: taskId,
    });
    tasks.push({
      id: taskId,
      sceneId,
      snapshot: task.snapshot,
      provider: task.provider,
      mode: task.mode,
      status: "completed",
      resultUrl: `/examples/morning-brew/scene-${i + 1}.mp4`,
      localMediaPath: `/examples/morning-brew/scene-${i + 1}.mp4`,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    });
  }
  const brief = briefSchema.parse(source.brief);
  const snapshot = {
    aspectRatio: brief.aspectRatio,
    targetDuration: brief.duration,
    scenes: scenes.map((s) => ({
      sceneId: s.id,
      taskId: s.selectedGenerationTaskId,
      title: s.content.title,
      plannedDuration: s.content.duration,
    })),
  };
  const duration = await concatenateClips(
    paths,
    resolve(folder, "first-cut.mp4"),
    brief.aspectRatio,
  );
  const manifest = {
    id,
    name: source.name,
    brief: source.brief,
    profile: source.profile,
    profileVersion: source.profileVersion,
    storyboardMode: source.storyboardMode,
    createdAt: source.createdAt.toISOString(),
    scenes,
    tasks,
    output: {
      id: `${id}-cut`,
      selectionKey: selectionKey(snapshot),
      snapshot,
      mode: "live",
      status: "completed",
      duration,
      mediaPath: "/examples/morning-brew/first-cut.mp4",
    },
  };
  await writeFile(resolve(folder, "project.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `Prepared ${scenes.length} existing real clips and ${duration.toFixed(1)}s first cut. No generation requests made.`,
  );
} finally {
  await db.$disconnect();
}

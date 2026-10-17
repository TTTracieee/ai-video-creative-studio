import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
if (process.env.SEED_EXAMPLE === "false") process.exit(0);
if (process.getBuiltinModule("node:fs").existsSync(".env")) process.loadEnvFile(".env");
const example = JSON.parse(readFileSync("public/examples/morning-brew/project.json", "utf8"));
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    if (await tx.project.findUnique({ where: { id: example.id } })) return;
    const { scenes, tasks, output, ...project } = example;
    const createdAt = new Date(project.createdAt);
    await tx.project.create({
      data: {
        ...project,
        createdAt,
        briefUpdatedAt: createdAt,
        storyboardAt: createdAt,
        origin: "demo",
      },
    });
    for (const scene of scenes) {
      await tx.scene.create({
        data: {
          id: scene.id,
          position: scene.position,
          content: scene.content,
          projectId: example.id,
        },
      });
    }
    for (const task of tasks)
      await tx.generationTask.create({
        data: {
          ...task,
          projectId: example.id,
          idempotencyKey: task.id,
          createdAt: new Date(task.createdAt),
          startedAt: task.startedAt ? new Date(task.startedAt) : null,
          completedAt: task.completedAt ? new Date(task.completedAt) : null,
        },
      });
    for (const scene of scenes)
      await tx.scene.update({
        where: { id: scene.id },
        data: { selectedGenerationTaskId: scene.selectedGenerationTaskId },
      });
    await tx.projectOutput.create({
      data: { ...output, projectId: example.id, completedAt: new Date() },
    });
  });
  console.log("Example project ready. No model requests made.");
} finally {
  await db.$disconnect();
}

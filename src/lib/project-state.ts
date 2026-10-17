import { createHash } from "node:crypto";
import { firstCutSnapshotSchema, briefSchema, type Brief, type SceneRecord } from "./domain";

type Scene = SceneRecord & { selectedGenerationTaskId: string | null };
type Task = {
  id: string;
  projectId: string;
  sceneId: string | null;
  status: string;
  resultUrl: string | null;
  snapshot?: unknown;
};
export function selectionSnapshot(brief: Brief, scenes: Scene[], tasks: Task[]) {
  if (!scenes.length) return null;
  const selected = scenes.map((scene) => {
    const task = tasks.find(
      (task) =>
        task.id === scene.selectedGenerationTaskId &&
        task.sceneId === scene.id &&
        task.status === "completed" &&
        task.resultUrl,
    );
    return task
      ? { sceneId: scene.id, taskId: task.id, title: scene.title, plannedDuration: scene.duration }
      : null;
  });
  if (selected.some((scene) => !scene)) return null;
  const first = tasks.find((task) => task.id === selected[0]?.taskId);
  const originalRatio =
    first?.snapshot && typeof first.snapshot === "object" && "aspectRatio" in first.snapshot
      ? briefSchema.shape.aspectRatio.safeParse(first.snapshot.aspectRatio)
      : null;
  return firstCutSnapshotSchema.parse({
    aspectRatio: originalRatio?.success ? originalRatio.data : brief.aspectRatio,
    targetDuration: brief.duration,
    scenes: selected,
  });
}
export function selectionKey(snapshot: NonNullable<ReturnType<typeof selectionSnapshot>>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        renderer: "hardcut-v1",
        aspectRatio: snapshot.aspectRatio,
        tasks: snapshot.scenes.map((scene) => scene.taskId),
      }),
    )
    .digest("hex");
}

export function projectProgress(
  sceneCount: number,
  selectedCount: number,
  activeCount: number,
  outputStatus: string | undefined,
  current: boolean,
) {
  if (current && outputStatus === "completed") return "Draft ready";
  if (current && outputStatus === "processing") return "Assembling";
  if (!sceneCount) return "Planning";
  if (selectedCount === sceneCount) return "Ready to assemble";
  if (activeCount) return "Generating";
  if (selectedCount) return "In progress";
  return "Ready to generate";
}

import { createHash } from "node:crypto";
import { firstCutSnapshotSchema, type Brief, type SceneRecord } from "./domain";

type Scene = SceneRecord & { selectedGenerationTaskId: string | null };
type Task = {
  id: string;
  projectId: string;
  sceneId: string | null;
  status: string;
  resultUrl: string | null;
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
  return firstCutSnapshotSchema.parse({
    aspectRatio: brief.aspectRatio,
    targetDuration: brief.duration,
    scenes: selected,
  });
}
export function selectionKey(snapshot: NonNullable<ReturnType<typeof selectionSnapshot>>) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
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

import type { Brief, Mode, Profile, SceneContent, Snapshot, TaskStatus } from "../domain";
import { AppError } from "../domain";
export interface StoryboardProvider {
  mode: Mode;
  generate(brief: Brief, profile: Profile, limits?: StoryboardLimits): Promise<SceneContent[]>;
  regenerateScene(
    brief: Brief,
    profile: Profile,
    scene: SceneContent,
    position: number,
    limits?: StoryboardLimits,
  ): Promise<SceneContent>;
}
export interface StoryboardLimits {
  maxPromptLength: number;
}
export interface Capabilities {
  minDuration: number;
  maxDuration: number;
  integerDuration: boolean;
  aspectRatios: string[];
  maxPromptLength: number;
}
export interface ProviderTask {
  id: string;
  createdAt: Date;
  startedAt: Date | null;
  providerTaskId: string | null;
  scenario: string;
  snapshot: Snapshot;
}
export interface TaskUpdate {
  status: TaskStatus;
  startedAt?: Date;
  completedAt?: Date;
  resultUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}
export interface VideoProvider {
  name: string;
  mode: Mode;
  description?: string;
  pollIntervalMs?: number;
  capabilities: Capabilities;
  submit(task: ProviderTask): Promise<{ providerTaskId: string }>;
  getStatus(task: ProviderTask, now?: Date): Promise<TaskUpdate>;
}
export function validateCapabilities(snapshot: Snapshot, capabilities: Capabilities) {
  const duration = snapshot.scene.duration;
  if (
    duration < capabilities.minDuration ||
    duration > capabilities.maxDuration ||
    (capabilities.integerDuration && !Number.isInteger(duration))
  ) {
    throw new AppError(
      "UNSUPPORTED_DURATION",
      `Each clip must be ${capabilities.minDuration}–${capabilities.maxDuration} seconds for this provider.`,
      422,
    );
  }
  if (!capabilities.aspectRatios.includes(snapshot.aspectRatio))
    throw new AppError("UNSUPPORTED_ASPECT_RATIO", "This aspect ratio is not supported.", 422);
  if (snapshot.finalPrompt.length > capabilities.maxPromptLength)
    throw new AppError(
      "PROMPT_TOO_LONG",
      `Combined prompt exceeds ${capabilities.maxPromptLength} characters.`,
      422,
    );
}

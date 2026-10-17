import type { Brief, Profile, SceneRecord, Snapshot, TaskStatus } from "./domain";
export interface TaskView {
  id: string;
  projectId: string;
  sceneId: string | null;
  snapshot: Snapshot;
  provider: string;
  mode: "mock" | "live";
  status: TaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  resultUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryOfId: string | null;
  review: { rating: number; feedback: string } | null;
  project?: { name: string };
}
export interface ProjectView {
  id: string;
  name: string;
  brief: Brief;
  profile: Profile;
  profileVersion: number;
  revision: number;
  origin: string;
  storyboardMode: string | null;
  storyboardAt: string | null;
  briefUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  scenes: SceneRecord[];
  tasks: TaskView[];
  _count?: { scenes: number; tasks: number };
}
export interface ConfigView {
  storyboardMode: string;
  videoMode: string;
  videoProvider: string;
  videoDescription?: string;
  pollIntervalMs?: number;
  setupRequired?: string[];
  capabilities: { minDuration: number; maxDuration: number; maxPromptLength?: number };
  passwordRequired?: boolean;
}

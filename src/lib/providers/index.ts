import { AppError } from "../domain";
import { MockStoryboardProvider, MockVideoProvider } from "./mock";
import type { StoryboardProvider, VideoProvider } from "./types";
import { OpenAIStoryboardProvider } from "./openai";
import { QwenStoryboardProvider } from "./qwen";
import { BachV1VideoProvider } from "./bach";
import { WanVideoProvider } from "./wan";
export function storyboardProvider(): StoryboardProvider {
  const name = process.env.STORYBOARD_PROVIDER || "mock";
  if (name === "mock") return new MockStoryboardProvider();
  if (name === "openai") return new OpenAIStoryboardProvider();
  if (name === "qwen") return new QwenStoryboardProvider();
  throw new AppError("PROVIDER_UNAVAILABLE", "Storyboard provider is not configured.", 503);
}
export function videoProvider(name = process.env.VIDEO_PROVIDER || "mock"): VideoProvider {
  if (name === "mock") return new MockVideoProvider();
  if (name === "bach-v1") return new BachV1VideoProvider();
  if (name === "wan2.2") return new WanVideoProvider("wan2.2-t2v-plus");
  if (name === "wan2.6") return new WanVideoProvider("wan2.6-t2v");
  throw new AppError("PROVIDER_UNAVAILABLE", "Video provider is not configured.", 503);
}

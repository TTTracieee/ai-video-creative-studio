import { parseStoryboard, type Brief, type Profile, type SceneContent } from "../domain";
import type { ProviderTask, StoryboardProvider, VideoProvider } from "./types";

export class MockStoryboardProvider implements StoryboardProvider {
  mode = "mock" as const;
  async generate(brief: Brief, profile: Profile) {
    const titles =
      brief.duration === 15
        ? ["Introduce the idea", "The product in action", "The brand moment"]
        : [
            "Introduce the idea",
            "The product detail",
            "The daily ritual",
            "A moment to enjoy",
            "The brand moment",
          ];
    return parseStoryboard(
      { scenes: titles.map((title, i) => this.makeScene(brief, profile, title, i)) },
      brief,
    );
  }
  private makeScene(brief: Brief, profile: Profile, title: string, i: number): SceneContent {
    const actions = [
      "Introduce the setting and the main subject",
      "Show the product in use with a close detail",
      "Show the subject enjoying the product",
      "Let the subject pause and appreciate the moment",
      "End with a clear product and brand composition",
    ];
    return {
      title,
      duration: brief.duration === 15 ? 5 : 6,
      visualDescription: `${actions[i]}. Creative direction: ${brief.creativeConcept}`,
      subject: `${brief.brandName}: ${brief.productDescription}`,
      consistencyNotes: `Reference the shared character and product descriptions. ${profile.brandElements}`,
      cameraMovement: [
        "Slow establishing push-in",
        "Close-up with a gentle lateral slide",
        "Medium shot, slow pull-back",
      ][i % 3],
      lighting: "Clear, balanced lighting that suits the setting",
      mood: "Aligned with the brief’s marketing objective",
      prompt: `${brief.visualStyle} commercial for ${brief.brandName}. ${actions[i]}. ${brief.creativeConcept} Audience: ${brief.targetAudience}. Objective: ${brief.marketingObjective}.`,
    };
  }
  async regenerateScene(brief: Brief, profile: Profile, scene: SceneContent, position: number) {
    const replacement = this.makeScene(brief, profile, scene.title, position % 5);
    return {
      ...replacement,
      duration: scene.duration,
      title: scene.title,
      cameraMovement:
        scene.cameraMovement === "Slow orbit around the subject"
          ? "Locked-off intimate close-up"
          : "Slow orbit around the subject",
      prompt: `${replacement.prompt} Alternative framing: focus on an intimate detail and a deliberate camera movement.`,
    };
  }
}
export class MockVideoProvider implements VideoProvider {
  name = "mock";
  mode = "mock" as const;
  capabilities = {
    minDuration: 1,
    maxDuration: 8,
    integerDuration: true,
    aspectRatios: ["9:16", "16:9", "1:1"],
    maxPromptLength: 10000,
  };
  async submit(task: ProviderTask) {
    return { providerTaskId: task.id };
  }
  async getStatus(task: ProviderTask, now = new Date()) {
    const elapsed = now.getTime() - task.createdAt.getTime();
    const startedAt = new Date(task.createdAt.getTime() + 1500);
    const completedAt = new Date(task.createdAt.getTime() + 6000);
    if (elapsed < 1500) return { status: "pending" as const };
    if (elapsed < 6000) return { status: "processing" as const, startedAt };
    if (task.scenario === "fail")
      return {
        status: "failed" as const,
        startedAt,
        completedAt,
        errorCode: "MOCK_FAILURE",
        errorMessage: "Simulated generation failure. Retry to run a successful mock attempt.",
      };
    const ratio = { "9:16": "portrait", "16:9": "landscape", "1:1": "square" }[
      task.snapshot.aspectRatio
    ];
    return {
      status: "completed" as const,
      startedAt,
      completedAt,
      resultUrl: `/mock/${ratio}.mp4`,
    };
  }
}

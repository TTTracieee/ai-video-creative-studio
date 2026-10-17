import { z } from "zod";

const required = z.string().trim().min(1, "This field is required").max(2000);
export const briefSchema = z.object({
  brandName: required.max(100),
  productDescription: required,
  targetAudience: required,
  marketingObjective: required,
  creativeConcept: required,
  visualStyle: required.max(200),
  duration: z.union([z.literal(15), z.literal(30)]),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  targetPlatform: required.max(100),
});
export const profileSchema = z.object({
  characterIdentity: z.string().trim().max(1200),
  productAppearance: z.string().trim().max(2000),
  brandElements: z.string().trim().max(1200),
  visualStyle: z.string().trim().max(1200),
});
export const sceneSchema = z.object({
  title: required.max(150),
  duration: z.number().int().min(1).max(30),
  visualDescription: required,
  subject: required,
  consistencyNotes: z.string().trim().max(2000),
  cameraMovement: required.max(500),
  lighting: required.max(500),
  mood: required.max(500),
  prompt: required.max(10000),
});
export const editableSceneSchema = sceneSchema
  .extend({
    promptMode: z.enum(["structured", "override"]).default("structured"),
    promptOverride: z.string().trim().max(10000).default(""),
  })
  .superRefine((scene, ctx) => {
    if (scene.promptMode === "override" && !scene.promptOverride.trim())
      ctx.addIssue({
        code: "custom",
        path: ["promptOverride"],
        message: "Enter an override or switch to structured editing.",
      });
  });
export const sceneRecordSchema = editableSceneSchema.safeExtend({ id: z.string().min(1) });
export type EditableScene = z.infer<typeof editableSceneSchema>;
// Preserve existing hand-edited prompts explicitly; historical task snapshots stay untouched.
export function readScene(value: unknown): EditableScene {
  const old = sceneSchema.parse(value);
  if (!value || typeof value !== "object" || !("promptMode" in value))
    return editableSceneSchema.parse({
      ...old,
      promptMode: "override",
      promptOverride: old.prompt,
    });
  return editableSceneSchema.parse(value);
}
export const boardSchema = z.object({ scenes: z.array(sceneSchema).min(3).max(5) });
export const revisionSchema = z.number().int().nonnegative();
export const snapshotSchema = z.object({
  scene: sceneSchema.extend({
    promptMode: z.enum(["structured", "override"]).optional(),
    promptOverride: z.string().optional(),
  }),
  profile: profileSchema,
  profileVersion: z.number().int(),
  finalPrompt: z.string(),
  aspectRatio: briefSchema.shape.aspectRatio,
});
export type Brief = z.infer<typeof briefSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type SceneContent = z.infer<typeof sceneSchema>;
export type SceneRecord = z.infer<typeof sceneRecordSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export const firstCutSnapshotSchema = z.object({
  aspectRatio: briefSchema.shape.aspectRatio,
  targetDuration: briefSchema.shape.duration,
  scenes: z
    .array(
      z.object({
        sceneId: z.string().min(1),
        taskId: z.string().min(1),
        title: z.string().min(1),
        plannedDuration: z.number().int().min(1).max(30),
      }),
    )
    .min(1)
    .max(12),
});
export type FirstCutSnapshot = z.infer<typeof firstCutSnapshotSchema>;
export type Mode = "mock" | "live";
export type TaskStatus = "pending" | "processing" | "completed" | "failed";
export const sampleBrief: Brief = {
  brandName: "Morning Brew",
  productDescription: "Premium, small-batch coffee in a cream bag with an amber label.",
  targetAudience: "Young professionals",
  marketingObjective: "Brand awareness",
  creativeConcept:
    "A warm and cinematic coffee commercial showing a young professional enjoying coffee before starting work.",
  visualStyle: "Cinematic",
  duration: 15,
  aspectRatio: "9:16",
  targetPlatform: "Instagram Reels",
};
export const emptyBrief: Brief = {
  brandName: "",
  productDescription: "",
  targetAudience: "",
  marketingObjective: "",
  creativeConcept: "",
  visualStyle: "",
  targetPlatform: "",
  duration: 15,
  aspectRatio: "9:16",
};
export function defaultProfile(brief: Brief): Profile {
  return {
    characterIdentity: "",
    productAppearance: brief.productDescription,
    brandElements: brief.brandName
      ? `${brief.brandName}. Use only brand details supplied in the brief.`
      : "",
    visualStyle: brief.visualStyle,
  };
}
export const sceneDirectionFields = [
  ["visualDescription", "Visual Description"],
  ["subject", "Subject"],
  ["cameraMovement", "Camera Movement"],
  ["lighting", "Lighting"],
  ["mood", "Mood"],
  ["consistencyNotes", "Scene Notes"],
] as const;
export function structuredScenePrompt(
  scene: Pick<SceneContent, (typeof sceneDirectionFields)[number][0]>,
) {
  return sceneDirectionFields.map(([key, label]) => `${label}: ${scene[key]}`).join("\n");
}
export function composePrompt(
  scene: SceneContent & { promptMode?: "structured" | "override"; promptOverride?: string },
  profile: Profile,
): string {
  const content =
    scene.promptMode === "override" ? scene.promptOverride?.trim() : structuredScenePrompt(scene);
  if (scene.promptMode === "override" && !content)
    throw new AppError("EMPTY_OVERRIDE", "Enter a prompt override or use structured editing.", 422);
  const direction = [
    ["Character", profile.characterIdentity],
    ["Product", profile.productAppearance],
    ["Brand", profile.brandElements],
    ["Style", profile.visualStyle],
  ]
    .filter(([, value]) => !!value)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `${direction ? `Shared direction (identity, product, brand and style take precedence):\n${direction}\n\n` : ""}Scene instructions${scene.promptMode === "override" ? " (explicit override)" : ""}:\n${content}`;
}
export function planDirtyRegions(
  saved: { name: string; brief: Brief; profile: Profile; scenes: SceneRecord[] },
  draft: { name: string; brief: Brief; profile: Profile; scenes: SceneRecord[] },
) {
  const changes: string[] = [];
  if (saved.name !== draft.name || JSON.stringify(saved.brief) !== JSON.stringify(draft.brief))
    changes.push("Brief");
  if (JSON.stringify(saved.profile) !== JSON.stringify(draft.profile))
    changes.push("Creative Direction");
  if (
    JSON.stringify(
      saved.scenes.map((s) =>
        Object.fromEntries(
          Object.keys(sceneRecordSchema.shape).map((key) => [key, s[key as keyof SceneRecord]]),
        ),
      ),
    ) !==
    JSON.stringify(
      draft.scenes.map((s) =>
        Object.fromEntries(
          Object.keys(sceneRecordSchema.shape).map((key) => [key, s[key as keyof SceneRecord]]),
        ),
      ),
    )
  )
    changes.push("Scenes");
  return changes;
}
export function parseStoryboard(value: unknown, brief: Brief): SceneContent[] {
  const parsed = boardSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
  const count = brief.duration === 15 ? 3 : 5;
  if (
    parsed.scenes.length !== count ||
    parsed.scenes.reduce((n, s) => n + s.duration, 0) !== brief.duration
  ) {
    throw new AppError(
      "INVALID_STORYBOARD",
      "Storyboard scene count or total duration does not match the brief.",
      422,
    );
  }
  return parsed.scenes;
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

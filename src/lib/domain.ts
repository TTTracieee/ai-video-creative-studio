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
  productAppearance: z.string().trim().max(1200),
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
export const sceneRecordSchema = sceneSchema.extend({ id: z.string().min(1) });
export const boardSchema = z.object({ scenes: z.array(sceneSchema).min(3).max(5) });
export const revisionSchema = z.number().int().nonnegative();
export const snapshotSchema = z.object({
  scene: sceneSchema,
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
export function defaultProfile(brief: Brief): Profile {
  return {
    characterIdentity:
      "One young professional, short dark hair, beige knit sweater. Keep their appearance consistent across scenes.",
    productAppearance: brief.productDescription,
    brandElements: `${brief.brandName}; cream packaging, amber label, plain ceramic cup. Avoid inventing additional logos.`,
    visualStyle: `${brief.visualStyle}; warm amber highlights, natural textures, soft morning light.`,
  };
}
export function composePrompt(
  scene: Pick<SceneContent, "prompt" | "consistencyNotes">,
  profile: Profile,
): string {
  return `${scene.prompt}\n\nShared visual consistency instructions (guidance, not a guarantee):\nCharacter identity: ${profile.characterIdentity || "Not specified"}\nProduct appearance: ${profile.productAppearance || "Not specified"}\nBrand elements: ${profile.brandElements || "Not specified"}\nVisual style: ${profile.visualStyle || "Not specified"}\nScene consistency notes: ${scene.consistencyNotes || "None"}`;
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

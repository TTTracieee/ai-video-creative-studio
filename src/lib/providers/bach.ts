import { createHmac } from "node:crypto";
import { z } from "zod";
import { AppError } from "../domain";
import type { ProviderTask, TaskUpdate, VideoProvider } from "./types";

// Legacy v1 protocol: do not mix with the current /video/v2 Pro schema.
const BASE_URL = "https://api-gen-na.bach.art/api/vdr";
const responseSchema = z.object({
  code: z.number(),
  data: z
    .object({
      task_id: z.string(),
      status: z.enum(["TASK_PENDING", "TASK_PROCESSING", "TASK_SUCCEEDED", "TASK_FAILED"]),
      created_at: z.number().optional(),
      started_at: z.number().optional(),
      completed_at: z.number().optional(),
      video_url: z.string().url().optional(),
    })
    .optional(),
});
export function bachToken(
  accessKey: string,
  secretKey: string,
  now = Math.floor(Date.now() / 1000),
) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: accessKey, nbf: now - 5, exp: now + 3600 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}
export class BachV1VideoProvider implements VideoProvider {
  name = "bach-v1";
  mode = "live" as const;
  capabilities = {
    minDuration: 1,
    maxDuration: 8,
    integerDuration: true,
    aspectRatios: ["9:16", "16:9", "1:1"],
    maxPromptLength: 10000,
  };
  constructor(private transport: typeof fetch = fetch) {}
  private async request(path: string, body?: object) {
    const ak = process.env.BACH_ACCESS_KEY,
      sk = process.env.BACH_SECRET_KEY;
    if (!ak || !sk)
      throw new AppError(
        "MISSING_BACH_CONFIG",
        "Set BACH_ACCESS_KEY and BACH_SECRET_KEY on the server. Legacy v1 availability requires a live check.",
        503,
      );
    let response: Response;
    try {
      response = await this.transport(`${BASE_URL}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bachToken(ak, sk)}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      throw new AppError(
        body ? "SUBMISSION_UNKNOWN" : "BACH_QUERY_TIMEOUT",
        body
          ? "The submission result is unknown. No automatic resubmission was made; retrying may create another charge."
          : "BACH status query timed out. The task is preserved; try syncing again.",
        502,
      );
    }
    if (!response.ok) {
      const uncertain = !!body && (response.status >= 500 || response.status === 408);
      throw new AppError(
        uncertain ? "SUBMISSION_UNKNOWN" : "BACH_HTTP_ERROR",
        uncertain
          ? "BACH did not confirm submission. No automatic retry was made; another submission may incur another charge."
          : `BACH returned HTTP ${response.status}. Check credentials, account access and legacy v1 availability.`,
        502,
      );
    }
    let result;
    try {
      result = responseSchema.parse(await response.json());
    } catch {
      throw new AppError(
        body ? "SUBMISSION_UNKNOWN" : "BACH_RESPONSE_INVALID",
        body
          ? "BACH returned an unrecognized submission response. It has not been automatically repeated."
          : "BACH returned an unexpected query response. The task is preserved.",
        502,
      );
    }
    if (result.code !== 200)
      throw new AppError(
        "BACH_REJECTED",
        `BACH rejected the operation (code ${result.code}). Check account access and legacy API availability.`,
        502,
      );
    if (!result.data)
      throw new AppError(
        body ? "SUBMISSION_UNKNOWN" : "BACH_RESPONSE_INVALID",
        "BACH returned no task data. No automatic resubmission was made.",
        502,
      );
    return result.data;
  }
  async submit(task: ProviderTask) {
    const data = await this.request("/videos/text2video", {
      model_name: "bach-1.0",
      prompt: task.snapshot.finalPrompt,
      resolution: "720p",
      aspect_ratio: task.snapshot.aspectRatio,
      duration: task.snapshot.scene.duration,
      enhance_prompt: false,
      generate_audio: false,
    });
    return { providerTaskId: data.task_id };
  }
  async getStatus(task: ProviderTask): Promise<TaskUpdate> {
    if (!task.providerTaskId)
      throw new AppError("SUBMISSION_UNKNOWN", "No confirmed provider task ID is available.", 409);
    const data = await this.request(
      `/videos/text2video/${encodeURIComponent(task.providerTaskId)}`,
    );
    const times = {
      ...(data.started_at ? { startedAt: new Date(data.started_at * 1000) } : {}),
      ...(data.completed_at ? { completedAt: new Date(data.completed_at * 1000) } : {}),
    };
    if (data.status === "TASK_SUCCEEDED") {
      if (!data.video_url || !data.video_url.startsWith("https://"))
        throw new AppError(
          "BACH_RESULT_MISSING",
          "BACH has not supplied a secure result URL. Query the task again.",
          502,
        );
      return {
        status: "completed",
        ...times,
        completedAt: times.completedAt || new Date(),
        resultUrl: data.video_url,
      };
    }
    if (data.status === "TASK_FAILED")
      return {
        status: "failed",
        ...times,
        completedAt: times.completedAt || new Date(),
        errorCode: "BACH_GENERATION_FAILED",
        errorMessage:
          "BACH reported a failed generation. Review the prompt and retry if appropriate.",
      };
    return { status: data.status === "TASK_PROCESSING" ? "processing" : "pending", ...times };
  }
}

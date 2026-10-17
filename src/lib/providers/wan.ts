import { z } from "zod";
import { AppError } from "../domain";
import {
  validateCapabilities,
  type ProviderTask,
  type TaskUpdate,
  type VideoProvider,
} from "./types";

type WanModel = "wan2.2-t2v-plus" | "wan2.6-t2v";
const envelopeSchema = z.object({
  code: z.string().nullable().optional(),
  output: z
    .object({
      task_id: z.string().min(1),
      task_status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"]),
      video_url: z.string().nullable().optional(),
    })
    .optional(),
});

function apiUrl(path: string) {
  const base = process.env.DASHSCOPE_BASE_URL?.trim();
  if (!base)
    throw new AppError(
      "MISSING_WAN_CONFIG",
      "Set DASHSCOPE_BASE_URL for your Alibaba Cloud workspace and region.",
      503,
    );
  try {
    const url = new URL(base);
    const official =
      url.hostname.endsWith(".maas.aliyuncs.com") ||
      [
        "dashscope.aliyuncs.com",
        "dashscope-intl.aliyuncs.com",
        "dashscope-us.aliyuncs.com",
      ].includes(url.hostname);
    if (
      url.protocol !== "https:" ||
      !official ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname.replace(/\/$/, "") !== "/compatible-mode/v1"
    )
      throw new Error("Invalid endpoint");
    url.pathname = `/api/v1${path}`;
    return url.toString();
  } catch {
    throw new AppError(
      "INVALID_WAN_CONFIG",
      "Use the official HTTPS compatible-mode/v1 Base URL for the same workspace and region as your API key.",
      503,
    );
  }
}

export class WanVideoProvider implements VideoProvider {
  mode = "live" as const;
  pollIntervalMs = 15000;
  constructor(
    private model: WanModel = "wan2.2-t2v-plus",
    private transport: typeof fetch = fetch,
  ) {}
  get name() {
    return this.model === "wan2.2-t2v-plus" ? "wan2.2" : "wan2.6";
  }
  get description() {
    return this.model === "wan2.2-t2v-plus"
      ? "Wan 2.2 · 480p silent clips · exactly 5s · 800 prompt characters. Beijing reference: CNY 0.70 per clip. Result links expire after 24 hours."
      : "Wan 2.6 · 720p clips · 2–15s · 1,500 prompt characters. Beijing reference: CNY 0.60 per second. Result links expire after 24 hours.";
  }
  get capabilities() {
    const lowCost = this.model === "wan2.2-t2v-plus";
    return {
      minDuration: lowCost ? 5 : 2,
      maxDuration: lowCost ? 5 : 15,
      integerDuration: true,
      aspectRatios: ["9:16", "16:9", "1:1"],
      maxPromptLength: lowCost ? 800 : 1500,
    };
  }
  private async request(path: string, body?: object) {
    const key = process.env.DASHSCOPE_API_KEY?.trim();
    if (!key)
      throw new AppError(
        "MISSING_WAN_CONFIG",
        "Set DASHSCOPE_API_KEY on the server and enable Wan model access in the same region.",
        503,
      );
    const url = apiUrl(path);
    let response: Response;
    try {
      response = await this.transport(url, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(body ? { "X-DashScope-Async": "enable" } : {}),
        },
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new AppError(
        body ? "SUBMISSION_UNKNOWN" : "WAN_QUERY_TIMEOUT",
        body
          ? "Wan did not confirm submission. No automatic retry was made; another submission may incur another charge."
          : "The Wan status query could not complete. Your task is preserved; sync it again later.",
        502,
      );
    }
    if (!response.ok) {
      const uncertain = !!body && (response.status >= 500 || response.status === 408);
      throw new AppError(
        uncertain
          ? "SUBMISSION_UNKNOWN"
          : response.status === 429
            ? "WAN_RATE_LIMIT"
            : "WAN_HTTP_ERROR",
        uncertain
          ? "Wan did not confirm submission. Check your provider console before retrying to avoid duplicate charges."
          : `Wan returned HTTP ${response.status}. Check your API key, model access, region and account balance.`,
        502,
      );
    }
    let result;
    try {
      result = envelopeSchema.parse(await response.json());
    } catch {
      throw new AppError(
        body ? "SUBMISSION_UNKNOWN" : "WAN_RESPONSE_INVALID",
        "Wan returned an unrecognized response. No submission was automatically repeated.",
        502,
      );
    }
    if (result.code)
      throw new AppError(
        "WAN_REJECTED",
        "Wan rejected the operation. Check model access, region, account balance and content in the provider console.",
        502,
      );
    if (!result.output)
      throw new AppError(
        body ? "SUBMISSION_UNKNOWN" : "WAN_RESPONSE_INVALID",
        "Wan returned no task data. No submission was automatically repeated.",
        502,
      );
    return result.output;
  }
  async submit(task: ProviderTask) {
    validateCapabilities(task.snapshot, this.capabilities);
    const sizes =
      this.model === "wan2.2-t2v-plus"
        ? { "9:16": "480*832", "16:9": "832*480", "1:1": "624*624" }
        : { "9:16": "720*1280", "16:9": "1280*720", "1:1": "960*960" };
    const data = await this.request("/services/aigc/video-generation/video-synthesis", {
      model: this.model,
      input: { prompt: task.snapshot.finalPrompt },
      parameters: {
        size: sizes[task.snapshot.aspectRatio],
        duration: task.snapshot.scene.duration,
        prompt_extend: false,
      },
    });
    return { providerTaskId: data.task_id };
  }
  async getStatus(task: ProviderTask, now = new Date()): Promise<TaskUpdate> {
    if (!task.providerTaskId)
      throw new AppError(
        "SUBMISSION_UNKNOWN",
        "No confirmed Wan task ID is available. Check the provider console before submitting again.",
        409,
      );
    const data = await this.request(`/tasks/${encodeURIComponent(task.providerTaskId)}`);
    if (data.task_id !== task.providerTaskId)
      throw new AppError(
        "WAN_RESPONSE_INVALID",
        "Wan returned a different task ID. The saved task is unchanged.",
        502,
      );
    if (data.task_status === "SUCCEEDED") {
      let result: URL;
      try {
        result = new URL(data.video_url || "");
        if (result.protocol !== "https:" || result.username || result.password)
          throw new Error("Invalid URL");
      } catch {
        throw new AppError(
          "WAN_RESULT_MISSING",
          "Wan has not provided a secure result URL. Sync this task again.",
          502,
        );
      }
      return { status: "completed", completedAt: now, resultUrl: result.toString() };
    }
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(data.task_status))
      return {
        status: "failed",
        completedAt: now,
        errorCode:
          data.task_status === "UNKNOWN"
            ? "WAN_TASK_EXPIRED"
            : data.task_status === "CANCELED"
              ? "WAN_TASK_CANCELED"
              : "WAN_GENERATION_FAILED",
        errorMessage:
          data.task_status === "UNKNOWN"
            ? "Wan no longer recognizes this task. Task IDs and result links are valid for 24 hours. Check the provider console before submitting again."
            : "Wan reported a failed or canceled generation. Review the prompt and provider console before retrying.",
      };
    return data.task_status === "RUNNING"
      ? { status: "processing", startedAt: task.startedAt || now }
      : { status: "pending" };
  }
}

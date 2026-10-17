import { afterEach, describe, expect, it, vi } from "vitest";
import { WanVideoProvider } from "../src/lib/providers/wan";
import { videoProvider } from "../src/lib/providers";
import { MockStoryboardProvider } from "../src/lib/providers/mock";
import { composePrompt, defaultProfile, sampleBrief } from "../src/lib/domain";

afterEach(() => vi.unstubAllEnvs());
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const output = (task_status = "PENDING", extra = {}) => ({
  output: { task_id: "wan-test-task", task_status, ...extra },
});
function configured() {
  vi.stubEnv("DASHSCOPE_API_KEY", "synthetic-wan-test-key");
  vi.stubEnv(
    "DASHSCOPE_BASE_URL",
    "https://test-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  );
}
async function fixture() {
  const profile = defaultProfile(sampleBrief);
  const [original] = await new MockStoryboardProvider().generate(sampleBrief, profile);
  const scene = {
    ...original,
    prompt: "A professional enjoys coffee in warm morning light, slow camera push-in.",
    consistencyNotes: "",
  };
  return {
    id: "local-task",
    providerTaskId: "wan-test-task",
    scenario: "success",
    createdAt: new Date(),
    startedAt: null,
    snapshot: {
      scene,
      profile,
      profileVersion: 1,
      finalPrompt: composePrompt(scene, profile),
      aspectRatio: sampleBrief.aspectRatio,
    },
  };
}

describe("Wan adapters (official contracts with simulated transport; no paid API calls)", () => {
  it.each([
    ["9:16", "480*832"],
    ["16:9", "832*480"],
    ["1:1", "624*624"],
  ] as const)(
    "submits async 480p %s generation with the exact final prompt",
    async (aspectRatio, size) => {
      configured();
      const task = await fixture();
      task.snapshot.aspectRatio = aspectRatio;
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response(output()));
      const provider = new WanVideoProvider("wan2.2-t2v-plus", transport);
      expect(await provider.submit(task)).toEqual({ providerTaskId: "wan-test-task" });
      expect(transport.mock.calls[0][0]).toBe(
        "https://test-workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      );
      const init = transport.mock.calls[0][1]!;
      expect(init.headers).toMatchObject({
        Authorization: "Bearer synthetic-wan-test-key",
        "X-DashScope-Async": "enable",
      });
      expect(init.redirect).toBe("error");
      expect(JSON.parse(init.body as string)).toEqual({
        model: "wan2.2-t2v-plus",
        input: { prompt: task.snapshot.finalPrompt },
        parameters: { size, duration: 5, prompt_extend: false },
      });
    },
  );

  it("preserves the 6s scene using the explicitly selected 720p Wan 2.6 provider", async () => {
    configured();
    vi.stubEnv("VIDEO_PROVIDER", "wan2.6");
    expect(videoProvider().name).toBe("wan2.6");
    expect(videoProvider().capabilities).toMatchObject({
      minDuration: 2,
      maxDuration: 15,
      maxPromptLength: 1500,
    });
    const task = await fixture();
    task.snapshot.scene.duration = 6;
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response(output()));
    await new WanVideoProvider("wan2.6-t2v", transport).submit(task);
    expect(JSON.parse(transport.mock.calls[0][1]!.body as string)).toMatchObject({
      model: "wan2.6-t2v",
      parameters: { size: "720*1280", duration: 6 },
    });
    expect(videoProvider("wan2.2").capabilities).toMatchObject({
      minDuration: 5,
      maxDuration: 5,
      maxPromptLength: 800,
    });
    expect(videoProvider("wan2.2").pollIntervalMs).toBe(15000);
  });

  it("rejects unsupported durations and long prompts before a paid submission", async () => {
    configured();
    const task = await fixture();
    const transport = vi.fn<typeof fetch>();
    for (const duration of [1, 4, 6, 5.5]) {
      task.snapshot.scene.duration = duration;
      await expect(
        new WanVideoProvider("wan2.2-t2v-plus", transport).submit(task),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_DURATION" });
    }
    task.snapshot.scene.duration = 5;
    task.snapshot.finalPrompt = "x".repeat(801);
    await expect(
      new WanVideoProvider("wan2.2-t2v-plus", transport).submit(task),
    ).rejects.toMatchObject({ code: "PROMPT_TOO_LONG" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("maps pending, running and terminal failures without leaking raw errors", async () => {
    configured();
    const task = await fixture();
    const now = new Date("2026-10-17T12:00:00Z");
    for (const [remote, local, code] of [
      ["PENDING", "pending", undefined],
      ["RUNNING", "processing", undefined],
      ["FAILED", "failed", "WAN_GENERATION_FAILED"],
      ["CANCELED", "failed", "WAN_TASK_CANCELED"],
      ["UNKNOWN", "failed", "WAN_TASK_EXPIRED"],
    ] as const) {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response(output(remote, { message: "synthetic-private-provider-detail" })),
        );
      const update = await new WanVideoProvider("wan2.2-t2v-plus", transport).getStatus(task, now);
      expect(update.status).toBe(local);
      if (code) expect(update.errorCode).toBe(code);
      expect(JSON.stringify(update)).not.toContain("synthetic-private-provider-detail");
      expect(transport.mock.calls[0][0]).toBe(
        "https://test-workspace.cn-beijing.maas.aliyuncs.com/api/v1/tasks/wan-test-task",
      );
      expect(transport.mock.calls[0][1]!.method).toBe("GET");
      if (remote === "RUNNING") expect(update.startedAt).toEqual(now);
    }
  });

  it("returns a playable HTTPS URL and a terminal observation time", async () => {
    configured();
    const task = await fixture();
    const now = new Date();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response(
          output("SUCCEEDED", {
            video_url: "https://example.com/generated-contract-fixture.mp4?Expires=123",
          }),
        ),
      );
    expect(await new WanVideoProvider("wan2.2-t2v-plus", transport).getStatus(task, now)).toEqual({
      status: "completed",
      completedAt: now,
      resultUrl: "https://example.com/generated-contract-fixture.mp4?Expires=123",
    });
  });

  it("does not replay ambiguous submissions, including malformed success responses", async () => {
    configured();
    const task = await fixture();
    for (const reply of [
      response({}, 500),
      response({}, 408),
      response({}),
      response({ output: { task_id: "", task_status: "PENDING" } }),
    ]) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(reply);
      await expect(
        new WanVideoProvider("wan2.2-t2v-plus", transport).submit(task),
      ).rejects.toMatchObject({ code: "SUBMISSION_UNKNOWN" });
      expect(transport).toHaveBeenCalledTimes(1);
    }
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic timeout"));
    const provider = new WanVideoProvider("wan2.2-t2v-plus", transport);
    await expect(provider.submit(task)).rejects.toMatchObject({ code: "SUBMISSION_UNKNOWN" });
    await expect(provider.getStatus(task)).rejects.toMatchObject({ code: "WAN_QUERY_TIMEOUT" });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("handles explicit rejection, authentication and rate errors without replay", async () => {
    configured();
    for (const [reply, code] of [
      [response({ code: "InvalidApiKey", message: "synthetic-private-detail" }), "WAN_REJECTED"],
      [response({}, 401), "WAN_HTTP_ERROR"],
      [response({}, 429), "WAN_RATE_LIMIT"],
    ] as const) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(reply);
      await expect(
        new WanVideoProvider("wan2.2-t2v-plus", transport).submit(await fixture()),
      ).rejects.toMatchObject({ code });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("preserves tasks on an invalid status response, missing result or mismatched ID", async () => {
    configured();
    const task = await fixture();
    for (const [reply, code] of [
      [response(output("SUCCEEDED")), "WAN_RESULT_MISSING"],
      [
        response(output("SUCCEEDED", { video_url: "http://example.com/insecure.mp4" })),
        "WAN_RESULT_MISSING",
      ],
      [response(output("PENDING", { task_id: "another-task" })), "WAN_RESPONSE_INVALID"],
      [response(output("UNRECOGNIZED")), "WAN_RESPONSE_INVALID"],
    ] as const) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(reply);
      await expect(
        new WanVideoProvider("wan2.2-t2v-plus", transport).getStatus(task),
      ).rejects.toMatchObject({ code });
    }
  });

  it("requires credentials, a valid official endpoint and a confirmed task ID", async () => {
    configured();
    const task = await fixture();
    const transport = vi.fn<typeof fetch>();
    vi.stubEnv("DASHSCOPE_API_KEY", "");
    await expect(
      new WanVideoProvider("wan2.2-t2v-plus", transport).submit(task),
    ).rejects.toMatchObject({ code: "MISSING_WAN_CONFIG" });
    configured();
    vi.stubEnv("DASHSCOPE_BASE_URL", "https://example.com/compatible-mode/v1");
    await expect(
      new WanVideoProvider("wan2.2-t2v-plus", transport).submit(task),
    ).rejects.toMatchObject({ code: "INVALID_WAN_CONFIG" });
    await expect(
      new WanVideoProvider("wan2.2-t2v-plus", transport).getStatus({
        ...task,
        providerTaskId: null,
      }),
    ).rejects.toMatchObject({ code: "SUBMISSION_UNKNOWN" });
    expect(transport).not.toHaveBeenCalled();
  });
});

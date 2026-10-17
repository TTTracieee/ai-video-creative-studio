import { afterEach, describe, expect, it, vi } from "vitest";
import { QwenStoryboardProvider } from "../src/lib/providers/qwen";
import { MockStoryboardProvider } from "../src/lib/providers/mock";
import { storyboardProvider } from "../src/lib/providers";
import { defaultProfile, sampleBrief } from "../src/lib/domain";

afterEach(() => vi.unstubAllEnvs());
const profile = defaultProfile(sampleBrief);
const baseUrl = "https://test-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const output = (content: string | null, finish_reason = "stop") => ({
  choices: [{ message: { content }, finish_reason }],
});
function configured() {
  vi.stubEnv("DASHSCOPE_API_KEY", "synthetic-qwen-test-key");
  vi.stubEnv("DASHSCOPE_BASE_URL", baseUrl);
  vi.stubEnv("DASHSCOPE_MODEL", "");
}

describe("Qwen Chat Completions adapter (simulated transport, no paid API calls)", () => {
  it.each([15, 30] as const)(
    "plans %i seconds with JSON mode and shared instructions",
    async (duration) => {
      configured();
      const brief = { ...sampleBrief, duration };
      const scenes = await new MockStoryboardProvider().generate(brief, profile);
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(response(output(JSON.stringify({ scenes }))));
      const result = await new QwenStoryboardProvider(transport).generate(brief, profile);
      expect(result).toHaveLength(duration === 15 ? 3 : 5);
      expect(result.reduce((n, scene) => n + scene.duration, 0)).toBe(duration);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0][0]).toBe(`${baseUrl}/chat/completions`);
      const init = transport.mock.calls[0][1]!;
      expect(init.headers).toMatchObject({ Authorization: "Bearer synthetic-qwen-test-key" });
      expect(init.redirect).toBe("error");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("qwen-flash");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.enable_thinking).toBe(false);
      expect(body.stream).toBe(false);
      expect(body.messages[0].content).toContain('"required"');
      expect(body.messages[0].content).toContain("JSON");
      expect(body.messages[1].content).toContain(profile.characterIdentity);
      expect(body.messages[1].content).toContain(`${duration} seconds`);
      expect(body.text).toBeUndefined();
    },
  );

  it("uses the configured model and current profile for single-scene regeneration", async () => {
    configured();
    vi.stubEnv("DASHSCOPE_MODEL", "qwen3.7-flash");
    vi.stubEnv("DASHSCOPE_BASE_URL", `${baseUrl}/`);
    const [scene] = await new MockStoryboardProvider().generate(sampleBrief, profile);
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response(output(JSON.stringify({ ...scene, title: "Alternate framing" }))),
      );
    const currentProfile = { ...profile, characterIdentity: "Current edited character identity" };
    const result = await new QwenStoryboardProvider(transport).regenerateScene(
      sampleBrief,
      currentProfile,
      scene,
      1,
    );
    expect(result.title).toBe("Alternate framing");
    expect(result.duration).toBe(scene.duration);
    const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
    expect(body.model).toBe("qwen3.7-flash");
    expect(body.messages[1].content).toContain(currentProfile.characterIdentity);
    expect(body.messages[1].content).toContain("Rewrite scene 2");
    expect(scene.title).not.toBe(result.title);
  });

  it.each(["invalid JSON", "invalid fields", "invalid duration"])(
    "repairs %s only once",
    async (scenario) => {
      configured();
      const scenes = await new MockStoryboardProvider().generate(sampleBrief, profile);
      const invalid =
        scenario === "invalid JSON"
          ? "invalid json"
          : JSON.stringify({
              scenes:
                scenario === "invalid fields"
                  ? [{ title: "Missing required fields" }]
                  : scenes.map((s) => ({ ...s, duration: 4 })),
            });
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(output(invalid)))
        .mockResolvedValueOnce(response(output(JSON.stringify({ scenes }))));
      expect(
        await new QwenStoryboardProvider(transport).generate(sampleBrief, profile),
      ).toHaveLength(3);
      expect(transport).toHaveBeenCalledTimes(2);
      expect(JSON.parse(transport.mock.calls[1][1]!.body as string).messages[1].content).toContain(
        "previous output failed validation",
      );
    },
  );

  it("rejects repeated invalid output and changed scene duration without mutating input", async () => {
    configured();
    const [scene] = await new MockStoryboardProvider().generate(sampleBrief, profile);
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response(output(JSON.stringify({ ...scene, duration: 6 }))));
    await expect(
      new QwenStoryboardProvider(transport).regenerateScene(sampleBrief, profile, scene, 0),
    ).rejects.toMatchObject({ code: "LLM_VALIDATION_FAILED" });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(scene.duration).toBe(5);
  });

  it("does not repeat HTTP errors or expose provider error payloads", async () => {
    configured();
    for (const status of [401, 429, 500]) {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response({ error: { message: "synthetic-private-provider-detail" } }, status),
        );
      const operation = new QwenStoryboardProvider(transport).generate(sampleBrief, profile);
      await expect(operation).rejects.toMatchObject({
        code: status === 429 ? "LLM_RATE_LIMIT" : "LLM_REQUEST_FAILED",
      });
      await expect(operation).rejects.not.toThrow("synthetic-private-provider-detail");
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("does not repeat refusals, truncated output, empty content or invalid envelopes", async () => {
    configured();
    for (const [body, code] of [
      [output("", "content_filter"), "LLM_REFUSAL"],
      [
        { choices: [{ message: { refusal: "declined", content: null }, finish_reason: "stop" }] },
        "LLM_REFUSAL",
      ],
      [output("partial", "length"), "LLM_INCOMPLETE"],
      [output(null), "LLM_RESPONSE_INVALID"],
      [output(" "), "LLM_RESPONSE_INVALID"],
      [{ choices: [] }, "LLM_RESPONSE_INVALID"],
    ] as const) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response(body));
      await expect(
        new QwenStoryboardProvider(transport).generate(sampleBrief, profile),
      ).rejects.toMatchObject({ code });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("reports network failures without retry or fallback", async () => {
    configured();
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic timeout"));
    await expect(
      new QwenStoryboardProvider(transport).generate(sampleBrief, profile),
    ).rejects.toMatchObject({ code: "LLM_NETWORK_ERROR" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("selects Qwen explicitly and requires key and region-specific base URL before any call", async () => {
    vi.stubEnv("STORYBOARD_PROVIDER", "qwen");
    expect(storyboardProvider()).toBeInstanceOf(QwenStoryboardProvider);
    expect(storyboardProvider().mode).toBe("live");
    for (const [key, base] of [
      ["", baseUrl],
      ["synthetic-qwen-test-key", ""],
    ]) {
      vi.stubEnv("DASHSCOPE_API_KEY", key);
      vi.stubEnv("DASHSCOPE_BASE_URL", base);
      const transport = vi.fn<typeof fetch>();
      await expect(
        new QwenStoryboardProvider(transport).generate(sampleBrief, profile),
      ).rejects.toMatchObject({ code: "MISSING_LLM_CONFIG" });
      expect(transport).not.toHaveBeenCalled();
    }
  });

  it("rejects incorrect endpoints before transmitting a key", async () => {
    configured();
    for (const base of [
      "not-a-url",
      "http://test-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "https://example.com/compatible-mode/v1",
      `${baseUrl}/chat/completions`,
      `${baseUrl}?api_key=synthetic`,
      "https://user:password@dashscope.aliyuncs.com/compatible-mode/v1",
    ]) {
      vi.stubEnv("DASHSCOPE_BASE_URL", base);
      const transport = vi.fn<typeof fetch>();
      await expect(
        new QwenStoryboardProvider(transport).generate(sampleBrief, profile),
      ).rejects.toMatchObject({ code: "INVALID_LLM_CONFIG" });
      expect(transport).not.toHaveBeenCalled();
    }
  });
});

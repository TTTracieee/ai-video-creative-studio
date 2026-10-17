import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { OpenAIStoryboardProvider } from "../src/lib/providers/openai";
import { BachV1VideoProvider, bachToken } from "../src/lib/providers/bach";
import { MockStoryboardProvider } from "../src/lib/providers/mock";
import { defaultProfile, sampleBrief, composePrompt } from "../src/lib/domain";
import { storyboardProvider, videoProvider } from "../src/lib/providers";

afterEach(() => vi.unstubAllEnvs());
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const output = (text: string) => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
});
const contextProfile = defaultProfile(sampleBrief);
async function fixture() {
  const [scene] = await new MockStoryboardProvider().generate(sampleBrief, contextProfile);
  return {
    id: "test-task",
    createdAt: new Date(),
    startedAt: null,
    providerTaskId: "external-test-task",
    scenario: "success",
    snapshot: {
      scene,
      profile: contextProfile,
      profileVersion: 1,
      finalPrompt: composePrompt(scene, contextProfile),
      aspectRatio: sampleBrief.aspectRatio,
    },
  };
}
describe("OpenAI Responses adapter (simulated transport, no real API call)", () => {
  function configured() {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-unit-test-key");
    vi.stubEnv("OPENAI_MODEL", "test-structured-model");
  }
  it("sends strict structured output and validates a repaired response", async () => {
    configured();
    const scenes = await new MockStoryboardProvider().generate(sampleBrief, contextProfile);
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(output("invalid json")))
      .mockResolvedValueOnce(response(output(JSON.stringify({ scenes }))));
    const result = await new OpenAIStoryboardProvider(transport).generate(
      sampleBrief,
      contextProfile,
    );
    expect(result).toHaveLength(3);
    expect(transport).toHaveBeenCalledTimes(2);
    const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
    expect(body.text.format.strict).toBe(true);
    expect(body.model).toBe("test-structured-model");
    expect(body.store).toBe(false);
    expect(body.input[1].content).toContain(contextProfile.characterIdentity);
  });
  it("preserves the scene duration and limits malformed output repair", async () => {
    configured();
    const task = await fixture();
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        response(output(JSON.stringify({ ...task.snapshot.scene, duration: 7 }))),
      );
    await expect(
      new OpenAIStoryboardProvider(transport).regenerateScene(
        sampleBrief,
        contextProfile,
        task.snapshot.scene,
        0,
      ),
    ).rejects.toMatchObject({ code: "LLM_VALIDATION_FAILED" });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("does not retry refusals, incomplete responses, rate limits or timeouts", async () => {
    configured();
    for (const [reply, code] of [
      [
        response({
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal" }] }],
        }),
        "LLM_REFUSAL",
      ],
      [response({ status: "incomplete", output: [] }), "LLM_INCOMPLETE"],
      [response({}, 429), "LLM_RATE_LIMIT"],
    ] as const) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(reply);
      await expect(
        new OpenAIStoryboardProvider(transport).generate(sampleBrief, contextProfile),
      ).rejects.toMatchObject({ code });
      expect(transport).toHaveBeenCalledTimes(1);
    }
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic timeout"));
    await expect(
      new OpenAIStoryboardProvider(transport).generate(sampleBrief, contextProfile),
    ).rejects.toMatchObject({ code: "LLM_NETWORK_ERROR" });
  });
  it("fails clearly when explicitly selected without configuration", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_MODEL", "");
    vi.stubEnv("STORYBOARD_PROVIDER", "openai");
    expect(storyboardProvider().mode).toBe("live");
    await expect(storyboardProvider().generate(sampleBrief, contextProfile)).rejects.toMatchObject({
      code: "MISSING_LLM_CONFIG",
    });
  });
});
describe("BACH legacy v1 adapter (historical contract, simulated transport only)", () => {
  function configured() {
    vi.stubEnv("BACH_ACCESS_KEY", "synthetic-access-key");
    vi.stubEnv("BACH_SECRET_KEY", "synthetic-signing-key");
  }
  it("signs the documented HS256 token claims", () => {
    const [header, payload, signature] = bachToken(
      "unit-test-access",
      "unit-test-secret",
      1000,
    ).split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString()).alg).toBe("HS256");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iss: "unit-test-access",
      nbf: 995,
      exp: 4600,
    });
    expect(signature).toBe(
      createHmac("sha256", "unit-test-secret").update(`${header}.${payload}`).digest("base64url"),
    );
  });
  it("submits the old flat v1 shape and maps successful polling", async () => {
    configured();
    const task = await fixture();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ code: 200, data: { task_id: "external-test-task", status: "TASK_PENDING" } }),
      )
      .mockResolvedValueOnce(
        response({
          code: 200,
          data: {
            task_id: "external-test-task",
            status: "TASK_SUCCEEDED",
            video_url: "https://example.com/mock-contract-only.mp4",
            completed_at: 1000,
          },
        }),
      );
    const provider = new BachV1VideoProvider(transport);
    expect(await provider.submit(task)).toEqual({ providerTaskId: "external-test-task" });
    const submitted = JSON.parse(transport.mock.calls[0][1]!.body as string);
    expect(submitted.model_name).toBe("bach-1.0");
    expect(submitted.input).toBeUndefined();
    expect(submitted.duration).toBe(5);
    expect(transport.mock.calls[0][0]).toBe(
      "https://api-gen-na.bach.art/api/vdr/videos/text2video",
    );
    expect((await provider.getStatus(task)).status).toBe("completed");
    expect(transport.mock.calls[1][1]!.method).toBe("GET");
  });
  it("marks ambiguous submission timeouts without retrying", async () => {
    configured();
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic timeout"));
    await expect(new BachV1VideoProvider(transport).submit(await fixture())).rejects.toMatchObject({
      code: "SUBMISSION_UNKNOWN",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("treats a success response without task data as an ambiguous submission", async () => {
    configured();
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response({ code: 200 }));
    await expect(new BachV1VideoProvider(transport).submit(await fixture())).rejects.toMatchObject({
      code: "SUBMISSION_UNKNOWN",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("validates status, failures and missing credentials", async () => {
    configured();
    const task = await fixture();
    for (const [status, expected] of [
      ["TASK_PENDING", "pending"],
      ["TASK_PROCESSING", "processing"],
      ["TASK_FAILED", "failed"],
    ]) {
      const provider = new BachV1VideoProvider(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(response({ code: 200, data: { task_id: task.id, status } })),
      );
      expect((await provider.getStatus(task)).status).toBe(expected);
    }
    const invalid = new BachV1VideoProvider(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ code: 200, data: { task_id: task.id, status: "UNKNOWN" } })),
    );
    await expect(invalid.getStatus(task)).rejects.toMatchObject({ code: "BACH_RESPONSE_INVALID" });
    vi.stubEnv("BACH_ACCESS_KEY", "");
    vi.stubEnv("BACH_SECRET_KEY", "");
    vi.stubEnv("VIDEO_PROVIDER", "bach-v1");
    expect(videoProvider().mode).toBe("live");
    await expect(videoProvider().submit(task)).rejects.toMatchObject({
      code: "MISSING_BACH_CONFIG",
    });
  });
});

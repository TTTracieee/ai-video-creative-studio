import { afterEach, expect, it, vi } from "vitest";
import { assertSameOrigin, authorized, createSession, passwordMatches } from "../src/lib/auth";
afterEach(() => vi.unstubAllEnvs());
it("fails closed in production without secrets", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_PASSWORD", "");
  vi.stubEnv("SESSION_SECRET", "");
  expect(authorized()).toBe(false);
  expect(() => createSession()).toThrow("Set APP_PASSWORD");
});
it("allows local mode without a password", () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_PASSWORD", "");
  expect(authorized()).toBe(true);
});
it("validates password, signed sessions, expiry and tampering", () => {
  vi.stubEnv("APP_PASSWORD", "unit-test-password-only");
  vi.stubEnv("SESSION_SECRET", "unit-test-signing-secret-never-use-for-production");
  expect(passwordMatches("unit-test-password-only")).toBe(true);
  expect(passwordMatches("wrong")).toBe(false);
  const token = createSession(1000);
  expect(authorized(token, 2000)).toBe(true);
  expect(authorized(token, 1000 + 8 * 3600000)).toBe(false);
  expect(authorized(`${token}x`, 2000)).toBe(false);
  expect(authorized()).toBe(false);
});
it("rejects cross-origin mutations while supporting a matching proxy Host", () => {
  expect(() => assertSameOrigin("http://127.0.0.1:3100", "127.0.0.1:3100")).not.toThrow();
  expect(() => assertSameOrigin("https://studio.example", "studio.example")).not.toThrow();
  expect(() => assertSameOrigin("https://attacker.example", "studio.example")).toThrow(
    "Cross-origin",
  );
  expect(() => assertSameOrigin("null", "studio.example")).toThrow();
});

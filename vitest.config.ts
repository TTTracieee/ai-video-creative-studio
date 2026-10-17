import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    env: {
      STORYBOARD_PROVIDER: "mock",
      VIDEO_PROVIDER: "mock",
      DASHSCOPE_API_KEY: "",
      DASHSCOPE_BASE_URL: "",
      OPENAI_API_KEY: "",
      BACH_ACCESS_KEY: "",
      BACH_SECRET_KEY: "",
      APP_PASSWORD: "",
      SESSION_SECRET: "",
    },
  },
});

import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
  },
  webServer: {
    command: "npm run db:migrate && npm run db:seed-example && npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ENABLE_DEV_TOOLS: "true",
      MEDIA_ROOT: "/private/tmp/frame-e2e-media",
      DATABASE_URL: "file:./e2e.db",
      STORYBOARD_PROVIDER: "mock",
      VIDEO_PROVIDER: "mock",
      APP_PASSWORD: "",
      SESSION_SECRET: "",
    },
  },
});

import { test, expect } from "@playwright/test";

test("brief → storyboard → shared profile → editing → mock video → review → export", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "highlighted brief" })).toBeVisible();
  await page.getByRole("button", { name: "Use Morning Brew example" }).click();
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Morning Brew campaign" })).toBeVisible();
  await page.getByRole("button", { name: "Generate storyboard", exact: true }).click();
  await expect(page.getByTestId("scene-0")).toBeVisible();
  await expect(page.getByText("15 / 15s planned")).toBeVisible();
  await page
    .getByLabel("Character Identity", { exact: true })
    .fill("Same person, short dark hair, blue jacket");
  await page.getByRole("button", { name: /Save profile/ }).click();
  await expect(page.getByRole("status")).toContainText("Visual profile saved");
  await page.getByLabel("Scene 1 title", { exact: true }).fill("My opening moment");
  await page.getByRole("button", { name: /Save scenes/ }).click();
  await expect(page.getByRole("status")).toContainText("Storyboard saved");
  await page.reload();
  await expect(page.getByLabel("Scene 1 title", { exact: true })).toHaveValue("My opening moment");
  await expect(page.getByLabel("Character Identity", { exact: true })).toHaveValue(
    "Same person, short dark hair, blue jacket",
  );
  await page.getByTestId("scene-0").getByRole("button", { name: "Rewrite" }).click();
  await expect(page.getByRole("status")).toContainText("Scene regenerated");
  await page.screenshot({ path: "docs/images/storyboard.png", fullPage: true });
  await page.getByTestId("scene-0").getByRole("button", { name: "Generate clip" }).click();
  await expect(page.getByTestId("task-pending")).toBeVisible();
  await expect(page.getByTestId("task-processing")).toBeVisible({ timeout: 15000 });
  await page.reload();
  await page.getByRole("button", { name: /Generate & review/ }).click();
  await expect(page.getByTestId("task-completed")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("MOCK / DEMO FOOTAGE")).toBeVisible();
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThanOrEqual(1);
  await video.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    await el.play();
  });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.2);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
  await page.getByRole("button", { name: "Rate 4 stars", exact: true }).click();
  await page
    .getByLabel("Feedback", { exact: true })
    .fill("Clear direction; demo media is clearly labeled.");
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Review saved");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toContain("project.json");
  await page.screenshot({ path: "docs/images/review.png", fullPage: true });
});

test("analytics separates modes, rejects cross-origin writes and fits a mobile viewport", async ({
  page,
  request,
}) => {
  const rejected = await request.post("/api/projects", {
    headers: { origin: "https://example.invalid" },
    data: {},
  });
  expect(rejected.status()).toBe(403);
  await page.goto("/analytics");
  await expect(page.getByTestId("success-rate")).toBeVisible();
  await expect(page.getByText("Mock / Demo data only.", { exact: false })).toBeVisible();
  await page.getByLabel("Analytics provider mode", { exact: true }).selectOption("live");
  await expect(page.getByTestId("success-rate")).toHaveText("—");
  await page.getByLabel("Analytics data source", { exact: true }).selectOption("demo");
  await expect(page.getByTestId("average-rating")).toHaveText("—");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good ideas start here." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.screenshot({ path: "docs/images/mobile.png", fullPage: true });
});

test("failed generation is preserved and retry succeeds", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Try the coffee campaign/ }).click();
  await page.getByRole("button", { name: "Generate storyboard", exact: true }).click();
  await expect(page.getByTestId("scene-0")).toBeVisible();
  await page.getByLabel("Mock scenario", { exact: true }).selectOption("fail");
  await page.getByTestId("scene-0").getByRole("button", { name: "Generate clip" }).click();
  await expect(page.getByTestId("task-failed")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Retry generation", exact: true }).click();
  await expect(page.getByTestId("task-completed")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("task-failed")).toBeVisible();
});

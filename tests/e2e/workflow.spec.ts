import { test, expect } from "@playwright/test";
import { sampleBrief } from "../../src/lib/domain";

test("project deletion confirms scope, blocks active jobs and removes tasks from both entry points", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/projects", {
    data: { brief: { ...sampleBrief, brandName: "Deletion workflow fixture" }, origin: "demo" },
  });
  const { data: project } = await created.json();
  await page.goto(`/projects/${project.id}`);
  await page.getByRole("button", { name: "Generate storyboard", exact: true }).click();
  await page.getByTestId("scene-0").getByRole("button", { name: "Generate clip" }).click();
  await expect(page.getByTestId("task-pending")).toBeVisible();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete project?" });
  await expect(dialog).toContainText("generation tasks are still active");
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Check task status" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const active = (await (await request.get(`/api/projects/${project.id}`)).json()).data;
  const rejected = await request.delete(`/api/projects/${project.id}`, {
    data: { revision: active.revision },
  });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).error.code).toBe("ACTIVE_TASKS");
  await expect(page.getByTestId("task-completed")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Rate 4 stars", exact: true }).click();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Review saved");
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await expect(dialog).toContainText("3 scenes · 1 generation attempts · 1 reviews");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await request.get(`/api/projects/${project.id}`)).ok()).toBe(true);
  const crossOrigin = await request.delete(`/api/projects/${project.id}`, {
    headers: { origin: "https://example.invalid" },
    data: { revision: active.revision },
  });
  expect(crossOrigin.status()).toBe(403);
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.reload();
  await expect(page.getByTestId(`project-card-${project.id}`)).toHaveCount(0);
  expect((await request.get(`/api/projects/${project.id}`)).status()).toBe(404);
  const tasks = (await (await request.get("/api/tasks")).json()).data;
  expect(tasks.filter((task: { projectId: string }) => task.projectId === project.id)).toHaveLength(
    0,
  );

  const briefOnly = (
    await (
      await request.post("/api/projects", {
        data: { brief: { ...sampleBrief, brandName: "Delete from card fixture" }, origin: "demo" },
      })
    ).json()
  ).data;
  await page.reload();
  await page
    .getByTestId(`project-card-${briefOnly.id}`)
    .getByRole("button", { name: `Delete ${briefOnly.name}`, exact: true })
    .click();
  await expect(dialog).toContainText("0 scenes · 0 generation attempts · 0 reviews");
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByTestId(`project-card-${briefOnly.id}`)).toHaveCount(0);
  expect((await request.get(`/api/projects/${briefOnly.id}`)).status()).toBe(404);
});

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

test("simulated Wan config shows limits and blocks incompatible clips before submission", async ({
  page,
  request,
}) => {
  let model = "wan2.2";
  let configured = true;
  await page.route("**/api/config", async (route) => {
    const result = await route.fetch();
    const payload = await result.json();
    payload.data = {
      ...payload.data,
      videoMode: "live",
      setupRequired: configured ? [] : ["DASHSCOPE_API_KEY"],
      videoProvider: model,
      videoDescription:
        model === "wan2.2"
          ? "Wan 2.2 · 480p silent clips · exactly 5s · 800 prompt characters."
          : "Wan 2.6 · 720p clips · 2–15s · 1,500 prompt characters.",
      capabilities: {
        minDuration: model === "wan2.2" ? 5 : 2,
        maxDuration: model === "wan2.2" ? 5 : 15,
        maxPromptLength: model === "wan2.2" ? 800 : 1500,
      },
    };
    await route.fulfill({ response: result, json: payload });
  });
  const result = await request.post("/api/projects", {
    data: { brief: { ...sampleBrief, duration: 30 }, origin: "demo" },
  });
  expect(result.ok()).toBe(true);
  const { data } = await result.json();
  await page.goto(`/projects/${data.id}`);
  await page.getByRole("button", { name: "Generate storyboard", exact: true }).click();
  await expect(page.getByText("30 / 30s planned")).toBeVisible();
  await expect(page.getByText("wan2.2 requires 5s per clip.", { exact: false })).toHaveCount(5);
  await expect(
    page.getByTestId("scene-0").getByRole("button", { name: "Generate clip" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Generate all clips", exact: true }),
  ).toBeDisabled();
  model = "wan2.6";
  await page.reload();
  await expect(page.getByText("Wan 2.6 · 720p clips", { exact: false })).toBeVisible();
  await expect(
    page.getByTestId("scene-0").getByRole("button", { name: "Generate clip" }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Generate all clips", exact: true })).toBeEnabled();
  await page.getByLabel("Character Identity", { exact: true }).fill("x".repeat(1200));
  await page.getByRole("button", { name: /Save profile/ }).click();
  await expect(page.getByRole("status")).toContainText("Visual profile saved");
  await expect(page.getByText("Shorten the scene prompt", { exact: false })).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Generate all clips", exact: true }),
  ).toBeDisabled();
  configured = false;
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "API setup required: DASHSCOPE_API_KEY" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate board", exact: true })).toBeDisabled();
});

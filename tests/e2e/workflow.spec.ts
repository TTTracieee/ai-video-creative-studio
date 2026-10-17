import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { sampleBrief, type Brief } from "../../src/lib/domain";
const shoes: Brief = {
  ...sampleBrief,
  brandName: "Stride",
  productDescription: "Lightweight running shoes in blue mesh",
  targetAudience: "Road runners",
  creativeConcept: "An athlete trains for the finish line",
  visualStyle: "Energetic sports photography",
};
async function create(request: APIRequestContext, brief = sampleBrief) {
  const response = await request.post("/api/projects", { data: { brief } });
  expect(response.ok()).toBe(true);
  return (await response.json()).data;
}
async function plan(page: Page, id: string) {
  await page.goto(`/projects/${id}`);
  await page.getByRole("button", { name: "01 Plan", exact: true }).click();
}
async function board(page: Page) {
  await page.getByRole("button", { name: "Generate storyboard", exact: true }).click();
  await expect(page.getByTestId("scene-0")).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save Plan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Plan saved");
}
async function generateTab(page: Page) {
  await page.getByRole("button", { name: /02\s*Generate & Select/ }).click();
}
async function more(page: Page) {
  const menu = page.locator(".project-more");
  if ((await menu.getAttribute("open")) === null) await menu.locator("summary").click();
}

test("non-coffee creation, structured fields, unified saving and final submitted snapshot", async ({
  page,
  request,
}) => {
  await page.goto("/projects/new");
  await expect(page.getByLabel("Visual Style *", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Target Platform *", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "highlighted" })).toBeVisible();
  const p = await create(request, shoes);
  await plan(page, p.id);
  await board(page);
  await expect(page.locator(".consistency-panel")).not.toContainText(/coffee|ceramic|morning/i);
  await expect(page.locator("main")).not.toContainText("STORYBOARD PLACEHOLDER");
  const scene = page.getByTestId("scene-0");
  await expect(scene.getByLabel("Visual Description", { exact: true })).toBeVisible();
  await expect(scene.getByLabel("Final Prompt", { exact: true })).not.toBeVisible();
  await scene
    .getByLabel("Camera Movement", { exact: true })
    .fill("Low tracking shot following the blue running shoes");
  await page.getByLabel("Character Identity", { exact: true }).fill("An athlete in a blue vest");
  await page.locator(".brief-plan > summary").click();
  await page.getByLabel("Project name", { exact: true }).fill("Stride sports campaign");
  await expect(
    page.getByText("Unsaved: Brief, Creative Direction, Scenes", { exact: true }),
  ).toBeVisible();
  await scene.getByText("Advanced · Prompt & override", { exact: true }).click();
  await expect(scene.getByLabel("Final Prompt", { exact: true })).toHaveValue(/Low tracking shot/);
  await expect(scene.getByLabel("Final Prompt", { exact: true })).toHaveValue(/blue vest/);
  await save(page);
  await expect(page.getByText("All plan changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Character Identity", { exact: true })).toHaveValue(
    "An athlete in a blue vest",
  );
  await expect(
    page.getByTestId("scene-0").getByLabel("Camera Movement", { exact: true }),
  ).toHaveValue("Low tracking shot following the blue running shoes");
  await generateTab(page);
  await page
    .getByTestId("generate-scene-0")
    .getByRole("button", { name: "Generate scene", exact: true })
    .click();
  await expect(page.getByTestId("selected-version")).toHaveCount(1, { timeout: 20000 });
  const current = (await (await request.get(`/api/projects/${p.id}`)).json()).data;
  expect(current.tasks[0].snapshot.finalPrompt).toContain("Low tracking shot");
  expect(current.tasks[0].snapshot.scene.cameraMovement).toContain("Low tracking shot");
  await page.getByRole("button", { name: "01 Plan", exact: true }).click();
  await page.screenshot({ path: "docs/images/storyboard.png", fullPage: true });
});

test("override stays explicit and switching it off restores structured edits", async ({
  page,
  request,
}) => {
  const p = await create(request, shoes);
  await plan(page, p.id);
  await board(page);
  const scene = page.getByTestId("scene-0");
  await scene.getByText("Advanced · Prompt & override", { exact: true }).click();
  await scene.getByRole("checkbox", { name: "Use a scene prompt override", exact: true }).check();
  await scene
    .getByLabel("Prompt Override", { exact: true })
    .fill("A charcoal trainer rotates on a red plinth.");
  await expect(scene.getByLabel("Subject", { exact: true })).toBeDisabled();
  await expect(scene.getByLabel("Final Prompt", { exact: true })).toHaveValue(/red plinth/);
  await save(page);
  await page.reload();
  const reloaded = page.getByTestId("scene-0");
  await reloaded.getByText("Advanced · Prompt & override", { exact: true }).click();
  await expect(
    reloaded.getByRole("checkbox", { name: "Use a scene prompt override", exact: true }),
  ).toBeChecked();
  await expect(reloaded.getByLabel("Prompt Override", { exact: true })).toHaveValue(
    "A charcoal trainer rotates on a red plinth.",
  );
  await reloaded
    .getByRole("checkbox", { name: "Use a scene prompt override", exact: true })
    .uncheck();
  await reloaded.getByLabel("Subject", { exact: true }).fill("Blue running shoes on the track");
  await expect(reloaded.getByLabel("Final Prompt", { exact: true })).toHaveValue(
    /Blue running shoes on the track/,
  );
  await expect(reloaded.getByLabel("Final Prompt", { exact: true })).not.toHaveValue(/red plinth/);
  await save(page);
});

test("failed save keeps the draft and shows which area is unsaved", async ({ page, request }) => {
  const p = await create(request);
  await plan(page, p.id);
  await board(page);
  await page
    .getByTestId("scene-0")
    .getByLabel("Subject", { exact: true })
    .fill("My unsaved subject");
  await page.route(`**/api/projects/${p.id}/plan`, (route) =>
    route.fulfill({
      status: 409,
      json: { error: { message: "Plan changed elsewhere. Reload before saving." } },
    }),
  );
  await page.getByRole("button", { name: "Save Plan", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Plan changed elsewhere" })).toBeVisible();
  await expect(page.getByTestId("scene-0").getByLabel("Subject", { exact: true })).toHaveValue(
    "My unsaved subject",
  );
  await expect(page.getByText("Unsaved: Scenes", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Plan", exact: true })).toBeEnabled();
});

test("Morning Brew → select versions → first cut → tracked MP4 export → metadata edits → replace clip", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  await page.goto("/projects/new");
  await page.getByRole("button", { name: "Fill example brief", exact: true }).click();
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Morning Brew campaign", exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await board(page);
  await generateTab(page);
  await page.getByRole("button", { name: "Generate missing scenes", exact: true }).click();
  await expect(page.getByTestId("selected-version")).toHaveCount(3, { timeout: 25000 });
  await expect(
    page.getByRole("button", { name: "Generate missing scenes", exact: true }),
  ).toHaveCount(0);
  const scene = page.getByTestId("generate-scene-0");
  await scene.getByText("Notes & details", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Rate 4 stars", exact: true })).toHaveCount(0);
  await scene
    .getByLabel("Review Notes", { exact: true })
    .fill("Keep this version for its clear product silhouette.");
  await scene.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Notes saved");
  await page.getByRole("button", { name: "03 Preview & Export", exact: true }).click();
  await page.getByRole("button", { name: "Build first cut", exact: true }).click();
  const video = page.getByLabel("First cut preview", { exact: true });
  await expect(video).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThanOrEqual(2);
  await video.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    await el.play();
  });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.2);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
  await expect(
    page.getByText("Target 15s · 3 / 3 selected · First cut 9.0s", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Update first cut", exact: true })).toHaveCount(0);
  const exportLink = page.getByRole("link", { name: "Export MP4", exact: true });
  await expect(exportLink).toBeInViewport();
  const downloaded = page.waitForEvent("download");
  await exportLink.click();
  expect((await downloaded).suggestedFilename()).toContain("first-cut.mp4");
  const cut = (await (await request.get(`/api/projects/${id}`)).json()).data;
  const analytics = (await (await request.get("/api/analytics?mode=mock&origin=user")).json()).data;
  expect(analytics.firstCutsBuilt).toBeGreaterThan(0);
  expect(analytics.mp4Exports).toBeGreaterThan(0);
  const exportId = crypto.randomUUID();
  for (const range of ["bytes=0-31", "bytes=32-63"])
    expect(
      (
        await request.get(`${cut.output.mediaUrl}?download=1&exportId=${exportId}`, {
          headers: { range },
        })
      ).status(),
    ).toBe(206);
  const afterRanges = (await (await request.get("/api/analytics?mode=mock&origin=user")).json())
    .data;
  expect(afterRanges.mp4Exports).toBe(analytics.mp4Exports + 1);
  await page.getByRole("button", { name: "01 Plan", exact: true }).click();
  await page.getByLabel("Scene 1 title", { exact: true }).fill("A renamed opening");
  await page
    .getByTestId("scene-0")
    .getByLabel("Mood", { exact: true })
    .fill("More energetic for a future generation");
  await page
    .locator(".consistency-panel")
    .getByLabel("Visual Style", { exact: true })
    .fill("Cool contrast for future clips");
  await save(page);
  await page.getByRole("button", { name: "03 Preview & Export", exact: true }).click();
  await expect(exportLink).toBeVisible();
  await expect(page.getByText("Up to date", { exact: true })).toBeVisible();
  expect((await (await request.get(`/api/projects/${id}`)).json()).data.output.id).toBe(
    cut.output.id,
  );
  await page.reload();
  await expect(video).toBeVisible();
  await generateTab(page);
  const first = page.getByTestId("generate-scene-0");
  await first.getByRole("button", { name: "Generate another", exact: true }).click();
  await expect(first.getByText("A new version is ready.", { exact: false })).toBeVisible({
    timeout: 25000,
  });
  await first.getByText("Other versions (1)", { exact: true }).click();
  await first.getByRole("button", { name: "Use this version", exact: true }).click();
  await page.getByRole("button", { name: "03 Preview & Export", exact: true }).click();
  await expect(
    page.getByText("Your selected clips or playback order changed.", { exact: false }),
  ).toBeVisible();
  await expect(exportLink).toHaveCount(0);
  await page.getByRole("button", { name: "Update first cut", exact: true }).click();
  await expect(exportLink).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "docs/images/first-cut.png", fullPage: true });
});

test("failure → retry → private notes; retry keeps the failed attempt", async ({
  page,
  request,
}) => {
  const p = await create(request);
  await plan(page, p.id);
  await board(page);
  await generateTab(page);
  await page.getByText("Development controls", { exact: true }).click();
  await page.getByLabel("Mock scenario", { exact: true }).selectOption("fail");
  await page
    .getByTestId("generate-scene-0")
    .getByRole("button", { name: "Generate scene", exact: true })
    .click();
  await expect(page.getByTestId("task-failed")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Retry generation", exact: true }).click();
  await expect(page.getByTestId("task-completed")).toBeVisible({ timeout: 20000 });
  await page.getByText("Other versions (1)", { exact: true }).click();
  await expect(page.getByTestId("task-failed")).toBeVisible();
  const completed = page.getByTestId("task-completed");
  await completed.getByText("Notes & details", { exact: true }).click();
  await completed
    .getByLabel("Review Notes", { exact: true })
    .fill("A private version note, not model feedback.");
  await completed.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Notes saved");
  await page.screenshot({ path: "docs/images/review.png", fullPage: true });
});

test("project deletion stays in More, blocks active jobs and clears related records", async ({
  page,
  request,
}) => {
  const p = await create(request);
  await plan(page, p.id);
  await board(page);
  await generateTab(page);
  await page
    .getByTestId("generate-scene-0")
    .getByRole("button", { name: "Generate scene", exact: true })
    .click();
  await more(page);
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete project?" });
  await expect(
    dialog.getByRole("button", { name: "Delete permanently", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("task-completed")).toBeVisible({ timeout: 20000 });
  await more(page);
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  expect((await request.get(`/api/projects/${p.id}`)).status()).toBe(404);
  const tasks = (await (await request.get("/api/tasks")).json()).data;
  expect(tasks.filter((task: { projectId: string }) => task.projectId === p.id)).toHaveLength(0);
});

test("completed real Example uses real thumbnails and opens without model submissions", async ({
  page,
  request,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/tasks$|\/storyboard$|\/first-cut$/.test(new URL(r.url()).pathname)
    )
      writes.push(r.url());
  });
  await page.goto("/");
  const example = page.getByTestId("project-card-example-morning-brew-v1");
  await expect(example).toContainText("Draft ready");
  const image = example.locator("img");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await example.getByRole("link").click();
  const video = page.getByLabel("First cut preview", { exact: true });
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("link", { name: "Export MP4", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Update first cut", exact: true })).toHaveCount(0);
  await expect(page.getByText("Simple cuts only.", { exact: false })).toHaveCount(0);
  const data = (await (await request.get("/api/projects/example-morning-brew-v1")).json()).data;
  expect(data.output.duration).toBeCloseTo(15, 0);
  expect(data.tasks.every((t: { mode: string }) => t.mode === "live")).toBe(true);
  expect(writes).toEqual([]);
  await page.screenshot({ path: "docs/images/example.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("internal analytics separates data sources, removes rating KPI and keeps the mobile view usable", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/projects", {
        headers: { origin: "https://example.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto("/analytics");
  await expect(page.getByTestId("first-cuts-built")).toBeVisible();
  await expect(page.getByTestId("mp4-exports")).toBeVisible();
  await expect(page.getByTestId("average-rating")).toHaveCount(0);
  await page.getByLabel("Analytics provider mode", { exact: true }).selectOption("live");
  await page.getByLabel("Analytics data source", { exact: true }).selectOption("demo");
  await expect(page.getByTestId("success-rate")).toHaveText("100.0%");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good ideas start here.", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.screenshot({ path: "docs/images/mobile.png", fullPage: true });
});

import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Isolated fixture: existing real clips, no new generation, no changes to the daily workspace.
assert.ok(existsSync(".next/BUILD_ID"), "Run npm run build first.");
const directory = mkdtempSync(join(tmpdir(), "frame-demo-"));
const destination = resolve("docs/demo");
mkdirSync(destination, { recursive: true });
const base = "http://127.0.0.1:3300";
const password = randomBytes(24).toString("hex");
const environment = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: `file:${join(directory, "studio.db")}`,
  MEDIA_ROOT: join(directory, "media"),
  APP_PASSWORD: password,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  STORYBOARD_PROVIDER: "mock",
  VIDEO_PROVIDER: "mock",
  DASHSCOPE_API_KEY: "",
  OPENAI_API_KEY: "",
  BACH_ACCESS_KEY: "",
  BACH_SECRET_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
  CHECKPOINT_DISABLE: "1",
};
const db = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const segments = [];
const errors = [];
const blocked = [];
let server, browser, context, page, recording, started, playbackAt;
const time = () => (performance.now() - started) / 1000;
const mark = (title, detail) => {
  segments.push({ at: time(), title, detail });
  console.log(`Recording: ${title}`);
};
const run = (binary, args) =>
  execFileSync(binary, args, { stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
const probe = (file) =>
  JSON.parse(run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]));
async function point(locator, click = true) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box, "Demo control must be visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await pause(220);
  if (click) await locator.click();
}
async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await stopped;
}
try {
  for (const script of ["scripts/migrate.mjs", "scripts/seed-example.mjs"])
    execFileSync(process.execPath, [script], { env: environment, stdio: "pipe" });
  // Re-open the saved clips for selection. Their original snapshots and live provenance remain intact.
  await db.projectOutput.deleteMany();
  await db.scene.updateMany({ data: { selectedGenerationTaskId: null } });
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3300"],
    { env: environment, stdio: "ignore" },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Recording server failed to start.");
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await pause(200);
  }
  assert.ok(ready, "Recording server must be ready");
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: directory, size: { width: 1440, height: 900 } },
  });
  context.setDefaultTimeout(15000);
  const login = await context.request.post(`${base}/api/auth`, { data: { password } });
  assert.equal(login.status(), 200);
  // Only this loopback-only recording server uses HTTP. Production deployment still requires HTTPS.
  const cookies = await context.cookies();
  assert.ok(cookies.some((cookie) => cookie.name === "frame-access"));
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, secure: false })));
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin !== base ||
      (request.method() === "POST" &&
        /\/tasks$|\/storyboard$|\/regenerate$|\/retry$/.test(url.pathname))
    ) {
      blocked.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const cursor = document.createElement("div");
      cursor.setAttribute("aria-hidden", "true");
      cursor.style.cssText =
        "position:fixed;width:18px;height:18px;border:2px solid #fff;background:#396e50dd;border-radius:50%;box-shadow:0 0 0 8px #74966c35;z-index:99999;pointer-events:none;left:30px;top:30px;transform:translate(-50%,-50%);transition:box-shadow .15s";
      document.body.append(cursor);
      addEventListener("mousemove", (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      });
      addEventListener("pointerdown", () => {
        cursor.style.boxShadow = "0 0 0 16px #74966c66";
      });
      addEventListener("pointerup", () => {
        cursor.style.boxShadow = "0 0 0 8px #74966c35";
      });
    });
  });
  page = await context.newPage();
  recording = page.video();
  started = performance.now();
  page.on("pageerror", (error) => errors.push(error.message));
  mark(
    "FRAME / BRIEF TO FIRST CUT",
    "A working video creation workspace, from plan to one exportable MP4.",
  );
  await page.goto(`${base}/projects/example-morning-brew-v1`);
  await page.getByTestId("scene-0").waitFor();
  await pause(2600);

  mark(
    "01 / START WITH A MARKETING BRIEF",
    "Walkthrough of a saved project with previously generated Qwen / Wan clips.",
  );
  await point(page.locator(".brief-plan > summary"));
  await expect(page.locator(".brief-plan")).toHaveAttribute("open", "");
  await point(
    page.getByPlaceholder("Describe the story, message, or moment you have in mind…"),
    false,
  );
  await pause(3900);
  await point(page.locator(".brief-plan > summary"));
  await pause(900);

  mark(
    "02 / EDIT THE SHOT, NOT A WALL OF PROMPT TEXT",
    "Structured scene fields compose the exact prompt for the next generation.",
  );
  const scene = page.getByTestId("scene-0");
  const camera = scene.getByLabel("Camera Movement", { exact: true });
  await point(camera);
  await camera.fill("");
  await camera.pressSequentially("Gentle push-in, ending on the subject's calm expression", {
    delay: 32,
  });
  await pause(1400);
  await point(scene.getByText("Advanced · Prompt & override", { exact: true }));
  await point(scene.getByLabel("Final Prompt", { exact: true }), false);
  await expect(scene.getByLabel("Final Prompt", { exact: true })).toHaveValue(/Gentle push-in/);
  await pause(3400);
  await point(scene.getByText("Advanced · Prompt & override", { exact: true }));

  mark(
    "03 / KEEP A SHARED CREATIVE DIRECTION",
    "Identity, product, brand and style guide future generations. Results can vary.",
  );
  await point(page.getByLabel("Character Identity", { exact: true }), false);
  await pause(2000);
  const style = page.locator(".consistency-panel").getByLabel("Visual Style", { exact: true });
  await point(style);
  await style.fill("Cinematic, warm natural light, restrained earth tones.");
  await pause(1600);

  mark(
    "SAVE THE WHOLE PLAN IN ONE PLACE",
    "Edits guide the next generation. Previously generated clips stay unchanged.",
  );
  await expect(
    page.getByText("Unsaved: Creative Direction, Scenes", { exact: true }),
  ).toBeVisible();
  await point(page.getByRole("button", { name: "Save Plan", exact: true }));
  await expect(page.getByText("All plan changes saved", { exact: true })).toBeVisible();
  await pause(2400);

  mark(
    "04 / CHOOSE A VERSION FOR EACH SCENE",
    "These real clips were generated earlier. This recording makes no model calls.",
  );
  await point(page.getByRole("button", { name: /02\s*Generate & Select/ }));
  for (let i = 0; i < 3; i++) {
    const card = page.getByTestId(`generate-scene-${i}`);
    const video = card.locator("video");
    await point(video, false);
    await video.evaluate(async (el) => {
      el.muted = true;
      await el.play();
    });
    await pause(1800);
    await video.evaluate((el) => el.pause());
    await point(card.getByRole("button", { name: "Use this version", exact: true }));
    await expect(page.getByTestId("selected-version")).toHaveCount(i + 1);
    await pause(850);
  }

  mark(
    "05 / BUILD ONE FIRST CUT",
    "Selected clips are assembled in scene order with their original sound.",
  );
  await point(page.getByRole("button", { name: /03\s*Preview & Export/ }));
  await point(page.getByRole("button", { name: "Build first cut", exact: true }));
  await expect(page.getByText("Up to date", { exact: true })).toBeVisible({ timeout: 60000 });
  const preview = page.getByLabel("First cut preview", { exact: true });
  await point(preview, false);
  await pause(1000);

  mark(
    "WATCH THE PROJECT AS A WHOLE",
    "Three selected scenes. A real 15-second first cut, ready to review.",
  );
  playbackAt = time();
  await preview.evaluate(async (el) => {
    el.muted = true;
    await el.play();
  });
  await pause(15400);
  const duration = await preview.evaluate((el) => el.duration);
  assert.ok(duration >= 14 && duration <= 16);

  mark(
    "06 / EXPORT THE MP4",
    "One downloadable file. Revisit the plan or replace a clip when you want to iterate.",
  );
  const downloadPromise = page.waitForEvent("download");
  await point(page.getByRole("link", { name: "Export MP4", exact: true }));
  const download = await downloadPromise;
  const downloaded = join(directory, "exported-first-cut.mp4");
  await download.saveAs(downloaded);
  assert.equal(readFileSync(downloaded).subarray(4, 8).toString(), "ftyp");
  assert.ok(Number(probe(downloaded).format.duration) > 14);
  await preview.evaluate((el) => {
    el.currentTime = 0;
  });
  await pause(2800);
  mark(
    "FRAME / PLAN. CHOOSE. PREVIEW. EXPORT.",
    "Next.js · TypeScript · Prisma / SQLite · Provider adapters · Local FFmpeg",
  );
  await pause(3000);
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  await context.close();
  context = null;
  const source = await recording.path();
  const sourceDuration = Number(probe(source).format.duration);
  const font = existsSync("/System/Library/Fonts/Supplemental/Arial.ttf")
    ? "fontfile='/System/Library/Fonts/Supplemental/Arial.ttf':"
    : "font='DejaVu Sans':";
  const filters = ["scale=1280:800", "pad=1280:896:0:0:color=0x18392c"];
  for (const [i, segment] of segments.entries()) {
    const title = join(directory, `title-${i}.txt`),
      detail = join(directory, `detail-${i}.txt`);
    writeFileSync(title, segment.title);
    writeFileSync(detail, segment.detail);
    const to = segments[i + 1]?.at ?? sourceDuration;
    const common = `${font}expansion=none:enable='gte(t,${segment.at.toFixed(3)})*lt(t,${to.toFixed(3)})'`;
    filters.push(`drawtext=${common}:textfile='${title}':fontcolor=white:fontsize=23:x=28:y=817`);
    filters.push(
      `drawtext=${common}:textfile='${detail}':fontcolor=0xd7e6d2:fontsize=17:x=28:y=853`,
    );
  }
  const mp4 = join(destination, "frame-demo.mp4");
  console.log("Encoding H.264 walkthrough…");
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-vf",
    filters.join(","),
    "-an",
    "-r",
    "24",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "26",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  const poster = join(destination, "poster.jpg");
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(playbackAt + 2),
    "-i",
    mp4,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    poster,
  ]);
  const samples = [
    { from: playbackAt + 1, length: 3 },
    { from: segments[1].at + 2, length: 3 },
    { from: segments[2].at + 3, length: 4 },
    { from: segments[5].at + 1, length: 4 },
    { from: segments[6].at + 1, length: 3 },
    { from: playbackAt + 7, length: 3 },
  ];
  const cuts = samples.map(
    (sample, i) =>
      `[0:v]trim=start=${sample.from}:duration=${sample.length},setpts=PTS-STARTPTS[v${i}]`,
  );
  const inputs = samples.map((_, i) => `[v${i}]`).join("");
  const montage = `${cuts.join(";")};${inputs}concat=n=${samples.length}:v=1:a=0,fps=7,scale=960:-1,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;
  console.log("Creating README animation…");
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    mp4,
    "-filter_complex",
    montage,
    "-loop",
    "0",
    join(destination, "preview.gif"),
  ]);
  const output = probe(mp4);
  assert.ok(
    statSync(mp4).size < 10 * 1024 * 1024,
    "MP4 should fit GitHub's 10 MB attachment limit",
  );
  assert.ok(statSync(join(destination, "preview.gif")).size < 10 * 1024 * 1024);
  const report = {
    recordedOn: "2026-10-19",
    durationSeconds: Number(output.format.duration),
    format: "H.264 MP4, 1280×896, 24 fps, silent walkthrough with English callouts",
    source: "Actual production UI in an isolated database; existing real Qwen/Wan example clips",
    noModelCalls: true,
    pageErrors: errors.length,
    verified: [
      "structured edit enters Final Prompt",
      "unified Save Plan persists",
      "three real clip selections",
      "actual FFmpeg first cut",
      "15-second video playback",
      "MP4 download and file header",
    ],
    chapters: segments.map((segment) => ({ ...segment, at: Number(segment.at.toFixed(2)) })),
    mp4Bytes: statSync(mp4).size,
    gifBytes: statSync(join(destination, "preview.gif")).size,
  };
  writeFileSync(join(destination, "recording.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `PASS: ${report.durationSeconds.toFixed(1)}s video, ${(report.mp4Bytes / 1048576).toFixed(1)} MB MP4, ${(report.gifBytes / 1048576).toFixed(1)} MB GIF. No model calls.`,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page
      .screenshot({ path: "/private/tmp/frame-demo-failure.png", fullPage: true })
      .catch(() => {});
    console.error(
      await page
        .locator("main")
        .ariaSnapshot()
        .catch(() => "Recording page unavailable"),
    );
  }
  throw error;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await db.$disconnect();
  await stopServer();
  rmSync(directory, { recursive: true, force: true });
}

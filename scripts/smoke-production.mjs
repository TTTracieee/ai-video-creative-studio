import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

// Ephemeral credentials stay in process memory and are never printed or saved.
const password = randomBytes(24).toString("hex");
const secret = randomBytes(32).toString("hex");
const base = "http://127.0.0.1:3200";
const directory = mkdtempSync(join(tmpdir(), "frame-production-"));
const environment = {
  ...process.env,
  DATABASE_URL: `file:${join(directory, "studio.db")}`,
  NODE_ENV: "production",
  MEDIA_ROOT: join(directory, "media"),
  APP_PASSWORD: password,
  SESSION_SECRET: secret,
  STORYBOARD_PROVIDER: "mock",
  VIDEO_PROVIDER: "mock",
  NEXT_TELEMETRY_DISABLED: "1",
  CHECKPOINT_DISABLE: "1",
};
const startServer = () =>
  spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3200"],
    {
      env: environment,
      stdio: "ignore",
    },
  );
let server;
async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await exited;
}
async function waitReady() {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("Production server exited before becoming ready.");
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(200);
  }
  assert.ok(ready, "Production server must become ready");
}
try {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: environment, stdio: "ignore" });
  server = startServer();
  await waitReady();
  assert.equal((await fetch(`${base}/api/media/outputs/permission-check?download=1`)).status, 401);
  assert.equal((await fetch(`${base}/api/media/thumbnails/permission-check`)).status, 401);
  const protectedExample = await fetch(`${base}/examples/morning-brew/first-cut.mp4`, {
    redirect: "manual",
  });
  assert.equal(protectedExample.status, 307);
  const page = await fetch(base, { redirect: "manual" });
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get("location"), base).pathname, "/login");
  assert.equal((await fetch(`${base}/api/projects`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/projects/permission-check-only`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: 0 }),
      })
    ).status,
    401,
  );
  const wrong = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "incorrect-synthetic-password" }),
  });
  assert.equal(wrong.status, 401);
  const login = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.ok(
    setCookie.includes("HttpOnly") &&
      setCookie.includes("Secure") &&
      setCookie.includes("SameSite=lax"),
  );
  const cookie = setCookie.split(";")[0];
  const projects = await fetch(`${base}/api/projects`, { headers: { cookie } });
  assert.equal(projects.status, 200);
  const config = await fetch(`${base}/api/config`, { headers: { cookie } });
  assert.equal(config.status, 200);
  const configText = await config.text();
  assert.ok(!configText.includes(password) && !configText.includes(secret));
  const blocked = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: { cookie, origin: "https://example.invalid", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(blocked.status, 403);
  async function api(path, method = "GET", body) {
    const response = await fetch(`${base}/api/${path}`, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  }
  const brief = {
    brandName: "Production smoke fixture",
    productDescription: "A synthetic coffee fixture",
    targetAudience: "Test audience",
    marketingObjective: "Test workflow",
    creativeConcept: "A morning coffee ritual",
    visualStyle: "Cinematic",
    duration: 15,
    aspectRatio: "9:16",
    targetPlatform: "Instagram",
  };
  const created = await api("projects", "POST", { brief, origin: "demo" });
  const board = await api(`projects/${created.id}/storyboard`, "POST", { revision: 0 });
  const tasks = await api(`projects/${created.id}/tasks`, "POST", {
    revision: board.revision,
    sceneIds: board.scenes.map((scene) => scene.id),
    idempotencyKey: randomUUID(),
  });
  const task = tasks[0];
  assert.equal(task.status, "pending");
  await stopServer();
  server = startServer();
  await waitReady();
  const recovered = await api(`projects/${created.id}`);
  assert.equal(recovered.scenes.length, 3);
  assert.ok(recovered.tasks.some((t) => t.id === task.id));
  await setTimeout(Math.max(0, new Date(task.createdAt).getTime() + 6500 - Date.now()));
  const completed = await api(`tasks/${task.id}/sync`, "POST", {});
  assert.equal(completed.status, "completed");
  assert.equal(completed.resultUrl, "/mock/portrait.mp4");
  for (const another of tasks.slice(1)) await api(`tasks/${another.id}/sync`, "POST", {});
  const chosen = await api(`projects/${created.id}`);
  assert.equal(chosen.progress.selectedCount, 3);
  const cut = await api(`projects/${created.id}/first-cut`, "POST", { revision: chosen.revision });
  assert.equal(cut.status, "completed");
  const thumbnail = await fetch(`${base}/api/media/thumbnails/${task.id}`, { headers: { cookie } });
  assert.equal(thumbnail.status, 200);
  assert.equal(thumbnail.headers.get("content-type"), "image/jpeg");
  assert.equal(
    Buffer.from(await thumbnail.arrayBuffer())
      .subarray(0, 2)
      .toString("hex"),
    "ffd8",
  );
  const reused = await api(`projects/${created.id}/first-cut`, "POST", {
    revision: chosen.revision,
  });
  assert.equal(reused.id, cut.id);
  const trackedUrl = `${base}/api/media/outputs/${cut.id}?download=1&exportId=${randomUUID()}`;
  for (let i = 0; i < 2; i++) {
    const tracked = await fetch(trackedUrl, { headers: { cookie, range: "bytes=0-31" } });
    assert.equal(tracked.status, 206);
    await tracked.arrayBuffer();
  }
  await fetch(trackedUrl, { method: "HEAD", headers: { cookie } });
  const metrics = await api("analytics?mode=mock&origin=demo");
  assert.equal(metrics.firstCutsBuilt, 1);
  assert.equal(metrics.mp4Exports, 1);
  const mediaUrl = `${base}/api/media/outputs/${cut.id}?download=1`;
  assert.equal((await fetch(mediaUrl)).status, 401);
  const range = await fetch(mediaUrl, { headers: { cookie, range: "bytes=0-31" } });
  assert.equal(range.status, 206);
  assert.ok(range.headers.get("content-disposition").includes("first-cut.mp4"));
  assert.equal(
    Buffer.from(await range.arrayBuffer())
      .subarray(4, 8)
      .toString(),
    "ftyp",
  );
  const head = await fetch(mediaUrl, { method: "HEAD", headers: { cookie } });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get("content-length")) > 32);
  await stopServer();
  server = startServer();
  await waitReady();
  const restoredCut = await api(`projects/${created.id}`);
  assert.equal(restoredCut.output.id, cut.id);
  assert.equal(restoredCut.outputIsCurrent, true);
  assert.equal((await fetch(mediaUrl, { headers: { cookie, range: "bytes=0-31" } })).status, 206);
  const logout = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });
  assert.equal(logout.status, 200);
  const cleared = logout.headers.get("set-cookie");
  assert.ok(/max-age=0/i.test(cleared) || /expires=Thu, 01 Jan 1970/i.test(cleared));
  console.log(
    "PASS: production access protection, login, secure cookies, secret isolation, origin protection, process restart with project/task/selection/output recovery, protected JPEG thumbnails, MP4 range/download/HEAD, build/export event deduplication, and logout (isolated database).",
  );
} finally {
  await stopServer();
  rmSync(directory, { recursive: true, force: true });
}

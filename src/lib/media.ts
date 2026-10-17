import { createReadStream } from "node:fs";
import { access, mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { GenerationTask, PrismaClient } from "@prisma/client";
import { AppError } from "./domain";

const run = promisify(execFile);
export function mediaRoot() {
  return resolve(process.env.MEDIA_ROOT || ".local-media");
}
function safeId(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value))
    throw new AppError("INVALID_MEDIA", "Invalid media identifier.");
  return value;
}
export function mediaPath(key: string) {
  const root =
    key.startsWith("/examples/") || key.startsWith("/mock/") ? resolve("public") : mediaRoot();
  const path = resolve(root, key.replace(/^\//, ""));
  if (!path.startsWith(root + sep)) throw new AppError("INVALID_MEDIA", "Invalid media path.");
  return path;
}
async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function cacheClip(db: PrismaClient, task: GenerationTask): Promise<string> {
  if (task.status !== "completed" || !task.resultUrl)
    throw new AppError("CLIP_NOT_READY", "Choose a completed clip before assembling.", 409);
  if (task.localMediaPath && (await exists(mediaPath(task.localMediaPath))))
    return mediaPath(task.localMediaPath);
  if (task.resultUrl.startsWith("/examples/") || task.resultUrl.startsWith("/mock/")) {
    const path = mediaPath(task.resultUrl);
    if (!(await exists(path)))
      throw new AppError(
        "MEDIA_UNAVAILABLE",
        "This clip is unavailable. Choose another version.",
        422,
      );
    return path;
  }
  const url = new URL(task.resultUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new AppError("INVALID_MEDIA", "The clip has an invalid source URL.", 422);
  const key = `${safeId(task.projectId)}/clips/${safeId(task.id)}.mp4`;
  const destination = mediaPath(key);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.part`;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error("Source unavailable");
    const file = await open(temporary, "wx");
    const reader = response.body.getReader();
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 100 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Clip too large");
        }
        await file.writeFile(chunk.value);
      }
    } finally {
      await file.close();
      reader.releaseLock();
    }
    if (!size) throw new Error("Empty clip");
    await rename(temporary, destination);
    await db.generationTask.update({ where: { id: task.id }, data: { localMediaPath: key } });
    return destination;
  } catch {
    await rm(temporary, { force: true }).catch(() => {});
    throw new AppError(
      "MEDIA_UNAVAILABLE",
      "Could not load this clip. Its source link may have expired. Choose another version or generate a replacement.",
      422,
    );
  }
}

export async function probeMedia(path: string) {
  try {
    const { stdout } = await run(
      process.env.FFPROBE_PATH || "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    const data = JSON.parse(stdout);
    const video = data.streams?.find(
      (stream: { codec_type: string }) => stream.codec_type === "video",
    );
    const duration = Number(video?.duration || data.format?.duration);
    if (!video || !Number.isFinite(duration) || duration <= 0 || duration > 360)
      throw new Error("Invalid video");
    return {
      duration,
      hasAudio: data.streams.some(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      ) as boolean,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new AppError(
        "FFMPEG_MISSING",
        "Install FFmpeg and ffprobe to build a first cut on this computer.",
        503,
      );
    throw new AppError(
      "INVALID_VIDEO",
      "A selected clip could not be read. Choose another version.",
      422,
    );
  }
}

export async function concatenateClips(paths: string[], destination: string, aspectRatio: string) {
  const work = `${destination}.work`;
  await mkdir(work, { recursive: true });
  const sizes: Record<string, [number, number]> = {
    "9:16": [480, 854],
    "16:9": [854, 480],
    "1:1": [640, 640],
  };
  const [width, height] = sizes[aspectRatio] || sizes["9:16"];
  try {
    for (const [index, path] of paths.entries()) {
      const metadata = await probeMedia(path);
      if (metadata.duration > 31)
        throw new AppError(
          "INVALID_VIDEO",
          "Each selected clip must be at most 30 seconds long.",
          422,
        );
      // Normalize streams so independently generated clips can be concatenated safely.
      const audio = metadata.hasAudio ? ["-map", "0:a:0"] : ["-map", "1:a:0"];
      await run(
        process.env.FFMPEG_PATH || "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-y",
          "-i",
          path,
          ...(!metadata.hasAudio
            ? ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
            : []),
          "-map",
          "0:v:0",
          ...audio,
          "-vf",
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
          "-af",
          "aresample=48000,apad",
          "-t",
          String(metadata.duration),
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          join(work, `${index}.mp4`),
        ],
        { timeout: 90000, maxBuffer: 1024 * 1024 },
      );
    }
    await writeFile(
      join(work, "clips.txt"),
      paths.map((_, index) => `file '${index}.mp4'`).join("\n"),
    );
    await run(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        join(work, "clips.txt"),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        `${destination}.part.mp4`,
      ],
      { timeout: 90000, maxBuffer: 1024 * 1024 },
    );
    await rename(`${destination}.part.mp4`, destination);
    return (await probeMedia(destination)).duration;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new AppError(
        "FFMPEG_MISSING",
        "Install FFmpeg and ffprobe to build a first cut on this computer.",
        503,
      );
    throw new AppError(
      "ASSEMBLY_FAILED",
      "The first cut could not be built. Your selected clips are preserved; try rebuilding.",
      422,
    );
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(`${destination}.part.mp4`, { force: true }).catch(() => {});
  }
}

export async function removeProjectMedia(id: string) {
  await rm(join(mediaRoot(), safeId(id)), { recursive: true, force: true });
}

export async function videoResponse(path: string, request: Request, filename = "first-cut.mp4") {
  let size;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new AppError(
      "MEDIA_UNAVAILABLE",
      "The video file is unavailable. Rebuild the first cut or choose another clip.",
      404,
    );
  }
  if (!size)
    throw new AppError("MEDIA_UNAVAILABLE", "The video file is empty. Rebuild the first cut.", 404);
  let start = 0,
    end = size - 1;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Content-Length": String(end - start + 1),
    "Cache-Control": "private, no-store",
  });
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  if (new URL(request.url).searchParams.get("download") === "1")
    headers.set(
      "Content-Disposition",
      `attachment; filename="first-cut.mp4"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
    );
  return new Response(
    request.method === "HEAD"
      ? null
      : (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>),
    { status: range ? 206 : 200, headers },
  );
}

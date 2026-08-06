/**
 * video-frame-extractor — sample still frames out of a generated video so the
 * AGENT CAN SEE WHAT IT MADE (Director Roadmap V1, finding F1: video was
 * fire-and-forget and the agent never observed a single frame).
 *
 * Raw ffmpeg spawn — no fluent wrapper. Binary resolution order:
 *   1. FFMPEG_PATH env override
 *   2. @ffmpeg-installer/ffmpeg (bundled per-platform binary)
 *   3. `ffmpeg` on PATH
 * Duration is parsed from ffmpeg's own `-i` banner (no ffprobe dependency —
 * the installer package ships ffmpeg only).
 *
 * Also the foundation for MP4 export (V4), the Seedance E2 explorer, and the
 * audio mux — ffmpeg enters the codebase once, here.
 */
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";

let cachedFfmpegPath: string | null = null;

export function resolveFfmpegPath(): string {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    cachedFfmpegPath = process.env.FFMPEG_PATH;
    return cachedFfmpegPath;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const installer = require("@ffmpeg-installer/ffmpeg");
    if (installer?.path && fs.existsSync(installer.path)) {
      cachedFfmpegPath = installer.path as string;
      return cachedFfmpegPath;
    }
  } catch { /* package not installed — fall through to PATH */ }
  cachedFfmpegPath = "ffmpeg";
  return cachedFfmpegPath;
}

function runFfmpeg(args: string[], timeoutMs = 30_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(resolveFfmpegPath(), args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      // ffmpeg exits 1 for `-i` with no output file — that's still a useful
      // banner read, so only reject when we got no stderr to parse.
      if (err && !stderr) return reject(err);
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Parse `Duration: 00:00:08.02` out of the ffmpeg -i banner. */
export async function getVideoDurationSec(videoPath: string): Promise<number | null> {
  try {
    const { stderr } = await runFfmpeg(["-hide_banner", "-i", videoPath]);
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return null;
    return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
  } catch {
    return null;
  }
}

export interface VideoMeta {
  durationSec: number | null;
  /** Frames per second, e.g. 24, 25, 29.97. Null when the banner carries no fps. */
  fps: number | null;
  /** durationSec × fps, rounded — an estimate, not a container frame count. */
  frameCount: number | null;
}

/**
 * Duration + fps + frame count from the ffmpeg -i banner (still no ffprobe —
 * the banner's video-stream line carries `..., 24 fps, ...`). Lets the watch
 * tools speak in frames, not just seconds.
 */
export async function getVideoMeta(videoPath: string): Promise<VideoMeta> {
  try {
    const { stderr } = await runFfmpeg(["-hide_banner", "-i", videoPath]);
    const dm = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const durationSec = dm ? parseInt(dm[1], 10) * 3600 + parseInt(dm[2], 10) * 60 + parseFloat(dm[3]) : null;
    const fm = stderr.match(/(\d+(?:\.\d+)?)\s*fps/);
    const fps = fm ? parseFloat(fm[1]) : null;
    const frameCount = durationSec != null && fps != null ? Math.round(durationSec * fps) : null;
    return { durationSec, fps, frameCount };
  } catch {
    return { durationSec: null, fps: null, frameCount: null };
  }
}

/**
 * Cut a sub-second-accurate window out of a video into a DETERMINISTIC cache —
 * key is (video basename, centisecond in/out). Re-encodes (`-ss` after `-i`
 * would be frame-exact but slow; `-ss` before `-i` + re-encode gives accurate
 * cut points at keyframe-independent positions). Audio is kept. This is what
 * lets watch tools attach exactly the window in question natively instead of
 * whole-second videoMetadata offsets.
 */
export async function extractWindowCached(videoPath: string, inSec: number, outSec: number, outputDir: string): Promise<string> {
  if (!fs.existsSync(videoPath)) throw new Error(`extractWindowCached: video not found: ${videoPath}`);
  if (!(outSec > inSec)) throw new Error(`extractWindowCached: bad window ${inSec}–${outSec}`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const a = Math.max(0, Math.round(inSec * 100) / 100);
  const b = Math.round(outSec * 100) / 100;
  const base = path.basename(videoPath).replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(outputDir, `${base}_win${Math.round(a * 100)}_${Math.round(b * 100)}.mp4`);
  if (fs.existsSync(filePath)) return filePath;
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error",
    "-ss", String(a),
    "-i", videoPath,
    "-t", String(Math.round((b - a) * 100) / 100),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-y", filePath,
  ], 120_000);
  if (!fs.existsSync(filePath)) throw new Error(`extractWindowCached: ffmpeg produced no window ${a}–${b}s from ${path.basename(videoPath)}`);
  return filePath;
}

export interface ExtractedFrame {
  /** Seconds into the source video this frame was sampled at. */
  timeSec: number;
  fileName: string;
  filePath: string;
}

export interface ExtractFramesOptions {
  /** Evenly-sampled frame count (first + last + spread). Default 6. Ignored if timestamps given. */
  count?: number;
  /** Explicit sample points in seconds (overrides count). */
  timestamps?: number[];
  /** Where the jpegs land (created if missing). */
  outputDir: string;
  /** Filename prefix. Default 'vframe'. */
  prefix?: string;
  /** Output width in px (height keeps aspect). Default 640 — compact enough to attach several to a model turn. */
  width?: number;
}

/**
 * Sample frames from a video. One ffmpeg invocation per timestamp (`-ss` fast
 * seek before `-i`), run in parallel — 6–8 frames from an 8s clip lands in
 * well under a second on a laptop.
 */
export async function extractFrames(videoPath: string, opts: ExtractFramesOptions): Promise<ExtractedFrame[]> {
  if (!fs.existsSync(videoPath)) throw new Error(`extractFrames: video not found: ${videoPath}`);
  const outputDir = opts.outputDir;
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const prefix = opts.prefix ?? "vframe";
  const width = opts.width ?? 640;

  let timestamps = opts.timestamps;
  if (!timestamps || timestamps.length === 0) {
    const duration = (await getVideoDurationSec(videoPath)) ?? 5;
    const count = Math.max(1, Math.min(opts.count ?? 6, 16));
    // First frame just after 0 (0.0 can land on a black lead-in), last just
    // before the end (seeking exactly to duration yields nothing).
    const first = Math.min(0.05, duration * 0.01);
    const last = Math.max(first, duration - 0.15);
    timestamps = count === 1
      ? [first]
      : Array.from({ length: count }, (_, i) => first + (i * (last - first)) / (count - 1));
  }

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const jobs = timestamps.map(async (t, i): Promise<ExtractedFrame | null> => {
    const timeSec = Math.max(0, Math.round(t * 100) / 100);
    const fileName = `${prefix}_${runId}_${i + 1}_${String(timeSec).replace(".", "p")}s.jpg`;
    const filePath = path.join(outputDir, fileName);
    try {
      await runFfmpeg([
        "-hide_banner", "-loglevel", "error",
        "-ss", String(timeSec),
        "-i", videoPath,
        "-frames:v", "1",
        "-vf", `scale=${width}:-2`,
        "-q:v", "3",
        "-y", filePath,
      ]);
      return fs.existsSync(filePath) ? { timeSec, fileName, filePath } : null;
    } catch (err: any) {
      console.error(`extractFrames: failed at ${timeSec}s: ${err.message}`);
      return null;
    }
  });

  const frames = (await Promise.all(jobs)).filter((f): f is ExtractedFrame => f !== null);
  if (frames.length === 0) throw new Error(`extractFrames: ffmpeg produced no frames from ${path.basename(videoPath)}`);
  return frames;
}

/**
 * One frame at one timestamp with a DETERMINISTIC filename — the cache key is
 * (video basename, centisecond timestamp, width), so repeat requests serve the
 * existing jpg without touching ffmpeg. Used by the timeline's take-lane
 * filmstrip (a frame per shot-cut point) and anything else that wants cheap
 * repeatable video stills.
 */
export async function extractFrameAtCached(videoPath: string, timeSec: number, outputDir: string, width = 480): Promise<string> {
  if (!fs.existsSync(videoPath)) throw new Error(`extractFrameAtCached: video not found: ${videoPath}`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const t = Math.max(0, Math.round(timeSec * 100) / 100);
  const base = path.basename(videoPath).replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(outputDir, `${base}_t${Math.round(t * 100)}_w${width}.jpg`);
  if (fs.existsSync(filePath)) return filePath;
  // 0.0 often lands on a black lead-in frame; nudge in a hair.
  const seek = t < 0.05 ? 0.05 : t;
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error",
    "-ss", String(seek),
    "-i", videoPath,
    "-frames:v", "1",
    "-vf", `scale=${width}:-2`,
    "-q:v", "3",
    "-y", filePath,
  ]);
  if (!fs.existsSync(filePath)) throw new Error(`extractFrameAtCached: ffmpeg produced no frame at ${t}s from ${path.basename(videoPath)}`);
  return filePath;
}

/**
 * film-exporter — turn the timeline into ONE watchable MP4 (Director Roadmap
 * V4a: the deliverable). Two-pass ffmpeg:
 *
 *   1. NORMALIZE each timeline segment to an intermediate mp4 with identical
 *      codec parameters (h264 yuv420p @ fps, aac 48k stereo, WxH letterboxed):
 *      - video clips: trimmed to their virtual-chop window [inSec, inSec+dur)
 *        — the chop finally becomes physical here, and ONLY here.
 *      - stills: looped for the clip's duration.
 *      - silent audio is synthesized (anullsrc) wherever a source has none, so
 *        every segment carries the same stream layout.
 *   2. CONCAT the normalized segments with the concat demuxer + stream copy —
 *      identical params make this lossless and instant.
 *
 * Serial and synchronous-per-segment by design; a 20-clip cut normalizes in
 * well under a minute on a laptop.
 */
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { resolveFfmpegPath } from "./video-frame-extractor";

export type ExportSegment =
  | { kind: "video"; sourcePath: string; inSec: number; durationSec: number; label?: string }
  | { kind: "still"; sourcePath: string; durationSec: number; label?: string };

export interface ExportOptions {
  segments: ExportSegment[];
  outputDir: string;
  fileName: string;
  /** Target frame size (letterboxed/pillarboxed as needed). */
  width: number;
  height: number;
  fps?: number;
  /** Optional continuous music bed: looped under the whole film (hides
   *  per-clip audio seams). Original clip audio ducks under it. */
  musicPath?: string;
  musicBedLevel?: number;      // default 0.85
  originalAudioLevel?: number; // default 0.35
  onProgress?: (done: number, total: number, stage: string) => void;
}

function runFfmpeg(args: string[], timeoutMs = 180_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(resolveFfmpegPath(), args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !String(stderr).length) return reject(err);
      if (err && !/muxing overhead|frames? successfully/.test(String(stderr)) && err.code !== 0 && err.code !== 1) {
        // execFile errors carry stderr — surface the tail (the useful part).
        return reject(new Error(String(stderr).split("\n").slice(-6).join("\n")));
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Audio file duration from the -i banner (null if unparseable). */
async function getBedDuration(p: string): Promise<number | null> {
  try {
    const { stderr } = await runFfmpeg(["-hide_banner", "-i", p], 30_000);
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    return m ? parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]) : null;
  } catch { return null; }
}

/** Does the file carry an audio stream? (parsed from the -i banner) */
async function hasAudioStream(sourcePath: string): Promise<boolean> {
  try {
    const { stderr } = await runFfmpeg(["-hide_banner", "-i", sourcePath], 30_000);
    return /Stream #\d+:\d+.*Audio:/.test(stderr);
  } catch {
    return false;
  }
}

export async function exportSegmentsToMp4(opts: ExportOptions): Promise<{ filePath: string; fileName: string; durationSec: number; warnings: string[] }> {
  const { segments, outputDir, fileName } = opts;
  if (segments.length === 0) throw new Error("export: no segments to export");
  const fps = opts.fps ?? 24;
  const W = opts.width;
  const H = opts.height;
  const warnings: string[] = [];

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(outputDir, ".export_work_"));
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=yuv420p`;
  const encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2"];

  try {
    const partPaths: string[] = [];
    let totalDur = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      opts.onProgress?.(i, segments.length, `normalizing ${seg.label || `segment ${i + 1}`}`);
      if (!fs.existsSync(seg.sourcePath)) {
        warnings.push(`segment ${i + 1} (${seg.label || "unlabeled"}): source missing on disk — skipped`);
        continue;
      }
      const dur = Math.max(0.1, seg.durationSec);
      const partPath = path.join(workDir, `part_${String(i).padStart(3, "0")}.mp4`);

      if (seg.kind === "still") {
        // Looped still + synthesized silence.
        await runFfmpeg([
          "-hide_banner", "-loglevel", "error",
          "-loop", "1", "-t", String(dur), "-i", seg.sourcePath,
          "-f", "lavfi", "-t", String(dur), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
          "-map", "0:v", "-map", "1:a",
          "-vf", vf, ...encode, "-shortest", "-y", partPath,
        ]);
      } else {
        const audio = await hasAudioStream(seg.sourcePath);
        if (audio) {
          await runFfmpeg([
            "-hide_banner", "-loglevel", "error",
            "-ss", String(Math.max(0, seg.inSec)), "-t", String(dur), "-i", seg.sourcePath,
            "-vf", vf, ...encode, "-y", partPath,
          ]);
        } else {
          await runFfmpeg([
            "-hide_banner", "-loglevel", "error",
            "-ss", String(Math.max(0, seg.inSec)), "-t", String(dur), "-i", seg.sourcePath,
            "-f", "lavfi", "-t", String(dur), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map", "0:v", "-map", "1:a",
            "-vf", vf, ...encode, "-shortest", "-y", partPath,
          ]);
        }
      }
      if (!fs.existsSync(partPath)) {
        warnings.push(`segment ${i + 1} (${seg.label || "unlabeled"}): normalize produced no output — skipped`);
        continue;
      }
      partPaths.push(partPath);
      totalDur += dur;
    }

    if (partPaths.length === 0) throw new Error("export: every segment failed to normalize");

    // Concat with stream copy (identical params → lossless).
    opts.onProgress?.(segments.length, segments.length, "concatenating");
    const listPath = path.join(workDir, "concat.txt");
    fs.writeFileSync(listPath, partPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
    const filePath = path.join(outputDir, fileName);
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", listPath,
      "-c", "copy", "-movflags", "+faststart", "-y", filePath,
    ]);
    if (!fs.existsSync(filePath)) throw new Error("export: concat produced no output");

    // MUSIC MUX: loop the bed under the whole film, duck the clip audio.
    if (opts.musicPath && fs.existsSync(opts.musicPath)) {
      opts.onProgress?.(segments.length, segments.length, "scoring (music mux)");
      const bed = opts.musicBedLevel ?? 0.85;
      const orig = opts.originalAudioLevel ?? 0.35;
      const scored = path.join(workDir, "scored.mp4");
      // Looping with CROSSFADES (a hard stream_loop repeat is jarring): chain
      // enough copies of the bed with 3s acrossfades to cover the film. A bed
      // already longer than the film passes through a single copy untouched.
      const bedDurRaw = await getBedDuration(opts.musicPath);
      const bedDur = Math.max(4, bedDurRaw ?? 30);
      const XF = 3;
      const copies = bedDur >= totalDur ? 1 : Math.ceil((totalDur - bedDur) / (bedDur - XF)) + 1;
      const inputs: string[] = [];
      for (let c = 0; c < copies; c++) { inputs.push("-i", opts.musicPath); }
      let chain = "";
      let prev = "1:a";
      for (let c = 1; c < copies; c++) {
        const outLbl = `x${c}`;
        chain += `[${prev}][${c + 1}:a]acrossfade=d=${XF}:c1=tri:c2=tri[${outLbl}];`;
        prev = outLbl;
      }
      await runFfmpeg([
        "-hide_banner", "-loglevel", "error",
        "-i", filePath,
        ...inputs,
        "-filter_complex", `[0:a]volume=${orig}[o];${chain}[${prev}]volume=${bed},afade=t=out:st=${Math.max(0, totalDur - 2.5)}:d=2.5[m];[o][m]amix=inputs=2:duration=first:dropout_transition=0[a]`,
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-shortest",
        "-movflags", "+faststart", "-y", scored,
      ]);
      if (fs.existsSync(scored)) fs.copyFileSync(scored, filePath);
      else warnings.push("music mux failed — exported without the bed");
    }

    return { filePath, fileName, durationSec: Math.round(totalDur * 100) / 100, warnings };
  } finally {
    // Clean the intermediates regardless of outcome.
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

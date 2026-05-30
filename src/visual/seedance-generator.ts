/**
 * SeedanceGenerator — image-to-video for shots via ByteDance Seedance 2.0 on
 * Replicate. Backend #2, a drop-in sibling to VideoGenerator (Veo) behind the
 * same async job model.
 *
 * Two modes (mutually exclusive, per the Seedance schema):
 *   - SINGLE-SHOT (P1): `image` (first frame) + optional `last_frame_image`
 *     → first→last interpolation, parity with Veo.
 *   - MULTI-SHOT (P3): `reference_images` (up to 9: a storyboard grid + cast +
 *     location) with a prompt that spells out per-shot timing. `image` and
 *     `reference_images` CANNOT be combined.
 *
 * Replicate flow: POST a prediction to the model endpoint, poll until it
 * succeeds, download the output mp4 to outputDir. Long-running (~1–3 min) —
 * the server runs it as a background job.
 *
 * Images: our shot stills live on localhost (not publicly reachable), so we
 * hand Replicate base64 `data:` URIs, which it accepts for file inputs.
 */
import * as fs from "fs";
import * as path from "path";

const SEEDANCE_MODEL = "bytedance/seedance-2.0";
const REPLICATE_API = "https://api.replicate.com/v1";

export type SeedanceResolution = "480p" | "720p" | "1080p";
export type SeedanceAspectRatio =
  | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "9:21" | "adaptive";

export interface SeedanceImageInput {
  /** base64-encoded image bytes (no data: prefix). */
  base64: string;
  mimeType: string;
}

export interface SeedanceVideoOptions {
  prompt: string;
  /** Start frame for image-to-video (single-shot mode). */
  firstFrame?: SeedanceImageInput;
  /** End frame — first→last interpolation. Only honored with a firstFrame. */
  lastFrame?: SeedanceImageInput;
  /** Omni-reference images (multi-shot mode, up to 9). MUTUALLY EXCLUSIVE with
   *  firstFrame — when provided, firstFrame/lastFrame are ignored. */
  referenceImages?: SeedanceImageInput[];
  /** Seconds, 1–15, or -1 for the model's intelligent duration. */
  durationSeconds?: number;
  resolution?: SeedanceResolution;
  aspectRatio?: SeedanceAspectRatio;
  /** Seedance's native synced audio (dialogue/SFX). Off by default for
   *  predictable single-shot output; the sequence path can opt in. */
  generateAudio?: boolean;
  seed?: number;
  onProgress?: (status: string) => void;
}

export interface SeedanceVideoResult {
  fileName: string;
  filePath: string;
  model: string;
  /** True when first→last interpolation was used (single-shot). */
  usedInterpolation: boolean;
  /** True when omni-reference (multi-shot) mode was used. */
  usedReferences: boolean;
}

export class SeedanceGenerator {
  private apiKey: string;
  private outputDir: string;

  constructor(config: { apiKey: string; outputDir: string }) {
    this.apiKey = config.apiKey;
    this.outputDir = config.outputDir;
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  private dataUri(img: SeedanceImageInput): string {
    return `data:${img.mimeType};base64,${img.base64}`;
  }

  /**
   * Generate a video with Seedance 2.0 and save the mp4 to outputDir. Blocks
   * until the prediction completes (run this inside a background job).
   */
  async generateSeedance(opts: SeedanceVideoOptions): Promise<SeedanceVideoResult> {
    const useReferences = Boolean(opts.referenceImages && opts.referenceImages.length > 0);
    const usedInterpolation = !useReferences && Boolean(opts.firstFrame && opts.lastFrame);

    const input: Record<string, any> = {
      prompt: opts.prompt,
      duration: typeof opts.durationSeconds === "number" ? opts.durationSeconds : 5,
      resolution: opts.resolution || "720p",
      aspect_ratio: opts.aspectRatio || "16:9",
      generate_audio: opts.generateAudio ?? false,
      ...(typeof opts.seed === "number" ? { seed: opts.seed } : {}),
    };
    if (useReferences) {
      // Omni-reference (multi-shot) mode — references replace the first frame.
      input.reference_images = opts.referenceImages!.slice(0, 9).map((i) => this.dataUri(i));
    } else if (opts.firstFrame) {
      input.image = this.dataUri(opts.firstFrame);
      if (opts.lastFrame) input.last_frame_image = this.dataUri(opts.lastFrame);
    }

    // Create the prediction (model-scoped endpoint → always the latest version).
    const createResp = await fetch(`${REPLICATE_API}/models/${SEEDANCE_MODEL}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });
    if (!createResp.ok) {
      throw new Error(`Seedance prediction create failed (${createResp.status}): ${await createResp.text()}`);
    }
    let prediction: any = await createResp.json();
    opts.onProgress?.("started");

    const startedAt = Date.now();
    const MAX_MS = 12 * 60 * 1000; // safety cap
    while (prediction?.status && !["succeeded", "failed", "canceled"].includes(prediction.status)) {
      if (Date.now() - startedAt > MAX_MS) {
        throw new Error("Seedance generation timed out after 12 minutes");
      }
      await new Promise((r) => setTimeout(r, 5000));
      const pollUrl = prediction?.urls?.get || `${REPLICATE_API}/predictions/${prediction.id}`;
      const pollResp = await fetch(pollUrl, { headers: { Authorization: `Bearer ${this.apiKey}` } });
      if (!pollResp.ok) throw new Error(`Seedance poll failed (${pollResp.status}): ${await pollResp.text()}`);
      prediction = await pollResp.json();
      opts.onProgress?.("generating");
    }

    if (prediction.status !== "succeeded") {
      throw new Error(`Seedance generation ${prediction.status}: ${prediction.error || "unknown error"}`);
    }
    // Output is a URL string (or an array of them) to the generated mp4.
    const out = prediction.output;
    const videoUrl: string | undefined = Array.isArray(out) ? out[0] : (typeof out === "string" ? out : undefined);
    if (!videoUrl) throw new Error("Seedance returned no video URL");

    const dl = await fetch(videoUrl);
    if (!dl.ok) throw new Error(`Seedance output download failed (${dl.status})`);
    const buf = Buffer.from(await dl.arrayBuffer());
    const fileName = `seedance_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.mp4`;
    const filePath = path.join(this.outputDir, fileName);
    fs.writeFileSync(filePath, buf);
    opts.onProgress?.("downloaded");

    if (!fs.existsSync(filePath)) {
      throw new Error("Seedance video downloaded but file not found on disk");
    }
    return { fileName, filePath, model: SEEDANCE_MODEL, usedInterpolation, usedReferences: useReferences };
  }
}

/**
 * VideoGenerator — image-to-video for shots. Mirrors ImageGenerator's shape.
 *
 * Backend #1: Veo 3.1 via the @google/genai SDK (same GEMINI_API_KEY as Nano
 * Banana). Image-to-video with optional last-frame interpolation — maps a
 * shot's firstFrame/lastFrame keyframes straight onto Veo's image + config.lastFrame.
 *
 * Video generation is LONG-RUNNING (~1–3 min): generateVeo() starts the
 * operation, polls until done, downloads the mp4 to outputDir, and returns the
 * filename. The server runs it as a background job and updates a job registry.
 *
 * Backend #2 (Seedance 2.0 via Replicate) will slot in here as another method
 * behind the same job model — see STUDIO_DESIGN roadmap.
 */
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

export type VideoModel = "veo-3.1" | "veo-3.1-lite";

const VEO_MODEL_IDS: Record<VideoModel, string> = {
  "veo-3.1": "veo-3.1-generate-preview",
  "veo-3.1-lite": "veo-3.1-lite-generate-preview",
};

export interface VideoImageInput {
  /** base64-encoded image bytes (no data: prefix). */
  base64: string;
  mimeType: string;
}

export interface VeoVideoOptions {
  prompt: string;
  /** Start frame for image-to-video. */
  firstFrame?: VideoImageInput;
  /** End frame — triggers first→last interpolation (locks duration to 8s). */
  lastFrame?: VideoImageInput;
  aspectRatio?: string; // Veo currently supports "16:9" | "9:16"
  resolution?: "720p" | "1080p" | "4k";
  durationSeconds?: string;
  model?: VideoModel;
  onProgress?: (status: string) => void;
}

export interface VeoVideoResult {
  fileName: string;
  filePath: string;
  model: string;
  usedInterpolation: boolean;
}

export class VideoGenerator {
  private genAI: GoogleGenAI;
  private outputDir: string;

  constructor(config: { apiKey: string; outputDir: string }) {
    this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
    this.outputDir = config.outputDir;
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /**
   * Generate a video with Veo 3.1 and save the mp4 to outputDir. Blocks until
   * the operation completes (caller should run this in a background job, not
   * inside a request that needs to return quickly).
   */
  async generateVeo(opts: VeoVideoOptions): Promise<VeoVideoResult> {
    const modelId = VEO_MODEL_IDS[opts.model || "veo-3.1"];
    const usedInterpolation = Boolean(opts.firstFrame && opts.lastFrame);

    const config: Record<string, any> = {
      aspectRatio: opts.aspectRatio || "16:9",
      ...(opts.resolution ? { resolution: opts.resolution } : {}),
      // First+last interpolation requires an 8s duration on Veo 3.1.
      durationSeconds: usedInterpolation ? "8" : (opts.durationSeconds || "8"),
      ...(opts.lastFrame
        ? { lastFrame: { imageBytes: opts.lastFrame.base64, mimeType: opts.lastFrame.mimeType } }
        : {}),
    };

    let operation: any = await this.genAI.models.generateVideos({
      model: modelId,
      prompt: opts.prompt,
      ...(opts.firstFrame
        ? { image: { imageBytes: opts.firstFrame.base64, mimeType: opts.firstFrame.mimeType } }
        : {}),
      config,
    });

    opts.onProgress?.("started");
    const startedAt = Date.now();
    const MAX_MS = 10 * 60 * 1000; // safety cap
    while (!operation?.done) {
      if (Date.now() - startedAt > MAX_MS) {
        throw new Error("Veo video generation timed out after 10 minutes");
      }
      await new Promise((r) => setTimeout(r, 10000));
      operation = await this.genAI.operations.getVideosOperation({ operation });
      opts.onProgress?.("generating");
    }

    if (operation.error) {
      const msg = (operation.error as any)?.message || JSON.stringify(operation.error);
      throw new Error(`Veo generation failed: ${msg}`);
    }
    const generated = operation.response?.generatedVideos?.[0]?.video;
    if (!generated) throw new Error("Veo returned no video");

    const fileName = `veo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.mp4`;
    const filePath = path.join(this.outputDir, fileName);
    await this.genAI.files.download({ file: generated, downloadPath: filePath });
    opts.onProgress?.("downloaded");

    if (!fs.existsSync(filePath)) {
      throw new Error("Veo video downloaded but file not found on disk");
    }
    return { fileName, filePath, model: modelId, usedInterpolation };
  }
}

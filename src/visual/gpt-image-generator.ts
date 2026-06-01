/**
 * GptImageGenerator — OpenAI image generation wrapper (gpt-image-2 + gpt-image-1)
 *
 * Parallel surface to ImageGenerator (the Nano Banana wrapper) so /render
 * can swap between backends. Same generateImage(prompt, references, options)
 * shape, same GeneratedImage return.
 *
 * Dual-model routing:
 *   - generations (text-only)  → gpt-image-2 by default. Latest capabilities,
 *     2K native + up to 4K, ~99% text accuracy, O-series reasoning.
 *   - edits (multi-reference)  → gpt-image-2 by default (now supported on
 *     /edits per its model card; the earlier validation block is gone).
 *     gpt-image-1 remains the auto-fallback. Up to 16 reference images.
 *     NOTE: input_fidelity:"high" (preserve the style/identity of the ref
 *     images) is only accepted by the gpt-image-1 FAMILY (1, 1.5, 1-mini) —
 *     gpt-image-2 rejects it. We send it only where supported. For the
 *     strongest style-lock from refs, set OPENAI_IMAGE_MODEL_EDIT=gpt-image-1.5
 *     (gets high fidelity); leave it gpt-image-2 for the stronger base model
 *     without fidelity control. Override via:
 *       OPENAI_IMAGE_MODEL_GENERATE (default: gpt-image-2)
 *       OPENAI_IMAGE_MODEL_EDIT     (default: gpt-image-2)
 *
 * Strengths over Nano Banana:
 * - Long detailed prompts (better instruction following)
 * - Multi-panel boards (storyboard pages, casting sheets, mood boards)
 * - Text rendering inside images (~99% character accuracy on gpt-image-2)
 * - Initial concept exploration before a project's style is locked
 * - Higher native output resolution (2K standard, up to 4K)
 *
 * Tradeoffs:
 * - Slower per call than Nano
 * - More expensive (image input $8/1M tokens, output $30/1M tokens)
 * - No transparent backgrounds, max 50MB total request size
 */

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { toFile } from "openai";
import { GeneratedImage } from "./types";
import type { AspectRatio, ImageSize, ReferenceImage } from "./image-generator";

const isTestEnv = process.env.NODE_ENV === "test";
const log = (...args: unknown[]) => {
  if (!isTestEnv) console.log(...args);
};
const logError = (...args: unknown[]) => {
  if (!isTestEnv) console.error(...args);
};

export type GptImageQuality = "low" | "medium" | "high" | "auto";

export interface GptImageGeneratorConfig {
  apiKey: string;
  outputDir?: string;
  defaultQuality?: GptImageQuality;
  /** Model id for the generations endpoint (text-only). Defaults to env or gpt-image-2. */
  generateModel?: string;
  /** Model id for the edits endpoint (with references). Defaults to env or gpt-image-1. */
  editModel?: string;
}

/**
 * Map a generic aspect-ratio string to a gpt-image SUPPORTED size. The
 * generations + edits endpoints only accept a fixed set:
 *   1024x1024 (square) · 1536x1024 (landscape) · 1024x1536 (portrait) · auto.
 * (Earlier 2K/3K sizes were rejected — "Invalid size '3072x2048'".) We pick the
 * nearest orientation; downscaling/upscaling happens later in the pipeline.
 */
function aspectToGptSize(aspectRatio?: AspectRatio): string {
  if (!aspectRatio) return "1024x1024";
  const [w, h] = aspectRatio.split(":").map((n) => parseInt(n, 10));
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  if (ratio > 1.2) return "1536x1024"; // landscape (16:9, 21:9, 3:2, 4:3)
  if (ratio < 0.85) return "1024x1536"; // portrait (9:16, 2:3, 3:4, 4:5)
  return "1024x1024"; // square (1:1, anything close)
}

/** Detect the "model not allowed on this endpoint" error so we can fall back. */
function isModelValidationError(err: any): boolean {
  const msg = String(err?.message || err?.error?.message || "").toLowerCase();
  return (
    msg.includes("must be") ||
    msg.includes("invalid value") ||
    msg.includes("does not exist") ||
    msg.includes("not allowed") ||
    msg.includes("not supported")
  );
}

export class GptImageGenerator {
  private openai: OpenAI;
  private outputDir: string;
  private defaultQuality: GptImageQuality;
  private generateModel: string;
  private editModel: string;
  /** Falls back here on edit-endpoint validation errors. Hard-coded because
   *  it's known to work on /edits as of the gpt-image-2 release. */
  private editFallbackModel = "gpt-image-1";

  constructor(config: GptImageGeneratorConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.outputDir = config.outputDir || path.join(process.cwd(), ".narrative-data", "generated-images");
    this.defaultQuality = config.defaultQuality || "high";
    this.generateModel = config.generateModel || process.env.OPENAI_IMAGE_MODEL_GENERATE || "gpt-image-2";
    // gpt-image-2 now works on /edits (per its model card) — use it so style-ref
    // renders get the same (better) model as generations, with input_fidelity.
    // gpt-image-1 stays as the auto-fallback if a validation error ever returns.
    this.editModel = config.editModel || process.env.OPENAI_IMAGE_MODEL_EDIT || "gpt-image-2";
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  async generateImage(
    prompt: string,
    references?: ReferenceImage[],
    options?: {
      aspectRatio?: AspectRatio;
      imageSize?: ImageSize; // mapped to gpt size string; pass aspect+let us pick
      quality?: GptImageQuality;
    },
  ): Promise<GeneratedImage> {
    const size = aspectToGptSize(options?.aspectRatio);
    const quality = options?.quality || this.defaultQuality;
    const hasRefs = (references?.length ?? 0) > 0;

    try {
      if (hasRefs) {
        // Edits endpoint — try configured edit model, fall back to gpt-image-1
        // on validation errors. References pass in caller order (style refs
        // first per /render's setup, then identity / subject refs).
        const files = await Promise.all(
          (references || []).map((r, i) =>
            toFile(r.data, `ref_${i + 1}.${r.mimeType.includes("png") ? "png" : "jpg"}`, { type: r.mimeType }),
          ),
        );

        const tryModel = async (modelId: string) => {
          // input_fidelity (preserve the style/identity from the reference
          // images) is only accepted by the gpt-image-1 family (1, 1.5, 1-mini)
          // — gpt-image-2 rejects it ("does not support input_fidelity"). Send
          // it only where supported.
          const supportsFidelity = modelId.startsWith("gpt-image-1");
          log(`🎨 GPT [${modelId}/edits]: ${prompt.slice(0, 80).replace(/\n/g, " ")}... (${references?.length || 0} refs, ${size}, ${quality}${supportsFidelity ? ", fidelity=high" : ""})`);
          const res = await this.openai.images.edit({
            model: modelId,
            image: files,
            prompt,
            size,
            quality,
            ...(supportsFidelity ? { input_fidelity: "high" } : {}),
          } as any);
          const item = res.data?.[0];
          const b64 = item?.b64_json;
          if (!b64) throw new Error("GPT Image returned no image data");
          return { b64, modelUsed: modelId };
        };

        let result: { b64: string; modelUsed: string };
        try {
          result = await tryModel(this.editModel);
        } catch (err: any) {
          if (this.editModel !== this.editFallbackModel && isModelValidationError(err)) {
            log(`⚠️  ${this.editModel} rejected on /edits, falling back to ${this.editFallbackModel}`);
            result = await tryModel(this.editFallbackModel);
          } else {
            throw err;
          }
        }

        const data = Buffer.from(result.b64, "base64");
        log(`✅ GPT Image generated via ${result.modelUsed} (${(data.length / 1024).toFixed(1)} KB)`);
        return {
          data,
          mimeType: "image/png",
          prompt,
          referenceCount: references?.length || 0,
          generatedAt: new Date(),
          model: result.modelUsed,
        };
      }

      // No refs — use generations endpoint with the configured generate model.
      log(`🎨 GPT [${this.generateModel}/generations]: ${prompt.slice(0, 80).replace(/\n/g, " ")}... (0 refs, ${size}, ${quality})`);
      const res = await this.openai.images.generate({
        model: this.generateModel,
        prompt,
        size,
        quality,
      } as any);
      const item = res.data?.[0];
      const b64 = item?.b64_json;
      if (!b64) throw new Error("GPT Image returned no image data");
      const data = Buffer.from(b64, "base64");
      log(`✅ GPT Image generated via ${this.generateModel} (${(data.length / 1024).toFixed(1)} KB)`);
      return {
        data,
        mimeType: "image/png",
        prompt,
        referenceCount: 0,
        generatedAt: new Date(),
        model: this.generateModel,
      };
    } catch (err: any) {
      logError(`❌ GPT Image error:`, err?.message || err);
      throw err;
    }
  }

  async saveImage(image: GeneratedImage, baseName: string): Promise<string> {
    const ext = image.mimeType?.includes("jpeg") ? "jpg" : "png";
    const filename = `${baseName}.${ext}`;
    const fullPath = path.join(this.outputDir, filename);
    fs.writeFileSync(fullPath, image.data);
    return fullPath;
  }

  /** Effective models, for logs/telemetry. */
  getModels(): { generate: string; edit: string; editFallback: string } {
    return { generate: this.generateModel, edit: this.editModel, editFallback: this.editFallbackModel };
  }
}

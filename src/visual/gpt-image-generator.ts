/**
 * GptImageGenerator — OpenAI gpt-image-1 wrapper
 *
 * Parallel surface to ImageGenerator (the Nano Banana wrapper) so /render
 * can swap between backends. Same generateImage(prompt, references, options)
 * shape, same GeneratedImage return.
 *
 * Strengths over Nano Banana:
 * - Long detailed prompts (better instruction following)
 * - Multi-panel boards (storyboard pages, casting sheets, mood boards)
 * - Text rendering inside images
 * - Initial concept exploration before a project's style is locked
 *
 * Tradeoffs:
 * - Slower per call than Nano
 * - More expensive
 * - Aspect ratios constrained to {1:1, 2:3, 3:2}; we map any input to the
 *   nearest supported size and let the caller crop client-side if needed
 *
 * When references are supplied we use the edit endpoint (gpt-image-1 accepts
 * an array of input images plus a prompt — the spec calls this "edit" but
 * it's really "image-conditioned generation"). When no refs, we use generate.
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

export type GptImageQuality = "low" | "medium" | "high";

export interface GptImageGeneratorConfig {
  apiKey: string;
  outputDir?: string;
  defaultQuality?: GptImageQuality;
}

/** Map a generic aspect-ratio string to the closest gpt-image-1 supported size. */
function aspectToGptSize(aspectRatio?: AspectRatio): "1024x1024" | "1024x1536" | "1536x1024" {
  if (!aspectRatio) return "1024x1024";
  const [w, h] = aspectRatio.split(":").map((n) => parseInt(n, 10));
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  if (ratio > 1.2) return "1536x1024"; // landscape (16:9, 21:9, 3:2, 4:3, 5:4)
  if (ratio < 0.85) return "1024x1536"; // portrait (2:3, 3:4, 4:5, 9:16)
  return "1024x1024"; // square (1:1, anything close)
}

export class GptImageGenerator {
  private openai: OpenAI;
  private outputDir: string;
  private defaultQuality: GptImageQuality;

  constructor(config: GptImageGeneratorConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.outputDir = config.outputDir || path.join(process.cwd(), ".narrative-data", "generated-images");
    this.defaultQuality = config.defaultQuality || "high";
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  async generateImage(
    prompt: string,
    references?: ReferenceImage[],
    options?: {
      aspectRatio?: AspectRatio;
      imageSize?: ImageSize; // ignored — gpt-image-1 sizes are fixed
      quality?: GptImageQuality;
    },
  ): Promise<GeneratedImage> {
    const size = aspectToGptSize(options?.aspectRatio);
    const quality = options?.quality || this.defaultQuality;
    const hasRefs = (references?.length ?? 0) > 0;

    log(`🎨 GPT Image: ${prompt.slice(0, 100).replace(/\n/g, " ")}... (${references?.length || 0} refs, ${size}, ${quality})`);

    try {
      let b64: string | undefined;
      let mimeType = "image/png";

      if (hasRefs) {
        // gpt-image-1 edit endpoint accepts an array of input images plus a
        // prompt. We pass refs in the order the caller provided (style refs
        // first per /render's setup, identity refs next).
        const files = await Promise.all(
          (references || []).map((r, i) =>
            toFile(r.data, `ref_${i + 1}.${r.mimeType.includes("png") ? "png" : "jpg"}`, { type: r.mimeType }),
          ),
        );

        const res = await this.openai.images.edit({
          model: "gpt-image-1",
          image: files,
          prompt,
          size,
          quality,
          // Note: input_fidelity tunes how strictly the output matches the
          // input images. Default is acceptable for style+identity refs;
          // expose if needed later.
        } as any);
        const item = res.data?.[0];
        b64 = item?.b64_json;
      } else {
        const res = await this.openai.images.generate({
          model: "gpt-image-1",
          prompt,
          size,
          quality,
        } as any);
        const item = res.data?.[0];
        b64 = item?.b64_json;
      }

      if (!b64) {
        throw new Error("GPT Image returned no image data");
      }

      const data = Buffer.from(b64, "base64");
      log(`✅ GPT Image generated (${(data.length / 1024).toFixed(1)} KB)`);

      return {
        data,
        mimeType,
        prompt,
        referenceCount: references?.length || 0,
        generatedAt: new Date(),
        model: "gpt-image-1",
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
}

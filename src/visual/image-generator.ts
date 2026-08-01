/**
 * ImageGenerator - Nano Banana Image Generation
 *
 * Uses Gemini's native image generation models (Nano Banana):
 * - gemini-3.1-flash-image-preview (Nano Banana 2) [DEFAULT]: Best all-around
 *   model. Up to 14 reference images (10 object + 4 character fidelity), 4K
 *   output, thinking mode, new aspect ratios (1:4, 1:8, 4:1, 8:1), Image
 *   Search grounding.
 * - gemini-3-pro-image-preview (Nano Banana Pro): Professional asset
 *   production. Up to 6 objects + 5 character refs. Strong text rendering.
 * - gemini-2.5-flash-image (Nano Banana): Fast/legacy, up to 3 refs.
 *
 * Supports reference images for visual consistency across scenes.
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import {
  GeneratedImage,
  GenerationConfig,
  VisualStyle,
  DEFAULT_CONFIG,
  DEFAULT_STYLE,
} from "./types";

const isTestEnv = process.env.NODE_ENV === "test";
const log = (...args: unknown[]) => {
  if (!isTestEnv) console.log(...args);
};
const logError = (...args: unknown[]) => {
  if (!isTestEnv) console.error(...args);
};

export type NanoBananaModel =
  | "gemini-3.1-flash-image-preview" // Nano Banana 2 — the new default
  | "gemini-3-pro-image-preview"     // Nano Banana Pro
  | "gemini-2.5-flash-image";        // Nano Banana (legacy fast)
// Gemini 3.1 Flash Image Preview adds 1:4, 4:1, 1:8, 8:1.
export type AspectRatio =
  | "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4"
  | "9:16" | "16:9" | "21:9"
  | "1:4" | "4:1" | "1:8" | "8:1";
// Gemini 3.1 Flash Image Preview also adds 512 (0.5K) for fast iteration.
export type ImageSize = "512" | "1K" | "2K" | "4K";

export interface ImageGeneratorConfig {
  apiKey: string;
  outputDir?: string;
  config?: Partial<GenerationConfig>;
  /** Default model. Defaults to gemini-3.1-flash-image-preview (Nano Banana 2)
   *  — Google's recommended "best all-around" image model: fast, intelligent,
   *  14-ref support, and the new ultra-wide aspect ratios. */
  defaultModel?: NanoBananaModel;
}

export interface ReferenceImage {
  /** Identifier for this reference */
  id: string;
  /** Image data as Buffer */
  data: Buffer;
  /** MIME type */
  mimeType: string;
  /** Description of what this reference represents */
  description: string;
  /** Type of reference for proper categorization */
  type?: "character" | "location" | "object" | "previous_shot" | "style" | "source";
}

interface IndexedReference {
  ref: ReferenceImage;
  index: number; // 1-based index in request order
}

export interface SceneGenerationOptions {
  /** Scene prose/description */
  prose: string;
  /** Scene title for context */
  title?: string;
  /** Source image for edit-centric flows (e.g. camera angle changes) — placed first in content array */
  sourceRefs?: ReferenceImage[];
  /** Character reference images (up to 5 for Pro model) */
  characterRefs?: ReferenceImage[];
  /** Location/setting reference images */
  locationRefs?: ReferenceImage[];
  /** Previous shot references for visual continuity */
  previousShots?: ReferenceImage[];
  /** Object/artifact reference images */
  objectRefs?: ReferenceImage[];
  /** Style reference image */
  styleRef?: ReferenceImage;
  /** Aspect ratio for the output */
  aspectRatio?: AspectRatio;
  /** Image size (Gen-3 models only — 512/1K/2K/4K) */
  imageSize?: ImageSize;
  /** Use Pro model for the heaviest text rendering + professional asset
   *  production. Default false — uses Nano Banana 2 (Gemini 3.1 Flash Image
   *  Preview) which is the recommended general-purpose model. */
  usePro?: boolean;
  /** Explicit model override. When set, takes precedence over usePro. */
  model?: NanoBananaModel;
}

export class ImageGenerator {
  private genAI: GoogleGenAI;
  private outputDir: string;
  private config: GenerationConfig;
  private defaultModel: NanoBananaModel;

  constructor(config: ImageGeneratorConfig) {
    this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
    this.outputDir = config.outputDir || "./generated-images";
    this.config = { ...DEFAULT_CONFIG, ...config.config };
    this.defaultModel = config.defaultModel || "gemini-3.1-flash-image-preview";

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate an image from a text prompt
   */
  async generateImage(
    prompt: string,
    references?: ReferenceImage[],
    options?: {
      model?: NanoBananaModel;
      aspectRatio?: AspectRatio;
      imageSize?: ImageSize;
      /** Skip the generator's configured default style. Callers that already
       *  assembled a complete, inspectable prompt should set this false so the
       *  provider receives that prompt byte-for-byte. */
      applyDefaultStyle?: boolean;
      /** Per-call style overlay. Unlike setStyle(), this cannot leak into a
       *  later request handled by the process-wide generator singleton. */
      styleOverride?: Partial<VisualStyle>;
    }
  ): Promise<GeneratedImage> {
    const model = options?.model || this.defaultModel;
    const isPro = model === "gemini-3-pro-image-preview";
    // Gemini 3.x models (Pro + 3.1 Flash) both support up to 14 references and
    // imageSize / imageConfig. The legacy 2.5 Flash caps at 3 refs and ignores
    // imageSize. Treat both Pro and 3.1 Flash as "gen 3" for those purposes.
    const isGen3 = isPro || model === "gemini-3.1-flash-image-preview";

    log(`🎨 Generating image with ${model}...`);
    log(`   Prompt: ${prompt.substring(0, 100)}...`);
    if (references) {
      log(`   References: ${references.length} images`);
    }

    // Apply limits based on model — gen 3 (Pro + 3.1 Flash) supports up to 14
    // references; legacy 2.5 Flash caps at 3.
    const maxRefs = isGen3 ? 14 : 3;
    const limitedRefs = references?.slice(0, maxRefs);
    const referenceManifest = (limitedRefs || []).map((ref, index) => ({
      order: index + 1,
      id: ref.id,
      type: ref.type || "unknown",
      description: ref.description,
    }));
    const referenceTypeCounts = referenceManifest.reduce((acc, ref) => {
      const key = ref.type as keyof typeof acc;
      if (key in acc) {
        acc[key] += 1;
      } else {
        acc.unknown += 1;
      }
      return acc;
    }, {
      character: 0,
      object: 0,
      location: 0,
      previous_shot: 0,
      style: 0,
      source: 0,
      unknown: 0,
    });

    const styledPrompt = options?.applyDefaultStyle === false
      ? prompt
      : this.applyStyle(prompt, options?.styleOverride);

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const contents = this.buildContents(styledPrompt, limitedRefs);

        // Build generation config
        const generationConfig: any = {
          responseModalities: ["TEXT", "IMAGE"],
        };

        // Add image config for aspect ratio and size. Gen 3 models (Pro + 3.1
        // Flash) accept imageConfig with both aspectRatio and imageSize.
        // Legacy 2.5 Flash ignores imageSize.
        const wantAspect = options?.aspectRatio;
        const wantSize = isGen3 ? (options?.imageSize || "2K") : undefined;
        if (wantAspect || wantSize) {
          generationConfig.imageConfig = {};
          if (wantAspect) {
            generationConfig.imageConfig.aspectRatio = wantAspect;
          }
          if (wantSize) {
            generationConfig.imageConfig.imageSize = wantSize;
          }
        }

        const response = await this.genAI.models.generateContent({
          model,
          contents,
          config: generationConfig,
        });

        // Extract image from response
        const image = this.extractImage(response);
        if (image) {
          log(`✅ Image generated successfully`);
          return {
            data: image.data,
            mimeType: image.mimeType,
            prompt: styledPrompt,
            referenceCount: limitedRefs?.length || 0,
            referenceManifest,
            referenceTypeCounts,
            generatedAt: new Date(),
            model,
          };
        }

        // If no image, check for text response with explanation
        const text = response.text;
        if (text) {
          log(`📝 Model returned text instead of image: ${text.substring(0, 200)}`);
        }

        throw new Error("No image in response");
      } catch (error: any) {
        logError(`❌ Generation failed (attempt ${attempt}/${this.config.maxRetries}):`, error.message);
        if (attempt === this.config.maxRetries) {
          throw error;
        }
        await this.sleep(1000 * attempt);
      }
    }

    throw new Error("Image generation failed after all retries");
  }

  /**
   * Generate a scene image with multiple reference images for consistency
   * This is the main method for narrative scene visualization
   *
   * Uses Nano Banana Pro (gemini-3-pro-image-preview) for:
   * - Up to 5 character references for consistency
   * - Up to 6 object/location references
   * - Previous shot references for visual continuity
   * - Up to 4K resolution output
   */
  async generateSceneImage(options: SceneGenerationOptions): Promise<GeneratedImage> {
    const {
      prose,
      title,
      sourceRefs = [],
      characterRefs = [],
      locationRefs = [],
      previousShots = [],
      objectRefs = [],
      styleRef,
      aspectRatio = "16:9",
      imageSize = "2K",
      usePro = false,
      model: modelOverride,
    } = options;

    // Model selection: explicit override > usePro toggle > Nano Banana 2
    // default. Nano Banana 2 (Gemini 3.1 Flash Image Preview) is Google's
    // recommended general-purpose image model — fast, high-fidelity, 14-ref.
    const model: NanoBananaModel = modelOverride
      || (usePro ? "gemini-3-pro-image-preview" : "gemini-3.1-flash-image-preview");
    const isPro = model === "gemini-3-pro-image-preview";
    // Gemini 3.x models (Pro + 3.1 Flash) both support up to 14 references and
    // imageSize / imageConfig. The legacy 2.5 Flash caps at 3 refs and ignores
    // imageSize. Treat both Pro and 3.1 Flash as "gen 3" for those purposes.
    const isGen3 = isPro || model === "gemini-3.1-flash-image-preview";

    log(`🎬 Generating scene image: ${title || "Untitled Scene"}`);
    log(`   Model: ${model}`);
    log(`   Source: ${sourceRefs.length}, Characters: ${characterRefs.length}, Objects: ${objectRefs.length}, Locations: ${locationRefs.length}, Previous shots: ${previousShots.length}`);

    // Build comprehensive reference list respecting model limits.
    // Gen-3 (Pro + NB2): up to 14 total. NB2 fidelity = 10 object + 4 char;
    //                    Pro fidelity = 6 object + 5 char.
    // Flash 2.5 (legacy): up to 3 total.
    const allRefs: ReferenceImage[] = [];

    if (isGen3) {
      const maxTotalRefs = 14;
      let remainingSlots = maxTotalRefs;
      const pushLimited = (refs: ReferenceImage[], type: NonNullable<ReferenceImage["type"]>, limit: number) => {
        const count = Math.max(0, Math.min(limit, remainingSlots, refs.length));
        const selected = refs.slice(0, count);
        selected.forEach((ref) => {
          allRefs.push({ ...ref, type });
        });
        remainingSlots -= selected.length;
      };

      // Source image first (for edit-centric flows like camera angle changes).
      pushLimited(sourceRefs, "source", 1);

      // Character identity caps — Pro=5, NB2=4. Highest priority.
      const characterLimit = isPro ? 5 : 4;
      pushLimited(characterRefs, "character", characterLimit);

      // Object fidelity caps — Pro=6, NB2=10. NB2 favors object breadth.
      const reservedForStyle = styleRef ? 1 : 0;
      const objectBudget = isPro ? 6 : 10;
      const objectLimit = Math.max(0, Math.min(objectBudget, remainingSlots - reservedForStyle));
      pushLimited(objectRefs, "object", objectLimit);

      // Environment continuity refs next.
      pushLimited(locationRefs, "location", 3);
      pushLimited(previousShots, "previous_shot", 3);

      // Optional style ref last.
      if (styleRef && remainingSlots > 0) {
        allRefs.push({ ...styleRef, type: "style" });
      }
    } else {
      // Flash model: prioritize most important refs, up to 3
      if (characterRefs.length > 0) {
        allRefs.push({ ...characterRefs[0], type: "character" });
      }
      if (objectRefs.length > 0 && allRefs.length < 3) {
        allRefs.push({ ...objectRefs[0], type: "object" });
      }
      if (locationRefs.length > 0 && allRefs.length < 3) {
        allRefs.push({ ...locationRefs[0], type: "location" });
      }
      if (previousShots.length > 0 && allRefs.length < 3) {
        allRefs.push({ ...previousShots[0], type: "previous_shot" });
      }
    }

    // Build scene-specific prompt
    const scenePrompt = this.buildScenePrompt(prose, title, allRefs);

    return this.generateImage(scenePrompt, allRefs, {
      model,
      aspectRatio,
      imageSize: isGen3 ? imageSize : undefined,
    });
  }

  /**
   * Generate image with character references for consistency
   * Supports up to 5 character references with Nano Banana Pro
   */
  async generateWithCharacterRefs(
    prompt: string,
    characterRefs: ReferenceImage[],
    characterDescriptions: string[]
  ): Promise<GeneratedImage> {
    // Use Pro model for character consistency (supports up to 5 humans)
    const limitedRefs = characterRefs.slice(0, 5);
    const limitedDescs = characterDescriptions.slice(0, 5);

    // Build character reference prompt
    const charRefPrompt = limitedDescs
      .map((desc, i) => `[Character ${i + 1}: ${desc}]`)
      .join("\n");

    const fullPrompt = `${charRefPrompt}\n\nScene: ${prompt}`;

    return this.generateImage(fullPrompt, limitedRefs, {
      model: "gemini-3-pro-image-preview",
    });
  }

  /**
   * Generate multiple variants of the same scene
   * Useful for giving users options to choose from
   */
  async generateVariants(
    prompt: string,
    count: number,
    references?: ReferenceImage[],
    options?: {
      model?: NanoBananaModel;
      aspectRatio?: AspectRatio;
    }
  ): Promise<GeneratedImage[]> {
    const variants: GeneratedImage[] = [];
    for (let i = 0; i < count; i++) {
      const variantPrompt = `${prompt} (Variation ${i + 1}, unique composition and camera angle)`;
      const image = await this.generateImage(variantPrompt, references, options);
      variants.push(image);
    }
    return variants;
  }

  /**
   * Save generated image to file
   */
  async saveImage(
    image: GeneratedImage,
    filename: string
  ): Promise<string> {
    const ext = image.mimeType.split("/")[1] || "png";
    const fullPath = path.join(this.outputDir, `${filename}.${ext}`);

    fs.writeFileSync(fullPath, image.data);
    log(`💾 Saved image to: ${fullPath}`);

    return fullPath;
  }

  /**
   * Load an image file as a reference
   */
  loadReference(
    filePath: string,
    id: string,
    description: string,
    type?: ReferenceImage["type"]
  ): ReferenceImage {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = this.getMimeType(ext);

    return {
      id,
      data,
      mimeType,
      description,
      type,
    };
  }

  /**
   * Create a reference from base64 data
   */
  createReference(
    id: string,
    base64Data: string,
    mimeType: string,
    description: string,
    type?: ReferenceImage["type"]
  ): ReferenceImage {
    return {
      id,
      data: Buffer.from(base64Data, "base64"),
      mimeType,
      description,
      type,
    };
  }

  /**
   * Update visual style configuration
   */
  setStyle(style: Partial<VisualStyle>): void {
    this.config.style = { ...this.config.style, ...style };
  }

  /**
   * Get current style
   */
  getStyle(): VisualStyle {
    return this.config.style;
  }

  // Private methods

  /**
   * Build a scene prompt following Nano Banana Pro best practices:
   * - Descriptive narrative over keyword lists
   * - Simple reference identification (the model's thinking mode handles binding)
   * - Let the model reason about composition rather than over-constraining
   */
  /**
   * Build a scene prompt following Nano Banana Pro best practices:
   * - Reference manifest maps image numbers to entity names
   * - All identity, composition, and framing rules live in the prose from server.ts
   * - Keep this wrapper minimal so scene prose stays the dominant signal
   */
  private buildScenePrompt(
    prose: string,
    title?: string,
    references?: ReferenceImage[]
  ): string {
    const parts: string[] = [];
    const refs = references || [];

    if (refs.length > 0) {
      // Reorder refs to match buildContents() ordering: source → character → object/style → environment/other
      // This ensures the manifest indices align with actual image positions in the content array.
      const sourceRefs = refs.filter(r => r.type === "source");
      const charRefs = refs.filter(r => r.type === "character");
      const visualRefs = refs.filter(r => r.type === "object" || r.type === "style");
      const otherRefs = refs.filter(r => r.type !== "source" && r.type !== "character" && r.type !== "object" && r.type !== "style");
      const orderedRefs = [...sourceRefs, ...charRefs, ...visualRefs, ...otherRefs];

      const refLines = orderedRefs.map((ref, idx) => {
        const label = this.extractReferenceLabel(ref.description);
        const typeTag = ref.type === "character" ? "person"
          : ref.type === "location" ? "setting"
          : ref.type === "object" ? "object"
          : ref.type === "previous_shot" ? "continuity"
          : ref.type === "style" ? "style"
          : ref.type === "source" ? "source"
          : "reference";
        return `Image ${idx + 1}: ${label} (${typeTag})`;
      });
      parts.push(`Reference images provided:\n${refLines.join("\n")}`);
    }

    // Scene context
    if (title) {
      parts.push(`Scene: "${title}"`);
    }

    // The narrative — this is the main creative directive
    parts.push(prose);

    return parts.join("\n\n");
  }

  /**
   * Build multimodal content array with interleaved reference images.
   *
   * Ordering: source refs → character refs → object/style refs → TEXT PROMPT → environment/continuity refs
   * Each image is preceded by an [Image N: label] text part for explicit binding.
   *
   * Indices are assigned sequentially AFTER reordering so [Image N] labels
   * match actual content positions — aligned with buildScenePrompt() manifest.
   */
  private buildContents(
    prompt: string,
    references?: ReferenceImage[]
  ): any {
    const parts: any[] = [];
    const refs = references || [];

    // Split references by type, then assign sequential indices AFTER reordering
    // so [Image N] labels match actual content positions.
    const sourceRefs: ReferenceImage[] = [];
    const charRefs: ReferenceImage[] = [];
    const visualRefs: ReferenceImage[] = [];
    const otherRefs: ReferenceImage[] = [];
    for (const ref of refs) {
      if (ref.type === "source") sourceRefs.push(ref);
      else if (ref.type === "character") charRefs.push(ref);
      else if (ref.type === "object" || ref.type === "style") visualRefs.push(ref);
      else otherRefs.push(ref);
    }

    // Assign sequential indices in the order they'll appear in the content
    let imageIndex = 1;

    // 1. Source images FIRST — the scene to edit (camera angle changes, image edits)
    if (sourceRefs.length > 0) {
      parts.push({ text: `Source image — this is the scene to edit:` });
      for (const ref of sourceRefs) {
        parts.push({ text: `[Image ${imageIndex}: ${this.extractReferenceLabel(ref.description)}]` });
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data.toString("base64") } });
        imageIndex++;
      }
    }

    // 2. Character reference images — establishes identity anchors before any text
    if (charRefs.length > 0) {
      parts.push({ text: `Character reference images — match these faces exactly:` });
      for (const ref of charRefs) {
        const label = this.extractReferenceLabel(ref.description);
        parts.push({ text: `[Image ${imageIndex}: ${label}]` });
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data.toString("base64") } });
        imageIndex++;
      }
    }

    // 3. Object/style visual references — placed before text for stronger visual influence
    if (visualRefs.length > 0) {
      parts.push({ text: `Visual reference images — match these elements:` });
      for (const ref of visualRefs) {
        const typeTag = ref.type === "object" ? "object" : "style";
        parts.push({ text: `[Image ${imageIndex}: ${this.extractReferenceLabel(ref.description)} (${typeTag})]` });
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data.toString("base64") } });
        imageIndex++;
      }
    }

    // 4. Main text prompt
    parts.push({ text: prompt });

    // 5. Environment and continuity refs after text
    for (const ref of otherRefs) {
      const typeTag = ref.type === "location" ? "setting"
        : ref.type === "previous_shot" ? "continuity"
        : "reference";
      parts.push({ text: `[Image ${imageIndex}: ${this.extractReferenceLabel(ref.description)} (${typeTag})]` });
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data.toString("base64") } });
      imageIndex++;
    }

    return parts;
  }

  private extractReferenceLabel(description: string): string {
    if (!description || typeof description !== "string") return "Referenced subject";
    const firstSegment = description.split("|")[0]?.trim() || description.trim();
    return firstSegment.length > 0 ? firstSegment : "Referenced subject";
  }

  private applyStyle(prompt: string, styleOverride?: Partial<VisualStyle>): string {
    const style = styleOverride
      ? { ...this.config.style, ...styleOverride }
      : this.config.style;
    // Matches both forms the API emits: "[VISUAL STYLE: ...]" and the G5
    // locked variant "[PROJECT VISUAL STYLE — LOCKED...]". Either one is the
    // sole style authority; prepending the default medium line ("photorealistic
    // live-action") on top of a locked stylized project style re-fights the
    // realism bias the lock exists to win.
    const hasExplicitVisualStyleBlock =
      /\[(?:PROJECT\s+)?VISUAL STYLE\b[^\]]*\]/i.test(prompt)
      || /^===\s*(?:PROJECT\s+VISUAL STYLE|RENDERING STYLE)\b[^\n]*===\s*$/im.test(prompt);

    // When the prompt already has a [VISUAL STYLE: ...] block (from the project's
    // visual style setting), it is the sole style authority. Don't prepend the
    // default style directive — it would conflict (e.g. "photorealistic" vs "cartoon").
    if (hasExplicitVisualStyleBlock) {
      return prompt;
    }

    const explicitStylizedRequest = /\b(comic|comic[-\s]?book|cartoon|animated|anime|manga|cel[-\s]?shaded|illustration)\b/i.test(
      `${style.additionalNotes || ""}\n${prompt}`
    );
    const styleMedium = (() => {
      switch (style.style) {
        case "realistic":
          return "Visual medium: photorealistic live-action cinematography";
        case "concept-art":
          return "Visual medium: grounded cinematic concept art with realistic proportions";
        case "western-comic":
          return "Visual medium: western comic-book illustration";
        case "manga":
          return "Visual medium: manga illustration";
        case "anime":
          return "Visual medium: anime illustration";
        default:
          return `Visual medium: ${style.style}`;
      }
    })();
    const isStylizedMedium = style.style === "manga" || style.style === "anime" || style.style === "western-comic";
    const shouldAvoidStylizedRendering = !isStylizedMedium && !explicitStylizedRequest;
    const styleDirective = [
      styleMedium,
      `Color treatment: ${style.coloring}`,
      `Lighting: ${style.lighting}`,
      shouldAvoidStylizedRendering ? "Avoid cartoon, anime, and comic-book rendering unless explicitly requested in the prompt" : "",
      style.additionalNotes || "",
    ].filter(Boolean).join(". ");

    return `${styleDirective}\n\n${prompt}`;
  }

  private extractImage(response: any): { data: Buffer; mimeType: string } | null {
    // Check candidates for image parts
    const candidates = response.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        // Skip thought images (internal to the model)
        if (part.thought) continue;

        if (part.inlineData) {
          return {
            data: Buffer.from(part.inlineData.data, "base64"),
            mimeType: part.inlineData.mimeType || "image/png",
          };
        }
      }
    }

    // Also check direct response structure
    if (response.image) {
      return {
        data: Buffer.from(response.image.data, "base64"),
        mimeType: response.image.mimeType || "image/png",
      };
    }

    return null;
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    return mimeTypes[ext] || "image/png";
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default ImageGenerator;

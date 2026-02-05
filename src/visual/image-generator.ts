/**
 * ImageGenerator - Nano Banana Image Generation
 *
 * Uses Gemini's native image generation models:
 * - gemini-2.5-flash-image (Nano Banana): Fast, up to 3 reference images
 * - gemini-3-pro-image-preview (Nano Banana Pro): Pro quality, up to 14 reference images
 *   - Up to 6 object reference images
 *   - Up to 5 human/character reference images
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

export type NanoBananaModel = "gemini-2.5-flash-image" | "gemini-3-pro-image-preview";
export type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
export type ImageSize = "1K" | "2K" | "4K";

export interface ImageGeneratorConfig {
  apiKey: string;
  outputDir?: string;
  config?: Partial<GenerationConfig>;
  /** Default model to use. Defaults to gemini-2.5-flash-image for speed */
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
  type?: "character" | "location" | "object" | "previous_shot" | "style";
}

export interface SceneGenerationOptions {
  /** Scene prose/description */
  prose: string;
  /** Scene title for context */
  title?: string;
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
  /** Image size (Pro model only) */
  imageSize?: ImageSize;
  /** Use Pro model for higher quality */
  usePro?: boolean;
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
    this.defaultModel = config.defaultModel || "gemini-2.5-flash-image";

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
    }
  ): Promise<GeneratedImage> {
    const model = options?.model || this.defaultModel;
    const isPro = model === "gemini-3-pro-image-preview";

    log(`🎨 Generating image with ${model}...`);
    log(`   Prompt: ${prompt.substring(0, 100)}...`);
    if (references) {
      log(`   References: ${references.length} images`);
    }

    // Apply limits based on model
    const maxRefs = isPro ? 14 : 3;
    const limitedRefs = references?.slice(0, maxRefs);

    const styledPrompt = this.applyStyle(prompt);

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const contents = this.buildContents(styledPrompt, limitedRefs);

        // Build generation config
        const generationConfig: any = {
          responseModalities: ["TEXT", "IMAGE"],
        };

        // Add image config for aspect ratio and size
        if (options?.aspectRatio || options?.imageSize) {
          generationConfig.imageConfig = {};
          if (options.aspectRatio) {
            generationConfig.imageConfig.aspectRatio = options.aspectRatio;
          }
          if (options.imageSize && isPro) {
            generationConfig.imageConfig.imageSize = options.imageSize;
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
      characterRefs = [],
      locationRefs = [],
      previousShots = [],
      objectRefs = [],
      styleRef,
      aspectRatio = "16:9",
      imageSize = "2K",
      usePro = true,
    } = options;

    const model: NanoBananaModel = usePro ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
    const isPro = model === "gemini-3-pro-image-preview";

    log(`🎬 Generating scene image: ${title || "Untitled Scene"}`);
    log(`   Model: ${model}`);
    log(`   Characters: ${characterRefs.length}, Locations: ${locationRefs.length}, Previous shots: ${previousShots.length}`);

    // Build comprehensive reference list respecting model limits
    // Pro model: up to 5 humans, up to 6 objects, 14 total
    // Flash model: up to 3 total
    const allRefs: ReferenceImage[] = [];

    if (isPro) {
      // Add character refs (up to 5 for Pro)
      const chars = characterRefs.slice(0, 5);
      chars.forEach(ref => {
        allRefs.push({ ...ref, type: "character" });
      });

      // Add location refs (up to 3)
      const locs = locationRefs.slice(0, 3);
      locs.forEach(ref => {
        allRefs.push({ ...ref, type: "location" });
      });

      // Add previous shots for continuity (up to 2)
      const prevs = previousShots.slice(0, 2);
      prevs.forEach(ref => {
        allRefs.push({ ...ref, type: "previous_shot" });
      });

      // Add object refs (up to 2)
      const objs = objectRefs.slice(0, 2);
      objs.forEach(ref => {
        allRefs.push({ ...ref, type: "object" });
      });

      // Add style reference if provided
      if (styleRef) {
        allRefs.push({ ...styleRef, type: "style" });
      }

      // Ensure we don't exceed 14 total
      while (allRefs.length > 14) {
        allRefs.pop();
      }
    } else {
      // Flash model: prioritize most important refs, up to 3
      if (characterRefs.length > 0) {
        allRefs.push({ ...characterRefs[0], type: "character" });
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
      imageSize: isPro ? imageSize : undefined,
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

  private buildScenePrompt(
    prose: string,
    title?: string,
    references?: ReferenceImage[]
  ): string {
    const parts: string[] = [];

    // Add reference context
    if (references && references.length > 0) {
      const charRefs = references.filter(r => r.type === "character");
      const locRefs = references.filter(r => r.type === "location");
      const prevRefs = references.filter(r => r.type === "previous_shot");
      const styleRefs = references.filter(r => r.type === "style");

      if (charRefs.length > 0) {
        parts.push(`Characters in this scene: ${charRefs.map(r => r.description).join(", ")}`);
      }
      if (locRefs.length > 0) {
        parts.push(`Setting: ${locRefs.map(r => r.description).join(", ")}`);
      }
      if (prevRefs.length > 0) {
        parts.push(`Maintain visual continuity with the previous shots.`);
      }
      if (styleRefs.length > 0) {
        parts.push(`Match the visual style of the reference image.`);
      }
    }

    // Add scene context
    if (title) {
      parts.push(`Scene: "${title}"`);
    }

    // Add the prose as the main visual directive
    parts.push(`\nVisualize this narrative moment:\n${prose}`);

    // Add cinematic direction
    parts.push(`\nCreate a cinematic, story-driven illustration that captures the emotional core of this scene. Use dramatic lighting and composition to convey the mood. The image should feel like a key frame from an animated film or graphic novel.`);

    return parts.join("\n\n");
  }

  private buildContents(
    prompt: string,
    references?: ReferenceImage[]
  ): any {
    const parts: any[] = [];

    // Add reference images first with their descriptions
    if (references && references.length > 0) {
      for (const ref of references) {
        parts.push({
          inlineData: {
            mimeType: ref.mimeType,
            data: ref.data.toString("base64"),
          },
        });
        // Add description for each reference
        const typeLabel = ref.type ? `[${ref.type.toUpperCase()}] ` : "";
        parts.push({
          text: `${typeLabel}Reference: ${ref.description}`,
        });
      }
    }

    // Add the main prompt last
    parts.push({ text: prompt });

    return parts;
  }

  private applyStyle(prompt: string): string {
    const style = this.config.style;
    const styleDirective = [
      `Art style: ${style.style}`,
      `Coloring: ${style.coloring}`,
      `Line art: ${style.linework}`,
      `Lighting: ${style.lighting}`,
      style.additionalNotes || "",
    ]
      .filter(Boolean)
      .join(". ");

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

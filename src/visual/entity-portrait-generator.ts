/**
 * EntityPortraitGenerator - Generate visual representations of narrative entities
 *
 * Creates consistent portraits for characters, logos for organizations,
 * and establishing shots for locations. These serve as reference images
 * for panel generation, ensuring visual consistency across the narrative.
 */

import { Entity } from "../types";
import {
  ImageGenerator,
  ImageGeneratorConfig,
  ReferenceImage,
} from "./image-generator";
import {
  EntityPortrait,
  LocationShot,
  GeneratedImage,
  VisualStyle,
} from "./types";
import * as fs from "fs";
import * as path from "path";

const isTestEnv = process.env.NODE_ENV === "test";
const log = (...args: unknown[]) => {
  if (!isTestEnv) console.log(...args);
};

export interface PortraitGeneratorConfig extends ImageGeneratorConfig {
  /** Directory to cache generated portraits */
  cacheDir?: string;
  /** Whether to regenerate existing portraits */
  forceRegenerate?: boolean;
}

export interface PortraitGenerationOptions {
  /** Ignore in-memory portrait cache for this request */
  bypassCache?: boolean;
  /** Optional cache key override (useful for variations) */
  cacheKey?: string;
  /** Optional suffix added to saved filename */
  saveSuffix?: string;
  /** Additional reference images to include in generation */
  additionalRefs?: ReferenceImage[];
  /** Aspect ratio for the rendered portrait. When omitted, the underlying
   *  ImageGenerator uses its model default. Callers (the server endpoint)
   *  should pass the project's locked ratio so portraits match the project's
   *  cinematic framing — 16:9 by default, 9:16 for microdramas, etc. */
  aspectRatio?: string;
  /** Image size override — "512" / "1K" / "2K" / "4K". Only honored by
   *  gen-3 models (NB2 / Pro). */
  imageSize?: string;
  /** Model override. When set, takes precedence over the ImageGenerator's
   *  configured default. */
  model?: string;
}

export class EntityPortraitGenerator {
  private imageGen: ImageGenerator;
  private cacheDir: string;
  private forceRegenerate: boolean;
  private portraitCache: Map<string, EntityPortrait> = new Map();
  private locationCache: Map<string, LocationShot> = new Map();

  constructor(config: PortraitGeneratorConfig) {
    this.imageGen = new ImageGenerator(config);
    this.cacheDir = config.cacheDir || "./generated-images/portraits";
    this.forceRegenerate = config.forceRegenerate || false;

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate portrait for any entity type
   */
  async generatePortrait(entity: Entity, options: PortraitGenerationOptions = {}): Promise<EntityPortrait> {
    const cacheKey = options.cacheKey || entity.id;
    // Check cache first
    if (!this.forceRegenerate && !options.bypassCache && this.portraitCache.has(cacheKey)) {
      log(`📦 Using cached portrait for: ${entity.name}`);
      return this.portraitCache.get(cacheKey)!;
    }

    log(`🎨 Generating portrait for ${entity.type}: ${entity.name}`);

    const prompt = this.buildPortraitPrompt(entity);
    const portrait = await this.imageGen.generateImage(prompt, options.additionalRefs, {
      ...(options.aspectRatio ? { aspectRatio: options.aspectRatio as any } : {}),
      ...(options.imageSize ? { imageSize: options.imageSize as any } : {}),
      ...(options.model ? { model: options.model as any } : {}),
    });

    // Save to file
    const suffix = options.saveSuffix ? `_${options.saveSuffix}` : '';
    const filename = this.sanitizeFilename(`portrait_${entity.id}_${entity.name}${suffix}`);
    await this.imageGen.saveImage(portrait, filename);

    const result: EntityPortrait = {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      portrait,
      styleDescription: this.getStyleDescription(entity),
    };

    // Cache the result
    this.portraitCache.set(cacheKey, result);

    return result;
  }

  /**
   * Generate location establishing shot
   */
  async generateLocationShot(entity: Entity, options: PortraitGenerationOptions = {}): Promise<LocationShot> {
    if (entity.type.toLowerCase() !== "location") {
      throw new Error(`Entity ${entity.name} is not a location`);
    }

    const cacheKey = options.cacheKey || entity.id;

    // Check cache
    if (!this.forceRegenerate && !options.bypassCache && this.locationCache.has(cacheKey)) {
      log(`📦 Using cached location shot for: ${entity.name}`);
      return this.locationCache.get(cacheKey)!;
    }

    log(`🏛️ Generating location shot: ${entity.name}`);

    const prompt = this.buildLocationPrompt(entity);
    const image = await this.imageGen.generateImage(prompt, options.additionalRefs, {
      ...(options.aspectRatio ? { aspectRatio: options.aspectRatio as any } : {}),
      ...(options.imageSize ? { imageSize: options.imageSize as any } : {}),
      ...(options.model ? { model: options.model as any } : {}),
    });

    // Save to file
    const suffix = options.saveSuffix ? `_${options.saveSuffix}` : '';
    const filename = this.sanitizeFilename(`location_${entity.id}_${entity.name}${suffix}`);
    await this.imageGen.saveImage(image, filename);

    const result: LocationShot = {
      entityId: entity.id,
      locationName: entity.name,
      establishingShot: image,
    };

    this.locationCache.set(cacheKey, result);

    return result;
  }

  /**
   * Generate portraits for all entities in a list
   */
  async generateAllPortraits(entities: Entity[]): Promise<Map<string, EntityPortrait>> {
    const results = new Map<string, EntityPortrait>();

    // Separate by type for optimized batch processing
    const characters = entities.filter((e) =>
      ["character", "person", "agent", "npc"].includes(e.type.toLowerCase())
    );
    const locations = entities.filter((e) =>
      ["location", "place", "setting"].includes(e.type.toLowerCase())
    );
    const organizations = entities.filter((e) =>
      ["organization", "faction", "company", "group"].includes(e.type.toLowerCase())
    );
    const objects = entities.filter((e) =>
      ["object", "item", "artifact", "technology"].includes(e.type.toLowerCase())
    );

    log(`📊 Generating portraits for:`);
    log(`   - ${characters.length} characters`);
    log(`   - ${locations.length} locations`);
    log(`   - ${organizations.length} organizations`);
    log(`   - ${objects.length} objects`);

    // Generate in batches by type
    for (const entity of [...characters, ...organizations, ...objects]) {
      try {
        const portrait = await this.generatePortrait(entity);
        results.set(entity.id, portrait);
      } catch (error: any) {
        log(`⚠️ Failed to generate portrait for ${entity.name}: ${error.message}`);
      }
    }

    // Generate location establishing shots
    for (const entity of locations) {
      try {
        await this.generateLocationShot(entity);
      } catch (error: any) {
        log(`⚠️ Failed to generate location shot for ${entity.name}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Get portrait as reference image for panel generation
   */
  getAsReference(entityId: string): ReferenceImage | null {
    const portrait = this.portraitCache.get(entityId);
    if (!portrait) return null;

    const CHARACTER_TYPES = new Set(["character", "person", "agent", "npc", "protagonist", "antagonist"]);
    const OBJECT_TYPES = new Set(["object", "item", "artifact", "technology"]);
    const entityType = (portrait.entityType || "").toLowerCase();
    const refType: ReferenceImage["type"] = CHARACTER_TYPES.has(entityType) ? "character"
      : OBJECT_TYPES.has(entityType) ? "object"
      : "character"; // default to character for unknown portrait types

    return {
      id: entityId,
      data: portrait.portrait.data,
      mimeType: portrait.portrait.mimeType,
      description: `${portrait.entityType}: ${portrait.entityName}`,
      type: refType,
    };
  }

  /**
   * Get location as reference image
   */
  getLocationAsReference(entityId: string): ReferenceImage | null {
    const location = this.locationCache.get(entityId);
    if (!location) return null;

    return {
      id: entityId,
      data: location.establishingShot.data,
      mimeType: location.establishingShot.mimeType,
      description: `Location: ${location.locationName}`,
      type: "location",
    };
  }

  /**
   * Load previously generated portraits from cache directory
   */
  async loadCachedPortraits(): Promise<void> {
    if (!fs.existsSync(this.cacheDir)) return;

    const files = fs.readdirSync(this.cacheDir);
    log(`📂 Loading ${files.length} cached portrait files...`);

    for (const file of files) {
      if (file.startsWith("portrait_")) {
        // Extract entity ID from filename (portrait_[id]_[name].ext)
        const match = file.match(/^portrait_([^_]+)_(.+)\.\w+$/);
        if (match) {
          const [, entityId, entityName] = match;
          const filePath = path.join(this.cacheDir, file);
          const data = fs.readFileSync(filePath);
          const ext = path.extname(file);

          this.portraitCache.set(entityId, {
            entityId,
            entityName: entityName.replace(/_/g, " "),
            entityType: "unknown",
            portrait: {
              data,
              mimeType: `image/${ext.slice(1)}`,
              prompt: "loaded from cache",
              referenceCount: 0,
              generatedAt: new Date(fs.statSync(filePath).mtime),
              model: "cached",
            },
            styleDescription: "loaded from cache",
          });
        }
      }
    }

    log(`✅ Loaded ${this.portraitCache.size} portraits from cache`);
  }

  /**
   * Update visual style for generation
   */
  setStyle(style: Partial<VisualStyle>): void {
    this.imageGen.setStyle(style);
  }

  // Private methods

  private buildPortraitPrompt(entity: Entity): string {
    const type = entity.type.toLowerCase();
    const description = entity.description || "";
    const traits = entity.traits?.join(", ") || "";
    const appearance = entity.appearance || entity.visual || "";

    switch (type) {
      case "character":
      case "person":
      case "agent":
      case "npc":
        return this.buildCharacterPrompt(entity, description, traits, appearance);

      case "organization":
      case "faction":
      case "company":
      case "group":
        return this.buildOrganizationPrompt(entity, description);

      case "object":
      case "item":
      case "artifact":
      case "technology":
        return this.buildObjectPrompt(entity, description);

      default:
        return this.buildGenericPrompt(entity, description);
    }
  }

  private buildCharacterPrompt(
    entity: Entity,
    description: string,
    traits: string,
    appearance: string
  ): string {
    return `Character portrait, bust shot, centered composition, photorealistic live-action still.

Subject: ${entity.name}
${description ? `Description: ${description}` : ""}
${appearance ? `Appearance: ${appearance}` : ""}
${traits ? `Personality traits reflected in expression: ${traits}` : ""}

IMPORTANT: If reference images are attached, match the subject's appearance, clothing, accessories, and associated objects exactly as shown. Preserve visual identity from the references.

Style requirements:
- Believable skin, hair, fabric, and material textures
- Face clearly visible, looking slightly toward camera
- Expression conveys character personality
- Cinematic live-action lighting and lens realism
- High detail on facial features and distinctive elements
- Include all associated items/equipment visible in reference images
- Avoid cartoon, anime, or comic rendering unless explicitly requested`;
  }

  private buildOrganizationPrompt(entity: Entity, description: string): string {
    return `Logo/emblem design for organization.

Organization: ${entity.name}
${description ? `Description: ${description}` : ""}
${entity.ideology ? `Values/Ideology: ${entity.ideology}` : ""}

If reference images are attached, match the visual style and design language shown.

Style requirements:
- Clean, iconic design
- Works at multiple scales
- Conveys organization's nature and values
- Professional quality suitable for branding
- Simple enough to be recognizable`;
  }

  private buildObjectPrompt(entity: Entity, description: string): string {
    return `Photoreal object still, product-shot composition.

Object: ${entity.name}
${description ? `Description: ${description}` : ""}
${entity.function ? `Function: ${entity.function}` : ""}

If reference images are attached, match the object's appearance, materials, and design exactly as shown.

Style requirements:
- Clean background
- Object centered and well-lit
- Show key details and features
- Realistic material response and lighting`;
  }

  private buildGenericPrompt(entity: Entity, description: string): string {
    return `Photoreal visual reference of: ${entity.name}

${description ? `Description: ${description}` : ""}

If reference images are attached, match the visual appearance shown in them.

Style requirements:
- Clear representation
- Professional quality
- Believable live-action materials and lighting`;
  }

  private buildLocationPrompt(entity: Entity): string {
    const description = entity.description || "";
    const atmosphere = entity.atmosphere || entity.mood || "";

    return `Establishing shot, cinematic composition.

Location: ${entity.name}
${description ? `Description: ${description}` : ""}
${atmosphere ? `Atmosphere: ${atmosphere}` : ""}

If reference images are attached, match the location's architecture, environment, and visual style exactly as shown.

Style requirements:
- Wide angle establishing shot
- Shows scale and key architectural/environmental features
- Cinematic lighting and composition
- Conveys the mood and atmosphere of the location
- Believable live-action production design and materials`;
  }

  private getStyleDescription(entity: Entity): string {
    const type = entity.type.toLowerCase();
    switch (type) {
      case "character":
      case "person":
        return "Character portrait, bust shot";
      case "organization":
        return "Logo/emblem design";
      case "location":
        return "Establishing shot";
      case "object":
        return "Photoreal product-style still";
      default:
        return "Visual reference";
    }
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 100);
  }
}

export default EntityPortraitGenerator;

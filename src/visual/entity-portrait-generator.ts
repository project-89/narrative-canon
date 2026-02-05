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
  async generatePortrait(entity: Entity): Promise<EntityPortrait> {
    // Check cache first
    if (!this.forceRegenerate && this.portraitCache.has(entity.id)) {
      log(`📦 Using cached portrait for: ${entity.name}`);
      return this.portraitCache.get(entity.id)!;
    }

    log(`🎨 Generating portrait for ${entity.type}: ${entity.name}`);

    const prompt = this.buildPortraitPrompt(entity);
    const portrait = await this.imageGen.generateImage(prompt);

    // Save to file
    const filename = this.sanitizeFilename(`portrait_${entity.id}_${entity.name}`);
    await this.imageGen.saveImage(portrait, filename);

    const result: EntityPortrait = {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      portrait,
      styleDescription: this.getStyleDescription(entity),
    };

    // Cache the result
    this.portraitCache.set(entity.id, result);

    return result;
  }

  /**
   * Generate location establishing shot
   */
  async generateLocationShot(entity: Entity): Promise<LocationShot> {
    if (entity.type.toLowerCase() !== "location") {
      throw new Error(`Entity ${entity.name} is not a location`);
    }

    // Check cache
    if (!this.forceRegenerate && this.locationCache.has(entity.id)) {
      log(`📦 Using cached location shot for: ${entity.name}`);
      return this.locationCache.get(entity.id)!;
    }

    log(`🏛️ Generating location shot: ${entity.name}`);

    const prompt = this.buildLocationPrompt(entity);
    const image = await this.imageGen.generateImage(prompt);

    // Save to file
    const filename = this.sanitizeFilename(`location_${entity.id}_${entity.name}`);
    await this.imageGen.saveImage(image, filename);

    const result: LocationShot = {
      entityId: entity.id,
      locationName: entity.name,
      establishingShot: image,
    };

    this.locationCache.set(entity.id, result);

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

    return results;
  }

  /**
   * Get portrait as reference image for panel generation
   */
  getAsReference(entityId: string): ReferenceImage | null {
    const portrait = this.portraitCache.get(entityId);
    if (!portrait) return null;

    return {
      id: entityId,
      data: portrait.portrait.data,
      mimeType: portrait.portrait.mimeType,
      description: `${portrait.entityType}: ${portrait.entityName}`,
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
    return `Character portrait, bust shot, centered composition.

Subject: ${entity.name}
${description ? `Description: ${description}` : ""}
${appearance ? `Appearance: ${appearance}` : ""}
${traits ? `Personality traits reflected in expression: ${traits}` : ""}

Style requirements:
- Clean background or subtle gradient
- Face clearly visible, looking slightly towards camera
- Expression conveys character personality
- Suitable for use as reference image in sequential art
- High detail on facial features and distinctive elements`;
  }

  private buildOrganizationPrompt(entity: Entity, description: string): string {
    return `Logo/emblem design for organization.

Organization: ${entity.name}
${description ? `Description: ${description}` : ""}
${entity.ideology ? `Values/Ideology: ${entity.ideology}` : ""}

Style requirements:
- Clean, iconic design
- Works at multiple scales
- Conveys organization's nature and values
- Professional quality suitable for branding
- Simple enough to be recognizable`;
  }

  private buildObjectPrompt(entity: Entity, description: string): string {
    return `Object illustration, product shot style.

Object: ${entity.name}
${description ? `Description: ${description}` : ""}
${entity.function ? `Function: ${entity.function}` : ""}

Style requirements:
- Clean background
- Object centered and well-lit
- Show key details and features
- Suitable for use as reference in scenes`;
  }

  private buildGenericPrompt(entity: Entity, description: string): string {
    return `Illustration of: ${entity.name}

${description ? `Description: ${description}` : ""}

Style requirements:
- Clear representation
- Suitable for use as visual reference
- Professional quality`;
  }

  private buildLocationPrompt(entity: Entity): string {
    const description = entity.description || "";
    const atmosphere = entity.atmosphere || entity.mood || "";

    return `Establishing shot, cinematic composition.

Location: ${entity.name}
${description ? `Description: ${description}` : ""}
${atmosphere ? `Atmosphere: ${atmosphere}` : ""}

Style requirements:
- Wide angle establishing shot
- Shows scale and key architectural/environmental features
- Cinematic lighting and composition
- Conveys the mood and atmosphere of the location
- Suitable for use as background reference in sequential art`;
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
        return "Product illustration";
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

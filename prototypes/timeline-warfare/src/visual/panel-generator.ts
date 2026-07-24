/**
 * PanelGenerator - Generate comic panels from narrative interactions
 *
 * Uses the visual_beat field from Interactions to generate panels,
 * with character reference images for visual consistency.
 * This is the core of the visual narrative engine.
 *
 * Optionally uses SceneDirector for LLM-powered prompt engineering
 * to create more detailed, physically coherent scene descriptions.
 */

import { Interaction, Entity, Scene } from "../../../../src/types";
import {
  ImageGenerator,
  ImageGeneratorConfig,
  ReferenceImage,
} from "../../../../src/visual/image-generator";
import { EntityPortraitGenerator } from "../../../../src/visual/entity-portrait-generator";
import { SceneDirector, DirectedScene } from "./scene-director";
import { Panel, GeneratedImage, VisualStyle } from "../../../../src/visual/types";

/**
 * Dialogue/narration overlay configuration
 */
export interface TextOverlay {
  type: 'speech' | 'thought' | 'narration' | 'caption' | 'sfx';
  text: string;
  speaker?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top' | 'bottom';
}

/**
 * Enhanced panel with text overlays
 */
export interface EnhancedPanel extends Panel {
  textOverlays: TextOverlay[];
  sceneContext?: string;
}
import * as fs from "fs";
import * as path from "path";

const isTestEnv = process.env.NODE_ENV === "test";
const log = (...args: unknown[]) => {
  if (!isTestEnv) console.log(...args);
};

export interface PanelGeneratorConfig extends ImageGeneratorConfig {
  /** Portrait generator for character references */
  portraitGenerator?: EntityPortraitGenerator;
  /** Directory to save generated panels */
  panelDir?: string;
  /** Maximum character references per panel (Gemini limit is 5) */
  maxCharacterRefs?: number;
  /** Enable LLM-powered scene direction for better prompts */
  useSceneDirector?: boolean;
}

export class PanelGenerator {
  private imageGen: ImageGenerator;
  private portraitGen: EntityPortraitGenerator | null;
  private sceneDirector: SceneDirector | null;
  private panelDir: string;
  private maxCharacterRefs: number;
  private entityMap: Map<string, Entity> = new Map();
  private sceneMap: Map<string, Scene> = new Map();

  constructor(config: PanelGeneratorConfig) {
    this.imageGen = new ImageGenerator(config);
    this.portraitGen = config.portraitGenerator || null;
    this.panelDir = config.panelDir || "./generated-images/panels";
    this.maxCharacterRefs = config.maxCharacterRefs || 5;

    // Initialize SceneDirector for LLM-powered prompt enhancement
    if (config.useSceneDirector) {
      this.sceneDirector = new SceneDirector({ apiKey: config.apiKey });
    } else {
      this.sceneDirector = null;
    }

    if (!fs.existsSync(this.panelDir)) {
      fs.mkdirSync(this.panelDir, { recursive: true });
    }
  }

  /**
   * Set entity map for looking up participant details
   */
  setEntities(entities: Entity[]): void {
    this.entityMap.clear();
    for (const entity of entities) {
      this.entityMap.set(entity.id, entity);
    }
    // Also set on scene director if available
    if (this.sceneDirector) {
      this.sceneDirector.setEntities(entities);
    }
  }

  /**
   * Set scene map for looking up scene context
   */
  setScenes(scenes: Scene[]): void {
    this.sceneMap.clear();
    for (const scene of scenes) {
      this.sceneMap.set(scene.id, scene);
    }
    // Also set on scene director if available
    if (this.sceneDirector) {
      this.sceneDirector.setScenes(scenes);
    }
  }

  /**
   * Enable or disable scene director
   */
  setUseSceneDirector(use: boolean, apiKey?: string): void {
    if (use && !this.sceneDirector) {
      if (!apiKey) {
        throw new Error("API key required to enable scene director");
      }
      this.sceneDirector = new SceneDirector({ apiKey });
      // Copy current entities and scenes to director
      this.sceneDirector.setEntities(Array.from(this.entityMap.values()));
      this.sceneDirector.setScenes(Array.from(this.sceneMap.values()));
    } else if (!use) {
      this.sceneDirector = null;
    }
  }

  /**
   * Set portrait generator for character references
   */
  setPortraitGenerator(generator: EntityPortraitGenerator): void {
    this.portraitGen = generator;
  }

  /**
   * Generate a panel from an interaction
   */
  async generatePanel(
    interaction: Interaction,
    options?: {
      includeDialogue?: boolean;
      includeNarration?: boolean;
      panelSize?: "full" | "half" | "quarter";
      /** Force use scene director even if not configured globally */
      useSceneDirector?: boolean;
    }
  ): Promise<EnhancedPanel> {
    log(`🎬 Generating panel for interaction: ${interaction.id}`);
    log(`   Type: ${interaction.type}`);
    log(`   Participants: ${interaction.participants.join(", ")}`);

    // Gather character references
    const characterRefs = await this.gatherCharacterReferences(
      interaction.participants
    );

    // Get location reference if available
    const locationRef = interaction.location
      ? await this.getLocationReference(interaction.location)
      : null;

    // Get scene context if available
    const sceneContext = interaction.sceneId
      ? this.getSceneContext(interaction.sceneId)
      : undefined;

    // Build text overlays from interaction
    const textOverlays = this.buildTextOverlays(interaction, options);

    // Get participants and location entities for scene direction
    const participants = interaction.participants
      .map((id) => this.entityMap.get(id))
      .filter((e): e is Entity => e !== undefined);

    const locationEntity = interaction.location
      ? this.entityMap.get(interaction.location)
      : undefined;

    const sceneEntity = interaction.sceneId
      ? this.sceneMap.get(interaction.sceneId)
      : undefined;

    // Use SceneDirector for better prompts if available
    let prompt: string;
    let directedScene: DirectedScene | null = null;

    if (this.sceneDirector || options?.useSceneDirector) {
      log(`   🎬 Using SceneDirector for enhanced prompt...`);
      try {
        directedScene = await this.sceneDirector!.directScene({
          interaction,
          participants,
          location: locationEntity,
          scene: sceneEntity,
        });
        log(`   📝 Directed shot type: ${directedScene.shotType}`);
        log(`   🎭 Mood: ${directedScene.mood}`);

        // Build prompt from directed scene with text overlays
        prompt = this.buildDirectedPrompt(directedScene, textOverlays, interaction);
      } catch (error: any) {
        log(`   ⚠️ SceneDirector failed, using fallback: ${error.message}`);
        prompt = this.buildPanelPrompt(interaction, options, textOverlays, sceneContext);
      }
    } else {
      // Build the generation prompt (includes dialogue/narration instructions)
      prompt = this.buildPanelPrompt(interaction, options, textOverlays, sceneContext);
    }

    // Combine all references (respecting limits)
    const allRefs = this.combineReferences(characterRefs, locationRef);

    log(`   📸 Generating image with ${allRefs.length} references...`);

    // Generate the panel image
    const image = await this.imageGen.generateImage(prompt, allRefs);

    // Save to file
    const filename = this.sanitizeFilename(`panel_${interaction.id}`);
    await this.imageGen.saveImage(image, filename);

    const panel: EnhancedPanel = {
      interactionId: interaction.id,
      image,
      characterRefs: interaction.participants,
      locationRef: interaction.location,
      visualBeat: interaction.visual_beat,
      layoutHint: this.determineLayoutHint(interaction, options?.panelSize),
      textOverlays,
      sceneContext,
    };

    return panel;
  }

  /**
   * Build a prompt from a directed scene with text overlays
   */
  private buildDirectedPrompt(
    directedScene: DirectedScene,
    textOverlays: TextOverlay[],
    interaction: Interaction
  ): string {
    const overlayInstructions = this.buildOverlayInstructions(textOverlays);
    const emotionalContext = this.getEmotionalContext(interaction.emotional_tone);

    return `Comic panel illustration - ${directedScene.shotType}

SCENE DESCRIPTION:
${directedScene.prompt}

LIGHTING: ${directedScene.lighting}
MOOD: ${directedScene.mood}
KEY ELEMENTS TO INCLUDE: ${directedScene.keyElements.join(", ")}

${emotionalContext}

${overlayInstructions}

Style requirements:
- Professional comic book panel composition
- Characters recognizable and consistent with references
- Aspect ratio: ${directedScene.aspectRatio}
- Clean panel borders
- Physically coherent scene with clear spatial relationships`;
  }

  /**
   * Get scene context for richer panel generation
   */
  private getSceneContext(sceneId: string): string | undefined {
    const scene = this.sceneMap.get(sceneId);
    if (!scene) return undefined;

    return `Scene: ${scene.title || 'Untitled'}
Location: ${scene.location || 'Unknown'}
Description: ${scene.description || ''}
Characters present: ${scene.characters?.join(', ') || 'Unknown'}`;
  }

  /**
   * Build text overlays (dialogue bubbles, narration boxes) from interaction
   */
  private buildTextOverlays(
    interaction: Interaction,
    options?: { includeDialogue?: boolean; includeNarration?: boolean }
  ): TextOverlay[] {
    const overlays: TextOverlay[] = [];
    const includeDialogue = options?.includeDialogue !== false; // Default true
    const includeNarration = options?.includeNarration !== false; // Default true

    // Add key dialogue as speech bubble
    if (includeDialogue && interaction.key_dialogue) {
      // Try to attribute dialogue to first participant
      const speaker = interaction.participants[0];
      const speakerEntity = this.entityMap.get(speaker);

      overlays.push({
        type: 'speech',
        text: interaction.key_dialogue,
        speaker: speakerEntity?.name || speaker,
        position: 'top-right',
      });
    }

    // Add narration box for context/outcome
    if (includeNarration && interaction.outcome) {
      // For certain interaction types, add narration
      if (['revelation', 'discovery', 'betrayal'].includes(interaction.type)) {
        overlays.push({
          type: 'narration',
          text: interaction.outcome,
          position: 'top',
        });
      }
    }

    // Add trigger as caption if significant
    if (includeNarration && interaction.trigger && interaction.narrative_weight === 'pivotal') {
      overlays.push({
        type: 'caption',
        text: interaction.trigger,
        position: 'bottom',
      });
    }

    // Add SFX for action-oriented interactions
    if (interaction.type === 'combat' || interaction.type === 'confrontation') {
      overlays.push({
        type: 'sfx',
        text: this.getSfxForType(interaction.type, interaction.emotional_tone),
        position: 'center',
      });
    }

    return overlays;
  }

  /**
   * Get appropriate sound effect text
   */
  private getSfxForType(type: string, tone: string): string {
    const sfxMap: Record<string, Record<string, string>> = {
      combat: {
        chaotic: 'CRASH!',
        tense: 'CLANG!',
        desperate: 'WHAM!',
        default: 'BANG!',
      },
      confrontation: {
        tense: 'SLAM!',
        ominous: 'CRACK!',
        chaotic: 'BOOM!',
        default: 'THUD!',
      },
    };
    return sfxMap[type]?.[tone] || sfxMap[type]?.default || '';
  }

  /**
   * Generate panels for multiple interactions
   */
  async generatePanels(
    interactions: Interaction[],
    options?: {
      maxPanels?: number;
      prioritize?: "major" | "pivotal" | "all";
    }
  ): Promise<Panel[]> {
    let toGenerate = [...interactions];

    // Filter by narrative weight if specified
    if (options?.prioritize && options.prioritize !== "all") {
      toGenerate = toGenerate.filter((i) => {
        if (options.prioritize === "pivotal") {
          return i.narrative_weight === "pivotal";
        }
        return (
          i.narrative_weight === "pivotal" || i.narrative_weight === "major"
        );
      });
    }

    // Limit if specified
    if (options?.maxPanels) {
      toGenerate = toGenerate.slice(0, options.maxPanels);
    }

    log(`📚 Generating ${toGenerate.length} panels...`);

    const panels: Panel[] = [];
    for (const interaction of toGenerate) {
      try {
        const panel = await this.generatePanel(interaction);
        panels.push(panel);
      } catch (error: any) {
        log(`⚠️ Failed to generate panel for ${interaction.id}: ${error.message}`);
      }
    }

    return panels;
  }

  /**
   * Generate a dialogue panel with speech bubble areas
   */
  async generateDialoguePanel(
    interaction: Interaction,
    dialoguePosition: "top" | "bottom" | "left" | "right" = "bottom"
  ): Promise<Panel> {
    const modifiedInteraction = { ...interaction };

    // Add dialogue positioning to visual beat
    modifiedInteraction.visual_beat =
      `${interaction.visual_beat}\n\nLeave ${dialoguePosition} area clear for dialogue bubble.`;

    return this.generatePanel(modifiedInteraction, { includeDialogue: true });
  }

  /**
   * Update visual style
   */
  setStyle(style: Partial<VisualStyle>): void {
    this.imageGen.setStyle(style);
  }

  // Private methods

  private async gatherCharacterReferences(
    participantIds: string[]
  ): Promise<ReferenceImage[]> {
    if (!this.portraitGen) {
      log("⚠️ No portrait generator set, generating without character refs");
      return [];
    }

    const refs: ReferenceImage[] = [];

    for (const id of participantIds.slice(0, this.maxCharacterRefs)) {
      const ref = this.portraitGen.getAsReference(id);
      if (ref) {
        refs.push(ref);
      } else {
        // Try to generate on-the-fly if we have the entity
        const entity = this.entityMap.get(id);
        if (entity) {
          try {
            await this.portraitGen.generatePortrait(entity);
            const newRef = this.portraitGen.getAsReference(id);
            if (newRef) refs.push(newRef);
          } catch (error: any) {
            log(`⚠️ Could not generate portrait for ${id}: ${error.message}`);
          }
        }
      }
    }

    return refs;
  }

  private async getLocationReference(
    locationId: string
  ): Promise<ReferenceImage | null> {
    if (!this.portraitGen) return null;

    const ref = this.portraitGen.getLocationAsReference(locationId);
    if (ref) return ref;

    // Try to generate on-the-fly
    const entity = this.entityMap.get(locationId);
    if (entity) {
      try {
        await this.portraitGen.generateLocationShot(entity);
        return this.portraitGen.getLocationAsReference(locationId);
      } catch (error: any) {
        log(`⚠️ Could not generate location shot for ${locationId}: ${error.message}`);
      }
    }

    return null;
  }

  private combineReferences(
    characters: ReferenceImage[],
    location: ReferenceImage | null
  ): ReferenceImage[] {
    const refs = [...characters];

    // Add location if we have room (total refs limited)
    if (location && refs.length < this.maxCharacterRefs) {
      refs.push(location);
    }

    return refs.slice(0, this.maxCharacterRefs);
  }

  private buildPanelPrompt(
    interaction: Interaction,
    options?: {
      includeDialogue?: boolean;
      includeNarration?: boolean;
      panelSize?: "full" | "half" | "quarter";
    },
    textOverlays?: TextOverlay[],
    sceneContext?: string
  ): string {
    // Get participant names for the prompt
    const participantNames = interaction.participants
      .map((id) => {
        const entity = this.entityMap.get(id);
        return entity?.name || id;
      })
      .join(" and ");

    // Build the emotional context
    const emotionalContext = this.getEmotionalContext(interaction.emotional_tone);

    // Build text overlay instructions
    const overlayInstructions = this.buildOverlayInstructions(textOverlays || []);

    // Base prompt from visual_beat
    let prompt = `Comic panel illustration with integrated text elements.

Scene: ${interaction.visual_beat}

${sceneContext ? `Scene Context:\n${sceneContext}\n` : ""}
Characters: ${participantNames}
Interaction type: ${interaction.type}
${emotionalContext}

${overlayInstructions}

Style requirements:
- Professional comic book panel composition
- Characters recognizable and consistent with references
- Emotional tone clearly conveyed through body language and composition
- ${options?.panelSize === "full" ? "Full page impact, dramatic composition" : "Balanced composition suitable for multi-panel page"}
- Leave appropriate space for text bubbles/boxes as indicated
- Clean panel borders`;

    // Add trigger/outcome context
    if (interaction.trigger) {
      prompt += `\nContext: ${interaction.trigger}`;
    }

    return prompt;
  }

  /**
   * Build instructions for text overlays in the image
   */
  private buildOverlayInstructions(overlays: TextOverlay[]): string {
    if (overlays.length === 0) {
      return "No text overlays required.";
    }

    const instructions: string[] = ["TEXT ELEMENTS TO INCLUDE:"];

    for (const overlay of overlays) {
      switch (overlay.type) {
        case 'speech':
          instructions.push(
            `- SPEECH BUBBLE (${overlay.position || 'near speaker'}): "${overlay.text}"${overlay.speaker ? ` [Speaker: ${overlay.speaker}]` : ''}`
          );
          break;
        case 'thought':
          instructions.push(
            `- THOUGHT BUBBLE (${overlay.position || 'near thinker'}): "${overlay.text}" [Use cloud-like bubble shape]`
          );
          break;
        case 'narration':
          instructions.push(
            `- NARRATION BOX (${overlay.position || 'top'}): "${overlay.text}" [Rectangular caption box]`
          );
          break;
        case 'caption':
          instructions.push(
            `- CAPTION (${overlay.position || 'bottom'}): "${overlay.text}" [Small text box]`
          );
          break;
        case 'sfx':
          instructions.push(
            `- SOUND EFFECT (${overlay.position || 'action area'}): "${overlay.text}" [Bold, stylized text integrated into art]`
          );
          break;
      }
    }

    instructions.push("\nEnsure text is legible, properly positioned, and doesn't obscure important visual elements.");

    return instructions.join("\n");
  }

  private getEmotionalContext(tone: Interaction["emotional_tone"]): string {
    const contexts: Record<Interaction["emotional_tone"], string> = {
      tense: "Atmosphere: Tension and unease. Sharp shadows, tight framing.",
      triumphant: "Atmosphere: Victory and achievement. Bright lighting, upward angles.",
      desperate: "Atmosphere: Urgency and desperation. Dynamic angles, motion blur.",
      mysterious: "Atmosphere: Mystery and intrigue. Deep shadows, obscured elements.",
      hopeful: "Atmosphere: Hope and possibility. Soft lighting, open composition.",
      tragic: "Atmosphere: Sorrow and loss. Muted colors, heavy shadows.",
      ominous: "Atmosphere: Foreboding and threat. Dark corners, looming presence.",
      intimate: "Atmosphere: Closeness and connection. Warm tones, close framing.",
      chaotic: "Atmosphere: Chaos and action. Dutch angles, multiple focus points.",
      peaceful: "Atmosphere: Calm and serenity. Balanced composition, soft lighting.",
    };

    return contexts[tone] || "Atmosphere: Neutral, clear storytelling.";
  }

  private determineLayoutHint(
    interaction: Interaction,
    preferredSize?: "full" | "half" | "quarter"
  ): Panel["layoutHint"] {
    if (preferredSize) {
      switch (preferredSize) {
        case "full":
          return "full";
        case "half":
          return "wide";
        case "quarter":
          return "quarter";
      }
    }

    // Determine based on interaction properties
    if (interaction.narrative_weight === "pivotal") {
      return "full";
    }
    if (interaction.narrative_weight === "major") {
      return "half";
    }
    if (interaction.type === "combat" || interaction.type === "confrontation") {
      return "wide";
    }
    if (interaction.type === "dialogue" || interaction.emotional_tone === "intimate") {
      return "quarter";
    }

    return "half";
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 100);
  }
}

export default PanelGenerator;

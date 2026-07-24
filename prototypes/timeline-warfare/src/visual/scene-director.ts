/**
 * Scene Director - LLM-powered prompt engineering for visual generation
 *
 * Takes abstract visual beats and transforms them into detailed,
 * physically coherent scene descriptions with proper cinematography.
 */

import { GoogleGenAI } from "@google/genai";
import { Entity, Interaction, Scene } from "../../../../src/types";

export interface SceneDirectorConfig {
  apiKey: string;
  model?: string;
}

export interface DirectedScene {
  /** The full, detailed scene description for image generation */
  prompt: string;
  /** Camera/shot type */
  shotType: string;
  /** Suggested aspect ratio */
  aspectRatio: "16:9" | "1:1" | "9:16" | "4:3";
  /** Lighting notes */
  lighting: string;
  /** Key visual elements to ensure consistency */
  keyElements: string[];
  /** Mood/atmosphere */
  mood: string;
}

export interface DirectorContext {
  interaction: Interaction;
  participants: Entity[];
  location?: Entity;
  scene?: Scene;
  previousPanels?: string[]; // Descriptions of previous panels for continuity
}

export class SceneDirector {
  private genAI: GoogleGenAI;
  private model: string;
  private entities: Map<string, Entity> = new Map();
  private scenes: Map<string, Scene> = new Map();

  constructor(config: SceneDirectorConfig) {
    this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model || "gemini-2.0-flash";
  }

  /**
   * Set available entities for reference
   */
  setEntities(entities: Entity[]): void {
    this.entities.clear();
    for (const entity of entities) {
      this.entities.set(entity.id, entity);
    }
  }

  /**
   * Set available scenes for reference
   */
  setScenes(scenes: Scene[]): void {
    this.scenes.clear();
    for (const scene of scenes) {
      this.scenes.set(scene.id, scene);
    }
  }

  /**
   * Direct a scene - transform an interaction into a detailed visual prompt
   */
  async directScene(context: DirectorContext): Promise<DirectedScene> {
    const { interaction, participants, location, scene } = context;

    // Build context for the LLM
    const characterDescriptions = participants
      .map((p) => `${p.name}: ${p.description}${p.appearance ? ` Appearance: ${p.appearance}` : ""}`)
      .join("\n");

    const locationDescription = location
      ? `Location: ${location.name}\n${location.description}${location.atmosphere ? `\nAtmosphere: ${location.atmosphere}` : ""}`
      : "Location not specified";

    const sceneContext = scene
      ? `Scene: ${scene.title}\n${scene.description}`
      : "";

    const prompt = `You are a comic book scene director and cinematographer. Your job is to transform abstract scene descriptions into detailed, physically coherent visual compositions that can be rendered by an AI image generator.

CHARACTERS:
${characterDescriptions}

${locationDescription}

${sceneContext}

INTERACTION TO VISUALIZE:
Type: ${interaction.type}
Visual Beat: ${interaction.visual_beat || "Not specified"}
Emotional Tone: ${interaction.emotional_tone || "neutral"}
Narrative Weight: ${interaction.narrative_weight || "minor"}
${interaction.key_dialogue ? `Key Dialogue: "${interaction.key_dialogue}"` : ""}
${interaction.trigger ? `Trigger: ${interaction.trigger}` : ""}
${interaction.outcome ? `Outcome: ${interaction.outcome}` : ""}

Generate a detailed scene description following these rules:

1. PHYSICAL GROUNDING: Describe exactly where each character is standing/positioned. What surface are they on? What's behind them? What's the physical relationship between elements?

2. CAMERA WORK: Specify shot type (close-up, medium shot, wide shot, over-shoulder, bird's eye, worm's eye, etc.) and why it serves the emotion.

3. LIGHTING: Describe light sources, direction, quality (harsh/soft), color temperature. How does light interact with the scene?

4. DEPTH & LAYERS: What's in the foreground, midground, background? How do layers create visual interest?

5. CHARACTER POSES: Specific body language, facial expressions, hand positions. What exactly are they doing?

6. ENVIRONMENT DETAILS: Specific props, architectural elements, atmospheric effects (smoke, rain, particles).

7. COMIC BOOK STYLE: Frame composition, dynamic angles, where speech bubbles might go.

Respond in this exact JSON format:
{
  "prompt": "A detailed 3-4 sentence description of the exact scene to render, written as image generation instructions",
  "shotType": "the camera shot type",
  "aspectRatio": "16:9 or 1:1 or 9:16 or 4:3",
  "lighting": "brief lighting description",
  "keyElements": ["list", "of", "must-have", "visual", "elements"],
  "mood": "single word or short phrase for atmosphere"
}

Make the prompt specific and concrete - no vague descriptions. Describe what the camera SEES, not what is happening narratively.`;

    try {
      const response = await this.genAI.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "";
      const parsed = JSON.parse(text);

      return {
        prompt: parsed.prompt,
        shotType: parsed.shotType || "medium shot",
        aspectRatio: parsed.aspectRatio || "16:9",
        lighting: parsed.lighting || "dramatic",
        keyElements: parsed.keyElements || [],
        mood: parsed.mood || "neutral",
      };
    } catch (error: any) {
      console.error("Scene direction failed:", error.message);
      // Fallback to basic prompt construction
      return this.fallbackDirection(context);
    }
  }

  /**
   * Direct a sequence of panels for visual continuity
   */
  async directSequence(
    interactions: Interaction[],
    options?: { maintainContinuity?: boolean }
  ): Promise<DirectedScene[]> {
    const results: DirectedScene[] = [];
    const previousDescriptions: string[] = [];

    for (const interaction of interactions) {
      // Gather context
      const participants = interaction.participants
        .map((id) => this.entities.get(id))
        .filter((e): e is Entity => e !== undefined);

      const location = interaction.location
        ? this.entities.get(interaction.location)
        : undefined;

      const scene = interaction.sceneId
        ? this.scenes.get(interaction.sceneId)
        : undefined;

      const context: DirectorContext = {
        interaction,
        participants,
        location,
        scene,
        previousPanels: options?.maintainContinuity ? previousDescriptions : undefined,
      };

      const directed = await this.directScene(context);
      results.push(directed);
      previousDescriptions.push(directed.prompt);
    }

    return results;
  }

  /**
   * Enhance an existing prompt with more detail
   */
  async enhancePrompt(
    basicPrompt: string,
    context: {
      characters?: Entity[];
      location?: Entity;
      mood?: string;
    }
  ): Promise<string> {
    const characterInfo = context.characters
      ?.map((c) => `${c.name}: ${c.description}`)
      .join("\n") || "No specific characters";

    const locationInfo = context.location
      ? `${context.location.name}: ${context.location.description}`
      : "Unspecified location";

    const prompt = `You are enhancing a brief image generation prompt into a detailed, physically coherent scene description.

ORIGINAL PROMPT: "${basicPrompt}"

CHARACTERS INVOLVED:
${characterInfo}

LOCATION:
${locationInfo}

DESIRED MOOD: ${context.mood || "dramatic"}

Rewrite this as a detailed 3-4 sentence scene description that:
1. Specifies exact character positions and poses
2. Describes the physical environment concretely
3. Includes lighting direction and quality
4. Mentions foreground/background elements
5. Uses specific visual details, not abstract concepts

Write ONLY the enhanced prompt, nothing else. Make it suitable for comic book style illustration.`;

    try {
      const response = await this.genAI.models.generateContent({
        model: this.model,
        contents: prompt,
      });

      return response.text?.trim() || basicPrompt;
    } catch (error) {
      return basicPrompt;
    }
  }

  /**
   * Generate a panel layout suggestion based on interaction type
   */
  suggestLayout(interaction: Interaction): {
    panelShape: "wide" | "tall" | "square" | "splash";
    emphasis: "character" | "action" | "environment" | "dialogue";
  } {
    const type = interaction.type;
    const weight = interaction.narrative_weight;

    // Pivotal moments get splash treatment
    if (weight === "pivotal") {
      return { panelShape: "splash", emphasis: "action" };
    }

    // Type-based suggestions
    switch (type) {
      case "dialogue":
        return { panelShape: "wide", emphasis: "dialogue" };
      case "combat":
      case "confrontation":
        return { panelShape: "tall", emphasis: "action" };
      case "revelation":
      case "betrayal":
        return { panelShape: "wide", emphasis: "character" };
      case "discovery":
      case "transaction":
        return { panelShape: "wide", emphasis: "environment" };
      case "ritual":
      case "alliance":
        return { panelShape: "splash", emphasis: "environment" };
      default:
        return { panelShape: "square", emphasis: "character" };
    }
  }

  /**
   * Fallback direction when LLM fails
   */
  private fallbackDirection(context: DirectorContext): DirectedScene {
    const { interaction, participants, location } = context;

    const characterNames = participants.map((p) => p.name).join(" and ");
    const locationName = location?.name || "an unspecified location";

    let shotType = "medium shot";
    let prompt = "";

    switch (interaction.type) {
      case "dialogue":
        shotType = "medium close-up";
        prompt = `Comic panel ${shotType} of ${characterNames} in conversation at ${locationName}. Characters face each other with expressive body language. Dramatic lighting from the side. Clear space for speech bubbles in upper portion of frame.`;
        break;
      case "combat":
        shotType = "dynamic wide shot";
        prompt = `Comic panel ${shotType} of ${characterNames} in combat at ${locationName}. Dynamic action poses with motion lines. One character in foreground, action in midground. Dramatic backlighting with energy effects.`;
        break;
      case "confrontation":
        shotType = "wide shot";
        prompt = `Comic panel ${shotType} showing ${characterNames} facing off at ${locationName}. Characters on opposite sides of frame, tension in body language. Dramatic shadows and atmospheric lighting.`;
        break;
      case "revelation":
        shotType = "close-up";
        prompt = `Comic panel ${shotType} on character's face showing realization at ${locationName}. Dramatic lighting emphasizes emotional expression. Background slightly blurred with relevant environmental details.`;
        break;
      default:
        prompt = `Comic panel showing ${characterNames} at ${locationName}. ${interaction.visual_beat || "Dramatic composition with clear character positioning."}`;
    }

    return {
      prompt,
      shotType,
      aspectRatio: "16:9",
      lighting: "dramatic",
      keyElements: participants.map((p) => p.name),
      mood: interaction.emotional_tone || "neutral",
    };
  }
}

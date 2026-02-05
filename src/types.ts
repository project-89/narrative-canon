import { z } from "zod";

// LLM Types
export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  modelPreference?: "fast" | "smart" | "default";
}

export interface LLMAdapter {
  generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LLMOptions
  ): Promise<T>;

  generateText(prompt: string, options?: LLMOptions): Promise<string>;
}

export interface NarrativeExtractorInterface {
  extractNarrative(text: string): Promise<any>;
}

// Entity Types
export interface Entity {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  strength?: number;
  [key: string]: any;
}

export interface Scene {
  id: string;
  title: string;
  sequence: number;
  location?: string;
  characters: string[];
  description: string;
  events?: Event[];
  frames?: SceneFrame[];
  [key: string]: any;
}

export interface Event {
  id: string;
  sequence: number;
  sceneId: string;
  description: string;
  participants: string[];
  type?: string;
  [key: string]: any;
}

export interface StateChange {
  sequence: number;
  sceneId: string;
  eventId?: string;
  type:
    | "entity_update"
    | "relationship_add"
    | "relationship_remove"
    | "entity_add"
    | "entity_remove";
  entityId?: string;
  relationshipId?: string;
  description: string;
  changes?: Record<string, any>;
}

export interface SceneFrame {
  id: string;
  position: number;
  title?: string;
  description: string;
  visual_beat?: string;
  participantIds?: string[];
  locationId?: string;
  dialogue?: string[];
  caption?: string;
  sfx?: string[];
  shotType?: string;
  camera?: string;
  mood?: string;
  imageUrl?: string;
  [key: string]: any;
}

/**
 * Interaction - A significant moment between entities.
 * These are the "beats" of the narrative - pivotal exchanges that
 * affect relationships, reveal information, or drive the plot.
 *
 * Each interaction includes a visual_beat for image/comic generation.
 */
export interface Interaction {
  id: string;

  /** Type of interaction */
  type:
    | "dialogue"       // Significant conversation
    | "confrontation"  // Conflict or tension
    | "alliance"       // Agreement or partnership formed
    | "betrayal"       // Trust broken
    | "revelation"     // Important information revealed
    | "discovery"      // Something found or learned
    | "transaction"    // Exchange of goods/services/information
    | "ritual"         // Ceremonial or significant action
    | "combat";        // Physical conflict

  /** Entity IDs of participants */
  participants: string[];

  /** Location entity ID where this occurs */
  location?: string;

  /** What initiated/triggered this interaction */
  trigger: string;

  /** What changed as a result */
  outcome: string;

  /** The pivotal line(s) of dialogue, if any */
  key_dialogue?: string;

  /**
   * Visual description for image generation.
   * Should describe: framing, lighting, character positions,
   * key visual elements, emotional atmosphere.
   */
  visual_beat: string;

  /** Emotional tone of the moment */
  emotional_tone:
    | "tense"
    | "triumphant"
    | "desperate"
    | "mysterious"
    | "hopeful"
    | "tragic"
    | "ominous"
    | "intimate"
    | "chaotic"
    | "peaceful";

  /** How important is this to the overall narrative */
  narrative_weight: "minor" | "major" | "pivotal";

  /** Optional scene ID this belongs to */
  sceneId?: string;

  /** Sequence within scene or overall narrative */
  sequence?: number;

  /** Optional storyboard frames for this scene */
  frames?: SceneFrame[];
}

export interface NarrativeStructure {
  entities: Entity[];
  scenes: Scene[];
  relationships: Relationship[];
  stateChanges: StateChange[];
  interactions: Interaction[];
  chronology: {
    events: Event[];
    timeline: any[];
  };
  themes: any[];
  metadata: Record<string, any>;
}

export interface GraphMutation {
  type:
    | "add_entity"
    | "update_entity"
    | "add_relationship"
    | "update_relationship"
    | "add_scene"
    | "update_scene";
  entityId?: string;
  relationshipId?: string;
  sceneId?: string;
  data: any;
}

export interface NarrativeCommit {
  id: string;
  timestamp: Date;
  mutations: GraphMutation[];
  parentCommit?: string;
  branch: string;
}

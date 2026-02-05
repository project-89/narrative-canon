import { z } from "zod";
import { LLMAdapter, Entity, Interaction } from "../types";

const isTestEnv = process.env.NODE_ENV === "test";
const logError = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.error(...args);
  }
};
const logWarn = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.warn(...args);
  }
};

// Zod schema for LLM interaction output
const InteractionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "dialogue",
    "confrontation",
    "alliance",
    "betrayal",
    "revelation",
    "discovery",
    "transaction",
    "ritual",
    "combat",
  ]),
  participants: z.array(z.string()),
  location: z.string().optional().nullable(),
  trigger: z.string(),
  outcome: z.string(),
  key_dialogue: z.string().optional().nullable(),
  visual_beat: z.string(),
  emotional_tone: z.enum([
    "tense",
    "triumphant",
    "desperate",
    "mysterious",
    "hopeful",
    "tragic",
    "ominous",
    "intimate",
    "chaotic",
    "peaceful",
  ]),
  narrative_weight: z.enum(["minor", "major", "pivotal"]),
  sequence: z.number().optional(),
});

const LLMResponseSchema = z.object({
  interactions: z.array(InteractionSchema),
});

type LLMInteractionOutput = z.infer<typeof InteractionSchema>;

/**
 * InteractionExtractor - Extracts significant moments between entities.
 *
 * Interactions are the "beats" of the narrative - pivotal exchanges,
 * confrontations, revelations, and other key moments that drive the plot.
 *
 * Each interaction includes a visual_beat for image/comic generation.
 */
export class InteractionExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  /**
   * Extract significant interactions from narrative text.
   *
   * @param text The narrative text to analyze
   * @param entities Known entities to reference
   * @returns Array of Interaction objects
   */
  async extractInteractions(
    text: string,
    entities: Entity[]
  ): Promise<Interaction[]> {
    const entityListText = entities
      .map((e) => `- ${e.id}: ${e.name} (${e.type})`)
      .join("\n");

    const characterList = entities
      .filter((e) => e.type === "character")
      .map((e) => `- ${e.id}: ${e.name}`)
      .join("\n");

    const locationList = entities
      .filter((e) => e.type === "location")
      .map((e) => `- ${e.id}: ${e.name}`)
      .join("\n");

    const prompt = `
Analyze this narrative text and extract SIGNIFICANT INTERACTIONS between characters/entities.

An interaction is a meaningful moment where entities engage with each other in a way that:
- Reveals character or relationship dynamics
- Advances the plot
- Creates or resolves tension
- Transfers important information
- Changes the status quo

DO NOT extract:
- Routine greetings or small talk
- Filler dialogue
- Background descriptions without character engagement
- Internal monologues (unless they lead to action)

For each interaction, provide:

1. "id": Unique identifier (e.g., "interaction_chen_tanaka_1")

2. "type": One of:
   - "dialogue": Significant conversation
   - "confrontation": Conflict or tension
   - "alliance": Agreement or partnership formed
   - "betrayal": Trust broken
   - "revelation": Important information revealed
   - "discovery": Something found or learned
   - "transaction": Exchange of goods/services/information
   - "ritual": Ceremonial or significant action
   - "combat": Physical conflict

3. "participants": Array of entity IDs involved (use IDs from Known Entities)

4. "location": Entity ID of where this occurs (if known)

5. "trigger": What initiated this interaction (1 sentence)

6. "outcome": What changed as a result (1 sentence)

7. "key_dialogue": The most important line(s) of dialogue, if any. Quote directly from text or paraphrase the pivotal exchange. Optional if no dialogue.

8. "visual_beat": A description for generating an image of this moment. Include:
   - Shot type (close-up, wide shot, over-shoulder, etc.)
   - Character positions and expressions
   - Lighting and atmosphere
   - Key visual elements
   - Emotional mood
   Example: "Close-up on Chen's face, half-lit by holographic display, eyes narrowed in determination. Tanaka visible in reflection, expression unreadable. Blue-tinged shadows, tense atmosphere."

9. "emotional_tone": One of: tense, triumphant, desperate, mysterious, hopeful, tragic, ominous, intimate, chaotic, peaceful

10. "narrative_weight": How important is this moment?
    - "minor": Character development, flavor
    - "major": Significant plot point
    - "pivotal": Story-changing moment

11. "sequence": Order of occurrence in the narrative (1, 2, 3...)

Known Characters:
${characterList || "None specified"}

Known Locations:
${locationList || "None specified"}

All Known Entities:
${entityListText}

Narrative Text to Analyze:
---
${text}
---

Return a JSON object with a single key "interactions" containing an array of interaction objects.
Only extract 2-5 of the MOST significant interactions. Quality over quantity.
Use entity IDs from the Known Entities list when possible.
`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        LLMResponseSchema,
        {
          temperature: 0.3, // Lower for consistency
          modelPreference: "smart",
        }
      );

      // Defensive check: ensure result has interactions array
      if (!result || !result.interactions || !Array.isArray(result.interactions)) {
        logWarn("LLM returned invalid interaction response, using fallback extraction");
        return this.fallbackExtraction(text, entities);
      }

      return this.mapLLMOutputToCanonical(result.interactions);
    } catch (error) {
      logError("Error extracting interactions via LLM:", error);
      logWarn("Falling back to basic interaction extraction.");
      return this.fallbackExtraction(text, entities);
    }
  }

  private mapLLMOutputToCanonical(
    llmInteractions: LLMInteractionOutput[]
  ): Interaction[] {
    return llmInteractions.map((llm, index) => {
      const interaction: Interaction = {
        id: llm.id || `interaction_${index + 1}`,
        type: llm.type,
        participants: llm.participants,
        trigger: llm.trigger,
        outcome: llm.outcome,
        visual_beat: llm.visual_beat,
        emotional_tone: llm.emotional_tone,
        narrative_weight: llm.narrative_weight,
        sequence: llm.sequence || index + 1,
      };

      if (llm.location) {
        interaction.location = llm.location;
      }

      if (llm.key_dialogue) {
        interaction.key_dialogue = llm.key_dialogue;
      }

      return interaction;
    });
  }

  /**
   * Fallback extraction when LLM fails.
   * Looks for dialogue patterns and character co-occurrence.
   */
  private fallbackExtraction(
    text: string,
    entities: Entity[]
  ): Interaction[] {
    const interactions: Interaction[] = [];
    const characters = entities.filter((e) => e.type === "character");

    // Split into paragraphs
    const paragraphs = text
      .split(/\n\s*\n+/)
      .filter((p) => p.trim().length > 50);

    let sequence = 0;

    for (const para of paragraphs) {
      // Find characters mentioned in this paragraph
      const presentCharacters = characters.filter((c) =>
        para.toLowerCase().includes(c.name.toLowerCase())
      );

      // If 2+ characters are present, assume interaction
      if (presentCharacters.length >= 2) {
        sequence++;

        // Check for dialogue markers
        const hasDialogue =
          para.includes('"') || para.includes("said") || para.includes("asked");

        // Check for conflict words
        const hasConflict = /\b(fight|argue|confront|attack|defend|clash)\b/i.test(
          para
        );

        interactions.push({
          id: `fallback_interaction_${sequence}`,
          type: hasConflict ? "confrontation" : hasDialogue ? "dialogue" : "dialogue",
          participants: presentCharacters.map((c) => c.id),
          trigger: "Characters present in same scene",
          outcome: "Interaction occurred",
          visual_beat: `Medium shot of ${presentCharacters.map((c) => c.name).join(" and ")} engaged in ${hasDialogue ? "conversation" : "interaction"}. Neutral lighting.`,
          emotional_tone: hasConflict ? "tense" : "mysterious",
          narrative_weight: "minor",
          sequence,
        });
      }
    }

    return interactions;
  }
}

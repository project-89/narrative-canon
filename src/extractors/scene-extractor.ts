import { z } from "zod";
import { LLMAdapter, Entity, Scene, Event } from "../types";

const isTestEnv = process.env.NODE_ENV === "test";
const logError = (...args: unknown[]) => {
  if (!isTestEnv) {
    logError(...args);
  }
};
const logWarn = (...args: unknown[]) => {
  if (!isTestEnv) {
    logWarn(...args);
  }
};

// Internal Zod schema for LLM output (captures rich details)
const LLMSceneOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  sequence: z.number(),
  location: z.string().optional().nullable(),
  timeframe: z.string().optional().nullable(),
  characters: z.array(z.string()), // IDs of characters
  summary: z.string().optional(), // Potentially brief summary
  detailedDescription: z.string(), // Main descriptive content for the scene
  keyEvents: z.array(
    z.object({
      description: z.string(),
      participants: z.array(z.string()), // IDs of participants
      significance: z
        .enum(["minor", "moderate", "major", "critical"])
        .optional(),
    })
  ),
  moodTone: z.string().optional().nullable(),
  narrativePurpose: z.string().optional().nullable(),
});

const LLMResponseSchema = z.object({
  scenes: z.array(LLMSceneOutputSchema),
});

type LLMSceneOutput = z.infer<typeof LLMSceneOutputSchema>;

export class SceneExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractScenes(text: string, entities: Entity[]): Promise<Scene[]> {
    const entityListText = entities
      .map((e) => `- ${e.id}: ${e.name} (${e.type})`)
      .join("\n");

    const prompt = `
Analyze this narrative text and break it down into sequential, detailed scenes.
A scene is a continuous segment of narrative that typically:
- Takes place in one location or a series of closely related locations.
- Has a consistent set of main characters present or in focus.
- Contains a series of related events, actions, or dialogues.
- Ends when there's a significant change in location, time, character focus, or a natural break in the narrative flow.

For each scene, identify and provide the following details:
1.  "id": A unique identifier for the scene (e.g., "scene_1", "scene_desert_encounter").
2.  "title": A concise, descriptive title for the scene (e.g., "The Escape from Sector 7", "Confrontation at Dawn").
3.  "sequence": The chronological order of the scene in the narrative (e.g., 1, 2, 3...).
4.  "location": The primary setting or location of the scene (e.g., "The Old Mill", "Deep Space Station Alpha"). If not explicitly mentioned or inferable, this can be omitted.
5.  "timeframe": A brief description of when the scene occurs relative to the overall story or previous scenes (e.g., "The next morning", "Three years prior", "Simultaneously with the council meeting"). Optional.
6.  "characters": A list of character IDs present or significantly involved in the scene. Use IDs from the provided "Known Entities" list.
7.  "summary": A very brief one-sentence summary of the scene's main point. Optional.
8.  "detailedDescription": A 2-3 sentence detailed description capturing the essence of the scene, its atmosphere, and key actions. This is the main narrative content of the scene.
9.  "keyEvents": An array of key events that occur within the scene, in chronological order. Each event should include:
    - "description": What happens in the event.
    - "participants": A list of character IDs involved in this specific event.
    - "significance": The narrative importance of the event (e.g., 'minor', 'moderate', 'major', 'critical'). Optional.
10. "moodTone": The overall mood or tone of the scene (e.g., "Tense and suspenseful", "Lighthearted and comedic", "Somber and reflective"). Optional.
11. "narrativePurpose": What the scene accomplishes for the story (e.g., "Introduces a new conflict", "Develops character relationships", "Provides crucial exposition"). Optional.

Known Entities (use these IDs for characters and involved participants):
${entityListText}

Narrative Text to Analyze:
---
${text}
---

Return your response as a valid JSON object with a single root key "scenes", which is an array of scene objects structured according to the details above.
Ensure character and participant lists contain only IDs from the "Known Entities" section.
`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        LLMResponseSchema,
        {
          temperature: 0.2, // Lower temperature for more deterministic scene structure
          modelPreference: "smart", // Prefer a model good at detailed analysis
        }
      );

      return this.mapLLMOutputToCanonicalScenes(result.scenes);
    } catch (error) {
      logError("Error extracting scenes via LLM:", error);
      logWarn("Falling back to basic paragraph-based scene extraction.");
      return this.fallbackExtraction(text, entities);
    }
  }

  private mapLLMOutputToCanonicalScenes(llmScenes: LLMSceneOutput[]): Scene[] {
    return llmScenes.map((llmScene, sceneIndex) => {
      const canonicalScene: Scene = {
        id: llmScene.id || `scene_${sceneIndex + 1}`, // Fallback ID
        title: llmScene.title,
        sequence: llmScene.sequence,
        description: llmScene.detailedDescription, // Use detailedDescription for the main description
        characters: llmScene.characters,
      };

      if (llmScene.location) {
        canonicalScene.location = llmScene.location;
      }

      // Map keyEvents to canonical Event structure
      if (llmScene.keyEvents) {
        // Check if keyEvents exists
        canonicalScene.events = llmScene.keyEvents.map(
          (keyEvent, eventIndex) => {
            const canonicalEvent: Event = {
              id: `${canonicalScene.id}_event_${eventIndex + 1}`,
              sequence: eventIndex + 1,
              sceneId: canonicalScene.id,
              description: keyEvent.description,
              participants: keyEvent.participants,
            };
            // Store significance as an additional property using bracket notation
            if (keyEvent.significance) {
              canonicalEvent["significance"] = keyEvent.significance;
            }
            return canonicalEvent;
          }
        );
      } else {
        canonicalScene.events = []; // Initialize with empty array if keyEvents is undefined
      }

      // Add extra properties from LLM output to the canonical scene using bracket notation
      if (llmScene.timeframe) canonicalScene["timeframe"] = llmScene.timeframe;
      if (llmScene.moodTone) canonicalScene["moodTone"] = llmScene.moodTone;
      if (llmScene.narrativePurpose)
        canonicalScene["narrativePurpose"] = llmScene.narrativePurpose;
      if (llmScene.summary) canonicalScene["briefSummary"] = llmScene.summary; // Store as different key if needed

      return canonicalScene;
    });
  }

  private fallbackExtraction(text: string, entities: Entity[]): Scene[] {
    const paragraphs = text
      .split(/\n\s*\n+/)
      .filter((p) => p.trim().length > 20); // Split by double newlines
    const scenes: Scene[] = [];

    paragraphs.forEach((para, index) => {
      const sceneId = `fallback_scene_${index + 1}`;
      const charactersInPara = entities
        .filter(
          (e) =>
            e.type === "character" &&
            para.toLowerCase().includes(e.name.toLowerCase())
        )
        .map((e) => e.id);

      let locationInPara: string | undefined = undefined;
      for (const entity of entities) {
        if (
          entity.type === "location" &&
          para.toLowerCase().includes(entity.name.toLowerCase())
        ) {
          locationInPara = entity.id; // Assuming location names are unique enough to map to ID
          break;
        }
      }

      const scene: Scene = {
        id: sceneId,
        title: `Scene ${index + 1} (Fallback)`,
        sequence: index + 1,
        description: para,
        characters: charactersInPara,
        events: [
          {
            id: `${sceneId}_event_1`,
            sequence: 1,
            sceneId: sceneId,
            description: "Primary action of the paragraph.", // Generic event description
            participants: charactersInPara,
          },
        ],
      };
      if (locationInPara) {
        scene.location = locationInPara;
      }
      scenes.push(scene);
    });
    return scenes;
  }
}

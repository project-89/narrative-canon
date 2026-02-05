import { z } from "zod";
import {
  Scene,
  Entity,
  Event,
  StateChange as CanonicalStateChange,
  LLMAdapter,
} from "../types";

// Re-export StateChange as NarrativeStateChange for backward compatibility
export type { StateChange as NarrativeStateChange } from "../types";

// Schema for LLM to output - this defines what we ask the LLM for.
export const LLMStateChangeSchema = z.object({
  sceneId: z
    .string()
    .describe("The ID of the scene in which this state change occurs."),
  eventId: z
    .string()
    .optional()
    .describe(
      "The ID of the specific event within the scene that triggers this change, if applicable."
    ),
  type: z
    .enum([
      "ownership_transfer",
      "location_change",
      "status_change", // e.g., character becomes king, character injured
      "relationship_change", // e.g., friendship formed, alliance broken
      "entity_transformation", // e.g., character becomes a werewolf, object breaks
      "group_formation", // e.g., a team is assembled
      "group_dissolution", // e.g., a band breaks up
      "information_revealed", // e.g., a secret is uncovered, a clue is found
      "goal_achieved", // e.g., a quest is completed, an objective is met
      "obstacle_introduced", // e.g., a new challenge appears, a barrier is erected
      "power_acquired_lost", // e.g., character gains a new ability or loses one
      "resource_change", // e.g., character loses or gains an important item/resource
      "emotional_shift", // e.g., character becomes angry, a mood changes
      "decision_made", // e.g., character decides on a course of action
      "other", // For unclassified significant changes
    ])
    .describe("The type of state change."),
  entities: z
    .array(z.string())
    .describe(
      "IDs of entities primarily involved in or affected by the change."
    ),
  description: z
    .string()
    .describe(
      "A concise textual description of what specifically changed and how."
    ),
  // Details field removed as per original comment to avoid Gemini schema issues for now
});

export type LLMStateChange = z.infer<typeof LLMStateChangeSchema>;

const StateChangesResponseSchema = z.object({
  stateChanges: z.array(LLMStateChangeSchema),
});

// Helper to map LLM types to Canonical StateChange types
export function mapLLMTypeToCanonical(
  llmType: LLMStateChange["type"]
): CanonicalStateChange["type"] {
  switch (llmType) {
    case "ownership_transfer":
    case "location_change":
    case "status_change":
    case "entity_transformation":
    case "information_revealed":
    case "goal_achieved":
    case "obstacle_introduced":
    case "power_acquired_lost":
    case "resource_change":
    case "emotional_shift":
    case "decision_made":
    case "other":
      return "entity_update";
    case "relationship_change":
      // This is a simplification. Ideally, we'd infer add/remove from description or have LLM specify.
      // Defaulting to entity_update as relationships affect entities.
      return "entity_update";
    case "group_formation":
      return "entity_add"; // Or entity_update if group is pre-existing and members change
    case "group_dissolution":
      return "entity_remove"; // Or entity_update
    default:
      return "entity_update"; // Fallback
  }
}

export class StateChangeExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractStateChanges(
    text: string,
    scenes: Scene[],
    entities: Entity[] // Correctly typed
  ): Promise<CanonicalStateChange[]> {
    // Return canonical type
    const entityListText = entities
      .map((e) => `- ${e.id}: ${e.name} (${e.type})`)
      .join("\n");
    const sceneListText = scenes
      .map(
        (s) =>
          `Scene ${s.sequence} (ID: ${s.id}): ${s.title}\n  Characters: ${s.characters.join(", ") || "N/A"}\n  Events: ${(s.events || []).map((e: Event) => (e.description ? e.description.substring(0, 100) + "..." : "Event has no description")).join("; \n    ")}`
      )
      .join("\n\n");

    const prompt = `
Analyze the provided narrative text, scene breakdown, and entity list to identify significant state changes.
A state change represents a meaningful alteration in an entity's status, location, relationships, or the overall narrative world.

For each identified state change, provide the following information:
- "sceneId": The ID of the scene where the change primarily occurs or is observed.
- "eventId": (Optional) The ID of the specific event within the scene that directly causes or represents the change.
- "type": Classify the change using one of these types: [${LLMStateChangeSchema.shape.type.options.join(", ")}].
- "entities": A list of IDs of the primary entities involved in or most affected by this change.
- "description": A concise sentence describing precisely what changed and for whom/what (e.g., "Character X gained possession of the Mystic Orb from Character Y", "Entity Z transformed into a fearsome beast", "The alliance between Group A and Group B was broken").

Known Entities (use these IDs for the "entities" field):
${entityListText}

Scene Context (provides temporal and co-occurrence information):
${sceneListText}

Narrative Text to Analyze:
---
${text}
---

Return your response as a valid JSON object with a single root key "stateChanges", which is an array of state change objects structured according to the details above.
Focus on impactful changes. Do not list every minor action as a state change.
`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        StateChangesResponseSchema,
        {
          temperature: 0.3,
          modelPreference: "smart",
        }
      );

      // Defensive check: ensure result has stateChanges array
      if (!result || !result.stateChanges || !Array.isArray(result.stateChanges)) {
        console.warn("LLM returned invalid state change response, using fallback extraction");
        return this.patternBasedExtraction(text, scenes, entities);
      }

      return result.stateChanges.map((llmChange, index) => ({
        sequence: index + 1, // This is a simple array index, not a true temporal sequence from narrative yet.
        sceneId: llmChange.sceneId,
        eventId: llmChange.eventId,
        type: mapLLMTypeToCanonical(llmChange.type),
        entityId:
          llmChange.entities.length > 0 ? llmChange.entities[0] : undefined,
        relationshipId: undefined, // Explicitly add, as per CanonicalStateChange
        description: llmChange.description,
        changes: {}, // Explicitly add as an empty object, as per CanonicalStateChange (optional field)
      }));
    } catch (error) {
      console.error("Error extracting state changes via LLM:", error);
      console.warn(
        "Falling back to basic pattern-based state change extraction."
      );
      return this.patternBasedExtraction(text, scenes, entities);
    }
  }

  private patternBasedExtraction(
    text: string,
    scenes: Scene[],
    entities: Entity[]
  ): CanonicalStateChange[] {
    const stateChanges: CanonicalStateChange[] = [];
    let globalSequence = 0;

    scenes.forEach((scene) => {
      if (scene.events) {
        // Ensure events exist
        scene.events.forEach((event: Event) => {
          // Explicitly type event
          const changes = this.detectChangesInEvent(
            event,
            scene,
            entities,
            globalSequence
          );
          stateChanges.push(...changes);
          globalSequence += changes.length; // Increment sequence based on changes found
        });
      }
    });

    return stateChanges;
  }

  // Note: This fallback is very rudimentary and may need significant improvement.
  private detectChangesInEvent(
    event: Event, // Correctly typed
    scene: Scene,
    entities: Entity[],
    currentSequenceBase: number
  ): CanonicalStateChange[] {
    const changes: CanonicalStateChange[] = [];
    const desc = event.description ? event.description.toLowerCase() : "";
    let changeCount = 0;

    const findEntityId = (name: string): string | undefined =>
      entities.find((e) => e.name.toLowerCase() === name.toLowerCase())?.id;

    // Ownership transfer patterns
    const transferPatterns = [
      {
        pattern:
          /(\w+)\s+(?:gives|hands|passes)\s+(?:the\s+)?(\w+)\s+to\s+(\w+)/,
        type: "ownership_transfer" as const,
      },
      {
        pattern:
          /(\w+)\s+(?:takes|steals|grabs)\s+(?:the\s+)?(\w+)\s+from\s+(\w+)/,
        type: "ownership_transfer" as const,
      },
      {
        pattern: /(\w+)\s+(?:receives|gets|obtains)\s+(?:the\s+)?(\w+)/,
        type: "ownership_transfer" as const,
      },
    ];

    transferPatterns.forEach((item) => {
      const match = desc.match(item.pattern);
      if (match) {
        const involvedEntityNames = [match[1], match[3]].filter(Boolean);
        const involvedEntityIds = involvedEntityNames
          .map(findEntityId)
          .filter((id): id is string => Boolean(id));
        if (involvedEntityIds.length > 0) {
          changes.push({
            sequence: currentSequenceBase + ++changeCount,
            sceneId: scene.id,
            eventId: event.id,
            type: mapLLMTypeToCanonical(item.type),
            entityId: involvedEntityIds[0], // Assign first involved entity
            relationshipId: undefined, // Explicitly add, as per CanonicalStateChange
            description: `${match[1]} transfers/takes/receives ${match[2]} to/from/undefined ${match[3] || "unknown"}`,
            changes: { item: match[2] }, // Example detail for 'changes'
          });
        }
      }
    });

    // Location change patterns - simple version based on event participants and scene location
    if (scene.location && event.participants.length > 0) {
      event.participants.forEach((participantId) => {
        // This is a very basic heuristic, assuming any participant in an event at a location implies their presence/movement to it.
        // More sophisticated logic would look for movement verbs.
        changes.push({
          sequence: currentSequenceBase + ++changeCount,
          sceneId: scene.id,
          eventId: event.id,
          type: mapLLMTypeToCanonical("location_change"),
          entityId: participantId,
          relationshipId: undefined, // Explicitly add, as per CanonicalStateChange
          description: `Entity ${participantId} is present or moves in relation to location ${scene.location} during event.`,
          changes: { newLocation: scene.location }, // Example detail for 'changes'
        });
      });
    }

    // Status change patterns
    const statusPatterns = [
      {
        pattern:
          /(\w+)\s+(?:becomes|turns into|transforms into)\s+(?:a\s+)?(\w+)/,
        type: "entity_transformation" as const,
        descFn: (m: RegExpMatchArray) => `${m[1]} becomes ${m[2]}`,
      },
      {
        pattern: /(\w+)\s+(?:dies|is killed|perishes)/,
        type: "status_change" as const,
        descFn: (m: RegExpMatchArray) => `${m[1]} dies`,
      },
      {
        pattern: /(\w+)\s+(?:is born|awakens|comes to life)/,
        type: "status_change" as const,
        descFn: (m: RegExpMatchArray) => `${m[1]} is born/awakens`,
      },
      {
        pattern: /(\w+)\s+(?:is crowned|is made|is appointed)\s+(\w+)/,
        type: "status_change" as const,
        descFn: (m: RegExpMatchArray) => `${m[1]} is made ${m[2]}`,
      },
    ];

    statusPatterns.forEach((sp) => {
      const match = desc.match(sp.pattern);
      if (match) {
        const entityId = findEntityId(match[1]);
        if (entityId) {
          changes.push({
            sequence: currentSequenceBase + ++changeCount,
            sceneId: scene.id,
            eventId: event.id,
            type: mapLLMTypeToCanonical(sp.type),
            entityId: entityId,
            relationshipId: undefined, // Explicitly add, as per CanonicalStateChange
            description: sp.descFn(match),
            changes: { newStatus: match[2] || "N/A" }, // Example detail for 'changes'
          });
        }
      }
    });

    // Group formation/dissolution - simple check for keywords and involved entities
    const groupPatterns = [
      {
        pattern: /(?:the\s+)?(\w+)\s+(?:forms|is formed|assembles)/,
        type: "group_formation" as const,
      },
      {
        pattern: /(?:the\s+)?(\w+)\s+(?:breaks up|dissolves|disbands)/,
        type: "group_dissolution" as const,
      },
      {
        pattern: /(\w+)\s+(?:joins|enters)\s+(?:the\s+)?(\w+)/,
        type: "group_formation" as const,
      },
      {
        pattern: /(\w+)\s+(?:leaves|quits|abandons)\s+(?:the\s+)?(\w+)/,
        type: "group_dissolution" as const,
      },
    ];

    groupPatterns.forEach((gp) => {
      const match = desc.match(gp.pattern);
      if (match) {
        const groupName = match[1];
        const involvedEntityName = match.length > 2 ? match[2] : null;
        const groupEntityId = findEntityId(groupName);
        const involvedEntityId = involvedEntityName
          ? findEntityId(involvedEntityName)
          : null;

        const currentEntityIds = [groupEntityId, involvedEntityId].filter(
          (id): id is string => Boolean(id)
        );
        if (currentEntityIds.length > 0) {
          changes.push({
            sequence: currentSequenceBase + ++changeCount,
            sceneId: scene.id,
            eventId: event.id,
            type: mapLLMTypeToCanonical(gp.type),
            entityId: currentEntityIds[0], // Assign first entity involved for simplicity
            relationshipId: undefined, // Potentially a relationship between entity and group
            description: match[0].trim(),
            changes: { group: groupName, member: involvedEntityName },
          });
        }
      }
    });

    return changes;
  }
}

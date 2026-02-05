import { TemporalGraphBuilder, GraphState } from "./graph/temporal";
import { NarrativeStructure, Entity, Relationship, StateChange } from "./types";

export interface CanonEvent {
  id: string;
  name: string;
  description: string;
  triggerConditions: {
    minSequence?: number;
    maxSequence?: number;
    requiredEntities?: string[];
    requiredState?: Record<string, any>;
    requiredRelationships?: Array<{
      source: string;
      target: string;
      type: string;
    }>;
  };
  consequences: {
    stateChanges?: StateChange[];
    nextEvents?: string[];
  };
  importance: "critical" | "major" | "minor";
}

export interface PlayerAction extends StateChange {
  playerId: string;
  timestamp: number;
}

export interface Timeline {
  id: string;
  name: string;
  parentTimeline?: string;
  branchPoint?: number;
  graphBuilder: TemporalGraphBuilder;
  playerActions: PlayerAction[];
  canonViolations: Array<{
    sequence: number;
    playerId: string;
    canonEventId: string;
    description: string;
  }>;
}

export class CanonTimelineManager {
  private timelines: Map<string, Timeline> = new Map();
  private canonEvents: CanonEvent[] = [];
  private playerProfiles: Map<
    string,
    {
      primaryTimeline: string;
      characterId?: string;
      permissions: string[];
    }
  > = new Map();

  constructor() {
    // Initialize with main timeline
    const mainTimeline: Timeline = {
      id: "main",
      name: "Main Timeline",
      graphBuilder: new TemporalGraphBuilder(),
      playerActions: [],
      canonViolations: [],
    };
    this.timelines.set("main", mainTimeline);
  }

  initializeFromNarrative(narrative: NarrativeStructure): void {
    const mainTimeline = this.timelines.get("main")!;

    // Add all entities
    narrative.entities.forEach((entity) => {
      mainTimeline.graphBuilder.addEntity(entity);
    });

    // Add all relationships
    narrative.relationships.forEach((rel) => {
      mainTimeline.graphBuilder.addRelationship(rel);
    });

    // Apply all state changes
    narrative.stateChanges.forEach((change) => {
      mainTimeline.graphBuilder.applyStateChange(change);
    });
  }

  registerCanonEvent(event: CanonEvent): void {
    this.canonEvents.push(event);
  }

  validatePlayerAction(
    playerId: string,
    proposedAction: StateChange,
    currentSequence: number,
    timelineId: string = "main"
  ): { valid: boolean; violations: string[]; suggestions?: string[] } {
    const timeline = this.timelines.get(timelineId);
    if (!timeline) {
      return { valid: false, violations: ["Timeline not found"] };
    }

    const violations: string[] = [];
    const suggestions: string[] = [];

    // Check each canon event
    for (const canonEvent of this.canonEvents) {
      // Check if this action would prevent a required canon event
      if (
        this.wouldPreventCanonEvent(
          proposedAction,
          canonEvent,
          timeline,
          currentSequence
        )
      ) {
        violations.push(
          `Canon Event "${canonEvent.name}": ${canonEvent.description}`
        );

        // Generate suggestions
        if (canonEvent.importance === "critical") {
          suggestions.push(
            `Consider actions that work toward: ${canonEvent.description}`
          );
        }
      }
    }

    // Check timeline consistency
    const consistencyIssues = this.checkTimelineConsistency(
      proposedAction,
      timeline,
      currentSequence
    );
    violations.push(...consistencyIssues);

    return {
      valid: violations.length === 0,
      violations,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  applyPlayerAction(
    playerId: string,
    action: StateChange,
    sequence: number,
    timelineId: string = "main"
  ): { success: boolean; message?: string } {
    const timeline = this.timelines.get(timelineId);
    if (!timeline) {
      return { success: false, message: "Timeline not found" };
    }

    // Validate first
    const validation = this.validatePlayerAction(
      playerId,
      action,
      sequence,
      timelineId
    );
    if (!validation.valid) {
      return {
        success: false,
        message: `Action rejected: ${validation.violations.join(", ")}`,
      };
    }

    // Apply the action
    timeline.graphBuilder.applyStateChange(action);

    // Record player action
    timeline.playerActions.push({
      ...action,
      playerId,
      timestamp: Date.now(),
    });

    return { success: true };
  }

  getTimelineState(timelineId: string, sequence: number): GraphState | null {
    const timeline = this.timelines.get(timelineId);
    if (!timeline) return null;

    return timeline.graphBuilder.getStateAtSequence(sequence);
  }

  getEntityState(
    entityId: string,
    sequence: number,
    timelineId: string = "main"
  ): any {
    const state = this.getTimelineState(timelineId, sequence);
    if (!state) return null;

    return state.entities.get(entityId);
  }

  getActiveRelationships(
    sequence: number,
    timelineId: string = "main"
  ): Relationship[] {
    const state = this.getTimelineState(timelineId, sequence);
    if (!state) return [];

    return Array.from(state.relationships.values());
  }

  private wouldPreventCanonEvent(
    action: StateChange,
    canonEvent: CanonEvent,
    timeline: Timeline,
    currentSequence: number
  ): boolean {
    const conditions = canonEvent.triggerConditions;

    // Check if action removes required relationships
    if (
      conditions.requiredRelationships &&
      action.type === "relationship_remove"
    ) {
      for (const reqRel of conditions.requiredRelationships) {
        const currentRels = this.getActiveRelationships(
          currentSequence,
          timeline.id
        );
        const hasRequired = currentRels.some(
          (r) =>
            r.source === reqRel.source &&
            r.target === reqRel.target &&
            r.type === reqRel.type
        );

        if (hasRequired) {
          // Check if this action would remove it
          const wouldRemove = currentRels.some(
            (r) =>
              r.id === action.relationshipId &&
              r.source === reqRel.source &&
              r.target === reqRel.target &&
              r.type === reqRel.type
          );

          if (wouldRemove) return true;
        }
      }
    }

    // Check if action conflicts with required state
    if (conditions.requiredState && action.type === "entity_update") {
      const reqState = conditions.requiredState[action.entityId!];
      if (reqState) {
        for (const [key, value] of Object.entries(reqState)) {
          if (!action?.changes) {
            return false;
          }
          if (
            action?.changes[key] !== undefined &&
            action?.changes[key] !== value
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private checkTimelineConsistency(
    action: StateChange,
    timeline: Timeline,
    sequence: number
  ): string[] {
    const issues: string[] = [];

    // Check if entity exists before updating
    if (action.type === "entity_update" && action.entityId) {
      const state = this.getTimelineState(timeline.id, sequence);
      if (!state || !state.entities.has(action.entityId)) {
        issues.push(`Entity ${action.entityId} does not exist`);
      }
    }

    // Check for duplicate relationships
    if (action.type === "relationship_add") {
      if (!action.changes) {
        return issues;
      }
      const currentRels = this.getActiveRelationships(sequence, timeline.id);
      const duplicate = currentRels.some(
        (r) =>
          r.source === action?.changes?.source &&
          r.target === action?.changes.target &&
          r.type === action.changes.type
      );
      if (duplicate) {
        issues.push("Relationship already exists");
      }

      // Check if target is already possessed by someone else
      if (action.changes.type === "possesses") {
        const alreadyPossessed = currentRels.some(
          (r) =>
            r.target === action?.changes?.target &&
            r.type === "possesses" &&
            r.source !== action.changes.source
        );
        if (alreadyPossessed) {
          issues.push(
            `${action.changes.target} is already possessed by another entity`
          );
        }
      }
    }

    return issues;
  }

  createTimelineBranch(
    fromTimeline: string,
    atSequence: number,
    branchName: string,
    divergenceReason: string
  ): string {
    const sourceTimeline = this.timelines.get(fromTimeline);
    if (!sourceTimeline) {
      throw new Error(`Source timeline ${fromTimeline} not found`);
    }

    // Clone the graph state at the branch point
    const newGraphBuilder = new TemporalGraphBuilder();

    // Copy state up to branch point
    const sourceState =
      sourceTimeline.graphBuilder.getStateAtSequence(atSequence);

    // Copy entities
    sourceState.entities.forEach((entity: Entity, id: string) => {
      newGraphBuilder.addEntity(entity);
    });

    // Copy relationships
    sourceState.relationships.forEach((rel: Relationship, id: string) => {
      newGraphBuilder.addRelationship(rel);
    });

    // Copy state changes up to branch point
    const allChanges = sourceTimeline.graphBuilder.getStateChanges();
    allChanges
      .filter((change) => change.sequence <= atSequence)
      .forEach((change) => newGraphBuilder.applyStateChange(change));

    // Create new timeline
    const newTimeline: Timeline = {
      id: branchName,
      name: branchName,
      parentTimeline: fromTimeline,
      branchPoint: atSequence,
      graphBuilder: newGraphBuilder,
      playerActions: [],
      canonViolations: [],
    };

    this.timelines.set(branchName, newTimeline);
    return branchName;
  }

  mergeTimelines(
    sourceId: string,
    targetId: string,
    atSequence: number
  ): { success: boolean; conflicts: string[]; mergedChanges?: number } {
    const source = this.timelines.get(sourceId);
    const target = this.timelines.get(targetId);

    if (!source || !target) {
      return { success: false, conflicts: ["Timeline not found"] };
    }

    const conflicts: string[] = [];
    const sourceState = source.graphBuilder.getStateAtSequence(atSequence);
    const targetState = target.graphBuilder.getStateAtSequence(atSequence);

    // Check for conflicts
    sourceState.entities.forEach((entity: Entity, id: string) => {
      const targetEntity = targetState.entities.get(id);
      if (targetEntity) {
        // Check if states differ
        const sourceKeys = Object.keys(entity);
        const targetKeys = Object.keys(targetEntity);

        for (const key of sourceKeys) {
          if (
            targetEntity[key] !== undefined &&
            entity[key] !== targetEntity[key]
          ) {
            conflicts.push(
              `Conflicting states for entity ${id}: ${key} differs`
            );
          }
        }
      }
    });

    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }

    // Apply state changes from source that occurred after branch point
    const sourceChanges = source.graphBuilder
      .getStateChanges()
      .filter((change) => change.sequence >= atSequence);

    // Apply changes from source that don't exist in target
    let mergedCount = 0;
    sourceChanges.forEach((change) => {
      // Check if this change already exists in target
      const targetChanges = target.graphBuilder.getStateChanges();
      const existsInTarget = targetChanges.some(
        (tc) =>
          tc.sequence === change.sequence &&
          tc.entityId === change.entityId &&
          tc.type === change.type
      );

      if (!existsInTarget) {
        target.graphBuilder.applyStateChange(change);
        mergedCount++;
      }
    });

    // Also merge entities and relationships that were added in source
    sourceState.entities.forEach((entity: Entity, id: string) => {
      if (!targetState.entities.has(id)) {
        target.graphBuilder.addEntity(entity);
      }
    });

    sourceState.relationships.forEach((rel: Relationship, id: string) => {
      if (!targetState.relationships.has(id)) {
        target.graphBuilder.addRelationship(rel);
      }
    });

    // Remove source timeline after merge
    this.timelines.delete(sourceId);

    return { success: true, conflicts: [], mergedChanges: mergedCount };
  }

  generateMissionContext(
    playerId: string,
    currentSequence: number,
    missionType: string,
    timelineId: string = "main",
    additionalParams?: any
  ): string {
    const timeline = this.timelines.get(timelineId);
    if (!timeline) return "Timeline not found";

    const state = timeline.graphBuilder.getStateAtSequence(currentSequence);
    let context = `=== Mission Context ===\n`;
    context += `Timeline: ${timeline.name}\n`;
    context += `Current Sequence: ${currentSequence}\n`;
    context += `Mission Type: ${missionType}\n\n`;

    // Current world state
    context += `== Current State ==\n`;

    // Entities
    context += `Active Entities:\n`;
    state.entities.forEach((entity: Entity, id: string) => {
      if (
        additionalParams?.focusEntity === id ||
        !additionalParams?.focusEntity
      ) {
        context += `- ${entity.name} (${entity.type}): ${JSON.stringify(entity)}\n`;
      }
    });

    // Relationships
    context += `\nActive Relationships:\n`;
    state.relationships.forEach((rel: Relationship, id: string) => {
      context += `- ${rel.source} ${rel.type} ${rel.target}\n`;
    });

    // Recent events
    context += `\n== Recent Events ==\n`;
    const recentChanges = timeline.graphBuilder
      .getStateChanges()
      .filter(
        (change) =>
          change.sequence >= currentSequence - 5 &&
          change.sequence < currentSequence
      )
      .slice(-5);

    recentChanges.forEach((change) => {
      context += `- Sequence ${change.sequence}: ${change.description}\n`;
    });

    // Upcoming canon events
    context += `\n== Canon Constraints ==\n`;
    for (const event of this.canonEvents) {
      const conditions = event.triggerConditions;
      if (conditions.maxSequence && conditions.maxSequence > currentSequence) {
        context += `- ${event.name} (by sequence ${conditions.maxSequence}): ${event.description}\n`;
      }
    }

    return context;
  }

  getActiveTimelines(): Array<{ id: string; name: string }> {
    return Array.from(this.timelines.entries()).map(([id, timeline]) => ({
      id,
      name: timeline.name,
    }));
  }
}

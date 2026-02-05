import { Entity, Relationship, StateChange } from "../types";

export interface GraphState {
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
  metadata: Record<string, any>;
}

export interface TemporalGraph {
  sequences: number[];
  graphSnapshots: Map<number, GraphState>;
  stateChanges: StateChange[];
  entityHistory: Map<string, Array<{ sequence: number; state: Entity }>>;
  relationshipHistory: Map<
    string,
    Array<{ sequence: number; state: Relationship }>
  >;
}

export class TemporalGraphBuilder {
  private graphSnapshots: Map<number, GraphState> = new Map();
  private stateChanges: StateChange[] = [];
  private entityStateHistory: Map<
    string,
    Array<{ sequence: number; state: Entity }>
  > = new Map();
  private relationshipStateHistory: Map<
    string,
    Array<{ sequence: number; state: Relationship }>
  > = new Map();
  private sequenceOrder: Set<number> = new Set();
  private currentSequence: number = 0;

  constructor() {
    // Initialize with empty state at sequence 0
    this.graphSnapshots.set(0, {
      entities: new Map(),
      relationships: new Map(),
      metadata: {},
    });
    this.sequenceOrder.add(0);
  }

  addEntity(entity: Entity): void {
    const currentState = this.getCurrentState();
    currentState.entities.set(entity.id, { ...entity });

    if (!this.entityStateHistory.has(entity.id)) {
      this.entityStateHistory.set(entity.id, []);
    }
    this.entityStateHistory.get(entity.id)!.push({
      sequence: this.currentSequence,
      state: { ...entity },
    });
  }

  addRelationship(relationship: Relationship): void {
    const currentState = this.getCurrentState();
    currentState.relationships.set(relationship.id, { ...relationship });

    if (!this.relationshipStateHistory.has(relationship.id)) {
      this.relationshipStateHistory.set(relationship.id, []);
    }
    this.relationshipStateHistory.get(relationship.id)!.push({
      sequence: this.currentSequence,
      state: { ...relationship },
    });
  }

  applyStateChange(change: StateChange): void {
    if (change.sequence > this.currentSequence) {
      this.currentSequence = change.sequence;
      this.sequenceOrder.add(change.sequence);
      const prevState = this.getStateAtSequence(change.sequence - 1);
      this.graphSnapshots.set(change.sequence, {
        entities: new Map(prevState.entities),
        relationships: new Map(prevState.relationships),
        metadata: { ...prevState.metadata },
      });
    }

    const currentState = this.getCurrentState();
    const safeChanges = change.changes || {};

    switch (change.type) {
      case "entity_update":
        if (change.entityId && currentState.entities.has(change.entityId)) {
          const entity = currentState.entities.get(change.entityId)!;
          const updatedEntity = { ...entity, ...safeChanges };
          currentState.entities.set(change.entityId, updatedEntity);

          if (!this.entityStateHistory.has(change.entityId)) {
            this.entityStateHistory.set(change.entityId, []);
          }
          this.entityStateHistory.get(change.entityId)!.push({
            sequence: change.sequence,
            state: updatedEntity,
          });
        }
        break;

      case "entity_add":
        if (change.entityId) {
          const newEntity: Entity = {
            id: change.entityId,
            name: (safeChanges as any).name || change.entityId,
            type: (safeChanges as any).type || "unknown",
            ...safeChanges,
          };
          currentState.entities.set(change.entityId, newEntity);

          if (!this.entityStateHistory.has(change.entityId)) {
            this.entityStateHistory.set(change.entityId, []);
          }
          this.entityStateHistory.get(change.entityId)!.push({
            sequence: change.sequence,
            state: newEntity,
          });
        }
        break;

      case "entity_remove":
        if (change.entityId) {
          currentState.entities.delete(change.entityId);
        }
        break;

      case "relationship_add":
        if (change.relationshipId) {
          const newRel: Relationship = {
            id: change.relationshipId,
            source: (safeChanges as any).source,
            target: (safeChanges as any).target,
            type: (safeChanges as any).type,
            strength: (safeChanges as any).strength || 1,
            ...safeChanges,
          };
          currentState.relationships.set(change.relationshipId, newRel);

          if (!this.relationshipStateHistory.has(change.relationshipId)) {
            this.relationshipStateHistory.set(change.relationshipId, []);
          }
          this.relationshipStateHistory.get(change.relationshipId)!.push({
            sequence: change.sequence,
            state: newRel,
          });
        }
        break;

      case "relationship_remove":
        if (change.relationshipId) {
          currentState.relationships.delete(change.relationshipId);
        }
        break;
    }
    this.stateChanges.push(change);
  }

  getStateAtSequence(sequence: number): GraphState {
    const sequences = Array.from(this.sequenceOrder).sort((a, b) => a - b);
    let targetSequence = 0;

    for (const seq of sequences) {
      if (seq <= sequence) {
        targetSequence = seq;
      } else {
        break;
      }
    }
    return (
      this.graphSnapshots.get(targetSequence) || this.graphSnapshots.get(0)!
    );
  }

  private getCurrentState(): GraphState {
    return (
      this.graphSnapshots.get(this.currentSequence) ||
      this.graphSnapshots.get(0)!
    );
  }

  build(): TemporalGraph {
    const clonedSnapshots = new Map<number, GraphState>();
    this.graphSnapshots.forEach((state, seq) => {
      clonedSnapshots.set(seq, {
        entities: new Map(state.entities),
        relationships: new Map(state.relationships),
        metadata: { ...state.metadata },
      });
    });

    return {
      sequences: Array.from(this.sequenceOrder),
      graphSnapshots: clonedSnapshots,
      stateChanges: [...this.stateChanges],
      entityHistory: new Map(this.entityStateHistory),
      relationshipHistory: new Map(this.relationshipStateHistory),
    };
  }

  getStateChanges(): StateChange[] {
    return [...this.stateChanges];
  }

  getCurrentGraphState(): GraphState {
    return this.getCurrentState();
  }

  getHistory(): Map<number, GraphState> {
    return new Map(this.graphSnapshots);
  }
}

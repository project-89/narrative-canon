/**
 * Narrative Query Engine - Advanced querying capabilities for narrative data
 * @module NarrativeQueryEngine
 */

import { CanonTimelineManager } from './canon-timeline-manager';
import { Entity, Relationship, StateChange, Event } from './types';

/**
 * Options for querying the narrative
 */
export interface QueryOptions {
  /** Timeline to query (default: 'main') */
  timelineId?: string;
  /** Include inactive entities/relationships */
  includeInactive?: boolean;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  sortBy?: 'sequence' | 'name' | 'type';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Result of a narrative query
 */
export interface QueryResult<T> {
  /** Query results */
  data: T[];
  /** Total count before pagination */
  total: number;
  /** Query execution time in ms */
  executionTime: number;
  /** Any warnings or notes */
  warnings?: string[];
}

/**
 * Provides advanced querying capabilities for narrative data
 * 
 * @remarks
 * The NarrativeQueryEngine enables complex queries across:
 * - Entity states at any point in time
 * - Relationship networks
 * - State change history
 * - Canon event tracking
 * - Cross-timeline comparisons
 * 
 * @example
 * ```typescript
 * const engine = new NarrativeQueryEngine(manager);
 * 
 * // Find all characters at a location
 * const characters = await engine.findEntitiesAtLocation('castle', 50);
 * 
 * // Get relationship network for an entity
 * const network = await engine.getRelationshipNetwork('hero', 2, 75);
 * 
 * // Find all state changes by a player
 * const changes = await engine.findStateChangesByPlayer('player1', {
 *   timelineId: 'main',
 *   limit: 10
 * });
 * ```
 * 
 * @public
 */
export class NarrativeQueryEngine {
  constructor(private manager: CanonTimelineManager) {}

  /**
   * Finds entities by type at a specific sequence
   * 
   * @param type - Entity type to search for
   * @param sequence - Sequence number to query
   * @param options - Query options
   * @returns Query result with matching entities
   * 
   * @example
   * ```typescript
   * const characters = await engine.findEntitiesByType('character', 50);
   * console.log(`Found ${characters.total} characters`);
   * ```
   */
  async findEntitiesByType(
    type: string,
    sequence: number,
    options: QueryOptions = {}
  ): Promise<QueryResult<Entity>> {
    const start = Date.now();
    const { timelineId = 'main', limit, offset = 0 } = options;

    const state = this.manager.getTimelineState(timelineId, sequence);
    if (!state) {
      return {
        data: [],
        total: 0,
        executionTime: Date.now() - start,
        warnings: ['Timeline not found']
      };
    }

    const entities = Array.from(state.entities.values())
      .filter(e => e.type === type);

    const total = entities.length;
    const data = limit 
      ? entities.slice(offset, offset + limit)
      : entities.slice(offset);

    return {
      data,
      total,
      executionTime: Date.now() - start
    };
  }

  /**
   * Finds entities at a specific location
   * 
   * @param locationId - ID of the location
   * @param sequence - Sequence number to query
   * @param options - Query options
   * @returns Query result with entities at the location
   */
  async findEntitiesAtLocation(
    locationId: string,
    sequence: number,
    options: QueryOptions = {}
  ): Promise<QueryResult<Entity>> {
    const start = Date.now();
    const { timelineId = 'main' } = options;

    const state = this.manager.getTimelineState(timelineId, sequence);
    if (!state) {
      return {
        data: [],
        total: 0,
        executionTime: Date.now() - start,
        warnings: ['Timeline not found']
      };
    }

    // Find entities with location property
    const entitiesAtLocation = Array.from(state.entities.values())
      .filter(e => e.location === locationId);

    // Also find entities with located_at relationships
    const relationships = this.manager.getActiveRelationships(sequence, timelineId);
    const locatedEntities = relationships
      .filter(r => r.type === 'located_at' && r.target === locationId)
      .map(r => state.entities.get(r.source))
      .filter(e => e && !entitiesAtLocation.some(el => el.id === e.id)) as Entity[];

    const allEntities = [...entitiesAtLocation, ...locatedEntities];

    return {
      data: allEntities,
      total: allEntities.length,
      executionTime: Date.now() - start
    };
  }

  /**
   * Gets the relationship network for an entity
   * 
   * @param entityId - Center entity ID
   * @param depth - How many hops to include (1 = direct connections only)
   * @param sequence - Sequence number to query
   * @param options - Query options
   * @returns Network of entities and relationships
   * 
   * @example
   * ```typescript
   * const network = await engine.getRelationshipNetwork('hero', 2, 100);
   * console.log(`Network contains ${network.entities.length} entities`);
   * console.log(`Connected by ${network.relationships.length} relationships`);
   * ```
   */
  async getRelationshipNetwork(
    entityId: string,
    depth: number,
    sequence: number,
    options: QueryOptions = {}
  ): Promise<{
    entities: Entity[];
    relationships: Relationship[];
    depth: number;
  }> {
    const { timelineId = 'main' } = options;
    const state = this.manager.getTimelineState(timelineId, sequence);
    
    if (!state || !state.entities.has(entityId)) {
      return { entities: [], relationships: [], depth: 0 };
    }

    const visitedEntities = new Set<string>();
    const networkEntities = new Map<string, Entity>();
    const networkRelationships = new Map<string, Relationship>();

    // BFS to explore network
    const queue: { id: string; currentDepth: number }[] = [
      { id: entityId, currentDepth: 0 }
    ];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      
      if (visitedEntities.has(id) || currentDepth > depth) {
        continue;
      }

      visitedEntities.add(id);
      const entity = state.entities.get(id);
      if (entity) {
        networkEntities.set(id, entity);
      }

      if (currentDepth < depth) {
        // Find all relationships involving this entity
        const relationships = Array.from(state.relationships.values())
          .filter(r => r.source === id || r.target === id);

        relationships.forEach(rel => {
          networkRelationships.set(rel.id, rel);
          
          // Add connected entities to queue
          const otherId = rel.source === id ? rel.target : rel.source;
          if (!visitedEntities.has(otherId)) {
            queue.push({ id: otherId, currentDepth: currentDepth + 1 });
          }
        });
      }
    }

    return {
      entities: Array.from(networkEntities.values()),
      relationships: Array.from(networkRelationships.values()),
      depth
    };
  }

  /**
   * Finds state changes by a specific player
   * 
   * @param playerId - ID of the player
   * @param options - Query options
   * @returns Query result with player's state changes
   */
  async findStateChangesByPlayer(
    playerId: string,
    options: QueryOptions = {}
  ): Promise<QueryResult<StateChange>> {
    const start = Date.now();
    const { timelineId = 'main', limit, offset = 0 } = options;

    const timeline = this.manager['timelines'].get(timelineId);
    if (!timeline) {
      return {
        data: [],
        total: 0,
        executionTime: Date.now() - start,
        warnings: ['Timeline not found']
      };
    }

    const playerActions = timeline.playerActions
      .filter(action => action.playerId === playerId)
      .map(({ playerId, timestamp, ...stateChange }) => stateChange);

    const total = playerActions.length;
    const data = limit
      ? playerActions.slice(offset, offset + limit)
      : playerActions.slice(offset);

    return {
      data,
      total,
      executionTime: Date.now() - start
    };
  }

  /**
   * Finds entities matching a complex query
   * 
   * @param query - Query conditions
   * @param sequence - Sequence number to query
   * @param options - Query options
   * @returns Query result with matching entities
   * 
   * @example
   * ```typescript
   * const wounded = await engine.findEntitiesWhere({
   *   type: 'character',
   *   health: { $lt: 50 },
   *   status: { $in: ['wounded', 'critical'] }
   * }, 100);
   * ```
   */
  async findEntitiesWhere(
    query: Record<string, any>,
    sequence: number,
    options: QueryOptions = {}
  ): Promise<QueryResult<Entity>> {
    const start = Date.now();
    const { timelineId = 'main', limit, offset = 0 } = options;

    const state = this.manager.getTimelineState(timelineId, sequence);
    if (!state) {
      return {
        data: [],
        total: 0,
        executionTime: Date.now() - start,
        warnings: ['Timeline not found']
      };
    }

    const entities = Array.from(state.entities.values())
      .filter(entity => this.matchesQuery(entity, query));

    const total = entities.length;
    const data = limit
      ? entities.slice(offset, offset + limit)
      : entities.slice(offset);

    return {
      data,
      total,
      executionTime: Date.now() - start
    };
  }

  /**
   * Compares entity states across timelines
   * 
   * @param entityId - Entity to compare
   * @param sequence - Sequence number to compare at
   * @param timelineIds - Timelines to compare
   * @returns Comparison results
   */
  async compareEntityAcrossTimelines(
    entityId: string,
    sequence: number,
    timelineIds: string[]
  ): Promise<{
    entityId: string;
    sequence: number;
    states: Map<string, Entity | null>;
    differences: Array<{
      property: string;
      values: Map<string, any>;
    }>;
  }> {
    const states = new Map<string, Entity | null>();
    
    // Get entity state in each timeline
    for (const timelineId of timelineIds) {
      const entity = this.manager.getEntityState(entityId, sequence, timelineId);
      states.set(timelineId, entity);
    }

    // Find differences
    const differences: Array<{ property: string; values: Map<string, any> }> = [];
    const allProperties = new Set<string>();

    // Collect all properties
    states.forEach(entity => {
      if (entity) {
        Object.keys(entity).forEach(prop => allProperties.add(prop));
      }
    });

    // Compare each property
    allProperties.forEach(prop => {
      const values = new Map<string, any>();
      let hasDifference = false;
      let firstValue: any;

      states.forEach((entity, timelineId) => {
        const value = entity ? entity[prop] : undefined;
        values.set(timelineId, value);
        
        if (firstValue === undefined) {
          firstValue = value;
        } else if (value !== firstValue) {
          hasDifference = true;
        }
      });

      if (hasDifference) {
        differences.push({ property: prop, values });
      }
    });

    return {
      entityId,
      sequence,
      states,
      differences
    };
  }

  /**
   * Finds critical narrative moments
   * 
   * @param options - Query options
   * @returns Array of critical moments
   */
  async findCriticalMoments(
    options: QueryOptions = {}
  ): Promise<Array<{
    sequence: number;
    type: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>> {
    const { timelineId = 'main' } = options;
    const timeline = this.manager['timelines'].get(timelineId);
    
    if (!timeline) return [];

    const criticalMoments: Array<{
      sequence: number;
      type: string;
      description: string;
      impact: 'high' | 'medium' | 'low';
    }> = [];

    // Find timeline branches
    this.manager.getActiveTimelines().forEach((t: { id: string; name: string }) => {
      if (t.id !== 'main') {
        const branch = this.manager['timelines'].get(t.id);
        if (branch?.parentTimeline === timelineId && branch.branchPoint) {
          criticalMoments.push({
            sequence: branch.branchPoint,
            type: 'timeline_branch',
            description: `Timeline '${t.name}' branches from ${timelineId}`,
            impact: 'high'
          });
        }
      }
    });

    // Find canon event deadlines
    this.manager['canonEvents'].forEach(event => {
      if (event.triggerConditions.maxSequence) {
        criticalMoments.push({
          sequence: event.triggerConditions.maxSequence,
          type: 'canon_deadline',
          description: `Deadline for: ${event.description}`,
          impact: event.importance === 'critical' ? 'high' : 'medium'
        });
      }
    });

    // Sort by sequence
    return criticalMoments.sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * Helper to match entity against query conditions
   * @private
   */
  private matchesQuery(entity: Entity, query: Record<string, any>): boolean {
    for (const [key, condition] of Object.entries(query)) {
      const entityValue = entity[key];

      // Direct equality
      if (typeof condition !== 'object') {
        if (entityValue !== condition) return false;
        continue;
      }

      // Query operators
      if (condition.$eq !== undefined && entityValue !== condition.$eq) return false;
      if (condition.$ne !== undefined && entityValue === condition.$ne) return false;
      if (condition.$gt !== undefined && !(entityValue > condition.$gt)) return false;
      if (condition.$gte !== undefined && !(entityValue >= condition.$gte)) return false;
      if (condition.$lt !== undefined && !(entityValue < condition.$lt)) return false;
      if (condition.$lte !== undefined && !(entityValue <= condition.$lte)) return false;
      if (condition.$in !== undefined && !condition.$in.includes(entityValue)) return false;
      if (condition.$nin !== undefined && condition.$nin.includes(entityValue)) return false;
      if (condition.$exists !== undefined) {
        const exists = entityValue !== undefined;
        if (exists !== condition.$exists) return false;
      }
    }

    return true;
  }
}
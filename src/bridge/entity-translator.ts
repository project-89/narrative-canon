/**
 * Entity Translator — Bidirectional translation between Aureum ECS entities
 * and Narrative Canon graph entities.
 *
 * Aureum Entity: { id, tags: Set, stats: Map, links: Map, meta: Record }
 * Canon Entity:  { id, name, type, ...properties }
 *
 * The translator preserves information across conversions so that:
 *   canon → aureum → canon  ≈  identity (modulo precision)
 *   aureum → canon → aureum ≈  identity (modulo precision)
 */

import {
  Entity as AureumEntity,
  createEntity as createAureumEntity,
  World,
} from '../engine/world';
import { Entity as CanonEntity, Relationship } from '../types';
import { GraphOperation } from '../git/types';
import { WorldChange, ChangeOperation } from '../engine/rules';

// ─── Aureum → Canon ─────────────────────────────────────────────────────────

/**
 * Convert an Aureum ECS entity to a Narrative Canon entity.
 */
export function aureumToCanonEntity(entity: AureumEntity): CanonEntity {
  const canonEntity: CanonEntity = {
    id: entity.id,
    name: (entity.meta.name as string) ?? entity.id,
    type: inferCanonType(entity),
  };

  // Flatten stats into properties
  for (const [key, value] of entity.stats) {
    canonEntity[key] = value;
  }

  // Copy meta properties (except name/type which are already set)
  for (const [key, value] of Object.entries(entity.meta)) {
    if (key !== 'name' && key !== 'type') {
      canonEntity[key] = value;
    }
  }

  // Tags array as a property for roundtrip preservation
  canonEntity._tags = Array.from(entity.tags);

  return canonEntity;
}

/**
 * Convert an Aureum World snapshot to an array of Canon entities
 * plus an array of Relationships derived from entity links.
 */
export function aureumWorldToCanon(world: World): {
  entities: CanonEntity[];
  relationships: Relationship[];
} {
  const entities: CanonEntity[] = [];
  const relationships: Relationship[] = [];

  for (const entity of world.all()) {
    entities.push(aureumToCanonEntity(entity));

    // Convert links → relationships
    for (const [linkKey, targetId] of entity.links) {
      relationships.push({
        id: `${entity.id}_${linkKey}_${targetId}`,
        source: entity.id,
        target: targetId,
        type: linkKey,
      });
    }
  }

  return { entities, relationships };
}

/**
 * Infer the narrative type from Aureum tags.
 * Priority: explicit meta.type > semantic tags > first tag > 'entity'
 */
function inferCanonType(entity: AureumEntity): string {
  if (entity.meta.type) return entity.meta.type as string;

  // Check semantic tags in priority order
  const typeMap: [string, string][] = [
    ['player', 'character'],
    ['character', 'character'],
    ['npc', 'character'],
    ['enemy', 'character'],
    ['card', 'card'],
    ['location', 'location'],
    ['room', 'location'],
    ['item', 'object'],
    ['artifact', 'object'],
    ['treasure', 'object'],
    ['objective', 'objective'],
    ['game_state', 'system'],
    ['organization', 'organization'],
    ['event', 'event'],
  ];

  for (const [tag, type] of typeMap) {
    if (entity.tags.has(tag)) return type;
  }

  // Fallback: first tag if any
  const firstTag = entity.tags.values().next().value;
  return firstTag ?? 'entity';
}

// ─── Canon → Aureum ─────────────────────────────────────────────────────────

/**
 * Convert a Narrative Canon entity to an Aureum ECS entity.
 */
export function canonToAureumEntity(entity: CanonEntity): AureumEntity {
  const tags = inferAureumTags(entity);
  const stats: Record<string, number> = {};
  const meta: Record<string, unknown> = {
    name: entity.name,
  };

  // Separate numeric properties → stats, others → meta
  for (const [key, value] of Object.entries(entity)) {
    if (['id', 'name', 'type', '_tags'].includes(key)) continue;

    if (typeof value === 'number') {
      stats[key] = value;
    } else if (value !== null && value !== undefined) {
      meta[key] = value;
    }
  }

  return createAureumEntity(entity.id, { tags, stats, meta });
}

/**
 * Convert Canon entities + relationships into an Aureum World.
 */
export function canonToAureumWorld(
  entities: CanonEntity[],
  relationships?: Relationship[]
): World {
  const aureumEntities = entities.map(canonToAureumEntity);
  const world = new World(aureumEntities);

  // Apply relationships as links
  if (relationships) {
    for (const rel of relationships) {
      const entity = world.get(rel.source);
      if (entity) {
        entity.links.set(rel.type, rel.target);
      }
    }
  }

  return world;
}

/**
 * Infer Aureum tags from a Canon entity.
 * Uses _tags roundtrip property if available, otherwise infers from type.
 */
function inferAureumTags(entity: CanonEntity): string[] {
  // Roundtrip: if we stored tags from a previous conversion, restore them
  if (Array.isArray(entity._tags)) {
    return entity._tags as string[];
  }

  const tags: string[] = [];

  // Add type-based tags
  const typeTagMap: Record<string, string[]> = {
    character: ['character'],
    card: ['card'],
    location: ['location'],
    object: ['item'],
    objective: ['objective'],
    system: ['game_state'],
    organization: ['organization'],
    event: ['event'],
  };

  const typeTags = typeTagMap[entity.type] ?? [entity.type];
  tags.push(...typeTags);

  // Infer status tags from common properties
  if (entity.status === 'active' || entity.active === true) tags.push('active');
  if (entity.status === 'dead' || entity.alive === false) tags.push('dead');
  if (entity.in_hand === true) tags.push('in_hand');

  return tags;
}

// ─── World Changes → Graph Operations ────────────────────────────────────────

/**
 * Convert a set of Aureum WorldChanges into NarrativeGit GraphOperations.
 * This is used when we want to reflect mechanical game state changes
 * in the narrative graph without explicit narrative_commit sideEffects.
 */
export function worldChangesToGraphOps(
  changes: WorldChange[],
  world: World
): GraphOperation[] {
  const ops: GraphOperation[] = [];

  for (const change of changes) {
    const entity = world.get(change.target);
    if (!entity) continue;

    // Build a partial update from the operations
    const propertyChanges: Record<string, any> = {};
    let hasChanges = false;

    for (const op of change.operations) {
      switch (op.type) {
        case 'setStat':
          propertyChanges[op.key] = op.value;
          hasChanges = true;
          break;
        case 'incrementStat': {
          const current = entity.stats.get(op.key) ?? 0;
          propertyChanges[op.key] = current + op.amount;
          hasChanges = true;
          break;
        }
        case 'addTag':
          if (op.tag === 'dead' || op.tag === 'destroyed') {
            propertyChanges.status = 'dead';
            hasChanges = true;
          }
          break;
        case 'removeTag':
          if (op.tag === 'active') {
            propertyChanges.status = 'inactive';
            hasChanges = true;
          }
          break;
      }
    }

    if (hasChanges) {
      ops.push({
        id: `change_${change.target}_${Date.now()}`,
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: change.target,
          changes: propertyChanges,
        },
      });
    }
  }

  return ops;
}

// ─── Graph Operations for New Entities ──────────────────────────────────────

/**
 * Create an ADD_ENTITY graph operation from an Aureum entity.
 */
export function createAddEntityOp(entity: AureumEntity): GraphOperation {
  return {
    id: `add_${entity.id}_${Date.now()}`,
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: aureumToCanonEntity(entity),
  };
}

/**
 * Create an UPDATE_ENTITY graph operation from Aureum WorldChange operations.
 */
export function createUpdateEntityOp(
  entityId: string,
  changes: Record<string, any>,
  reason?: string
): GraphOperation {
  return {
    id: `update_${entityId}_${Date.now()}`,
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId,
      changes,
    },
    metadata: reason ? { reason, reversible: true } : undefined,
  };
}

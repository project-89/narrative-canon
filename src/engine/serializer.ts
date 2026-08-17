/**
 * Aureum Rules Engine — Serializer
 *
 * JSON serialization for the complete engine state.
 * Everything is designed to be fully serializable — no functions in data.
 */

import { Entity, createEntity, World, EntityMatcher } from './world';
import { Rule, RuleSet, createRuleSet, WorldChange, SideEffect } from './rules';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface SerializedEntity {
  id: string;
  tags: string[];
  stats: Record<string, number>;
  links: Record<string, string>;
  meta: Record<string, unknown>;
}

export interface SerializedWorld {
  entities: SerializedEntity[];
}

export interface SerializedRuleSet {
  id: string;
  name: string;
  description?: string;
  rules: Rule[];
  spentRuleIds: string[];
}

export interface SerializedEngineState {
  world: SerializedWorld;
  ruleSet: SerializedRuleSet;
}

// ─── Entity Serialization ────────────────────────────────────────────────────

export function serializeEntity(entity: Entity): SerializedEntity {
  return {
    id: entity.id,
    tags: Array.from(entity.tags),
    stats: Object.fromEntries(entity.stats),
    links: Object.fromEntries(entity.links),
    meta: entity.meta,
  };
}

export function deserializeEntity(data: SerializedEntity): Entity {
  return createEntity(data.id, {
    tags: data.tags,
    stats: data.stats,
    links: data.links,
    meta: data.meta,
  });
}

// ─── World Serialization ─────────────────────────────────────────────────────

export function serializeWorld(world: World): SerializedWorld {
  return {
    entities: world.all().map(serializeEntity),
  };
}

export function deserializeWorld(data: SerializedWorld): World {
  const entities = data.entities.map(deserializeEntity);
  return new World(entities);
}

// ─── RuleSet Serialization ───────────────────────────────────────────────────

export function serializeRuleSet(ruleSet: RuleSet): SerializedRuleSet {
  return {
    id: ruleSet.id,
    name: ruleSet.name,
    description: ruleSet.description,
    rules: ruleSet.rules,
    spentRuleIds: Array.from(ruleSet.spentRuleIds),
  };
}

export function deserializeRuleSet(data: SerializedRuleSet): RuleSet {
  const ruleSet = createRuleSet(data.id, data.name, data.rules, data.description);
  ruleSet.spentRuleIds = new Set(data.spentRuleIds);
  return ruleSet;
}

// ─── Full State Serialization ────────────────────────────────────────────────

export function serializeState(world: World, ruleSet: RuleSet): SerializedEngineState {
  return {
    world: serializeWorld(world),
    ruleSet: serializeRuleSet(ruleSet),
  };
}

export function deserializeState(data: SerializedEngineState): { world: World; ruleSet: RuleSet } {
  return {
    world: deserializeWorld(data.world),
    ruleSet: deserializeRuleSet(data.ruleSet),
  };
}

// ─── JSON String Helpers ─────────────────────────────────────────────────────

export function toJSON(world: World, ruleSet: RuleSet): string {
  return JSON.stringify(serializeState(world, ruleSet), null, 2);
}

export function fromJSON(json: string): { world: World; ruleSet: RuleSet } {
  return deserializeState(JSON.parse(json));
}

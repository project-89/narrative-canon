/**
 * Aureum Rules Engine — Evaluator
 *
 * The rule evaluation engine. Given a trigger entity ID, a World, and a RuleSet,
 * finds matching rules, ranks by specificity, applies changes, and collects side effects.
 */

import { World, EntityMatcher } from './world';
import {
  Rule,
  RuleSet,
  RuleMatch,
  WorldChange,
  SideEffect,
  ChangeOperation,
  calculateSpecificity,
} from './rules';

// ─── Step Result ─────────────────────────────────────────────────────────────

export interface StepResult {
  /** The new world state after applying changes */
  world: World;
  /** The rule that matched (null if no match) */
  match: RuleMatch | null;
  /** All side effects collected */
  sideEffects: SideEffect[];
}

export interface TickResult {
  /** The new world state after all auto-triggers */
  world: World;
  /** All matches in evaluation order */
  matches: RuleMatch[];
  /** All side effects collected */
  sideEffects: SideEffect[];
}

// ─── Side Effect Handler Registry ────────────────────────────────────────────

/**
 * A handler function that processes a specific type of side effect.
 * External systems (Nit, pipelines) register these to react to game events
 * without Aureum needing to know about them.
 */
export type SideEffectHandler = (
  effect: SideEffect,
  world: World
) => void | Promise<void>;

const sideEffectHandlers = new Map<string, SideEffectHandler[]>();

/**
 * Register a handler for a specific side effect type.
 * Multiple handlers can be registered for the same type.
 */
export function registerSideEffectHandler(
  type: string,
  handler: SideEffectHandler
): void {
  const existing = sideEffectHandlers.get(type) ?? [];
  existing.push(handler);
  sideEffectHandlers.set(type, existing);
}

/**
 * Remove all handlers for a specific side effect type.
 */
export function clearSideEffectHandlers(type?: string): void {
  if (type) {
    sideEffectHandlers.delete(type);
  } else {
    sideEffectHandlers.clear();
  }
}

/**
 * Process all side effects through registered handlers.
 * Handlers run in registration order. Async handlers are awaited sequentially.
 */
export async function handleSideEffects(
  effects: SideEffect[],
  world: World
): Promise<void> {
  for (const effect of effects) {
    const handlers = sideEffectHandlers.get(effect.type) ?? [];
    for (const handler of handlers) {
      await handler(effect, world);
    }
  }
}

/**
 * Get all registered handler types (for debugging/inspection).
 */
export function getRegisteredHandlerTypes(): string[] {
  return Array.from(sideEffectHandlers.keys());
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Find the best matching rule for a given trigger entity.
 * Returns null if no rule matches.
 */
export function evaluate(
  triggerId: string,
  world: World,
  ruleSet: RuleSet
): RuleMatch | null {
  const matches = evaluateAll(triggerId, world, ruleSet);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Find all matching rules for a given trigger entity, ranked by specificity (highest first).
 */
export function evaluateAll(
  triggerId: string,
  world: World,
  ruleSet: RuleSet
): RuleMatch[] {
  const entity = world.get(triggerId);

  const matches: RuleMatch[] = [];

  for (const rule of ruleSet.rules) {
    // Skip spent one-shot rules
    if (rule.oneShot && ruleSet.spentRuleIds.has(rule.id)) continue;

    // Check trigger match
    if (!matchesTrigger(triggerId, rule.trigger, world, entity !== undefined)) continue;

    // Check additional conditions against the world
    if (rule.conditions) {
      let allConditionsMet = true;
      for (const condition of rule.conditions) {
        if (!world.matches(condition)) {
          allConditionsMet = false;
          break;
        }
      }
      if (!allConditionsMet) continue;
    }

    // Build resolved changes (replace $ references)
    const resolvedChanges = resolveChanges(rule.changes ?? [], triggerId);
    const sideEffects = rule.sideEffects ?? [];
    const specificity = calculateSpecificity(rule);

    // Collect matched entity ids from trigger
    const matchedEntities = entity
      ? [triggerId]
      : world.query(rule.trigger).map((e) => e.id);

    matches.push({
      rule,
      triggerId,
      matchedEntities,
      specificity,
      resolvedChanges,
      sideEffects,
    });
  }

  // Sort by specificity (highest first)
  matches.sort((a, b) => b.specificity - a.specificity);
  return matches;
}

/**
 * Evaluate the best matching rule, apply its changes to the world, and return the result.
 * Returns a new World (the original is not mutated).
 */
export function step(
  triggerId: string,
  world: World,
  ruleSet: RuleSet
): StepResult {
  const match = evaluate(triggerId, world, ruleSet);

  if (!match) {
    return { world, match: null, sideEffects: [] };
  }

  // Clone the world so we don't mutate the original
  const newWorld = world.clone();

  // Apply changes
  applyChanges(newWorld, match.resolvedChanges);

  // Mark one-shot rules as spent
  if (match.rule.oneShot) {
    ruleSet.spentRuleIds.add(match.rule.id);
  }

  return {
    world: newWorld,
    match,
    sideEffects: match.sideEffects,
  };
}

/**
 * Evaluate all "auto-trigger" rules — rules with wildcard triggers that
 * should be checked each tick (e.g., time-based events, global state checks).
 *
 * Rules with a tag condition including 'auto_trigger' in their trigger are eligible.
 * Each matching rule fires exactly once per tick, and all side effects are collected.
 */
export function tick(world: World, ruleSet: RuleSet): TickResult {
  let currentWorld = world;
  const allMatches: RuleMatch[] = [];
  const allSideEffects: SideEffect[] = [];

  // Find all entities and evaluate auto-trigger rules against each
  const entities = currentWorld.all();

  for (const entity of entities) {
    const matches = evaluateAll(entity.id, currentWorld, ruleSet);
    for (const match of matches) {
      // Only fire auto-trigger rules in tick
      const isAutoTrigger = match.rule.trigger.tags?.some(
        (tc) => tc.tag === 'auto_trigger' && !tc.negated
      );
      if (!isAutoTrigger) continue;

      // Apply changes
      const newWorld = currentWorld.clone();
      applyChanges(newWorld, match.resolvedChanges);
      currentWorld = newWorld;

      // Mark one-shot rules as spent
      if (match.rule.oneShot) {
        ruleSet.spentRuleIds.add(match.rule.id);
      }

      allMatches.push(match);
      allSideEffects.push(...match.sideEffects);
    }
  }

  return {
    world: currentWorld,
    matches: allMatches,
    sideEffects: allSideEffects,
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Check if a triggerId matches a rule's trigger matcher.
 */
function matchesTrigger(
  triggerId: string,
  trigger: EntityMatcher,
  world: World,
  entityExists: boolean
): boolean {
  // If trigger specifies a specific id, check it
  if (trigger.id && trigger.id !== '*') {
    if (trigger.id !== triggerId) return false;
  }

  // If the entity doesn't exist in the world, it can't match property conditions
  if (!entityExists) return false;

  // Use the world's query to check property conditions
  const matcherWithId: EntityMatcher = {
    ...trigger,
    id: triggerId,
  };
  return world.matches(matcherWithId);
}

/**
 * Resolve $ references in world changes to actual entity ids.
 */
function resolveChanges(
  changes: WorldChange[],
  triggerId: string
): WorldChange[] {
  return changes.map((change) => ({
    target: change.target === '$' ? triggerId : change.target,
    operations: resolveOperations(change.operations, triggerId),
  }));
}

/**
 * Resolve $ references in change operations.
 */
function resolveOperations(
  operations: ChangeOperation[],
  triggerId: string
): ChangeOperation[] {
  return operations.map((op) => {
    if (op.type === 'setLink' && op.targetId === '$') {
      return { ...op, targetId: triggerId };
    }
    return op;
  });
}

/**
 * Apply a set of world changes to a world (mutates the world in place).
 */
export function applyChanges(world: World, changes: WorldChange[]): void {
  for (const change of changes) {
    const entity = world.get(change.target);
    if (!entity) continue;

    for (const op of change.operations) {
      switch (op.type) {
        case 'addTag':
          entity.tags.add(op.tag);
          break;
        case 'removeTag':
          entity.tags.delete(op.tag);
          break;
        case 'setStat':
          entity.stats.set(op.key, op.value);
          break;
        case 'incrementStat': {
          const current = entity.stats.get(op.key) ?? 0;
          entity.stats.set(op.key, current + op.amount);
          break;
        }
        case 'setLink':
          entity.links.set(op.key, op.targetId);
          break;
        case 'removeLink':
          entity.links.delete(op.key);
          break;
        case 'setMeta':
          entity.meta[op.key] = op.value;
          break;
      }
    }
  }
}

/**
 * Aureum Rules Engine — Rules Module
 *
 * Defines the rule system: trigger → conditions → changes → side effects.
 * All types are designed to be fully JSON-serializable (no functions in data).
 */

import { EntityMatcher } from './world';

// ─── World Changes ───────────────────────────────────────────────────────────

export type ChangeOperation =
  | { type: 'addTag'; tag: string }
  | { type: 'removeTag'; tag: string }
  | { type: 'setStat'; key: string; value: number }
  | { type: 'incrementStat'; key: string; amount: number }
  | { type: 'setLink'; key: string; targetId: string }
  | { type: 'removeLink'; key: string }
  | { type: 'setMeta'; key: string; value: unknown };

/**
 * A mutation to apply to the world state.
 *
 * `target` can be:
 * - A specific entity id (e.g. "PLAYER")
 * - "$" meaning "the entity that triggered the rule"
 * - "$N" meaning "the Nth entity matched by the trigger" (for wildcard triggers)
 */
export interface WorldChange {
  target: string;
  operations: ChangeOperation[];
}

// ─── Side Effects ────────────────────────────────────────────────────────────

/**
 * Side effects are typed payloads for external systems.
 * The engine collects them but does NOT execute them — that's the
 * responsibility of the consuming application.
 *
 * Examples:
 * - { type: 'narrative', payload: { text: 'The cave is pitch black.' } }
 * - { type: 'sound', payload: { file: 'cave_ambience.mp3' } }
 * - { type: 'ai_generate', payload: { prompt: '...' } }
 * - { type: 'emit_event', payload: { event: 'player_entered_cave' } }
 */
export interface SideEffect {
  type: string;
  payload: Record<string, unknown>;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

/**
 * A Rule is the core building block of the engine.
 *
 * - `trigger`: matches against the entity being interacted with
 * - `conditions`: additional world-state constraints (all must match)
 * - `changes`: mutations to apply to the world state
 * - `sideEffects`: typed payloads for external systems
 *
 * Rules are ranked by specificity when multiple match. More specific = higher priority.
 */
export interface Rule {
  id: string;
  trigger: EntityMatcher;
  conditions?: EntityMatcher[];
  changes?: WorldChange[];
  sideEffects?: SideEffect[];
  /** Optional priority override. Higher = evaluated first. Default: 0 */
  priority?: number;
  /** Optional: if true, rule can only fire once then is marked spent */
  oneShot?: boolean;
  /** Optional human-readable description */
  description?: string;
}

// ─── Rule Match Result ───────────────────────────────────────────────────────

/**
 * The result of evaluating a rule against a trigger.
 * Contains the matched rule, the triggering entity id, the specificity score,
 * and the resolved changes (with $ references replaced).
 */
export interface RuleMatch {
  rule: Rule;
  triggerId: string;
  matchedEntities: string[];
  specificity: number;
  resolvedChanges: WorldChange[];
  sideEffects: SideEffect[];
}

// ─── Rule Set ────────────────────────────────────────────────────────────────

/**
 * A named collection of rules that can be loaded/saved as a unit.
 */
export interface RuleSet {
  id: string;
  name: string;
  description?: string;
  rules: Rule[];
  /** Track which oneShot rules have been spent */
  spentRuleIds: Set<string>;
}

export function createRuleSet(
  id: string,
  name: string,
  rules: Rule[],
  description?: string
): RuleSet {
  return {
    id,
    name,
    description,
    rules,
    spentRuleIds: new Set(),
  };
}

// ─── Specificity Scoring ─────────────────────────────────────────────────────

/**
 * Calculate how specific a rule is. More conditions = higher specificity.
 * This determines priority when multiple rules match the same trigger.
 */
export function calculateSpecificity(rule: Rule): number {
  let score = rule.priority ?? 0;

  // Specific ID > wildcard
  const trigger = rule.trigger;
  if (trigger.id && trigger.id !== '*') score += 10;

  // Each property condition adds specificity
  score += (trigger.tags?.length ?? 0) * 2;
  score += (trigger.stats?.length ?? 0) * 3;
  score += (trigger.links?.length ?? 0) * 3;

  // Additional world conditions add more specificity
  if (rule.conditions) {
    for (const condition of rule.conditions) {
      if (condition.id && condition.id !== '*') score += 5;
      score += (condition.tags?.length ?? 0) * 2;
      score += (condition.stats?.length ?? 0) * 3;
      score += (condition.links?.length ?? 0) * 3;
    }
  }

  return score;
}

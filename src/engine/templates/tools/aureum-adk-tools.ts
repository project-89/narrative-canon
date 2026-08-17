/**
 * Aureum ADK FunctionTools
 *
 * Wraps Aureum engine operations as ADK FunctionTool instances
 * so agents can load, inspect, simulate, and validate games.
 *
 * Tools support both explicit gameJson string AND a useCurrentGame flag
 * to avoid JSON escaping issues when passing large game objects between agents.
 * Games can also be saved/loaded from the filesystem.
 */

import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { createEntity, World, Entity } from '../../world';
import { Rule, createRuleSet, RuleSet } from '../../rules';
import { step, evaluateAll, StepResult } from '../../evaluator';
import { toJSON } from '../../serializer';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─── Shared State ────────────────────────────────────────────────────────────

let currentWorld: World | null = null;
let currentRuleSet: RuleSet | null = null;
let currentGameJSON: any = null;  // Raw JSON object of the currently loaded game
let currentGameFile: string | null = null;  // Path to saved game file

export function getWorld(): World | null { return currentWorld; }
export function getRuleSet(): RuleSet | null { return currentRuleSet; }
export function getCurrentGameJSON(): any { return currentGameJSON; }
export function getCurrentGameFile(): string | null { return currentGameFile; }

/**
 * Set the current game state from external sources (e.g., DSL loader).
 * This bridges DSL-loaded games into the existing simulate/validate/save pipeline.
 */
export function setCurrentGame(world: World, ruleSet: RuleSet, gameJSON: any): void {
  currentWorld = world;
  currentRuleSet = ruleSet;
  currentGameJSON = gameJSON;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Load a game from a parsed JSON object into the engine */// ─── JSON → Engine Format Normalization ──────────────────────────────────────

/**
 * Normalize tag conditions: LLM may generate { tag: "x" } but engine expects { tag: "x", negated: false }
 */
function normalizeTagConditions(tags?: any[]): any[] | undefined {
  if (!tags) return undefined;
  return tags.map((t: any) => typeof t === 'string' ? { tag: t, negated: false } : { tag: t.tag, negated: t.negated ?? false });
}

/**
 * Normalize stat conditions: LLM may generate { key, gte: 8 } but engine expects { key, operator: '>=', value: 8 }
 */
function normalizeStatConditions(stats?: any[]): any[] | undefined {
  if (!stats) return undefined;
  return stats.map((s: any) => {
    // Already in engine format
    if (s.operator !== undefined && s.value !== undefined) return s;
    // Shorthand format → engine format
    if (s.gte !== undefined) return { key: s.key, operator: '>=', value: s.gte };
    if (s.lte !== undefined) return { key: s.key, operator: '<=', value: s.lte };
    if (s.gt !== undefined) return { key: s.key, operator: '>', value: s.gt };
    if (s.lt !== undefined) return { key: s.key, operator: '<', value: s.lt };
    if (s.eq !== undefined) return { key: s.key, operator: '=', value: s.eq };
    if (s.neq !== undefined) return { key: s.key, operator: '!=', value: s.neq };
    return s;
  });
}

/**
 * Normalize a condition EntityMatcher (used in rule.conditions[])
 */
function normalizeCondition(cond: any): any {
  return {
    ...cond,
    tags: normalizeTagConditions(cond.tags),
    stats: normalizeStatConditions(cond.stats),
  };
}

/**
 * Normalize a trigger EntityMatcher (used in rule.trigger)
 */
function normalizeTrigger(trigger: any): any {
  return {
    ...trigger,
    tags: normalizeTagConditions(trigger.tags),
    stats: normalizeStatConditions(trigger.stats),
  };
}

/**
 * Normalize an entity from LLM format to Aureum ECS format.
 * Handles: flat properties → tags/stats, lowercase → uppercase for GAME/PLAYER
 */
function normalizeEntity(e: any): any {
  // If already in ECS format (has tags array), just fix casing
  if (Array.isArray(e.tags)) {
    const id = normalizeEntityId(e.id);
    return { ...e, id };
  }

  // Convert flat LLM format to ECS format
  const id = normalizeEntityId(e.id);
  const tags: string[] = [];
  const stats: Record<string, number> = {};
  const meta: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(e)) {
    if (key === 'id') continue;
    if (key === 'type') {
      // type field becomes a tag
      tags.push(value as string);
      continue;
    }
    if (typeof value === 'number') {
      stats[key] = value;
    } else if (typeof value === 'boolean') {
      // boolean true → add tag; false → skip
      if (value) tags.push(key);
    } else if (typeof value === 'string') {
      meta[key] = value;
    } else if (value !== null && value !== undefined) {
      meta[key] = value;
    }
  }

  // Infer common tags from entity type/id
  if (id.startsWith('card_')) tags.push('card', 'in_hand');
  if (id.startsWith('enemy_') || e.type === 'enemy') { tags.push('enemy', 'active'); }
  if (e.type === 'room' || e.type === 'location') tags.push('location');
  if (e.type === 'player' || id === 'PLAYER') tags.push('player');
  if (e.type === 'system_game_entity' || id === 'GAME') tags.push('game_state', 'active');

  return { id, tags: [...new Set(tags)], stats, meta };
}

/** Uppercase GAME and PLAYER IDs, and common variants */
function normalizeEntityId(id: string): string {
  const lower = id.toLowerCase();
  if (lower === 'game' || lower === 'game_state' || lower === 'game_entity') return 'GAME';
  if (lower === 'player' || lower === 'player_entity' || lower === 'hero') return 'PLAYER';
  return id;
}

/**
 * Normalize a rule from LLM format to Aureum engine format.
 * Handles: actions → changes, trigger.type → trigger.id, sideEffect → sideEffects
 */
function normalizeRule(r: any): any {
  const normalized: any = { ...r };

  // Normalize trigger: { type: "STEP", id: "X" } → { id: "X" }
  if (normalized.trigger?.type === 'STEP' || normalized.trigger?.type === 'GAME_START') {
    normalized.trigger = { id: normalizeEntityId(normalized.trigger.id ?? 'GAME'), ...normalized.trigger };
    delete normalized.trigger.type;
  }
  if (normalized.trigger?.id) {
    normalized.trigger.id = normalizeEntityId(normalized.trigger.id);
  }

  // Normalize actions → changes (if LLM used wrong key)
  if (normalized.actions && !normalized.changes) {
    normalized.changes = normalizeActions(normalized.actions);
    delete normalized.actions;
  }

  // Normalize sideEffect (singular) → sideEffects (plural)
  if (normalized.sideEffect && !normalized.sideEffects) {
    normalized.sideEffects = Array.isArray(normalized.sideEffect) ? normalized.sideEffect : [normalized.sideEffect];
    delete normalized.sideEffect;
  }

  // Normalize condition entity references
  if (normalized.conditions) {
    normalized.conditions = normalized.conditions.map((c: any) => {
      if (c.entity && !c.id) {
        // Convert { entity: "X", attribute: "Y", operator, value } → engine format
        return {
          id: normalizeEntityId(c.entity),
          stats: [{ key: c.attribute, operator: c.operator === '==' ? '=' : c.operator, value: c.value }],
        };
      }
      return normalizeCondition(c);
    });
  }

  return normalized;
}

/**
 * Convert LLM-style actions array to Aureum changes array.
 * SET_ATTRIBUTE → setStat, ADD_TO_ATTRIBUTE → incrementStat, DEAL_DAMAGE → incrementStat (negative)
 */
function normalizeActions(actions: any[]): any[] {
  // Group by target entity
  const changesByTarget = new Map<string, any[]>();
  for (const action of actions) {
    // Extract target entity — many possible field names
    const target = normalizeEntityId(
      action.target_entity_id ?? action.entity_id ?? action.target ?? '$'
    );
    // Extract attribute/property name — many possible field names
    const attrName: string | null = action.attribute_name ?? action.property ?? action.key ?? action.attribute ?? null;
    // Extract action type — many possible field names
    const actionType: string = (action.type ?? action.action_type ?? '').toLowerCase();

    // Skip non-state actions (log, message, etc.)
    if (actionType === 'log' || actionType === 'message' || actionType === 'emit_event') continue;
    if (!attrName && actionType !== 'deal_damage') continue;

    if (!changesByTarget.has(target)) changesByTarget.set(target, []);
    const ops = changesByTarget.get(target)!;

    // Detect if this is a "set" or "add/increment" or "damage" action
    const isSet = actionType.includes('set');
    const isAdd = actionType.includes('add') || actionType.includes('increment');
    const isDamage = actionType.includes('damage');

    if (isDamage) {
      const dmg = typeof action.value === 'number' ? action.value : (typeof action.amount === 'number' ? action.amount : 0);
      ops.push({ type: 'incrementStat', key: attrName ?? 'hp', amount: -dmg });
    } else if (isAdd && attrName) {
      const amount = typeof action.value === 'number' ? action.value : (typeof action.amount === 'number' ? action.amount : 0);
      ops.push({ type: 'incrementStat', key: attrName, amount });
    } else if (isSet && attrName) {
      if (typeof action.value === 'number') {
        ops.push({ type: 'setStat', key: attrName, value: action.value });
      } else if (typeof action.value === 'boolean') {
        ops.push(action.value
          ? { type: 'addTag', tag: attrName }
          : { type: 'removeTag', tag: attrName }
        );
      } else if (typeof action.value === 'string') {
        // String values → meta, but store as stat-like for engine compatibility
        ops.push({ type: 'setStat', key: attrName, value: action.value });
      }
    } else if (attrName && action.value !== undefined) {
      // Fallback: any unknown action with a property+value → setStat
      if (typeof action.value === 'number') {
        ops.push({ type: 'setStat', key: attrName, value: action.value });
      }
    }
  }

  return [...changesByTarget.entries()].map(([target, operations]) => ({
    target,
    operations,
  }));
}

export function loadGameFromJSON(game: any): { world: World; ruleSet: RuleSet } {
  const entities: Entity[] = (game.entities ?? []).map((e: any) => {
    const normalized = normalizeEntity(e);
    return createEntity(normalized.id, {
      tags: normalized.tags ?? [],
      stats: normalized.stats ?? {},
      links: normalized.links ?? {},
      meta: normalized.meta ?? {},
    });
  });

  const world = new World(entities);

  const rules: Rule[] = (game.rules ?? []).map((r: any) => {
    const nr = normalizeRule(r);
    return {
      id: nr.id,
      trigger: normalizeTrigger(nr.trigger ?? { id: '*' }),
      conditions: (nr.conditions ?? []).map(normalizeCondition),
      changes: nr.changes ?? [],
      sideEffects: nr.sideEffects ?? [],
      priority: nr.priority ?? 0,
      oneShot: nr.oneShot ?? false,
      description: nr.description ?? nr.id,
    };
  });

  const ruleSet = createRuleSet(
    'generated',
    game.name ?? 'Generated Game',
    rules,
    game.description ?? '',
  );

  currentWorld = world;
  currentRuleSet = ruleSet;
  currentGameJSON = game;

  return { world, ruleSet };
}

/**
 * Helper: resolve game JSON from tool input.
 * Priority: gameJson string > useCurrentGame > gameFilePath
 */
function resolveGameJSON(input: { gameJson?: string; useCurrentGame?: boolean; gameFilePath?: string }): any {
  if (input.gameJson) {
    return JSON.parse(input.gameJson);
  }
  if (input.useCurrentGame && currentGameJSON) {
    return currentGameJSON;
  }
  if (input.gameFilePath) {
    const content = fs.readFileSync(input.gameFilePath, 'utf-8');
    return JSON.parse(content);
  }
  if (currentGameJSON) {
    // Fallback: use whatever is loaded
    return currentGameJSON;
  }
  throw new Error('No game provided. Pass gameJson string, set useCurrentGame: true, or provide gameFilePath.');
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export const loadGameTool = new FunctionTool({
  name: 'load_game',
  description: `Load a game into the Aureum engine and store it for subsequent tool calls.
Accepts EITHER a gameJson string OR a gameFilePath to a .json file on disk.
After loading, other tools can use useCurrentGame: true instead of re-passing the JSON.`,
  parameters: z.object({
    gameJson: z.string().optional().describe('JSON string of the game object with entities and rules arrays'),
    gameFilePath: z.string().optional().describe('Absolute path to a .json game file on disk'),
  }),
  execute: ({ gameJson, gameFilePath }: any) => {
    try {
      const game = resolveGameJSON({ gameJson, gameFilePath });
      const { world, ruleSet } = loadGameFromJSON(game);

      const cards = world.all().filter(e => e.tags.has('card'));
      const enemies = world.all().filter(e => e.tags.has('enemy'));
      const locations = world.all().filter(e => e.tags.has('location'));
      const player = world.get('PLAYER');

      return {
        status: 'success',
        gameName: game.name ?? 'Unknown',
        savedTo: currentGameFile,
        summary: {
          totalEntities: world.all().length,
          totalRules: ruleSet.rules.length,
          cards: cards.length,
          enemies: enemies.length,
          locations: locations.length,
          playerExists: !!player,
          gameExists: !!world.get('GAME'),
        },
        hint: 'Game is now loaded. Use useCurrentGame: true on validate_game and simulate_game to avoid re-passing JSON.',
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const saveGameTool = new FunctionTool({
  name: 'save_game',
  description: `Save the currently loaded game to a .json file on disk. Returns the file path.
The saved file can be referenced by other tools via gameFilePath parameter.
If no game is loaded, returns an error.`,
  parameters: z.object({
    filename: z.string().optional().describe('Optional filename (without extension). Defaults to slugified game name.'),
    directory: z.string().optional().describe('Optional directory path. Defaults to project output directory.'),
  }),
  execute: ({ filename, directory }: any) => {
    try {
      if (!currentGameJSON) {
        return { status: 'error', error: 'No game loaded. Use load_game first.' };
      }

      const slug = (currentGameJSON.name ?? 'game')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const fname = filename ?? `${slug}-${Date.now()}`;
      const dir = directory ?? path.resolve(__dirname, '..', '..', '..', '..', 'generated-games');

      // Ensure directory exists
      fs.mkdirSync(dir, { recursive: true });

      const filePath = path.join(dir, `${fname}.json`);
      const content = JSON.stringify(currentGameJSON, null, 2);
      fs.writeFileSync(filePath, content, 'utf-8');

      currentGameFile = filePath;
      console.log(`[save_game] ✅ Saved to ${filePath} (${(content.length / 1024).toFixed(1)} KB, ${currentGameJSON.entities?.length ?? 0} entities, ${currentGameJSON.rules?.length ?? 0} rules)`);

      return {
        status: 'success',
        filePath,
        fileSize: `${(content.length / 1024).toFixed(1)} KB`,
        gameName: currentGameJSON.name,
        entityCount: currentGameJSON.entities?.length ?? 0,
        ruleCount: currentGameJSON.rules?.length ?? 0,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const validateGameTool = new FunctionTool({
  name: 'validate_game',
  description: `Validate a game: check entities, rules, triggers, win/loss conditions.
PREFERRED: set useCurrentGame: true to validate the already-loaded game (avoids JSON escaping issues).
Alternatively: pass gameJson string or gameFilePath.`,
  parameters: z.object({
    gameJson: z.string().optional().describe('JSON string of the game object'),
    useCurrentGame: z.boolean().optional().describe('If true, validate the currently loaded game instead of parsing gameJson'),
    gameFilePath: z.string().optional().describe('Path to a .json game file on disk'),
  }),
  execute: ({ gameJson, useCurrentGame, gameFilePath }: any) => {
    try {
      const game = resolveGameJSON({ gameJson, useCurrentGame, gameFilePath });
      const issues: string[] = [];
      const entityIds = new Set((game.entities ?? []).map((e: any) => normalizeEntityId(e.id)));

      // Check GAME and PLAYER exist (after normalization)
      if (!entityIds.has('GAME')) issues.push('Missing GAME entity (or entity with id "game")');
      if (!entityIds.has('PLAYER')) issues.push('Missing PLAYER entity (or entity with id "player")');

      // Check rules reference valid entities (normalize IDs before checking)
      for (const rule of (game.rules ?? [])) {
        const triggerId = normalizeEntityId(rule.trigger?.id ?? '*');
        if (triggerId !== '*' && triggerId !== '$' && !entityIds.has(triggerId)) {
          issues.push(`Rule "${rule.id}" trigger references non-existent entity "${rule.trigger.id}"`);
        }
        for (const change of (rule.changes ?? rule.actions ?? [])) {
          const targetId = normalizeEntityId(change.target ?? change.target_entity_id ?? '$');
          if (targetId !== '$' && targetId !== '*' && !entityIds.has(targetId)) {
            issues.push(`Rule "${rule.id}" change targets non-existent entity "${change.target ?? change.target_entity_id}"`);
          }
        }
      }

      // Check cards have play rules
      const cards = (game.entities ?? []).filter((e: any) => e.tags?.includes('card'));
      const ruleTriggerIds = new Set((game.rules ?? []).map((r: any) => r.trigger?.id));

      for (const card of cards) {
        const hasRule = ruleTriggerIds.has(card.id) ||
          (game.rules ?? []).some((r: any) =>
            r.trigger?.id === '*' &&
            r.trigger?.tags?.some((t: any) => card.tags?.includes(t.tag))
          );
        if (!hasRule) {
          issues.push(`Card "${card.id}" (${card.meta?.name ?? card.id}) has no play rule`);
        }
      }

      // Check win/loss conditions — deep scan rules for any game-ending signal
      // Be very permissive: LLMs generate many structural variants
      const rulesJSON = JSON.stringify(game.rules ?? []).toLowerCase();
      const hasWin = rulesJSON.includes('"won"') || rulesJSON.includes("'won'") ||
        (rulesJSON.includes('game_over') && rulesJSON.includes('"win"'));
      const hasLoss = rulesJSON.includes('"lost"') || rulesJSON.includes("'lost'") ||
        (rulesJSON.includes('game_over') && rulesJSON.includes('"loss"'));
      if (!hasWin) issues.push('No win condition found — need a rule with sideEffect game_over/win or addTag "won"');
      if (!hasLoss) issues.push('No loss condition found — need a rule with sideEffect game_over/loss or addTag "lost"');

      // Also load the game into engine state so it can be used with useCurrentGame
      loadGameFromJSON(game);

      return {
        status: issues.length === 0 ? 'valid' : 'invalid',
        issueCount: issues.length,
        issues,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const simulateGameTool = new FunctionTool({
  name: 'simulate_game',
  description: `Simulate N games with a random policy and return win/loss statistics.
PREFERRED: set useCurrentGame: true to simulate the already-loaded game (avoids JSON escaping issues).
Alternatively: pass gameJson string or gameFilePath.
The simulator calls step('GAME'), then step(cardId) for each in-hand card, then step(enemyId) for each active enemy.
Rules MUST have trigger.id matching the entity being stepped.`,
  parameters: z.object({
    gameJson: z.string().optional().describe('JSON string of the game object'),
    useCurrentGame: z.boolean().optional().describe('If true, simulate the currently loaded game instead of parsing gameJson'),
    gameFilePath: z.string().optional().describe('Path to a .json game file on disk'),
    numGames: z.number().describe('Number of games to simulate (1-20)').default(5),
  }),
  execute: ({ gameJson, useCurrentGame, gameFilePath, numGames }: any) => {
    try {
      const game = resolveGameJSON({ gameJson, useCurrentGame, gameFilePath });
      const count = Math.min(Math.max(numGames ?? 5, 1), 20);
      console.log(`[simulate_game] Starting ${count} simulations (${game.entities?.length ?? 0} entities, ${game.rules?.length ?? 0} rules)`);
      const results: Array<{ outcome: string; rounds: number; cardsPlayed: number; rulesMatched: number; log: string[] }> = [];

      for (let i = 0; i < count; i++) {
        let { world, ruleSet } = loadGameFromJSON(game);
        let rounds = 0;
        let cardsPlayed = 0;
        let rulesMatched = 0;
        let outcome = 'timeout';
        const MAX_ROUNDS = 30;
        const roundLog: string[] = [];

        // Save initial PLAYER stats for per-turn resource reset
        const initialPlayer = world.get('PLAYER');
        const perTurnResources = new Map<string, number>();
        if (initialPlayer) {
          for (const key of ['actions_remaining', 'breaths', 'mana', 'stamina', 'energy', 'vigor', 'resolve', 'actions']) {
            if (initialPlayer.stats.has(key)) {
              perTurnResources.set(key, initialPlayer.stats.get(key)!);
            }
          }
        }

        while (rounds < MAX_ROUNDS) {
          rounds++;

          // Helper: check for game over after any step
          const checkGameOver = (currentWorld: World): string | null => {
            if (currentWorld.get('GAME')?.tags.has('won')) return 'win';
            if (currentWorld.get('GAME')?.tags.has('lost')) return 'loss';

            // Evaluate all rules that match GAME entity (includes wildcard rules)
            const allMatches = evaluateAll('GAME', currentWorld, ruleSet);
            for (const match of allMatches) {
              for (const se of match.sideEffects) {
                if (se.type === 'game_event' && (se.payload as any).event === 'game_over') {
                  for (const change of match.resolvedChanges) {
                    const target = currentWorld.get(change.target);
                    if (target) {
                      for (const op of change.operations) {
                        switch (op.type) {
                          case 'addTag': target.tags.add(op.tag); break;
                          case 'removeTag': target.tags.delete(op.tag); break;
                          case 'setStat': target.stats.set(op.key, op.value); break;
                          case 'incrementStat': target.stats.set(op.key, (target.stats.get(op.key) ?? 0) + op.amount); break;
                        }
                      }
                    }
                  }
                  return (se.payload as any).result ?? 'loss';
                }
              }
            }

            // Also apply any wildcard rule changes that set won/lost tags directly
            for (const match of allMatches) {
              for (const change of match.resolvedChanges) {
                const target = currentWorld.get(change.target);
                if (target) {
                  for (const op of change.operations) {
                    if (op.type === 'addTag' && (op.tag === 'won' || op.tag === 'lost')) {
                      // Apply the change
                      target.tags.add(op.tag);
                      return op.tag === 'won' ? 'win' : 'loss';
                    }
                  }
                }
              }
            }

            const player = currentWorld.get('PLAYER');
            if (player) {
              const hp = player.stats.get('hp') ?? player.stats.get('health') ?? player.stats.get('sanity') ?? 1;
              if (hp <= 0) return 'loss';
            }
            return null;
          };

          // 0. Reset per-turn resources to starting values
          const player = world.get('PLAYER');
          if (player) {
            for (const [key, val] of perTurnResources) {
              player.stats.set(key, val);
            }
          }

          // 1. Step GAME entity (phase transitions, reset actions, etc.)
          const gameResult = step('GAME', world, ruleSet);
          if (gameResult.match) {
            world = gameResult.world;
            rulesMatched++;
            roundLog.push(`R${rounds}: GAME rule "${gameResult.match.rule.id}" fired`);
            const result = checkGameOver(world);
            if (result) { outcome = result; break; }
          }

          // 2. Play cards from hand (randomized: shuffle + skip chance)
          const playerNow = world.get('PLAYER');
          const baseActions = playerNow?.stats.get('actions_remaining') ?? playerNow?.stats.get('breaths') ?? playerNow?.stats.get('actions') ?? 3;
          // Vary actions ±1 to simulate variable tempo
          let actionsLeft = Math.max(1, baseActions + Math.floor(Math.random() * 3) - 1);
          let hand = world.all().filter(e => e.tags.has('card') && e.tags.has('in_hand'));
          // Fisher-Yates shuffle for proper randomness
          for (let i = hand.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [hand[i], hand[j]] = [hand[j], hand[i]];
          }

          let cardBroke = false;
          for (const card of hand) {
            if (actionsLeft <= 0) break;
            // 30% chance to skip each card (simulates player choosing not to play it)
            if (Math.random() < 0.3) {
              roundLog.push(`R${rounds}: Skipped "${card.id}" (player choice)`);
              continue;
            }

            const cardResult = step(card.id, world, ruleSet);
            if (cardResult.match) {
              world = cardResult.world;
              cardsPlayed++;
              rulesMatched++;
              actionsLeft--;
              roundLog.push(`R${rounds}: Played "${card.id}" (rule "${cardResult.match.rule.id}")`);
              const result = checkGameOver(world);
              if (result) { outcome = result; cardBroke = true; break; }
            } else {
              roundLog.push(`R${rounds}: Card "${card.id}" — NO MATCHING RULE`);
            }
          }
          if (cardBroke || outcome !== 'timeout') break;

          // 3. Step enemies (broaden detection: enemy, ghost, monster, specter, etc.)
          const isHostile = (e: any) => {
            for (const tag of ['enemy', 'ghost', 'monster', 'specter', 'phantom', 'hostile', 'creature', 'undead', 'demon']) {
              if (e.tags.has(tag)) return true;
            }
            return false;
          };
          const enemies = world.all().filter(e => isHostile(e) && e.tags.has('active'));
          let enemyBroke = false;
          for (const enemy of enemies) {
            // 20% chance enemy misses (simulates dodge/luck)
            if (Math.random() < 0.2) {
              roundLog.push(`R${rounds}: Enemy "${enemy.id}" missed!`);
              continue;
            }
            const enemyResult = step(enemy.id, world, ruleSet);
            if (enemyResult.match) {
              world = enemyResult.world;
              rulesMatched++;
              const result = checkGameOver(world);
              if (result) { outcome = result; enemyBroke = true; break; }
            }
          }
          if (enemyBroke || outcome !== 'timeout') break;

          // 4. Step rooms/locations/events (for exploration progression, NOT hostile entities)
          const isSteppable = (e: any) => {
            if (e.tags.has('card') || isHostile(e)) return false;
            if (e.id === 'GAME' || e.id === 'PLAYER') return false;
            // Only step entities that look like they drive progression
            for (const tag of ['room', 'location', 'event', 'artifact', 'item', 'treasure']) {
              if (e.tags.has(tag)) return true;
            }
            return false;
          };
          const steppables = world.all().filter(isSteppable);
          for (const entity of steppables) {
            const otherResult = step(entity.id, world, ruleSet);
            if (otherResult.match) {
              world = otherResult.world;
              rulesMatched++;
              const result = checkGameOver(world);
              if (result) { outcome = result; break; }
            }
          }
          if (outcome !== 'timeout') break;

          // 5. Check player death after all steps
          const playerAfter = world.get('PLAYER');
          if (playerAfter) {
            const hp = playerAfter.stats.get('hp') ?? playerAfter.stats.get('health') ?? playerAfter.stats.get('sanity') ?? 1;
            if (hp <= 0) { outcome = 'loss'; break; }
          }

          // 6. Advance round counter
          const gameEntity = world.get('GAME');
          if (gameEntity) {
            gameEntity.stats.set('round', (gameEntity.stats.get('round') ?? 1) + 1);
          }

          // 7. Recycle discarded/played cards back to hand each round
          // Cards may have in_discard, in_play, or other state tags — reset them
          const discarded = world.all().filter(e =>
            e.tags.has('card') && !e.tags.has('in_hand') &&
            (e.tags.has('in_discard') || e.tags.has('in_play') || !e.tags.has('in_hand'))
          );
          for (const card of discarded) {
            card.tags.add('in_hand');
            card.tags.delete('in_discard');
            card.tags.delete('in_play');
            card.tags.delete('played');
            card.tags.delete('used');
          }
          if (discarded.length > 0) roundLog.push(`R${rounds}: Recycled ${discarded.length} cards to hand`);
        }

        results.push({ outcome, rounds, cardsPlayed, rulesMatched, log: roundLog.slice(0, 15) });
      }

      const wins = results.filter(r => r.outcome === 'win').length;
      const losses = results.filter(r => r.outcome === 'loss').length;
      const timeouts = results.filter(r => r.outcome === 'timeout').length;
      const avgRounds = results.reduce((s, r) => s + r.rounds, 0) / results.length;
      const avgCards = results.reduce((s, r) => s + r.cardsPlayed, 0) / results.length;
      const avgRules = results.reduce((s, r) => s + r.rulesMatched, 0) / results.length;

      // Log simulation summary
      console.log(`[simulate_game] ✅ ${count} games: ${wins}W/${losses}L/${timeouts}T | avg ${avgRounds.toFixed(1)} rounds, ${avgCards.toFixed(1)} cards, ${avgRules.toFixed(1)} rules`);
      for (const [i, r] of results.entries()) {
        console.log(`  Game ${i+1}: ${r.outcome} in ${r.rounds} rounds (${r.cardsPlayed} cards, ${r.rulesMatched} rules)`);
      }

      return {
        status: 'success',
        gamesPlayed: count,
        wins,
        losses,
        timeouts,
        winRate: `${Math.round((wins / count) * 100)}%`,
        avgRounds: Math.round(avgRounds * 10) / 10,
        avgCardsPlayed: Math.round(avgCards * 10) / 10,
        avgRulesMatched: Math.round(avgRules * 10) / 10,
        stuckDetected: timeouts > count / 2,
        difficulty: wins === 0 ? 'impossible' : wins < count * 0.2 ? 'very_hard' : wins < count * 0.5 ? 'hard' : wins < count * 0.8 ? 'medium' : 'easy',
        details: results,
        troubleshooting: timeouts > 0
          ? 'TIMEOUTS detected. Common causes: (1) Card rules don\'t remove "in_hand" tag so cards replay endlessly, (2) No rule advances game state toward win condition, (3) Win condition threshold too high. Check that card effects incrementStat on the GAME tracker.'
          : undefined,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const getGameStateTool = new FunctionTool({
  name: 'get_game_state',
  description: 'Get the current state of the loaded game (entities, stats, tags).',
  parameters: z.object({}),
  execute: () => {
    if (!currentWorld || !currentRuleSet) {
      return { status: 'error', error: 'No game loaded' };
    }

    const entities = currentWorld.all().map(e => ({
      id: e.id,
      tags: Array.from(e.tags),
      stats: Object.fromEntries(e.stats),
      links: Object.fromEntries(e.links),
      meta: e.meta,
    }));

    return {
      status: 'success',
      entityCount: entities.length,
      ruleCount: currentRuleSet.rules.length,
      entities,
      savedFile: currentGameFile,
    };
  },
});

export const allTools = [loadGameTool, saveGameTool, validateGameTool, simulateGameTool, getGameStateTool];

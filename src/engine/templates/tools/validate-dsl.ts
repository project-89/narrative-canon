/**
 * ArgOS DSL Validation & Loading Tools
 *
 * Tools for the DSL Engineer agent to validate and load ArgOS DSL source
 * into the Aureum engine. Uses the existing parser.ts for parsing.
 */

import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { parseEntities, parseRules } from '../../parser';
import { World } from '../../world';
import { createRuleSet, RuleSet } from '../../rules';
import { setCurrentGame } from './aureum-adk-tools';

// ─── DSL Parsing Helpers ─────────────────────────────────────────────────────

/**
 * Split a .argos file into entity and rule sections.
 * Expects "# Entities" and "# Rules" headers.
 */
function splitDSLSections(dsl: string): { entitySection: string; ruleSection: string } {
  // Preprocess: strip markdown code fences that LLMs often wrap DSL in
  let cleaned = dsl
    .replace(/```argos\s*/gi, '')
    .replace(/```dsl\s*/gi, '')
    .replace(/```\s*/g, '');

  const lines = cleaned.split('\n');
  let entityLines: string[] = [];
  let ruleLines: string[] = [];
  let currentSection: 'none' | 'entities' | 'rules' = 'none';

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // Skip empty lines in 'none' section
    if (currentSection === 'none' && !trimmed) continue;

    // Detect section headers — be very flexible about formats the LLM might use
    if (lower.match(/^(#{1,3}\s*)?entit(y|ies)\s*$/i) ||
        lower.match(/^\/\/\s*entit(y|ies)\s*$/i) ||
        lower.match(/^-+\s*entit(y|ies)\s*-*$/i)) {
      currentSection = 'entities';
      continue;
    }
    if (lower.match(/^(#{1,3}\s*)?rules?\s*$/i) ||
        lower.match(/^\/\/\s*rules?\s*$/i) ||
        lower.match(/^-+\s*rules?\s*-*$/i)) {
      currentSection = 'rules';
      continue;
    }

    // ALWAYS check for trigger: regardless of current section — it definitively starts rules
    if (trimmed.startsWith('trigger:')) {
      currentSection = 'rules';
      ruleLines.push(line);
      continue;
    }

    // If we're in 'none' section, try auto-detection
    if (currentSection === 'none') {
      // Skip comments at the top of the file
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

      // Entity lines look like: WORD.tag or WORD.stat=N (case-insensitive for LLM flexibility)
      if (trimmed.match(/^[A-Za-z_][A-Za-z0-9_]*\./)) {
        currentSection = 'entities';
        entityLines.push(line);
        continue;
      }
      // Skip anything else before first section
      continue;
    }

    // Route to current section
    if (currentSection === 'entities') {
      entityLines.push(line);
    } else if (currentSection === 'rules') {
      ruleLines.push(line);
    }
  }

  console.log(`[splitDSL] Sections: ${entityLines.filter(l => l.trim()).length} entity lines, ${ruleLines.filter(l => l.trim()).length} rule lines`);
  return {
    entitySection: entityLines.join('\n'),
    ruleSection: ruleLines.join('\n'),
  };
}

/**
 * Parse a complete ArgOS DSL file into World + RuleSet.
 */
export function loadDSL(dsl: string): { world: World; ruleSet: RuleSet; errors: string[] } {
  const errors: string[] = [];
  const { entitySection, ruleSection } = splitDSLSections(dsl);

  const entityLineCount = entitySection.split('\n').filter(l => l.trim()).length;
  const ruleLineCount = ruleSection.split('\n').filter(l => l.trim()).length;
  console.log(`[loadDSL] Split: ${entityLineCount} entity lines, ${ruleLineCount} rule lines`);

  // Parse entities
  let entities: ReturnType<typeof parseEntities> = [];
  try {
    entities = parseEntities(entitySection);
    console.log(`[loadDSL] Parsed ${entities.length} entities: ${entities.map(e => e.id).join(', ')}`);
  } catch (e: any) {
    errors.push(`Entity parse error: ${e.message}`);
  }

  // Parse rules
  let rules: ReturnType<typeof parseRules> = [];
  try {
    rules = parseRules(ruleSection);
    console.log(`[loadDSL] Parsed ${rules.length} rules: ${rules.map(r => r.id).join(', ')}`);
  } catch (e: any) {
    errors.push(`Rule parse error: ${e.message}`);
  }

  const world = new World(entities);
  const ruleSet = createRuleSet('dsl_generated', 'Generated from ArgOS DSL', rules);

  return { world, ruleSet, errors };
}

/**
 * Validate ArgOS DSL source without loading it into the engine.
 * Returns a list of issues found.
 */
export function validateDSLSource(dsl: string): string[] {
  const issues: string[] = [];

  // FIRST: Check if the LLM used the WRONG format (curly-brace syntax instead of dot-notation)
  if (dsl.includes('entity ') || dsl.includes('entity\n') || dsl.match(/\{[\s\S]*\}/)) {
    issues.push(
      'WRONG FORMAT: You used curly-brace/block syntax. ArgOS DSL uses FLAT DOT-NOTATION, one entity per line.\n\n' +
      'WRONG (do NOT write this):\n' +
      '  entity GAME { active: true, tracker: 0 }\n' +
      '  entity PLAYER { hp: 40, shield: 0 }\n\n' +
      'CORRECT (write THIS instead):\n' +
      '  # Entities\n' +
      '  GAME.game_state.active.round=1.tracker=0.win_target=15\n' +
      '  PLAYER.player.hp=40.shield=0.actions_remaining=3\n' +
      '  card_slash.card.attack.in_hand.damage=3.cost=1\n' +
      '  enemy_ghost.enemy.active.hp=20.damage=2\n\n' +
      '  # Rules\n' +
      '  trigger: card_slash.in_hand\n' +
      '  changes: $.-in_hand | enemy_ghost.hp-3 | GAME.tracker+3\n' +
      '  narrative: You slash the ghost!\n\n' +
      'Copy the REFERENCE GAME structure EXACTLY. One entity per line, dot-separated tags and stats.'
    );
    return issues;
  }

  const { entitySection, ruleSection } = splitDSLSections(dsl);

  // 1. Parse entities
  let entityIds = new Set<string>();
  try {
    const entities = parseEntities(entitySection);
    entityIds = new Set(entities.map(e => e.id));

    if (!entityIds.has('GAME')) issues.push('Missing GAME entity');
    if (!entityIds.has('PLAYER')) issues.push('Missing PLAYER entity');

    // Check cards have required tags
    for (const entity of entities) {
      if (entity.tags.has('card') && !entity.tags.has('in_hand')) {
        issues.push(`Card "${entity.id}" missing "in_hand" tag — cards must start in hand`);
      }
      if (entity.tags.has('enemy') && !entity.tags.has('active')) {
        issues.push(`Enemy "${entity.id}" missing "active" tag`);
      }
    }
  } catch (e: any) {
    issues.push(`Entity parse error: ${e.message}`);
    return issues; // Can't continue without entities
  }

  // 2. Parse rules
  let hasWinCondition = false;
  let hasLossCondition = false;
  try {
    const rules = parseRules(ruleSection);

    if (rules.length === 0) {
      issues.push('No rules defined — game needs at least win/loss conditions and card rules');
    }

    for (const rule of rules) {
      // Check trigger references valid entity
      if (rule.trigger.id && rule.trigger.id !== '*' && rule.trigger.id !== '$') {
        if (!entityIds.has(rule.trigger.id)) {
          issues.push(`Rule "${rule.id}" trigger references non-existent entity "${rule.trigger.id}"`);
        }
      }

      // Check change targets reference valid entities
      for (const change of (rule.changes ?? [])) {
        if (change.target && change.target !== '$' && change.target !== '*') {
          if (!entityIds.has(change.target)) {
            issues.push(`Rule "${rule.id}" targets non-existent entity "${change.target}"`);
          }
        }

        // Check for win/loss
        for (const op of change.operations) {
          if (op.type === 'addTag' && op.tag === 'won') hasWinCondition = true;
          if (op.type === 'addTag' && op.tag === 'lost') hasLossCondition = true;
        }
      }
    }

    // Check cards have play rules
    for (const entityId of entityIds) {
      if (entityId.startsWith('card_')) {
        const hasRule = rules.some(r => r.trigger.id === entityId);
        if (!hasRule) {
          issues.push(`Card "${entityId}" has no play rule (need a rule with trigger: ${entityId}.in_hand)`);
        }
      }
    }
  } catch (e: any) {
    issues.push(`Rule parse error: ${e.message}`);
  }

  // Check win/loss conditions — CRITICAL, include copy-pasteable templates
  if (!hasWinCondition) {
    // Try to suggest a tracker stat from GAME entity
    let suggestedTracker = 'tracker';
    let suggestedThreshold = 10;
    try {
      const parsedEntities = parseEntities(entitySection);
      const gameEntity = parsedEntities.find(e => e.id === 'GAME');
      if (gameEntity) {
        const trackerStats = Array.from(gameEntity.stats.keys()).filter(k => k !== 'round' && k !== 'max_rounds');
        if (trackerStats.length > 0) {
          suggestedTracker = trackerStats[0];
          suggestedThreshold = gameEntity.stats.get('win_target') ?? gameEntity.stats.get(trackerStats[0]) ?? 10;
        }
      }
    } catch (_) { /* entities already validated above */ }
    issues.push(
      `No win condition found. Add this EXACT rule to your # Rules section:\n` +
      `trigger: *\nconditions: GAME.${suggestedTracker}>=${suggestedThreshold}\nchanges: GAME.won\nnarrative: You win!`
    );
  }
  if (!hasLossCondition) {
    // Detect the player health stat name
    let healthKey = 'hp';
    try {
      const parsedEntities = parseEntities(entitySection);
      const playerEntity = parsedEntities.find(e => e.id === 'PLAYER');
      if (playerEntity) {
        for (const key of ['hp', 'health', 'sanity', 'life']) {
          if (playerEntity.stats.has(key)) { healthKey = key; break; }
        }
      }
    } catch (_) { /* already validated */ }
    issues.push(
      `No loss condition found. Add this EXACT rule to your # Rules section:\n` +
      `trigger: *\nconditions: PLAYER.${healthKey}<=0\nchanges: GAME.lost\nnarrative: You have been defeated...`
    );
  }

  return issues;
}

// ─── Helper: convert parsed DSL world into JSON (for simulation bridge) ──────

function worldToJSON(world: World, ruleSet: RuleSet): any {
  const entities = world.all().map((e: any) => ({
    id: e.id,
    tags: [...e.tags],
    stats: Object.fromEntries(e.stats),
    links: Object.fromEntries(e.links),
    meta: e.meta ?? {},
  }));

  const rules = ruleSet.rules.map(r => ({
    id: r.id,
    trigger: {
      id: r.trigger.id,
      tags: r.trigger.tags?.map(t => ({ tag: t.tag, negated: t.negated })),
      stats: r.trigger.stats?.map(s => ({
        key: s.key,
        operator: s.operator,
        value: s.value,
      })),
      links: r.trigger.links,
    },
    conditions: r.conditions?.map(c => ({
      id: c.id,
      tags: c.tags?.map(t => ({ tag: t.tag, negated: t.negated })),
      stats: c.stats?.map(s => ({
        key: s.key,
        operator: s.operator,
        value: s.value,
      })),
      links: c.links,
    })),
    changes: r.changes?.map(ch => ({
      target: ch.target,
      operations: ch.operations,
    })),
    sideEffects: r.sideEffects,
    priority: r.priority,
    oneShot: r.oneShot,
    description: r.description,
  }));

  return {
    name: 'DSL Generated Game',
    description: 'Game generated from ArgOS DSL',
    entities,
    rules,
  };
}

// ─── ADK Tools ──────────────────────────────────────────────────────────────

// Module-level call counter to prevent infinite validate loops
let validateCallCount = 0;

export const validateDSLTool = new FunctionTool({
  name: 'validate_dsl',
  description: `Validate ArgOS DSL source code. Returns a list of issues found.
Call this BEFORE load_dsl to ensure the DSL is correct.
If issues are returned, fix them and re-validate. Maximum 3 calls allowed.`,
  parameters: z.object({
    dsl_source: z.string().describe('The complete ArgOS DSL source code to validate'),
  }) as any,
  execute: (input: any) => {
    const { dsl_source } = input;
    validateCallCount++;

    // Log first 3 non-empty lines for diagnosis
    const preview = (dsl_source ?? '').split('\n').filter((l: string) => l.trim()).slice(0, 3);
    console.log('[validate_dsl] Call #' + validateCallCount + ' — Validating DSL (' + (dsl_source?.length ?? 0) + ' chars)...');
    console.log('[validate_dsl] Preview:');
    for (const line of preview) console.log('  | ' + line.trim().slice(0, 100));

    const issues = validateDSLSource(dsl_source);

    // Safety valve: after 3 calls, auto-accept ONLY if win/loss conditions exist.
    // If they're still missing, give one final chance with exact template.
    if (validateCallCount > 3) {
      const hasCritical = issues.some(i => i.includes('win condition') || i.includes('loss condition'));
      if (hasCritical && validateCallCount <= 5) {
        console.log('[validate_dsl] ⚠️ Max calls reached but win/loss MISSING — giving final template');
        return JSON.stringify({
          valid: false,
          callsRemaining: 0,
          critical: 'MISSING WIN/LOSS CONDITIONS. Add these EXACT lines to the end of your # Rules section before calling load_dsl:',
          winRule: 'trigger: *\nconditions: GAME.[your_tracker_stat]>=[threshold]\nchanges: GAME.won\nnarrative: Victory!',
          lossRule: 'trigger: *\nconditions: PLAYER.hp<=0\nchanges: GAME.lost\nnarrative: Defeat...',
        });
      }
      console.log('[validate_dsl] ⚠️ Max calls reached — auto-accepting, proceed to load_dsl');
      return JSON.stringify({
        valid: true,
        message: 'Maximum validation attempts reached. Call load_dsl now.',
      });
    }

    if (issues.length === 0) {
      console.log('[validate_dsl] ✅ DSL is valid!');
      return JSON.stringify({ valid: true, message: 'DSL is valid! Call load_dsl now.' });
    }
    console.log('[validate_dsl] ❌ Found ' + issues.length + ' issues:');
    for (const issue of issues) console.log('  - ' + issue);
    return JSON.stringify({ valid: false, issues, callsRemaining: Math.max(0, 3 - validateCallCount) });
  },
});

export const loadDSLTool = new FunctionTool({
  name: 'load_dsl',
  description: `Parse ArgOS DSL source and load it into the Aureum engine.
Returns entity count, rule count, and any parse errors.
After loading, use simulate_game with useCurrentGame: true to test.`,
  parameters: z.object({
    dsl_source: z.string().describe('The complete ArgOS DSL source code to load'),
  }) as any,
  execute: (input: any) => {
    try {
      const { dsl_source } = input;
      console.log('[load_dsl] Loading DSL (' + (dsl_source?.length ?? 0) + ' chars)...');
      const { world, ruleSet, errors } = loadDSL(dsl_source);

      if (errors.length > 0) {
        console.log('[load_dsl] ❌ Parse errors:');
        for (const err of errors) console.log('  - ' + err);
        return JSON.stringify({ loaded: false, errors });
      }

      // Bridge: convert DSL world to JSON and set shared game state
      // so that simulate_game, validate_game, save_game all work seamlessly
      const gameJSON = worldToJSON(world, ruleSet);
      setCurrentGame(world, ruleSet, gameJSON);

      const entityCount = world.all().length;
      const ruleCount = ruleSet.rules.length;

      // SAFETY NET: Auto-inject win/loss conditions if missing
      const hasWin = ruleSet.rules.some(r =>
        r.changes?.some(ch => ch.operations?.some(op => op.type === 'addTag' && op.tag === 'won'))
      );
      const hasLoss = ruleSet.rules.some(r =>
        r.changes?.some(ch => ch.operations?.some(op => op.type === 'addTag' && op.tag === 'lost'))
      );

      if (!hasWin || !hasLoss) {
        console.log('[load_dsl] ⚠️ Injecting missing win/loss conditions...');

        // Find a tracker stat on GAME entity for win condition
        const gameEntity = world.get('GAME');
        let trackerKey = 'round';
        let trackerThreshold = 10;
        if (gameEntity) {
          for (const [key, val] of gameEntity.stats.entries()) {
            if (key !== 'round' && key !== 'max_rounds' && key !== 'game_over') {
              trackerKey = key;
              const target = gameEntity.stats.get('win_target') ?? gameEntity.stats.get('max_' + key);
              trackerThreshold = target ?? Math.max(val * 3, 10);
              break;
            }
          }
        }

        if (!hasWin) {
          const winDSL = `trigger: *\nconditions: GAME.${trackerKey}>=${trackerThreshold}\nchanges: GAME.won\nnarrative: Victory! You have conquered the challenge!`;
          try {
            const winRules = parseRules(winDSL);
            for (const r of winRules) ruleSet.rules.push(r);
            console.log('[load_dsl]   + Injected win rule: GAME.' + trackerKey + '>=' + trackerThreshold + ' → GAME.won');
          } catch (e) {
            console.log('[load_dsl]   ❌ Failed to inject win rule: ' + (e as any).message);
          }
        }

        if (!hasLoss) {
          // Try hp first, then sanity, then any stat that looks like health
          const playerEntity = world.get('PLAYER');
          let healthKey = 'hp';
          if (playerEntity) {
            for (const key of ['hp', 'health', 'sanity', 'life']) {
              if (playerEntity.stats.has(key)) { healthKey = key; break; }
            }
          }
          const lossDSL = `trigger: *\nconditions: PLAYER.${healthKey}<=0\nchanges: GAME.lost\nnarrative: You have been defeated...`;
          try {
            const lossRules = parseRules(lossDSL);
            for (const r of lossRules) ruleSet.rules.push(r);
            console.log('[load_dsl]   + Injected loss rule: PLAYER.' + healthKey + '<=0 → GAME.lost');
          } catch (e) {
            console.log('[load_dsl]   ❌ Failed to inject loss rule: ' + (e as any).message);
          }
        }

        // Re-convert to JSON with injected rules
        const updatedJSON = worldToJSON(world, ruleSet);
        setCurrentGame(world, ruleSet, updatedJSON);
        console.log('[load_dsl] ✅ Loaded ' + entityCount + ' entities, ' + ruleSet.rules.length + ' rules (including injected win/loss)');
      } else {
        console.log('[load_dsl] ✅ Loaded ' + entityCount + ' entities, ' + ruleCount + ' rules');
      }

      return JSON.stringify({
        loaded: true,
        entities: entityCount,
        rules: ruleSet.rules.length,
        entityIds: world.all().map((e: any) => e.id),
        message: 'Game loaded into engine. Use simulate_game with useCurrentGame: true to test.',
      });
    } catch (e: any) {
      console.log('[load_dsl] ❌ Error: ' + e.message);
      return JSON.stringify({ loaded: false, errors: [e.message] });
    }
  },
});

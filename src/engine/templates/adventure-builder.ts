#!/usr/bin/env tsx
/**
 * Aureum Adventure Builder — LLM-Powered Text Adventure Designer
 *
 * Describe a world → LLM generates rooms, items, NPCs, rules → explore it → give feedback → iterate.
 *
 * Usage:  GOOGLE_API_KEY=... npx tsx src/engine/templates/adventure-builder.ts "a mysterious lighthouse"
 *    or:  source ../microdrama-studio/.env && npx tsx src/engine/templates/adventure-builder.ts
 */

import * as readline from 'readline';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createEntity, World, Entity } from '../world';
import { Rule, createRuleSet, RuleSet } from '../rules';
import { step, evaluateAll, StepResult } from '../evaluator';
import { serializeWorld, serializeRuleSet, serializeState, deserializeState, toJSON } from '../serializer';
import { buildGenerationPrompt, buildIterationPrompt, formatStateForContext, AUREUM_SCHEMA_REFERENCE } from '../aureum-context';

// ─── Terminal Helpers ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt(q: string): Promise<string> {
  return new Promise((r) => rl.question(q, (a) => r(a.trim())));
}

function clear(): void { process.stdout.write('\x1b[2J\x1b[H'); }

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function typewriter(text: string, delay = 15): Promise<void> {
  for (const char of text) { process.stdout.write(char); await sleep(delay); }
  console.log('');
}

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', italic: '\x1b[3m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
};

// ─── Gemini Interface ────────────────────────────────────────────────────────

const API_KEY = process.env.GOOGLE_API_KEY;

let genAI: GoogleGenerativeAI;
let model: any;

function initLLM(): void {
  if (!API_KEY) {
    console.error(`${c.red}Missing GOOGLE_API_KEY. Set it via environment variable.${c.reset}`);
    console.error(`${c.dim}Example: GOOGLE_API_KEY=your-key npx tsx src/engine/templates/adventure-builder.ts${c.reset}`);
    process.exit(1);
  }
  genAI = new GoogleGenerativeAI(API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
}

async function callLLM(promptText: string): Promise<string> {
  const result = await model.generateContent(promptText);
  return result.response.text();
}

function extractJSON(text: string): any {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(raw);
}

// ─── Game State ──────────────────────────────────────────────────────────────

interface GeneratedGame {
  name: string;
  description: string;
  entities: any[];
  rules: any[];
}

interface GameSession {
  world: World;
  ruleSet: RuleSet;
  gameName: string;
  gameDescription: string;
  gameOver: boolean;
  result: 'win' | 'loss' | null;
}

function loadGeneratedGame(game: GeneratedGame): GameSession {
  const entities: Entity[] = game.entities.map((e) =>
    createEntity(e.id, {
      tags: e.tags ?? [],
      stats: e.stats ?? {},
      links: e.links ?? {},
      meta: e.meta ?? {},
    })
  );

  const world = new World(entities);

  const rules: Rule[] = game.rules.map((r: any) => ({
    id: r.id,
    trigger: r.trigger ?? { id: '*' },
    conditions: r.conditions ?? [],
    changes: r.changes ?? [],
    sideEffects: r.sideEffects ?? [],
    priority: r.priority ?? 0,
    oneShot: r.oneShot ?? false,
    description: r.description ?? r.id,
  }));

  const ruleSet = createRuleSet(
    'generated',
    game.name,
    rules,
    game.description,
  );

  return {
    world,
    ruleSet,
    gameName: game.name,
    gameDescription: game.description,
    gameOver: false,
    result: null,
  };
}

// ─── Command Parser ──────────────────────────────────────────────────────────

interface ParsedCommand {
  action: string;
  target?: string;
  indirect?: string;
  raw: string;
}

const DIRECTION_ALIASES: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  u: 'up', d: 'down',
  north: 'north', south: 'south', east: 'east', west: 'west',
  up: 'up', down: 'down',
};

function parseCommand(input: string, session: GameSession): ParsedCommand {
  const raw = input.toLowerCase().trim();
  const words = raw.split(/\s+/);
  const first = words[0] ?? '';

  // Direction shortcuts: n, s, e, w, u, d or full words
  if (DIRECTION_ALIASES[first] && words.length === 1) {
    return { action: 'move', target: DIRECTION_ALIASES[first], raw };
  }

  // "go <direction>"
  if (first === 'go' && words.length >= 2) {
    const dir = DIRECTION_ALIASES[words[1]] ?? words[1];
    return { action: 'move', target: dir, raw };
  }

  // "look" / "l"
  if (first === 'look' || first === 'l') {
    if (words.length === 1) return { action: 'look', raw };
    // "look at X" — treat as examine
    const rest = words.slice(first === 'look' && words[1] === 'at' ? 2 : 1).join(' ');
    return { action: 'examine', target: rest, raw };
  }

  // "examine X" / "x X" / "inspect X"
  if (first === 'examine' || first === 'x' || first === 'inspect') {
    return { action: 'examine', target: words.slice(1).join(' '), raw };
  }

  // "take X" / "get X" / "pick up X" / "grab X"
  if (first === 'take' || first === 'get' || first === 'grab') {
    return { action: 'take', target: words.slice(1).join(' '), raw };
  }
  if (first === 'pick' && words[1] === 'up') {
    return { action: 'take', target: words.slice(2).join(' '), raw };
  }

  // "drop X" / "put down X"
  if (first === 'drop') {
    return { action: 'drop', target: words.slice(1).join(' '), raw };
  }
  if (first === 'put' && words[1] === 'down') {
    return { action: 'drop', target: words.slice(2).join(' '), raw };
  }

  // "use X on Y" / "use X with Y"
  if (first === 'use') {
    const rest = words.slice(1).join(' ');
    const onMatch = rest.match(/^(.+?)(?:\s+on\s+|\s+with\s+)(.+)$/);
    if (onMatch) {
      return { action: 'use', target: onMatch[1].trim(), indirect: onMatch[2].trim(), raw };
    }
    return { action: 'use', target: rest, raw };
  }

  // "talk to X" / "speak to X" / "talk X"
  if (first === 'talk' || first === 'speak' || first === 'chat') {
    const rest = words.slice(1).join(' ').replace(/^(to|with)\s+/, '');
    return { action: 'talk', target: rest, raw };
  }

  // "inventory" / "i" / "inv"
  if (first === 'inventory' || first === 'i' || first === 'inv') {
    return { action: 'inventory', raw };
  }

  // "help" / "?"
  if (first === 'help' || first === '?') {
    return { action: 'help', raw };
  }

  // "wait" / "z"
  if (first === 'wait' || first === 'z') {
    return { action: 'wait', raw };
  }

  // "quit" / "q"
  if (first === 'quit' || first === 'q') {
    return { action: 'quit', raw };
  }

  // "save"
  if (first === 'save') {
    return { action: 'save', raw };
  }

  // Unknown — try to match as a direction or item name
  if (DIRECTION_ALIASES[raw]) {
    return { action: 'move', target: DIRECTION_ALIASES[raw], raw };
  }

  return { action: 'unknown', target: raw, raw };
}

// ─── Entity Resolution ──────────────────────────────────────────────────────

/**
 * Find an entity by fuzzy name matching against meta.name or entity id.
 */
function resolveEntity(
  name: string,
  candidates: Entity[],
): Entity | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();

  // Exact meta.name match
  let match = candidates.find(
    (e) => (e.meta?.name as string ?? '').toLowerCase() === lower
  );
  if (match) return match;

  // Partial meta.name match
  match = candidates.find(
    (e) => (e.meta?.name as string ?? '').toLowerCase().includes(lower)
  );
  if (match) return match;

  // ID-based match
  match = candidates.find(
    (e) => e.id.toLowerCase().includes(lower.replace(/\s+/g, '_'))
  );
  return match;
}

// ─── Display Helpers ─────────────────────────────────────────────────────────

function bar(value: number, max: number, width: number, fill = '█', empty = '░', color = c.green): string {
  const filled = Math.max(0, Math.round((Math.min(value, max) / max) * width));
  return `${color}${fill.repeat(filled)}${c.dim}${empty.repeat(width - filled)}${c.reset}`;
}

function displayRoom(session: GameSession): void {
  const player = session.world.get('PLAYER');
  if (!player) return;

  const locId = player.links.get('location');
  if (!locId) return;

  const room = session.world.get(locId);
  if (!room) {
    console.log(`${c.dim}You are somewhere undefined.${c.reset}`);
    return;
  }

  const roomName = (room.meta?.name as string) ?? room.id;
  const visited = (room.stats.get('visited') ?? 0) > 0;
  const description = visited
    ? (room.meta?.description_short as string) ?? (room.meta?.description as string) ?? ''
    : (room.meta?.first_visit_text as string) ?? (room.meta?.description as string) ?? '';

  // Room header
  console.log('');
  console.log(`${c.bold}${c.cyan}═══ ${roomName} ═══${c.reset}`);
  console.log('');
  console.log(`${c.white}${description}${c.reset}`);
  console.log('');

  // Items in room
  const itemsHere = session.world.all().filter(
    (e) => e.tags.has('item') && e.tags.has('in_room') && e.links.get('location') === locId
  );
  if (itemsHere.length > 0) {
    console.log(`${c.yellow}Items here:${c.reset}`);
    for (const item of itemsHere) {
      const itemName = (item.meta?.name as string) ?? item.id;
      const itemDesc = (item.meta?.description as string) ?? '';
      console.log(`  ${c.yellow}•${c.reset} ${itemName}${itemDesc ? ` — ${c.dim}${itemDesc}${c.reset}` : ''}`);
    }
    console.log('');
  }

  // NPCs present
  const npcsHere = session.world.all().filter(
    (e) => e.tags.has('npc') && e.tags.has('alive') && e.links.get('location') === locId
  );
  if (npcsHere.length > 0) {
    console.log(`${c.magenta}People here:${c.reset}`);
    for (const npc of npcsHere) {
      const npcName = (npc.meta?.name as string) ?? npc.id;
      const npcDesc = (npc.meta?.description as string) ?? '';
      console.log(`  ${c.magenta}•${c.reset} ${npcName}${npcDesc ? ` — ${c.dim}${npcDesc.slice(0, 80)}${c.reset}` : ''}`);
    }
    console.log('');
  }

  // Puzzles here
  const puzzlesHere = session.world.all().filter(
    (e) => e.tags.has('puzzle') && e.links.get('location') === locId
  );
  for (const puzzle of puzzlesHere) {
    const puzzleName = (puzzle.meta?.name as string) ?? puzzle.id;
    const isSolved = puzzle.stats.get('solved') === 1;
    const label = isSolved ? `${c.green}✓ Solved${c.reset}` : `${c.red}✗ Unsolved${c.reset}`;
    console.log(`  ${c.cyan}◆${c.reset} ${puzzleName} [${label}]`);
  }
  if (puzzlesHere.length > 0) console.log('');

  // Exits
  const exits: string[] = [];
  for (const dir of ['north', 'south', 'east', 'west', 'up', 'down']) {
    const target = room.links.get(dir);
    if (target) {
      const targetRoom = session.world.get(target);
      const targetName = (targetRoom?.meta?.name as string) ?? target;
      exits.push(`${c.green}${dir}${c.reset} → ${c.dim}${targetName}${c.reset}`);
    }
  }
  if (exits.length > 0) {
    console.log(`${c.green}Exits:${c.reset} ${exits.join('  |  ')}`);
  } else {
    console.log(`${c.dim}No obvious exits.${c.reset}`);
  }
  console.log('');
}

function displayInventory(session: GameSession): void {
  const player = session.world.get('PLAYER');
  if (!player) return;

  const items = session.world.all().filter(
    (e) => e.tags.has('item') && e.tags.has('in_inventory')
  );

  console.log('');
  console.log(`${c.bold}${c.yellow}═══ Inventory ═══${c.reset}`);

  if (items.length === 0) {
    console.log(`  ${c.dim}Empty.${c.reset}`);
  } else {
    for (const item of items) {
      const name = (item.meta?.name as string) ?? item.id;
      console.log(`  ${c.yellow}•${c.reset} ${name}`);
    }
  }

  const size = player.stats.get('inventory_size') ?? items.length;
  const max = player.stats.get('max_inventory') ?? 10;
  console.log(`  ${c.dim}${size}/${max} slots${c.reset}`);
  console.log('');
}

function displayStatus(session: GameSession): void {
  const player = session.world.get('PLAYER');
  const game = session.world.get('GAME');
  if (!player) return;

  const hp = player.stats.get('hp') ?? 100;
  const maxHp = player.stats.get('max_hp') ?? 100;
  const hpColor = hp <= maxHp * 0.3 ? c.red : hp <= maxHp * 0.6 ? c.yellow : c.green;
  const turn = game?.stats.get('turn') ?? 1;

  console.log(`  ${c.dim}Turn ${turn}${c.reset}  |  HP: ${bar(hp, maxHp, 10, '█', '░', hpColor)} ${hpColor}${hp}/${maxHp}${c.reset}`);

  // Show objectives
  const objectives = session.world.all().filter((e) => e.tags.has('objective'));
  for (const obj of objectives) {
    const name = (obj.meta?.name as string) ?? obj.id;
    const prog = obj.stats.get('progress') ?? 0;
    const req = obj.stats.get('required') ?? 1;
    console.log(`  🎯 ${name}: ${bar(prog, req, 10, '■', '□', c.yellow)} ${c.yellow}${prog}/${req}${c.reset}`);
  }
}

function displayHelp(): void {
  console.log('');
  console.log(`${c.bold}${c.cyan}═══ Commands ═══${c.reset}`);
  console.log(`  ${c.green}go <direction>${c.reset} / ${c.green}n, s, e, w, u, d${c.reset}  — Move`);
  console.log(`  ${c.green}look${c.reset} / ${c.green}l${c.reset}                              — Look around`);
  console.log(`  ${c.green}examine <thing>${c.reset} / ${c.green}x <thing>${c.reset}            — Examine closely`);
  console.log(`  ${c.green}take <item>${c.reset} / ${c.green}get <item>${c.reset}               — Pick up item`);
  console.log(`  ${c.green}drop <item>${c.reset}                             — Drop item`);
  console.log(`  ${c.green}use <item>${c.reset}                              — Use item`);
  console.log(`  ${c.green}use <item> on <target>${c.reset}                  — Use item on something`);
  console.log(`  ${c.green}talk to <person>${c.reset}                        — Talk to NPC`);
  console.log(`  ${c.green}inventory${c.reset} / ${c.green}i${c.reset}                          — Check inventory`);
  console.log(`  ${c.green}wait${c.reset} / ${c.green}z${c.reset}                               — Wait a turn`);
  console.log(`  ${c.green}save${c.reset}                                    — Save game to file`);
  console.log(`  ${c.green}quit${c.reset} / ${c.green}q${c.reset}                               — Quit adventure`);
  console.log('');
}

// ─── Command Execution ──────────────────────────────────────────────────────

function checkGameOver(session: GameSession, result: StepResult): void {
  const gameOverEvent = result.sideEffects.find(
    (se) => se.type === 'game_event' && se.payload.event === 'game_over'
  );
  if (gameOverEvent) {
    session.gameOver = true;
    session.result = (gameOverEvent.payload.result as 'win' | 'loss') ?? 'loss';
  }

  const game = session.world.get('GAME');
  if (game) {
    if (game.tags.has('won')) { session.gameOver = true; session.result = 'win'; }
    if (game.tags.has('lost')) { session.gameOver = true; session.result = 'loss'; }
  }
}

async function executeCommand(parsed: ParsedCommand, session: GameSession): Promise<void> {
  const player = session.world.get('PLAYER');
  if (!player) return;

  const playerLoc = player.links.get('location') ?? '';
  const room = session.world.get(playerLoc);

  switch (parsed.action) {
    // ── Movement ──────────────────────────────────────────────────────────
    case 'move': {
      if (!room || !parsed.target) {
        console.log(`${c.dim}Go where?${c.reset}`);
        return;
      }
      const targetRoomId = room.links.get(parsed.target);
      if (!targetRoomId) {
        console.log(`${c.dim}You can't go ${parsed.target} from here.${c.reset}`);
        return;
      }
      const targetRoom = session.world.get(targetRoomId);
      if (!targetRoom) {
        console.log(`${c.dim}That way leads nowhere.${c.reset}`);
        return;
      }

      // Try stepping on the target room entity (fires its movement rule)
      const result = step(targetRoomId, session.world, session.ruleSet);
      if (result.match) {
        session.world = result.world;
        for (const se of result.sideEffects) {
          if (se.type === 'narrative') await typewriter(`${c.white}${se.payload.text}${c.reset}`);
        }
        checkGameOver(session, result);
      } else {
        // Fallback: directly move the player
        player.links.set('location', targetRoomId);
        const game = session.world.get('GAME');
        if (game) game.stats.set('turn', (game.stats.get('turn') ?? 1) + 1);
      }
      break;
    }

    // ── Look ──────────────────────────────────────────────────────────────
    case 'look': {
      if (room) {
        // Force showing the full description by temporarily clearing visited
        const origVisited = room.stats.get('visited') ?? 0;
        room.stats.set('visited', 0);
        displayRoom(session);
        room.stats.set('visited', origVisited);
      }
      break;
    }

    // ── Examine ───────────────────────────────────────────────────────────
    case 'examine': {
      if (!parsed.target) {
        console.log(`${c.dim}Examine what?${c.reset}`);
        return;
      }

      // Find item or NPC or puzzle
      const allExaminable = session.world.all().filter(
        (e) => e.tags.has('item') || e.tags.has('npc') || e.tags.has('puzzle')
      );
      const entity = resolveEntity(parsed.target, allExaminable);

      if (!entity) {
        console.log(`${c.dim}You don't see "${parsed.target}" here.${c.reset}`);
        return;
      }

      // Fire the examine rule via step
      const result = step(entity.id, session.world, session.ruleSet);
      if (result.match) {
        session.world = result.world;
        for (const se of result.sideEffects) {
          if (se.type === 'narrative') await typewriter(`${c.white}${se.payload.text}${c.reset}`);
        }
        checkGameOver(session, result);
      } else {
        // Fallback: show meta
        const examineText = (entity.meta?.examine_text as string) ?? (entity.meta?.description as string) ?? 'Nothing special.';
        console.log(`${c.white}${examineText}${c.reset}`);
      }
      break;
    }

    // ── Take ──────────────────────────────────────────────────────────────
    case 'take': {
      if (!parsed.target) {
        console.log(`${c.dim}Take what?${c.reset}`);
        return;
      }

      const itemsHere = session.world.all().filter(
        (e) => e.tags.has('item') && e.tags.has('in_room') && e.links.get('location') === playerLoc
      );
      const item = resolveEntity(parsed.target, itemsHere);

      if (!item) {
        console.log(`${c.dim}You don't see "${parsed.target}" to take.${c.reset}`);
        return;
      }

      const invSize = player.stats.get('inventory_size') ?? 0;
      const maxInv = player.stats.get('max_inventory') ?? 10;
      if (invSize >= maxInv) {
        console.log(`${c.red}Your inventory is full.${c.reset}`);
        return;
      }

      const result = step(item.id, session.world, session.ruleSet);
      if (result.match) {
        session.world = result.world;
        const itemName = (item.meta?.name as string) ?? item.id;
        for (const se of result.sideEffects) {
          if (se.type === 'narrative') console.log(`${c.white}${se.payload.text}${c.reset}`);
        }
        console.log(`${c.green}Taken: ${itemName}${c.reset}`);
        checkGameOver(session, result);
      } else {
        console.log(`${c.dim}You can't take that.${c.reset}`);
      }
      break;
    }

    // ── Drop ──────────────────────────────────────────────────────────────
    case 'drop': {
      if (!parsed.target) {
        console.log(`${c.dim}Drop what?${c.reset}`);
        return;
      }

      const invItems = session.world.all().filter(
        (e) => e.tags.has('item') && e.tags.has('in_inventory')
      );
      const item = resolveEntity(parsed.target, invItems);

      if (!item) {
        console.log(`${c.dim}You don't have "${parsed.target}".${c.reset}`);
        return;
      }

      // Step fires the drop rule; then manually set location link
      const result = step(item.id, session.world, session.ruleSet);
      if (result.match) {
        session.world = result.world;
        // Update location to current room
        const droppedItem = session.world.get(item.id);
        if (droppedItem) droppedItem.links.set('location', playerLoc);
        const itemName = (item.meta?.name as string) ?? item.id;
        for (const se of result.sideEffects) {
          if (se.type === 'narrative') console.log(`${c.white}${se.payload.text}${c.reset}`);
        }
        console.log(`${c.yellow}Dropped: ${itemName}${c.reset}`);
        checkGameOver(session, result);
      } else {
        console.log(`${c.dim}You can't drop that.${c.reset}`);
      }
      break;
    }

    // ── Use ───────────────────────────────────────────────────────────────
    case 'use': {
      if (!parsed.target) {
        console.log(`${c.dim}Use what?${c.reset}`);
        return;
      }

      const allItems = session.world.all().filter(
        (e) => e.tags.has('item') && e.tags.has('in_inventory')
      );
      const item = resolveEntity(parsed.target, allItems);

      if (!item) {
        console.log(`${c.dim}You don't have "${parsed.target}".${c.reset}`);
        return;
      }

      // Step the item entity — the rules should handle use context
      const result = step(item.id, session.world, session.ruleSet);
      if (result.match) {
        session.world = result.world;
        for (const se of result.sideEffects) {
          if (se.type === 'narrative') await typewriter(`${c.white}${se.payload.text}${c.reset}`);
        }
        checkGameOver(session, result);

        // After use, check win/loss via objective entities
        if (!session.gameOver) {
          checkEndConditions(session);
        }
      } else {
        console.log(`${c.dim}Nothing happens.${c.reset}`);
      }
      break;
    }

    // ── Talk ──────────────────────────────────────────────────────────────
    case 'talk': {
      if (!parsed.target) {
        console.log(`${c.dim}Talk to whom?${c.reset}`);
        return;
      }

      const npcsHere = session.world.all().filter(
        (e) => e.tags.has('npc') && e.tags.has('alive') && e.links.get('location') === playerLoc
      );
      const npc = resolveEntity(parsed.target, npcsHere);

      if (!npc) {
        console.log(`${c.dim}There's nobody called "${parsed.target}" here.${c.reset}`);
        return;
      }

      const result = step(npc.id, session.world, session.ruleSet);
      if (result.match) {
        session.world = result.world;
        for (const se of result.sideEffects) {
          if (se.type === 'narrative') await typewriter(`${c.white}${se.payload.text}${c.reset}`);
        }
        checkGameOver(session, result);
      } else {
        // Fallback: show default dialogue
        const dialogue = (npc.meta?.dialogue_default as string) ?? 'They have nothing to say.';
        await typewriter(`${c.white}${dialogue}${c.reset}`);
      }
      break;
    }

    // ── Inventory ─────────────────────────────────────────────────────────
    case 'inventory': {
      displayInventory(session);
      break;
    }

    // ── Wait ──────────────────────────────────────────────────────────────
    case 'wait': {
      const game = session.world.get('GAME');
      if (game) game.stats.set('turn', (game.stats.get('turn') ?? 1) + 1);
      console.log(`${c.dim}Time passes.${c.reset}`);

      // Show ambient text
      if (room) {
        const ambient = (room.meta?.ambient_text as string);
        if (ambient) {
          console.log(`${c.italic}${c.dim}${ambient}${c.reset}`);
        }
      }
      break;
    }

    // ── Save ──────────────────────────────────────────────────────────────
    case 'save': {
      const fs = await import('fs');
      const filename = `adventure-save-${Date.now()}.json`;
      const data = toJSON(session.world, session.ruleSet);
      fs.writeFileSync(filename, data);
      console.log(`${c.green}Game saved to ${filename}${c.reset}`);
      break;
    }

    // ── Help ──────────────────────────────────────────────────────────────
    case 'help': {
      displayHelp();
      break;
    }

    // ── Quit ──────────────────────────────────────────────────────────────
    case 'quit': {
      session.gameOver = true;
      session.result = 'loss';
      break;
    }

    // ── Unknown ───────────────────────────────────────────────────────────
    default: {
      console.log(`${c.dim}I don't understand "${parsed.raw}". Type "help" for commands.${c.reset}`);
      break;
    }
  }
}

function checkEndConditions(session: GameSession): void {
  // Check win/loss by stepping trigger entities
  for (const triggerId of ['GAME', 'PLAYER']) {
    const result = step(triggerId, session.world, session.ruleSet);
    if (result.match) {
      session.world = result.world;
      for (const se of result.sideEffects) {
        if (se.type === 'narrative') console.log(se.payload.text);
      }
      checkGameOver(session, result);
      if (session.gameOver) break;
    }
  }

  // Check objectives
  if (!session.gameOver) {
    const objectives = session.world.all().filter((e) => e.tags.has('objective'));
    for (const obj of objectives) {
      const result = step(obj.id, session.world, session.ruleSet);
      if (result.match) {
        session.world = result.world;
        for (const se of result.sideEffects) {
          if (se.type === 'narrative') console.log(se.payload.text);
        }
        checkGameOver(session, result);
        if (session.gameOver) break;
      }
    }
  }
}

// ─── Play Loop ───────────────────────────────────────────────────────────────

async function playAdventure(session: GameSession): Promise<void> {
  const MAX_TURNS = 500;

  clear();

  console.log(`${c.bold}${c.cyan}`);
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  ${session.gameName.padEnd(48).slice(0, 48)}║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(c.reset);
  console.log(`${c.dim}${session.gameDescription}${c.reset}`);
  console.log(`${c.dim}Type "help" for commands.${c.reset}`);
  console.log('');

  displayRoom(session);
  displayStatus(session);

  while (!session.gameOver) {
    const game = session.world.get('GAME');
    const turn = game?.stats.get('turn') ?? 1;
    if (turn > MAX_TURNS) {
      session.gameOver = true;
      session.result = 'loss';
      console.log(`${c.red}Time runs out. The signal fades.${c.reset}`);
      break;
    }

    const input = await prompt(`${c.bold}${c.green}> ${c.reset}`);
    if (!input) continue;

    const parsed = parseCommand(input, session);
    await executeCommand(parsed, session);

    if (session.gameOver) break;

    // After movement or significant actions, show the room
    if (parsed.action === 'move' && !session.gameOver) {
      displayRoom(session);
      displayStatus(session);
    }
  }
}

// ─── Adventure Generation Prompt ─────────────────────────────────────────────

function buildAdventureGenerationPrompt(userPrompt: string): string {
  return `${AUREUM_SCHEMA_REFERENCE}

---

# Your Task

Generate a TEXT ADVENTURE game based on this description:

"${userPrompt}"

## Text Adventure Entity Requirements

You MUST include ALL of the following:

### GAME entity
- id: "GAME", tags: ["game", "active"]
- stats: { turn: 1, atmosphere: 1 }
- meta: { name: "Adventure Name", description: "One-line description" }

### PLAYER entity
- id: "PLAYER", tags: ["player"]
- stats: { hp: 100, max_hp: 100, inventory_size: 0, max_inventory: 10 }
- links: { location: "ROOM_START" } (must point to a valid room)

### Rooms (6-10 rooms)
- id: "ROOM_X", tags: ["room"]
- stats: { visited: 0 }
- links: { north/south/east/west/up/down: "ROOM_Y" } — directional exits, must be bidirectional
- meta: { name, description (3-5 sensory sentences), description_short (1 sentence), first_visit_text, ambient_text }

### Items (5-8 items)
- id: "ITEM_X", tags: ["item", "in_room"] or ["item", "in_inventory"]
- links: { location: "ROOM_X" }
- meta: { name, description, examine_text }
- stats: { usable: 0 or 1 }

### NPCs (2-4)
- id: "NPC_X", tags: ["npc", "alive", "friendly" or "hostile"]
- links: { location: "ROOM_X" }
- meta: { name, description, dialogue_default, dialogue_quest }
- stats: { disposition: 50, talked: 0 }

### Puzzles (2-3)
- id: "PUZZLE_X", tags: ["puzzle", "locked"]
- links: { location: "ROOM_X", requires_item: "ITEM_X" }
- meta: { name, description, solved_text, hint_text }
- stats: { solved: 0 }

### Objective (at least 1)
- id: "OBJECTIVE_X", tags: ["objective"]
- stats: { progress: 0, required: N }
- meta: { name, description }

## Rule Requirements

### Movement rules (one per room)
Each room MUST have a movement rule:
{
  "id": "move_to_X",
  "trigger": { "id": "ROOM_X", "tags": [{ "tag": "room", "negated": false }] },
  "conditions": [],
  "changes": [
    { "target": "PLAYER", "operations": [{ "type": "setLink", "key": "location", "targetId": "ROOM_X" }] },
    { "target": "ROOM_X", "operations": [{ "type": "setStat", "key": "visited", "value": 1 }] },
    { "target": "GAME", "operations": [{ "type": "incrementStat", "key": "turn", "amount": 1 }] }
  ],
  "sideEffects": [{ "type": "narrative", "payload": { "text": "Movement description..." } }]
}

### Examine rules (for important items)
{
  "id": "examine_X",
  "trigger": { "id": "ITEM_X" },
  "conditions": [],
  "changes": [],
  "sideEffects": [{ "type": "narrative", "payload": { "text": "Detailed description..." } }]
}

### Take item (generic wildcard rule)
{
  "id": "take_item",
  "trigger": { "id": "*", "tags": [{ "tag": "item", "negated": false }, { "tag": "in_room", "negated": false }] },
  "changes": [
    { "target": "$", "operations": [{ "type": "removeTag", "tag": "in_room" }, { "type": "addTag", "tag": "in_inventory" }, { "type": "setLink", "key": "location", "targetId": "PLAYER" }] },
    { "target": "PLAYER", "operations": [{ "type": "incrementStat", "key": "inventory_size", "amount": 1 }] }
  ],
  "sideEffects": [{ "type": "narrative", "payload": { "text": "Taken." } }]
}

### Drop item (generic wildcard rule)
{
  "id": "drop_item",
  "trigger": { "id": "*", "tags": [{ "tag": "item", "negated": false }, { "tag": "in_inventory", "negated": false }] },
  "changes": [
    { "target": "$", "operations": [{ "type": "removeTag", "tag": "in_inventory" }, { "type": "addTag", "tag": "in_room" }] },
    { "target": "PLAYER", "operations": [{ "type": "incrementStat", "key": "inventory_size", "amount": -1 }] }
  ],
  "sideEffects": [{ "type": "narrative", "payload": { "text": "Dropped." } }]
}

### Talk to NPC rules
{
  "id": "talk_to_X",
  "trigger": { "id": "NPC_X", "tags": [{ "tag": "npc", "negated": false }] },
  "conditions": [{ "id": "PLAYER", "links": [{ "key": "location", "targetId": "ROOM_Y", "negated": false }] }],
  "changes": [{ "target": "NPC_X", "operations": [{ "type": "setStat", "key": "talked", "value": 1 }] }],
  "sideEffects": [{ "type": "narrative", "payload": { "text": "Dialogue..." } }]
}

### Use item on puzzle rules (specific per puzzle)
{
  "id": "use_X_on_Y",
  "trigger": { "id": "ITEM_X" },
  "conditions": [
    { "id": "ITEM_X", "tags": [{ "tag": "in_inventory", "negated": false }] },
    { "id": "PLAYER", "links": [{ "key": "location", "targetId": "ROOM_Y", "negated": false }] },
    { "id": "PUZZLE_Y", "tags": [{ "tag": "locked", "negated": false }] }
  ],
  "changes": [
    { "target": "PUZZLE_Y", "operations": [{ "type": "removeTag", "tag": "locked" }, { "type": "addTag", "tag": "solved" }, { "type": "setStat", "key": "solved", "value": 1 }] },
    { "target": "OBJECTIVE_Z", "operations": [{ "type": "incrementStat", "key": "progress", "amount": 1 }] }
  ],
  "sideEffects": [{ "type": "narrative", "payload": { "text": "Puzzle solved!" } }],
  "oneShot": true,
  "priority": 20
}

### Win condition (priority 100)
{
  "id": "win_condition",
  "trigger": { "id": "OBJECTIVE_X" },
  "conditions": [{ "id": "OBJECTIVE_X", "stats": [{ "key": "progress", "operator": ">=", "value": N }] }],
  "priority": 100,
  "changes": [{ "target": "GAME", "operations": [{ "type": "removeTag", "tag": "active" }, { "type": "addTag", "tag": "won" }] }],
  "sideEffects": [
    { "type": "narrative", "payload": { "text": "Victory text..." } },
    { "type": "game_event", "payload": { "event": "game_over", "result": "win" } }
  ],
  "oneShot": true
}

### Loss condition (priority 100)
{
  "id": "lose_condition",
  "trigger": { "id": "PLAYER" },
  "conditions": [{ "id": "PLAYER", "stats": [{ "key": "hp", "operator": "<=", "value": 0 }] }],
  "priority": 100,
  "changes": [{ "target": "GAME", "operations": [{ "type": "removeTag", "tag": "active" }, { "type": "addTag", "tag": "lost" }] }],
  "sideEffects": [
    { "type": "narrative", "payload": { "text": "Defeat text..." } },
    { "type": "game_event", "payload": { "event": "game_over", "result": "loss" } }
  ],
  "oneShot": true
}

## Critical Rules
1. Room links MUST be bidirectional — if Room A links north to Room B, Room B MUST link south to Room A.
2. Every room must have a movement rule with that room's ID as the trigger.
3. Item locations must match actual room IDs.
4. NPCs must be placed in rooms that exist.
5. Puzzles must reference items and rooms that exist.
6. The objective.required must be achievable by solving all puzzles.
7. Write atmospheric, evocative descriptions. Second person, present tense.

## Output Format

Return ONLY a JSON object (no markdown, no explanation):
{
  "name": "Adventure Name",
  "description": "One-line description",
  "entities": [...],
  "rules": [...]
}`;
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  clear();

  const args = process.argv.slice(2);
  const isDemo = args.includes('--demo');
  const cliPrompt = args.filter((a) => !a.startsWith('--')).join(' ').trim();

  if (!isDemo) initLLM();

  console.log(`${c.bold}${c.cyan}`);
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       🏰 AUREUM ADVENTURE BUILDER 🏰             ║');
  console.log('║     Describe a world. Explore it. Shape it.      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(c.reset);
  console.log(`${c.dim}Powered by the Aureum Rules Engine + Gemini${c.reset}`);
  console.log('');

  let currentGame: GeneratedGame | null = null;
  let currentSession: GameSession | null = null;

  // ── Demo mode: load built-in adventure ──────────────────────────────────
  if (isDemo) {
    console.log(`${c.cyan}Loading built-in adventure: The Keeper's Signal...${c.reset}`);
    const { getTextAdventureGame } = await import('./text-adventure');
    currentGame = getTextAdventureGame() as GeneratedGame;
    currentSession = loadGeneratedGame(currentGame);
    console.log(`${c.green}✅ Loaded: ${c.bold}${currentGame.name}${c.reset}`);
    console.log(`${c.dim}   ${currentGame.description}${c.reset}`);
  }

  // ── LLM generation mode ─────────────────────────────────────────────────
  let gamePrompt: string = cliPrompt;
  if (!isDemo) {
    if (cliPrompt) {
      console.log(`${c.dim}Theme: ${gamePrompt}${c.reset}`);
    } else {
      console.log(`${c.bold}Describe your text adventure world:${c.reset}`);
      console.log(`${c.dim}(Theme, setting, atmosphere, puzzles — the more detail, the better)${c.reset}`);
      console.log('');
      gamePrompt = await prompt(`${c.green}> ${c.reset}`);
    }

    if (!gamePrompt) {
      console.log(`${c.dim}No prompt given. Bye!${c.reset}`);
      rl.close();
      return;
    }
  }

  async function generateGame(promptText: string): Promise<GeneratedGame> {
    console.log('');
    await typewriter(`${c.dim}Generating your adventure...${c.reset}`, 30);

    const fullPrompt = buildAdventureGenerationPrompt(promptText);
    const response = await callLLM(fullPrompt);
    const game = extractJSON(response);

    console.log('');
    console.log(`${c.green}✅ Created: ${c.bold}${game.name}${c.reset}`);
    console.log(`${c.dim}   ${game.description}${c.reset}`);
    console.log(`${c.dim}   ${game.entities?.length ?? 0} entities, ${game.rules?.length ?? 0} rules${c.reset}`);

    const rooms = game.entities?.filter((e: any) => e.tags?.includes('room')) ?? [];
    const items = game.entities?.filter((e: any) => e.tags?.includes('item')) ?? [];
    const npcs = game.entities?.filter((e: any) => e.tags?.includes('npc')) ?? [];
    const puzzles = game.entities?.filter((e: any) => e.tags?.includes('puzzle')) ?? [];
    if (rooms.length) console.log(`${c.dim}   ${rooms.length} rooms: ${rooms.map((r: any) => r.meta?.name || r.id).join(', ')}${c.reset}`);
    if (items.length) console.log(`${c.dim}   ${items.length} items: ${items.map((i: any) => i.meta?.name || i.id).join(', ')}${c.reset}`);
    if (npcs.length) console.log(`${c.dim}   ${npcs.length} NPCs: ${npcs.map((n: any) => n.meta?.name || n.id).join(', ')}${c.reset}`);
    if (puzzles.length) console.log(`${c.dim}   ${puzzles.length} puzzles${c.reset}`);

    return game;
  }

  async function iterateGame(feedback: string): Promise<void> {
    if (!currentGame || !currentSession) return;

    console.log('');
    await typewriter(`${c.dim}Updating adventure based on feedback...${c.reset}`, 30);

    const stateJson = JSON.parse(toJSON(currentSession.world, currentSession.ruleSet));
    const stateText = formatStateForContext(
      { entities: stateJson.world?.entities ?? [] },
      { rules: stateJson.rules?.rules ?? [] },
    );

    const iterPrompt = buildIterationPrompt(stateText, feedback);
    const response = await callLLM(iterPrompt);
    const changes = extractJSON(response);

    // Apply changes
    if (changes.changes) {
      const ch = changes.changes;

      for (const id of (ch.remove_entities ?? [])) {
        currentGame.entities = currentGame.entities.filter((e: any) => e.id !== id);
      }

      for (const e of (ch.add_entities ?? [])) {
        currentGame.entities.push(e);
      }

      for (const update of (ch.update_entities ?? [])) {
        const entity = currentGame.entities.find((e: any) => e.id === update.id);
        if (entity) {
          if (update.addTags) entity.tags = [...(entity.tags ?? []), ...update.addTags];
          if (update.removeTags) entity.tags = (entity.tags ?? []).filter((t: string) => !update.removeTags.includes(t));
          if (update.setStats) entity.stats = { ...(entity.stats ?? {}), ...update.setStats };
          if (update.setLinks) entity.links = { ...(entity.links ?? {}), ...update.setLinks };
          if (update.setMeta) entity.meta = { ...(entity.meta ?? {}), ...update.setMeta };
        }
      }

      for (const id of (ch.remove_rules ?? [])) {
        currentGame.rules = currentGame.rules.filter((r: any) => r.id !== id);
      }

      for (const r of (ch.add_rules ?? [])) {
        currentGame.rules.push(r);
      }

      for (const r of (ch.update_rules ?? [])) {
        currentGame.rules = currentGame.rules.filter((existing: any) => existing.id !== r.id);
        currentGame.rules.push(r);
      }
    }

    console.log(`${c.green}✅ ${changes.summary ?? 'Adventure updated.'}${c.reset}`);
    currentSession = loadGeneratedGame(currentGame);
  }

  // ── Generate the initial adventure (skip in demo mode) ──────────────────
  if (!isDemo) {
    try {
      currentGame = await generateGame(gamePrompt);
      currentSession = loadGeneratedGame(currentGame);
    } catch (err) {
      console.error(`${c.red}Generation failed: ${err}${c.reset}`);
      rl.close();
      return;
    }
  }

  // ── Main Menu Loop ─────────────────────────────────────────────────────
  while (true) {
    console.log('');
    console.log(`${c.bold}What next?${c.reset}`);
    console.log(`  ${c.green}[P]${c.reset}lay the adventure`);
    console.log(`  ${c.yellow}[F]${c.reset}eedback — tell the AI what to change`);
    console.log(`  ${c.cyan}[R]${c.reset}egenerate from scratch`);
    console.log(`  ${c.magenta}[I]${c.reset}nspect entities and rules`);
    console.log(`  ${c.blue}[S]${c.reset}ave adventure to file`);
    console.log(`  ${c.dim}[Q]${c.reset}uit`);
    console.log('');

    const choice = (await prompt(`${c.bold}> ${c.reset}`)).toLowerCase();

    if (choice === 'q') break;

    if (choice === 'p') {
      currentSession = loadGeneratedGame(currentGame!);
      await playAdventure(currentSession);

      console.log('');
      console.log('═'.repeat(50));
      if (currentSession.result === 'win') {
        console.log(`${c.bold}${c.green}  🌟 ADVENTURE COMPLETE!${c.reset}`);
      } else {
        console.log(`${c.bold}${c.red}  💀 GAME OVER${c.reset}`);
      }
      console.log('═'.repeat(50));
      currentSession.gameOver = false;
    }

    if (choice === 'f') {
      console.log('');
      console.log(`${c.bold}What would you change?${c.reset}`);
      console.log(`${c.dim}(Describe room changes, new items, puzzle adjustments, etc.)${c.reset}`);
      const feedback = await prompt(`${c.yellow}> ${c.reset}`);
      if (feedback) {
        try {
          await iterateGame(feedback);
          currentSession = loadGeneratedGame(currentGame!);
        } catch (err) {
          console.error(`${c.red}Iteration failed: ${err}${c.reset}`);
        }
      }
    }

    if (choice === 'r') {
      console.log('');
      console.log(`${c.bold}New description (or Enter to reuse):${c.reset}`);
      const newPrompt = await prompt(`${c.green}> ${c.reset}`);
      try {
        currentGame = await generateGame(newPrompt || gamePrompt);
        currentSession = loadGeneratedGame(currentGame);
      } catch (err) {
        console.error(`${c.red}Generation failed: ${err}${c.reset}`);
      }
    }

    if (choice === 'i') {
      console.log('');
      console.log(`${c.bold}${c.cyan}── Rooms ──${c.reset}`);
      for (const e of currentGame!.entities.filter((e: any) => e.tags?.includes('room'))) {
        const name = e.meta?.name ?? e.id;
        const exits = Object.entries(e.links ?? {}).filter(([k]) => ['north', 'south', 'east', 'west', 'up', 'down'].includes(k));
        console.log(`  ${c.bold}${e.id}${c.reset} (${name}) ${c.dim}exits: ${exits.map(([k, v]) => `${k}→${v}`).join(', ')}${c.reset}`);
      }
      console.log('');

      console.log(`${c.bold}${c.yellow}── Items ──${c.reset}`);
      for (const e of currentGame!.entities.filter((e: any) => e.tags?.includes('item'))) {
        const name = e.meta?.name ?? e.id;
        const loc = e.links?.location ?? '?';
        const tags = e.tags?.filter((t: string) => t !== 'item').join(', ') ?? '';
        console.log(`  ${c.bold}${e.id}${c.reset} (${name}) ${c.dim}@ ${loc} [${tags}]${c.reset}`);
      }
      console.log('');

      console.log(`${c.bold}${c.magenta}── NPCs ──${c.reset}`);
      for (const e of currentGame!.entities.filter((e: any) => e.tags?.includes('npc'))) {
        const name = e.meta?.name ?? e.id;
        const loc = e.links?.location ?? '?';
        console.log(`  ${c.bold}${e.id}${c.reset} (${name}) ${c.dim}@ ${loc}${c.reset}`);
      }
      console.log('');

      console.log(`${c.bold}${c.cyan}── Rules ──${c.reset}`);
      for (const r of currentGame!.rules) {
        console.log(`  ${c.bold}${r.id}${c.reset} — ${r.description ?? ''}${r.priority ? ` (priority: ${r.priority})` : ''}`);
      }
    }

    if (choice === 's') {
      const fs = await import('fs');
      const filename = `generated-adventure-${Date.now()}.json`;
      fs.writeFileSync(filename, JSON.stringify(currentGame, null, 2));
      console.log(`${c.green}Adventure saved to ${filename}${c.reset}`);
    }
  }

  console.log(`${c.dim}Goodbye. Your adventures persist in memory.${c.reset}`);
  rl.close();
}

main().catch((err) => {
  console.error(`${c.red}Fatal error: ${err}${c.reset}`);
  process.exit(1);
});

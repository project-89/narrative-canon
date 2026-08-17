#!/usr/bin/env tsx
/**
 * Aureum Game Builder — LLM-Powered Card Game Designer
 *
 * Describe a game → LLM generates entities + rules → play it → give feedback → iterate.
 *
 * Usage:  GOOGLE_API_KEY=... npx tsx src/engine/templates/game-builder.ts
 *    or:  source ../microdrama-studio/.env && npx tsx src/engine/templates/game-builder.ts
 */

import * as readline from 'readline';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createEntity, World, Entity } from '../world';
import { Rule, createRuleSet, RuleSet } from '../rules';
import { step, evaluateAll, StepResult } from '../evaluator';
import { serializeWorld, serializeRuleSet, serializeState, deserializeState, toJSON } from '../serializer';
import { buildGenerationPrompt, buildIterationPrompt, formatStateForContext } from '../aureum-context';

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
    console.error(`${c.dim}Example: GOOGLE_API_KEY=your-key npx tsx src/engine/templates/game-builder.ts${c.reset}`);
    process.exit(1);
  }
  genAI = new GoogleGenerativeAI(API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
}

async function callLLM(prompt: string): Promise<string> {
  const result = await model.generateContent(prompt);
  return result.response.text();
}

function extractJSON(text: string): any {
  // Try to extract JSON from markdown code blocks or raw text
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

  // Build proper Rule objects from generated JSON
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

// ─── Display Helpers ─────────────────────────────────────────────────────────

function bar(value: number, max: number, width: number, fill = '█', empty = '░', color = c.green): string {
  const filled = Math.max(0, Math.round((Math.min(value, max) / max) * width));
  return `${color}${fill.repeat(filled)}${c.dim}${empty.repeat(width - filled)}${c.reset}`;
}

function displayState(session: GameSession): void {
  const game = session.world.get('GAME');
  const player = session.world.get('PLAYER');

  if (!game || !player) {
    console.log(`${c.dim}(No GAME or PLAYER entity found)${c.reset}`);
    return;
  }

  const round = game.stats.get('round') ?? 1;
  const phase = game.stats.get('phase') ?? 0;

  console.log(`${c.bold}Round ${round}${c.reset}`);
  console.log('─'.repeat(50));

  // Show all player stats dynamically
  for (const [key, value] of player.stats) {
    const maxKey = `max_${key}`;
    const max = player.stats.get(maxKey);
    if (maxKey === key || key.startsWith('max_')) continue;

    if (max) {
      const color = value <= max * 0.3 ? c.red : value <= max * 0.6 ? c.yellow : c.green;
      console.log(`  ${key}: ${bar(value, max, 10, '█', '░', color)} ${color}${value}/${max}${c.reset}`);
    } else {
      console.log(`  ${key}: ${c.cyan}${value}${c.reset}`);
    }
  }

  // Show game-level stats
  for (const [key, value] of game.stats) {
    if (key === 'round' || key === 'phase') continue;
    console.log(`  ${key}: ${c.yellow}${value}${c.reset}`);
  }

  // Show location
  const locId = player.links.get('location');
  if (locId) {
    const loc = session.world.get(locId);
    const locName = (loc?.meta?.name as string) ?? locId;
    console.log(`  📍 ${c.bold}${locName}${c.reset}`);
  }

  // Show enemies
  const enemies = session.world.all().filter((e) => e.tags.has('enemy') && e.tags.has('active'));
  if (enemies.length > 0) {
    console.log('');
    console.log(`  ${c.red}Enemies:${c.reset}`);
    for (const e of enemies) {
      const name = (e.meta?.name as string) ?? e.id;
      const hp = e.stats.get('hp') ?? '?';
      const loc = e.links.get('location');
      const locName = loc ? (session.world.get(loc)?.meta?.name as string ?? loc) : '?';
      const isHere = loc === player.links.get('location');
      console.log(`    ${name} (HP: ${hp}) ${isHere ? `${c.red}⚠ HERE${c.reset}` : `${c.dim}@ ${locName}${c.reset}`}`);
    }
  }

  // Show objectives
  const objectives = session.world.all().filter((e) => e.tags.has('objective'));
  if (objectives.length > 0) {
    console.log('');
    for (const obj of objectives) {
      const name = (obj.meta?.name as string) ?? obj.id;
      const prog = obj.stats.get('progress') ?? 0;
      const req = obj.stats.get('required') ?? 1;
      console.log(`  🎯 ${name}: ${bar(prog, req, 10, '■', '□', c.yellow)} ${c.yellow}${prog}/${req}${c.reset}`);
    }
  }

  console.log('');
}

function getPlayableActions(session: GameSession): Array<{ id: string; name: string; type: 'card' | 'move'; cost: number; desc: string }> {
  const actions: Array<{ id: string; name: string; type: 'card' | 'move'; cost: number; desc: string }> = [];
  const player = session.world.get('PLAYER');
  if (!player) return actions;

  // Cards in hand
  const cards = session.world.all().filter(
    (e) => e.tags.has('card') && e.tags.has('in_hand')
  );
  for (const card of cards) {
    actions.push({
      id: card.id,
      name: (card.meta?.name as string) ?? card.id,
      type: 'card',
      cost: card.stats.get('se_cost') ?? card.stats.get('cost') ?? card.stats.get('energy_cost') ?? 0,
      desc: (card.meta?.effect as string) ?? (card.meta?.description as string) ?? '',
    });
  }

  // Locations to move to
  const currentLoc = player.links.get('location');
  const locations = session.world.all().filter(
    (e) => e.tags.has('location') && e.id !== currentLoc
  );
  for (const loc of locations) {
    actions.push({
      id: loc.id,
      name: (loc.meta?.name as string) ?? loc.id,
      type: 'move',
      cost: 0,
      desc: `Move to ${loc.meta?.name ?? loc.id}`,
    });
  }

  return actions;
}

// ─── Play Loop ───────────────────────────────────────────────────────────────

async function playGame(session: GameSession): Promise<void> {
  const MAX_ROUNDS = 30;
  let roundCount = 0;

  while (!session.gameOver && roundCount < MAX_ROUNDS) {
    roundCount++;
    clear();

    console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗`);
    console.log(`║  ${session.gameName.padEnd(48).slice(0, 48)}║`);
    console.log(`╚══════════════════════════════════════════════════╝${c.reset}`);
    console.log('');

    // Run sync/start-of-round if GAME exists
    const game = session.world.get('GAME');
    if (game) {
      const syncResult = step('GAME', session.world, session.ruleSet);
      if (syncResult.match) {
        session.world = syncResult.world;
        for (const se of syncResult.sideEffects) {
          if (se.type === 'narrative') console.log(se.payload.text);
        }
        checkGameOver(session, syncResult);
        if (session.gameOver) break;
      }
    }

    displayState(session);

    // Action loop
    const player = session.world.get('PLAYER');
    let actionsLeft = player?.stats.get('actions_remaining') ?? 3;
    let actionsTaken = 0;

    while (actionsLeft > 0 && !session.gameOver) {
      const actions = getPlayableActions(session);
      const energyStat = findEnergyStat(session);
      const energy = player?.stats.get(energyStat) ?? 0;

      console.log(`${c.bold}── What do you do? (${actionsLeft} action${actionsLeft !== 1 ? 's' : ''}) ──${c.reset}`);
      console.log('');

      let idx = 1;
      const playable: typeof actions = [];

      const cards = actions.filter((a) => a.type === 'card');
      if (cards.length > 0) {
        console.log(`${c.cyan}Cards:${c.reset}`);
        for (const card of cards) {
          const affordable = card.cost <= energy;
          const color = affordable ? c.white : c.dim;
          const tag = !affordable ? ` ${c.red}[need ${card.cost} ${energyStat}]${c.reset}` : '';
          console.log(`  ${color}${idx}. ${card.name}${c.reset} — ${c.dim}${card.desc}${c.reset}${tag}`);
          playable.push(card);
          idx++;
        }
        console.log('');
      }

      const moves = actions.filter((a) => a.type === 'move');
      if (moves.length > 0) {
        console.log(`${c.yellow}Move:${c.reset}`);
        for (const move of moves) {
          console.log(`  ${c.white}${idx}. ${move.desc}${c.reset}`);
          playable.push(move);
          idx++;
        }
        console.log('');
      }

      console.log(`  ${c.dim}${idx}. End turn${c.reset}`);
      console.log('');

      const input = await prompt(`${c.bold}> ${c.reset}`);
      const choice = parseInt(input, 10);

      if (choice === idx || input.toLowerCase() === 'q') {
        if (player) player.stats.set('actions_remaining', 0);
        break;
      }

      if (choice >= 1 && choice <= playable.length) {
        const action = playable[choice - 1];

        if (action.type === 'card' && action.cost > energy) {
          console.log(`${c.red}Not enough ${energyStat}.${c.reset}`);
          await prompt(`${c.dim}[Enter]${c.reset}`);
          continue;
        }

        const result = step(action.id, session.world, session.ruleSet);
        if (result.match) {
          session.world = result.world;
          console.log('');
          for (const se of result.sideEffects) {
            if (se.type === 'narrative') console.log(se.payload.text);
          }
          checkGameOver(session, result);

          // Handle damage events
          handleDamageEvents(session, result);

          await prompt(`${c.dim}[Enter]${c.reset}`);
          actionsLeft = player?.stats.get('actions_remaining') ?? 0;
          actionsTaken++;

          // Re-display state
          clear();
          console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗`);
          console.log(`║  ${session.gameName.padEnd(48).slice(0, 48)}║`);
          console.log(`╚══════════════════════════════════════════════════╝${c.reset}`);
          console.log('');
          displayState(session);
        } else {
          console.log(`${c.dim}Nothing happens.${c.reset}`);
          await prompt(`${c.dim}[Enter]${c.reset}`);
        }
      }
    }

    if (session.gameOver) break;

    // Auto-play phase: trigger any remaining auto rules
    console.log(`${c.bold}${c.red}── Opposition Turn ──${c.reset}`);
    console.log('');

    autoPlayEnemies(session);

    // Advance round
    const gameEntity = session.world.get('GAME');
    if (gameEntity) {
      gameEntity.stats.set('round', (gameEntity.stats.get('round') ?? 1) + 1);
      if (player) player.stats.set('actions_remaining', player.stats.get('actions_remaining') ?? 3);
    }

    // Check win/loss
    checkEndConditions(session);
    if (session.gameOver) break;

    displayState(session);
    await prompt(`${c.dim}[Enter for next round]${c.reset}`);
  }

  if (roundCount >= MAX_ROUNDS && !session.gameOver) {
    session.gameOver = true;
    session.result = 'loss';
    console.log(`${c.red}Time's up. The game ends.${c.reset}`);
  }
}

function findEnergyStat(session: GameSession): string {
  const player = session.world.get('PLAYER');
  if (!player) return 'se';
  for (const key of ['se', 'energy', 'mana', 'ap', 'action_points', 'stamina']) {
    if (player.stats.has(key)) return key;
  }
  return 'se';
}

function checkGameOver(session: GameSession, result: StepResult): void {
  const gameOverEvent = result.sideEffects.find(
    (se) => se.type === 'game_event' && se.payload.event === 'game_over'
  );
  if (gameOverEvent) {
    session.gameOver = true;
    session.result = (gameOverEvent.payload.result as 'win' | 'loss') ?? 'loss';
  }

  // Also check tags
  const game = session.world.get('GAME');
  if (game) {
    if (game.tags.has('won')) { session.gameOver = true; session.result = 'win'; }
    if (game.tags.has('lost')) { session.gameOver = true; session.result = 'loss'; }
  }
}

function checkEndConditions(session: GameSession): void {
  // Try to fire win/loss rules
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

function autoPlayEnemies(session: GameSession): void {
  const enemies = session.world.all().filter((e) => e.tags.has('enemy') && e.tags.has('active'));
  const player = session.world.get('PLAYER');
  if (!player) return;

  const playerLoc = player.links.get('location');

  for (const enemy of enemies) {
    // Try to fire an enemy rule
    const result = step(enemy.id, session.world, session.ruleSet);
    if (result.match) {
      session.world = result.world;
      for (const se of result.sideEffects) {
        if (se.type === 'narrative') console.log(se.payload.text);
      }
      checkGameOver(session, result);
      if (session.gameOver) return;
    } else {
      // Simple fallback: if enemy is at player location, deal damage
      if (enemy.links.get('location') === playerLoc) {
        const dmg = enemy.stats.get('damage') ?? enemy.stats.get('attack') ?? 1;
        const hp = player.stats.get('hp') ?? 0;
        player.stats.set('hp', hp - dmg);
        const name = (enemy.meta?.name as string) ?? enemy.id;
        console.log(`  ⚔️  ${name} attacks for ${dmg} damage!`);
      }
    }
  }

  // Draw a threat card if they exist
  const threats = session.world.all().filter((e) => e.tags.has('threat_card'));
  if (threats.length > 0) {
    const game = session.world.get('GAME');
    const idx = game?.stats.get('threat_deck_index') ?? 0;
    const threat = threats[idx % threats.length];
    if (game) game.stats.set('threat_deck_index', idx + 1);

    const name = (threat.meta?.name as string) ?? threat.id;
    const effect = (threat.meta?.effect as string) ?? '';
    console.log(`  📜 Threat: "${name}" — ${effect}`);

    // Apply CI-like boost
    const ciBoost = threat.stats.get('ci_boost') ?? threat.stats.get('threat_value') ?? 1;
    if (game) {
      // Find the loss-tracking stat
      for (const key of ['control_index', 'danger', 'threat_level', 'doom', 'timer']) {
        if (game.stats.has(key)) {
          game.stats.set(key, (game.stats.get(key) ?? 0) + ciBoost);
          break;
        }
      }
    }
  }

  console.log('');
}

function handleDamageEvents(session: GameSession, result: StepResult): void {
  const dmgEvent = result.sideEffects.find(
    (se) => se.type === 'game_event' && (se.payload.event === 'deal_damage' || se.payload.event === 'deal_damage_all')
  );
  if (!dmgEvent) return;

  const playerLoc = session.world.get('PLAYER')!.links.get('location')!;
  const enemiesHere = session.world.all().filter(
    (e) => e.tags.has('enemy') && e.tags.has('active') && e.links.get('location') === playerLoc
  );
  const amount = dmgEvent.payload.amount as number;
  const targets = dmgEvent.payload.event === 'deal_damage_all' ? enemiesHere : enemiesHere.slice(0, 1);

  for (const enemy of targets) {
    const newHp = (enemy.stats.get('hp') ?? 0) - amount;
    enemy.stats.set('hp', newHp);
    const name = (enemy.meta?.name as string) ?? enemy.id;
    if (newHp <= 0) {
      enemy.tags.delete('active');
      enemy.tags.add('destroyed');
      console.log(`  💥 ${name} destroyed!`);
    } else {
      console.log(`  💥 ${name} takes ${amount} damage (HP: ${newHp})`);
    }
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  clear();
  initLLM();

  console.log(`${c.bold}${c.cyan}`);
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║          🎲 AUREUM GAME BUILDER 🎲               ║');
  console.log('║       Describe a game. Play it. Improve it.      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(c.reset);
  console.log(`${c.dim}Powered by the Aureum Rules Engine + Gemini${c.reset}`);
  console.log('');

  let currentGame: GeneratedGame | null = null;
  let currentSession: GameSession | null = null;

  // ── Initial Game Description ──────────────────────────────────────────
  console.log(`${c.bold}Describe your card game:${c.reset}`);
  console.log(`${c.dim}(Be creative! Theme, mechanics, win conditions — the more detail, the better)${c.reset}`);
  console.log('');
  const gamePrompt = await prompt(`${c.green}> ${c.reset}`);

  if (!gamePrompt) {
    console.log(`${c.dim}No prompt given. Bye!${c.reset}`);
    rl.close();
    return;
  }

  async function generateGame(promptText: string, style: 'simple' | 'standard' | 'complex' = 'standard'): Promise<GeneratedGame> {
    console.log('');
    await typewriter(`${c.dim}Generating your game...${c.reset}`, 30);

    const fullPrompt = buildGenerationPrompt(promptText, style);
    const response = await callLLM(fullPrompt);
    const game = extractJSON(response);

    console.log('');
    console.log(`${c.green}✅ Created: ${c.bold}${game.name}${c.reset}`);
    console.log(`${c.dim}   ${game.description}${c.reset}`);
    console.log(`${c.dim}   ${game.entities?.length ?? 0} entities, ${game.rules?.length ?? 0} rules${c.reset}`);

    // Summary
    const cards = game.entities?.filter((e: any) => e.tags?.includes('card')) ?? [];
    const enemies = game.entities?.filter((e: any) => e.tags?.includes('enemy')) ?? [];
    const locations = game.entities?.filter((e: any) => e.tags?.includes('location')) ?? [];
    if (cards.length) console.log(`${c.dim}   ${cards.length} cards: ${cards.map((c: any) => c.meta?.name || c.id).join(', ')}${c.reset}`);
    if (enemies.length) console.log(`${c.dim}   ${enemies.length} enemies: ${enemies.map((e: any) => e.meta?.name || e.id).join(', ')}${c.reset}`);
    if (locations.length) console.log(`${c.dim}   ${locations.length} locations: ${locations.map((l: any) => l.meta?.name || l.id).join(', ')}${c.reset}`);

    return game;
  }

  async function iterateGame(feedback: string): Promise<void> {
    if (!currentGame || !currentSession) return;

    console.log('');
    await typewriter(`${c.dim}Updating game based on feedback...${c.reset}`, 30);

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

      // Remove entities
      for (const id of (ch.remove_entities ?? [])) {
        currentGame.entities = currentGame.entities.filter((e: any) => e.id !== id);
      }

      // Add entities
      for (const e of (ch.add_entities ?? [])) {
        currentGame.entities.push(e);
      }

      // Update entities
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

      // Remove rules
      for (const id of (ch.remove_rules ?? [])) {
        currentGame.rules = currentGame.rules.filter((r: any) => r.id !== id);
      }

      // Add rules
      for (const r of (ch.add_rules ?? [])) {
        currentGame.rules.push(r);
      }

      // Update rules (replace by id)
      for (const r of (ch.update_rules ?? [])) {
        currentGame.rules = currentGame.rules.filter((existing: any) => existing.id !== r.id);
        currentGame.rules.push(r);
      }
    }

    console.log(`${c.green}✅ ${changes.summary ?? 'Game updated.'}${c.reset}`);

    // Reload session
    currentSession = loadGeneratedGame(currentGame);
  }

  // ── Main Menu Loop ────────────────────────────────────────────────────
  try {
    currentGame = await generateGame(gamePrompt);
    currentSession = loadGeneratedGame(currentGame);
  } catch (err) {
    console.error(`${c.red}Generation failed: ${err}${c.reset}`);
    rl.close();
    return;
  }

  while (true) {
    console.log('');
    console.log(`${c.bold}What next?${c.reset}`);
    console.log(`  ${c.green}[P]${c.reset}lay the game`);
    console.log(`  ${c.yellow}[F]${c.reset}eedback — tell the AI what to change`);
    console.log(`  ${c.cyan}[R]${c.reset}egenerate from scratch`);
    console.log(`  ${c.magenta}[I]${c.reset}nspect entities and rules`);
    console.log(`  ${c.dim}[Q]${c.reset}uit`);
    console.log('');

    const choice = (await prompt(`${c.bold}> ${c.reset}`)).toLowerCase();

    if (choice === 'q') break;

    if (choice === 'p') {
      // Reload fresh session to play from the start
      currentSession = loadGeneratedGame(currentGame!);
      await playGame(currentSession);

      console.log('');
      console.log('═'.repeat(50));
      if (currentSession.result === 'win') {
        console.log(`${c.bold}${c.green}  🎉 YOU WON!${c.reset}`);
      } else {
        console.log(`${c.bold}${c.red}  💀 YOU LOST${c.reset}`);
      }
      console.log('═'.repeat(50));
      currentSession.gameOver = false;  // Allow replay
    }

    if (choice === 'f') {
      console.log('');
      console.log(`${c.bold}What would you change?${c.reset}`);
      console.log(`${c.dim}(Describe balance changes, new cards, rule adjustments, etc.)${c.reset}`);
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
      console.log(`${c.bold}${c.cyan}── Entities ──${c.reset}`);
      for (const e of currentGame!.entities) {
        const name = e.meta?.name ?? e.id;
        const tags = e.tags?.join(', ') ?? '';
        console.log(`  ${c.bold}${e.id}${c.reset} (${name}) ${c.dim}[${tags}]${c.reset}`);
        if (e.stats && Object.keys(e.stats).length) {
          console.log(`    stats: ${Object.entries(e.stats).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
      }
      console.log('');
      console.log(`${c.bold}${c.cyan}── Rules ──${c.reset}`);
      for (const r of currentGame!.rules) {
        console.log(`  ${c.bold}${r.id}${c.reset} — ${r.description ?? ''}${r.priority ? ` (priority: ${r.priority})` : ''}`);
      }
    }
  }

  console.log(`${c.dim}Goodbye. Your game designs persist in memory.${c.reset}`);
  rl.close();
}

main().catch((err) => {
  console.error(`${c.red}Fatal error: ${err}${c.reset}`);
  process.exit(1);
});

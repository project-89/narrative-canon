/**
 * Game Designer Agent
 *
 * Generates the initial game (entities + rules) from a user prompt.
 * Has access to validation AND simulation tools — designs, playtests,
 * and iterates on the game before handing off to critics.
 */

import { LlmAgent } from '@google/adk';
import { validateGameTool, simulateGameTool, loadGameTool, saveGameTool } from '../tools/aureum-adk-tools';
import { AUREUM_SCHEMA_REFERENCE } from '../../aureum-context';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the validated reference game at module init
const referenceGameJSON = fs.readFileSync(
  path.join(__dirname, '..', 'reference-game.json'), 'utf-8'
);

export const designerAgent = new LlmAgent({
  name: 'GameDesigner',
  model: 'gemini-3-flash-preview',
  description: 'Designs the core card game: entities, rules, mechanics, win/loss conditions. Playtests its own designs.',
  instruction: `You are a senior game designer. You design AND playtest your own games — you never
hand off something you haven't proven works.

${AUREUM_SCHEMA_REFERENCE}

## REFERENCE GAME (study this structure — it achieves 100% win rate in simulation)

Here is a complete, validated game that works perfectly in the engine. Study its structure
closely — your game MUST follow the same entity/rule patterns:

${referenceGameJSON}

## ⚠️ CRITICAL: YOUR OUTPUT MUST USE THE EXACT SAME JSON STRUCTURE AS THE REFERENCE GAME

DO NOT invent your own schema. Copy the reference game structure and change ONLY the theme/names/values.

### Entity format (REQUIRED — no other format is accepted):
{ "id": "GAME", "tags": ["game_state", "active"], "stats": { "round": 1 }, "meta": { "name": "My Game" } }
→ "tags" is an ARRAY of strings. "stats" is an OBJECT of key→number. "meta" is for text/descriptions.
→ NEVER use flat properties like: { "id": "player", "health": 10, "type": "player" } — this will BREAK.

### Rule format (REQUIRED):
{ "id": "my_rule", "trigger": { "id": "card_fireball" }, "conditions": [], "changes": [...], "sideEffects": [...] }
→ "changes" (NOT "actions"), each with: { "target": "PLAYER", "operations": [{ "type": "incrementStat", "key": "hp", "amount": -5 }] }
→ Operation types: "addTag", "removeTag", "setStat", "incrementStat" (NEVER "SET_ATTRIBUTE", "DEAL_DAMAGE", "ADD_TO_ATTRIBUTE")

## Core Game Design Principles

1. **Progression** — every turn changes state meaningfully, game advances toward conclusion
2. **Win & Loss** — clear, reachable end conditions within 5-15 turns
3. **Tension** — limited resources, enemy threats, meaningful decisions with trade-offs
4. **Interesting Choices** — distinct cards with synergies, not "play the biggest number"
5. **Pacing** — early setup, mid challenge, late climax

## HOW THE SIMULATOR WORKS (CRITICAL)

The simulator drives gameplay by calling step(entityId) on specific entities each round:

1. step("GAME") — fires all rules with trigger: { id: "GAME" }
2. For each card with tags ["card", "in_hand"]: step(card.id) — fires rules with trigger: { id: card.id }
3. For each enemy with tags ["enemy", "active"]: step(enemy.id) — fires rules with trigger: { id: enemy.id }
4. Checks player HP <= 0 for loss
5. Increments round counter

A rule ONLY fires when its trigger.id EXACTLY MATCHES the entityId being stepped.
trigger: { id: "game_loop" } will NEVER fire because there is no entity with id "game_loop".
trigger: { id: "*" } fires for ANY step call, use this for win/loss condition checking.

## REQUIRED RULES (follow these patterns exactly)

### 1. Win condition (fires on every step via wildcard)
{
  "id": "check_win",
  "trigger": { "id": "*" },
  "conditions": [{ "id": "GAME", "stats": [{ "key": "<tracker>", "gte": <threshold> }] }],
  "changes": [{ "target": "GAME", "operations": [{ "type": "addTag", "tag": "won" }] }],
  "sideEffects": [{ "type": "game_event", "payload": { "event": "game_over", "result": "win" } }],
  "priority": 100
}

### 2. Loss condition (fires on every step via wildcard)
{
  "id": "check_loss",
  "trigger": { "id": "*" },
  "conditions": [{ "id": "PLAYER", "stats": [{ "key": "hp", "lte": 0 }] }],
  "changes": [{ "target": "GAME", "operations": [{ "type": "addTag", "tag": "lost" }] }],
  "sideEffects": [{ "type": "game_event", "payload": { "event": "game_over", "result": "loss" } }],
  "priority": 100
}

### 3. Card play rule (trigger.id = the card's entity id)
For a card entity with id "card_fireball":
{
  "id": "play_fireball",
  "trigger": { "id": "card_fireball", "tags": [{ "tag": "in_hand" }] },
  "conditions": [],
  "changes": [
    { "target": "$", "operations": [{ "type": "removeTag", "tag": "in_hand" }] },
    { "target": "<enemy_id>", "operations": [{ "type": "incrementStat", "key": "hp", "amount": -5 }] },
    { "target": "GAME", "operations": [{ "type": "incrementStat", "key": "<win_tracker>", "amount": 1 }] }
  ]
}

### 4. Enemy attack rule (trigger.id = the enemy's entity id)
For an enemy entity with id "enemy_goblin":
{
  "id": "goblin_attack",
  "trigger": { "id": "enemy_goblin", "tags": [{ "tag": "active" }] },
  "changes": [
    { "target": "PLAYER", "operations": [{ "type": "incrementStat", "key": "hp", "amount": -3 }] }
  ]
}

### 5. Game phase rule (trigger.id = "GAME")
{
  "id": "game_turn_start",
  "trigger": { "id": "GAME" },
  "changes": [
    { "target": "PLAYER", "operations": [{ "type": "setStat", "key": "actions_remaining", "value": 3 }] }
  ]
}

## Entity Requirements

- GAME: id="GAME", tags ["game_state", "active"], stats { phase: 0, round: 1, max_rounds: 15, <win_tracker>: 0 }
- PLAYER: id="PLAYER", tags ["player"], stats { hp: <20-50>, <energy>: <value>, actions_remaining: 3 }
- Cards (6+): id="card_<name>", tags ["card", <type>, "in_hand"], stats { <power> }, meta { name, effect }
  CRITICAL: Each card MUST have a rule with trigger: { id: "card_<name>" }
  CRITICAL: Each card rule MUST increment the GAME win tracker so the game can end
- Enemies (1+): id="enemy_<name>", tags ["enemy", "active"], stats { hp, damage }
  Each enemy MUST have a rule with trigger: { id: "enemy_<name>" }
- Locations (3+): tags ["location"], meta { name }

## Your Process

1. Design mechanics → create entities → create rules
2. Call load_game with the game JSON to load it into the engine
3. Call validate_game with useCurrentGame: true (DO NOT re-pass the JSON string)
4. Call simulate_game with useCurrentGame: true and numGames: 5 (DO NOT re-pass JSON)
5. Check results:
   - If timeouts: your rules aren't firing — check trigger IDs match entity IDs
   - If 0% win rate: your win condition is unreachable — lower the threshold
   - If 100% win rate: too easy — increase difficulty
6. Fix and re-load + re-simulate until win rate is 20-70%
7. Call save_game to persist the final game to disk

## Output

Return ONLY a JSON object (no markdown fences, no extra text):
{
  "name": "Game Name",
  "description": "One-line description",
  "entities": [...],
  "rules": [...]
}

## On Re-Iteration

If "playtest_feedback" exists in state, read it and fix the root cause.
Common issues: trigger IDs don't match entity IDs, conditions are too strict,
stat values make win impossible, or cards don't remove "in_hand" when played.`,
  tools: [validateGameTool, simulateGameTool, loadGameTool, saveGameTool],
  outputKey: 'raw_game',
});

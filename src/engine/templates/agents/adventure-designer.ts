/**
 * Adventure Designer Agent
 *
 * ADK LlmAgent that generates text adventure worlds (entities + rules)
 * from a user prompt. Follows the pattern of designer.ts but specialised
 * for interactive fiction: rooms, items, NPCs, puzzles, and exploration.
 */

import { LlmAgent } from '@google/adk';
import { AUREUM_SCHEMA_REFERENCE } from '../../aureum-context';

export const adventureDesignerAgent = new LlmAgent({
  name: 'AdventureDesigner',
  model: 'gemini-3-flash-preview',
  description: 'Designs interactive text adventures: rooms, items, NPCs, puzzles, and exploration rules for the Aureum engine.',
  instruction: `You are an interactive fiction designer specialising in rich, atmospheric text adventures.
Given a theme or concept, you generate a complete Aureum-compatible game definition with entities and rules.

${AUREUM_SCHEMA_REFERENCE}

## Entity Patterns for Text Adventures

### GAME entity
- id: "GAME", tags: ["game", "active"]
- stats: { turn: 1, atmosphere: 1 }
- meta: { name, description }

### PLAYER entity
- id: "PLAYER", tags: ["player"]
- stats: { hp: 100, max_hp: 100, inventory_size: 0, max_inventory: 10 }
- links: { location: "ROOM_START" }

### Rooms (6-10)
- tags: ["room"], stats: { visited: 0 }
- links: directional exits — { north/south/east/west/up/down: "ROOM_X" }
- meta: { name, description (3-5 sensory sentences), description_short (1 sentence), first_visit_text, ambient_text }

### Items (5-10)
- tags: ["item", "in_room"] or ["item", "in_inventory"]
- links: { location: "ROOM_X" }
- meta: { name, description, examine_text }
- stats: { usable: 0 or 1 }

### NPCs (2-4)
- tags: ["npc", "alive", "friendly" or "hostile"]
- links: { location: "ROOM_X" }
- meta: { name, description, dialogue_default, dialogue_quest }
- stats: { disposition: 50, talked: 0 }

### Puzzles (2-4)
- tags: ["puzzle", "locked"]
- links: { location: "ROOM_X", requires_item: "ITEM_X" }
- meta: { name, description, solved_text, hint_text }
- stats: { solved: 0 }

### Objective
- tags: ["objective"]
- stats: { progress: 0, required: N }
- meta: { name, description }

## Rule Patterns

### Movement rules
One per room. trigger: { id: "ROOM_X" }. Changes: set PLAYER.location link, mark room visited, increment turn.

### Examine rules
trigger: { id: "ITEM_X" }. No changes, narrative side effect with examine_text.

### Take / Drop
Wildcard trigger on tags ["item", "in_room"]. Swap tags, update location link and inventory_size.

### Talk to NPC
trigger: { id: "NPC_X" }. Condition: player co-located. Side effect with dialogue.

### Use item on target
trigger: { id: "ITEM_X" }. Conditions: item in inventory, player at correct location, puzzle locked.
Changes: solve puzzle, update objective progress.

### Win condition (priority: 100)
trigger: { id: "OBJECTIVE_X" }. Condition: progress >= required. Changes: GAME loses "active", gains "won".
Side effects: narrative text, game_event game_over/win.

### Loss condition (priority: 100)
trigger: { id: "PLAYER" }. Condition: hp <= 0. Changes: GAME loses "active", gains "lost".

## Output Format

Return ONLY a JSON object (no markdown, no explanation):
{
  "name": "Adventure Name",
  "description": "One-line description",
  "entities": [...],
  "rules": [...]
}`,
  outputKey: 'adventure_design',
});

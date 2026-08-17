/**
 * Card Designer Tools — Structured metadata for card entities
 *
 * list_card_entities: Returns all card/enemy entities with their stats
 * design_cards: Writes structured metadata (flavor, visual beat, art prompt) to entities
 */

import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { getWorld } from './aureum-adk-tools';

// ─── list_card_entities ──────────────────────────────────────────────────────

export const listCardEntitiesTool = new FunctionTool({
  name: 'list_card_entities',
  description: 'List all card and enemy entities currently loaded in the game engine. Returns entity IDs, types, and key stats. Call this FIRST to see what entities need card designs.',
  parameters: z.object({}) as any,
  execute: () => {
    const world = getWorld();
    if (!world) {
      return JSON.stringify({ game_name: 'unknown', cards: [], enemies: [] });
    }

    const cards: any[] = [];
    const enemies: any[] = [];
    let gameName = 'unknown';

    for (const entity of world.all()) {
      // Get game name
      if (entity.id === 'GAME' || entity.tags.has('game_state')) {
        gameName = entity.meta?.name || entity.meta?.description || 'unknown';
        continue;
      }

      // Skip system entities
      if (entity.id === 'PLAYER' || entity.id.startsWith('btn_') || entity.id.startsWith('action_') || entity.id.startsWith('#')) {
        continue;
      }

      // Collect stats (numeric values)
      const stats: Record<string, number> = {};
      for (const [key, val] of Object.entries(entity.meta || {})) {
        if (typeof val === 'number') stats[key] = val;
      }

      const tags = Array.from(entity.tags);

      if (entity.tags.has('enemy') || entity.id === 'ENEMY') {
        enemies.push({ entity_id: entity.id, tags, stats });
      } else if (entity.tags.has('card') || entity.id.startsWith('card_')) {
        cards.push({ entity_id: entity.id, tags, stats });
      }
    }

    console.log(`[list_card_entities] Found ${cards.length} cards, ${enemies.length} enemies in "${gameName}"`);
    return JSON.stringify({ game_name: gameName, cards, enemies });
  },
});

// ─── design_cards ────────────────────────────────────────────────────────────

export const designCardsTool = new FunctionTool({
  name: 'design_cards',
  description: `Submit card designs with metadata for all cards and enemies. Each design must include:
- entity_id: exact ID from list_card_entities
- display_name: human-readable card name
- card_type: attack, defense, buff, utility, etc.
- flavor_text: 1-2 sentence evocative quote
- visual_beat: 1-2 sentence art direction (composition, mood, palette, medium)
- art_prompt: full 50-100 word image generation prompt`,
  parameters: z.object({
    cards: z.array(z.object({
      entity_id: z.string().describe('Exact entity ID from list_card_entities'),
      display_name: z.string().describe('Human-readable card name'),
      card_type: z.string().describe('Card archetype: attack, defense, buff, utility, combo, etc.'),
      flavor_text: z.string().describe('1-2 sentence evocative flavor quote'),
      visual_beat: z.string().describe('1-2 sentence visual description for card art'),
      art_prompt: z.string().describe('Full 50-100 word image generation prompt'),
    })).describe('Array of card designs'),
  }) as any,
  execute: (input: any) => {
    const { cards } = input;
    const world = getWorld();
    if (!world) {
      return JSON.stringify({ designed: 0, skipped: cards?.length ?? 0, results: ['No world loaded'] });
    }

    let designed = 0;
    let skipped = 0;
    const results: string[] = [];

    for (const card of (cards || [])) {
      const entity = world.get(card.entity_id);
      if (!entity) {
        skipped++;
        results.push(`⚬ ${card.entity_id}: not found`);
        continue;
      }

      // Write structured metadata to entity
      entity.meta.display_name = card.display_name;
      entity.meta.card_type = card.card_type;
      entity.meta.flavor_text = card.flavor_text;
      entity.meta.visual_beat = card.visual_beat;
      entity.meta.art_prompt = card.art_prompt;

      designed++;
      results.push(`✓ ${card.entity_id}: "${card.display_name}" designed`);
    }

    console.log(`[design_cards] ✨ Designed ${designed} cards (${skipped} skipped)`);
    return JSON.stringify({ designed, skipped, results });
  },
});

/**
 * Aureum Rules Engine — LLM Context System
 *
 * Provides the schema reference, current state summary, and few-shot
 * examples that teach an LLM how to generate valid Aureum entities + rules.
 */

// ─── Schema Reference ────────────────────────────────────────────────────────

export const AUREUM_SCHEMA_REFERENCE = `
# Aureum Engine Schema Reference

You are generating entities and rules for the Aureum Rules Engine — a generic
state machine that models any tabletop/card game using entities and rules.

## Entities

An entity has:
- **id**: string — unique identifier, UPPER_SNAKE_CASE (e.g. "PLAYER", "CARD_FIREBALL")
- **tags**: string[] — categories (e.g. ["card", "action", "fire", "in_hand"])
- **stats**: Record<string, number> — numeric properties (e.g. { "damage": 3, "hp": 10 })
- **links**: Record<string, string> — references to other entity IDs (e.g. { "location": "DUNGEON", "owner": "PLAYER" })
- **meta**: Record<string, any> — display info, not used by rules (e.g. { "name": "Fireball", "flavor": "..." })

## Rules

A rule has:
- **id**: string — unique rule ID
- **trigger**: EntityMatcher — which entity/pattern to match when stepped
- **conditions**: EntityMatcher[] — additional world state checks
- **changes**: WorldChange[] — what happens when the rule fires
- **sideEffects**: SideEffect[] — narrative text, game events
- **priority**: number — higher fires first (default 0)
- **oneShot**: boolean — fires only once if true
- **description**: string — human-readable summary

### EntityMatcher
\`\`\`json
{
  "id": "PLAYER" | "*",
  "tags": [{ "tag": "card", "negated": false }],
  "stats": [{ "key": "hp", "operator": ">=", "value": 1 }],
  "links": [{ "key": "location", "targetId": "DUNGEON", "negated": false }]
}
\`\`\`
- Use \`"*"\` as id for wildcard matching (any entity with those tags/stats/links)
- Use \`"$"\` in changes to reference the triggering entity

### WorldChange
\`\`\`json
{
  "target": "PLAYER" | "$",
  "operations": [
    { "type": "addTag", "tag": "poisoned" },
    { "type": "removeTag", "tag": "in_hand" },
    { "type": "setStat", "key": "hp", "value": 5 },
    { "type": "incrementStat", "key": "hp", "amount": -2 },
    { "type": "setLink", "key": "location", "targetId": "DUNGEON" },
    { "type": "removeLink", "key": "target" }
  ]
}
\`\`\`

### SideEffect
\`\`\`json
{ "type": "narrative", "payload": { "text": "The fireball explodes!" } }
{ "type": "game_event", "payload": { "event": "deal_damage", "amount": 3 } }
\`\`\`

## Common Patterns

### Card Play Rule
Trigger on card entity with tag "in_hand" → remove "in_hand", add "in_discard",
apply effect, decrement player actions.

### Phase Transition
Trigger on GAME entity → check phase stat → set next phase, apply phase effects.

### Win/Loss Condition
High priority (100+), trigger on GAME or PLAYER with stat check → remove "active", add "won"/"lost".

### Enemy AI (auto-trigger)
Trigger on enemy with tag "active" → apply behavior (move, attack, buff).
`.trim();

// ─── Game Generation Prompt ──────────────────────────────────────────────────

export function buildGenerationPrompt(userPrompt: string, style: 'simple' | 'standard' | 'complex' = 'standard'): string {
  const complexity = {
    simple: { cards: '4-6', rules: '3-5', enemies: '0-1', locations: '2-3' },
    standard: { cards: '8-12', rules: '6-12', enemies: '1-3', locations: '3-5' },
    complex: { cards: '15+', rules: '12+', enemies: '3-5', locations: '5-8' },
  }[style];

  return `${AUREUM_SCHEMA_REFERENCE}

---

# Your Task

Generate a card game based on this description:

"${userPrompt}"

## Requirements

- **Complexity**: ${style} (${complexity.cards} cards, ${complexity.rules} rules, ${complexity.enemies} enemies, ${complexity.locations} locations)
- You MUST include a GAME entity with tags ["game_state", "active"] and stats { phase, round, control_index (or equivalent win/loss tracker) }
- You MUST include a PLAYER entity with tags ["player"] and basic stats (hp, se or equivalent action/energy resource, actions_remaining)
- You MUST include at least one win condition and one loss condition rule (priority: 100)
- Each card MUST have tags ["card", cardType, "in_hand"], stats { se_cost }, links { owner: "PLAYER" }, and meta { name, flavor, effect }
- Each card MUST have a corresponding play rule

## Output Format

Return ONLY a JSON object with this structure (no markdown, no explanation):

{
  "name": "Game Name",
  "description": "One-line game description",
  "entities": [
    { "id": "...", "tags": [...], "stats": {...}, "links": {...}, "meta": {...} }
  ],
  "rules": [
    {
      "id": "...",
      "trigger": {...},
      "conditions": [...],
      "changes": [...],
      "sideEffects": [...],
      "priority": 0,
      "oneShot": false,
      "description": "..."
    }
  ]
}`;
}

// ─── Feedback/Iteration Prompt ───────────────────────────────────────────────

export function buildIterationPrompt(
  currentState: string,
  feedback: string,
): string {
  return `${AUREUM_SCHEMA_REFERENCE}

---

# Current Game State

${currentState}

---

# Player Feedback

"${feedback}"

---

# Your Task

Based on the player's feedback, generate modifications to the game.
Return a JSON object with:

{
  "changes": {
    "add_entities": [ ... entities to add ... ],
    "remove_entities": [ "ENTITY_ID", ... ],
    "update_entities": [
      { "id": "ENTITY_ID", "addTags": [...], "removeTags": [...], "setStats": {...}, "setLinks": {...}, "setMeta": {...} }
    ],
    "add_rules": [ ... rules to add ... ],
    "remove_rules": [ "rule_id", ... ],
    "update_rules": [ ... complete replacement rules (same id = replaces existing) ... ]
  },
  "summary": "One-line summary of what changed"
}

Return ONLY the JSON object, no markdown.`;
}

// ─── State Formatter ─────────────────────────────────────────────────────────

export function formatStateForContext(worldJson: any, rulesJson: any): string {
  let out = '## Entities\n\n';

  for (const entity of worldJson.entities ?? []) {
    out += `**${entity.id}**`;
    if (entity.meta?.name) out += ` (${entity.meta.name})`;
    out += '\n';
    if (entity.tags?.length) out += `  tags: ${entity.tags.join(', ')}\n`;
    if (entity.stats && Object.keys(entity.stats).length) {
      out += `  stats: ${Object.entries(entity.stats).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
    }
    if (entity.links && Object.keys(entity.links).length) {
      out += `  links: ${Object.entries(entity.links).map(([k, v]) => `${k}→${v}`).join(', ')}\n`;
    }
    if (entity.meta) {
      const metaKeys = Object.keys(entity.meta).filter(k => k !== 'name');
      if (metaKeys.length) {
        out += `  meta: ${metaKeys.map(k => `${k}="${entity.meta[k]}"`).join(', ')}\n`;
      }
    }
    out += '\n';
  }

  out += '## Rules\n\n';
  for (const rule of rulesJson.rules ?? []) {
    out += `**${rule.id}**`;
    if (rule.description) out += ` — ${rule.description}`;
    out += '\n';
    if (rule.priority) out += `  priority: ${rule.priority}\n`;
    if (rule.oneShot) out += `  oneShot: true\n`;
    out += '\n';
  }

  return out;
}

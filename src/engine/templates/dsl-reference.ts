/**
 * ArgOS DSL Reference — Language spec and reference game for LLM prompts
 *
 * Used by the DSL Engineer agent to translate Game Design Documents into
 * valid ArgOS DSL that the Aureum engine parser can process.
 */

// ─── Full ArgOS Language Specification ────────────────────────────────────────

export const ARGOS_LANGUAGE_SPEC = `
# ArgOS DSL — Complete Language Specification

ArgOS is a domain-specific language for defining game entities and rules
in the Aureum engine. It uses **dot-notation** for compact, readable definitions.

## 1. ENTITY DEFINITIONS

Format: \`ID.tag1.tag2.stat_key=number.link_key=TARGET_ID\`

### Components:
- **ID** (first segment): Unique identifier. Use UPPER_SNAKE_CASE for system entities (GAME, PLAYER), lower_snake_case for game objects (card_slash, enemy_dragon).
- **Tags**: Plain words after the ID. Used for categorization and matching.
- **Stats**: \`key=number\` pairs. Numeric values only.
- **Links**: \`key=ENTITY_ID\` pairs. Reference other entities.

### Examples:
\`\`\`
GAME.game_state.active.round=1.max_rounds=15.dragon_damage_dealt=0.win_target=15
PLAYER.player.hp=40.shield=0.actions_remaining=3.mana=3
card_slash.card.attack.in_hand.damage=3.cost=1
card_fireball.card.magic.in_hand.damage=5.cost=2
card_shield.card.defense.in_hand.block=3.cost=1
card_heal.card.magic.in_hand.heal=4.cost=1
enemy_dragon.enemy.active.hp=30.damage=3
loc_castle.location
\`\`\`

### Rules for Entities:
- Every game MUST have a \`GAME\` entity with tags \`game_state\` and \`active\`
- Every game MUST have a \`PLAYER\` entity with tag \`player\`
- Card entities MUST have tags \`card\` and \`in_hand\`
- Enemy entities MUST have tags \`enemy\` and \`active\`
- Separate entities with blank lines for readability

## 2. RULE DEFINITIONS

A rule has 4 sections: trigger, conditions, changes, narrative.

### Format:
\`\`\`
// Description (comment becomes rule description)
trigger: MATCHER
conditions: MATCHER, MATCHER
changes: CHANGE | CHANGE
narrative: Flavor text displayed when rule fires
\`\`\`

### Sections:
- **trigger:** (REQUIRED) — Which entity/entities activate this rule
- **conditions:** (optional) — Additional checks that must pass
- **changes:** (optional) — State modifications when rule fires
- **narrative:** (optional) — Text to display to the player

### Trigger/Condition MATCHER syntax:
\`\`\`
ENTITY_ID                    — match specific entity
ENTITY_ID.tag                — match entity with specific tag
ENTITY_ID.!tag               — match entity WITHOUT tag (negated)
ENTITY_ID.stat>N             — stat greater than N
ENTITY_ID.stat>=N            — stat greater or equal to N
ENTITY_ID.stat<N             — stat less than N
ENTITY_ID.stat<=N            — stat less or equal to N
ENTITY_ID.stat=N             — stat equals N (in matchers, numeric = is comparison)
ENTITY_ID.link=TARGET        — link points to TARGET entity
*                            — wildcard, matches ANY entity
*.tag                        — any entity with this tag
\`\`\`

### Change syntax (pipe-separated for multiple targets):
\`\`\`
ENTITY.tag            → addTag (adds tag to entity)
ENTITY.-tag           → removeTag (removes tag from entity)
ENTITY.stat=N         → setStat (set stat to exact value)
ENTITY.stat+N         → incrementStat (add N to stat)
ENTITY.stat-N         → incrementStat (subtract N from stat)
ENTITY.link=TARGET    → setLink (point link to entity)
$                     → refers to the entity that triggered the rule
\`\`\`

### Multiple changes on one line:
\`\`\`
changes: $.-in_hand | enemy_dragon.hp-3 | GAME.dragon_damage_dealt+3
\`\`\`

## 3. REQUIRED GAME PATTERNS

### Win condition (MUST have — fires on every step via wildcard):
\`\`\`
// Player wins when [tracker] reaches [threshold]
trigger: *
conditions: GAME.[tracker]>=[threshold]
changes: GAME.won
narrative: Victory message!
\`\`\`

### Loss condition (MUST have):
\`\`\`
// Player loses when HP drops to 0
trigger: *
conditions: PLAYER.hp<=0
changes: GAME.lost
narrative: Defeat message...
\`\`\`

### Card play rules (one per card):
\`\`\`
// Play [Card Name] — [effect description]
trigger: [card_id].in_hand
changes: $.-in_hand | [target].stat+/-N | GAME.[tracker]+N
narrative: [flavor text when card is played]
\`\`\`

### Enemy attack rule (one per enemy):
\`\`\`
// [Enemy Name] attacks
trigger: [enemy_id].active
changes: PLAYER.hp-[damage]
narrative: [attack flavor text]
\`\`\`

### Turn reset (reset per-turn resources):
\`\`\`
// Reset actions each round
trigger: GAME.active
changes: PLAYER.actions_remaining=3
\`\`\`

## 4. GAME FILE FORMAT

A complete .argos file has two sections separated by a blank line and "# Rules":

\`\`\`
# Entities
[entity definitions, one per line, blank lines for readability]

# Rules
[rule blocks, separated by blank lines]
\`\`\`

## 5. IMPORTANT CONSTRAINTS

1. Every stat value MUST be a number (not a string, not a boolean)
2. Tags are always strings (no = sign, no numbers)
3. Entity IDs cannot contain dots (dots are segment separators)
4. The \`$\` symbol in changes refers to the trigger entity — use it for card self-removal
5. Rules are separated by blank lines
6. Comments (\`//\`) become rule descriptions
7. A game MUST have win AND loss conditions using wildcard triggers (\`*\`)
8. Cards MUST be tagged \`card\` and \`in_hand\` to be playable
9. Enemies MUST be tagged \`enemy\` and \`active\` to take turns
`;

// ─── Reference Game in ArgOS DSL Format ──────────────────────────────────────

export const REFERENCE_GAME_DSL = `# Entities
GAME.game_state.active.round=1.max_rounds=15.dragon_damage_dealt=0.win_target=15

PLAYER.player.hp=40.shield=0.actions_remaining=3.mana=3

card_slash.card.attack.in_hand.damage=3.cost=1

card_fireball.card.magic.in_hand.damage=5.cost=2

card_shield.card.defense.in_hand.block=3.cost=1

card_heal.card.magic.in_hand.heal=4.cost=1

card_power_strike.card.attack.in_hand.damage=4.cost=1

card_lightning.card.magic.in_hand.damage=4.cost=1

enemy_dragon.enemy.active.hp=30.damage=3

loc_castle_gate.location

loc_throne_room.location

loc_tower.location

# Rules
// Player wins when dragon damage reaches 15
trigger: *
conditions: GAME.dragon_damage_dealt>=15
changes: GAME.won
narrative: You slew the dragon! The kingdom is saved!

// Player loses when HP drops to 0
trigger: *
conditions: PLAYER.hp<=0
changes: GAME.lost
narrative: The dragon has defeated you...

// Reset actions each round
trigger: GAME.active
changes: PLAYER.actions_remaining=3

// Play Slash — deal 3 damage to the dragon
trigger: card_slash.in_hand
changes: $.-in_hand | enemy_dragon.hp-3 | GAME.dragon_damage_dealt+3
narrative: You swing your sword, slashing the dragon for 3 damage!

// Play Fireball — deal 5 damage to the dragon
trigger: card_fireball.in_hand
changes: $.-in_hand | enemy_dragon.hp-5 | GAME.dragon_damage_dealt+5
narrative: A blazing fireball engulfs the dragon for 5 damage!

// Play Shield Block — gain 3 shield
trigger: card_shield.in_hand
changes: $.-in_hand | PLAYER.shield+3
narrative: You raise your shield, blocking incoming damage.

// Play Healing Light — restore 4 HP
trigger: card_heal.in_hand
changes: $.-in_hand | PLAYER.hp+4
narrative: A warm glow surrounds you, restoring 4 HP.

// Play Power Strike — deal 4 damage
trigger: card_power_strike.in_hand
changes: $.-in_hand | enemy_dragon.hp-4 | GAME.dragon_damage_dealt+4
narrative: A mighty blow crashes into the dragon for 4 damage!

// Play Lightning Bolt — deal 4 damage
trigger: card_lightning.in_hand
changes: $.-in_hand | enemy_dragon.hp-4 | GAME.dragon_damage_dealt+4
narrative: Lightning crackles through the air, striking the dragon for 4 damage!

// Dragon attacks player each round
trigger: enemy_dragon.active
changes: PLAYER.hp-3
narrative: The dragon breathes fire, dealing 3 damage!
`;

// ─── GDD Template ────────────────────────────────────────────────────────────

export const GDD_TEMPLATE = `
## Game Design Document Template

Fill in each section. Be specific about numbers and mechanics.

### 1. Overview
- **Name:** [game name]
- **Theme:** [1-sentence theme]
- **Pitch:** [1-paragraph description of what makes this game fun]

### 2. Player
- **Name/Role:** [who the player is]
- **Starting HP:** [number]
- **Resources:** [list any resources: mana, gold, stamina, etc. with starting values]

### 3. Cards (4-8 cards)
For each card:
- **Name:** [card name]
- **Type:** attack / defense / magic / utility
- **Cost:** [resource cost, if any]
- **Effect:** [exactly what it does, with numbers — e.g. "deal 3 damage to the enemy"]
- **Flavor:** [1-sentence flavor text]
- **Visual Beat:** [1-sentence visual description for card art — e.g. "A glowing firewall erupts from the player's palms, data fragments scattering like glass"]

### 4. Enemies (1-3 enemies)
For each enemy:
- **Name:** [enemy name]
- **HP:** [number]
- **Attack:** [damage per turn]
- **Flavor:** [1-sentence description]
- **Visual Beat:** [1-sentence visual description for enemy art — e.g. "A towering shadow sentinel with crackling energy coursing through its chrome exoskeleton"]

### 5. Win Condition
- **How to win:** [precise condition — e.g. "deal 15 total damage to the dragon"]
- **Tracker stat:** [what stat tracks progress — e.g. "dragon_damage_dealt"]
- **Threshold:** [number to reach]

### 6. Loss Condition
- **How to lose:** [precise condition — e.g. "player HP reaches 0"]

### 7. Turn Flow
1. [what happens first each turn]
2. [what happens next]
3. [etc.]

### 8. Locations (cosmetic, 2-3)
For each location:
- **Name:** [location name]
- **Description:** [1-sentence atmosphere]

### 9. Difficulty Profile
- **Target Audience:** casual / balanced / hardcore
- **Target Win Rate:** [X-Y%] (casual: 70-90%, balanced: 40-60%, hardcore: 15-35%)
- **Target Game Length:** [X-Y rounds] (casual: 5-10, balanced: 8-15, hardcore: 10-20)
- **Design Philosophy:** [1-sentence — e.g. "players should feel powerful but threatened"]
`;

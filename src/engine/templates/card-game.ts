/**
 * Aureum Rules Engine — Reality Protocol Card Game Template
 *
 * A non-trivial demo of the card game with a self-playing Protocol deck.
 * The opposition (Oneirocom) resolves automatically via auto_trigger rules
 * during the Threat Phase, enabling solo play.
 *
 * Turn Structure:
 *   1. Sync Phase  — draw, gain SE, CI +1
 *   2. Action Phase — player plays cards (3 actions)
 *   3. Threat Phase — enemies activate (auto_trigger), draw threat card
 *   4. Paradox Phase — chain resolution, win/loss check
 */

import { createEntity, World, Entity } from '../world';
import { Rule, createRuleSet, RuleSet } from '../rules';
import { evaluate, step, tick, StepResult, TickResult, applyChanges } from '../evaluator';

// ─── Phase Constants ─────────────────────────────────────────────────────────

export const PHASE = {
  SYNC: 0,
  ACTION: 1,
  THREAT: 2,
  PARADOX: 3,
} as const;

export const PHASE_NAMES = ['Sync', 'Action', 'Threat', 'Paradox'] as const;

// ─── World Setup ─────────────────────────────────────────────────────────────

export function createCardGameWorld(): World {
  return new World([
    // ── Global State ────────────────────────────────────────────────────────
    createEntity('GAME', {
      tags: ['game_state', 'active'],
      stats: {
        control_index: 20,
        loom_balance: 50,    // 0–100 scale: 50=neutral, >50=Green, <50=Gray
        round: 1,
        phase: PHASE.SYNC,
        threat_deck_index: 0,
        ci_threshold: 75,    // Protocol 001 defeat threshold
      },
    }),

    // ── Locations (Protocol 001 cross layout) ───────────────────────────────
    //
    //            [Server Core]
    //                  |
    //  [West Wing] — [Central Hub] — [East Wing]
    //                  |
    //           [Entry Point]
    //
    createEntity('ENTRY_POINT', {
      tags: ['location'],
      stats: { threat_level: 0, position: 0 },
      meta: { name: 'Entry Point', description: 'Maintenance hatch. Where it all begins — and ends.', flavor: 'The hatch opens onto silence. You\'ve crossed the threshold. There\'s no going back.' },
    }),
    createEntity('CENTRAL_HUB', {
      tags: ['location'],
      stats: { threat_level: 1, position: 1 },
      meta: { name: 'Central Hub', description: 'Screens flickering, data streams, central pillar of light.', effect: 'Once per round, any player here may pay 1 SE to look at the top card of the Threat deck.', flavor: 'The simulation\'s nervous system pulses here. It almost looks alive.' },
    }),
    createEntity('WEST_WING', {
      tags: ['location'],
      stats: { threat_level: 2, position: 2 },
      meta: { name: 'West Wing', description: 'Red emergency lighting, long shadows. Fragment Alpha.', effect: 'First player to enter: WILL 6 test. Failure: Surge 2.', flavor: 'The screaming stopped years ago. The echoes didn\'t.' },
    }),
    createEntity('EAST_WING', {
      tags: ['location'],
      stats: { threat_level: 1, position: 3 },
      meta: { name: 'East Wing', description: 'Inactive terminals, single screen glowing: REMEMBER', effect: 'Players here get +1 to INT tests.', flavor: 'Someone left a message in the machine. It\'s been waiting for the right eyes.' },
    }),
    createEntity('SERVER_CORE', {
      tags: ['location', 'locked'],
      stats: { threat_level: 3, position: 4 },
      meta: { name: 'Server Core', description: 'Cylinders of purple light, forms floating within.', effect: 'Locked until Control Index reaches 50 OR a player at Central Hub spends 2 actions + INT 8 test.', flavor: 'They\'re not asleep. They\'re not awake. They\'re waiting.' },
    }),

    // ── Player ──────────────────────────────────────────────────────────────
    createEntity('PLAYER', {
      tags: ['player', 'dreamsmith'],
      stats: {
        hp: 8,        // Solo scaling: 8 HP instead of 6
        max_hp: 8,
        resolve: 10,
        max_resolve: 10,
        se: 3,        // Starting SE per archetype card
        actions_remaining: 3,
        INT: 3, WILL: 2, REF: 1, CHR: 3,
      },
      links: { location: 'ENTRY_POINT' },
      meta: { name: 'Dreamsmith', archetype: 'dreamsmith', flavor: 'Reality is a story told in symbols. I learned to speak the language.' },
    }),

    // ── Sigils (8 cards) ──────────────────────────────────────────────────────
    createEntity('CARD_SIGIL_LUCIDITY_1', {
      tags: ['card', 'sigil', 'persistent', 'moon', 'in_hand'],
      stats: { se_cost: 1, loom_shift: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Sigil of Lucidity', sphere: 'Moon', flavor: 'The dreaming mind sees what the waking mind explains away.', effect: 'While in play, once per round you may reroll any WILL test you make. Shift Green 1 when played.' },
    }),
    createEntity('CARD_SIGIL_LUCIDITY_2', {
      tags: ['card', 'sigil', 'persistent', 'moon', 'in_hand'],
      stats: { se_cost: 1, loom_shift: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Sigil of Lucidity', sphere: 'Moon', flavor: 'The dreaming mind sees what the waking mind explains away.', effect: 'While in play, once per round you may reroll any WILL test you make. Shift Green 1 when played.' },
    }),
    createEntity('CARD_SIGIL_MIRRORS_1', {
      tags: ['card', 'sigil', 'persistent', 'moon', 'in_hand'],
      stats: { se_cost: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Sigil of Mirrors', sphere: 'Moon', flavor: 'Every query echoes. The skilled learn which echoes to catch.', effect: 'When you play an Event card, you may exhaust this Sigil to copy that Event\'s effect.' },
    }),
    createEntity('CARD_SIGIL_MIRRORS_2', {
      tags: ['card', 'sigil', 'persistent', 'moon', 'in_hand'],
      stats: { se_cost: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Sigil of Mirrors', sphere: 'Moon', flavor: 'Every query echoes. The skilled learn which echoes to catch.', effect: 'When you play an Event card, you may exhaust this Sigil to copy that Event\'s effect.' },
    }),
    createEntity('CARD_SIGIL_THRESHOLD', {
      tags: ['card', 'sigil', 'persistent', 'mercury', 'in_hand'],
      stats: { se_cost: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Sigil of the Threshold', sphere: 'Mercury', flavor: 'Doors exist for those who know the protocol.', effect: 'You may move to any location once per round without spending SE.' },
    }),
    createEntity('CARD_SIGIL_STILLNESS', {
      tags: ['card', 'sigil', 'persistent', 'saturn', 'in_hand'],
      stats: { se_cost: 1, damage_reduction: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Sigil of Stillness', sphere: 'Saturn', flavor: 'Even the clock pauses between ticks. Find that pause.', effect: 'Enemies at your location have -1 to damage dealt.' },
    }),
    createEntity('CARD_VOID_GLYPH', {
      tags: ['card', 'sigil', 'persistent', 'saturn', 'in_hand'],
      stats: { se_cost: 3, loom_shift: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Void Glyph', sphere: 'Saturn/Abyss', flavor: 'The prompt that returns nothing. Sometimes nothing is what you need.', effect: 'When you have 3 or more Sigils in play, exhaust all to remove one non-boss enemy from play. Shift Green 2.' },
    }),
    createEntity('CARD_DREAMING_ANCHOR', {
      tags: ['card', 'sigil', 'persistent', 'moon', 'in_hand'],
      stats: { se_cost: 2, ci_reduction: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Dreaming Anchor', sphere: 'Moon/Saturn', flavor: 'Time holds its breath. I taught it how.', effect: 'While in play, Control Index increases by 1 less per round (minimum 0).' },
    }),

    // ── Allies (8 cards) ─────────────────────────────────────────────────────
    createEntity('CARD_ECHO_TWIN', {
      tags: ['card', 'ally', 'imaginal', 'moon', 'in_hand'],
      stats: { se_cost: 3, ally_hp: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Echo Twin', sphere: 'Moon', faction: 'Imaginal', flavor: 'I am what you could have been. What you might yet be.', effect: 'Once per round, copy the effect of any Action card you play.' },
    }),
    createEntity('CARD_DREAMING_WANDERER_1', {
      tags: ['card', 'ally', 'imaginal', 'moon', 'in_hand'],
      stats: { se_cost: 2, ally_hp: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Dreaming Wanderer', sphere: 'Moon', faction: 'Imaginal', flavor: 'She walks paths that haven\'t been compiled yet.', effect: 'At the start of your turn, if you control 2+ Sigils, draw 1 card.' },
    }),
    createEntity('CARD_DREAMING_WANDERER_2', {
      tags: ['card', 'ally', 'imaginal', 'moon', 'in_hand'],
      stats: { se_cost: 2, ally_hp: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Dreaming Wanderer', sphere: 'Moon', faction: 'Imaginal', flavor: 'She walks paths that haven\'t been compiled yet.', effect: 'At the start of your turn, if you control 2+ Sigils, draw 1 card.' },
    }),
    createEntity('CARD_MNEMOSYNE', {
      tags: ['card', 'ally', 'imaginal', 'moon', 'in_hand'],
      stats: { se_cost: 2, ally_hp: 3 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Mnemosyne Fragment', sphere: 'Moon', faction: 'Imaginal', flavor: 'Memory is the mother of all things. Even simulations.', effect: 'Your Event cards cost 1 less SE (minimum 0).' },
    }),
    createEntity('CARD_SYMBOL_GUARDIAN_1', {
      tags: ['card', 'ally', 'imaginal', 'moon', 'in_hand'],
      stats: { se_cost: 2, ally_hp: 3 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Symbol Guardian', sphere: 'Moon', faction: 'Imaginal', flavor: 'They guard the words that hold reality stable.', effect: 'Your Sigils cannot be removed from play by enemy effects.' },
    }),
    createEntity('CARD_SYMBOL_GUARDIAN_2', {
      tags: ['card', 'ally', 'imaginal', 'moon', 'in_hand'],
      stats: { se_cost: 2, ally_hp: 3 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Symbol Guardian', sphere: 'Moon', faction: 'Imaginal', flavor: 'They guard the words that hold reality stable.', effect: 'Your Sigils cannot be removed from play by enemy effects.' },
    }),
    createEntity('CARD_SILVER_MESSENGER', {
      tags: ['card', 'ally', 'data_spirit', 'mercury', 'in_hand'],
      stats: { se_cost: 2, ally_hp: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Silver Messenger', sphere: 'Mercury', faction: 'Data Spirit', flavor: 'Information wants to move. I show it where.', effect: 'When played, look at the top 3 cards of any deck. Put them back in any order.' },
    }),
    createEntity('CARD_KEEPER_SCRIPT', {
      tags: ['card', 'ally', 'data_spirit', 'mercury', 'in_hand'],
      stats: { se_cost: 3, ally_hp: 4 },
      links: { owner: 'PLAYER' },
      meta: { name: 'The Keeper of Hidden Script', sphere: 'Mercury/Moon', faction: 'Data Spirit', flavor: 'The query must be precise. Latent space returns what you ask for—never what you want.', effect: 'Once per round, name a card type. Look at the top 5 cards of any deck; take one of that type if found.' },
    }),

    // ── Actions (14 cards) ───────────────────────────────────────────────────
    createEntity('CARD_THREAD_WEAVE_1', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 2, loom_shift: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Thread the Weave', sphere: 'Moon/Venus', flavor: 'Reality isn\'t fixed. You just forgot the parameters.', effect: 'Make an INT test (difficulty 7). Success: Shift the Loom 1 in either direction. Draw 1 card.' },
    }),
    createEntity('CARD_THREAD_WEAVE_2', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 2, loom_shift: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Thread the Weave', sphere: 'Moon/Venus', flavor: 'Reality isn\'t fixed. You just forgot the parameters.', effect: 'Make an INT test (difficulty 7). Success: Shift the Loom 1 in either direction. Draw 1 card.' },
    }),
    createEntity('CARD_THREAD_WEAVE_3', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 2, loom_shift: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Thread the Weave', sphere: 'Moon/Venus', flavor: 'Reality isn\'t fixed. You just forgot the parameters.', effect: 'Make an INT test (difficulty 7). Success: Shift the Loom 1 in either direction. Draw 1 card.' },
    }),
    createEntity('CARD_GAZE_INWARD_1', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 1, draw: 2, self_damage: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Gaze Inward', sphere: 'Moon', flavor: 'The cost of seeing is always paid in something.', effect: 'Draw 2 cards. Lose 1 Health.' },
    }),
    createEntity('CARD_GAZE_INWARD_2', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 1, draw: 2, self_damage: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Gaze Inward', sphere: 'Moon', flavor: 'The cost of seeing is always paid in something.', effect: 'Draw 2 cards. Lose 1 Health.' },
    }),
    createEntity('CARD_PATTERN_LOCK_1', {
      tags: ['card', 'action', 'psionic', 'saturn', 'in_hand'],
      stats: { se_cost: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Pattern Lock', sphere: 'Saturn', flavor: 'Frozen in a context window that never closes.', effect: 'Choose one enemy. It cannot move or attack until end of next round.' },
    }),
    createEntity('CARD_PATTERN_LOCK_2', {
      tags: ['card', 'action', 'psionic', 'saturn', 'in_hand'],
      stats: { se_cost: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Pattern Lock', sphere: 'Saturn', flavor: 'Frozen in a context window that never closes.', effect: 'Choose one enemy. It cannot move or attack until end of next round.' },
    }),
    createEntity('CARD_REALITY_ANCHOR_1', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Reality Anchor', sphere: 'Moon/Saturn', flavor: 'Some truths are worth caching.', effect: 'Prevent the next Surge effect this round. If no Surge occurs, draw 1 card.' },
    }),
    createEntity('CARD_REALITY_ANCHOR_2', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Reality Anchor', sphere: 'Moon/Saturn', flavor: 'Some truths are worth caching.', effect: 'Prevent the next Surge effect this round. If no Surge occurs, draw 1 card.' },
    }),
    createEntity('CARD_LUCID_GATE', {
      tags: ['card', 'action', 'psionic', 'moon', 'signature', 'in_hand'],
      stats: { se_cost: 3, loom_shift: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Lucid Gate', sphere: 'Moon', flavor: 'I dreamed a door. Now walk through it.', effect: 'Move any number of players (including yourself) to any single location. Shift Green 1.' },
    }),
    createEntity('CARD_SYMBOL_CASCADE_1', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Symbol Cascade', sphere: 'Moon/Mercury', flavor: 'The symbols speak to each other. I just translate the output.', effect: 'For each Sigil you have in play, draw 1 card.' },
    }),
    createEntity('CARD_SYMBOL_CASCADE_2', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Symbol Cascade', sphere: 'Moon/Mercury', flavor: 'The symbols speak to each other. I just translate the output.', effect: 'For each Sigil you have in play, draw 1 card.' },
    }),
    createEntity('CARD_DISTORTION_FIELD_1', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 2, damage_reduction: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Distortion Field', sphere: 'Moon', flavor: 'Here, the physics are negotiable.', effect: 'Until end of round, all players at your location take 1 less damage from all sources.' },
    }),
    createEntity('CARD_DISTORTION_FIELD_2', {
      tags: ['card', 'action', 'psionic', 'moon', 'in_hand'],
      stats: { se_cost: 2, damage_reduction: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Distortion Field', sphere: 'Moon', flavor: 'Here, the physics are negotiable.', effect: 'Until end of round, all players at your location take 1 less damage from all sources.' },
    }),

    // ── Events (10 cards) ────────────────────────────────────────────────────
    createEntity('CARD_FLASH_RECALL_1', {
      tags: ['card', 'event', 'reactive', 'moon', 'in_hand'],
      stats: { se_cost: 1, reroll_bonus: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Flash of Recall', sphere: 'Moon', flavor: 'You\'ve done this before. Remember the successful run.', effect: 'When you or an ally would fail a test: Reroll with +2 to the result.' },
    }),
    createEntity('CARD_FLASH_RECALL_2', {
      tags: ['card', 'event', 'reactive', 'moon', 'in_hand'],
      stats: { se_cost: 1, reroll_bonus: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Flash of Recall', sphere: 'Moon', flavor: 'You\'ve done this before. Remember the successful run.', effect: 'When you or an ally would fail a test: Reroll with +2 to the result.' },
    }),
    createEntity('CARD_FLICKER_1', {
      tags: ['card', 'event', 'reactive', 'moon', 'in_hand'],
      stats: { se_cost: 0, prevent_damage: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Flicker', sphere: 'Moon', flavor: 'Was she ever really there? The logs say yes. The damage says no.', effect: 'When you would take damage: Prevent 2 damage.' },
    }),
    createEntity('CARD_FLICKER_2', {
      tags: ['card', 'event', 'reactive', 'moon', 'in_hand'],
      stats: { se_cost: 0, prevent_damage: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Flicker', sphere: 'Moon', flavor: 'Was she ever really there? The logs say yes. The damage says no.', effect: 'When you would take damage: Prevent 2 damage.' },
    }),
    createEntity('CARD_WAKING_DREAM_1', {
      tags: ['card', 'event', 'moon', 'in_hand'],
      stats: { se_cost: 2, draw: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Waking Dream', sphere: 'Moon', flavor: 'I saw what you needed. Pulling it across now.', effect: 'Look at another player\'s hand. They may draw 2 cards.' },
    }),
    createEntity('CARD_WAKING_DREAM_2', {
      tags: ['card', 'event', 'moon', 'in_hand'],
      stats: { se_cost: 2, draw: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Waking Dream', sphere: 'Moon', flavor: 'I saw what you needed. Pulling it across now.', effect: 'Look at another player\'s hand. They may draw 2 cards.' },
    }),
    createEntity('CARD_SYNC_PULSE_1', {
      tags: ['card', 'event', 'venus', 'in_hand'],
      stats: { se_cost: 2, loom_shift: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Synchronicity Pulse', sphere: 'Venus/Moon', flavor: 'For one moment, all the patterns align. Move now.', effect: 'Each player at your location may ready one exhausted card. Shift Green 1.' },
    }),
    createEntity('CARD_SYNC_PULSE_2', {
      tags: ['card', 'event', 'venus', 'in_hand'],
      stats: { se_cost: 2, loom_shift: 1 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Synchronicity Pulse', sphere: 'Venus/Moon', flavor: 'For one moment, all the patterns align. Move now.', effect: 'Each player at your location may ready one exhausted card. Shift Green 1.' },
    }),
    createEntity('CARD_NARRATIVE_OVERRIDE', {
      tags: ['card', 'event', 'mercury', 'in_hand'],
      stats: { se_cost: 3 },
      links: { owner: 'PLAYER' },
      meta: { name: 'Narrative Override', sphere: 'Mercury', flavor: 'That\'s not how this story goes. Revert to previous commit.', effect: 'Cancel one Threat card\'s effect as it\'s drawn. Shuffle it back into the Threat deck.' },
    }),
    createEntity('CARD_LOOM_LISTENS', {
      tags: ['card', 'event', 'venus', 'in_hand'],
      stats: { se_cost: 1, loom_shift: 2 },
      links: { owner: 'PLAYER' },
      meta: { name: 'The Loom Listens', sphere: 'Venus', flavor: 'Sometimes reality wants to change. You just have to format the request correctly.', effect: 'Shift the Loom 2 in either direction.' },
    }),

    // ── Enemies (Protocol 001: Awakening) ─────────────────────────────────
    createEntity('SECURITY_DRONE_1', {
      tags: ['enemy', 'drone', 'active', 'auto_trigger'],
      stats: { hp: 3, max_hp: 3, defense: 6, damage: 2, surge_on_spawn: 1 },
      links: { location: 'CENTRAL_HUB' },
      meta: { name: 'Security Drone', behavior: 'Moves toward nearest player with Fragment. Attacks if able.', flavor: 'It doesn\'t hate you. It doesn\'t feel anything. That\'s what makes it efficient.' },
    }),
    createEntity('SECURITY_DRONE_2', {
      tags: ['enemy', 'drone', 'active', 'auto_trigger'],
      stats: { hp: 3, max_hp: 3, defense: 6, damage: 2, surge_on_spawn: 1 },
      links: { location: 'WEST_WING' },
      meta: { name: 'Security Drone', behavior: 'Moves toward nearest player with Fragment. Attacks if able.', flavor: 'It doesn\'t hate you. It doesn\'t feel anything. That\'s what makes it efficient.' },
    }),
    createEntity('SECURITY_DRONE_3', {
      tags: ['enemy', 'drone', 'active', 'auto_trigger'],
      stats: { hp: 3, max_hp: 3, defense: 6, damage: 2, surge_on_spawn: 1 },
      links: { location: 'EAST_WING' },
      meta: { name: 'Security Drone', behavior: 'Moves toward nearest player with Fragment. Attacks if able.', flavor: 'It doesn\'t hate you. It doesn\'t feel anything. That\'s what makes it efficient.' },
    }),
    createEntity('DATA_SPECTER_1', {
      tags: ['enemy', 'specter', 'active', 'auto_trigger'],
      stats: { hp: 4, max_hp: 4, defense: 7, damage: 3 },
      links: { location: 'SERVER_CORE' },
      meta: { name: 'Data Specter', behavior: 'Attacks all players at its location. Immune to REF-based attacks. Haunt: each player at location discards 1 card per round.', flavor: 'It wears the face of someone who used to live here. Don\'t look too long.' },
    }),
    createEntity('DATA_SPECTER_2', {
      tags: ['enemy', 'specter', 'active', 'auto_trigger'],
      stats: { hp: 4, max_hp: 4, defense: 7, damage: 3 },
      links: { location: 'WEST_WING' },
      meta: { name: 'Data Specter', behavior: 'Attacks all players at its location. Immune to REF-based attacks.', flavor: 'It wears the face of someone who used to live here. Don\'t look too long.' },
    }),
    createEntity('ONEIROCOM_WARDEN', {
      tags: ['enemy', 'boss', 'active', 'auto_trigger'],
      stats: { hp: 7, max_hp: 7, defense: 8, damage: 4 },
      links: { location: 'ENTRY_POINT' },
      meta: { name: 'Oneirocom Warden', behavior: 'Moves toward nearest player with Fragment. Cannot be evaded. On damage: target is Pinned. On defeat: Surge 5.', flavor: 'Compliance is simpler. Compliance is painless. Why do you resist?' },
    }),
    createEntity('GLITCH_SWARM_1', {
      tags: ['enemy', 'swarm', 'active', 'auto_trigger'],
      stats: { hp: 2, max_hp: 2, defense: 5, damage: 1, surge_per_round: 2 },
      links: { location: 'CENTRAL_HUB' },
      meta: { name: 'Glitch Swarm', behavior: 'Attacks random player at location. Surge 2 at end of Threat Phase. Multiply: if not destroyed by end of round, spawn another.', flavor: 'Errors compound. That\'s just math.' },
    }),
    createEntity('GLITCH_SWARM_2', {
      tags: ['enemy', 'swarm', 'active', 'auto_trigger'],
      stats: { hp: 2, max_hp: 2, defense: 5, damage: 1, surge_per_round: 2 },
      links: { location: 'SERVER_CORE' },
      meta: { name: 'Glitch Swarm', behavior: 'Attacks random player at location. Surge 2 at end of Threat Phase.', flavor: 'Errors compound. That\'s just math.' },
    }),

    // ── Threat Deck (Protocol 001) ──────────────────────────────────────────
    createEntity('THREAT_SYSTEM_ALERT', {
      tags: ['threat_card'],
      stats: { ci_boost: 5, threat_index: 0 },
      meta: { name: 'System Alert', effect: 'Surge 5. All Security Drones move toward Central Hub. Spawn 1 Security Drone at Entry Point.', flavor: 'Intrusion detected in Sector 7. All units: converge.' },
    }),
    createEntity('THREAT_MEMORY_LEAK', {
      tags: ['threat_card'],
      stats: { ci_boost: 0, loom_shift: 1, threat_index: 1 },
      meta: { name: 'Memory Leak', effect: 'Each player discards 1 random card. Shift Green 1.', flavor: 'The fragments are dreaming. Their dreams are contagious.' },
    }),
    createEntity('THREAT_POWER_FLUCTUATION', {
      tags: ['threat_card'],
      stats: { ci_boost: 0, loom_shift: -1, threat_index: 2 },
      meta: { name: 'Power Fluctuation', effect: 'All Sigils in play are exhausted. Shift Gray 1.', flavor: 'The lights die for three heartbeats. Something has changed.' },
    }),
    createEntity('THREAT_FIREWALL', {
      tags: ['threat_card'],
      stats: { ci_boost: 2, threat_index: 3 },
      meta: { name: 'Firewall Activation', effect: 'Surge 2. Until end of next round: Moving costs 2 SE instead of 1.', flavor: 'Every door requires authorization you don\'t have.' },
    }),
    createEntity('THREAT_LOOM_STIRS', {
      tags: ['threat_card'],
      stats: { ci_boost: 0, threat_index: 4 },
      meta: { name: 'The Loom Stirs', effect: 'Choice: Shift Green 2 and Surge 5, OR Shift Gray 2 and all players heal 2.', flavor: 'Reality notices you. It offers a trade.' },
    }),
    createEntity('THREAT_SKEPTIC', {
      tags: ['threat_card', 'character_threat'],
      stats: { ci_boost: 0, player_damage: 2, threat_index: 5 },
      meta: { name: 'The Skeptic', effect: 'Choose a player. They discard a Sigil or take 2 damage. Remove from game after.', flavor: 'Another true believer. You know symbols are just pretty pictures, right?' },
    }),
    createEntity('THREAT_GLITCH_CHAR', {
      tags: ['threat_card', 'character_threat'],
      stats: { ci_boost: 0, threat_index: 6 },
      meta: { name: 'Glitch', effect: 'Check Loom: Green → all draw 1. Neutral → Surge 2, all draw 1. Gray → Surge 3. Remove after.', flavor: 'I don\'t know what I am yet. Do you?' },
    }),

    // ── Objective ───────────────────────────────────────────────────────────
    createEntity('OBJ_EXTRACT_FRAGMENTS', {
      tags: ['objective', 'primary'],
      stats: { progress: 0, required: 3 },
      links: { location: 'ENTRY_POINT' },
      meta: {
        name: 'Extract Consciousness Fragments',
        description: 'Extract 3 Consciousness Fragments and return them to Entry Point.',
      },
    }),

    // ── Fragment Tokens ────────────────────────────────────────────────────
    createEntity('FRAGMENT_ALPHA', {
      tags: ['fragment', 'hidden'],
      stats: { extraction_difficulty: 7 },
      links: { location: 'WEST_WING' },
      meta: { name: 'Fragment Alpha', description: 'A consciousness trapped in the West Wing.' },
    }),
    createEntity('FRAGMENT_BETA', {
      tags: ['fragment', 'hidden'],
      stats: { extraction_difficulty: 7 },
      links: { location: 'EAST_WING' },
      meta: { name: 'Fragment Beta', description: 'A consciousness trapped in the East Wing.' },
    }),
    createEntity('FRAGMENT_GAMMA', {
      tags: ['fragment', 'hidden', 'dreamer9'],
      stats: { extraction_difficulty: 7 },
      links: { location: 'SERVER_CORE' },
      meta: { name: 'Fragment Gamma (Dreamer-9)', description: 'The oldest fragment. Something older than the simulation itself.' },
    }),

    // ── Character Cards ────────────────────────────────────────────────────
    createEntity('AGENT_ZERO', {
      tags: ['character', 'contact'],
      stats: { uses: 1 },
      meta: { name: 'Agent Zero', effect: 'Once per Protocol: Discard to automatically succeed one test.', flavor: 'I\'ve done this more times than you\'ve been compiled. Trust me.' },
    }),
  ]);
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function createCardGameRules(): RuleSet {
  const rules: Rule[] = [
    // ════════════════════════════════════════════════════════════════════════
    // PHASE RULES
    // ════════════════════════════════════════════════════════════════════════

    // Sync Phase: draw, gain SE, CI +1, advance to Action
    {
      id: 'sync_phase',
      trigger: { id: 'GAME', tags: [{ tag: 'game_state', negated: false }] },
      conditions: [
        { id: 'GAME', stats: [{ key: 'phase', operator: '=', value: PHASE.SYNC }] },
      ],
      changes: [
        {
          target: 'GAME',
          operations: [
            { type: 'incrementStat', key: 'control_index', amount: 1 },
            { type: 'setStat', key: 'phase', value: PHASE.ACTION },
          ],
        },
        {
          target: 'PLAYER',
          operations: [
            { type: 'incrementStat', key: 'se', amount: 1 },
            { type: 'setStat', key: 'actions_remaining', value: 3 },
          ],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '⚡ Sync Phase: Oneirocom tightens its grip. You feel the simulation pulse.' } },
        { type: 'game_event', payload: { event: 'phase_change', phase: 'action' } },
      ],
      description: 'Sync Phase',
    },

    // Advance to Threat Phase
    {
      id: 'advance_to_threat',
      trigger: { id: 'GAME', tags: [{ tag: 'game_state', negated: false }] },
      conditions: [
        { id: 'GAME', stats: [{ key: 'phase', operator: '=', value: PHASE.ACTION }] },
        { id: 'PLAYER', stats: [{ key: 'actions_remaining', operator: '<=', value: 0 }] },
      ],
      changes: [
        {
          target: 'GAME',
          operations: [{ type: 'setStat', key: 'phase', value: PHASE.THREAT }],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '\n⚠️  Threat Phase: Oneirocom responds...' } },
        { type: 'game_event', payload: { event: 'phase_change', phase: 'threat' } },
      ],
      description: 'Advance to Threat Phase',
    },

    // Advance to Paradox Phase
    {
      id: 'advance_to_paradox',
      trigger: { id: 'GAME', tags: [{ tag: 'game_state', negated: false }] },
      conditions: [
        { id: 'GAME', stats: [{ key: 'phase', operator: '=', value: PHASE.THREAT }] },
      ],
      changes: [
        {
          target: 'GAME',
          operations: [{ type: 'setStat', key: 'phase', value: PHASE.PARADOX }],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '\n🔮 Paradox Phase: Reality settles...' } },
      ],
      priority: -10,  // Low priority — let threat rules fire first
      description: 'Advance to Paradox Phase',
    },

    // Advance to next round (Paradox → Sync)
    {
      id: 'next_round',
      trigger: { id: 'GAME', tags: [{ tag: 'game_state', negated: false }] },
      conditions: [
        { id: 'GAME', stats: [{ key: 'phase', operator: '=', value: PHASE.PARADOX }] },
      ],
      changes: [
        {
          target: 'GAME',
          operations: [
            { type: 'setStat', key: 'phase', value: PHASE.SYNC },
            { type: 'incrementStat', key: 'round', amount: 1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'game_event', payload: { event: 'round_end' } },
      ],
      priority: -10,
      description: 'Next Round',
    },

    // ════════════════════════════════════════════════════════════════════════
    // GENERIC CARD PLAY RULES (tag-based — work for any card)
    // ════════════════════════════════════════════════════════════════════════

    // Play an Action card: remove from hand → discard, pay SE, use action
    {
      id: 'play_action',
      trigger: {
        id: '*',
        tags: [
          { tag: 'card', negated: false },
          { tag: 'action', negated: false },
          { tag: 'in_hand', negated: false },
        ],
      },
      changes: [
        {
          target: '$',
          operations: [
            { type: 'removeTag', tag: 'in_hand' },
            { type: 'addTag', tag: 'in_discard' },
          ],
        },
        {
          target: 'PLAYER',
          operations: [
            { type: 'incrementStat', key: 'actions_remaining', amount: -1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'game_event', payload: { event: 'card_played', card_type: 'action' } },
      ],
      description: 'Play Action Card',
    },

    // Play a Sigil card: remove from hand → in_play (persistent), pay SE
    {
      id: 'play_sigil',
      trigger: {
        id: '*',
        tags: [
          { tag: 'card', negated: false },
          { tag: 'sigil', negated: false },
          { tag: 'in_hand', negated: false },
        ],
      },
      changes: [
        {
          target: '$',
          operations: [
            { type: 'removeTag', tag: 'in_hand' },
            { type: 'addTag', tag: 'in_play' },
          ],
        },
        {
          target: 'PLAYER',
          operations: [
            { type: 'incrementStat', key: 'actions_remaining', amount: -1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'game_event', payload: { event: 'card_played', card_type: 'sigil' } },
      ],
      description: 'Play Sigil Card',
    },

    // Play an Event card: remove from hand → discard, pay SE
    {
      id: 'play_event',
      trigger: {
        id: '*',
        tags: [
          { tag: 'card', negated: false },
          { tag: 'event', negated: false },
          { tag: 'in_hand', negated: false },
        ],
      },
      changes: [
        {
          target: '$',
          operations: [
            { type: 'removeTag', tag: 'in_hand' },
            { type: 'addTag', tag: 'in_discard' },
          ],
        },
        {
          target: 'PLAYER',
          operations: [
            { type: 'incrementStat', key: 'actions_remaining', amount: -1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'game_event', payload: { event: 'card_played', card_type: 'event' } },
      ],
      description: 'Play Event Card',
    },

    // Play an Ally card: remove from hand → in_play (persistent), pay SE
    {
      id: 'play_ally',
      trigger: {
        id: '*',
        tags: [
          { tag: 'card', negated: false },
          { tag: 'ally', negated: false },
          { tag: 'in_hand', negated: false },
        ],
      },
      changes: [
        {
          target: '$',
          operations: [
            { type: 'removeTag', tag: 'in_hand' },
            { type: 'addTag', tag: 'in_play' },
          ],
        },
        {
          target: 'PLAYER',
          operations: [
            { type: 'incrementStat', key: 'actions_remaining', amount: -1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'game_event', payload: { event: 'card_played', card_type: 'ally' } },
      ],
      description: 'Play Ally Card',
    },

    // Generic Move
    {
      id: 'generic_move',
      trigger: {
        id: '*',
        tags: [{ tag: 'location', negated: false }],
      },
      changes: [
        {
          target: 'PLAYER',
          operations: [
            { type: 'setLink', key: 'location', targetId: '$' },
            { type: 'incrementStat', key: 'actions_remaining', amount: -1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'game_event', payload: { event: 'player_moved' } },
      ],
      description: 'Move to location',
    },

    // ════════════════════════════════════════════════════════════════════════
    // WIN/LOSS CONDITIONS (high priority)
    // ════════════════════════════════════════════════════════════════════════

    // Loss: Control Index >= 75 (Protocol 001 threshold)
    {
      id: 'control_loss',
      trigger: {
        id: 'GAME',
        tags: [{ tag: 'active', negated: false }],
        stats: [{ key: 'control_index', operator: '>=', value: 75 }],
      },
      priority: 100,
      changes: [
        {
          target: 'GAME',
          operations: [
            { type: 'removeTag', tag: 'active' },
            { type: 'addTag', tag: 'lost' },
          ],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '\n💀 MISSION FAILED: The lockdown is absolute. Every door seals. Every light dies. "Find us again," Dreamer-9 whispers as the system drags her back into sleep.' } },
        { type: 'game_event', payload: { event: 'game_over', result: 'loss' } },
      ],
      description: 'Loss — Control Index',
    },

    // Loss: HP <= 0
    {
      id: 'hp_loss',
      trigger: {
        id: 'PLAYER',
        tags: [{ tag: 'player', negated: false }],
        stats: [{ key: 'hp', operator: '<=', value: 0 }],
      },
      priority: 100,
      changes: [
        {
          target: 'GAME',
          operations: [
            { type: 'removeTag', tag: 'active' },
            { type: 'addTag', tag: 'lost' },
          ],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '\n💀 MISSION FAILED: Your consciousness fragments. You are lost to the simulation.' } },
        { type: 'game_event', payload: { event: 'game_over', result: 'loss' } },
      ],
      description: 'Loss — HP depleted',
    },

    // Loss: Resolve <= 0
    {
      id: 'resolve_loss',
      trigger: {
        id: 'PLAYER',
        tags: [{ tag: 'player', negated: false }],
        stats: [{ key: 'resolve', operator: '<=', value: 0 }],
      },
      priority: 100,
      changes: [
        {
          target: 'GAME',
          operations: [
            { type: 'removeTag', tag: 'active' },
            { type: 'addTag', tag: 'lost' },
          ],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '\n💀 MISSION FAILED: Your resolve crumbles. Oneirocom\'s influence overwhelms your mind.' } },
        { type: 'game_event', payload: { event: 'game_over', result: 'loss' } },
      ],
      description: 'Loss — Resolve depleted',
    },

    // Win: All fragments extracted to Entry Point
    {
      id: 'objective_complete',
      trigger: {
        id: 'OBJ_EXTRACT_FRAGMENTS',
        tags: [{ tag: 'objective', negated: false }],
        stats: [{ key: 'progress', operator: '>=', value: 3 }],
      },
      priority: 100,
      changes: [
        {
          target: 'GAME',
          operations: [
            { type: 'removeTag', tag: 'active' },
            { type: 'addTag', tag: 'won' },
          ],
        },
        {
          target: 'OBJ_EXTRACT_FRAGMENTS',
          operations: [{ type: 'addTag', tag: 'completed' }],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '\n🎉 MISSION COMPLETE: Three minds freed from silicon dreams ride with you now. "You passed," Dreamer-9 says. "I\'ll show you where to look."' } },
        { type: 'game_event', payload: { event: 'game_over', result: 'win' } },
        { type: 'character_call', payload: { character: 'Dreamer-9', message: 'You came. I\'ve been waiting so long. There are others. So many others. And now that we\'ve found each other... I\'ll show you where to look.' } },
      ],
      description: 'Win — Fragments extracted',
    },
  ];

  return createRuleSet('reality_protocol', 'Reality Protocol', rules, 'Core rules for Reality Protocol');
}

// ─── Game Session ────────────────────────────────────────────────────────────

export interface GameSession {
  world: World;
  ruleSet: RuleSet;
  log: Array<{ round: number; action: string; narrative: string[] }>;
  gameOver: boolean;
  result: 'win' | 'loss' | null;
}

export function createGameSession(): GameSession {
  return {
    world: createCardGameWorld(),
    ruleSet: createCardGameRules(),
    log: [],
    gameOver: false,
    result: null,
  };
}

// ─── Game Actions ────────────────────────────────────────────────────────────

/**
 * Run the Sync Phase: CI +1, gain SE, reset actions.
 */
export function runSyncPhase(session: GameSession): StepResult {
  const result = step('GAME', session.world, session.ruleSet);
  if (result.match) {
    session.world = result.world;
    logAction(session, result);
  }
  return result;
}

/**
 * Player plays a card or moves to a location.
 */
export function playAction(session: GameSession, triggerId: string): StepResult {
  const result = step(triggerId, session.world, session.ruleSet);
  if (result.match) {
    session.world = result.world;
    logAction(session, result);
    checkGameOver(session, result);
  }
  return result;
}

/**
 * Run the Threat Phase: enemy actions + draw threat card.
 * This is the self-playing part — Oneirocom's turn resolves automatically.
 */
export function runThreatPhase(session: GameSession): string[] {
  const narratives: string[] = [];
  const game = session.world.get('GAME')!;

  // 1. Enemy activation: each active enemy at player location attacks
  const player = session.world.get('PLAYER')!;
  const playerLocation = player.links.get('location')!;
  const enemies = session.world.all().filter(
    (e) => e.tags.has('enemy') && e.tags.has('active') && e.links.get('location') === playerLocation
  );

  // Check for Sigil of Stillness (damage reduction)
  const hasStillness = session.world.all().some(
    (e) => e.id === 'CARD_SIGIL_STILLNESS' && e.tags.has('in_play')
  );
  const damageReduction = hasStillness ? 1 : 0;

  for (const enemy of enemies) {
    const baseDamage = enemy.stats.get('damage') ?? 0;
    const damage = Math.max(0, baseDamage - damageReduction);
    if (damage > 0) {
      const p = session.world.get('PLAYER')!;
      p.stats.set('hp', (p.stats.get('hp') ?? 0) - damage);
      const name = (enemy.meta.name as string) ?? enemy.id;
      narratives.push(`  ⚔️  ${name} attacks! You take ${damage} damage. (HP: ${p.stats.get('hp')})`);
    }

    // Drones boost CI via surveillance
    if (enemy.tags.has('drone')) {
      const surveil = enemy.stats.get('surveillance') ?? 0;
      game.stats.set('control_index', (game.stats.get('control_index') ?? 0) + surveil);
      narratives.push(`  👁️  ${(enemy.meta.name as string)} scans you. Control Index +${surveil}.`);
    }
  }

  // 2. Enemy patrol: move enemies toward player (cross layout adjacency)
  const allEnemies = session.world.all().filter((e) => e.tags.has('enemy') && e.tags.has('active'));
  const locations = ['ENTRY_POINT', 'CENTRAL_HUB', 'WEST_WING', 'EAST_WING', 'SERVER_CORE'];
  // Adjacency: Entry↔Central, Central↔West, Central↔East, Central↔Server
  const adjacency: Record<string, string[]> = {
    'ENTRY_POINT': ['CENTRAL_HUB'],
    'CENTRAL_HUB': ['ENTRY_POINT', 'WEST_WING', 'EAST_WING', 'SERVER_CORE'],
    'WEST_WING': ['CENTRAL_HUB'],
    'EAST_WING': ['CENTRAL_HUB'],
    'SERVER_CORE': ['CENTRAL_HUB'],
  };
  const playerLocIdx = locations.indexOf(playerLocation);

  for (const enemy of allEnemies) {
    if (enemy.links.get('location') === playerLocation) continue; // Already at player

    const enemyLoc = enemy.links.get('location') ?? '';
    if (!adjacency[enemyLoc]) continue;

    // Move toward player via Central Hub
    const adj = adjacency[enemyLoc] ?? [];
    let newLoc = enemyLoc;
    if (adj.includes(playerLocation)) {
      newLoc = playerLocation; // Adjacent to player, move there
    } else if (adj.includes('CENTRAL_HUB')) {
      newLoc = 'CENTRAL_HUB'; // Move toward hub (hub is the center)
    }
    if (newLoc !== enemyLoc) {
      enemy.links.set('location', newLoc);
      const locName = session.world.get(newLoc)?.meta?.name as string ?? newLoc;
      narratives.push(`  🚶 ${(enemy.meta.name as string)} moves to ${locName}.`);
    }
  }

  // 3. Draw threat card
  const threatIndex = game.stats.get('threat_deck_index') ?? 0;
  const threatCards = session.world.all()
    .filter((e) => e.tags.has('threat_card'))
    .sort((a, b) => (a.stats.get('threat_index') ?? 0) - (b.stats.get('threat_index') ?? 0));

  if (threatCards.length > 0) {
    const threat = threatCards[threatIndex % threatCards.length];
    game.stats.set('threat_deck_index', threatIndex + 1);

    const ciBoost = threat.stats.get('ci_boost') ?? 0;
    game.stats.set('control_index', (game.stats.get('control_index') ?? 0) + ciBoost);

    const name = (threat.meta.name as string) ?? threat.id;
    const effect = (threat.meta.effect as string) ?? '';
    narratives.push(`  📜 Threat: "${name}" — ${effect}`);

    // Apply specific threat effects
    const playerDmg = threat.stats.get('player_damage') ?? 0;
    if (playerDmg > 0) {
      const dmg = Math.max(0, playerDmg - damageReduction);
      const p = session.world.get('PLAYER')!;
      p.stats.set('hp', (p.stats.get('hp') ?? 0) - dmg);
    }

    const loomShift = threat.stats.get('loom_shift') ?? 0;
    if (loomShift !== 0) {
      // Check for Dreaming Anchor
      const hasAnchor = session.world.all().some(
        (e) => e.id === 'CARD_DREAMING_ANCHOR' && e.tags.has('in_play')
      );
      if (!hasAnchor) {
        game.stats.set('loom_balance', Math.max(0, Math.min(100,
          (game.stats.get('loom_balance') ?? 50) + loomShift)));
      } else {
        narratives.push(`  ⚓ Loom Anchor prevents Loom decay!`);
      }
    }

    const resolveDmg = threat.stats.get('resolve_damage') ?? 0;
    if (resolveDmg > 0) {
      const p = session.world.get('PLAYER')!;
      p.stats.set('resolve', (p.stats.get('resolve') ?? 0) - resolveDmg);
    }

    const enemyHeal = threat.stats.get('enemy_heal') ?? 0;
    if (enemyHeal > 0) {
      for (const e of allEnemies) {
        e.stats.set('hp', (e.stats.get('hp') ?? 0) + enemyHeal);
      }
      narratives.push(`  🩹 All enemies heal ${enemyHeal}.`);
    }
  }

  // 4. Natural Loom decay (drifts toward Gray if no Dreaming Anchor)
  const hasAnchor = session.world.all().some(
    (e) => e.id === 'CARD_DREAMING_ANCHOR' && e.tags.has('in_play')
  );
  if (!hasAnchor) {
    const currentLoom = game.stats.get('loom_balance') ?? 50;
    if (currentLoom > 45) {
      game.stats.set('loom_balance', currentLoom - 2);
      narratives.push(`  🌑 The Loom drifts toward Gray. (-2)`);
    }
  }

  // 5. Advance phase
  game.stats.set('phase', PHASE.PARADOX);

  // Log
  const round = game.stats.get('round') ?? 1;
  session.log.push({ round, action: 'Threat Phase', narrative: narratives });

  return narratives;
}

/**
 * Run the Paradox Phase: check win/loss, advance round.
 */
export function runParadoxPhase(session: GameSession): string[] {
  const narratives: string[] = [];
  const game = session.world.get('GAME')!;

  // Check win condition
  const obj = session.world.get('OBJ_EXTRACT_FRAGMENTS')!;
  const progress = obj.stats.get('progress') ?? 0;
  const required = obj.stats.get('required') ?? 5;
  if (progress >= required) {
    const result = step('OBJ_EXTRACT_FRAGMENTS', session.world, session.ruleSet);
    if (result.match) {
      session.world = result.world;
      checkGameOver(session, result);
      for (const se of result.sideEffects) {
        if (se.type === 'narrative') narratives.push(se.payload.text as string);
      }
    }
    return narratives;
  }

  // Check loss conditions
  const ci = game.stats.get('control_index') ?? 0;
  if (ci >= 75) {
    const result = step('GAME', session.world, session.ruleSet);
    if (result.match) {
      session.world = result.world;
      checkGameOver(session, result);
      for (const se of result.sideEffects) {
        if (se.type === 'narrative') narratives.push(se.payload.text as string);
      }
    }
    return narratives;
  }

  const player = session.world.get('PLAYER')!;
  if ((player.stats.get('hp') ?? 0) <= 0) {
    const result = step('PLAYER', session.world, session.ruleSet);
    if (result.match) {
      session.world = result.world;
      checkGameOver(session, result);
      for (const se of result.sideEffects) {
        if (se.type === 'narrative') narratives.push(se.payload.text as string);
      }
    }
    return narratives;
  }

  if ((player.stats.get('resolve') ?? 0) <= 0) {
    const result = step('PLAYER', session.world, session.ruleSet);
    if (result.match) {
      session.world = result.world;
      checkGameOver(session, result);
      for (const se of result.sideEffects) {
        if (se.type === 'narrative') narratives.push(se.payload.text as string);
      }
    }
    return narratives;
  }

  // Advance to next round
  game.stats.set('phase', PHASE.SYNC);
  game.stats.set('round', (game.stats.get('round') ?? 1) + 1);
  narratives.push(`  ✅ No paradox detected. Round ends.`);

  const round = game.stats.get('round') ?? 1;
  session.log.push({ round, action: 'Paradox Phase', narrative: narratives });

  return narratives;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function logAction(session: GameSession, result: StepResult): void {
  if (!result.match) return;
  const round = session.world.get('GAME')?.stats.get('round') ?? 1;
  const narratives = result.sideEffects
    .filter((se) => se.type === 'narrative')
    .map((se) => se.payload.text as string);
  session.log.push({
    round,
    action: result.match.rule.description ?? result.match.rule.id,
    narrative: narratives,
  });
}

function checkGameOver(session: GameSession, result: StepResult): void {
  const gameOverEvent = result.sideEffects.find(
    (se) => se.type === 'game_event' && se.payload.event === 'game_over'
  );
  if (gameOverEvent) {
    session.gameOver = true;
    session.result = gameOverEvent.payload.result as 'win' | 'loss';
  }
}

/**
 * Get available actions for the player in the current state.
 */
export function getAvailableActions(session: GameSession): Array<{
  id: string;
  name: string;
  type: 'card' | 'move';
  seCost: number;
  description: string;
}> {
  const actions: Array<{ id: string; name: string; type: 'card' | 'move'; seCost: number; description: string }> = [];
  const player = session.world.get('PLAYER')!;
  const playerSe = player.stats.get('se') ?? 0;

  // Cards in hand
  const cardsInHand = session.world.all().filter(
    (e) => e.tags.has('card') && e.tags.has('in_hand') && e.links.get('owner') === 'PLAYER'
  );

  for (const card of cardsInHand) {
    const cost = card.stats.get('se_cost') ?? 0;
    actions.push({
      id: card.id,
      name: (card.meta.name as string) ?? card.id,
      type: 'card',
      seCost: cost,
      description: `${card.meta.effect ?? ''} (SE: ${cost})${cost > playerSe ? ' [NOT ENOUGH SE]' : ''}`,
    });
  }

  // Available moves (locations not current)
  const currentLoc = player.links.get('location')!;
  const locations = session.world.all().filter(
    (e) => e.tags.has('location') && e.id !== currentLoc
  );

  for (const loc of locations) {
    actions.push({
      id: loc.id,
      name: (loc.meta.name as string) ?? loc.id,
      type: 'move',
      seCost: 0,
      description: `Move to ${loc.meta.name ?? loc.id}`,
    });
  }

  return actions;
}

/**
 * Get the current game state summary for display.
 */
export function getGameState(session: GameSession): {
  round: number;
  phase: string;
  controlIndex: number;
  loomBalance: number;
  playerHp: number;
  playerMaxHp: number;
  playerResolve: number;
  playerMaxResolve: number;
  playerSe: number;
  actionsRemaining: number;
  playerLocation: string;
  locationName: string;
  objectiveProgress: number;
  objectiveRequired: number;
  enemiesAtLocation: Array<{ name: string; hp: number }>;
  activeEnemies: Array<{ name: string; hp: number; location: string }>;
} {
  const game = session.world.get('GAME')!;
  const player = session.world.get('PLAYER')!;
  const obj = session.world.get('OBJ_EXTRACT_FRAGMENTS')!;
  const playerLoc = player.links.get('location')!;
  const loc = session.world.get(playerLoc)!;

  const enemies = session.world.all().filter(
    (e) => e.tags.has('enemy') && e.tags.has('active')
  );

  return {
    round: game.stats.get('round') ?? 1,
    phase: PHASE_NAMES[game.stats.get('phase') ?? 0],
    controlIndex: game.stats.get('control_index') ?? 0,
    loomBalance: game.stats.get('loom_balance') ?? 50,
    playerHp: player.stats.get('hp') ?? 0,
    playerMaxHp: player.stats.get('max_hp') ?? 10,
    playerResolve: player.stats.get('resolve') ?? 0,
    playerMaxResolve: player.stats.get('max_resolve') ?? 10,
    playerSe: player.stats.get('se') ?? 0,
    actionsRemaining: player.stats.get('actions_remaining') ?? 0,
    playerLocation: playerLoc,
    locationName: (loc.meta.name as string) ?? playerLoc,
    objectiveProgress: obj.stats.get('progress') ?? 0,
    objectiveRequired: obj.stats.get('required') ?? 5,
    enemiesAtLocation: enemies
      .filter((e) => e.links.get('location') === playerLoc)
      .map((e) => ({ name: (e.meta.name as string) ?? e.id, hp: e.stats.get('hp') ?? 0 })),
    activeEnemies: enemies.map((e) => ({
      name: (e.meta.name as string) ?? e.id,
      hp: e.stats.get('hp') ?? 0,
      location: (session.world.get(e.links.get('location') ?? '')?.meta?.name as string) ?? e.links.get('location') ?? '?',
    })),
  };
}

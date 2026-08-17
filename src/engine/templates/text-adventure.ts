/**
 * Aureum Rules Engine — Text Adventure Template
 *
 * "The Keeper's Signal" — A mysterious abandoned lighthouse on a cliff.
 * The player is investigating strange signals emanating from within.
 *
 * This is the reference implementation for text adventures, parallel to
 * card-game.ts for card games. Demonstrates rooms, items, NPCs, puzzles,
 * movement rules, item interactions, dialogue, and win/loss conditions.
 */

import { createEntity, World, Entity } from '../world';
import { Rule, createRuleSet, RuleSet } from '../rules';

// ─── World Setup ─────────────────────────────────────────────────────────────

export function createTextAdventureWorld(): World {
  return new World([
    // ── Game State ──────────────────────────────────────────────────────────
    createEntity('GAME', {
      tags: ['game', 'active'],
      stats: { turn: 1, atmosphere: 1 },
      meta: {
        name: 'The Keeper\'s Signal',
        description: 'Strange signals pulse from the abandoned Point Vael Lighthouse. You\'ve been sent to investigate. The locals say the keeper vanished decades ago — but someone is still transmitting.',
      },
    }),

    // ── Player ─────────────────────────────────────────────────────────────
    createEntity('PLAYER', {
      tags: ['player'],
      stats: {
        hp: 100,
        max_hp: 100,
        inventory_size: 0,
        max_inventory: 10,
      },
      links: { location: 'ROOM_CLIFF_PATH' },
      meta: {
        name: 'Investigator',
        description: 'A Signal Corps investigator dispatched to Point Vael.',
      },
    }),

    // ── Rooms (8) ──────────────────────────────────────────────────────────

    createEntity('ROOM_CLIFF_PATH', {
      tags: ['room'],
      stats: { visited: 0 },
      links: { north: 'ROOM_ENTRANCE' },
      meta: {
        name: 'Cliff Path',
        description: 'A narrow path winds along the cliff edge. Jagged rocks drop away to churning surf far below. The lighthouse looms ahead, its tower dark against a bruised sky. Salt spray stings your face. The air hums with a low, barely perceptible vibration.',
        description_short: 'The cliff path. Wind screams around you. The lighthouse entrance is to the north.',
        first_visit_text: 'You step off the coastal road onto the cliff path. Immediately, the hum intensifies — not sound exactly, but a pressure behind your eyes. Whatever is transmitting, it\'s close.',
        ambient_text: 'Waves crash against the rocks below. The vibration pulses steadily, like a heartbeat.',
      },
    }),

    createEntity('ROOM_ENTRANCE', {
      tags: ['room'],
      stats: { visited: 0 },
      links: {
        south: 'ROOM_CLIFF_PATH',
        north: 'ROOM_GROUND_FLOOR',
      },
      meta: {
        name: 'Lighthouse Entrance',
        description: 'A heavy oak door, half-rotted, guards the entrance. Brass fittings have turned green with sea air. Above the lintel, faded letters read: POINT VAEL — EST. 1887. The threshold is worn smooth by decades of boots.',
        description_short: 'The lighthouse entrance. South to the cliff path, north into the ground floor.',
        first_visit_text: 'The door groans open at your touch. Inside, the air changes — damp stone replaces salt wind. Something scratches in the walls. Or maybe it\'s in your head.',
        ambient_text: 'Wind whistles through gaps in the doorframe. The scratching continues, rhythmic and deliberate.',
      },
    }),

    createEntity('ROOM_GROUND_FLOOR', {
      tags: ['room'],
      stats: { visited: 0 },
      links: {
        south: 'ROOM_ENTRANCE',
        up: 'ROOM_SPIRAL_STAIRS',
        east: 'ROOM_KEEPERS_QUARTERS',
        down: 'ROOM_CELLAR',
      },
      meta: {
        name: 'Ground Floor',
        description: 'A circular room at the base of the tower. Peeling wallpaper covers curved stone walls. A rusted iron staircase spirals upward into darkness. Doorways lead east to the keeper\'s quarters and down to the cellar. A barnacle-crusted logbook sits on a tilted desk.',
        description_short: 'The ground floor hub. Stairs lead up and down; the keeper\'s quarters are east.',
        first_visit_text: 'Dust motes drift in your flashlight beam. The room hasn\'t been touched in years — except for the footprints. Fresh footprints, leading upward on the spiral stairs.',
        ambient_text: 'The tower creaks above you. Metal groans against stone. The hum is louder here, resonating in the walls.',
      },
    }),

    createEntity('ROOM_KEEPERS_QUARTERS', {
      tags: ['room'],
      stats: { visited: 0 },
      links: { west: 'ROOM_GROUND_FLOOR' },
      meta: {
        name: 'Keeper\'s Quarters',
        description: 'A cramped room with a narrow cot, a writing desk, and a locked sea chest. Charts and photographs paper the walls — shipping lanes, tide tables, and a single photograph of a man standing in the lantern room, his face obscured by light. The desk drawer is slightly ajar.',
        description_short: 'The keeper\'s quarters. Cramped but full of clues. West returns to the ground floor.',
        first_visit_text: 'The cot is neatly made. The pillow still carries the impression of a head. As if someone just stood up.',
        ambient_text: 'The photograph on the wall seems to watch you. The man in it is always just out of focus.',
      },
    }),

    createEntity('ROOM_SPIRAL_STAIRS', {
      tags: ['room'],
      stats: { visited: 0 },
      links: {
        down: 'ROOM_GROUND_FLOOR',
        up: 'ROOM_LANTERN_ROOM',
      },
      meta: {
        name: 'Spiral Staircase',
        description: 'Iron stairs wind tightly upward through the tower\'s core. Each step rings hollow under your weight. Narrow slits in the stone let in shafts of gray light. Water stains streak the walls like dark veins. The hum vibrates through the railing under your hand.',
        description_short: 'The spiral stairs. Down to the ground floor, up to the lantern room.',
        first_visit_text: 'You grip the railing and begin the ascent. The stairs shudder. Through a slit in the stone, you catch a glimpse of the sea — impossibly far below, impossibly still.',
        ambient_text: 'Your footsteps echo upward and return changed, as if something above is answering.',
      },
    }),

    createEntity('ROOM_LANTERN_ROOM', {
      tags: ['room'],
      stats: { visited: 0 },
      links: { down: 'ROOM_SPIRAL_STAIRS' },
      meta: {
        name: 'Lantern Room',
        description: 'The top of the tower. A massive Fresnel lens dominates the center, but it\'s fractured — three prism fragments are missing from its assembly. Through the glass walls, the sea stretches endlessly. The signal equipment hums at full intensity here, crude wires running from the lens housing to a jury-rigged transmitter bolted to the floor.',
        description_short: 'The lantern room at the summit. The broken lens and signal transmitter are here.',
        first_visit_text: 'The hum explodes into a chord. The lens catches what little light there is and scatters it into broken rainbows across the walls. This is the source. This is where the signal begins. But the lens is incomplete — three sockets sit empty, waiting for their prisms.',
        ambient_text: 'Broken light dances across the glass walls. The transmitter clicks and chirps, broadcasting its unknown signal into the void.',
      },
    }),

    createEntity('ROOM_CELLAR', {
      tags: ['room'],
      stats: { visited: 0 },
      links: {
        up: 'ROOM_GROUND_FLOOR',
        north: 'ROOM_SEA_CAVE',
      },
      meta: {
        name: 'Cellar',
        description: 'A damp stone cellar beneath the lighthouse. Shelves hold tins of lamp oil long since congealed. A section of the northern wall has crumbled, revealing a natural passage carved by the sea. The air tastes of salt and something older — stone and deep water.',
        description_short: 'The cellar. Up to the ground floor. A passage leads north to a sea cave.',
        first_visit_text: 'You descend into cold damp air. Your flashlight finds the collapsed wall immediately — it wasn\'t natural erosion. Someone broke through deliberately. Beyond it, you hear the echo of waves in a hidden space.',
        ambient_text: 'Water drips in steady rhythm. The sea breathes through the passage to the north.',
      },
    }),

    createEntity('ROOM_SEA_CAVE', {
      tags: ['room'],
      stats: { visited: 0 },
      links: { south: 'ROOM_CELLAR' },
      meta: {
        name: 'Hidden Sea Cave',
        description: 'A natural cavern where the cliff meets the sea. Tidal pools gleam in your flashlight. Barnacles crust every surface. At the far end, a small wooden boat is moored to a natural pillar of rock, half-submerged. The sailor sits on a ledge, watching the water.',
        description_short: 'The hidden sea cave. South returns to the cellar.',
        first_visit_text: 'The cave opens up around you, vast and echoing. Bioluminescent algae paints the rock walls with pale blue light. A figure sits motionless at the water\'s edge. For a moment, you think it\'s a body. Then it turns to look at you.',
        ambient_text: 'Waves lap softly in the cave. The bioluminescence pulses in time with the lighthouse hum above.',
      },
    }),

    // ── Items (7) ──────────────────────────────────────────────────────────

    createEntity('ITEM_FLASHLIGHT', {
      tags: ['item', 'in_inventory'],
      stats: { usable: 1 },
      links: { location: 'PLAYER' },
      meta: {
        name: 'Flashlight',
        description: 'A heavy-duty Signal Corps flashlight.',
        examine_text: 'Standard issue. The beam is strong but flickers occasionally, as if the lighthouse\'s signal is interfering with the battery.',
      },
    }),

    createEntity('ITEM_LOGBOOK', {
      tags: ['item', 'in_room'],
      stats: { usable: 0 },
      links: { location: 'ROOM_GROUND_FLOOR' },
      meta: {
        name: 'Logbook',
        description: 'A barnacle-crusted logbook on the desk.',
        examine_text: 'The last entry, dated November 3, 1952: "The lens speaks now. I can hear it in the light. Three voices, three fragments. They want to be whole again. I will help them. I will be the keeper until someone comes who can hear what I hear." The handwriting deteriorates into spirals after this.',
      },
    }),

    createEntity('ITEM_BRASS_KEY', {
      tags: ['item', 'in_room'],
      stats: { usable: 1 },
      links: { location: 'ROOM_KEEPERS_QUARTERS' },
      meta: {
        name: 'Brass Key',
        description: 'A tarnished brass key in the desk drawer.',
        examine_text: 'Heavy and cold. The bow is shaped like a lighthouse. It\'s engraved with a single word: REMEMBER.',
      },
    }),

    createEntity('ITEM_PRISM_ALPHA', {
      tags: ['item', 'in_room', 'prism'],
      stats: { usable: 1 },
      links: { location: 'ROOM_KEEPERS_QUARTERS' },
      meta: {
        name: 'Prism Fragment (Red)',
        description: 'A triangular glass prism that glows with inner red light.',
        examine_text: 'Warm to the touch. When you hold it, you hear a voice — distant, fragmented: "...still here... waiting... the light remembers..."',
      },
    }),

    createEntity('ITEM_PRISM_BETA', {
      tags: ['item', 'in_room', 'prism'],
      stats: { usable: 1 },
      links: { location: 'ROOM_CELLAR' },
      meta: {
        name: 'Prism Fragment (Blue)',
        description: 'A triangular glass prism that pulses with cold blue light.',
        examine_text: 'Ice-cold. The voice in this one is clearer: "...the keeper held us together... the signal was never for ships... it was for us..."',
      },
    }),

    createEntity('ITEM_PRISM_GAMMA', {
      tags: ['item', 'in_room', 'prism'],
      stats: { usable: 1 },
      links: { location: 'ROOM_SEA_CAVE' },
      meta: {
        name: 'Prism Fragment (Green)',
        description: 'A triangular glass prism that shimmers with green-gold light.',
        examine_text: 'It hums in your hand, harmonizing with the lighthouse signal. The voice is strongest here: "...we are the signal... find the lens... make us whole... the keeper will show you the way..."',
      },
    }),

    createEntity('ITEM_JOURNAL', {
      tags: ['item', 'in_room'],
      stats: { usable: 0 },
      links: { location: 'ROOM_KEEPERS_QUARTERS' },
      meta: {
        name: 'Keeper\'s Journal',
        description: 'A locked leather-bound journal on the writing desk.',
        examine_text: 'The lock is small but solid brass. You need a key to open it.',
      },
    }),

    // ── NPCs (2) ───────────────────────────────────────────────────────────

    createEntity('NPC_KEEPER', {
      tags: ['npc', 'alive', 'friendly'],
      stats: { disposition: 70, talked: 0 },
      links: { location: 'ROOM_LANTERN_ROOM' },
      meta: {
        name: 'The Keeper',
        description: 'A translucent figure in a weathered coat stands beside the broken lens. He\'s not quite there — more like light bent into the shape of a man. His eyes are kind but desperately tired.',
        dialogue_default: '"You can hear it, can\'t you? The signal. I\'ve been maintaining it for... I don\'t know how long anymore. The lens needs its prisms. Three fragments, scattered when the storm took me. Find them. Restore the lens. That\'s all I ask. Then I can rest."',
        dialogue_quest: '"The prisms — you have them? Each one carries a voice. A consciousness trapped in light. The lens was never meant to guide ships. It was built to hold them together. To keep them from dissolving into noise. Please. Put them back."',
      },
    }),

    createEntity('NPC_SAILOR', {
      tags: ['npc', 'alive', 'friendly'],
      stats: { disposition: 40, talked: 0 },
      links: { location: 'ROOM_SEA_CAVE' },
      meta: {
        name: 'The Stranded Sailor',
        description: 'A weathered woman in a salt-stained jacket sits on a rock ledge, staring at the water. She looks solid enough, but her edges blur when you look too closely.',
        dialogue_default: '"Don\'t bother asking when I got here. Time doesn\'t work right near the lighthouse. My boat brought me in through the cave. I\'ve been trying to leave, but the tide never turns. It\'s the signal — it holds everything in place. Fix it or break it, I don\'t care which. Just make the tide move again."',
        dialogue_quest: '"You\'re actually going to fix the lens? The keeper asked the same of me. I couldn\'t hear the prisms — but you can, can\'t you? There\'s one down here somewhere. The blue one. The cave hides it between the tidal pools, near the boat."',
      },
    }),

    // ── Puzzles (2) ────────────────────────────────────────────────────────

    createEntity('PUZZLE_LENS', {
      tags: ['puzzle', 'locked'],
      stats: { solved: 0, prisms_placed: 0 },
      links: {
        location: 'ROOM_LANTERN_ROOM',
        requires_item: 'ITEM_PRISM_ALPHA',
      },
      meta: {
        name: 'The Broken Lens',
        description: 'The Fresnel lens has three empty sockets where prism fragments should be placed.',
        solved_text: 'The final prism clicks into place. The lens erupts with light — not the cold beam of a lighthouse, but something warmer, something alive. Three voices merge into one clear tone. The signal transforms from a desperate loop into a sustained chord. The keeper smiles, really smiles, and begins to fade. "Thank you. We can rest now."',
        hint_text: 'Three prism fragments are hidden throughout the lighthouse. Find them and place them in the lens.',
      },
    }),

    createEntity('PUZZLE_JOURNAL', {
      tags: ['puzzle', 'locked'],
      stats: { solved: 0 },
      links: {
        location: 'ROOM_KEEPERS_QUARTERS',
        requires_item: 'ITEM_BRASS_KEY',
      },
      meta: {
        name: 'The Locked Journal',
        description: 'A locked leather-bound journal. The brass key might open it.',
        solved_text: 'The key turns smoothly. The journal falls open to the final pages. They describe the lens in technical detail — not optics, but something closer to music theory. The keeper wasn\'t maintaining a lighthouse. He was maintaining a harmony. The prism fragments are tuning forks for consciousness. Without them, the voices trapped in the signal will scatter into static.',
        hint_text: 'Find the brass key to unlock the keeper\'s journal.',
      },
    }),

    // ── Objective ──────────────────────────────────────────────────────────

    createEntity('OBJECTIVE_RESTORE_LENS', {
      tags: ['objective'],
      stats: { progress: 0, required: 3 },
      meta: {
        name: 'Restore the Lighthouse Lens',
        description: 'Find and place three prism fragments in the broken Fresnel lens to restore the signal and free the trapped consciousnesses.',
      },
    }),
  ]);
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function createTextAdventureRules(): RuleSet {
  const rules: Rule[] = [
    // ════════════════════════════════════════════════════════════════════════
    // MOVEMENT RULES
    // ════════════════════════════════════════════════════════════════════════

    // Generic movement rule: trigger a room entity, check that a directional
    // link exists from the player's current room to that room.
    // Because the evaluator matches trigger by entity ID, we need per-room
    // rules (the engine doesn't support dynamic link resolution).

    {
      id: 'move_to_cliff_path',
      trigger: { id: 'ROOM_CLIFF_PATH', tags: [{ tag: 'room', negated: false }] },
      conditions: [],
      changes: [
        { target: 'PLAYER', operations: [{ type: 'setLink', key: 'location', targetId: 'ROOM_CLIFF_PATH' }] },
        { target: 'ROOM_CLIFF_PATH', operations: [{ type: 'setStat', key: 'visited', value: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'turn', amount: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🚶 You make your way along the cliff path. Wind howls around you.' } },
      ],
      description: 'Move to Cliff Path',
    },

    {
      id: 'move_to_entrance',
      trigger: { id: 'ROOM_ENTRANCE', tags: [{ tag: 'room', negated: false }] },
      conditions: [],
      changes: [
        { target: 'PLAYER', operations: [{ type: 'setLink', key: 'location', targetId: 'ROOM_ENTRANCE' }] },
        { target: 'ROOM_ENTRANCE', operations: [{ type: 'setStat', key: 'visited', value: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'turn', amount: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🚶 You approach the lighthouse entrance. The heavy door awaits.' } },
      ],
      description: 'Move to Lighthouse Entrance',
    },

    {
      id: 'move_to_ground_floor',
      trigger: { id: 'ROOM_GROUND_FLOOR', tags: [{ tag: 'room', negated: false }] },
      conditions: [],
      changes: [
        { target: 'PLAYER', operations: [{ type: 'setLink', key: 'location', targetId: 'ROOM_GROUND_FLOOR' }] },
        { target: 'ROOM_GROUND_FLOOR', operations: [{ type: 'setStat', key: 'visited', value: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'turn', amount: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🚶 You enter the ground floor of the lighthouse. Dust swirls in your flashlight beam.' } },
      ],
      description: 'Move to Ground Floor',
    },

    {
      id: 'move_to_keepers_quarters',
      trigger: { id: 'ROOM_KEEPERS_QUARTERS', tags: [{ tag: 'room', negated: false }] },
      conditions: [],
      changes: [
        { target: 'PLAYER', operations: [{ type: 'setLink', key: 'location', targetId: 'ROOM_KEEPERS_QUARTERS' }] },
        { target: 'ROOM_KEEPERS_QUARTERS', operations: [{ type: 'setStat', key: 'visited', value: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'turn', amount: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🚶 You step into the keeper\'s quarters. The room is small and dense with memory.' } },
      ],
      description: 'Move to Keeper\'s Quarters',
    },

    {
      id: 'move_to_spiral_stairs',
      trigger: { id: 'ROOM_SPIRAL_STAIRS', tags: [{ tag: 'room', negated: false }] },
      conditions: [],
      changes: [
        { target: 'PLAYER', operations: [{ type: 'setLink', key: 'location', targetId: 'ROOM_SPIRAL_STAIRS' }] },
        { target: 'ROOM_SPIRAL_STAIRS', operations: [{ type: 'setStat', key: 'visited', value: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'turn', amount: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🚶 You ascend the spiral staircase. Each iron step rings like a bell.' } },
      ],
      description: 'Move to Spiral Staircase',
    },

    {
      id: 'move_to_lantern_room',
      trigger: { id: 'ROOM_LANTERN_ROOM', tags: [{ tag: 'room', negated: false }] },
      conditions: [],
      changes: [
        { target: 'PLAYER', operations: [{ type: 'setLink', key: 'location', targetId: 'ROOM_LANTERN_ROOM' }] },
        { target: 'ROOM_LANTERN_ROOM', operations: [{ type: 'setStat', key: 'visited', value: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'turn', amount: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'atmosphere', amount: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🚶 You emerge into the lantern room. Light fractures through the broken lens. The hum is deafening.' } },
      ],
      description: 'Move to Lantern Room',
    },

    {
      id: 'move_to_cellar',
      trigger: { id: 'ROOM_CELLAR', tags: [{ tag: 'room', negated: false }] },
      conditions: [],
      changes: [
        { target: 'PLAYER', operations: [{ type: 'setLink', key: 'location', targetId: 'ROOM_CELLAR' }] },
        { target: 'ROOM_CELLAR', operations: [{ type: 'setStat', key: 'visited', value: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'turn', amount: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🚶 You descend into the cellar. The air is cold and damp.' } },
      ],
      description: 'Move to Cellar',
    },

    {
      id: 'move_to_sea_cave',
      trigger: { id: 'ROOM_SEA_CAVE', tags: [{ tag: 'room', negated: false }] },
      conditions: [],
      changes: [
        { target: 'PLAYER', operations: [{ type: 'setLink', key: 'location', targetId: 'ROOM_SEA_CAVE' }] },
        { target: 'ROOM_SEA_CAVE', operations: [{ type: 'setStat', key: 'visited', value: 1 }] },
        { target: 'GAME', operations: [{ type: 'incrementStat', key: 'turn', amount: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🚶 You crawl through the passage into the hidden sea cave. Bioluminescence paints everything blue.' } },
      ],
      description: 'Move to Hidden Sea Cave',
    },

    // ════════════════════════════════════════════════════════════════════════
    // EXAMINE RULES
    // ════════════════════════════════════════════════════════════════════════

    {
      id: 'examine_logbook',
      trigger: { id: 'ITEM_LOGBOOK' },
      conditions: [
        { id: 'PLAYER', links: [{ key: 'location', targetId: 'ROOM_GROUND_FLOOR', negated: false }] },
      ],
      changes: [],
      sideEffects: [
        { type: 'narrative', payload: { text: '📖 You open the logbook. The last entry, dated November 3, 1952: "The lens speaks now. I can hear it in the light. Three voices, three fragments. They want to be whole again. I will help them. I will be the keeper until someone comes who can hear what I hear." The handwriting deteriorates into spirals.' } },
      ],
      description: 'Examine the logbook',
    },

    {
      id: 'examine_flashlight',
      trigger: { id: 'ITEM_FLASHLIGHT' },
      conditions: [
        { id: 'ITEM_FLASHLIGHT', tags: [{ tag: 'in_inventory', negated: false }] },
      ],
      changes: [],
      sideEffects: [
        { type: 'narrative', payload: { text: '🔦 Standard issue Signal Corps flashlight. The beam is strong but flickers, as if the lighthouse signal is interfering with the battery.' } },
      ],
      description: 'Examine flashlight',
    },

    {
      id: 'examine_prism_alpha',
      trigger: { id: 'ITEM_PRISM_ALPHA' },
      conditions: [],
      changes: [],
      sideEffects: [
        { type: 'narrative', payload: { text: '🔴 The red prism is warm to the touch. A voice whispers: "...still here... waiting... the light remembers..."' } },
      ],
      description: 'Examine red prism',
    },

    {
      id: 'examine_prism_beta',
      trigger: { id: 'ITEM_PRISM_BETA' },
      conditions: [],
      changes: [],
      sideEffects: [
        { type: 'narrative', payload: { text: '🔵 The blue prism is ice-cold. A voice speaks: "...the keeper held us together... the signal was never for ships... it was for us..."' } },
      ],
      description: 'Examine blue prism',
    },

    {
      id: 'examine_prism_gamma',
      trigger: { id: 'ITEM_PRISM_GAMMA' },
      conditions: [],
      changes: [],
      sideEffects: [
        { type: 'narrative', payload: { text: '🟢 The green prism hums in your hand. The voice is strongest: "...we are the signal... find the lens... make us whole..."' } },
      ],
      description: 'Examine green prism',
    },

    {
      id: 'examine_journal_locked',
      trigger: { id: 'ITEM_JOURNAL' },
      conditions: [
        { id: 'PUZZLE_JOURNAL', tags: [{ tag: 'locked', negated: false }] },
      ],
      changes: [],
      sideEffects: [
        { type: 'narrative', payload: { text: '📕 The journal is locked. A small brass lock holds it shut. You need a key.' } },
      ],
      priority: 5,
      description: 'Examine locked journal',
    },

    {
      id: 'examine_journal_unlocked',
      trigger: { id: 'ITEM_JOURNAL' },
      conditions: [
        { id: 'PUZZLE_JOURNAL', stats: [{ key: 'solved', operator: '=', value: 1 }] },
      ],
      changes: [],
      sideEffects: [
        { type: 'narrative', payload: { text: '📖 The journal describes the lens in technical detail — not optics, but music theory. The keeper was maintaining a harmony. The prism fragments are tuning forks for consciousness. Without them, the voices in the signal scatter into static.' } },
      ],
      priority: 10,
      description: 'Examine unlocked journal',
    },

    {
      id: 'examine_brass_key',
      trigger: { id: 'ITEM_BRASS_KEY' },
      conditions: [],
      changes: [],
      sideEffects: [
        { type: 'narrative', payload: { text: '🔑 A heavy brass key. The bow is shaped like a lighthouse. Engraved: REMEMBER.' } },
      ],
      description: 'Examine brass key',
    },

    // ════════════════════════════════════════════════════════════════════════
    // TAKE / DROP RULES
    // ════════════════════════════════════════════════════════════════════════

    {
      id: 'take_item',
      trigger: {
        id: '*',
        tags: [
          { tag: 'item', negated: false },
          { tag: 'in_room', negated: false },
        ],
      },
      conditions: [],
      changes: [
        {
          target: '$',
          operations: [
            { type: 'removeTag', tag: 'in_room' },
            { type: 'addTag', tag: 'in_inventory' },
            { type: 'setLink', key: 'location', targetId: 'PLAYER' },
          ],
        },
        {
          target: 'PLAYER',
          operations: [
            { type: 'incrementStat', key: 'inventory_size', amount: 1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '✋ Taken.' } },
      ],
      description: 'Take item from room',
    },

    {
      id: 'drop_item',
      trigger: {
        id: '*',
        tags: [
          { tag: 'item', negated: false },
          { tag: 'in_inventory', negated: false },
        ],
      },
      conditions: [],
      changes: [
        {
          target: '$',
          operations: [
            { type: 'removeTag', tag: 'in_inventory' },
            { type: 'addTag', tag: 'in_room' },
          ],
        },
        {
          target: 'PLAYER',
          operations: [
            { type: 'incrementStat', key: 'inventory_size', amount: -1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '📦 Dropped.' } },
      ],
      description: 'Drop item from inventory',
    },

    // ════════════════════════════════════════════════════════════════════════
    // TALK TO NPC RULES
    // ════════════════════════════════════════════════════════════════════════

    {
      id: 'talk_to_keeper',
      trigger: { id: 'NPC_KEEPER', tags: [{ tag: 'npc', negated: false }] },
      conditions: [
        { id: 'PLAYER', links: [{ key: 'location', targetId: 'ROOM_LANTERN_ROOM', negated: false }] },
      ],
      changes: [
        { target: 'NPC_KEEPER', operations: [{ type: 'setStat', key: 'talked', value: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '👻 The Keeper turns to you, light bending around his form.\n\n"You can hear it, can\'t you? The signal. I\'ve been maintaining it for... I don\'t know how long anymore. The lens needs its prisms. Three fragments, scattered when the storm took me. Find them. Restore the lens. That\'s all I ask. Then I can rest."' } },
      ],
      description: 'Talk to the Keeper',
    },

    {
      id: 'talk_to_sailor',
      trigger: { id: 'NPC_SAILOR', tags: [{ tag: 'npc', negated: false }] },
      conditions: [
        { id: 'PLAYER', links: [{ key: 'location', targetId: 'ROOM_SEA_CAVE', negated: false }] },
      ],
      changes: [
        { target: 'NPC_SAILOR', operations: [{ type: 'setStat', key: 'talked', value: 1 }] },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '⚓ The Sailor looks up from the dark water.\n\n"Don\'t bother asking when I got here. Time doesn\'t work right near the lighthouse. Fix the signal or break it, I don\'t care. Just make the tide move again."' } },
      ],
      description: 'Talk to the Stranded Sailor',
    },

    // ════════════════════════════════════════════════════════════════════════
    // USE ITEM / PUZZLE RULES
    // ════════════════════════════════════════════════════════════════════════

    // Use brass key on journal
    {
      id: 'use_key_on_journal',
      trigger: { id: 'ITEM_BRASS_KEY', tags: [{ tag: 'item', negated: false }] },
      conditions: [
        { id: 'ITEM_BRASS_KEY', tags: [{ tag: 'in_inventory', negated: false }] },
        { id: 'PLAYER', links: [{ key: 'location', targetId: 'ROOM_KEEPERS_QUARTERS', negated: false }] },
        { id: 'PUZZLE_JOURNAL', tags: [{ tag: 'locked', negated: false }] },
      ],
      changes: [
        { target: 'PUZZLE_JOURNAL', operations: [
          { type: 'removeTag', tag: 'locked' },
          { type: 'addTag', tag: 'solved' },
          { type: 'setStat', key: 'solved', value: 1 },
        ]},
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '🔓 The key turns smoothly. The journal falls open to its final pages.\n\nThe keeper wasn\'t maintaining a lighthouse. He was maintaining a harmony. The prism fragments are tuning forks for consciousness.' } },
      ],
      oneShot: true,
      priority: 20,
      description: 'Use brass key to unlock journal',
    },

    // Use prism on lens (generic — works for any prism)
    {
      id: 'use_prism_on_lens',
      trigger: {
        id: '*',
        tags: [
          { tag: 'item', negated: false },
          { tag: 'prism', negated: false },
          { tag: 'in_inventory', negated: false },
        ],
      },
      conditions: [
        { id: 'PLAYER', links: [{ key: 'location', targetId: 'ROOM_LANTERN_ROOM', negated: false }] },
        { id: 'PUZZLE_LENS', tags: [{ tag: 'locked', negated: false }] },
      ],
      changes: [
        {
          target: '$',
          operations: [
            { type: 'removeTag', tag: 'in_inventory' },
            { type: 'addTag', tag: 'placed' },
          ],
        },
        {
          target: 'PUZZLE_LENS',
          operations: [
            { type: 'incrementStat', key: 'prisms_placed', amount: 1 },
          ],
        },
        {
          target: 'OBJECTIVE_RESTORE_LENS',
          operations: [
            { type: 'incrementStat', key: 'progress', amount: 1 },
          ],
        },
        {
          target: 'PLAYER',
          operations: [
            { type: 'incrementStat', key: 'inventory_size', amount: -1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '✨ You place the prism fragment into the lens. It clicks into its socket and begins to glow. The signal shifts, becoming clearer. The lens hums a new note.' } },
      ],
      priority: 15,
      description: 'Place a prism fragment in the lens',
    },

    // ════════════════════════════════════════════════════════════════════════
    // WIN / LOSS CONDITIONS
    // ════════════════════════════════════════════════════════════════════════

    // Win: all 3 prisms placed
    {
      id: 'win_condition',
      trigger: { id: 'OBJECTIVE_RESTORE_LENS' },
      conditions: [
        { id: 'OBJECTIVE_RESTORE_LENS', stats: [{ key: 'progress', operator: '>=', value: 3 }] },
      ],
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
          target: 'PUZZLE_LENS',
          operations: [
            { type: 'removeTag', tag: 'locked' },
            { type: 'addTag', tag: 'solved' },
            { type: 'setStat', key: 'solved', value: 1 },
          ],
        },
      ],
      sideEffects: [
        { type: 'narrative', payload: { text: '\n🌟 The final prism clicks into place. The lens erupts with light — not cold, but alive.\n\nThree voices merge into one clear tone. The signal transforms from a desperate loop into a sustained chord that resonates through stone, through glass, through you.\n\nThe Keeper smiles — really smiles — and begins to fade.\n\n"Thank you. We can rest now."\n\nThe light stabilizes. The signal shifts frequency. In the cave below, the tide begins to turn at last. The Sailor\'s boat drifts free.\n\nYou stand in the lantern room as dawn breaks over Point Vael, the lens casting a beam not into fog, but into something beyond it. A signal, not for ships, but for whatever is listening in the space between the light.' } },
        { type: 'game_event', payload: { event: 'game_over', result: 'win' } },
      ],
      oneShot: true,
      description: 'Win — all prism fragments restored',
    },

    // Loss: HP <= 0 (kept for generality, though this adventure is non-combat)
    {
      id: 'lose_condition',
      trigger: { id: 'PLAYER' },
      conditions: [
        { id: 'PLAYER', stats: [{ key: 'hp', operator: '<=', value: 0 }] },
      ],
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
        { type: 'narrative', payload: { text: '\n💀 The signal overwhelms you. Your thoughts fragment, scatter, dissolve into static. The lighthouse claims another keeper.' } },
        { type: 'game_event', payload: { event: 'game_over', result: 'loss' } },
      ],
      oneShot: true,
      description: 'Loss — HP depleted',
    },
  ];

  return createRuleSet(
    'text-adventure',
    'The Keeper\'s Signal',
    rules,
    'A mysterious abandoned lighthouse text adventure.',
  );
}

// ─── Convenience Exports ─────────────────────────────────────────────────────

/**
 * Create the complete text adventure as a GeneratedGame-compatible object.
 * Can be loaded directly by adventure-builder.ts via loadGeneratedGame().
 */
export function getTextAdventureGame(): {
  name: string;
  description: string;
  entities: Array<{
    id: string;
    tags: string[];
    stats: Record<string, number>;
    links: Record<string, string>;
    meta: Record<string, unknown>;
  }>;
  rules: Array<Record<string, unknown>>;
} {
  const world = createTextAdventureWorld();
  const ruleSet = createTextAdventureRules();

  return {
    name: 'The Keeper\'s Signal',
    description: 'Investigate strange signals from an abandoned lighthouse on a cliff.',
    entities: world.all().map((e) => ({
      id: e.id,
      tags: Array.from(e.tags),
      stats: Object.fromEntries(e.stats),
      links: Object.fromEntries(e.links),
      meta: e.meta,
    })),
    rules: ruleSet.rules.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      conditions: r.conditions ?? [],
      changes: r.changes ?? [],
      sideEffects: r.sideEffects ?? [],
      priority: r.priority ?? 0,
      oneShot: r.oneShot ?? false,
      description: r.description ?? r.id,
    })),
  };
}

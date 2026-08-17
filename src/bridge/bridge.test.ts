/**
 * Bridge Integration Test
 *
 * Verifies the full flow: load game → snapshot → start session →
 * step with narrative sideEffects → verify graph commits → end session.
 */

import { AureumNarrativeBridge, NARRATIVE_COMMIT, NARRATIVE_INTERACTION } from './aureum-narrative-bridge';
import { aureumToCanonEntity, canonToAureumEntity, aureumWorldToCanon, canonToAureumWorld } from './entity-translator';
import { initNarrativeGit } from '../git/narrative-git';
import { createEntity, World } from '../engine/world';
import { createRuleSet, Rule, SideEffect } from '../engine/rules';
import { step } from '../engine/evaluator';

// ─── Test Utilities ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

// ─── Test: Entity Translation Roundtrip ──────────────────────────────────────

console.log('\n── Entity Translation ──');

const aureumEntity = createEntity('kira', {
  tags: ['character', 'player', 'active'],
  stats: { hp: 10, resolve: 8 },
  meta: { name: 'Kira Voss', description: 'Clone of Agent Zero', imageUrl: '/art/kira.png' },
});

const canonEntity = aureumToCanonEntity(aureumEntity);
assert(canonEntity.id === 'kira', 'Canon entity preserves id');
assert(canonEntity.name === 'Kira Voss', 'Canon entity has name from meta');
assert(canonEntity.type === 'character', 'Canon entity infers type from tags');
assert(canonEntity.hp === 10, 'Canon entity flattens stats');
assert(canonEntity.description === 'Clone of Agent Zero', 'Canon entity copies meta');
assert(Array.isArray(canonEntity._tags), 'Canon entity preserves _tags for roundtrip');

const roundtrip = canonToAureumEntity(canonEntity);
assert(roundtrip.id === 'kira', 'Roundtrip preserves id');
assert(roundtrip.tags.has('character'), 'Roundtrip restores tags');
assert(roundtrip.tags.has('player'), 'Roundtrip restores all tags');
assert(roundtrip.stats.get('hp') === 10, 'Roundtrip restores stats');
assert((roundtrip.meta.name as string) === 'Kira Voss', 'Roundtrip restores meta.name');

// ─── Test: World Translation ─────────────────────────────────────────────────

console.log('\n── World Translation ──');

const world = new World([
  createEntity('PLAYER', {
    tags: ['player'],
    stats: { hp: 10, actions: 3 },
    meta: { name: 'Player' },
  }),
  createEntity('enemy_sentinel', {
    tags: ['enemy', 'active'],
    stats: { hp: 8, damage: 2 },
    links: { location: 'data_vault' },
    meta: { name: 'Sentinel-7' },
  }),
  createEntity('data_vault', {
    tags: ['location'],
    meta: { name: 'Data Vault', description: 'A dark corridor of servers' },
  }),
]);

const { entities, relationships } = aureumWorldToCanon(world);
assert(entities.length === 3, `World snapshot has 3 entities (got ${entities.length})`);
assert(relationships.length === 1, `World snapshot has 1 relationship from link (got ${relationships.length})`);
assert(relationships[0].source === 'enemy_sentinel', 'Relationship source is correct');
assert(relationships[0].target === 'data_vault', 'Relationship target is correct');
assert(relationships[0].type === 'location', 'Relationship type is link key');

const restoredWorld = canonToAureumWorld(entities, relationships);
assert(restoredWorld.all().length === 3, 'Restored world has 3 entities');
const restoredEnemy = restoredWorld.get('enemy_sentinel');
assert(restoredEnemy !== undefined, 'Restored world has enemy_sentinel');
assert(restoredEnemy!.links.get('location') === 'data_vault', 'Restored enemy has link');

// ─── Test: Bridge — Narrative Commit SideEffect ──────────────────────────────

console.log('\n── Bridge: Narrative Commits ──');

const git = initNarrativeGit({ author: 'test' });
const bridge = new AureumNarrativeBridge(git);

// Build a game with a rule that emits narrative_commit
const gameWorld = new World([
  createEntity('GAME', { tags: ['game_state', 'active'], stats: { round: 1, tracker: 0 } }),
  createEntity('PLAYER', { tags: ['player'], stats: { hp: 10, actions: 3 } }),
  createEntity('card_firewall', {
    tags: ['card', 'attack', 'in_hand'],
    stats: { damage: 3 },
    meta: { name: 'Firewall Protocol' },
  }),
]);

const narrativeRule: Rule = {
  id: 'play_firewall',
  trigger: { id: 'card_firewall', tags: [{ tag: 'in_hand', negated: false }] },
  conditions: [],
  changes: [
    { target: '$', operations: [{ type: 'removeTag', tag: 'in_hand' }] },
    { target: 'GAME', operations: [{ type: 'incrementStat', key: 'tracker', amount: 1 }] },
  ],
  sideEffects: [
    {
      type: NARRATIVE_COMMIT,
      payload: {
        message: 'Firewall Protocol deployed',
        operations: [
          {
            id: `update_player_${Date.now()}`,
            type: 'UPDATE_ENTITY',
            timestamp: Date.now(),
            payload: { entityId: 'PLAYER', changes: { status: 'defending' } },
          },
        ],
        tags: ['combat'],
      } as any,
    },
    {
      type: NARRATIVE_INTERACTION,
      payload: {
        type: 'combat',
        participants: ['PLAYER', 'enemy_sentinel'],
        visual_beat: 'A glowing blue firewall erupts from the player\'s palms',
        emotional_tone: 'tense',
        narrative_weight: 'minor',
        key_dialogue: 'Firewall engaged. Hold the line.',
      } as any,
    },
  ],
};

const ruleSet = createRuleSet('test', 'Test Game', [narrativeRule]);

// Step the card through the engine
const stepResult = step('card_firewall', gameWorld, ruleSet);
assert(stepResult.match !== null, 'Rule fired on card step');
assert(stepResult.sideEffects.length === 2, `Got 2 side effects (got ${stepResult.sideEffects.length})`);

// Process through the bridge
const bridgeResult = await bridge.processStepResult(stepResult);
assert(bridgeResult.commits.length === 2, `Made 2 commits (got ${bridgeResult.commits.length})`);
assert(bridgeResult.commits[0].message === 'Firewall Protocol deployed', 'First commit is narrative');
assert(bridgeResult.gameOver === null, 'Game is not over');

// Verify graph state
const graphState = git.export();
// Note: UPDATE_ENTITY doesn't create entities — only the interaction was committed via ADD_INTERACTION
assert(graphState.interactions.length >= 1, `Graph has interactions from narrative commit (got ${graphState.interactions.length})`);
assert(graphState.interactions.length >= 1, `Graph has interactions (got ${graphState.interactions.length})`);

// ─── Test: Game Session Lifecycle ────────────────────────────────────────────

console.log('\n── Game Session Lifecycle ──');

const git2 = initNarrativeGit({ author: 'test' });
const bridge2 = new AureumNarrativeBridge(git2);

// Start session
const session = await bridge2.startSession({
  gameName: 'reality-protocol',
  autoCommitStateChanges: false,
});
assert(session.id.length > 0, `Session created with id: ${session.id}`);
assert(session.branch.startsWith('game/reality-protocol/'), 'Session branch has correct prefix');
assert(session.round === 0, 'Session starts at round 0');

// Check active session
const active = bridge2.getActiveSession();
assert(active !== null, 'Active session exists');
assert(active!.gameName === 'reality-protocol', 'Active session has correct game name');

// Advance rounds
const r1 = bridge2.advanceRound();
assert(r1 === 1, 'Advanced to round 1');
const r2 = bridge2.advanceRound();
assert(r2 === 2, 'Advanced to round 2');

// End session
const endResult = await bridge2.endSession({
  outcome: 'win',
  message: 'Victory after 2 rounds',
});
assert(endResult.rounds === 2, 'Session ended with 2 rounds');
assert(endResult.merged === false, 'Session not merged by default');
assert(bridge2.getActiveSession() === null, 'No active session after end');

// ─── Test: World Snapshot ────────────────────────────────────────────────────

console.log('\n── World Snapshot ──');

const git3 = initNarrativeGit({ author: 'test' });
const bridge3 = new AureumNarrativeBridge(git3);

const testWorld = new World([
  createEntity('hero', {
    tags: ['character', 'player'],
    stats: { hp: 20, mana: 15 },
    meta: { name: 'The Hero' },
  }),
  createEntity('tavern', {
    tags: ['location'],
    meta: { name: 'The Rusty Anchor', description: 'A dimly lit tavern' },
  }),
]);

const snapshotId = await bridge3.snapshotWorld(testWorld, 'Initial world state');
assert(typeof snapshotId === 'string' && snapshotId.length > 0, `Snapshot committed: ${snapshotId}`);

const snapshot = git3.export();
assert(snapshot.entities.length === 2, `Snapshot has 2 entities (got ${snapshot.entities.length})`);
assert(snapshot.entities.some(e => e.name === 'The Hero'), 'Snapshot contains The Hero');
assert(snapshot.entities.some(e => e.name === 'The Rusty Anchor'), 'Snapshot contains The Rusty Anchor');

// ─── Test: Initialize World from Graph ───────────────────────────────────────

console.log('\n── Init World from Graph ──');

const restoredFromGraph = bridge3.initializeWorldFromGraph();
assert(restoredFromGraph.all().length === 2, `Restored 2 entities from graph (got ${restoredFromGraph.all().length})`);

const hero = restoredFromGraph.get('hero');
assert(hero !== undefined, 'Hero entity restored');
assert(hero!.stats.get('hp') === 20, 'Hero HP restored');
assert(hero!.stats.get('mana') === 15, 'Hero mana restored');

// Test with type filter
const onlyLocations = bridge3.initializeWorldFromGraph({ entityTypes: ['location'] });
assert(onlyLocations.all().length === 1, `Filtered to 1 location (got ${onlyLocations.all().length})`);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`);
process.exit(failed > 0 ? 1 : 0);

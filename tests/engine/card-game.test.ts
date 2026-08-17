import {
  createCardGameWorld,
  createCardGameRules,
  createGameSession,
  runSyncPhase,
  playAction,
  runThreatPhase,
  runParadoxPhase,
  getAvailableActions,
  getGameState,
  PHASE,
} from '../../src/engine/templates/card-game';
import { step } from '../../src/engine/evaluator';

describe('Card Game Template', () => {
  // ─── World Setup ──────────────────────────────────────────────────────────

  describe('createCardGameWorld', () => {
    it('creates a valid game world with all required entities', () => {
      const world = createCardGameWorld();

      // Core entities exist
      expect(world.has('GAME')).toBe(true);
      expect(world.has('PLAYER')).toBe(true);
      expect(world.has('OBJ_HACK_VAULT')).toBe(true);

      // 4 locations
      expect(world.has('COMMS_HUB')).toBe(true);
      expect(world.has('DATA_VAULT')).toBe(true);
      expect(world.has('SERVER_ROOM')).toBe(true);
      expect(world.has('SAFE_HOUSE')).toBe(true);

      // 8 player cards
      const cards = world.all().filter((e) => e.tags.has('card'));
      expect(cards.length).toBe(8);

      // 2 enemies
      expect(world.has('SENTINEL_1')).toBe(true);
      expect(world.has('DRONE_1')).toBe(true);

      // 6 threat cards
      const threats = world.all().filter((e) => e.tags.has('threat_card'));
      expect(threats.length).toBe(6);
    });
  });

  // ─── Sync Phase ───────────────────────────────────────────────────────────

  describe('Sync Phase', () => {
    it('increments Control Index, gives SE, resets actions', () => {
      const session = createGameSession();
      const result = runSyncPhase(session);

      expect(result.match).not.toBeNull();
      expect(result.match!.rule.id).toBe('sync_phase');

      const game = session.world.get('GAME')!;
      expect(game.stats.get('control_index')).toBe(11);
      expect(game.stats.get('phase')).toBe(PHASE.ACTION);

      const player = session.world.get('PLAYER')!;
      expect(player.stats.get('se')).toBe(2);  // 1 start + 1 gained
      expect(player.stats.get('actions_remaining')).toBe(3);
    });
  });

  // ─── Card Plays ───────────────────────────────────────────────────────────

  describe('Card plays', () => {
    it('Thread the Weave shifts Loom and costs SE + action', () => {
      const session = createGameSession();
      runSyncPhase(session);  // Get to Action phase, SE=2

      const result = playAction(session, 'CARD_THREAD_WEAVE');
      expect(result.match!.rule.id).toBe('play_thread_weave');

      // Card moved to discard
      const card = session.world.get('CARD_THREAD_WEAVE')!;
      expect(card.tags.has('in_hand')).toBe(false);
      expect(card.tags.has('in_discard')).toBe(true);

      // Loom shifted
      expect(session.world.get('GAME')!.stats.get('loom_balance')).toBe(55);

      // SE and actions consumed
      const player = session.world.get('PLAYER')!;
      expect(player.stats.get('se')).toBe(0);  // 2 - 2
      expect(player.stats.get('actions_remaining')).toBe(2);
    });

    it('Mind Bridge restores resolve', () => {
      const session = createGameSession();
      session.world.get('PLAYER')!.stats.set('resolve', 5);
      runSyncPhase(session);

      const result = playAction(session, 'CARD_MIND_BRIDGE');
      expect(result.match!.rule.id).toBe('play_mind_bridge');

      expect(session.world.get('PLAYER')!.stats.get('resolve')).toBe(8);  // 5 + 3
    });

    it('Hack Node advances objective progress', () => {
      const session = createGameSession();
      runSyncPhase(session);

      const result = playAction(session, 'CARD_HACK_NODE');
      expect(result.match!.rule.id).toBe('play_hack_node');

      expect(session.world.get('OBJ_HACK_VAULT')!.stats.get('progress')).toBe(1);
    });

    it('Sigil of Protection goes to in_play (not discard)', () => {
      const session = createGameSession();
      runSyncPhase(session);

      playAction(session, 'CARD_SIGIL_PROTECTION');

      const card = session.world.get('CARD_SIGIL_PROTECTION')!;
      expect(card.tags.has('in_play')).toBe(true);
      expect(card.tags.has('in_discard')).toBe(false);
    });

    it('card cannot be played twice', () => {
      const session = createGameSession();
      runSyncPhase(session);

      playAction(session, 'CARD_HACK_NODE');  // SE=1, costs 1
      session.world.get('PLAYER')!.stats.set('se', 5);  // Give more SE

      const second = playAction(session, 'CARD_HACK_NODE');
      expect(second.match).toBeNull();
    });
  });

  // ─── Threat Phase (Self-Playing) ──────────────────────────────────────────

  describe('Threat Phase', () => {
    it('enemies at player location deal damage', () => {
      const session = createGameSession();

      // Move sentinel to player\'s location
      session.world.get('SENTINEL_1')!.links.set('location', 'COMMS_HUB');
      session.world.get('GAME')!.stats.set('phase', PHASE.THREAT);

      const hpBefore = session.world.get('PLAYER')!.stats.get('hp')!;
      const narratives = runThreatPhase(session);

      const hpAfter = session.world.get('PLAYER')!.stats.get('hp')!;
      expect(hpAfter).toBeLessThan(hpBefore);
      expect(narratives.some((n) => n.includes('attacks'))).toBe(true);
    });

    it('drone at player location boosts CI via surveillance', () => {
      const session = createGameSession();

      session.world.get('DRONE_1')!.links.set('location', 'COMMS_HUB');
      session.world.get('GAME')!.stats.set('phase', PHASE.THREAT);

      const ciBefore = session.world.get('GAME')!.stats.get('control_index')!;
      runThreatPhase(session);

      const ciAfter = session.world.get('GAME')!.stats.get('control_index')!;
      expect(ciAfter).toBeGreaterThan(ciBefore);
    });

    it('enemies patrol toward player', () => {
      const session = createGameSession();
      session.world.get('GAME')!.stats.set('phase', PHASE.THREAT);

      // Sentinel at DATA_VAULT, player at COMMS_HUB
      const sentinelLocBefore = session.world.get('SENTINEL_1')!.links.get('location');
      expect(sentinelLocBefore).toBe('DATA_VAULT');

      runThreatPhase(session);

      // Should have moved one step toward player
      const sentinelLocAfter = session.world.get('SENTINEL_1')!.links.get('location');
      expect(sentinelLocAfter).toBe('COMMS_HUB');  // Position 1 → 0
    });

    it('draws threat card and boosts CI', () => {
      const session = createGameSession();
      session.world.get('GAME')!.stats.set('phase', PHASE.THREAT);

      const ciBefore = session.world.get('GAME')!.stats.get('control_index')!;
      const narratives = runThreatPhase(session);

      const ciAfter = session.world.get('GAME')!.stats.get('control_index')!;
      expect(ciAfter).toBeGreaterThan(ciBefore);
      expect(narratives.some((n) => n.includes('Threat:'))).toBe(true);
    });

    it('Sigil of Protection reduces incoming damage', () => {
      const session = createGameSession();

      // Activate sigil
      session.world.get('CARD_SIGIL_PROTECTION')!.tags.delete('in_hand');
      session.world.get('CARD_SIGIL_PROTECTION')!.tags.add('in_play');

      // Put sentinel (dmg=2) at player location
      session.world.get('SENTINEL_1')!.links.set('location', 'COMMS_HUB');
      session.world.get('GAME')!.stats.set('phase', PHASE.THREAT);

      runThreatPhase(session);

      // Should take 1 damage instead of 2 (reduced by 1)
      const hp = session.world.get('PLAYER')!.stats.get('hp')!;
      expect(hp).toBe(9);  // 10 - (2-1)
    });

    it('Loom Anchor prevents loom decay', () => {
      const session = createGameSession();

      session.world.get('CARD_LOOM_ANCHOR')!.tags.delete('in_hand');
      session.world.get('CARD_LOOM_ANCHOR')!.tags.add('in_play');
      session.world.get('GAME')!.stats.set('phase', PHASE.THREAT);
      session.world.get('GAME')!.stats.set('loom_balance', 60);

      runThreatPhase(session);

      // Loom should not have decayed from natural decay
      // (may still shift from threat cards though)
      const loom = session.world.get('GAME')!.stats.get('loom_balance')!;
      // First threat card is "Surveillance Sweep" (no loom shift), so should stay at 60
      expect(loom).toBe(60);
    });
  });

  // ─── Win/Loss Conditions ──────────────────────────────────────────────────

  describe('Win/Loss conditions', () => {
    it('loss triggers when Control Index >= 100', () => {
      const session = createGameSession();
      session.world.get('GAME')!.stats.set('control_index', 100);
      session.world.get('GAME')!.stats.set('phase', PHASE.PARADOX);

      runParadoxPhase(session);

      expect(session.gameOver).toBe(true);
      expect(session.result).toBe('loss');
    });

    it('loss triggers when HP <= 0', () => {
      const session = createGameSession();
      session.world.get('PLAYER')!.stats.set('hp', 0);
      session.world.get('GAME')!.stats.set('phase', PHASE.PARADOX);

      runParadoxPhase(session);

      expect(session.gameOver).toBe(true);
      expect(session.result).toBe('loss');
    });

    it('loss triggers when Resolve <= 0', () => {
      const session = createGameSession();
      session.world.get('PLAYER')!.stats.set('resolve', 0);
      session.world.get('GAME')!.stats.set('phase', PHASE.PARADOX);

      runParadoxPhase(session);

      expect(session.gameOver).toBe(true);
      expect(session.result).toBe('loss');
    });

    it('win triggers when objective progress >= required', () => {
      const session = createGameSession();
      session.world.get('OBJ_HACK_VAULT')!.stats.set('progress', 5);
      session.world.get('GAME')!.stats.set('phase', PHASE.PARADOX);

      runParadoxPhase(session);

      expect(session.gameOver).toBe(true);
      expect(session.result).toBe('win');
    });
  });

  // ─── Full Round ───────────────────────────────────────────────────────────

  describe('Full round loop', () => {
    it('completes a full round without crashing', () => {
      const session = createGameSession();

      // Sync
      runSyncPhase(session);
      expect(session.world.get('GAME')!.stats.get('phase')).toBe(PHASE.ACTION);

      // Play a card
      playAction(session, 'CARD_HACK_NODE');
      expect(session.world.get('OBJ_HACK_VAULT')!.stats.get('progress')).toBe(1);

      // Set to threat phase (normally happens when actions run out)
      session.world.get('GAME')!.stats.set('phase', PHASE.THREAT);

      // Threat
      const threatNarratives = runThreatPhase(session);
      expect(threatNarratives.length).toBeGreaterThan(0);
      expect(session.world.get('GAME')!.stats.get('phase')).toBe(PHASE.PARADOX);

      // Paradox
      const paradoxNarratives = runParadoxPhase(session);
      expect(paradoxNarratives.length).toBeGreaterThan(0);

      // Should be round 2 now
      expect(session.world.get('GAME')!.stats.get('round')).toBe(2);
    });
  });

  // ─── Game State API ───────────────────────────────────────────────────────

  describe('Game state API', () => {
    it('getGameState returns complete state snapshot', () => {
      const session = createGameSession();
      const state = getGameState(session);

      expect(state.round).toBe(1);
      expect(state.phase).toBe('Sync');
      expect(state.controlIndex).toBe(10);
      expect(state.loomBalance).toBe(50);
      expect(state.playerHp).toBe(10);
      expect(state.playerResolve).toBe(10);
      expect(state.playerSe).toBe(1);
      expect(state.locationName).toBe('Comms Hub');
      expect(state.objectiveProgress).toBe(0);
      expect(state.objectiveRequired).toBe(5);
      expect(state.activeEnemies.length).toBe(2);
    });

    it('getAvailableActions lists cards and moves', () => {
      const session = createGameSession();
      runSyncPhase(session);

      const actions = getAvailableActions(session);

      // 8 cards + 3 move options (4 locations minus current)
      const cards = actions.filter((a) => a.type === 'card');
      const moves = actions.filter((a) => a.type === 'move');

      expect(cards.length).toBe(8);
      expect(moves.length).toBe(3);
    });
  });

  // ─── Session Logging ──────────────────────────────────────────────────────

  describe('Session logging', () => {
    it('logs actions with narratives', () => {
      const session = createGameSession();
      runSyncPhase(session);
      playAction(session, 'CARD_HACK_NODE');

      expect(session.log.length).toBe(2);
      expect(session.log[0].action).toContain('Sync');
      expect(session.log[1].action).toContain('Hack Node');
    });
  });
});

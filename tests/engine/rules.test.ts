import { World, createEntity } from '../../src/engine/world';
import { Rule, createRuleSet, calculateSpecificity } from '../../src/engine/rules';
import { evaluate, evaluateAll, step } from '../../src/engine/evaluator';

describe('Rules & Evaluator', () => {
  // ─── Cave/Goblin Scenario ──────────────────────────────────────────────────
  // Reproduces the example from the ArgOS DSL / ENE documentation

  let world: World;
  let rules: Rule[];

  beforeEach(() => {
    world = new World([
      createEntity('CAVE_ENTRANCE', { tags: ['location'] }),
      createEntity('CAVE', { tags: ['location', 'dark'] }),
      createEntity('GOBLIN', {
        tags: ['character', 'sleeping'],
        stats: { strength: 3 },
        links: { location: 'CAVE' },
      }),
      createEntity('PLAYER', {
        tags: ['character'],
        stats: { fear: 0, treasure_hunt_plot: 1 },
        links: { location: 'CAVE_ENTRANCE' },
      }),
      createEntity('LIGHTER', {
        tags: ['item'],
        stats: { illumination: 2 },
        links: { location: 'PLAYER' },
      }),
      createEntity('TORCH', {
        tags: ['item'],
        stats: { illumination: 7 },
        links: { location: 'CAVE_ENTRANCE' },
      }),
      createEntity('BAG_OF_GOLD', {
        tags: ['item', 'quest_item'],
        links: { location: 'CAVE', guarded_by: 'GOBLIN' },
      }),
    ]);

    rules = [
      // Rule 1: Cave is too dark to enter (generic)
      {
        id: 'cave_too_dark',
        trigger: { id: 'CAVE' },
        sideEffects: [
          {
            type: 'narrative',
            payload: { text: "The cave is pitch black. You can't see enough to enter." },
          },
        ],
        description: 'Cave is too dark to enter',
      },
      // Rule 2: Enter cave if player has illumination > 5 and cave not explored
      {
        id: 'enter_cave',
        trigger: {
          id: 'CAVE',
          tags: [{ tag: 'explored', negated: true }],
        },
        conditions: [
          {
            id: '*',
            tags: [{ tag: 'item', negated: false }],
            links: [{ key: 'location', targetId: 'PLAYER', negated: false }],
            stats: [{ key: 'illumination', operator: '>' as const, value: 5 }],
          },
        ],
        changes: [
          {
            target: 'PLAYER',
            operations: [
              { type: 'setLink' as const, key: 'location', targetId: 'CAVE' },
              { type: 'incrementStat' as const, key: 'fear', amount: 2 },
            ],
          },
          {
            target: 'CAVE',
            operations: [{ type: 'addTag' as const, tag: 'explored' }],
          },
        ],
        sideEffects: [
          {
            type: 'narrative',
            payload: {
              text: 'You can see a short ways into the cave, and bravely enter. You hear an awful snoring sound...',
            },
          },
        ],
      },
      // Rule 3: Wake the goblin
      {
        id: 'wake_goblin',
        trigger: {
          id: 'GOBLIN',
          tags: [{ tag: 'sleeping', negated: false }],
        },
        changes: [
          {
            target: 'GOBLIN',
            operations: [{ type: 'removeTag' as const, tag: 'sleeping' }],
          },
          {
            target: 'PLAYER',
            operations: [{ type: 'setStat' as const, key: 'fear', value: 9 }],
          },
        ],
        sideEffects: [
          {
            type: 'narrative',
            payload: {
              text: "There's an old saying, \"Let sleeping dogs lie.\" That applies double when it comes to goblins. Too late...",
            },
          },
        ],
      },
      // Rule 4: Generic movement (low specificity)
      {
        id: 'generic_move',
        trigger: {
          id: '*',
          tags: [{ tag: 'location', negated: false }],
        },
        changes: [
          {
            target: 'PLAYER',
            operations: [{ type: 'setLink' as const, key: 'location', targetId: '$' }],
          },
        ],
      },
      // Rule 5: Generic pick up items
      {
        id: 'generic_pickup',
        trigger: {
          id: '*',
          tags: [{ tag: 'item', negated: false }],
          links: [{ key: 'location', targetId: 'PLAYER', negated: true }],
        },
        changes: [
          {
            target: '$',
            operations: [{ type: 'setLink' as const, key: 'location', targetId: 'PLAYER' }],
          },
        ],
        sideEffects: [
          { type: 'narrative', payload: { text: 'This might be useful.' } },
        ],
      },
    ];
  });

  // ─── Specificity ───────────────────────────────────────────────────────────

  describe('calculateSpecificity', () => {
    it('more specific rules have higher scores', () => {
      const generic = calculateSpecificity(rules[0]); // just CAVE id
      const specific = calculateSpecificity(rules[1]); // CAVE + !explored + condition
      expect(specific).toBeGreaterThan(generic);
    });
  });

  // ─── Evaluation ────────────────────────────────────────────────────────────

  describe('evaluate', () => {
    it('matches cave_too_dark when no illumination available', () => {
      // Player only has lighter (illumination=2)
      const ruleSet = createRuleSet('test', 'test', rules);
      const match = evaluate('CAVE', world, ruleSet);
      expect(match).not.toBeNull();
      // cave_too_dark should NOT match because enter_cave is more specific
      // BUT enter_cave requires illumination > 5 from player inventory
      // Player has lighter(2) — not enough. The only matching cave rule is cave_too_dark
      expect(match!.rule.id).toBe('cave_too_dark');
    });
  });

  describe('evaluateAll', () => {
    it('returns all matching rules ranked by specificity', () => {
      const ruleSet = createRuleSet('test', 'test', rules);
      // CAVE_ENTRANCE matches generic_move
      const matches = evaluateAll('CAVE_ENTRANCE', world, ruleSet);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].rule.id).toBe('generic_move');
    });
  });

  // ─── Stepping ──────────────────────────────────────────────────────────────

  describe('step', () => {
    it('picks up torch — $ reference resolves correctly', () => {
      const ruleSet = createRuleSet('test', 'test', rules);
      const result = step('TORCH', world, ruleSet);

      expect(result.match).not.toBeNull();
      expect(result.match!.rule.id).toBe('generic_pickup');

      // Torch should now be in player inventory
      const torch = result.world.get('TORCH')!;
      expect(torch.links.get('location')).toBe('PLAYER');

      // Narrative side effect
      expect(result.sideEffects).toEqual([
        { type: 'narrative', payload: { text: 'This might be useful.' } },
      ]);
    });

    it('enter cave after picking up torch', () => {
      const ruleSet = createRuleSet('test', 'test', rules);

      // Step 1: Pick up torch
      const afterPickup = step('TORCH', world, ruleSet);
      expect(afterPickup.match!.rule.id).toBe('generic_pickup');

      // Step 2: Enter cave — now player has torch (illumination=7 > 5)
      const afterEnter = step('CAVE', afterPickup.world, ruleSet);
      expect(afterEnter.match).not.toBeNull();
      expect(afterEnter.match!.rule.id).toBe('enter_cave');

      // Player should be in cave with fear=2
      const player = afterEnter.world.get('PLAYER')!;
      expect(player.links.get('location')).toBe('CAVE');
      expect(player.stats.get('fear')).toBe(2);

      // Cave should be explored
      const cave = afterEnter.world.get('CAVE')!;
      expect(cave.tags.has('explored')).toBe(true);
    });

    it('wake the goblin', () => {
      const ruleSet = createRuleSet('test', 'test', rules);
      const result = step('GOBLIN', world, ruleSet);

      expect(result.match!.rule.id).toBe('wake_goblin');

      // Goblin no longer sleeping
      const goblin = result.world.get('GOBLIN')!;
      expect(goblin.tags.has('sleeping')).toBe(false);

      // Player fear = 9
      const player = result.world.get('PLAYER')!;
      expect(player.stats.get('fear')).toBe(9);
    });

    it('does not mutate the original world', () => {
      const ruleSet = createRuleSet('test', 'test', rules);
      step('GOBLIN', world, ruleSet);

      // Original world unchanged
      const goblin = world.get('GOBLIN')!;
      expect(goblin.tags.has('sleeping')).toBe(true);
    });

    it('returns null match when no rule matches', () => {
      const ruleSet = createRuleSet('test', 'test', rules);
      const result = step('NONEXISTENT', world, ruleSet);
      expect(result.match).toBeNull();
    });
  });

  // ─── One-Shot Rules ────────────────────────────────────────────────────────

  describe('one-shot rules', () => {
    it('rule fires only once when oneShot is true', () => {
      const oneShotRules: Rule[] = [
        {
          id: 'one_shot_discovery',
          trigger: { id: 'CAVE' },
          oneShot: true,
          sideEffects: [
            { type: 'narrative', payload: { text: 'You discover something remarkable!' } },
          ],
        },
      ];

      const ruleSet = createRuleSet('test', 'test', oneShotRules);

      // First evaluation: matches
      const first = step('CAVE', world, ruleSet);
      expect(first.match).not.toBeNull();

      // Second evaluation: spent
      const second = step('CAVE', world, ruleSet);
      expect(second.match).toBeNull();
    });
  });

  // ─── Full Cave Walkthrough ─────────────────────────────────────────────────

  describe('full cave walkthrough', () => {
    it('player picks up torch, enters cave, wakes goblin', () => {
      const ruleSet = createRuleSet('test', 'test', rules);
      const narratives: string[] = [];

      // 1. Pick up torch
      const s1 = step('TORCH', world, ruleSet);
      for (const se of s1.sideEffects) {
        if (se.type === 'narrative') narratives.push(se.payload.text as string);
      }

      // 2. Enter cave
      const s2 = step('CAVE', s1.world, ruleSet);
      for (const se of s2.sideEffects) {
        if (se.type === 'narrative') narratives.push(se.payload.text as string);
      }

      // 3. Wake goblin
      const s3 = step('GOBLIN', s2.world, ruleSet);
      for (const se of s3.sideEffects) {
        if (se.type === 'narrative') narratives.push(se.payload.text as string);
      }

      // Verify final state
      const player = s3.world.get('PLAYER')!;
      expect(player.links.get('location')).toBe('CAVE');
      expect(player.stats.get('fear')).toBe(9);

      const goblin = s3.world.get('GOBLIN')!;
      expect(goblin.tags.has('sleeping')).toBe(false);

      const torch = s3.world.get('TORCH')!;
      expect(torch.links.get('location')).toBe('PLAYER');

      // Check narrative trail
      expect(narratives).toEqual([
        'This might be useful.',
        'You can see a short ways into the cave, and bravely enter. You hear an awful snoring sound...',
        "There's an old saying, \"Let sleeping dogs lie.\" That applies double when it comes to goblins. Too late...",
      ]);
    });
  });
});

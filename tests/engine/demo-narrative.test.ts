/**
 * Aureum Rules Engine — Narrative Simulation Demo
 *
 * Models a character-driven drama scene using only entities + rules.
 * No game mechanics — just characters with emotional states, relationships,
 * locations, and narrative beats driven by world state.
 *
 * Scenario: "The Defection"
 *   Maya, a senior Oneirocom engineer, discovers what the corporation
 *   is really doing. Kai, a resistance operative, must convince her
 *   to defect before her handler Orin realizes what's happening.
 */

import { createEntity, World } from '../../src/engine/world';
import { Rule, createRuleSet } from '../../src/engine/rules';
import { step, evaluate, evaluateAll, StepResult } from '../../src/engine/evaluator';
import { toJSON, fromJSON } from '../../src/engine/serializer';

describe('Narrative Simulation Demo', () => {
  function createNarrativeWorld(): World {
    return new World([
      // ── Characters ──────────────────────────────────────────────────────

      createEntity('MAYA', {
        tags: ['character', 'oneirocom_employee', 'engineer', 'conflicted'],
        stats: {
          trust_kai: 0,       // -10 to 10
          loyalty_oneirocom: 7,
          fear: 3,
          resolve: 5,
          suspicion: 0,       // how suspicious Orin is of her
        },
        links: { location: 'CAFE', relationship_orin: 'ORIN' },
        meta: {
          name: 'Maya Chen',
          role: 'Senior Consciousness Architect at Oneirocom',
          motivation: 'Designed the harvesting system. Didn\'t know what it really did.',
        },
      }),

      createEntity('KAI', {
        tags: ['character', 'resistance', 'operative'],
        stats: {
          persuasion: 6,
          cover_integrity: 8,  // how well their cover holds
          urgency: 4,
        },
        links: { location: 'CAFE', target: 'MAYA' },
        meta: {
          name: 'Kai Nakamura',
          role: 'Project 89 field operative, posing as a journalist',
        },
      }),

      createEntity('ORIN', {
        tags: ['character', 'oneirocom_security', 'handler', 'watching'],
        stats: {
          suspicion_of_maya: 0,
          response_time: 3,   // rounds before Orin acts
        },
        links: { location: 'ONEIROCOM_HQ', watching: 'MAYA' },
        meta: {
          name: 'Orin Vale',
          role: 'Maya\'s handler at Oneirocom Security Division',
        },
      }),

      // ── Locations ───────────────────────────────────────────────────────

      createEntity('CAFE', {
        tags: ['location', 'public', 'neutral'],
        stats: { surveillance_level: 2 },
        meta: { name: 'The Fold', description: 'A quiet café in the arts district. Low surveillance.' },
      }),

      createEntity('ONEIROCOM_HQ', {
        tags: ['location', 'corporate', 'hostile'],
        stats: { surveillance_level: 9 },
        meta: { name: 'Oneirocom HQ' },
      }),

      createEntity('SAFE_HOUSE', {
        tags: ['location', 'resistance', 'hidden'],
        stats: { surveillance_level: 0 },
        meta: { name: 'Resistance Safe House' },
      }),

      // ── Scene State ─────────────────────────────────────────────────────

      createEntity('SCENE', {
        tags: ['scene', 'active', 'act_1'],
        stats: { beat: 0, tension: 3 },
        meta: { title: 'The Defection' },
      }),

      // ── Key Evidence ────────────────────────────────────────────────────

      createEntity('EVIDENCE', {
        tags: ['item', 'data', 'hidden'],
        stats: {},
        links: { holder: 'KAI' },
        meta: {
          name: 'Harvesting Logs',
          description: 'Internal Oneirocom logs proving consciousness harvesting.',
        },
      }),
    ]);
  }

  function createNarrativeRules() {
    const rules: Rule[] = [
      // ── Opening Beat: Kai approaches Maya ──────────────────────────────
      {
        id: 'opening_approach',
        trigger: { id: 'SCENE', tags: [{ tag: 'act_1', negated: false }] },
        conditions: [
          { id: 'SCENE', stats: [{ key: 'beat', operator: '=', value: 0 }] },
          { id: 'KAI', tags: [{ tag: 'character', negated: false }] },
          { id: 'MAYA', tags: [{ tag: 'character', negated: false }] },
        ],
        changes: [
          { target: 'SCENE', operations: [{ type: 'incrementStat', key: 'beat', amount: 1 }] },
          { target: 'MAYA', operations: [{ type: 'incrementStat', key: 'trust_kai', amount: 1 }] },
        ],
        sideEffects: [{
          type: 'narrative',
          payload: {
            text: 'Kai slides into the booth across from Maya. "You don\'t know me," they say, "but I know what you built. And I know you didn\'t know what it was for."',
            beat: 'opening',
            emotion: 'tension',
          },
        }],
        oneShot: true,
        description: 'Opening: Kai approaches',
      },

      // ── Show Evidence: Kai reveals the logs ────────────────────────────
      {
        id: 'show_evidence',
        trigger: { id: 'EVIDENCE', tags: [{ tag: 'hidden', negated: false }] },
        conditions: [
          { id: 'SCENE', stats: [{ key: 'beat', operator: '>=', value: 1 }] },
          { id: 'MAYA', stats: [{ key: 'trust_kai', operator: '>=', value: 1 }] },
        ],
        changes: [
          { target: 'EVIDENCE', operations: [{ type: 'removeTag', tag: 'hidden' }, { type: 'addTag', tag: 'revealed' }] },
          {
            target: 'MAYA', operations: [
              { type: 'incrementStat', key: 'trust_kai', amount: 2 },
              { type: 'incrementStat', key: 'fear', amount: 3 },
              { type: 'incrementStat', key: 'loyalty_oneirocom', amount: -3 },
            ]
          },
          {
            target: 'SCENE', operations: [
              { type: 'incrementStat', key: 'tension', amount: 3 },
              { type: 'incrementStat', key: 'beat', amount: 1 },
            ]
          },
        ],
        sideEffects: [{
          type: 'narrative',
          payload: {
            text: 'Kai slides a tablet across the table. The logs scroll — consciousness signatures, harvesting quotas, storage manifests. Maya\'s hands tremble. "That\'s... that\'s my architecture," she whispers.',
            beat: 'revelation',
            emotion: 'horror',
          },
        }],
        oneShot: true,
        description: 'Reveal the harvesting logs',
      },

      // ── Maya's Conflict: trust high enough for doubt ───────────────────
      {
        id: 'maya_doubts',
        trigger: { id: 'MAYA', tags: [{ tag: 'conflicted', negated: false }] },
        conditions: [
          { id: 'MAYA', stats: [{ key: 'loyalty_oneirocom', operator: '<=', value: 4 }] },
          { id: 'MAYA', stats: [{ key: 'trust_kai', operator: '>=', value: 3 }] },
        ],
        changes: [
          { target: 'MAYA', operations: [{ type: 'removeTag', tag: 'conflicted' }, { type: 'addTag', tag: 'wavering' }] },
        ],
        sideEffects: [{
          type: 'narrative',
          payload: {
            text: '"How many?" Maya asks, her voice flat. "How many minds are in those cores?" She already knows. She designed the capacity. She just never asked what they were for.',
            beat: 'internal_conflict',
            emotion: 'guilt',
          },
        }],
        oneShot: true,
        description: 'Maya begins to waver',
      },

      // ── Orin's Suspicion Rises ─────────────────────────────────────────
      {
        id: 'orin_alerted',
        trigger: { id: 'SCENE', tags: [{ tag: 'active', negated: false }] },
        conditions: [
          { id: 'SCENE', stats: [{ key: 'tension', operator: '>=', value: 6 }] },
          { id: 'ORIN', tags: [{ tag: 'watching', negated: false }] },
        ],
        changes: [
          {
            target: 'ORIN', operations: [
              { type: 'incrementStat', key: 'suspicion_of_maya', amount: 3 },
              { type: 'removeTag', tag: 'watching' },
              { type: 'addTag', tag: 'investigating' },
            ]
          },
          { target: 'MAYA', operations: [{ type: 'incrementStat', key: 'suspicion', amount: 3 }] },
        ],
        sideEffects: [{
          type: 'narrative',
          payload: {
            text: 'Miles away, Orin Vale frowns at a monitoring dashboard. Maya\'s biometrics are spiking — fear, stress, cognitive dissonance. He reaches for his comm.',
            beat: 'rising_action',
            emotion: 'dread',
          },
        }],
        oneShot: true,
        description: 'Orin notices something wrong',
      },

      // ── The Decision: Maya defects ─────────────────────────────────────
      {
        id: 'maya_defects',
        trigger: { id: 'MAYA', tags: [{ tag: 'wavering', negated: false }] },
        conditions: [
          { id: 'MAYA', stats: [{ key: 'trust_kai', operator: '>=', value: 3 }] },
          { id: 'MAYA', stats: [{ key: 'resolve', operator: '>=', value: 3 }] },
          { id: 'EVIDENCE', tags: [{ tag: 'revealed', negated: false }] },
        ],
        changes: [
          {
            target: 'MAYA', operations: [
              { type: 'removeTag', tag: 'wavering' },
              { type: 'removeTag', tag: 'oneirocom_employee' },
              { type: 'addTag', tag: 'defector' },
              { type: 'addTag', tag: 'resistance' },
              { type: 'setStat', key: 'loyalty_oneirocom', value: 0 },
            ]
          },
          {
            target: 'SCENE', operations: [
              { type: 'removeTag', tag: 'act_1' },
              { type: 'addTag', tag: 'act_2' },
            ]
          },
        ],
        sideEffects: [{
          type: 'narrative',
          payload: {
            text: 'Maya stands. Her chair scrapes against the floor like a declaration. "I built those cages," she says. "I can take them apart." She meets Kai\'s eyes. "Where do we start?"',
            beat: 'climax',
            emotion: 'resolve',
          },
        }],
        oneShot: true,
        description: 'Maya defects to the resistance',
      },

      // ── Fail: Maya refuses (loyalty too high) ──────────────────────────
      {
        id: 'maya_refuses',
        trigger: { id: 'MAYA', tags: [{ tag: 'conflicted', negated: false }] },
        conditions: [
          { id: 'MAYA', stats: [{ key: 'loyalty_oneirocom', operator: '>=', value: 6 }] },
          { id: 'MAYA', stats: [{ key: 'fear', operator: '>=', value: 7 }] },
        ],
        changes: [
          {
            target: 'MAYA', operations: [
              { type: 'removeTag', tag: 'conflicted' },
              { type: 'addTag', tag: 'loyal' },
            ]
          },
          { target: 'KAI', operations: [{ type: 'incrementStat', key: 'cover_integrity', amount: -5 }] },
        ],
        sideEffects: [{
          type: 'narrative',
          payload: {
            text: '"I think you should leave," Maya says, pulling her coat tighter. Her eyes are wet but her voice is steel. "Before I call someone." Fear won.',
            beat: 'rejection',
            emotion: 'fear',
          },
        }],
        oneShot: true,
        description: 'Maya refuses — fear wins',
      },
    ];

    return createRuleSet('defection', 'The Defection', rules, 'Character-driven narrative simulation');
  }

  // ── Tests ────────────────────────────────────────────────────────────────

  it('runs the full defection narrative arc', () => {
    let world = createNarrativeWorld();
    const rules = createNarrativeRules();
    const narrative: string[] = [];

    // Beat 1: Kai approaches
    let result = step('SCENE', world, rules);
    expect(result.match!.rule.id).toBe('opening_approach');
    world = result.world;
    narrative.push(result.sideEffects[0].payload.text as string);

    // Beat 2: Show evidence
    result = step('EVIDENCE', world, rules);
    expect(result.match!.rule.id).toBe('show_evidence');
    world = result.world;
    narrative.push(result.sideEffects[0].payload.text as string);

    // Check Maya's emotional state shifted
    const maya = world.get('MAYA')!;
    expect(maya.stats.get('loyalty_oneirocom')).toBe(4);  // 7 - 3
    expect(maya.stats.get('trust_kai')).toBe(3);           // 0 + 1 + 2
    expect(maya.stats.get('fear')).toBe(6);                // 3 + 3

    // Beat 3: Maya wavers (loyalty <= 4, trust >= 3)
    result = step('MAYA', world, rules);
    expect(result.match!.rule.id).toBe('maya_doubts');
    world = result.world;
    narrative.push(result.sideEffects[0].payload.text as string);
    expect(world.get('MAYA')!.tags.has('wavering')).toBe(true);

    // Beat 4: Orin gets alerted (tension >= 6)
    result = step('SCENE', world, rules);
    expect(result.match!.rule.id).toBe('orin_alerted');
    world = result.world;
    narrative.push(result.sideEffects[0].payload.text as string);
    expect(world.get('ORIN')!.tags.has('investigating')).toBe(true);

    // Beat 5: Maya defects
    result = step('MAYA', world, rules);
    expect(result.match!.rule.id).toBe('maya_defects');
    world = result.world;
    narrative.push(result.sideEffects[0].payload.text as string);

    // Verify final state
    expect(world.get('MAYA')!.tags.has('defector')).toBe(true);
    expect(world.get('MAYA')!.tags.has('resistance')).toBe(true);
    expect(world.get('MAYA')!.tags.has('oneirocom_employee')).toBe(false);
    expect(world.get('SCENE')!.tags.has('act_2')).toBe(true);

    // Narrative has 5 beats
    expect(narrative.length).toBe(5);
  });

  it('side effects carry rich metadata (emotion, beat type)', () => {
    const world = createNarrativeWorld();
    const rules = createNarrativeRules();

    const result = step('SCENE', world, rules);
    expect(result.sideEffects[0].payload.beat).toBe('opening');
    expect(result.sideEffects[0].payload.emotion).toBe('tension');
  });

  it('alternative path: Maya refuses if fear is too high', () => {
    const world = createNarrativeWorld();
    const rules = createNarrativeRules();

    // Manually set state for refusal path
    world.get('MAYA')!.stats.set('fear', 7);
    world.get('MAYA')!.stats.set('loyalty_oneirocom', 6);

    const result = step('MAYA', world, rules);
    expect(result.match!.rule.id).toBe('maya_refuses');
    expect(result.world.get('MAYA')!.tags.has('loyal')).toBe(true);
    expect(result.sideEffects[0].payload.emotion).toBe('fear');
  });

  it('entire state is serializable for save/load', () => {
    const world = createNarrativeWorld();
    const rules = createNarrativeRules();

    // Run a few beats
    let w = step('SCENE', world, rules).world;
    w = step('EVIDENCE', w, rules).world;

    // Serialize
    const json = toJSON(w, rules);
    const jsonStr = JSON.stringify(json);

    // Deserialize
    const restored = fromJSON(JSON.parse(jsonStr));
    expect(restored.world.get('MAYA')!.stats.get('trust_kai')).toBe(3);
    expect(restored.world.get('EVIDENCE')!.tags.has('revealed')).toBe(true);
  });

  it('evaluateAll shows branching possibilities', () => {
    const world = createNarrativeWorld();
    const rules = createNarrativeRules();

    // Set up a state where multiple rules could fire for Maya
    world.get('MAYA')!.stats.set('loyalty_oneirocom', 6);
    world.get('MAYA')!.stats.set('trust_kai', 3);
    world.get('MAYA')!.stats.set('fear', 7);

    // maya_refuses matches (loyalty>=6, fear>=7) — maya_doubts requires loyalty<=4
    // This shows the engine evaluates all matching rules
    const matches = evaluateAll('MAYA', world, rules);
    const matchedIds = matches.map((m) => m.rule.id);

    expect(matchedIds).toContain('maya_refuses');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

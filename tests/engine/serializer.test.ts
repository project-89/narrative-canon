import { createEntity, World } from '../../src/engine/world';
import { Rule, createRuleSet } from '../../src/engine/rules';
import {
  serializeEntity,
  deserializeEntity,
  serializeWorld,
  deserializeWorld,
  serializeRuleSet,
  deserializeRuleSet,
  toJSON,
  fromJSON,
} from '../../src/engine/serializer';

describe('Serializer', () => {
  // ─── Entity Serialization ─────────────────────────────────────────────────

  describe('Entity round-trip', () => {
    it('serializes and deserializes an entity with all properties', () => {
      const entity = createEntity('GOBLIN', {
        tags: ['character', 'sleeping'],
        stats: { strength: 3, hp: 10 },
        links: { location: 'CAVE' },
        meta: { description: 'A sleeping goblin' },
      });

      const serialized = serializeEntity(entity);
      const deserialized = deserializeEntity(serialized);

      expect(deserialized.id).toBe('GOBLIN');
      expect(deserialized.tags.has('character')).toBe(true);
      expect(deserialized.tags.has('sleeping')).toBe(true);
      expect(deserialized.stats.get('strength')).toBe(3);
      expect(deserialized.stats.get('hp')).toBe(10);
      expect(deserialized.links.get('location')).toBe('CAVE');
      expect(deserialized.meta.description).toBe('A sleeping goblin');
    });

    it('serializes an empty entity', () => {
      const entity = createEntity('EMPTY');
      const serialized = serializeEntity(entity);

      expect(serialized).toEqual({
        id: 'EMPTY',
        tags: [],
        stats: {},
        links: {},
        meta: {},
      });
    });

    it('produces valid JSON with no functions', () => {
      const entity = createEntity('TEST', {
        tags: ['a'],
        stats: { x: 1 },
        links: { y: 'Z' },
      });
      const json = JSON.stringify(serializeEntity(entity));
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      // No functions anywhere in the output
      const hasFunction = JSON.stringify(parsed).includes('"function');
      expect(hasFunction).toBe(false);
    });
  });

  // ─── World Serialization ──────────────────────────────────────────────────

  describe('World round-trip', () => {
    it('serializes and deserializes a world', () => {
      const world = new World([
        createEntity('PLAYER', { tags: ['character'], stats: { hp: 10 } }),
        createEntity('CAVE', { tags: ['location', 'dark'] }),
      ]);

      const serialized = serializeWorld(world);
      const deserialized = deserializeWorld(serialized);

      expect(deserialized.size()).toBe(2);
      expect(deserialized.get('PLAYER')!.tags.has('character')).toBe(true);
      expect(deserialized.get('CAVE')!.tags.has('dark')).toBe(true);
    });

    it('serializes an empty world', () => {
      const world = new World();
      const serialized = serializeWorld(world);
      expect(serialized.entities).toEqual([]);
      const deserialized = deserializeWorld(serialized);
      expect(deserialized.size()).toBe(0);
    });
  });

  // ─── RuleSet Serialization ────────────────────────────────────────────────

  describe('RuleSet round-trip', () => {
    it('serializes and deserializes a rule set', () => {
      const rules: Rule[] = [
        {
          id: 'rule_1',
          trigger: { id: 'CAVE' },
          sideEffects: [
            { type: 'narrative', payload: { text: 'Dark cave.' } },
          ],
        },
        {
          id: 'rule_2',
          trigger: { id: '*', tags: [{ tag: 'item', negated: false }] },
          changes: [
            { target: '$', operations: [{ type: 'addTag', tag: 'found' }] },
          ],
          oneShot: true,
        },
      ];

      const ruleSet = createRuleSet('test', 'Test Rules', rules, 'A test rule set');
      ruleSet.spentRuleIds.add('rule_2');

      const serialized = serializeRuleSet(ruleSet);
      const deserialized = deserializeRuleSet(serialized);

      expect(deserialized.id).toBe('test');
      expect(deserialized.name).toBe('Test Rules');
      expect(deserialized.description).toBe('A test rule set');
      expect(deserialized.rules.length).toBe(2);
      expect(deserialized.spentRuleIds.has('rule_2')).toBe(true);
    });
  });

  // ─── Full State Round-Trip ────────────────────────────────────────────────

  describe('Full state JSON round-trip', () => {
    it('toJSON and fromJSON produce identical state', () => {
      const world = new World([
        createEntity('PLAYER', {
          tags: ['character'],
          stats: { hp: 10, fear: 0 },
          links: { location: 'CAVE_ENTRANCE' },
        }),
        createEntity('CAVE_ENTRANCE', { tags: ['location'] }),
      ]);

      const rules: Rule[] = [
        {
          id: 'move',
          trigger: { id: '*', tags: [{ tag: 'location', negated: false }] },
          changes: [
            {
              target: 'PLAYER',
              operations: [{ type: 'setLink', key: 'location', targetId: '$' }],
            },
          ],
        },
      ];

      const ruleSet = createRuleSet('main', 'Main', rules);

      const json = toJSON(world, ruleSet);
      const restored = fromJSON(json);

      expect(restored.world.size()).toBe(2);
      expect(restored.world.get('PLAYER')!.stats.get('hp')).toBe(10);
      expect(restored.ruleSet.rules.length).toBe(1);
      expect(restored.ruleSet.rules[0].id).toBe('move');
    });
  });
});

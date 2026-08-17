import { parseEntity, parseEntities, parseMatcher, parseRule, parseRules } from '../../src/engine/parser';
import { World } from '../../src/engine/world';
import { createRuleSet } from '../../src/engine/rules';
import { step } from '../../src/engine/evaluator';

describe('Parser', () => {
  // ─── Entity Parsing ─────────────────────────────────────────────────────

  describe('parseEntity', () => {
    it('parses a simple entity id', () => {
      const e = parseEntity('PLAYER');
      expect(e.id).toBe('PLAYER');
      expect(e.tags.size).toBe(0);
    });

    it('parses entity with tags', () => {
      const e = parseEntity('CAVE.location.dark');
      expect(e.id).toBe('CAVE');
      expect(e.tags.has('location')).toBe(true);
      expect(e.tags.has('dark')).toBe(true);
    });

    it('parses entity with stats', () => {
      const e = parseEntity('LIGHTER.item.illumination=2');
      expect(e.id).toBe('LIGHTER');
      expect(e.tags.has('item')).toBe(true);
      expect(e.stats.get('illumination')).toBe(2);
    });

    it('parses entity with links', () => {
      const e = parseEntity('GOBLIN.character.sleeping.location=CAVE');
      expect(e.id).toBe('GOBLIN');
      expect(e.tags.has('character')).toBe(true);
      expect(e.tags.has('sleeping')).toBe(true);
      expect(e.links.get('location')).toBe('CAVE');
    });

    it('parses multiline entity definition', () => {
      const e = parseEntity(`PLAYER
.character
.fear=0
.treasure_hunt_plot=1
.location=CAVE_ENTRANCE`);
      expect(e.id).toBe('PLAYER');
      expect(e.tags.has('character')).toBe(true);
      expect(e.stats.get('fear')).toBe(0);
      expect(e.stats.get('treasure_hunt_plot')).toBe(1);
      expect(e.links.get('location')).toBe('CAVE_ENTRANCE');
    });
  });

  describe('parseEntities', () => {
    it('parses the complete cave world from ArgOS DSL doc', () => {
      const entities = parseEntities(`
CAVE_ENTRANCE.location
CAVE.location.dark

GOBLIN.character.sleeping.location=CAVE

LIGHTER.item.illumination=2.location=PLAYER
TORCH.item.illumination=7.location=CAVE_ENTRANCE
BAG_OF_GOLD.item.quest_item.location=CAVE.guarded_by=GOBLIN
      `);

      expect(entities.length).toBe(6);

      const cave = entities.find((e) => e.id === 'CAVE')!;
      expect(cave.tags.has('dark')).toBe(true);

      const goblin = entities.find((e) => e.id === 'GOBLIN')!;
      expect(goblin.links.get('location')).toBe('CAVE');

      const torch = entities.find((e) => e.id === 'TORCH')!;
      expect(torch.stats.get('illumination')).toBe(7);
    });

    it('parses multiline entity within a block', () => {
      const entities = parseEntities(`
PLAYER
.character
.fear=0
.location=CAVE_ENTRANCE

GOBLIN.character.sleeping
      `);

      expect(entities.length).toBe(2);
      const player = entities.find((e) => e.id === 'PLAYER')!;
      expect(player.tags.has('character')).toBe(true);
      expect(player.stats.get('fear')).toBe(0);
    });
  });

  // ─── Matcher Parsing ───────────────────────────────────────────────────────

  describe('parseMatcher', () => {
    it('parses wildcard with tag', () => {
      const m = parseMatcher('*.location');
      expect(m.id).toBe('*');
      expect(m.tags).toEqual([{ tag: 'location', negated: false }]);
    });

    it('parses specific id with negated tag', () => {
      const m = parseMatcher('CAVE.!explored');
      expect(m.id).toBe('CAVE');
      expect(m.tags).toEqual([{ tag: 'explored', negated: true }]);
    });

    it('parses wildcard with tag + link + stat', () => {
      const m = parseMatcher('*.item.location=PLAYER.illumination>5');
      expect(m.id).toBe('*');
      expect(m.tags).toEqual([{ tag: 'item', negated: false }]);
      expect(m.links).toEqual([{ key: 'location', targetId: 'PLAYER', negated: false }]);
      expect(m.stats).toEqual([{ key: 'illumination', operator: '>', value: 5 }]);
    });

    it('parses wildcard with just tag and negated link', () => {
      const m = parseMatcher('*.item.!location=PLAYER');
      expect(m.id).toBe('*');
      expect(m.tags).toEqual([{ tag: 'item', negated: false }]);
      expect(m.links).toEqual([{ key: 'location', targetId: 'PLAYER', negated: true }]);
    });
  });

  // ─── Rule Parsing ──────────────────────────────────────────────────────────

  describe('parseRule', () => {
    it('parses a simple trigger-only rule', () => {
      const rule = parseRule(`
// cave is too dark to enter
trigger: CAVE
narrative: The cave is pitch black. You can't see enough to enter.
      `);
      expect(rule.trigger.id).toBe('CAVE');
      expect(rule.description).toBe('cave is too dark to enter');
      expect(rule.sideEffects).toEqual([
        { type: 'narrative', payload: { text: "The cave is pitch black. You can't see enough to enter." } },
      ]);
    });

    it('parses a rule with conditions and changes', () => {
      const rule = parseRule(`
trigger: CAVE.!explored
conditions: *.item.location=PLAYER.illumination>5
changes: PLAYER.location=CAVE.fear+2 | CAVE.explored
narrative: You can see a short ways into the cave, and bravely enter.
      `);

      expect(rule.trigger.id).toBe('CAVE');
      expect(rule.trigger.tags).toEqual([{ tag: 'explored', negated: true }]);
      expect(rule.conditions!.length).toBe(1);
      expect(rule.changes!.length).toBe(2);

      // Player changes
      const playerChange = rule.changes!.find((c) => c.target === 'PLAYER')!;
      expect(playerChange.operations).toEqual([
        { type: 'setLink', key: 'location', targetId: 'CAVE' },
        { type: 'incrementStat', key: 'fear', amount: 2 },
      ]);

      // Cave changes
      const caveChange = rule.changes!.find((c) => c.target === 'CAVE')!;
      expect(caveChange.operations).toEqual([{ type: 'addTag', tag: 'explored' }]);
    });

    it('parses a rule with removeTag and setStat', () => {
      const rule = parseRule(`
trigger: GOBLIN.sleeping
changes: GOBLIN.-sleeping | PLAYER.fear=9
narrative: Too late...
      `);

      const goblinChange = rule.changes!.find((c) => c.target === 'GOBLIN')!;
      expect(goblinChange.operations).toEqual([{ type: 'removeTag', tag: 'sleeping' }]);

      const playerChange = rule.changes!.find((c) => c.target === 'PLAYER')!;
      expect(playerChange.operations).toEqual([{ type: 'setStat', key: 'fear', value: 9 }]);
    });

    it('parses a rule with $ reference', () => {
      const rule = parseRule(`
trigger: *.item.!location=PLAYER
changes: $.location=PLAYER
narrative: This might be useful.
      `);
      expect(rule.changes![0].target).toBe('$');
    });
  });

  describe('parseRules', () => {
    it('parses multiple rules separated by blank lines', () => {
      const rules = parseRules(`
// generic movement
trigger: *.location
changes: PLAYER.location=$

// generic pickup
trigger: *.item.!location=PLAYER
changes: $.location=PLAYER
narrative: This might be useful.
      `);
      expect(rules.length).toBe(2);
      expect(rules[0].description).toBe('generic movement');
      expect(rules[1].description).toBe('generic pickup');
    });
  });

  // ─── Integration: Parse → Build World → Evaluate ────────────────────────

  describe('parsed rules evaluate correctly', () => {
    it('the full cave scenario works end-to-end from DSL text', () => {
      // Parse entities
      const entities = parseEntities(`
CAVE_ENTRANCE.location
CAVE.location.dark
GOBLIN.character.sleeping.strength=3.location=CAVE
LIGHTER.item.illumination=2.location=PLAYER
TORCH.item.illumination=7.location=CAVE_ENTRANCE
BAG_OF_GOLD.item.quest_item.location=CAVE.guarded_by=GOBLIN
      `);

      // Add player separately (multiline)
      const player = parseEntity(`PLAYER
.character
.fear=0
.treasure_hunt_plot=1
.location=CAVE_ENTRANCE`);
      entities.push(player);

      const world = new World(entities);

      // Parse rules
      const rules = parseRules(`
// cave is too dark
trigger: CAVE
narrative: The cave is pitch black.

// enter cave with light
trigger: CAVE.!explored
conditions: *.item.location=PLAYER.illumination>5
changes: PLAYER.location=CAVE.fear+2 | CAVE.explored
narrative: You bravely enter the cave.

// wake goblin
trigger: GOBLIN.sleeping
changes: GOBLIN.-sleeping | PLAYER.fear=9
narrative: Too late...

// generic movement
trigger: *.location
changes: PLAYER.location=$

// generic pickup
trigger: *.item.!location=PLAYER
changes: $.location=PLAYER
narrative: This might be useful.
      `);

      const ruleSet = createRuleSet('cave', 'Cave Adventure', rules);

      // Walkthrough
      const s1 = step('TORCH', world, ruleSet);
      expect(s1.match!.rule.description).toBe('generic pickup');
      expect(s1.world.get('TORCH')!.links.get('location')).toBe('PLAYER');

      const s2 = step('CAVE', s1.world, ruleSet);
      expect(s2.match!.rule.description).toBe('enter cave with light');
      expect(s2.world.get('PLAYER')!.links.get('location')).toBe('CAVE');

      const s3 = step('GOBLIN', s2.world, ruleSet);
      expect(s3.match!.rule.description).toBe('wake goblin');
      expect(s3.world.get('GOBLIN')!.tags.has('sleeping')).toBe(false);
      expect(s3.world.get('PLAYER')!.stats.get('fear')).toBe(9);
    });
  });
});

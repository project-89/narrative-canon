import { Entity, createEntity, World, EntityMatcher } from '../../src/engine/world';

describe('World Module', () => {
  // ─── Entity Creation ───────────────────────────────────────────────────────

  describe('createEntity', () => {
    it('creates an entity with just an id', () => {
      const e = createEntity('PLAYER');
      expect(e.id).toBe('PLAYER');
      expect(e.tags.size).toBe(0);
      expect(e.stats.size).toBe(0);
      expect(e.links.size).toBe(0);
    });

    it('creates an entity with tags, stats, and links', () => {
      const e = createEntity('GOBLIN', {
        tags: ['character', 'sleeping'],
        stats: { strength: 3 },
        links: { location: 'CAVE' },
      });
      expect(e.tags.has('character')).toBe(true);
      expect(e.tags.has('sleeping')).toBe(true);
      expect(e.stats.get('strength')).toBe(3);
      expect(e.links.get('location')).toBe('CAVE');
    });
  });

  // ─── World CRUD ────────────────────────────────────────────────────────────

  describe('World CRUD', () => {
    let world: World;

    beforeEach(() => {
      world = new World();
    });

    it('adds and retrieves entities', () => {
      const e = createEntity('PLAYER');
      world.add(e);
      expect(world.get('PLAYER')).toBe(e);
      expect(world.has('PLAYER')).toBe(true);
      expect(world.size()).toBe(1);
    });

    it('removes entities', () => {
      world.add(createEntity('TEMP'));
      expect(world.remove('TEMP')).toBe(true);
      expect(world.has('TEMP')).toBe(false);
    });

    it('lists all entities', () => {
      world.add(createEntity('A'));
      world.add(createEntity('B'));
      world.add(createEntity('C'));
      expect(world.all().length).toBe(3);
    });

    it('returns undefined for non-existent entity', () => {
      expect(world.get('MISSING')).toBeUndefined();
    });
  });

  // ─── World Clone ───────────────────────────────────────────────────────────

  describe('World clone', () => {
    it('creates a deep copy that is independent', () => {
      const world = new World([
        createEntity('PLAYER', { tags: ['character'], stats: { hp: 10 } }),
      ]);

      const cloned = world.clone();
      const clonedPlayer = cloned.get('PLAYER')!;
      clonedPlayer.tags.add('mutated');
      clonedPlayer.stats.set('hp', 0);

      // Original should be unchanged
      const original = world.get('PLAYER')!;
      expect(original.tags.has('mutated')).toBe(false);
      expect(original.stats.get('hp')).toBe(10);
    });
  });

  // ─── Entity Matcher Queries ────────────────────────────────────────────────

  describe('World.query', () => {
    let world: World;

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
          stats: {},
          links: { location: 'CAVE', guarded_by: 'GOBLIN' },
        }),
      ]);
    });

    it('matches by specific id', () => {
      const result = world.query({ id: 'GOBLIN' });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('GOBLIN');
    });

    it('returns empty for non-existent id', () => {
      expect(world.query({ id: 'DRAGON' })).toEqual([]);
    });

    it('matches all locations with wildcard + tag', () => {
      const result = world.query({
        id: '*',
        tags: [{ tag: 'location', negated: false }],
      });
      expect(result.length).toBe(2);
      const ids = result.map((e) => e.id).sort();
      expect(ids).toEqual(['CAVE', 'CAVE_ENTRANCE']);
    });

    it('matches items in player inventory', () => {
      const result = world.query({
        id: '*',
        tags: [{ tag: 'item', negated: false }],
        links: [{ key: 'location', targetId: 'PLAYER', negated: false }],
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('LIGHTER');
    });

    it('matches items with illumination > 5', () => {
      const result = world.query({
        id: '*',
        tags: [{ tag: 'item', negated: false }],
        stats: [{ key: 'illumination', operator: '>', value: 5 }],
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('TORCH');
    });

    it('matches with negated tag', () => {
      const result = world.query({
        id: '*',
        tags: [
          { tag: 'character', negated: false },
          { tag: 'sleeping', negated: true },
        ],
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('PLAYER');
    });

    it('matches entity by id + property check', () => {
      const result = world.query({
        id: 'GOBLIN',
        tags: [{ tag: 'sleeping', negated: false }],
      });
      expect(result.length).toBe(1);
    });

    it('fails match when property check fails on specific id', () => {
      const result = world.query({
        id: 'GOBLIN',
        tags: [{ tag: 'awake', negated: false }],
      });
      expect(result.length).toBe(0);
    });

    it('matches returns true/false', () => {
      expect(world.matches({ id: 'GOBLIN' })).toBe(true);
      expect(world.matches({ id: 'DRAGON' })).toBe(false);
    });
  });
});

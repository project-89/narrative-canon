/**
 * Aureum Rules Engine — World Module
 *
 * Implements the Entity-Component-System inspired world state from the ArgOS DSL.
 * A World is a collection of Entities, each with tags (set of strings),
 * stats (map of string → number), and links (map of string → entity id).
 *
 * EntityMatchers provide a declarative query language over the world.
 */

// ─── Entity ──────────────────────────────────────────────────────────────────

export interface Entity {
  id: string;
  tags: Set<string>;
  stats: Map<string, number>;
  links: Map<string, string>;
  /** Arbitrary metadata for external systems (narrative text, images, etc.) */
  meta: Record<string, unknown>;
}

export function createEntity(
  id: string,
  opts?: {
    tags?: string[];
    stats?: Record<string, number>;
    links?: Record<string, string>;
    meta?: Record<string, unknown>;
  }
): Entity {
  return {
    id,
    tags: new Set(opts?.tags ?? []),
    stats: new Map(Object.entries(opts?.stats ?? {})),
    links: new Map(Object.entries(opts?.links ?? {})),
    meta: opts?.meta ?? {},
  };
}

// ─── Entity Matcher ──────────────────────────────────────────────────────────

export type StatOperator = '=' | '>' | '<' | '>=' | '<=' | '!=';

export interface TagCondition {
  tag: string;
  negated: boolean;
}

export interface StatCondition {
  key: string;
  operator: StatOperator;
  value: number;
}

export interface LinkCondition {
  key: string;
  targetId: string;
  negated: boolean;
}

/**
 * A declarative query for matching entities in the world.
 *
 * - If `id` is set, matches only that specific entity (plus any property filters).
 * - If `id` is '*' or undefined, matches any entity satisfying the property filters.
 */
export interface EntityMatcher {
  /** Specific entity id, or '*' for wildcard */
  id?: string;
  tags?: TagCondition[];
  stats?: StatCondition[];
  links?: LinkCondition[];
}

// ─── World ───────────────────────────────────────────────────────────────────

export class World {
  private entities: Map<string, Entity> = new Map();

  constructor(entities?: Entity[]) {
    if (entities) {
      for (const e of entities) {
        this.entities.set(e.id, e);
      }
    }
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  add(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  get(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  has(id: string): boolean {
    return this.entities.has(id);
  }

  remove(id: string): boolean {
    return this.entities.delete(id);
  }

  all(): Entity[] {
    return Array.from(this.entities.values());
  }

  size(): number {
    return this.entities.size;
  }

  // ── Deep Clone ──────────────────────────────────────────────────────────

  clone(): World {
    const cloned = new World();
    for (const [id, entity] of this.entities) {
      cloned.entities.set(id, {
        id: entity.id,
        tags: new Set(entity.tags),
        stats: new Map(entity.stats),
        links: new Map(entity.links),
        meta: { ...entity.meta },
      });
    }
    return cloned;
  }

  // ── Querying ────────────────────────────────────────────────────────────

  /**
   * Find all entities matching the given matcher.
   */
  query(matcher: EntityMatcher): Entity[] {
    // Specific ID match
    if (matcher.id && matcher.id !== '*') {
      const entity = this.entities.get(matcher.id);
      if (!entity) return [];
      return this.matchesProperties(entity, matcher) ? [entity] : [];
    }

    // Wildcard — filter all entities
    const results: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (this.matchesProperties(entity, matcher)) {
        results.push(entity);
      }
    }
    return results;
  }

  /**
   * Check if at least one entity matches the given matcher.
   */
  matches(matcher: EntityMatcher): boolean {
    return this.query(matcher).length > 0;
  }

  /**
   * Check if a specific entity matches the property conditions of a matcher.
   */
  private matchesProperties(entity: Entity, matcher: EntityMatcher): boolean {
    // Check tags
    if (matcher.tags) {
      for (const tc of matcher.tags) {
        const hasTag = entity.tags.has(tc.tag);
        if (tc.negated && hasTag) return false;
        if (!tc.negated && !hasTag) return false;
      }
    }

    // Check stats
    if (matcher.stats) {
      for (const sc of matcher.stats) {
        const value = entity.stats.get(sc.key);
        if (value === undefined) {
          // No stat — only pass if we're checking != (absence != any value is true)
          if (sc.operator !== '!=') return false;
          continue;
        }
        if (!this.compareStat(value, sc.operator, sc.value)) return false;
      }
    }

    // Check links
    if (matcher.links) {
      for (const lc of matcher.links) {
        const target = entity.links.get(lc.key);
        const matches = target === lc.targetId;
        if (lc.negated && matches) return false;
        if (!lc.negated && !matches) return false;
      }
    }

    return true;
  }

  private compareStat(
    actual: number,
    operator: StatOperator,
    expected: number
  ): boolean {
    switch (operator) {
      case '=':
        return actual === expected;
      case '!=':
        return actual !== expected;
      case '>':
        return actual > expected;
      case '<':
        return actual < expected;
      case '>=':
        return actual >= expected;
      case '<=':
        return actual <= expected;
      default:
        return false;
    }
  }
}

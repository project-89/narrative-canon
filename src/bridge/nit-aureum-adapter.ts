/**
 * Nit ↔ Aureum Adapter
 *
 * Clean bidirectional adapter between NarrativeGit (Nit) and the Aureum Rules Engine.
 * Handles entity conversion, world snapshots, side effect processing, and state restoration.
 *
 * Design: Aureum stays standalone. This adapter lives in the bridge layer
 * and imports from both systems without either knowing about the other.
 */

import { World, Entity as AureumEntity, createEntity } from '../engine/world';
import { RuleSet, SideEffect } from '../engine/rules';
import { serializeWorld, deserializeWorld, serializeRuleSet, deserializeRuleSet } from '../engine/serializer';
import { NarrativeGit } from '../git/narrative-git';
import { GraphOperation, NarrativeCommit } from '../git/types';
import { Entity as NitEntity, Relationship, Interaction } from '../types';

// ─── Story Notes Convention ──────────────────────────────────────────────────

/**
 * Rich narrative context carried by entities.
 * Stored in Aureum's `meta.story_notes` and Nit's `storyNotes` field.
 */
export interface StoryNotes {
  /** How/why this entity was created */
  origin: string;
  /** What role it plays in the story */
  narrative_role: string;
  /** Narrative hooks for future use */
  hooks: string[];
  /** Rich text chunks from creation time */
  context_chunks: string[];
  /** Last scene/episode this appeared in */
  last_appearance?: string;
  /** Freeform notes for human/LLM writers */
  writer_notes?: string;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface NitAureumAdapterConfig {
  /** Author name for Nit commits */
  author?: string;
  /** Whether to auto-tag commits with entity types */
  autoTag?: boolean;
}

export class NitAureumAdapter {
  private config: Required<NitAureumAdapterConfig>;

  constructor(
    private nit: NarrativeGit,
    config: NitAureumAdapterConfig = {}
  ) {
    this.config = {
      author: config.author ?? 'aureum-adapter',
      autoTag: config.autoTag ?? true,
    };
  }

  // ── Aureum → Nit ──────────────────────────────────────────────────────────

  /**
   * Convert an Aureum entity to a Nit entity.
   *
   * Aureum's typed collections (tags → Set, stats → Map, links → Map)
   * are converted to plain object fields on the Nit entity.
   */
  aureumToNit(entity: AureumEntity): NitEntity {
    // Derive a type from tags (first non-utility tag, or 'unknown')
    const typeTags = Array.from(entity.tags).filter(
      (t) => !['active', 'in_room', 'in_inventory', 'alive', 'placed', 'solved'].includes(t)
    );
    const entityType = typeTags[0] ?? 'entity';
    const name = (entity.meta?.name as string) ?? entity.id;

    const nitEntity: NitEntity = {
      id: entity.id,
      name,
      type: entityType,
      description: (entity.meta?.description as string) ?? '',
      // Preserve Aureum data as structured fields
      aureum: {
        tags: Array.from(entity.tags),
        stats: Object.fromEntries(entity.stats),
        links: Object.fromEntries(entity.links),
      },
      // Copy all meta fields to top-level for Nit compatibility
      ...entity.meta,
    };

    return nitEntity;
  }

  /**
   * Convert a Nit entity to an Aureum entity.
   *
   * If the Nit entity has an `aureum` field (from a previous round-trip),
   * use it. Otherwise, infer tags/stats/links from the Nit entity's shape.
   */
  nitToAureum(entity: NitEntity): AureumEntity {
    // If it has round-trip data, use it directly
    if (entity.aureum) {
      return createEntity(entity.id, {
        tags: entity.aureum.tags ?? [],
        stats: entity.aureum.stats ?? {},
        links: entity.aureum.links ?? {},
        meta: this.extractMeta(entity),
      });
    }

    // Otherwise, infer from Nit entity shape
    const tags: string[] = [entity.type];
    const stats: Record<string, number> = {};
    const links: Record<string, string> = {};
    const meta: Record<string, unknown> = {
      name: entity.name,
      description: entity.description ?? '',
    };

    // Extract numeric fields as stats
    for (const [key, value] of Object.entries(entity)) {
      if (['id', 'name', 'type', 'description', 'aureum', 'storyNotes'].includes(key)) continue;
      if (typeof value === 'number') {
        stats[key] = value;
      } else if (typeof value === 'string' && key.endsWith('Id')) {
        links[key.replace(/Id$/, '')] = value;
      } else if (typeof value !== 'function') {
        meta[key] = value;
      }
    }

    return createEntity(entity.id, { tags, stats, links, meta });
  }

  /**
   * Snapshot an entire Aureum world into Nit as a single commit.
   * Each Aureum entity becomes a Nit ADD_ENTITY operation.
   */
  async snapshotWorld(
    world: World,
    message: string,
    options?: { tags?: string[]; ruleSet?: RuleSet }
  ): Promise<NarrativeCommit> {
    const operations: GraphOperation[] = [];

    for (const entity of world.all()) {
      const nitEntity = this.aureumToNit(entity);
      operations.push({
        id: `snapshot_${entity.id}_${Date.now()}`,
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: nitEntity,
        metadata: {
          reason: message,
          impact: 'minor',
          reversible: true,
        },
      });
    }

    // Optionally store rule set as a special entity
    if (options?.ruleSet) {
      const serializedRules = serializeRuleSet(options.ruleSet);
      operations.push({
        id: `snapshot_ruleset_${Date.now()}`,
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: `__aureum_ruleset_${options.ruleSet.id}`,
          name: options.ruleSet.name,
          type: '__aureum_ruleset',
          serialized: serializedRules,
        } as NitEntity,
      });
    }

    // Stage and commit
    this.nit.add(...operations);

    const tags = ['aureum_snapshot', ...(options?.tags ?? [])];
    if (this.config.autoTag) {
      const entityTypes = new Set(world.all().map((e) => {
        const typeTags = Array.from(e.tags).filter(
          (t) => !['active', 'in_room', 'in_inventory', 'alive'].includes(t)
        );
        return typeTags[0] ?? 'entity';
      }));
      tags.push(...Array.from(entityTypes).map((t) => `has_${t}`));
    }

    return this.nit.commit(message, { tags, author: this.config.author });
  }

  /**
   * Pull entities from Nit graph into a fresh Aureum World.
   * Optionally filter by entity type or tags.
   */
  pullWorld(filter?: { types?: string[]; tags?: string[] }): World {
    const structure = this.nit.export();
    let entities = structure.entities;

    // Filter by type
    if (filter?.types) {
      entities = entities.filter((e) => filter.types!.includes(e.type));
    }

    // Filter by Aureum tags (if entity has round-trip data)
    if (filter?.tags) {
      entities = entities.filter((e) => {
        const aureumTags: string[] = e.aureum?.tags ?? [e.type];
        return filter.tags!.some((t) => aureumTags.includes(t));
      });
    }

    // Skip internal entities
    entities = entities.filter((e) => !e.type.startsWith('__aureum_'));

    const aureumEntities = entities.map((e) => this.nitToAureum(e));
    return new World(aureumEntities);
  }

  /**
   * Load the latest Aureum world state from Nit commit history.
   * Finds the most recent commit tagged 'aureum_snapshot' and rebuilds the world.
   */
  restoreWorld(commitId?: string): World {
    const log = this.nit.log({ limit: 100 });

    // Find the target commit
    let targetCommit: NarrativeCommit | undefined;

    if (commitId) {
      const entry = log.find((e) => e.commit.id === commitId);
      targetCommit = entry?.commit;
    } else {
      // Find latest aureum_snapshot
      const entry = log.find((e) =>
        e.commit.tags?.includes('aureum_snapshot')
      );
      targetCommit = entry?.commit;
    }

    if (!targetCommit) {
      return new World([]);
    }

    // Rebuild from operations
    const entities: AureumEntity[] = [];
    for (const op of targetCommit.operations) {
      if (op.type === 'ADD_ENTITY' && !op.payload.type?.startsWith('__aureum_')) {
        entities.push(this.nitToAureum(op.payload));
      }
    }

    return new World(entities);
  }

  /**
   * Restore a rule set from a Nit snapshot commit.
   */
  restoreRuleSet(commitId?: string): RuleSet | null {
    const log = this.nit.log({ limit: 100 });

    const targetCommit = commitId
      ? log.find((e) => e.commit.id === commitId)?.commit
      : log.find((e) => e.commit.tags?.includes('aureum_snapshot'))?.commit;

    if (!targetCommit) return null;

    for (const op of targetCommit.operations) {
      if (op.type === 'ADD_ENTITY' && op.payload.type === '__aureum_ruleset') {
        return deserializeRuleSet(op.payload.serialized);
      }
    }

    return null;
  }

  // ── Side Effect Processing ────────────────────────────────────────────────

  /**
   * Convert Aureum side effects into Nit GraphOperations.
   * Handles: nit_commit, narrative, narrative_commit, narrative_interaction, trigger_pipeline
   */
  processSideEffects(effects: SideEffect[]): GraphOperation[] {
    const operations: GraphOperation[] = [];

    for (const effect of effects) {
      switch (effect.type) {
        case 'nit_commit': {
          // Direct commit instruction — payload has message and optional tags
          const payload = effect.payload as {
            message?: string;
            tags?: string[];
            entities?: NitEntity[];
          };

          // Add any specified entities
          if (payload.entities) {
            for (const entity of payload.entities) {
              operations.push({
                id: `nit_commit_entity_${entity.id}_${Date.now()}`,
                type: 'ADD_ENTITY',
                timestamp: Date.now(),
                payload: entity,
              });
            }
          }
          break;
        }

        case 'narrative':
        case 'narrative_commit': {
          // Narrative text — store as an interaction
          const text = (effect.payload as any)?.text ?? '';
          if (text) {
            operations.push({
              id: `narrative_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'ADD_INTERACTION',
              timestamp: Date.now(),
              payload: {
                id: `interaction_${Date.now()}`,
                type: 'discovery',
                participants: [] as string[],
                trigger: 'aureum_side_effect',
                outcome: text,
                visual_beat: '',
                emotional_tone: 'mysterious',
                narrative_weight: 'minor',
              } satisfies Interaction,
            });
          }
          break;
        }

        case 'narrative_interaction': {
          // Structured interaction
          const interaction = effect.payload as unknown as Interaction;
          if (interaction) {
            operations.push({
              id: `interaction_${interaction.id ?? Date.now()}`,
              type: 'ADD_INTERACTION',
              timestamp: Date.now(),
              payload: interaction,
            });
          }
          break;
        }

        case 'trigger_pipeline': {
          // Pipeline trigger — stored as metadata for hook processing
          operations.push({
            id: `pipeline_trigger_${Date.now()}`,
            type: 'ADD_ENTITY',
            timestamp: Date.now(),
            payload: {
              id: `__pipeline_trigger_${Date.now()}`,
              name: 'Pipeline Trigger',
              type: '__pipeline_trigger',
              ...effect.payload,
            } as NitEntity,
            metadata: {
              reason: 'Pipeline triggered by Aureum rule',
              impact: 'major',
            },
          });
          break;
        }

        case 'game_event': {
          // Game events as canonical events
          const event = effect.payload as { event?: string; result?: string };
          operations.push({
            id: `game_event_${Date.now()}`,
            type: 'ADD_INTERACTION',
            timestamp: Date.now(),
            payload: {
              id: `event_${Date.now()}`,
              type: 'ritual',
              participants: [] as string[],
              trigger: event?.event ?? 'unknown',
              outcome: event?.result ?? 'unknown',
              visual_beat: '',
              emotional_tone: 'ominous',
              narrative_weight: 'pivotal',
            } satisfies Interaction,
          });
          break;
        }

        // Unknown types are silently ignored
        default:
          break;
      }
    }

    return operations;
  }

  /**
   * Process side effects and commit them to Nit in one step.
   */
  async commitSideEffects(
    effects: SideEffect[],
    message: string,
    tags?: string[]
  ): Promise<NarrativeCommit | null> {
    const operations = this.processSideEffects(effects);
    if (operations.length === 0) return null;

    this.nit.add(...operations);
    return this.nit.commit(message, {
      tags: ['aureum_side_effects', ...(tags ?? [])],
      author: this.config.author,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Get the underlying NarrativeGit instance */
  getNit(): NarrativeGit {
    return this.nit;
  }

  /**
   * Extract meta fields from a Nit entity, excluding standard and aureum fields.
   */
  private extractMeta(entity: NitEntity): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entity)) {
      if (['id', 'name', 'type', 'aureum'].includes(key)) continue;
      if (typeof value !== 'function') {
        meta[key] = value;
      }
    }
    return meta;
  }
}

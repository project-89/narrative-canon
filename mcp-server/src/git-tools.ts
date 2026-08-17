/**
 * NarrativeGit MCP Tools — Write operations for the narrative graph.
 *
 * These tools expose NarrativeGit (branch/commit/merge) and entity
 * management via MCP, allowing external systems (e.g., the Microdrama
 * Studio Python pipeline) to persist generated content into the
 * narrative canon.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  NarrativeGit,
  initNarrativeGit,
  type GitConfig,
  type LogEntry,
  type StatusResult,
} from '../../src/git/index.js';
import type {
  GraphOperation,
  TimelineBranch,
  MergeResult,
  GraphDiff,
  NarrativeCommit,
} from '../../src/git/types.js';
import type { Entity, Relationship, Scene, Interaction } from '../../src/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ── Singleton NarrativeGit Instance ──────────────────────────

let git: NarrativeGit | null = null;

function getGit(): NarrativeGit {
  if (!git) {
    git = initNarrativeGit({
      author: 'microdrama-studio',
      autoExecuteHooks: false,
      defaultBranch: 'main',
    });
  }
  return git;
}

// ── Tool Definitions ─────────────────────────────────────────

export const gitTools: Tool[] = [
  // === INITIALIZATION ===
  {
    name: 'git_init',
    description:
      'Initialize a new NarrativeGit repository for a project. Resets any existing state.',
    inputSchema: {
      type: 'object',
      properties: {
        author: {
          type: 'string',
          description: 'Author name for commits (default: microdrama-studio)',
        },
        defaultBranch: {
          type: 'string',
          description: 'Default branch name (default: main)',
        },
      },
    },
  },

  // === ENTITY OPERATIONS ===
  {
    name: 'git_add_entity',
    description:
      'Stage an entity (character, location, object, organization) for commit.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique entity ID (auto-generated if omitted)',
        },
        name: { type: 'string', description: 'Entity name' },
        type: {
          type: 'string',
          enum: ['character', 'location', 'object', 'organization', 'concept', 'technology'],
          description: 'Entity type',
        },
        properties: {
          type: 'object',
          description:
            'Additional properties (description, appearance, role, backstory, etc.)',
        },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'git_update_entity',
    description: 'Stage an entity update for commit.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'ID of entity to update' },
        changes: {
          type: 'object',
          description: 'Partial entity fields to update',
        },
      },
      required: ['entityId', 'changes'],
    },
  },

  // === RELATIONSHIP OPERATIONS ===
  {
    name: 'git_add_relationship',
    description: 'Stage a relationship between two entities.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique relationship ID' },
        source: { type: 'string', description: 'Source entity ID' },
        target: { type: 'string', description: 'Target entity ID' },
        type: {
          type: 'string',
          description:
            'Relationship type (ally, enemy, mentor, partner, investigated_by, located_at, etc.)',
        },
        strength: {
          type: 'number',
          description: 'Relationship strength 0-1',
        },
        properties: {
          type: 'object',
          description: 'Additional properties (description, etc.)',
        },
      },
      required: ['source', 'target', 'type'],
    },
  },

  // === SCENE OPERATIONS ===
  {
    name: 'git_add_scene',
    description: 'Stage a scene for commit.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Scene ID' },
        title: { type: 'string', description: 'Scene title' },
        sequence: { type: 'number', description: 'Order in narrative' },
        location: { type: 'string', description: 'Location entity ID' },
        characters: {
          type: 'array',
          items: { type: 'string' },
          description: 'Character entity IDs present',
        },
        description: { type: 'string', description: 'Scene description' },
        properties: {
          type: 'object',
          description:
            'Additional properties (dialogue, visual_direction, screen_time_seconds, etc.)',
        },
      },
      required: ['title', 'sequence', 'description'],
    },
  },

  // === INTERACTION OPERATIONS ===
  {
    name: 'git_add_interaction',
    description:
      'Stage a narrative interaction (dialogue, confrontation, revelation, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Interaction ID' },
        type: {
          type: 'string',
          enum: [
            'dialogue',
            'confrontation',
            'alliance',
            'betrayal',
            'revelation',
            'discovery',
            'transaction',
            'ritual',
            'combat',
          ],
          description: 'Type of interaction',
        },
        participants: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entity IDs of participants',
        },
        trigger: {
          type: 'string',
          description: 'What triggered/initiated this interaction',
        },
        outcome: {
          type: 'string',
          description: 'What changed as a result',
        },
        visual_beat: {
          type: 'string',
          description: 'Visual description for image generation',
        },
        emotional_tone: {
          type: 'string',
          enum: [
            'tense', 'triumphant', 'desperate', 'mysterious',
            'hopeful', 'tragic', 'ominous', 'intimate', 'chaotic', 'peaceful',
          ],
          description: 'Emotional tone of the moment',
        },
        narrative_weight: {
          type: 'string',
          enum: ['minor', 'major', 'pivotal'],
          description: 'Importance to the overall narrative',
        },
        key_dialogue: {
          type: 'string',
          description: 'Pivotal line(s) of dialogue',
        },
        sceneId: { type: 'string', description: 'Scene this belongs to' },
        sequence: { type: 'number', description: 'Order within scene' },
      },
      required: ['type', 'participants', 'trigger', 'outcome', 'visual_beat', 'emotional_tone', 'narrative_weight'],
    },
  },

  // === GIT OPERATIONS ===
  {
    name: 'git_commit',
    description: 'Commit all staged operations with a message.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        author: { type: 'string', description: 'Override author for this commit' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for this commit',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'git_branch',
    description: 'Create a new timeline branch.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Branch name' },
        checkout: {
          type: 'boolean',
          description: 'Switch to the new branch immediately',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'git_checkout',
    description: 'Switch to a different branch.',
    inputSchema: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch name to switch to' },
      },
      required: ['branch'],
    },
  },
  {
    name: 'git_merge',
    description: 'Merge a source branch into the current branch.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Branch name to merge from',
        },
        strategy: {
          type: 'string',
          enum: ['fast-forward', 'three-way', 'ours', 'theirs'],
          description: 'Merge strategy (default: three-way)',
        },
        message: { type: 'string', description: 'Merge commit message' },
      },
      required: ['source'],
    },
  },
  {
    name: 'git_log',
    description: 'View commit history.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max commits to return (default: 20)' },
        branch: { type: 'string', description: 'Branch to show log for' },
      },
    },
  },
  {
    name: 'git_status',
    description: 'Show repository status (current branch, staged operations).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'git_branches',
    description: 'List all branches.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'git_diff',
    description: 'Show differences between two commits.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source commit ID' },
        to: { type: 'string', description: 'Target commit ID' },
      },
    },
  },
  {
    name: 'git_export',
    description:
      'Export the current narrative graph state as a NarrativeStructure (entities, relationships, interactions).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === QUERY OPERATIONS ===
  {
    name: 'git_get_entity',
    description: 'Get a specific entity by ID from the current graph state.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'Entity ID to retrieve' },
      },
      required: ['entityId'],
    },
  },
  {
    name: 'git_get_entities',
    description: 'List all entities of a given type from the current graph state.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['character', 'location', 'object', 'organization', 'concept', 'technology'],
          description: 'Entity type to filter by (omit for all)',
        },
      },
    },
  },
  {
    name: 'git_blame',
    description: 'Show the commit history for a specific entity.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'Entity ID to trace' },
      },
      required: ['entityId'],
    },
  },
];

// ── Tool Handlers ────────────────────────────────────────────

export async function handleGitToolCall(
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    // === INITIALIZATION ===
    case 'git_init': {
      git = initNarrativeGit({
        author: args.author || 'microdrama-studio',
        autoExecuteHooks: false,
        defaultBranch: args.defaultBranch || 'main',
      });
      return {
        success: true,
        message: `NarrativeGit initialized (author: ${args.author || 'microdrama-studio'}, branch: ${args.defaultBranch || 'main'})`,
      };
    }

    // === ENTITY OPERATIONS ===
    case 'git_add_entity': {
      const g = getGit();
      const id = args.id || `${args.type}_${uuidv4().slice(0, 8)}`;
      const entity: Entity = {
        id,
        name: args.name,
        type: args.type,
        ...(args.properties || {}),
      };
      const op: GraphOperation = {
        id: `op_add_${id}`,
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: entity,
      };
      g.add(op);
      return { success: true, entityId: id, staged: true };
    }

    case 'git_update_entity': {
      const g = getGit();
      const op: GraphOperation = {
        id: `op_update_${args.entityId}_${Date.now()}`,
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: args.entityId,
          changes: args.changes,
        },
      };
      g.add(op);
      return { success: true, entityId: args.entityId, staged: true };
    }

    // === RELATIONSHIP OPERATIONS ===
    case 'git_add_relationship': {
      const g = getGit();
      const id = args.id || `rel_${uuidv4().slice(0, 8)}`;
      const rel: Relationship = {
        id,
        source: args.source,
        target: args.target,
        type: args.type,
        strength: args.strength,
        ...(args.properties || {}),
      };
      const op: GraphOperation = {
        id: `op_add_rel_${id}`,
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: rel,
      };
      g.add(op);
      return { success: true, relationshipId: id, staged: true };
    }

    // === SCENE OPERATIONS ===
    case 'git_add_scene': {
      const g = getGit();
      const id = args.id || `scene_${uuidv4().slice(0, 8)}`;
      const scene: Scene = {
        id,
        title: args.title,
        sequence: args.sequence,
        location: args.location,
        characters: args.characters || [],
        description: args.description,
        ...(args.properties || {}),
      };
      const op: GraphOperation = {
        id: `op_add_scene_${id}`,
        type: 'ADD_SCENE',
        timestamp: Date.now(),
        payload: scene,
      };
      g.add(op);
      return { success: true, sceneId: id, staged: true };
    }

    // === INTERACTION OPERATIONS ===
    case 'git_add_interaction': {
      const g = getGit();
      const id = args.id || `interaction_${uuidv4().slice(0, 8)}`;
      const interaction: Interaction = {
        id,
        type: args.type,
        participants: args.participants,
        trigger: args.trigger,
        outcome: args.outcome,
        visual_beat: args.visual_beat,
        emotional_tone: args.emotional_tone,
        narrative_weight: args.narrative_weight,
        key_dialogue: args.key_dialogue,
        sceneId: args.sceneId,
        sequence: args.sequence,
        location: args.location,
      };
      const op: GraphOperation = {
        id: `op_add_interaction_${id}`,
        type: 'ADD_INTERACTION',
        timestamp: Date.now(),
        payload: interaction,
      };
      g.add(op);
      return { success: true, interactionId: id, staged: true };
    }

    // === GIT OPERATIONS ===
    case 'git_commit': {
      const g = getGit();
      const commit = await g.commit(args.message, {
        author: args.author,
        tags: args.tags,
      });
      return {
        success: true,
        commitId: commit.id,
        message: commit.message,
        author: commit.author,
        operationCount: commit.operations.length,
        metrics: commit.metrics,
      };
    }

    case 'git_branch': {
      const g = getGit();
      const branch = g.branch(args.name, { checkout: args.checkout });
      return {
        success: true,
        branch: {
          name: branch.name,
          parentCommit: branch.parentCommit,
          isCanon: branch.isCanon,
        },
        checkedOut: args.checkout || false,
      };
    }

    case 'git_checkout': {
      const g = getGit();
      await g.checkout(args.branch);
      return { success: true, branch: args.branch };
    }

    case 'git_merge': {
      const g = getGit();
      const config = args.strategy
        ? { strategy: args.strategy as any, message: args.message }
        : { strategy: 'three-way' as const, message: args.message };
      const result = await g.merge(args.source, config);
      return result;
    }

    case 'git_log': {
      const g = getGit();
      const entries = g.log({
        limit: args.limit || 20,
        branch: args.branch,
      });
      return entries.map((e: LogEntry) => ({
        commitId: e.commit.id,
        message: e.commit.message,
        author: e.commit.author,
        timestamp: e.commit.timestamp,
        operationCount: e.commit.operations.length,
        branch: e.branch,
        tags: e.tags,
        isHead: e.isHead,
        isMerge: e.isMerge,
      }));
    }

    case 'git_status': {
      const g = getGit();
      const status = g.status();
      return {
        branch: status.branch,
        stagedOperations: status.staged.length,
        staged: status.staged.map((op: GraphOperation) => ({
          type: op.type,
          id: op.id,
          payloadId: op.payload?.id || op.payload?.entityId,
        })),
      };
    }

    case 'git_branches': {
      const g = getGit();
      return g.branches().map((b) => ({
        name: b.name,
        current: b.current,
        isCanon: b.branch.isCanon,
        headCommit: b.branch.headCommit,
      }));
    }

    case 'git_diff': {
      const g = getGit();
      return g.diff(args.from, args.to);
    }

    case 'git_export': {
      const g = getGit();
      return g.export();
    }

    // === QUERY OPERATIONS ===
    case 'git_get_entity': {
      const g = getGit();
      const graph = g.getGraph();
      // Access the internal entities map
      const entities = (graph as any).entities as Map<string, Entity>;
      const entity = entities?.get(args.entityId);
      if (!entity) {
        throw new Error(`Entity not found: ${args.entityId}`);
      }
      return entity;
    }

    case 'git_get_entities': {
      const g = getGit();
      const graph = g.getGraph();
      const entities = Array.from(
        ((graph as any).entities as Map<string, Entity>)?.values() || []
      );
      if (args.type) {
        return entities.filter((e: Entity) => e.type === args.type);
      }
      return entities;
    }

    case 'git_blame': {
      const g = getGit();
      return g.blame(args.entityId);
    }

    default:
      throw new Error(`Unknown git tool: ${name}`);
  }
}

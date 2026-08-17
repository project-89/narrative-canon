#!/usr/bin/env npx tsx
/**
 * NarrativeGit Bridge — Lightweight JSON-RPC bridge over stdio.
 *
 * Reads one JSON command per line from stdin, executes it against a
 * NarrativeGit instance, and writes one JSON response per line to stdout.
 *
 * This bypasses the MCP server and MongoDB, talking directly to the
 * in-memory NarrativeGit graph. Designed to be spawned by the Python
 * microdrama-studio pipeline.
 *
 * Usage:
 *   echo '{"id":1,"method":"git_init","params":{}}' | npx tsx src/git/bridge.ts
 */

import { NarrativeGit, initNarrativeGit } from './narrative-git.js';
import type {
  GraphOperation,
  NarrativeCommit,
} from './types.js';
import type { Entity, Relationship, Scene, Interaction } from '../types.js';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';

// ── State ──────────────────────────────────────────────────

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

function shortId(): string {
  return randomUUID().slice(0, 8);
}

// ── Command Handlers ───────────────────────────────────────

async function handleCommand(method: string, params: Record<string, any>): Promise<any> {
  switch (method) {
    // === INIT ===
    case 'git_init': {
      git = initNarrativeGit({
        author: params.author || 'microdrama-studio',
        autoExecuteHooks: false,
        defaultBranch: params.defaultBranch || 'main',
      });
      return { success: true, message: 'NarrativeGit initialized' };
    }

    // === ENTITY OPS ===
    case 'git_add_entity': {
      const g = getGit();
      const id = params.id || `${params.type}_${shortId()}`;
      const entity: Entity = {
        id,
        name: params.name,
        type: params.type,
        ...(params.properties || {}),
      };
      g.add({
        id: `op_add_${id}`,
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: entity,
      });
      return { success: true, entityId: id };
    }

    case 'git_update_entity': {
      const g = getGit();
      g.add({
        id: `op_update_${params.entityId}_${Date.now()}`,
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: { entityId: params.entityId, changes: params.changes },
      });
      return { success: true, entityId: params.entityId };
    }

    // === RELATIONSHIP OPS ===
    case 'git_add_relationship': {
      const g = getGit();
      const id = params.id || `rel_${shortId()}`;
      g.add({
        id: `op_add_rel_${id}`,
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id,
          source: params.source,
          target: params.target,
          type: params.type,
          strength: params.strength,
          ...(params.properties || {}),
        } as Relationship,
      });
      return { success: true, relationshipId: id };
    }

    // === SCENE OPS ===
    case 'git_add_scene': {
      const g = getGit();
      const id = params.id || `scene_${shortId()}`;
      g.add({
        id: `op_add_scene_${id}`,
        type: 'ADD_SCENE',
        timestamp: Date.now(),
        payload: {
          id,
          title: params.title,
          sequence: params.sequence,
          location: params.location,
          characters: params.characters || [],
          description: params.description,
          ...(params.properties || {}),
        } as Scene,
      });
      return { success: true, sceneId: id };
    }

    // === INTERACTION OPS ===
    case 'git_add_interaction': {
      const g = getGit();
      const id = params.id || `interaction_${shortId()}`;
      g.add({
        id: `op_add_interaction_${id}`,
        type: 'ADD_INTERACTION',
        timestamp: Date.now(),
        payload: {
          id,
          type: params.type,
          participants: params.participants,
          trigger: params.trigger,
          outcome: params.outcome,
          visual_beat: params.visual_beat,
          emotional_tone: params.emotional_tone,
          narrative_weight: params.narrative_weight,
          key_dialogue: params.key_dialogue,
          sceneId: params.sceneId,
          sequence: params.sequence,
          location: params.location,
        } as Interaction,
      });
      return { success: true, interactionId: id };
    }

    // === GIT OPS ===
    case 'git_commit': {
      const g = getGit();
      const commit = await g.commit(params.message, {
        author: params.author,
        tags: params.tags,
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
      const branch = g.branch(params.name, { checkout: params.checkout });
      return {
        success: true,
        branch: { name: branch.name, parentCommit: branch.parentCommit },
        checkedOut: params.checkout || false,
      };
    }

    case 'git_checkout': {
      const g = getGit();
      await g.checkout(params.branch);
      return { success: true, branch: params.branch };
    }

    case 'git_merge': {
      const g = getGit();
      return await g.merge(params.source, {
        strategy: params.strategy || 'three-way',
        message: params.message,
      });
    }

    case 'git_log': {
      const g = getGit();
      const entries = g.log({ limit: params.limit || 20, branch: params.branch });
      return entries.map(e => ({
        commitId: e.commit.id,
        message: e.commit.message,
        author: e.commit.author,
        timestamp: e.commit.timestamp,
        operationCount: e.commit.operations.length,
        branch: e.branch,
        tags: e.tags,
        isHead: e.isHead,
      }));
    }

    case 'git_status': {
      const g = getGit();
      const status = g.status();
      return {
        branch: status.branch,
        stagedOperations: status.staged.length,
      };
    }

    case 'git_branches': {
      const g = getGit();
      return g.branches().map(b => ({
        name: b.name,
        current: b.current,
        isCanon: b.branch.isCanon,
      }));
    }

    case 'git_export': {
      const g = getGit();
      return g.export();
    }

    case 'git_get_entity': {
      const g = getGit();
      const graph = g.getGraph();
      const entity = graph.getEntity(params.entityId);
      if (!entity) throw new Error(`Entity not found: ${params.entityId}`);
      return entity;
    }

    case 'git_get_entities': {
      const g = getGit();
      const graph = g.getGraph();
      const all = graph.getAllEntities();
      if (params.type) return all.filter(e => e.type === params.type);
      return all;
    }

    case 'git_blame': {
      const g = getGit();
      return g.blame(params.entityId);
    }

    case 'ping': {
      return { pong: true, timestamp: Date.now() };
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

// ── Main Loop ──────────────────────────────────────────────

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

// Signal readiness
process.stderr.write('🔗 NarrativeGit bridge ready\n');

rl.on('line', async (line: string) => {
  let id: number | string | null = null;
  try {
    const request = JSON.parse(line.trim());
    id = request.id;
    const result = await handleCommand(request.method, request.params || {});
    const response = JSON.stringify({ jsonrpc: '2.0', id, result });
    process.stdout.write(response + '\n');
  } catch (error: any) {
    const response = JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: error.message },
    });
    process.stdout.write(response + '\n');
  }
});

rl.on('close', () => {
  process.stderr.write('🔗 NarrativeGit bridge closed\n');
  process.exit(0);
});

/**
 * Bridge ADK FunctionTools
 *
 * Wraps AureumNarrativeBridge operations as ADK FunctionTool instances
 * so agents can bridge between game mechanics and narrative graph.
 */

import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AureumNarrativeBridge, GameSessionConfig } from './aureum-narrative-bridge';
import { NarrativeGit, initNarrativeGit } from '../git/narrative-git';
import { World } from '../engine/world';
import { step } from '../engine/evaluator';
import { getWorld, getRuleSet } from '../engine/templates/tools/aureum-adk-tools';

// ─── Shared Bridge Instance ──────────────────────────────────────────────────

let bridge: AureumNarrativeBridge | null = null;

export function getBridge(): AureumNarrativeBridge | null {
  return bridge;
}

export function setBridge(b: AureumNarrativeBridge): void {
  bridge = b;
}

function ensureBridge(): AureumNarrativeBridge {
  if (!bridge) {
    // Auto-create with a fresh NarrativeGit
    bridge = AureumNarrativeBridge.create({ author: 'agent' });
  }
  return bridge;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export const initBridgeTool = new FunctionTool({
  name: 'init_bridge',
  description: `Initialize the Aureum ↔ NarrativeGit bridge.
Creates a bridge instance connecting the rule engine to the narrative graph.
Must be called before using other bridge tools.`,
  parameters: z.object({
    author: z.string().optional().describe('Author name for graph commits (default: "agent")'),
  }),
  execute: ({ author }: any) => {
    try {
      const git = initNarrativeGit({ author: author ?? 'agent' });
      bridge = new AureumNarrativeBridge(git);
      return { status: 'success', message: 'Bridge initialized' };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const snapshotWorldTool = new FunctionTool({
  name: 'snapshot_world',
  description: `Take a snapshot of the current Aureum game world and commit it to the narrative graph.
The currently loaded game (from load_game) is converted to graph entities and committed.
This creates the initial narrative state from the game definition.`,
  parameters: z.object({
    message: z.string().optional().describe('Commit message for the snapshot'),
  }),
  execute: async ({ message }: any) => {
    try {
      const b = ensureBridge();
      const world = getWorld();
      if (!world) {
        return { status: 'error', error: 'No game loaded. Use load_game first.' };
      }

      const commitId = await b.snapshotWorld(world, message);
      const graphState = b.getGit().export();

      return {
        status: 'success',
        commitId,
        entitiesInGraph: graphState.entities.length,
        relationshipsInGraph: graphState.relationships.length,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const startGameSessionTool = new FunctionTool({
  name: 'start_game_session',
  description: `Start a new game session. Creates a timeline branch in the narrative graph.
All game events during the session will be committed to this branch.
The session tracks rounds and can be merged back to main when done.`,
  parameters: z.object({
    gameName: z.string().describe('Name of the game being played'),
    autoCommitStateChanges: z.boolean().optional()
      .describe('If true, auto-commit all mechanical state changes to the graph (default: false)'),
    author: z.string().optional().describe('Author name for commits during this session'),
  }),
  execute: async ({ gameName, autoCommitStateChanges, author }: any) => {
    try {
      const b = ensureBridge();
      const session = await b.startSession({
        gameName,
        autoCommitStateChanges: autoCommitStateChanges ?? false,
        author,
      });

      return {
        status: 'success',
        sessionId: session.id,
        branch: session.branch,
        gameName: session.gameName,
        hint: 'Use play_card or bridge_step to play the game. Use end_game_session to finish.',
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const bridgeStepTool = new FunctionTool({
  name: 'bridge_step',
  description: `Step an entity through the Aureum rule engine AND process narrative side effects.
Combines step() with narrative graph commits. Use this instead of regular step()
when you want game events to write to the narrative graph.

If a rule fires with narrative_commit or narrative_interaction sideEffects,
those are committed to the current graph branch.`,
  parameters: z.object({
    entityId: z.string().describe('Entity ID to step (e.g., "card_firewall", "enemy_sentinel", "GAME")'),
    context: z.string().optional().describe('Additional context about why this step is happening'),
  }),
  execute: async ({ entityId, context }: any) => {
    try {
      const b = ensureBridge();
      const world = getWorld();
      const ruleSet = getRuleSet();
      if (!world || !ruleSet) {
        return { status: 'error', error: 'No game loaded. Use load_game first.' };
      }

      // Step through the Aureum engine
      const stepResult = step(entityId, world, ruleSet);

      // Process through the bridge
      const bridgeResult = await b.processStepResult(stepResult, { context });

      return {
        status: 'success',
        ruleFired: bridgeResult.step.match?.rule.id ?? null,
        ruleDescription: bridgeResult.step.match?.rule.description ?? null,
        narrativeCommits: bridgeResult.commits,
        gameOver: bridgeResult.gameOver,
        sideEffects: bridgeResult.step.sideEffects.map((se) => ({
          type: se.type,
          summary: se.type === 'narrative'
            ? (se.payload as any).text
            : JSON.stringify(se.payload).slice(0, 100),
        })),
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const endGameSessionTool = new FunctionTool({
  name: 'end_game_session',
  description: `End the current game session. Finalizes the timeline branch.
Optionally merges the session branch back to the source branch,
making game events part of the canonical narrative.`,
  parameters: z.object({
    merge: z.boolean().optional().describe('If true, merge session branch back to main (default: false)'),
    outcome: z.enum(['win', 'loss', 'draw', 'abandoned']).optional()
      .describe('How the game ended'),
    message: z.string().optional().describe('Final commit message'),
  }),
  execute: async ({ merge, outcome, message }: any) => {
    try {
      const b = ensureBridge();
      const result = await b.endSession({ merge, outcome, message });

      return {
        status: 'success',
        ...result,
        durationSeconds: Math.round(result.duration / 1000),
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const initWorldFromGraphTool = new FunctionTool({
  name: 'init_world_from_graph',
  description: `Initialize an Aureum game world from the current narrative graph state.
Reads entities and relationships from the graph and creates an Aureum World.
Use this to start a game from the current state of the narrative.`,
  parameters: z.object({
    entityTypes: z.array(z.string()).optional()
      .describe('Only include entities of these types (e.g., ["character", "card", "location"])'),
    excludeTypes: z.array(z.string()).optional()
      .describe('Exclude entities of these types'),
  }),
  execute: ({ entityTypes, excludeTypes }: any) => {
    try {
      const b = ensureBridge();
      const world = b.initializeWorldFromGraph({ entityTypes, excludeTypes });

      return {
        status: 'success',
        entityCount: world.all().length,
        entities: world.all().map((e) => ({
          id: e.id,
          tags: Array.from(e.tags),
          statCount: e.stats.size,
          linkCount: e.links.size,
        })),
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

export const getGraphStatusTool = new FunctionTool({
  name: 'get_graph_status',
  description: `Get the current status of the narrative graph — branch, entity count, commit count, and active session info.`,
  parameters: z.object({}),
  execute: () => {
    try {
      const b = ensureBridge();
      const status = b.getGit().status();
      const graphState = b.getGit().export();
      const session = b.getActiveSession();

      return {
        status: 'success',
        branch: status.branch,
        stagedOps: status.staged.length,
        entities: graphState.entities.length,
        relationships: graphState.relationships.length,
        interactions: graphState.interactions.length,
        activeSession: session
          ? {
              id: session.id,
              branch: session.branch,
              round: session.round,
              gameName: session.gameName,
            }
          : null,
      };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },
});

// ─── Export All Tools ────────────────────────────────────────────────────────

export const allBridgeTools = [
  initBridgeTool,
  snapshotWorldTool,
  startGameSessionTool,
  bridgeStepTool,
  endGameSessionTool,
  initWorldFromGraphTool,
  getGraphStatusTool,
];

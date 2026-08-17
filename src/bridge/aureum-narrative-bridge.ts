/**
 * Aureum ↔ NarrativeGit Bridge
 *
 * The core bridge between the Aureum rule engine and the NarrativeGit
 * narrative graph. Enables:
 *
 *   1. Game rule fires → narrative graph commits (via sideEffects)
 *   2. Narrative graph state → Aureum world initialization
 *   3. Game sessions as timeline branches
 *   4. Bidirectional entity translation
 *
 * This is the connective tissue of the transmedia engine.
 */

import { NarrativeGit, initNarrativeGit, GitConfig } from '../git/narrative-git';
import { GraphOperation } from '../git/types';
import { Entity as CanonEntity, Relationship, Interaction } from '../types';
import { World, Entity as AureumEntity } from '../engine/world';
import { RuleSet, SideEffect, WorldChange } from '../engine/rules';
import { StepResult, TickResult } from '../engine/evaluator';
import { loadGameFromJSON } from '../engine/templates/tools/aureum-adk-tools';

import {
  aureumToCanonEntity,
  aureumWorldToCanon,
  canonToAureumEntity,
  canonToAureumWorld,
  worldChangesToGraphOps,
  createAddEntityOp,
  createUpdateEntityOp,
} from './entity-translator';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A narrative_commit side effect payload.
 * Rules can include this to emit graph operations when they fire.
 */
export interface NarrativeCommitPayload {
  /** Commit message describing the narrative event */
  message: string;
  /** Explicit graph operations to commit */
  operations?: GraphOperation[];
  /** If true, also auto-generate ops from the rule's mechanical changes */
  includeStateChanges?: boolean;
  /** Tags to apply to the commit */
  tags?: string[];
}

/**
 * An interaction side effect payload — shorthand for emitting a narrative
 * interaction without building full GraphOperation objects.
 */
export interface NarrativeInteractionPayload {
  type: Interaction['type'];
  participants: string[];
  visual_beat: string;
  emotional_tone: Interaction['emotional_tone'];
  narrative_weight: Interaction['narrative_weight'];
  key_dialogue?: string;
  outcome?: string;
  trigger?: string;
  location?: string;
}

/** Result from processing a step through the bridge */
export interface BridgeStepResult {
  /** The step result from the Aureum evaluator */
  step: StepResult;
  /** Narrative commits made (if any) */
  commits: Array<{
    id: string;
    message: string;
    operationCount: number;
  }>;
  /** Whether the game ended on this step */
  gameOver: 'win' | 'loss' | null;
}

/** Configuration for a game session */
export interface GameSessionConfig {
  /** Name of the game */
  gameName: string;
  /** Branch to fork from (default: current branch) */
  fromBranch?: string;
  /** Whether to auto-commit mechanical state changes */
  autoCommitStateChanges?: boolean;
  /** Custom author name for commits */
  author?: string;
}

/** Active game session state */
export interface GameSession {
  id: string;
  branch: string;
  gameName: string;
  round: number;
  startedAt: number;
  config: GameSessionConfig;
}

// ─── Narrative Commit Side Effect Constants ──────────────────────────────────

/** Side effect type for narrative commits */
export const NARRATIVE_COMMIT = 'narrative_commit';
/** Side effect type for narrative interactions (shorthand) */
export const NARRATIVE_INTERACTION = 'narrative_interaction';

// ─── Bridge Class ────────────────────────────────────────────────────────────

export class AureumNarrativeBridge {
  private git: NarrativeGit;
  private activeSession: GameSession | null = null;

  constructor(git: NarrativeGit) {
    this.git = git;
  }

  /**
   * Create a bridge with a new NarrativeGit instance.
   */
  static create(config?: GitConfig): AureumNarrativeBridge {
    return new AureumNarrativeBridge(initNarrativeGit(config));
  }

  /**
   * Get the underlying NarrativeGit instance.
   */
  getGit(): NarrativeGit {
    return this.git;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECTION 1: Aureum → Narrative (game events → graph commits)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process a StepResult from the Aureum evaluator.
   * Extracts narrative_commit and narrative_interaction sideEffects,
   * translates them into graph operations, and commits them.
   *
   * @returns BridgeStepResult with commit info and game-over status
   */
  async processStepResult(
    result: StepResult,
    options?: {
      /** Additional context about the step for commit messages */
      context?: string;
      /** Whether to auto-generate graph ops from mechanical changes */
      autoCommitStateChanges?: boolean;
    }
  ): Promise<BridgeStepResult> {
    const commits: BridgeStepResult['commits'] = [];

    if (!result.match) {
      return { step: result, commits, gameOver: this.detectGameOver(result.world) };
    }

    // 1. Process explicit narrative_commit side effects
    const narrativeCommits = result.sideEffects.filter(
      (se) => se.type === NARRATIVE_COMMIT
    );

    for (const se of narrativeCommits) {
      const payload = se.payload as unknown as NarrativeCommitPayload;

      // Stage explicit operations
      if (payload.operations) {
        this.git.add(...payload.operations);
      }

      // Optionally auto-generate ops from mechanical changes
      if (payload.includeStateChanges && result.match.resolvedChanges.length > 0) {
        const stateOps = worldChangesToGraphOps(
          result.match.resolvedChanges,
          result.world
        );
        if (stateOps.length > 0) {
          this.git.add(...stateOps);
        }
      }

      // Commit
      const commit = await this.git.commit(payload.message, {
        tags: [
          ...(payload.tags ?? []),
          'game-event',
          ...(this.activeSession ? [`session-${this.activeSession.id}`] : []),
        ],
        author: this.activeSession?.config.author ?? 'aureum-bridge',
      });

      commits.push({
        id: commit.id,
        message: payload.message,
        operationCount: commit.operations.length,
      });
    }

    // 2. Process narrative_interaction side effects (shorthand)
    const interactions = result.sideEffects.filter(
      (se) => se.type === NARRATIVE_INTERACTION
    );

    if (interactions.length > 0) {
      for (const se of interactions) {
        const payload = se.payload as unknown as NarrativeInteractionPayload;

        const interactionOp: GraphOperation = {
          id: `interaction_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'ADD_INTERACTION',
          timestamp: Date.now(),
          payload: {
            id: `interaction_${Date.now()}`,
            ...payload,
            trigger: payload.trigger ?? `Rule: ${result.match.rule.id}`,
            outcome: payload.outcome ?? result.match.rule.description ?? '',
          },
        };

        this.git.add(interactionOp);
      }

      const interactionMessage = interactions.length === 1
        ? `${(interactions[0].payload as any).type}: ${(interactions[0].payload as any).participants?.join(' vs ')}`
        : `${interactions.length} interactions`;

      const commit = await this.git.commit(interactionMessage, {
        tags: ['game-event', 'interaction'],
        author: this.activeSession?.config.author ?? 'aureum-bridge',
      });

      commits.push({
        id: commit.id,
        message: interactionMessage,
        operationCount: commit.operations.length,
      });
    }

    // 3. Auto-commit mechanical state changes if configured
    const shouldAutoCommit =
      options?.autoCommitStateChanges ??
      this.activeSession?.config.autoCommitStateChanges ??
      false;

    if (
      shouldAutoCommit &&
      narrativeCommits.length === 0 &&
      interactions.length === 0 &&
      result.match.resolvedChanges.length > 0
    ) {
      const stateOps = worldChangesToGraphOps(
        result.match.resolvedChanges,
        result.world
      );

      if (stateOps.length > 0) {
        this.git.add(...stateOps);
        const commit = await this.git.commit(
          `[auto] Rule "${result.match.rule.id}" fired: ${result.match.rule.description ?? result.match.triggerId}`,
          {
            tags: ['game-event', 'auto-state-change'],
            author: 'aureum-bridge-auto',
          }
        );
        commits.push({
          id: commit.id,
          message: `Auto-commit: ${result.match.rule.id}`,
          operationCount: commit.operations.length,
        });
      }
    }

    return {
      step: result,
      commits,
      gameOver: this.detectGameOver(result.world),
    };
  }

  /**
   * Snapshot the current Aureum world state into the narrative graph.
   * Useful for initial game state capture or periodic sync.
   */
  async snapshotWorld(
    world: World,
    message?: string
  ): Promise<string> {
    const { entities, relationships } = aureumWorldToCanon(world);

    const ops: GraphOperation[] = [];

    for (const entity of entities) {
      ops.push({
        id: `snapshot_entity_${entity.id}_${Date.now()}`,
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: entity,
      });
    }

    for (const rel of relationships) {
      ops.push({
        id: `snapshot_rel_${rel.id}_${Date.now()}`,
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: rel,
      });
    }

    this.git.add(...ops);
    const commit = await this.git.commit(
      message ?? `World snapshot: ${entities.length} entities, ${relationships.length} relationships`,
      { tags: ['snapshot', 'world-state'] }
    );

    return commit.id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECTION 2: Narrative → Aureum (graph state → game world)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize an Aureum World from the current narrative graph state.
   * Reads all entities and relationships from the graph and translates them
   * into ECS format.
   */
  initializeWorldFromGraph(options?: {
    /** Only include entities of these types */
    entityTypes?: string[];
    /** Exclude entities with these types */
    excludeTypes?: string[];
  }): World {
    const graphState = this.git.export();
    let entities = graphState.entities;

    // Apply type filters
    if (options?.entityTypes) {
      entities = entities.filter((e) => options.entityTypes!.includes(e.type));
    }
    if (options?.excludeTypes) {
      entities = entities.filter((e) => !options.excludeTypes!.includes(e.type));
    }

    return canonToAureumWorld(entities, graphState.relationships);
  }

  /**
   * Load a game definition from the narrative graph.
   * Expects entities tagged as 'card', 'enemy', 'player', 'game_state', etc.
   * Rules must be stored separately (as structuredJSON on a game entity's meta,
   * or loaded from a ruleSet document).
   */
  loadGameFromGraph(options?: {
    /** Entity ID of the game definition entity (holds rules in meta.rules) */
    gameEntityId?: string;
    /** External rules to use instead of graph-stored rules */
    rules?: any[];
    /** Entity type filter */
    entityTypes?: string[];
  }): { world: World; ruleSet: any } {
    const world = this.initializeWorldFromGraph({
      entityTypes: options?.entityTypes,
    });

    // Try to find rules in the graph (stored as meta.rules on game entity)
    let rules = options?.rules;
    if (!rules && options?.gameEntityId) {
      const graphState = this.git.export();
      const gameEntity = graphState.entities.find(
        (e) => e.id === options.gameEntityId
      );
      if (gameEntity?.rules) {
        rules = gameEntity.rules;
      }
    }

    // Build game JSON for loadGameFromJSON compatibility
    const gameJSON = {
      name: 'graph-loaded-game',
      entities: world.all().map((e) => ({
        id: e.id,
        tags: Array.from(e.tags),
        stats: Object.fromEntries(e.stats),
        links: Object.fromEntries(e.links),
        meta: e.meta,
      })),
      rules: rules ?? [],
    };

    return loadGameFromJSON(gameJSON);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME SESSIONS — Timeline branches for game play
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new game session. Creates a timeline branch for the session.
   */
  async startSession(config: GameSessionConfig): Promise<GameSession> {
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const branchName = `game/${config.gameName}/${sessionId}`;

    // Create and checkout the session branch
    this.git.branch(branchName, { from: config.fromBranch });
    await this.git.checkout(branchName);

    this.activeSession = {
      id: sessionId,
      branch: branchName,
      gameName: config.gameName,
      round: 0,
      startedAt: Date.now(),
      config,
    };

    return this.activeSession;
  }

  /**
   * Advance the session round counter. Call at the start of each game round.
   */
  advanceRound(): number {
    if (!this.activeSession) throw new Error('No active game session');
    this.activeSession.round++;
    return this.activeSession.round;
  }

  /**
   * Get the active game session.
   */
  getActiveSession(): GameSession | null {
    return this.activeSession;
  }

  /**
   * End the current game session.
   * Optionally merge the session branch into the source branch.
   */
  async endSession(options?: {
    /** Merge the session branch back (default: false) */
    merge?: boolean;
    /** Final commit message */
    message?: string;
    /** Game outcome */
    outcome?: 'win' | 'loss' | 'draw' | 'abandoned';
  }): Promise<{
    sessionId: string;
    branch: string;
    rounds: number;
    duration: number;
    merged: boolean;
  }> {
    if (!this.activeSession) throw new Error('No active game session');

    const session = this.activeSession;
    const duration = Date.now() - session.startedAt;

    // Final commit with session summary
    const endMessage =
      options?.message ??
      `Game session ended: ${session.gameName} — ${options?.outcome ?? 'completed'} in ${session.round} rounds`;

    // Create an empty commit as session marker
    const markerOp: GraphOperation = {
      id: `session_end_${session.id}`,
      type: 'UPDATE_ENTITY',
      timestamp: Date.now(),
      payload: {
        entityId: 'session_marker',
        changes: {
          status: options?.outcome ?? 'completed',
          rounds: session.round,
          duration,
        },
      },
    };
    this.git.add(markerOp);
    await this.git.commit(endMessage, {
      tags: ['session-end', `outcome-${options?.outcome ?? 'completed'}`],
    });

    let merged = false;

    if (options?.merge) {
      const fromBranch = session.config.fromBranch ?? 'main';
      await this.git.checkout(fromBranch);
      await this.git.merge(session.branch);
      merged = true;
    }

    this.activeSession = null;

    return {
      sessionId: session.id,
      branch: session.branch,
      rounds: session.round,
      duration,
      merged,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect if the game has ended by checking GAME entity tags.
   */
  private detectGameOver(world: World): 'win' | 'loss' | null {
    const game = world.get('GAME');
    if (!game) return null;
    if (game.tags.has('won')) return 'win';
    if (game.tags.has('lost')) return 'loss';
    return null;
  }
}

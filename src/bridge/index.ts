/**
 * Bridge Module — Aureum ↔ NarrativeGit
 *
 * The connective tissue of the transmedia engine.
 * Enables bidirectional flow between game mechanics and narrative graph.
 */

// Core bridge
export {
  AureumNarrativeBridge,
  NARRATIVE_COMMIT,
  NARRATIVE_INTERACTION,
} from './aureum-narrative-bridge';

// Types
export type {
  NarrativeCommitPayload,
  NarrativeInteractionPayload,
  BridgeStepResult,
  GameSessionConfig,
  GameSession,
} from './aureum-narrative-bridge';

// Entity translation
export {
  aureumToCanonEntity,
  aureumWorldToCanon,
  canonToAureumEntity,
  canonToAureumWorld,
  worldChangesToGraphOps,
  createAddEntityOp,
  createUpdateEntityOp,
} from './entity-translator';

// ADK tools
export {
  allBridgeTools,
  getBridge,
  setBridge,
  initBridgeTool,
  snapshotWorldTool,
  startGameSessionTool,
  bridgeStepTool,
  endGameSessionTool,
  initWorldFromGraphTool,
  getGraphStatusTool,
} from './bridge-adk-tools';

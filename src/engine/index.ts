/**
 * Aureum Rules Engine
 *
 * A generic, serializable rules engine based on the ArgOS DSL
 * and Elm Narrative Engine pattern. World state (entities with
 * tags, stats, links) + rules (trigger → condition → changes → side effects).
 */

// World
export {
  Entity,
  EntityMatcher,
  TagCondition,
  StatCondition,
  LinkCondition,
  StatOperator,
  World,
  createEntity,
} from './world';

// Rules
export {
  Rule,
  RuleSet,
  RuleMatch,
  WorldChange,
  ChangeOperation,
  SideEffect,
  createRuleSet,
  calculateSpecificity,
} from './rules';

// Evaluator
export {
  StepResult,
  TickResult,
  SideEffectHandler,
  evaluate,
  evaluateAll,
  step,
  tick,
  applyChanges,
  registerSideEffectHandler,
  clearSideEffectHandlers,
  handleSideEffects,
  getRegisteredHandlerTypes,
} from './evaluator';

// Parser
export {
  parseEntity,
  parseEntities,
  parseMatcher,
  parseRule,
  parseRules,
} from './parser';

// Serializer
export {
  SerializedEntity,
  SerializedWorld,
  SerializedRuleSet,
  SerializedEngineState,
  serializeEntity,
  deserializeEntity,
  serializeWorld,
  deserializeWorld,
  serializeRuleSet,
  deserializeRuleSet,
  serializeState,
  deserializeState,
  toJSON,
  fromJSON,
} from './serializer';

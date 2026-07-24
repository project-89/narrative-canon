/**
 * Query System Export Index
 * Easy access to advanced graph querying capabilities
 */

export { GraphQueryEngine } from './graph-query-engine';
export type {
  LocationEventQuery,
  ObjectInteractionQuery,
  EntityPathQuery,
  TemporalEventQuery,
  LocationEvent,
  ObjectInteraction,
  EntityPath,
  TemporalEvent
} from './graph-query-engine';

export { LLMQueryInterface } from './llm-query-interface';
export type {
  LLMQueryResult
} from './llm-query-interface';
export {
  LLMLocationEventQuerySchema,
  LLMObjectInteractionQuerySchema,
  LLMEntityPathQuerySchema,
  LLMTemporalEventQuerySchema,
  LLMNaturalLanguageQuerySchema,
  QUERY_PATTERNS
} from './llm-query-interface';

// Example usage patterns for documentation
export const EXAMPLE_QUERIES = {
  // Find all events that happened at a location
  eventsAtLocation: {
    locationName: 'Dark Castle',
    eventTypes: ['combat', 'discovery']
  },
  
  // Find who touched an object
  objectInteractions: {
    objectName: 'Ancient Sword',
    interactionTypes: ['touch', 'wield', 'use']
  },
  
  // Find path between entities
  entityPath: {
    startEntityId: 'alice',
    endEntityId: 'bob',
    maxHops: 3
  },
  
  // Temporal event queries
  temporalEvents: {
    entityId: 'alice',
    sequenceRange: { start: 1, end: 10 },
    timeRange: { start: new Date('2024-01-01'), end: new Date('2024-12-31') }
  }
};
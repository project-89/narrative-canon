/**
 * LLM-Friendly Query Interface for Narrative Canon
 * Enables LLMs to query the graph using natural language and structured schemas
 */

import { GraphQueryEngine } from './graph-query-engine';
import { z } from 'zod';

// Enhanced query schemas with wildcard support
export const LLMLocationEventQuerySchema = z.object({
  locationId: z.string().optional(),
  locationName: z.string().optional(),
  eventTypes: z.array(z.string()).optional().describe("Event types to filter by, or ['*'] for all types"),
  timeRange: z.object({
    start: z.string().optional().describe("ISO date string"),
    end: z.string().optional().describe("ISO date string")
  }).optional(),
  participants: z.array(z.string()).optional().describe("Entity IDs that must participate, or ['*'] for any")
});

export const LLMObjectInteractionQuerySchema = z.object({
  objectId: z.string().optional(),
  objectName: z.string().optional(),
  interactionTypes: z.array(z.string()).optional().describe("Interaction types like 'touch', 'wield', 'use', or ['*'] for all"),
  participants: z.array(z.string()).optional().describe("Entity IDs to filter by, or ['*'] for all"),
  timeRange: z.object({
    start: z.string().optional(),
    end: z.string().optional()
  }).optional()
});

export const LLMEntityPathQuerySchema = z.object({
  startEntityId: z.string().describe("Starting entity ID"),
  endEntityId: z.string().describe("Target entity ID"),
  maxHops: z.number().optional().default(6).describe("Maximum relationship hops to traverse"),
  relationshipTypes: z.array(z.string()).optional().describe("Relationship types to follow, or ['*'] for all types")
});

export const LLMTemporalEventQuerySchema = z.object({
  entityId: z.string().optional().describe("Entity that must be involved"),
  locationId: z.string().optional(),
  locationName: z.string().optional(),
  eventTypes: z.array(z.string()).optional().describe("Event types to include, or ['*'] for all"),
  sequenceRange: z.object({
    start: z.number().optional(),
    end: z.number().optional()
  }).optional(),
  timeRange: z.object({
    start: z.string().optional(),
    end: z.string().optional()
  }).optional(),
  participants: z.array(z.string()).optional().describe("Required participants, or ['*'] for any")
});

export const LLMNaturalLanguageQuerySchema = z.object({
  query: z.string().describe("Natural language query about the narrative"),
  queryType: z.enum(['location_events', 'object_interactions', 'entity_path', 'temporal_events', 'custom']).describe("Type of query to execute"),
  parameters: z.record(z.any()).optional().describe("Structured parameters extracted from natural language")
});

// Natural language query patterns
export const QUERY_PATTERNS = {
  location_events: [
    "What happened at {location}?",
    "All events at {location}",
    "Events in {location}",
    "What occurred in the {location}?",
    "List all {event_type} events at {location}",
    "Show me everything that happened at {location}"
  ],
  object_interactions: [
    "Who touched {object}?",
    "Who interacted with {object}?",
    "What happened to {object}?",
    "Who used {object}?",
    "Show all interactions with {object}",
    "Who has been near {object}?"
  ],
  entity_path: [
    "How are {entity1} and {entity2} connected?",
    "What's the relationship between {entity1} and {entity2}?",
    "How do {entity1} and {entity2} know each other?",
    "Find the path from {entity1} to {entity2}",
    "Connect {entity1} to {entity2}"
  ],
  temporal_events: [
    "What did {entity} do?",
    "Show {entity}'s timeline",
    "Events involving {entity}",
    "What happened to {entity}?",
    "Trace {entity} through the story"
  ]
};

export interface LLMQueryResult {
  queryType: string;
  naturalLanguage: string;
  results: any[];
  resultCount: number;
  executionTime: number;
  explanation: string;
  suggestedFollowups: string[];
}

export class LLMQueryInterface {
  private queryEngine: GraphQueryEngine;

  constructor(queryEngine: GraphQueryEngine) {
    this.queryEngine = queryEngine;
  }

  /**
   * Main LLM entry point - parse natural language and execute query
   */
  async executeNaturalLanguageQuery(input: string): Promise<LLMQueryResult> {
    const startTime = Date.now();
    
    // Parse the natural language query
    const parsedQuery = await this.parseNaturalLanguageQuery(input);
    
    let results: any[] = [];
    let explanation = "";
    let suggestedFollowups: string[] = [];

    try {
      switch (parsedQuery.queryType) {
        case 'location_events':
          results = await this.executeLocationQuery(parsedQuery.parameters);
          explanation = `Found ${results.length} events at the specified location.`;
          suggestedFollowups = [
            "Who were the main participants in these events?",
            "What objects were involved in these events?",
            "Show me events before/after this timeframe"
          ];
          break;

        case 'object_interactions':
          results = await this.executeObjectQuery(parsedQuery.parameters);
          explanation = `Found ${results.length} interactions with the specified object.`;
          suggestedFollowups = [
            "Where did these interactions take place?",
            "What other objects did these people interact with?",
            "Show the timeline of these interactions"
          ];
          break;

        case 'entity_path':
          results = await this.executePathQuery(parsedQuery.parameters);
          explanation = `Found ${results.length} relationship paths between the entities.`;
          suggestedFollowups = [
            "What events involved both entities?",
            "How did their relationship change over time?",
            "Who else is connected to these entities?"
          ];
          break;

        case 'temporal_events':
          results = await this.executeTemporalQuery(parsedQuery.parameters);
          explanation = `Found ${results.length} events in the specified timeline.`;
          suggestedFollowups = [
            "What locations were visited during these events?",
            "What objects were encountered?",
            "Show state changes during this period"
          ];
          break;

        default:
          throw new Error(`Unknown query type: ${parsedQuery.queryType}`);
      }
    } catch (error: any) {
      explanation = `Query execution failed: ${error.message}`;
      results = [];
    }

    const executionTime = Date.now() - startTime;

    return {
      queryType: parsedQuery.queryType,
      naturalLanguage: input,
      results,
      resultCount: results.length,
      executionTime,
      explanation,
      suggestedFollowups
    };
  }

  /**
   * Enhanced location query with wildcard support
   */
  async executeLocationQuery(params: any): Promise<any[]> {
    const query = LLMLocationEventQuerySchema.parse(params);
    
    // Handle wildcards
    const eventTypes = this.expandWildcards(query.eventTypes);
    
    return await this.queryEngine.getEventsAtLocation({
      locationId: query.locationId,
      locationName: query.locationName,
      eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
      timeRange: query.timeRange ? {
        start: query.timeRange.start ? new Date(query.timeRange.start) : undefined,
        end: query.timeRange.end ? new Date(query.timeRange.end) : undefined
      } : undefined
    });
  }

  /**
   * Enhanced object interaction query with wildcard support
   */
  async executeObjectQuery(params: any): Promise<any[]> {
    const query = LLMObjectInteractionQuerySchema.parse(params);
    
    const interactionTypes = this.expandWildcards(query.interactionTypes);
    
    return await this.queryEngine.getObjectInteractions({
      objectId: query.objectId,
      objectName: query.objectName,
      interactionTypes: interactionTypes.length > 0 ? interactionTypes : undefined,
      timeRange: query.timeRange ? {
        start: query.timeRange.start ? new Date(query.timeRange.start) : undefined,
        end: query.timeRange.end ? new Date(query.timeRange.end) : undefined
      } : undefined
    });
  }

  /**
   * Enhanced path query with wildcard support
   */
  async executePathQuery(params: any): Promise<any[]> {
    const query = LLMEntityPathQuerySchema.parse(params);
    
    const relationshipTypes = this.expandWildcards(query.relationshipTypes);
    
    return await this.queryEngine.findEntityPath({
      startEntityId: query.startEntityId,
      endEntityId: query.endEntityId,
      maxHops: query.maxHops,
      relationshipTypes: relationshipTypes.length > 0 ? relationshipTypes : undefined
    });
  }

  /**
   * Enhanced temporal query with wildcard support
   */
  async executeTemporalQuery(params: any): Promise<any[]> {
    const query = LLMTemporalEventQuerySchema.parse(params);
    
    const eventTypes = this.expandWildcards(query.eventTypes);
    
    return await this.queryEngine.getTemporalEvents({
      entityId: query.entityId,
      locationId: query.locationId,
      sequenceRange: query.sequenceRange,
      timeRange: query.timeRange ? {
        start: query.timeRange.start ? new Date(query.timeRange.start) : undefined,
        end: query.timeRange.end ? new Date(query.timeRange.end) : undefined
      } : undefined
    });
  }

  /**
   * Parse natural language into structured query
   */
  private async parseNaturalLanguageQuery(input: string): Promise<{
    queryType: string;
    parameters: any;
  }> {
    const normalizedInput = input.toLowerCase().trim();
    
    // Handle empty queries
    if (!normalizedInput) {
      return {
        queryType: 'temporal_events',
        parameters: { entityIds: [], eventTypes: [] } // Empty parameters for empty query
      };
    }

    // Temporal event patterns (check first to avoid conflicts)
    if (this.matchesPattern(normalizedInput, ['what did', 'timeline', 'events involving', 'trace']) ||
        normalizedInput.includes("'s timeline") || 
        normalizedInput.includes('show timeline') ||
        normalizedInput.match(/what did \w+/)) {
      return {
        queryType: 'temporal_events',
        parameters: this.extractTemporalParameters(input) // Use original input
      };
    }

    // Object interaction patterns
    if (this.matchesPattern(normalizedInput, ['who touched', 'who interacted', 'who used', 'interactions with', 'what happened to'])) {
      const params = this.extractObjectParameters(input); // Use original input with capitalization
      return {
        queryType: 'object_interactions',
        parameters: params
      };
    }

    // Entity path patterns
    if (this.matchesPattern(normalizedInput, ['how are', 'relationship between', 'connected', 'path from', 'connect'])) {
      return {
        queryType: 'entity_path',
        parameters: this.extractPathParameters(input) // Use original input
      };
    }

    // Location event patterns
    if (this.matchesPattern(normalizedInput, ['what happened at', 'events at', 'occurred in', 'happened in', 'events in', 'show me everything', 'show me what'])) {
      const params = this.extractLocationParameters(input); // Use original input with capitalization
      return {
        queryType: 'location_events',
        parameters: params
      };
    }

    // Default to temporal events if no pattern matches
    const fallbackParams = this.extractTemporalParameters(input);
    if (!fallbackParams.entityId) {
      const aboutMatch = input.match(/about\s+(\w+)/i);
      if (aboutMatch) {
        fallbackParams.entityId = aboutMatch[1].toLowerCase();
      }
    }

    return {
      queryType: 'temporal_events',
      parameters: fallbackParams
    };
  }

  /**
   * Expand wildcard arrays - if contains '*', return empty array (means "all")
   */
  private expandWildcards(arr?: string[]): string[] {
    if (!arr || arr.length === 0) return [];
    if (arr.includes('*')) return []; // Empty array means "all" in our query engine
    return arr;
  }

  /**
   * Check if input matches any of the given patterns
   */
  private matchesPattern(input: string, patterns: string[]): boolean {
    return patterns.some(pattern => input.includes(pattern));
  }

  /**
   * Extract location-related parameters from natural language
   */
  private extractLocationParameters(input: string): any {
    const params: any = {};
    
    // Extract location name (improved pattern matching)
    // Look for patterns like "at Neo-Tokyo", "in the headquarters", etc.
    const patterns = [
      /(?:at|in)\s+(?:the\s+)?([A-Z][a-z]+-[A-Z][a-z]+)/,  // Neo-Tokyo pattern
      /(?:at|in)\s+(?:the\s+)?([A-Z][a-z]+\s+[A-Z][a-z]+)/,  // Oneirocom Headquarters pattern
      /(?:at|in)\s+(?:the\s+)?([A-Z][^?\s,]+(?:\s+[A-Z][^?\s,]+)*)/,  // General capitalized
      /(?:at|in)\s+([a-z]+(?:\s+[a-z]+)*)/  // lowercase locations
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        const cleaned = match[1].trim().replace(/^(the\s+)/i, '');
        params.locationName = cleaned;
        break;
      }
    }

    // Extract event types
    const eventTypeMatch = input.match(/(combat|battle|discovery|magical|travel|interaction|stealth|hacking)\s+events/);
    if (eventTypeMatch) {
      params.eventTypes = [eventTypeMatch[1]];
    } else if (input.includes('* events') || input.includes('all events')) {
      params.eventTypes = ['*'];
    }

    return params;
  }

  /**
   * Extract object-related parameters from natural language
   */
  private extractObjectParameters(input: string): any {
    const params: any = {};
    
    // Extract object name (improved pattern matching)
    const patterns = [
      /interactions?\s+with\s+(?:the\s+)?([A-Za-z][^?\s,]*(?:\s+[A-Za-z][^?\s,]*)?)/i,
      /(?:touched|interacted with|used|happened to)\s+(?:the\s+)?([A-Z][a-z]+\s+[A-Z][a-z]+)/,  // "touched the Neural Sword"
      /(?:touched|interacted with|used|happened to)\s+(?:the\s+)?([A-Z][^?\s,]+)/,  // "touched the Blade"
      /(?:with|to)\s+(?:the\s+)?([A-Z][a-z]+\s+[A-Z][a-z]+)/,  // "with the Neural Sword"
      /(?:the\s+)?([A-Z][a-z]+\s+[A-Z][a-z]+)/,   // "Neural Sword"
      /(?:touched|used|interacted)\s+(?:with\s+)?(?:the\s+)?([a-z]+\s+[a-z]+)/,   // "touched neural sword"
      /(?:the\s+)?([a-z]+)/   // fallback for single words
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        const cleaned = match[1].trim().replace(/^(the\s+)/i, '');
        params.objectName = cleaned;
        break;
      }
    }

    // Extract interaction types
    if (input.includes('touched')) {
      params.interactionTypes = ['touch', 'touched'];
    } else if (input.includes('used')) {
      params.interactionTypes = ['use', 'used', 'wield'];
    } else if (input.includes('interacted')) {
      params.interactionTypes = ['*']; // All interaction types
    } else if (input.includes('* interactions') || input.includes('all interactions')) {
      params.interactionTypes = ['*'];
    }

    return params;
  }

  /**
   * Extract path-related parameters from natural language
   */
  private extractPathParameters(input: string): any {
    const params: any = {};
    
    // Extract entity names (improved pattern)
    let entities = input.match(/(?:between|from|connect)\s+(\w+)\s+(?:and|to)\s+(\w+)/i);
    if (entities) {
      params.startEntityId = entities[1].toLowerCase();
      params.endEntityId = entities[2].toLowerCase();
    } else {
      // Try other patterns
      const patterns = [
        /(\w+)\s+and\s+(\w+)\s+(?:connected|relationship)/i,
        /(?:path.*?from|connect)\s+(\w+)\s+(?:to|and)\s+(\w+)/i,
        /(\w+).*?(\w+).*?(?:connected|related|relationship)/i
      ];
      
      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match && match[1] !== match[2]) {
          params.startEntityId = match[1].toLowerCase();
          params.endEntityId = match[2].toLowerCase();
          break;
        }
      }
    }

    return params;
  }

  /**
   * Extract temporal-related parameters from natural language
   */
  private extractTemporalParameters(input: string): any {
    const params: any = {};
    
    // Extract entity name (improved pattern)
    let entityMatch = input.match(/(?:what did|timeline|involving|trace)\s+(\w+)/i);
    if (entityMatch) {
      params.entityId = entityMatch[1].toLowerCase();
    } else {
      // Try other patterns
      const patterns = [
        /(\w+)'s\s+timeline/i,
        /events\s+involving\s+(\w+)/i,
        /show\s+(\w+)/i,
        /(\w+)\s+(?:do|did|timeline|events)/i,
        /about\s+(\w+)/i
      ];
      
      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
          params.entityId = match[1].toLowerCase();
          break;
        }
      }
    }

    return params;
  }

  /**
   * Get available query types and examples for LLM training
   */
  getQueryExamples(): Record<string, string[]> {
    return {
      location_events: [
        "What happened at the Dark Castle?",
        "Show me all combat events at the castle",
        "Events at * locations", // Wildcard example
        "All * events in the forest", // All event types
        "What occurred in Neo-Tokyo?"
      ],
      object_interactions: [
        "Who touched the Ancient Sword?",
        "Show all * interactions with the sword", // All interaction types
        "What happened to the magic ring?",
        "Who used the portal device?",
        "All people who interacted with *" // All objects
      ],
      entity_path: [
        "How are Alice and Bob connected?",
        "Find the path from Alice to the sword",
        "What's the relationship between Oneirocom and Alice?",
        "Connect the protagonist to the villain",
        "Show all * relationships between Alice and Bob" // All relationship types
      ],
      temporal_events: [
        "What did Alice do?",
        "Show Bob's timeline",
        "Events involving * characters", // All characters
        "Trace the sword through the story",
        "All * events involving Alice" // All event types
      ]
    };
  }

  /**
   * Get JSON schema for LLM query generation
   */
  getQuerySchemas(): Record<string, any> {
    return {
      location_events: LLMLocationEventQuerySchema,
      object_interactions: LLMObjectInteractionQuerySchema,
      entity_path: LLMEntityPathQuerySchema,
      temporal_events: LLMTemporalEventQuerySchema,
      natural_language: LLMNaturalLanguageQuerySchema
    };
  }
}

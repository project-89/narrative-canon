/**
 * Advanced Graph Query Engine for Narrative Canon
 * Supports complex queries like "all events at location" and "who touched this object"
 */

import { MongoNarrativeAdapter } from '../storage/mongodb-adapter';
import { TemporalNarrativeGraph } from '../core/temporal-graph';

export interface LocationEventQuery {
  locationId?: string;
  locationName?: string;
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  eventTypes?: string[];
}

export interface ObjectInteractionQuery {
  objectId?: string;
  objectName?: string;
  interactionTypes?: string[]; // 'touch', 'use', 'destroy', etc.
  timeRange?: {
    start?: Date;
    end?: Date;
  };
}

export interface EntityPathQuery {
  startEntityId: string;
  endEntityId: string;
  maxHops?: number;
  relationshipTypes?: string[];
}

export interface TemporalEventQuery {
  entityId?: string;
  locationId?: string;
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  sequenceRange?: {
    start?: number;
    end?: number;
  };
  causedBy?: string[]; // Event IDs or scene IDs
}

export interface LocationEvent {
  eventId: string;
  sceneId: string;
  sequence: number;
  description: string;
  participants: string[];
  location: string;
  timestamp?: Date;
  type: string;
}

export interface ObjectInteraction {
  entityId: string;
  entityName: string;
  objectId: string;
  objectName: string;
  interactionType: string;
  eventId: string;
  sceneId: string;
  sequence: number;
  description: string;
  timestamp?: Date;
  evidence: string[];
}

export interface EntityPath {
  path: Array<{
    entityId: string;
    entityName: string;
    relationshipId?: string;
    relationshipType?: string;
    hops: number;
  }>;
  totalHops: number;
  pathDescription: string;
}

export interface TemporalEvent {
  eventId: string;
  sceneId: string;
  sequence: number;
  description: string;
  participants: string[];
  type: string;
  location?: string;
  timestamp?: Date;
  stateChanges: Array<{
    entityId: string;
    entityName: string;
    changeType: string;
    propertyPath: string;
    previousValue: any;
    newValue: any;
  }>;
}

export class GraphQueryEngine {
  private adapter: MongoNarrativeAdapter;
  private temporalGraph?: TemporalNarrativeGraph;

  constructor(adapter: MongoNarrativeAdapter, temporalGraph?: TemporalNarrativeGraph) {
    this.adapter = adapter;
    this.temporalGraph = temporalGraph;
  }

  /**
   * Query: "All events that happened at this location"
   */
  async getEventsAtLocation(query: LocationEventQuery): Promise<LocationEvent[]> {
    const pipeline: any[] = [];

    // Match scenes at the specified location
    const matchConditions: any = {};
    
    if (query.locationName) {
      matchConditions.location = { $regex: query.locationName, $options: 'i' };
    }
    
    if (query.locationId) {
      matchConditions.entities = query.locationId;
    }

    pipeline.push({ $match: matchConditions });

    // Unwind events from scenes
    pipeline.push({ $unwind: '$events' });

    // Filter by event types if specified
    if (query.eventTypes && query.eventTypes.length > 0) {
      pipeline.push({
        $match: { 'events.type': { $in: query.eventTypes } }
      });
    }

    // Add temporal filtering if temporal graph is available
    if (this.temporalGraph && query.timeRange) {
      // We'll integrate with temporal graph data later
    }

    // Project the final structure
    pipeline.push({
      $project: {
        eventId: '$events.eventId',
        sceneId: '$sceneId',
        sequence: '$events.sequence',
        description: '$events.description',
        participants: '$events.participants',
        location: '$location',
        type: '$events.type',
        sceneSequence: '$sequence'
      }
    });

    // Sort by scene sequence and event sequence
    pipeline.push({
      $sort: { sceneSequence: 1, sequence: 1 }
    });

    const results = await this.adapter.SceneModel.aggregate(pipeline);
    
    return results.map(r => ({
      eventId: r.eventId,
      sceneId: r.sceneId,
      sequence: r.sequence,
      description: r.description,
      participants: r.participants || [],
      location: r.location,
      type: r.type
    }));
  }

  /**
   * Query: "All people that have touched this object, and the events where they did"
   */
  async getObjectInteractions(query: ObjectInteractionQuery): Promise<ObjectInteraction[]> {
    const interactions: ObjectInteraction[] = [];

    // Find the object entity (check name and aliases)
    let objectEntity;
    if (query.objectId) {
      objectEntity = await this.adapter.EntityModel.findOne({ entityId: query.objectId });
    } else if (query.objectName) {
      objectEntity = await this.adapter.EntityModel.findOne({
        $or: [
          { name: { $regex: query.objectName, $options: 'i' } },
          { aliases: { $regex: query.objectName, $options: 'i' } }
        ]
      });
    }

    if (!objectEntity) {
      return [];
    }

    // Find all relationships involving this object
    const relationships = await this.adapter.RelationshipModel.find({
      $or: [
        { sourceEntityId: objectEntity.entityId },
        { targetEntityId: objectEntity.entityId }
      ]
    });

    // Filter by interaction types if specified
    const relevantRelationships = query.interactionTypes 
      ? relationships.filter(rel => 
          query.interactionTypes!.some(type => 
            rel.relationshipType.toLowerCase().includes(type.toLowerCase()) ||
            rel.description?.toLowerCase().includes(type.toLowerCase())
          )
        )
      : relationships;

    // For each relationship, find the scenes and events where the interaction occurred
    for (const rel of relevantRelationships) {
      const interactingEntityId = rel.sourceEntityId === objectEntity.entityId 
        ? rel.targetEntityId 
        : rel.sourceEntityId;

      const interactingEntity = await this.adapter.EntityModel.findOne({ 
        entityId: interactingEntityId 
      });

      if (!interactingEntity || interactingEntity.type !== 'character') {
        continue; // Only track character interactions
      }

      // Find scenes where both entities appear
      const scenes = await this.adapter.SceneModel.find({
        $and: [
          { characters: interactingEntityId },
          { entities: objectEntity.entityId }
        ]
      });

      // Extract events from these scenes that involve the interaction
      for (const scene of scenes) {
        for (const event of scene.events) {
          if (event.participants.includes(interactingEntityId)) {
            // Check if the event description suggests interaction with the object
            const eventDesc = event.description.toLowerCase();
            const objectNames = [objectEntity.name, ...objectEntity.aliases].map(n => n.toLowerCase());
            
            const mentionsObject = objectNames.some(name => eventDesc.includes(name));
            
            if (mentionsObject) {
              interactions.push({
                entityId: interactingEntity.entityId,
                entityName: interactingEntity.name,
                objectId: objectEntity.entityId,
                objectName: objectEntity.name,
                interactionType: rel.relationshipType,
                eventId: event.eventId,
                sceneId: scene.sceneId,
                sequence: event.sequence,
                description: event.description,
                evidence: [`Relationship: ${rel.description}`, `Scene: ${scene.description}`]
              });
            }
          }
        }
      }
    }

    // Sort by chronological order
    interactions.sort((a, b) => a.sequence - b.sequence);

    return interactions;
  }

  /**
   * Find path between two entities through relationships
   */
  async findEntityPath(query: EntityPathQuery): Promise<EntityPath[]> {
    const maxHops = query.maxHops || 6;
    const visitedPaths: Map<string, EntityPath[]> = new Map();
    
    // Use MongoDB aggregation for graph traversal
    const pipeline = [
      {
        $match: { entityId: query.startEntityId }
      },
      {
        $graphLookup: {
          from: 'narrativerelationships',
          startWith: '$entityId',
          connectFromField: 'targetEntityId',
          connectToField: 'sourceEntityId',
          as: 'forwardConnections',
          maxDepth: maxHops,
          depthField: 'depth'
        }
      },
      {
        $graphLookup: {
          from: 'narrativerelationships',
          startWith: '$entityId',
          connectFromField: 'sourceEntityId',
          connectToField: 'targetEntityId',
          as: 'backwardConnections',
          maxDepth: maxHops,
          depthField: 'depth'
        }
      }
    ];

    const results = await this.adapter.EntityModel.aggregate(pipeline);
    
    if (results.length === 0) {
      return [];
    }

    const paths: EntityPath[] = [];
    const allConnections = [...results[0].forwardConnections, ...results[0].backwardConnections];

    // Process connections to find paths to target entity
    for (const connection of allConnections) {
      if (connection.targetEntityId === query.endEntityId || 
          connection.sourceEntityId === query.endEntityId) {
        
        // Get entity names for the path
        const sourceEntity = await this.adapter.EntityModel.findOne({ 
          entityId: connection.sourceEntityId 
        });
        const targetEntity = await this.adapter.EntityModel.findOne({ 
          entityId: connection.targetEntityId 
        });

        if (sourceEntity && targetEntity) {
          // Ensure the path starts with the query start entity
          const startsWithQueryEntity = connection.sourceEntityId === query.startEntityId;
          
          paths.push({
            path: startsWithQueryEntity ? [
              {
                entityId: connection.sourceEntityId,
                entityName: sourceEntity.name,
                hops: 0
              },
              {
                entityId: connection.targetEntityId,
                entityName: targetEntity.name,
                relationshipId: connection.relationshipId,
                relationshipType: connection.relationshipType,
                hops: 1
              }
            ] : [
              {
                entityId: connection.targetEntityId,
                entityName: targetEntity.name,
                hops: 0
              },
              {
                entityId: connection.sourceEntityId,
                entityName: sourceEntity.name,
                relationshipId: connection.relationshipId,
                relationshipType: connection.relationshipType,
                hops: 1
              }
            ],
            totalHops: 1,
            pathDescription: startsWithQueryEntity 
              ? `${sourceEntity.name} → [${connection.relationshipType}] → ${targetEntity.name}`
              : `${targetEntity.name} → [${connection.relationshipType}] → ${sourceEntity.name}`
          });
        }
      }
    }

    return paths;
  }

  /**
   * Advanced temporal event queries integrating with temporal graph
   */
  async getTemporalEvents(query: TemporalEventQuery): Promise<TemporalEvent[]> {
    // Check if this is a completely empty query (no meaningful filters)
    const hasFilters = !!(query.entityId || query.locationId || query.sequenceRange || query.timeRange);
    
    // For empty queries, return empty results
    if (!hasFilters) {
      return [];
    }

    const events: TemporalEvent[] = [];

    // Base MongoDB query for scenes
    const sceneQuery: any = {};
    
    if (query.entityId) {
      sceneQuery.$or = [
        { characters: query.entityId },
        { entities: query.entityId }
      ];
    }

    if (query.locationId) {
      sceneQuery.entities = query.locationId;
    }

    const scenes = await this.adapter.SceneModel.find(sceneQuery).sort({ sequence: 1 });

    // Process each scene's events
    for (const scene of scenes) {
      for (const event of scene.events) {
        // Apply event-level sequence filtering
        if (query.sequenceRange) {
          const start = query.sequenceRange.start || 0;
          const end = query.sequenceRange.end || Number.MAX_SAFE_INTEGER;
          if (event.sequence < start || event.sequence > end) {
            continue;
          }
        }
        const temporalEvent: TemporalEvent = {
          eventId: event.eventId,
          sceneId: scene.sceneId,
          sequence: event.sequence,
          description: event.description,
          participants: event.participants,
          type: event.type,
          location: scene.location,
          stateChanges: []
        };

        // Add state changes from scene
        for (const stateChange of scene.stateChanges) {
          if (stateChange.sequence === event.sequence) {
            const entity = await this.adapter.EntityModel.findOne({ 
              entityId: stateChange.entityId 
            });
            
            if (entity) {
              temporalEvent.stateChanges.push({
                entityId: stateChange.entityId,
                entityName: entity.name,
                changeType: stateChange.changeType,
                propertyPath: stateChange.description, // Using description as property path
                previousValue: null, // Would need to track this
                newValue: stateChange.properties
              });
            }
          }
        }

        // Integrate with temporal graph if available
        if (this.temporalGraph) {
          // Add temporal graph state changes
          const graphChanges = this.temporalGraph.getEntityStateChanges(query.entityId || '');
          for (const change of graphChanges) {
            if (change.causedBy?.sceneId === scene.sceneId) {
              temporalEvent.stateChanges.push({
                entityId: change.entityId!,
                entityName: change.entityId!, // Would get from entity lookup
                changeType: change.changeType,
                propertyPath: change.propertyPath || '',
                previousValue: change.previousValue,
                newValue: change.newValue
              });
            }
          }
        }

        events.push(temporalEvent);
      }
    }

    return events;
  }

  /**
   * Get all entities that were present at a specific event
   */
  async getEntitiesAtEvent(eventId: string): Promise<Array<{ entityId: string; entityName: string; role: string }>> {
    const scene = await this.adapter.SceneModel.findOne({ 
      'events.eventId': eventId 
    });

    if (!scene) {
      return [];
    }

    const event = scene.events.find(e => e.eventId === eventId);
    if (!event) {
      return [];
    }

    const entityInfos = [];

    // Get character participants
    for (const charId of event.participants) {
      const entity = await this.adapter.EntityModel.findOne({ entityId: charId });
      if (entity) {
        entityInfos.push({
          entityId: charId,
          entityName: entity.name,
          role: 'participant'
        });
      }
    }

    // Get location entities
    for (const entityId of scene.entities) {
      const entity = await this.adapter.EntityModel.findOne({ entityId: entityId });
      if (entity) {
        entityInfos.push({
          entityId: entityId,
          entityName: entity.name,
          role: entity.type === 'location' ? 'location' : 'object'
        });
      }
    }

    return entityInfos;
  }

  /**
   * Complex query builder for custom graph patterns
   */
  async executeCustomQuery(mongoQuery: any[]): Promise<any[]> {
    // Allow execution of custom MongoDB aggregation pipelines
    return await this.adapter.EntityModel.aggregate(mongoQuery);
  }
}
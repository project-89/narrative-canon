/**
 * Graph visualization and export tools for MCP server
 */

import { MongoNarrativeAdapter } from '../../src/storage/mongodb-adapter.js';

export interface GraphVisualizationData {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    group: string;
    significance?: string;
    properties?: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    type: string;
    strength?: number;
    confidence?: number;
  }>;
  metadata: {
    totalNodes: number;
    totalEdges: number;
    nodeTypes: Record<string, number>;
    edgeTypes: Record<string, number>;
  };
}

export interface TimelineData {
  events: Array<{
    id: string;
    title: string;
    description: string;
    sequence: number;
    type: string;
    location?: string;
    participants: string[];
    timestamp?: string;
    sceneId: string;
  }>;
  sequences: Array<{
    sceneId: string;
    title: string;
    sequence: number;
    location?: string;
    eventCount: number;
  }>;
}

export class VisualizationTools {
  constructor(private adapter: MongoNarrativeAdapter) {}

  /**
   * Generate graph visualization data for entities and relationships
   */
  async generateGraphVisualization(options: {
    entityTypes?: string[];
    relationshipTypes?: string[];
    maxNodes?: number;
    includeOrphans?: boolean;
    centerEntity?: string;
    maxDepth?: number;
  } = {}): Promise<GraphVisualizationData> {
    const {
      entityTypes,
      relationshipTypes,
      maxNodes = 500,
      includeOrphans = false,
      centerEntity,
      maxDepth = 3
    } = options;

    // Build entity query
    const entityQuery: any = {};
    if (entityTypes && entityTypes.length > 0) {
      entityQuery.type = { $in: entityTypes };
    }

    // Build relationship query
    const relationshipQuery: any = {};
    if (relationshipTypes && relationshipTypes.length > 0) {
      relationshipQuery.relationshipType = { $in: relationshipTypes };
    }

    let entities;
    let relationships;

    if (centerEntity) {
      // Get entities within maxDepth of center entity
      const connectedEntities = await this.getConnectedEntities(centerEntity, maxDepth);
      entityQuery.entityId = { $in: connectedEntities };
      
      entities = await this.adapter.EntityModel.find(entityQuery).limit(maxNodes);
      
      // Get relationships between these entities
      const entityIds = entities.map(e => e.entityId);
      relationshipQuery.$and = [
        { sourceEntityId: { $in: entityIds } },
        { targetEntityId: { $in: entityIds } }
      ];
      relationships = await this.adapter.RelationshipModel.find(relationshipQuery);
    } else {
      // Get all entities matching criteria
      entities = await this.adapter.EntityModel.find(entityQuery)
        .sort({ significance: -1, consistencyScore: -1 })
        .limit(maxNodes);

      if (!includeOrphans) {
        // Only include entities that have relationships
        const entityIds = entities.map(e => e.entityId);
        relationshipQuery.$or = [
          { sourceEntityId: { $in: entityIds } },
          { targetEntityId: { $in: entityIds } }
        ];
        relationships = await this.adapter.RelationshipModel.find(relationshipQuery);

        // Filter entities to only those with relationships
        const connectedEntityIds = new Set();
        relationships.forEach(rel => {
          connectedEntityIds.add(rel.sourceEntityId);
          connectedEntityIds.add(rel.targetEntityId);
        });
        entities = entities.filter(e => connectedEntityIds.has(e.entityId));
      } else {
        relationships = await this.adapter.RelationshipModel.find(relationshipQuery);
      }
    }

    // Convert to visualization format
    const nodes = entities.map(entity => ({
      id: entity.entityId,
      label: entity.name,
      type: entity.type,
      group: entity.type,
      significance: entity.significance,
      properties: {
        aliases: entity.aliases,
        canonicalStatus: entity.canonicalStatus,
        consistencyScore: entity.consistencyScore,
        traits: entity.traits
      }
    }));

    const edges = relationships.map(rel => ({
      id: rel.relationshipId,
      source: rel.sourceEntityId,
      target: rel.targetEntityId,
      label: rel.relationshipType,
      type: rel.relationshipType,
      strength: rel.strength,
      confidence: rel.confidenceScore
    }));

    // Generate metadata
    const nodeTypes: Record<string, number> = {};
    const edgeTypes: Record<string, number> = {};

    nodes.forEach(node => {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    });

    edges.forEach(edge => {
      edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
    });

    return {
      nodes,
      edges,
      metadata: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodeTypes,
        edgeTypes
      }
    };
  }

  /**
   * Generate timeline visualization data
   */
  async generateTimelineVisualization(options: {
    documentId?: string;
    entityId?: string;
    maxEvents?: number;
    eventTypes?: string[];
  } = {}): Promise<TimelineData> {
    const {
      documentId,
      entityId,
      maxEvents = 1000,
      eventTypes
    } = options;

    // Build scene query
    const sceneQuery: any = {};
    if (documentId) {
      sceneQuery.documentId = documentId;
    }
    if (entityId) {
      sceneQuery.$or = [
        { characters: entityId },
        { entities: entityId }
      ];
    }

    const scenes = await this.adapter.SceneModel.find(sceneQuery)
      .sort({ sequence: 1 })
      .limit(maxEvents);

    const events: TimelineData['events'] = [];
    const sequences: TimelineData['sequences'] = [];

    scenes.forEach(scene => {
      // Add scene to sequences
      sequences.push({
        sceneId: scene.sceneId,
        title: scene.title,
        sequence: scene.sequence,
        location: scene.location,
        eventCount: scene.events.length
      });

      // Add events
      scene.events.forEach(event => {
        if (eventTypes && !eventTypes.includes(event.type)) {
          return;
        }

        events.push({
          id: event.eventId,
          title: `${event.type}: ${event.description.substring(0, 50)}...`,
          description: event.description,
          sequence: event.sequence,
          type: event.type,
          location: scene.location,
          participants: event.participants,
          sceneId: scene.sceneId
        });
      });
    });

    return { events, sequences };
  }

  /**
   * Export graph data in various formats
   */
  async exportGraphData(format: 'json' | 'graphml' | 'gexf' | 'cytoscape', options: any = {}) {
    const graphData = await this.generateGraphVisualization(options);

    switch (format) {
      case 'json':
        return JSON.stringify(graphData, null, 2);

      case 'cytoscape':
        return JSON.stringify({
          elements: [
            ...graphData.nodes.map(node => ({
              data: {
                id: node.id,
                label: node.label,
                type: node.type,
                ...node.properties
              }
            })),
            ...graphData.edges.map(edge => ({
              data: {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                label: edge.label,
                type: edge.type,
                strength: edge.strength,
                confidence: edge.confidence
              }
            }))
          ]
        }, null, 2);

      case 'graphml':
        return this.generateGraphML(graphData);

      case 'gexf':
        return this.generateGEXF(graphData);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Get entities connected to a center entity within maxDepth hops
   */
  private async getConnectedEntities(centerEntityId: string, maxDepth: number): Promise<string[]> {
    const visited = new Set<string>();
    const queue: Array<{ entityId: string; depth: number }> = [{ entityId: centerEntityId, depth: 0 }];
    
    while (queue.length > 0) {
      const { entityId, depth } = queue.shift()!;
      
      if (visited.has(entityId) || depth > maxDepth) {
        continue;
      }
      
      visited.add(entityId);
      
      if (depth < maxDepth) {
        // Find connected entities
        const relationships = await this.adapter.RelationshipModel.find({
          $or: [
            { sourceEntityId: entityId },
            { targetEntityId: entityId }
          ]
        });
        
        relationships.forEach(rel => {
          const connectedId = rel.sourceEntityId === entityId ? rel.targetEntityId : rel.sourceEntityId;
          if (!visited.has(connectedId)) {
            queue.push({ entityId: connectedId, depth: depth + 1 });
          }
        });
      }
    }
    
    return Array.from(visited);
  }

  /**
   * Generate GraphML format
   */
  private generateGraphML(data: GraphVisualizationData): string {
    let graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="type" for="node" attr.name="type" attr.type="string"/>
  <key id="significance" for="node" attr.name="significance" attr.type="string"/>
  <key id="label" for="edge" attr.name="label" attr.type="string"/>
  <key id="type" for="edge" attr.name="type" attr.type="string"/>
  <key id="strength" for="edge" attr.name="strength" attr.type="double"/>
  <graph id="narrative" edgedefault="directed">
`;

    // Add nodes
    data.nodes.forEach(node => {
      graphml += `    <node id="${node.id}">
      <data key="label">${this.escapeXml(node.label)}</data>
      <data key="type">${node.type}</data>
      <data key="significance">${node.significance || 'unknown'}</data>
    </node>
`;
    });

    // Add edges
    data.edges.forEach(edge => {
      graphml += `    <edge id="${edge.id}" source="${edge.source}" target="${edge.target}">
      <data key="label">${this.escapeXml(edge.label)}</data>
      <data key="type">${edge.type}</data>
      <data key="strength">${edge.strength || 1.0}</data>
    </edge>
`;
    });

    graphml += `  </graph>
</graphml>`;

    return graphml;
  }

  /**
   * Generate GEXF format
   */
  private generateGEXF(data: GraphVisualizationData): string {
    let gexf = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">
  <meta>
    <creator>Narrative Canon MCP Server</creator>
    <description>Narrative graph data</description>
  </meta>
  <graph mode="static" defaultedgetype="directed">
    <attributes class="node">
      <attribute id="0" title="type" type="string"/>
      <attribute id="1" title="significance" type="string"/>
    </attributes>
    <attributes class="edge">
      <attribute id="0" title="type" type="string"/>
      <attribute id="1" title="strength" type="double"/>
    </attributes>
    <nodes>
`;

    // Add nodes
    data.nodes.forEach(node => {
      gexf += `      <node id="${node.id}" label="${this.escapeXml(node.label)}">
        <attvalues>
          <attvalue for="0" value="${node.type}"/>
          <attvalue for="1" value="${node.significance || 'unknown'}"/>
        </attvalues>
      </node>
`;
    });

    gexf += `    </nodes>
    <edges>
`;

    // Add edges
    data.edges.forEach(edge => {
      gexf += `      <edge id="${edge.id}" source="${edge.source}" target="${edge.target}" label="${this.escapeXml(edge.label)}">
        <attvalues>
          <attvalue for="0" value="${edge.type}"/>
          <attvalue for="1" value="${edge.strength || 1.0}"/>
        </attvalues>
      </edge>
`;
    });

    gexf += `    </edges>
  </graph>
</gexf>`;

    return gexf;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
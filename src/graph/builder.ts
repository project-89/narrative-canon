import { z } from 'zod';

// Define graph schemas
export const NodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  properties: z.record(z.any()).default({}),
});

export const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
  properties: z.record(z.any()).default({}),
});

export const NarrativeGraphSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type NarrativeGraph = z.infer<typeof NarrativeGraphSchema>;

export class NarrativeGraphBuilder {
  private nodes: Map<string, z.infer<typeof NodeSchema>> = new Map();
  private edges: Map<string, z.infer<typeof EdgeSchema>> = new Map();

  addEntity(entity: any): void {
    const node = {
      id: entity.id,
      type: entity.type,
      label: entity.name,
      properties: {
        description: entity.description,
        ...entity.attributes,
      },
    };
    this.nodes.set(node.id, node);
  }

  addEvent(event: any): void {
    const node = {
      id: event.id,
      type: 'event',
      label: event.description.substring(0, 50) + '...',
      properties: {
        fullDescription: event.description,
        timestamp: event.timestamp,
      },
    };
    this.nodes.set(node.id, node);

    // Create edges for participants
    event.participants?.forEach((participantId: string) => {
      this.addEdge(participantId, event.id, 'participates_in');
    });

    // Create edge for location
    if (event.location) {
      this.addEdge(event.location, event.id, 'location_of');
    }
  }

  addScene(scene: any): void {
    const node = {
      id: scene.id,
      type: 'scene',
      label: scene.name || scene.summary || scene.id,
      properties: {
        summary: scene.summary,
        sequence: scene.sequence,
        location: scene.location,
        characters: scene.characters,
        timestamp: new Date(2024, 0, scene.sequence).toISOString(), // Fake timestamp based on sequence
      },
    };
    this.nodes.set(node.id, node);

    // Create edges for characters in scene
    scene.characters?.forEach((characterId: string) => {
      this.addEdge(characterId, scene.id, 'appears_in');
    });

    // Create edge for location
    if (scene.location) {
      this.addEdge(scene.location, scene.id, 'scene_location');
    }
  }

  addRelationship(source: string, target: string, type: string, properties?: any): void {
    this.addEdge(source, target, type, properties);
  }

  addEdge(source: string, target: string, type: string, properties?: any): void {
    const edgeId = `${source}-${type}-${target}`;
    const edge = {
      id: edgeId,
      source,
      target,
      type,
      properties: properties || {},
    };
    this.edges.set(edgeId, edge);
  }

  addTemporalEdge(earlierEvent: string, laterEvent: string): void {
    this.addEdge(earlierEvent, laterEvent, 'happens_before');
  }

  addCausalEdge(cause: string, effect: string): void {
    this.addEdge(cause, effect, 'causes');
  }

  build(): NarrativeGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  // Utility method to create a Cypher query for Neo4j
  toCypher(): string {
    const statements: string[] = [];

    // Create nodes
    this.nodes.forEach(node => {
      const props = Object.entries(node.properties)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(', ');
      
      statements.push(
        `CREATE (n${node.id}:${node.type} {id: '${node.id}', label: '${node.label}'${props ? ', ' + props : ''}})`
      );
    });

    // Create edges
    this.edges.forEach(edge => {
      const props = Object.entries(edge.properties)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(', ');
      
      statements.push(
        `MATCH (a {id: '${edge.source}'}), (b {id: '${edge.target}'}) ` +
        `CREATE (a)-[:${edge.type}${props ? ' {' + props + '}' : ''}]->(b)`
      );
    });

    return statements.join('\n');
  }

  // Export to various formats
  toJSON(): string {
    return JSON.stringify(this.build(), null, 2);
  }

  toDOT(): string {
    const graph = this.build();
    let dot = 'digraph NarrativeGraph {\n';
    
    // Add nodes
    graph.nodes.forEach(node => {
      dot += `  "${node.id}" [label="${node.label}", type="${node.type}"];\n`;
    });
    
    // Add edges
    graph.edges.forEach(edge => {
      dot += `  "${edge.source}" -> "${edge.target}" [label="${edge.type}"];\n`;
    });
    
    dot += '}';
    return dot;
  }
}
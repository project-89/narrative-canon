import * as fs from 'fs';
import * as path from 'path';
import { NarrativeGraph } from '../graph/builder';

export interface NarrativeDocument {
  id: string;
  title: string;
  text: string;
  extracted?: any;
  graph?: NarrativeGraph;
  metadata: {
    created: Date;
    modified: Date;
    version: number;
  };
}

export class FileBasedNarrativeStore {
  private dataDir: string;

  constructor(dataDir: string = './narrative-data') {
    this.dataDir = dataDir;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = ['documents', 'graphs', 'snapshots', 'indices'];
    dirs.forEach(dir => {
      const fullPath = path.join(this.dataDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  // Save a narrative document
  async saveDocument(doc: NarrativeDocument): Promise<void> {
    const docPath = path.join(this.dataDir, 'documents', `${doc.id}.json`);
    fs.writeFileSync(docPath, JSON.stringify(doc, null, 2));
    
    // Update index
    this.updateIndex(doc);
  }

  // Load a narrative document
  async loadDocument(id: string): Promise<NarrativeDocument | null> {
    const docPath = path.join(this.dataDir, 'documents', `${id}.json`);
    if (!fs.existsSync(docPath)) return null;
    
    const data = fs.readFileSync(docPath, 'utf-8');
    return JSON.parse(data);
  }

  // Save extracted graph
  async saveGraph(docId: string, graph: NarrativeGraph): Promise<void> {
    const graphPath = path.join(this.dataDir, 'graphs', `${docId}.json`);
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
    
    // Also save in other formats for debugging
    const dotPath = path.join(this.dataDir, 'graphs', `${docId}.dot`);
    fs.writeFileSync(dotPath, this.graphToDOT(graph));
  }

  // Simple in-memory graph queries using file system
  async queryGraphNodes(docId: string, nodeType?: string): Promise<any[]> {
    const graphPath = path.join(this.dataDir, 'graphs', `${docId}.json`);
    if (!fs.existsSync(graphPath)) return [];
    
    const graph: NarrativeGraph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    
    if (nodeType) {
      return graph.nodes.filter((n: any) => n.type === nodeType);
    }
    return graph.nodes;
  }

  // Find relationships between entities
  async findRelationships(docId: string, entityId: string): Promise<any[]> {
    const graphPath = path.join(this.dataDir, 'graphs', `${docId}.json`);
    if (!fs.existsSync(graphPath)) return [];
    
    const graph: NarrativeGraph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    
    return graph.edges.filter((e: any) => 
      e.source === entityId || e.target === entityId
    );
  }

  // Version control for narratives
  async createSnapshot(docId: string, message: string): Promise<string> {
    const doc = await this.loadDocument(docId);
    if (!doc) throw new Error('Document not found');
    
    const snapshotId = `${docId}_v${doc.metadata.version}_${Date.now()}`;
    const snapshotPath = path.join(this.dataDir, 'snapshots', `${snapshotId}.json`);
    
    const snapshot = {
      ...doc,
      snapshotId,
      snapshotMessage: message,
      snapshotDate: new Date(),
    };
    
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    return snapshotId;
  }

  // Compare two narrative versions
  async compareVersions(docId1: string, docId2: string): Promise<any> {
    const doc1 = await this.loadDocument(docId1);
    const doc2 = await this.loadDocument(docId2);
    
    if (!doc1 || !doc2) throw new Error('Documents not found');
    
    // Simple diff - in real implementation would be more sophisticated
    const diff = {
      textChanged: doc1.text !== doc2.text,
      entitiesAdded: [] as string[],
      entitiesRemoved: [] as string[],
      eventsAdded: [] as string[],
      eventsRemoved: [] as string[],
    };
    
    // Compare extracted data if available
    if (doc1.extracted && doc2.extracted) {
      const entities1 = new Set(doc1.extracted.entities?.map((e: any) => e.id) || []);
      const entities2 = new Set(doc2.extracted.entities?.map((e: any) => e.id) || []);
      
      diff.entitiesAdded = [...entities2].filter(e => !entities1.has(e)) as string[];
      diff.entitiesRemoved = [...entities1].filter(e => !entities2.has(e)) as string[];
    }
    
    return diff;
  }

  // Simple index for quick lookups
  private updateIndex(doc: NarrativeDocument): void {
    const indexPath = path.join(this.dataDir, 'indices', 'documents.json');
    
    let index: any = {};
    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
    
    index[doc.id] = {
      title: doc.title,
      created: doc.metadata.created,
      modified: doc.metadata.modified,
      version: doc.metadata.version,
    };
    
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  // List all documents
  async listDocuments(): Promise<any[]> {
    const indexPath = path.join(this.dataDir, 'indices', 'documents.json');
    if (!fs.existsSync(indexPath)) return [];
    
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    return Object.entries(index).map(([id, data]: [string, any]) => ({
      id,
      ...data,
    }));
  }

  private graphToDOT(graph: NarrativeGraph): string {
    let dot = 'digraph NarrativeGraph {\n';
    
    graph.nodes.forEach((node: any) => {
      dot += `  "${node.id}" [label="${node.label}", type="${node.type}"];\n`;
    });
    
    graph.edges.forEach((edge: any) => {
      dot += `  "${edge.source}" -> "${edge.target}" [label="${edge.type}"];\n`;
    });
    
    dot += '}';
    return dot;
  }
}
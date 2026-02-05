import mongoose, { Schema, Document, Connection } from 'mongoose';
import { z } from 'zod';
import {
  Entity,
  Relationship,
  Scene,
  StateChange,
  NarrativeStructure,
  Event,
} from '../types';

// ============================================================================
// INTERFACES (Following Proxim8 Patterns)
// ============================================================================

export interface INarrativeDocument extends Document {
  documentId: string;
  title: string;
  content: string;
  
  // Extraction metadata
  extractedAt: Date;
  extractionVersion: string;
  llmModel: string;
  
  // Consistency tracking
  canonicalStatus: 'canon' | 'disputed' | 'extracted' | 'validated';
  consistencyScore: number;
  lastValidated?: Date;
  validatedBy?: string;
  
  // Integration with Proxim8
  sourceType: 'lore' | 'mission' | 'manual' | 'generated';
  sourceId?: string; // LoreFragment ID, Mission ID, etc.
  seasonId?: string;
  
  // Metadata following Proxim8 patterns
  tags: string[];
  relatedDocuments: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface INarrativeEntity extends Document {
  entityId: string;
  documentId: string; // Reference to source document
  
  // Core entity data
  name: string;
  type: 'character' | 'location' | 'organization' | 'concept' | 'object' | 'technology';
  description?: string;
  aliases: string[];
  
  // Consistency tracking (Proxim8 pattern)
  canonicalStatus: 'canon' | 'disputed' | 'extracted' | 'validated';
  consistencyScore: number;
  conflictFlags: string[];
  lastValidated?: Date;
  
  // Integration tracking
  sourceFragments: string[]; // LoreFragment IDs
  timelineEvents: string[]; // TimelineEvent IDs
  missionAppearances: string[]; // Mission IDs
  
  // Properties for game integration
  traits: Record<string, any>;
  significance: 'major' | 'minor' | 'background';
  
  // Standard Proxim8 metadata
  tags: string[];
  relatedEntities: string[];
  
  // Entity similarity and merging
  similarEntities: Array<{
    entityId: string;
    similarityScore: number;
    status: 'potential' | 'reviewed' | 'merged' | 'rejected';
  }>;
  canonicalEntityId?: string; // If this entity was merged into another
  mergedFromEntities: string[]; // If this entity is the result of merging others
  
  createdAt: Date;
  updatedAt: Date;
}

export interface INarrativeRelationship extends Document {
  relationshipId: string;
  documentId: string;
  
  // Relationship data
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  description?: string;
  strength?: number; // 0-1
  
  // Evidence tracking
  supportingFragments: string[];
  contradictingFragments: string[];
  confidenceScore: number; // 0-100
  
  // Timeline context
  establishedIn?: string; // Scene or Event ID
  timeRelevance: 'past' | 'present' | 'future' | 'timeless';
  
  // Proxim8 integration
  canonicalStatus: 'canon' | 'disputed' | 'extracted' | 'validated';
  tags: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface INarrativeScene extends Document {
  sceneId: string;
  documentId: string;
  
  // Scene structure
  title: string;
  sequence: number;
  location?: string;
  description: string;
  
  // Participants
  characters: string[]; // Entity IDs
  entities: string[]; // Non-character entity IDs
  
  // Events in scene
  events: {
    eventId: string;
    sequence: number;
    description: string;
    type: string;
    participants: string[];
  }[];
  
  // State tracking
  stateChanges: {
    entityId: string;
    changeType: 'create' | 'modify' | 'destroy' | 'relocate';
    description: string;
    sequence: number;
    properties: Record<string, any>;
  }[];
  
  // Game integration
  sourceMission?: string;
  sourceFragment?: string;
  timelineEvent?: string;
  
  // Consistency (Proxim8 pattern)
  canonicalStatus: 'canon' | 'disputed' | 'extracted' | 'validated';
  consistencyScore: number;
  
  tags: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SCHEMAS (Following Proxim8 Patterns)
// ============================================================================

const NarrativeDocumentSchema = new Schema<INarrativeDocument>({
  documentId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  
  extractedAt: { type: Date, required: true },
  extractionVersion: { type: String, required: true },
  llmModel: { type: String, required: true },
  
  canonicalStatus: { 
    type: String, 
    enum: ['canon', 'disputed', 'extracted', 'validated'], 
    default: 'extracted',
    index: true
  },
  consistencyScore: { type: Number, min: 0, max: 100, default: 0 },
  lastValidated: Date,
  validatedBy: String,
  
  sourceType: { 
    type: String, 
    enum: ['lore', 'mission', 'manual', 'generated'], 
    required: true,
    index: true
  },
  sourceId: { type: String, index: true },
  seasonId: { type: String, index: true },
  
  tags: [{ type: String, index: true }],
  relatedDocuments: [String],
}, { timestamps: true });

const NarrativeEntitySchema = new Schema<INarrativeEntity>({
  entityId: { type: String, required: true, unique: true, index: true },
  documentId: { type: String, required: true, index: true },
  
  name: { type: String, required: true, index: true },
  type: { 
    type: String, 
    enum: ['character', 'location', 'organization', 'concept', 'object', 'technology'], 
    required: true,
    index: true
  },
  description: String,
  aliases: [String],
  
  canonicalStatus: { 
    type: String, 
    enum: ['canon', 'disputed', 'extracted', 'validated'], 
    default: 'extracted',
    index: true
  },
  consistencyScore: { type: Number, min: 0, max: 100, default: 0, index: true },
  conflictFlags: [String],
  lastValidated: Date,
  
  sourceFragments: [String],
  timelineEvents: [String],
  missionAppearances: [String],
  
  traits: { type: Schema.Types.Mixed, default: {} },
  significance: { 
    type: String, 
    enum: ['major', 'minor', 'background'], 
    default: 'minor',
    index: true
  },
  
  tags: [{ type: String, index: true }],
  relatedEntities: [String],
  
  // Entity similarity and merging
  similarEntities: [{
    entityId: String,
    similarityScore: { type: Number, min: 0, max: 1 },
    status: { 
      type: String, 
      enum: ['potential', 'reviewed', 'merged', 'rejected'],
      default: 'potential'
    }
  }],
  canonicalEntityId: { type: String, index: true },
  mergedFromEntities: [String],
}, { timestamps: true });

const NarrativeRelationshipSchema = new Schema<INarrativeRelationship>({
  relationshipId: { type: String, required: true, unique: true, index: true },
  documentId: { type: String, required: true, index: true },
  
  sourceEntityId: { type: String, required: true, index: true },
  targetEntityId: { type: String, required: true, index: true },
  relationshipType: { type: String, required: true, index: true },
  description: String,
  strength: { type: Number, min: 0, max: 1 },
  
  supportingFragments: [String],
  contradictingFragments: [String],
  confidenceScore: { type: Number, min: 0, max: 100, default: 50 },
  
  establishedIn: String,
  timeRelevance: { 
    type: String, 
    enum: ['past', 'present', 'future', 'timeless'], 
    default: 'timeless',
    index: true
  },
  
  canonicalStatus: { 
    type: String, 
    enum: ['canon', 'disputed', 'extracted', 'validated'], 
    default: 'extracted',
    index: true
  },
  tags: [String],
}, { timestamps: true });

const NarrativeSceneSchema = new Schema<INarrativeScene>({
  sceneId: { type: String, required: true, unique: true, index: true },
  documentId: { type: String, required: true, index: true },
  
  title: { type: String, required: true },
  sequence: { type: Number, required: true, index: true },
  location: String,
  description: { type: String, required: true },
  
  characters: [String],
  entities: [String],
  
  events: [{
    eventId: { type: String, required: true },
    sequence: { type: Number, required: true },
    description: { type: String, required: true },
    type: { type: String, required: true },
    participants: [{ type: String }],
  }],
  
  stateChanges: [{
    entityId: String,
    changeType: { 
      type: String, 
      enum: ['create', 'modify', 'destroy', 'relocate'] 
    },
    description: String,
    sequence: Number,
    properties: Schema.Types.Mixed,
  }],
  
  sourceMission: { type: String },
  sourceFragment: { type: String, index: true },
  timelineEvent: { type: String, index: true },
  
  canonicalStatus: { 
    type: String, 
    enum: ['canon', 'disputed', 'extracted', 'validated'], 
    default: 'extracted',
    index: true
  },
  consistencyScore: { type: Number, min: 0, max: 100, default: 0 },
  
  tags: [String],
}, { timestamps: true });

// Compound indexes following Proxim8 patterns
NarrativeDocumentSchema.index({ sourceType: 1, sourceId: 1 });
NarrativeDocumentSchema.index({ canonicalStatus: 1, consistencyScore: -1 });
NarrativeDocumentSchema.index({ seasonId: 1, canonicalStatus: 1 });

NarrativeEntitySchema.index({ type: 1, canonicalStatus: 1 });
NarrativeEntitySchema.index({ documentId: 1, significance: 1 });
NarrativeEntitySchema.index({ name: 'text', aliases: 'text' }); // Text search

NarrativeRelationshipSchema.index({ sourceEntityId: 1, targetEntityId: 1 });
NarrativeRelationshipSchema.index({ relationshipType: 1, confidenceScore: -1 });

NarrativeSceneSchema.index({ documentId: 1, sequence: 1 });
NarrativeSceneSchema.index({ sourceMission: 1 });

// ============================================================================
// MONGODB ADAPTER IMPLEMENTATION
// ============================================================================

export interface MongoNarrativeAdapterConfig {
  connection?: Connection;
  mongoUrl?: string;
  dbName?: string;
}

export class MongoNarrativeAdapter {
  private connection: Connection;
  public DocumentModel: mongoose.Model<INarrativeDocument>;
  public EntityModel: mongoose.Model<INarrativeEntity>;
  public RelationshipModel: mongoose.Model<INarrativeRelationship>;
  public SceneModel: mongoose.Model<INarrativeScene>;

  constructor(config: MongoNarrativeAdapterConfig) {
    // Use existing connection or create new one
    if (config.connection) {
      this.connection = config.connection;
    } else {
      this.connection = mongoose.createConnection(
        config.mongoUrl || process.env.MONGODB_URI || 'mongodb://localhost:27017',
        {
          dbName: config.dbName || 'proxim8_narrative',
        }
      );
    }

    // Create models on the connection
    this.DocumentModel = this.connection.model('NarrativeDocument', NarrativeDocumentSchema);
    this.EntityModel = this.connection.model('NarrativeEntity', NarrativeEntitySchema);
    this.RelationshipModel = this.connection.model('NarrativeRelationship', NarrativeRelationshipSchema);
    this.SceneModel = this.connection.model('NarrativeScene', NarrativeSceneSchema);
  }

  // ============================================================================
  // DOCUMENT OPERATIONS (Following Proxim8 Controller Patterns)
  // ============================================================================

  async saveNarrativeDocument(
    documentId: string,
    title: string,
    content: string,
    extracted: NarrativeStructure,
    metadata: {
      extractionVersion: string;
      llmModel: string;
      sourceType: 'lore' | 'mission' | 'manual' | 'generated';
      sourceId?: string;
      seasonId?: string;
      tags?: string[];
    }
  ): Promise<string> {
    // Try to use transactions if supported, fallback to regular operations
    try {
      const session = await this.connection.startSession();
      
      try {
        await session.withTransaction(async () => {
          await this.performSaveOperations(documentId, title, content, extracted, metadata, session);
        });
        return documentId;
      } finally {
        await session.endSession();
      }
    } catch (error: any) {
      // If transactions aren't supported (e.g., MongoDB Memory Server), 
      // fallback to regular operations without transaction
      const message = error.message || '';
      if (
        message.includes('Transaction numbers') ||
        message.includes('replica set') ||
        message.includes('Connection operation buffering timed out')
      ) {
        await this.performSaveOperations(documentId, title, content, extracted, metadata);
        return documentId;
      }
      throw error;
    }
  }

  private async performSaveOperations(
    documentId: string,
    title: string,
    content: string,
    extracted: NarrativeStructure,
    metadata: {
      extractionVersion: string;
      llmModel: string;
      sourceType: 'lore' | 'mission' | 'manual' | 'generated';
      sourceId?: string;
      seasonId?: string;
      tags?: string[];
    },
    session?: any
  ): Promise<void> {
    // Save the document
    const doc = new this.DocumentModel({
      documentId,
      title,
      content,
      extractedAt: new Date(),
      ...metadata,
      tags: metadata.tags || [],
      relatedDocuments: [],
    });
    
    const saveOptions = session ? { session } : {};
    await doc.save(saveOptions);

    // Save entities
    if (extracted.entities) {
      const entities = extracted.entities.map(entity => ({
        entityId: `${documentId}_${entity.id}`,
        documentId,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        aliases: entity.aliases || [],
        traits: entity,
        tags: metadata.tags || [],
        relatedEntities: [],
      }));
      
      await this.EntityModel.insertMany(entities, saveOptions);
    }

    // Save relationships
    if (extracted.relationships) {
      const relationships = extracted.relationships.map(rel => ({
        relationshipId: `${documentId}_${rel.id}`,
        documentId,
        sourceEntityId: `${documentId}_${rel.source}`,
        targetEntityId: `${documentId}_${rel.target}`,
        relationshipType: rel.type,
        description: rel.description,
        strength: rel.strength,
        confidenceScore: 75, // Default confidence
        tags: [],
      }));
      
      await this.RelationshipModel.insertMany(relationships, saveOptions);
    }

    // Save scenes
    if (extracted.scenes) {
      const scenes = extracted.scenes.map(scene => ({
        sceneId: `${documentId}_${scene.id}`,
        documentId,
        title: scene.title || `Scene ${scene.sequence}`,
        sequence: scene.sequence,
        location: scene.location,
        description: scene.description,
        characters: scene.characters?.map(c => `${documentId}_${c}`) || [],
        entities: [],
        events: scene.events?.map(e => ({
          eventId: e.id,
          sequence: e.sequence || 0,
          description: e.description,
          type: e.type || 'action',
          participants: e.participants?.map(p => `${documentId}_${p}`) || [],
        })) || [],
        stateChanges: [],
        tags: [],
      }));
      
      await this.SceneModel.insertMany(scenes, saveOptions);
    }
  }

  // ============================================================================
  // QUERY OPERATIONS (Following Proxim8 Pagination Patterns)
  // ============================================================================

  async getEntitiesByType(
    type: string,
    options: {
      page?: number;
      limit?: number;
      canonicalStatus?: string;
      sourceType?: string;
    } = {}
  ): Promise<{ entities: INarrativeEntity[]; total: number; totalPages: number }> {
    const { page = 1, limit = 10, canonicalStatus, sourceType } = options;
    const skip = (page - 1) * limit;

    const query: any = { type };
    if (canonicalStatus) query.canonicalStatus = canonicalStatus;

    // Filter by source type if provided
    if (sourceType) {
      const docs = await this.DocumentModel.find({ sourceType }).select('documentId');
      const docIds = docs.map(d => d.documentId);
      query.documentId = { $in: docIds };
    }

    const [entities, total] = await Promise.all([
      this.EntityModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ consistencyScore: -1, createdAt: -1 }),
      this.EntityModel.countDocuments(query),
    ]);

    return {
      entities,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getEntityRelationships(entityId: string): Promise<INarrativeRelationship[]> {
    return this.RelationshipModel.find({
      $or: [
        { sourceEntityId: entityId },
        { targetEntityId: entityId }
      ]
    }).sort({ confidenceScore: -1 });
  }

  async getDocumentScenes(documentId: string): Promise<INarrativeScene[]> {
    return this.SceneModel.find({ documentId }).sort({ sequence: 1 });
  }

  // ============================================================================
  // CONSISTENCY OPERATIONS (Game Integration)
  // ============================================================================

  async updateConsistencyScore(entityId: string, score: number): Promise<void> {
    await this.EntityModel.updateOne(
      { entityId },
      { consistencyScore: score, lastValidated: new Date() }
    );
  }

  async flagConflict(entityId: string, conflictDescription: string): Promise<void> {
    await this.EntityModel.updateOne(
      { entityId },
      { $addToSet: { conflictFlags: conflictDescription } }
    );
  }

  // ============================================================================
  // INTEGRATION WITH PROXIM8 SYSTEMS
  // ============================================================================

  async linkToLoreFragment(entityId: string, fragmentId: string): Promise<void> {
    await this.EntityModel.updateOne(
      { entityId },
      { $addToSet: { sourceFragments: fragmentId } }
    );
  }

  async linkToTimelineEvent(entityId: string, eventId: string): Promise<void> {
    await this.EntityModel.updateOne(
      { entityId },
      { $addToSet: { timelineEvents: eventId } }
    );
  }

  async linkToMission(entityId: string, missionId: string): Promise<void> {
    await this.EntityModel.updateOne(
      { entityId },
      { $addToSet: { missionAppearances: missionId } }
    );
  }

  // ============================================================================
  // ADVANCED QUERIES (Graph Operations)
  // ============================================================================

  async getConnectedEntities(
    entityId: string, 
    maxDepth: number = 2
  ): Promise<{ entities: INarrativeEntity[]; relationships: INarrativeRelationship[] }> {
    // MongoDB aggregation for graph traversal
    const pipeline = [
      {
        $match: { entityId }
      },
      {
        $graphLookup: {
          from: 'narrativerelationships',
          startWith: '$entityId',
          connectFromField: 'targetEntityId',
          connectToField: 'sourceEntityId',
          as: 'connections',
          maxDepth
        }
      }
    ];

    const results = await this.EntityModel.aggregate(pipeline);
    // Implementation details for processing graph results...
    
    return { entities: [], relationships: [] }; // Simplified return
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

// Export models for direct access if needed
export {
  NarrativeDocumentSchema,
  NarrativeEntitySchema,
  NarrativeRelationshipSchema,
  NarrativeSceneSchema,
};

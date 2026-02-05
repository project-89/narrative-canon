/**
 * MongoDB Storage Adapter
 *
 * Implements the StorageAdapter interface using MongoDB.
 * Good for production, multi-user, and distributed scenarios.
 */

import mongoose, { Schema, Connection, Model } from 'mongoose';
import {
  StorageAdapter,
  Project,
  ProjectData,
  ProjectStats,
  ConversationHistory,
  createEmptyProjectData,
  createDefaultProject,
} from './storage-adapter';

// =============================================================================
// SCHEMAS
// =============================================================================

const ProjectStatsSchema = new Schema({
  entities: { type: Number, default: 0 },
  relationships: { type: Number, default: 0 },
  commits: { type: Number, default: 0 },
  branches: { type: Number, default: 1 },
}, { _id: false });

const ProjectSchema = new Schema({
  projectId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: false, index: true },
  stats: { type: ProjectStatsSchema, default: () => ({}) },
  color: { type: String, default: '#8b5cf6' },
}, { timestamps: true });

const EntitySchema = new Schema({
  entityId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true, index: true },
  description: String,
  backstory: String,
  traits: [String],
  motivations: [String],
  secrets: [String],
  status: { type: String, default: 'draft' },
  imageUrl: String,
  referenceImage: String,
  appearance: String,
  visual: String,
  ideology: String,
}, { timestamps: true });
EntitySchema.index({ entityId: 1, projectId: 1 }, { unique: true });
EntitySchema.index({ projectId: 1, type: 1 });

const RelationshipSchema = new Schema({
  relationshipId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  sourceId: { type: String, required: true, index: true },
  targetId: { type: String, required: true, index: true },
  sourceName: String,
  targetName: String,
  type: { type: String, required: true },
  description: String,
  strength: { type: Number, min: 0, max: 1 },
}, { timestamps: true });
RelationshipSchema.index({ relationshipId: 1, projectId: 1 }, { unique: true });
RelationshipSchema.index({ projectId: 1, sourceId: 1 });
RelationshipSchema.index({ projectId: 1, targetId: 1 });

const InteractionSchema = new Schema({
  interactionId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  prose: String,
  content: String,
  summary: String,
  description: String,
  status: { type: String, default: 'draft' },
  participants: [String],
  participantIds: [String],
  location: String,
  locationId: String,
  events: [Schema.Types.Mixed],
  imageUrl: String,
  position: Number,
  frames: [Schema.Types.Mixed],
  storyDiff: Schema.Types.Mixed,
}, { timestamps: true });
InteractionSchema.index({ interactionId: 1, projectId: 1 }, { unique: true });

const CommitSchema = new Schema({
  commitId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  hash: String,
  message: { type: String, required: true },
  branch: { type: String, required: true, index: true },
  author: String,
  tags: [String],
  operations: [Schema.Types.Mixed],
  delta: Schema.Types.Mixed,
  stats: Schema.Types.Mixed,
  snapshot: Schema.Types.Mixed,
  metrics: Schema.Types.Mixed,
  storyConsistency: Schema.Types.Mixed,
  isMergeCommit: Boolean,
  mergedFrom: String,
  resolutions: [Schema.Types.Mixed],
}, { timestamps: true });
CommitSchema.index({ commitId: 1, projectId: 1 }, { unique: true });

const BranchSchema = new Schema({
  branchId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: String,
  color: String,
  isActive: { type: Boolean, default: false },
  isCanon: { type: Boolean, default: false },
  probability: Number,
  commitCount: { type: Number, default: 0 },
  lastCommit: String,
  parentBranch: String,
}, { timestamps: true });
BranchSchema.index({ branchId: 1, projectId: 1 }, { unique: true });

const ConversationHistorySchema = new Schema({
  projectId: { type: String, required: true, unique: true, index: true },
  messages: [Schema.Types.Mixed],
  worldContext: {
    themes: [String],
    tone: String,
    influences: [String],
  },
  currentFocus: [String],
  userDecisions: [Schema.Types.Mixed],
  lastUpdated: { type: Number, default: Date.now },
}, { timestamps: true });

// =============================================================================
// ADAPTER IMPLEMENTATION
// =============================================================================

export class MongoProjectAdapter implements StorageAdapter {
  private connection: Connection;
  private isConnected: boolean = false;
  private ProjectModel: Model<any>;
  private EntityModel: Model<any>;
  private RelationshipModel: Model<any>;
  private InteractionModel: Model<any>;
  private CommitModel: Model<any>;
  private BranchModel: Model<any>;
  private ConversationModel: Model<any>;

  constructor(mongoUrl: string, dbName: string = 'narrative_canon') {
    this.connection = mongoose.createConnection(mongoUrl, {
      dbName,
    });

    this.connection.on('connected', () => {
      console.log('✅ MongoDB connected');
      this.isConnected = true;
    });

    this.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      this.isConnected = false;
    });

    this.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
      this.isConnected = false;
    });

    // Initialize models
    this.ProjectModel = this.connection.model('Project', ProjectSchema);
    this.EntityModel = this.connection.model('Entity', EntitySchema);
    this.RelationshipModel = this.connection.model('Relationship', RelationshipSchema);
    this.InteractionModel = this.connection.model('Interaction', InteractionSchema);
    this.CommitModel = this.connection.model('Commit', CommitSchema);
    this.BranchModel = this.connection.model('Branch', BranchSchema);
    this.ConversationModel = this.connection.model('ConversationHistory', ConversationHistorySchema);
  }

  // Wait for connection to be ready
  private async ensureConnected(): Promise<void> {
    if (this.connection.readyState === 1) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('MongoDB connection timeout'));
      }, 10000);

      this.connection.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.connection.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async loadProjects(): Promise<Project[]> {
    await this.ensureConnected();

    const docs = await this.ProjectModel.find().sort({ updatedAt: -1 });

    if (docs.length === 0) {
      // Create default project if none exist
      const defaultProject = createDefaultProject();
      await this.createProject(defaultProject);
      return [defaultProject];
    }

    return docs.map(doc => ({
      id: doc.projectId,
      name: doc.name,
      description: doc.description,
      createdAt: doc.createdAt?.getTime() || Date.now(),
      updatedAt: doc.updatedAt?.getTime() || Date.now(),
      isActive: doc.isActive,
      stats: doc.stats || { entities: 0, relationships: 0, commits: 0, branches: 1 },
      color: doc.color,
    }));
  }

  async saveProjects(projects: Project[]): Promise<void> {
    await this.ensureConnected();

    // This is a bulk operation - update or insert each project
    const bulkOps = projects.map(p => ({
      updateOne: {
        filter: { projectId: p.id },
        update: {
          $set: {
            projectId: p.id,
            name: p.name,
            description: p.description,
            isActive: p.isActive,
            stats: p.stats,
            color: p.color,
          },
          $setOnInsert: {
            createdAt: new Date(p.createdAt),
          },
        },
        upsert: true,
      },
    }));

    await this.ProjectModel.bulkWrite(bulkOps);
  }

  async getProject(id: string): Promise<Project | null> {
    await this.ensureConnected();

    const doc = await this.ProjectModel.findOne({ projectId: id });
    if (!doc) return null;

    return {
      id: doc.projectId,
      name: doc.name,
      description: doc.description,
      createdAt: doc.createdAt?.getTime() || Date.now(),
      updatedAt: doc.updatedAt?.getTime() || Date.now(),
      isActive: doc.isActive,
      stats: doc.stats || { entities: 0, relationships: 0, commits: 0, branches: 1 },
      color: doc.color,
    };
  }

  async createProject(project: Omit<Project, 'id'> & { id?: string }): Promise<Project> {
    await this.ensureConnected();

    const projectId = project.id || `project_${Date.now()}`;

    const doc = await this.ProjectModel.create({
      projectId,
      name: project.name,
      description: project.description || '',
      isActive: project.isActive || false,
      stats: project.stats || { entities: 0, relationships: 0, commits: 0, branches: 1 },
      color: project.color || '#8b5cf6',
    });

    // Create default branch
    await this.BranchModel.create({
      branchId: 'main',
      projectId,
      name: 'main',
      description: 'The canonical timeline',
      color: '#22c55e',
      isActive: true,
      isCanon: true,
      probability: 1.0,
      commitCount: 0,
      lastCommit: 'never',
    });

    return {
      id: projectId,
      name: doc.name,
      description: doc.description,
      createdAt: doc.createdAt?.getTime() || Date.now(),
      updatedAt: doc.updatedAt?.getTime() || Date.now(),
      isActive: doc.isActive,
      stats: doc.stats,
      color: doc.color,
    };
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    await this.ensureConnected();

    const updateDoc: any = {};
    if (updates.name !== undefined) updateDoc.name = updates.name;
    if (updates.description !== undefined) updateDoc.description = updates.description;
    if (updates.isActive !== undefined) updateDoc.isActive = updates.isActive;
    if (updates.stats !== undefined) updateDoc.stats = updates.stats;
    if (updates.color !== undefined) updateDoc.color = updates.color;

    const doc = await this.ProjectModel.findOneAndUpdate(
      { projectId: id },
      { $set: updateDoc },
      { new: true }
    );

    if (!doc) return null;

    return {
      id: doc.projectId,
      name: doc.name,
      description: doc.description,
      createdAt: doc.createdAt?.getTime() || Date.now(),
      updatedAt: doc.updatedAt?.getTime() || Date.now(),
      isActive: doc.isActive,
      stats: doc.stats,
      color: doc.color,
    };
  }

  async deleteProject(id: string): Promise<boolean> {
    await this.ensureConnected();

    // Check if project is active
    const project = await this.ProjectModel.findOne({ projectId: id });
    if (!project || project.isActive) {
      return false;
    }

    // Delete all related data
    await Promise.all([
      this.ProjectModel.deleteOne({ projectId: id }),
      this.EntityModel.deleteMany({ projectId: id }),
      this.RelationshipModel.deleteMany({ projectId: id }),
      this.InteractionModel.deleteMany({ projectId: id }),
      this.CommitModel.deleteMany({ projectId: id }),
      this.BranchModel.deleteMany({ projectId: id }),
      this.ConversationModel.deleteOne({ projectId: id }),
    ]);

    return true;
  }

  async loadProjectData(projectId: string): Promise<ProjectData> {
    await this.ensureConnected();

    const [entities, relationships, commits, branches, interactions, conversation] = await Promise.all([
      this.EntityModel.find({ projectId }),
      this.RelationshipModel.find({ projectId }),
      this.CommitModel.find({ projectId }).sort({ createdAt: -1 }),
      this.BranchModel.find({ projectId }),
      this.InteractionModel.find({ projectId }),
      this.ConversationModel.findOne({ projectId }),
    ]);

    return {
      entities: entities.map(e => ({
        id: e.entityId,
        name: e.name,
        type: e.type,
        description: e.description,
        backstory: e.backstory,
        traits: e.traits,
        motivations: e.motivations,
        secrets: e.secrets,
        status: e.status,
        imageUrl: e.imageUrl,
        referenceImage: e.referenceImage,
        appearance: e.appearance,
        visual: e.visual,
        ideology: e.ideology,
      })),
      relationships: relationships.map(r => ({
        id: r.relationshipId,
        source: r.sourceId,
        sourceId: r.sourceId,
        target: r.targetId,
        targetId: r.targetId,
        sourceName: r.sourceName,
        targetName: r.targetName,
        type: r.type,
        description: r.description,
        strength: r.strength,
      })),
      commits: commits.map(c => ({
        id: c.commitId,
        hash: c.hash,
        message: c.message,
        branch: c.branch,
        author: c.author,
        tags: c.tags,
        operations: c.operations,
        delta: c.delta,
        stats: c.stats,
        snapshot: c.snapshot,
        metrics: c.metrics,
        storyConsistency: c.storyConsistency,
        isMergeCommit: c.isMergeCommit,
        mergedFrom: c.mergedFrom,
        resolutions: c.resolutions,
        timestamp: c.createdAt?.getTime(),
      })),
      branches: branches.length > 0 ? branches.map(b => ({
        id: b.branchId,
        name: b.name,
        description: b.description,
        color: b.color,
        isActive: b.isActive,
        isCanon: b.isCanon,
        probability: b.probability,
        commitCount: b.commitCount,
        lastCommit: b.lastCommit,
        parentBranch: b.parentBranch,
        createdAt: b.createdAt?.toISOString(),
      })) : createEmptyProjectData().branches,
      interactions: interactions.map(i => ({
        id: i.interactionId,
        title: i.title,
        prose: i.prose,
        content: i.content,
        summary: i.summary,
        description: i.description,
        status: i.status,
        participants: i.participants || i.participantIds,
        participantIds: i.participantIds || i.participants,
        location: i.location || i.locationId,
        locationId: i.locationId || i.location,
        events: i.events,
        imageUrl: i.imageUrl,
        position: i.position,
        frames: i.frames,
        storyDiff: i.storyDiff,
      })),
      conversationHistory: conversation ? {
        messages: conversation.messages,
        worldContext: conversation.worldContext || { themes: [], tone: '', influences: [] },
        currentFocus: conversation.currentFocus || [],
        userDecisions: conversation.userDecisions || [],
        lastUpdated: conversation.lastUpdated || Date.now(),
      } : undefined,
    };
  }

  async saveProjectData(projectId: string, data: ProjectData): Promise<void> {
    await this.ensureConnected();

    // Delete and re-insert all data (simple approach)
    // In production, you might want to use more sophisticated diffing

    // Entities
    await this.EntityModel.deleteMany({ projectId });
    if (data.entities.length > 0) {
      await this.EntityModel.insertMany(
        data.entities.map(e => ({
          entityId: e.id,
          projectId,
          name: e.name,
          type: e.type,
          description: e.description,
          backstory: e.backstory,
          traits: e.traits,
          motivations: e.motivations,
          secrets: e.secrets,
          status: e.status,
          imageUrl: e.imageUrl,
          referenceImage: e.referenceImage,
          appearance: e.appearance,
          visual: e.visual,
          ideology: e.ideology,
        }))
      );
    }

    // Relationships
    await this.RelationshipModel.deleteMany({ projectId });
    if (data.relationships.length > 0) {
      await this.RelationshipModel.insertMany(
        data.relationships.map(r => ({
          relationshipId: r.id,
          projectId,
          sourceId: r.source || r.sourceId,
          targetId: r.target || r.targetId,
          sourceName: r.sourceName,
          targetName: r.targetName,
          type: r.type,
          description: r.description,
          strength: r.strength,
        }))
      );
    }

    // Interactions
    await this.InteractionModel.deleteMany({ projectId });
    if (data.interactions.length > 0) {
      await this.InteractionModel.insertMany(
        data.interactions.map(i => ({
          interactionId: i.id,
          projectId,
          title: i.title,
          prose: i.prose,
          content: i.content,
          summary: i.summary,
          description: i.description,
          status: i.status,
          participants: i.participants,
          participantIds: i.participantIds,
          location: i.location,
          locationId: i.locationId,
          events: i.events,
          imageUrl: i.imageUrl,
          position: i.position,
          frames: i.frames,
          storyDiff: i.storyDiff,
        }))
      );
    }

    // Commits
    await this.CommitModel.deleteMany({ projectId });
    if (data.commits.length > 0) {
      await this.CommitModel.insertMany(
        data.commits.map(c => ({
          commitId: c.id,
          projectId,
          hash: c.hash,
          message: c.message,
          branch: c.branch,
          author: c.author,
          tags: c.tags,
          operations: c.operations,
          delta: c.delta,
          stats: c.stats,
          snapshot: c.snapshot,
          metrics: c.metrics,
          storyConsistency: c.storyConsistency,
          isMergeCommit: c.isMergeCommit,
          mergedFrom: c.mergedFrom,
          resolutions: c.resolutions,
        }))
      );
    }

    // Branches
    await this.BranchModel.deleteMany({ projectId });
    if (data.branches.length > 0) {
      await this.BranchModel.insertMany(
        data.branches.map(b => ({
          branchId: b.id,
          projectId,
          name: b.name,
          description: b.description,
          color: b.color,
          isActive: b.isActive,
          isCanon: b.isCanon,
          probability: b.probability,
          commitCount: b.commitCount,
          lastCommit: b.lastCommit,
          parentBranch: b.parentBranch,
        }))
      );
    }

    // Conversation history
    if (data.conversationHistory) {
      await this.ConversationModel.findOneAndUpdate(
        { projectId },
        {
          $set: {
            projectId,
            messages: data.conversationHistory.messages,
            worldContext: data.conversationHistory.worldContext,
            currentFocus: data.conversationHistory.currentFocus,
            userDecisions: data.conversationHistory.userDecisions,
            lastUpdated: data.conversationHistory.lastUpdated || Date.now(),
          },
        },
        { upsert: true }
      );
    }

    // Update project stats
    await this.ProjectModel.findOneAndUpdate(
      { projectId },
      {
        $set: {
          'stats.entities': data.entities.length,
          'stats.relationships': data.relationships.length,
          'stats.commits': data.commits.length,
          'stats.branches': data.branches.length,
        },
      }
    );
  }

  async getActiveProject(): Promise<Project | null> {
    await this.ensureConnected();

    const doc = await this.ProjectModel.findOne({ isActive: true });
    if (!doc) {
      // Return first project if none is active
      const first = await this.ProjectModel.findOne();
      if (first) {
        await this.setActiveProject(first.projectId);
        return this.getProject(first.projectId);
      }
      return null;
    }

    return {
      id: doc.projectId,
      name: doc.name,
      description: doc.description,
      createdAt: doc.createdAt?.getTime() || Date.now(),
      updatedAt: doc.updatedAt?.getTime() || Date.now(),
      isActive: doc.isActive,
      stats: doc.stats,
      color: doc.color,
    };
  }

  async setActiveProject(projectId: string): Promise<void> {
    await this.ensureConnected();

    // Deactivate all projects
    await this.ProjectModel.updateMany({}, { $set: { isActive: false } });

    // Activate the selected project
    await this.ProjectModel.updateOne(
      { projectId },
      { $set: { isActive: true } }
    );
  }

  async isHealthy(): Promise<boolean> {
    try {
      return this.connection.readyState === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

export default MongoProjectAdapter;

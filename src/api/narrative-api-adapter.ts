import * as express from 'express';
import { Request, Response, NextFunction, Router } from 'express';
import { MongoNarrativeService } from '../services/mongodb-narrative-service';
import { z } from 'zod';

// ============================================================================
// REQUEST/RESPONSE SCHEMAS (Following Proxim8 Patterns)
// ============================================================================

// Request validation schemas
const ExtractNarrativeSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  title: z.string().min(1, 'Title is required'),
  sourceType: z.enum(['lore', 'mission', 'manual', 'generated']),
  sourceId: z.string().optional(),
  seasonId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  userId: z.string().optional()
});

const ProcessLoreFragmentSchema = z.object({
  loreFragmentId: z.string().min(1, 'Lore fragment ID is required'),
  content: z.string().min(1, 'Content is required'),
  nftId: z.string().optional(),
  seasonId: z.string().optional(),
  missionId: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const ProcessMissionOutcomeSchema = z.object({
  missionId: z.string().min(1, 'Mission ID is required'),
  narrative: z.string().min(1, 'Narrative is required'),
  success: z.boolean(),
  timelineShift: z.number(),
  stateChanges: z.array(z.object({
    entityName: z.string(),
    changeType: z.string(),
    description: z.string()
  }))
});

const EntityQuerySchema = z.object({
  type: z.string().optional(),
  canonicalStatus: z.enum(['canon', 'disputed', 'extracted', 'validated']).optional(),
  sourceType: z.enum(['lore', 'mission', 'manual', 'generated']).optional(),
  seasonId: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  minConsistencyScore: z.string().optional()
});

// ============================================================================
// MIDDLEWARE (Following Proxim8 Patterns)
// ============================================================================

export interface RequestWithUser extends Request {
  user?: {
    walletAddress: string;
    isAdmin: boolean;
  };
}

// Request validation middleware
function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          message: 'Validation failed',
          errors: validation.error.errors
        });
        return;
      }
      req.body = validation.data;
      next();
    } catch (error) {
      res.status(400).json({
        message: 'Invalid request format',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}

// Query validation middleware
function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validation = schema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          message: 'Query validation failed',
          errors: validation.error.errors
        });
        return;
      }
      req.query = validation.data as any;
      next();
    } catch (error) {
      res.status(400).json({
        message: 'Invalid query format',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}

// Admin-only middleware (following Proxim8 pattern)
function requireAdmin(req: RequestWithUser, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  next();
}

// Authentication middleware (optional - can be replaced with Proxim8's auth)
function optionalAuth(req: RequestWithUser, res: Response, next: NextFunction): void {
  // This would integrate with Proxim8's existing auth middleware
  // For now, we'll make it optional
  next();
}

// ============================================================================
// API ADAPTER CLASS
// ============================================================================

export interface NarrativeApiConfig {
  service: MongoNarrativeService;
  basePath?: string;
  enableAuth?: boolean;
  enableRateLimit?: boolean;
  logger?: (message: string, data?: any) => void;
}

export class NarrativeApiAdapter {
  private service: MongoNarrativeService;
  private basePath: string;
  private logger: (message: string, data?: any) => void;
  private router: Router;

  constructor(config: NarrativeApiConfig) {
    this.service = config.service;
    this.basePath = config.basePath || '/api/narrative';
    this.logger = config.logger || console.log;
    this.router = express.Router();
    
    this.setupRoutes();
  }

  private setupRoutes() {
    // ========================================================================
    // PUBLIC ENDPOINTS (Read-only narrative data)
    // ========================================================================

    // Get entities with filtering and pagination
    this.router.get('/entities', 
      validateQuery(EntityQuerySchema),
      this.getEntities.bind(this)
    );

    // Get specific entity by ID
    this.router.get('/entities/:entityId', this.getEntityById.bind(this));

    // Get entity relationship graph
    this.router.get('/entities/:entityId/graph', this.getEntityGraph.bind(this));

    // Get entities by type (convenience endpoint)
    this.router.get('/characters', this.getCharacters.bind(this));
    this.router.get('/locations', this.getLocations.bind(this));
    this.router.get('/organizations', this.getOrganizations.bind(this));

    // Get document scenes
    this.router.get('/documents/:documentId/scenes', this.getDocumentScenes.bind(this));

    // ========================================================================
    // PROTECTED ENDPOINTS (Write operations)
    // ========================================================================

    // Manual narrative extraction (admin only)
    this.router.post('/extract',
      optionalAuth,
      requireAdmin,
      validateRequest(ExtractNarrativeSchema),
      this.extractNarrative.bind(this)
    );

    // Process lore fragment (can be called by lore system)
    this.router.post('/lore',
      optionalAuth,
      validateRequest(ProcessLoreFragmentSchema),
      this.processLoreFragment.bind(this)
    );

    // Process mission outcome (can be called by mission system)
    this.router.post('/missions',
      optionalAuth,
      validateRequest(ProcessMissionOutcomeSchema),
      this.processMissionOutcome.bind(this)
    );

    // ========================================================================
    // CONSISTENCY ENDPOINTS
    // ========================================================================

    // Validate narrative consistency
    this.router.get('/entities/:entityId/consistency', 
      this.validateConsistency.bind(this)
    );

    // Update consistency score (admin only)
    this.router.put('/entities/:entityId/consistency',
      optionalAuth,
      requireAdmin,
      this.updateConsistencyScore.bind(this)
    );

    // Flag conflicts (admin only)
    this.router.post('/entities/:entityId/conflicts',
      optionalAuth,
      requireAdmin,
      this.flagConflict.bind(this)
    );

    // ========================================================================
    // INTEGRATION ENDPOINTS (For linking with Proxim8 systems)
    // ========================================================================

    // Link entity to lore fragment
    this.router.post('/entities/:entityId/lore/:fragmentId',
      optionalAuth,
      this.linkToLoreFragment.bind(this)
    );

    // Link entity to timeline event
    this.router.post('/entities/:entityId/timeline/:eventId',
      optionalAuth,
      this.linkToTimelineEvent.bind(this)
    );

    // Link entity to mission
    this.router.post('/entities/:entityId/missions/:missionId',
      optionalAuth,
      this.linkToMission.bind(this)
    );

    // ========================================================================
    // ADMIN ENDPOINTS
    // ========================================================================

    // Get all documents (admin only)
    this.router.get('/admin/documents',
      optionalAuth,
      requireAdmin,
      this.getAllDocuments.bind(this)
    );

    // Get system statistics (admin only)
    this.router.get('/admin/stats',
      optionalAuth,
      requireAdmin,
      this.getSystemStats.bind(this)
    );

    // Health check
    this.router.get('/health', this.healthCheck.bind(this));
  }

  // ============================================================================
  // CONTROLLER METHODS (Following Proxim8 Patterns)
  // ============================================================================

  private async getEntities(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const {
        type,
        canonicalStatus,
        sourceType,
        seasonId,
        page = '1',
        limit = '10',
        minConsistencyScore
      } = req.query as any;

      const result = await this.service.getEntities({
        type,
        canonicalStatus,
        sourceType,
        seasonId,
        page: parseInt(page),
        limit: parseInt(limit),
        minConsistencyScore: minConsistencyScore ? parseInt(minConsistencyScore) : undefined
      });

      res.status(200).json(result);
    } catch (error) {
      this.logger('Error getting entities:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getEntityById(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityId } = req.params;

      const entity = await this.service['adapter'].EntityModel.findOne({ entityId });

      if (!entity) {
        res.status(404).json({ message: 'Entity not found' });
        return;
      }

      res.status(200).json(entity);
    } catch (error) {
      this.logger('Error getting entity by ID:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getEntityGraph(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityId } = req.params;
      const { depth = '2' } = req.query;

      const graph = await this.service.getEntityGraph(entityId, parseInt(depth as string));

      res.status(200).json(graph);
    } catch (error) {
      this.logger('Error getting entity graph:', error);
      if (error instanceof Error && error.message === 'Entity not found') {
        res.status(404).json({ message: 'Entity not found' });
      } else {
        res.status(500).json({
          message: 'Server error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async getCharacters(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '10', canonicalStatus, minConsistency } = req.query;

      const result = await this.service.getEntities({
        type: 'character',
        canonicalStatus: canonicalStatus as any,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        minConsistencyScore: minConsistency ? parseInt(minConsistency as string) : undefined
      });

      res.status(200).json(result);
    } catch (error) {
      this.logger('Error getting characters:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getLocations(req: RequestWithUser, res: Response): Promise<void> {
    req.query.type = 'location';
    return this.getEntities(req, res);
  }

  private async getOrganizations(req: RequestWithUser, res: Response): Promise<void> {
    req.query.type = 'organization';
    return this.getEntities(req, res);
  }

  private async getDocumentScenes(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { documentId } = req.params;

      // TODO: Implement getDocumentScenes in MongoNarrativeService
      // const scenes = await this.service.getDocumentScenes(documentId);
      const scenes: any[] = [];

      res.status(200).json(scenes);
    } catch (error) {
      this.logger('Error getting document scenes:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async extractNarrative(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { content, title, sourceType, sourceId, seasonId, tags, userId } = req.body;

      const result = await this.service.extractAndSave(content, {
        title,
        sourceType,
        sourceId,
        seasonId,
        tags,
        userId: userId || req.user?.walletAddress
      });

      res.status(201).json(result);
    } catch (error) {
      this.logger('Error extracting narrative:', error);
      res.status(500).json({
        message: 'Narrative extraction failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async processLoreFragment(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { loreFragmentId, content, nftId, seasonId, missionId, tags } = req.body;

      const result = await this.service.processLoreFragment(loreFragmentId, content, {
        nftId,
        seasonId,
        missionId,
        tags
      });

      res.status(201).json(result);
    } catch (error) {
      this.logger('Error processing lore fragment:', error);
      res.status(500).json({
        message: 'Lore processing failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async processMissionOutcome(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { missionId, narrative, success, timelineShift, stateChanges } = req.body;

      const result = await this.service.processMissionOutcome(missionId, {
        narrative,
        success,
        timelineShift,
        stateChanges
      });

      res.status(201).json(result);
    } catch (error) {
      this.logger('Error processing mission outcome:', error);
      res.status(500).json({
        message: 'Mission processing failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async validateConsistency(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityId } = req.params;

      const validation = await this.service.validateNarrativeConsistency(entityId);

      res.status(200).json(validation);
    } catch (error) {
      this.logger('Error validating consistency:', error);
      res.status(500).json({
        message: 'Consistency validation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async updateConsistencyScore(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityId } = req.params;
      const { score } = req.body;

      if (typeof score !== 'number' || score < 0 || score > 100) {
        res.status(400).json({ message: 'Score must be a number between 0 and 100' });
        return;
      }

      await this.service['adapter'].updateConsistencyScore(entityId, score);

      res.status(200).json({ message: 'Consistency score updated' });
    } catch (error) {
      this.logger('Error updating consistency score:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async flagConflict(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityId } = req.params;
      const { description } = req.body;

      if (!description || typeof description !== 'string') {
        res.status(400).json({ message: 'Conflict description is required' });
        return;
      }

      await this.service['adapter'].flagConflict(entityId, description);

      res.status(200).json({ message: 'Conflict flagged' });
    } catch (error) {
      this.logger('Error flagging conflict:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async linkToLoreFragment(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityId, fragmentId } = req.params;

      await this.service['adapter'].linkToLoreFragment(entityId, fragmentId);

      res.status(200).json({ message: 'Entity linked to lore fragment' });
    } catch (error) {
      this.logger('Error linking to lore fragment:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async linkToTimelineEvent(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityId, eventId } = req.params;

      await this.service['adapter'].linkToTimelineEvent(entityId, eventId);

      res.status(200).json({ message: 'Entity linked to timeline event' });
    } catch (error) {
      this.logger('Error linking to timeline event:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async linkToMission(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityId, missionId } = req.params;

      await this.service['adapter'].linkToMission(entityId, missionId);

      res.status(200).json({ message: 'Entity linked to mission' });
    } catch (error) {
      this.logger('Error linking to mission:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getAllDocuments(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '10', sourceType } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const query: any = {};
      if (sourceType) {
        query.sourceType = sourceType;
      }

      const [documents, total] = await Promise.all([
        this.service['adapter'].DocumentModel.find(query)
          .skip(skip)
          .limit(limitNum)
          .sort({ createdAt: -1 }),
        this.service['adapter'].DocumentModel.countDocuments(query)
      ]);

      res.status(200).json({
        documents,
        total,
        totalPages: Math.ceil(total / limitNum),
        currentPage: pageNum
      });
    } catch (error) {
      this.logger('Error getting all documents:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getSystemStats(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const [
        documentCount,
        entityCount,
        relationshipCount,
        sceneCount,
        avgConsistency
      ] = await Promise.all([
        this.service['adapter'].DocumentModel.countDocuments(),
        this.service['adapter'].EntityModel.countDocuments(),
        this.service['adapter'].RelationshipModel.countDocuments(),
        this.service['adapter'].SceneModel.countDocuments(),
        this.service['adapter'].EntityModel.aggregate([
          { $group: { _id: null, avgScore: { $avg: '$consistencyScore' } } }
        ])
      ]);

      const stats = {
        documents: documentCount,
        entities: entityCount,
        relationships: relationshipCount,
        scenes: sceneCount,
        averageConsistencyScore: avgConsistency[0]?.avgScore || 0,
        lastUpdated: new Date()
      };

      res.status(200).json(stats);
    } catch (error) {
      this.logger('Error getting system stats:', error);
      res.status(500).json({
        message: 'Server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async healthCheck(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // Simple health check - verify database connectivity
      await this.service['adapter'].EntityModel.findOne().limit(1);

      res.status(200).json({
        status: 'healthy',
        timestamp: new Date(),
        version: '1.0.0'
      });
    } catch (error) {
      this.logger('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ============================================================================
  // PUBLIC INTERFACE
  // ============================================================================

  /**
   * Get the Express router with all narrative endpoints
   */
  public getRouter(): Router {
    return this.router;
  }

  /**
   * Mount the narrative API on an Express app
   */
  public mount(app: express.Application): void {
    app.use(this.basePath, this.router);
    this.logger(`Narrative API mounted at ${this.basePath}`);
  }

  /**
   * Get endpoint documentation
   */
  public getEndpoints(): Record<string, any> {
    return {
      // Public endpoints
      'GET /entities': 'Get entities with filtering and pagination',
      'GET /entities/:entityId': 'Get specific entity by ID',
      'GET /entities/:entityId/graph': 'Get entity relationship graph',
      'GET /characters': 'Get characters (convenience endpoint)',
      'GET /locations': 'Get locations (convenience endpoint)',
      'GET /organizations': 'Get organizations (convenience endpoint)',
      'GET /documents/:documentId/scenes': 'Get scenes for a document',

      // Protected endpoints
      'POST /extract': 'Manual narrative extraction (admin only)',
      'POST /lore': 'Process lore fragment',
      'POST /missions': 'Process mission outcome',

      // Consistency endpoints
      'GET /entities/:entityId/consistency': 'Validate narrative consistency',
      'PUT /entities/:entityId/consistency': 'Update consistency score (admin)',
      'POST /entities/:entityId/conflicts': 'Flag conflicts (admin)',

      // Integration endpoints
      'POST /entities/:entityId/lore/:fragmentId': 'Link entity to lore fragment',
      'POST /entities/:entityId/timeline/:eventId': 'Link entity to timeline event',
      'POST /entities/:entityId/missions/:missionId': 'Link entity to mission',

      // Admin endpoints
      'GET /admin/documents': 'Get all documents (admin)',
      'GET /admin/stats': 'Get system statistics (admin)',
      'GET /health': 'Health check'
    };
  }
}
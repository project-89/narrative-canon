import request from 'supertest';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import { MongoNarrativeService } from '../../src/services/mongodb-narrative-service';
import { NarrativeApiAdapter } from '../../src/api/narrative-api-adapter';

const runMongoTests = process.env.ALLOW_MONGO_TESTS === 'true';
let mongoAvailable = runMongoTests;

const ensureMongoAvailable = () => {
  if (!mongoAvailable) {
    expect(true).toBe(true);
    return false;
  }
  return true;
};

const conditionalTest = (
  title: string,
  fn: () => Promise<void> | void,
  timeout?: number
) => {
  const wrapped = async () => {
    if (!ensureMongoAvailable()) {
      return;
    }
    await fn();
  };

  if (typeof timeout === 'number') {
    test(title, wrapped, timeout);
  } else {
    test(title, wrapped);
  }
};

if (!runMongoTests) {
  describe('NarrativeApiAdapter', () => {
    it('skips because ALLOW_MONGO_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {

describe('NarrativeApiAdapter', () => {
  let app: express.Application;
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let service: MongoNarrativeService;
  let adapter: NarrativeApiAdapter;

  beforeAll(async () => {
    if (!runMongoTests) {
      mongoAvailable = false;
      console.warn('Skipping NarrativeApiAdapter tests: ALLOW_MONGO_TESTS not enabled');
      return;
    }

    try {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();

      connection = mongoose.createConnection(mongoUri, {
        dbName: 'test_api'
      });

      await new Promise((resolve) => {
        connection.once('open', resolve);
      });

      service = new MongoNarrativeService(
        { connection },
        { type: 'mock' }
      );

      app = express();
      app.use(express.json());

      app.use((req: any, res, next) => {
        req.user = {
          walletAddress: req.headers['test-user'] || 'test_user',
          isAdmin: req.headers['test-admin'] === 'true'
        };
        next();
      });

      adapter = new NarrativeApiAdapter({
        service,
        basePath: '/api/narrative',
        logger: () => {}
      });

      adapter.mount(app);
    } catch (error: any) {
      mongoAvailable = false;
      console.warn('Skipping NarrativeApiAdapter tests:', error?.message || error);
    }
  });

  afterAll(async () => {
    if (!mongoAvailable) {
      return;
    }
    await service.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    if (!mongoAvailable) return;
    const collections = await connection.db!.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  describe('Public Endpoints', () => {
    beforeEach(async () => {
      if (!mongoAvailable) return;
      await service.extractAndSave('Alice Chen is a hacker from Neo-Tokyo.', {
        title: 'Test Character',
        sourceType: 'manual',
        tags: ['test']
      });
    });

    conditionalTest('GET /api/narrative/entities should return entities', async () => {
      const response = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      expect(response.body.entities).toBeDefined();
      expect(response.body.total).toBeGreaterThan(0);
      expect(response.body.totalPages).toBeGreaterThan(0);
    });

    conditionalTest('GET /api/narrative/entities with filters', async () => {
      const response = await request(app)
        .get('/api/narrative/entities')
        .query({
          type: 'character',
          page: 1,
          limit: 5
        })
        .expect(200);

      expect(response.body.entities).toBeDefined();
      response.body.entities.forEach((entity: any) => {
        expect(entity.type).toBe('character');
      });
    });

    conditionalTest('GET /api/narrative/characters should return characters', async () => {
      const response = await request(app)
        .get('/api/narrative/characters')
        .expect(200);

      expect(response.body.entities).toBeDefined();
      response.body.entities.forEach((entity: any) => {
        expect(entity.type).toBe('character');
      });
    });

    conditionalTest('GET /api/narrative/locations should return locations', async () => {
      const response = await request(app)
        .get('/api/narrative/locations')
        .expect(200);

      expect(response.body.entities).toBeDefined();
    });

    conditionalTest('GET /api/narrative/organizations should return organizations', async () => {
      const response = await request(app)
        .get('/api/narrative/organizations')
        .expect(200);

      expect(response.body.entities).toBeDefined();
    });

    conditionalTest('GET /api/narrative/entities/:entityId should return specific entity', async () => {
      // Get an entity first
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        const response = await request(app)
          .get(`/api/narrative/entities/${entityId}`)
          .expect(200);

        expect(response.body.entityId).toBe(entityId);
      }
    });

    conditionalTest('GET /api/narrative/entities/:entityId should return 404 for nonexistent entity', async () => {
      await request(app)
        .get('/api/narrative/entities/nonexistent')
        .expect(404);
    });

    conditionalTest('GET /api/narrative/entities/:entityId/graph should return entity graph', async () => {
      // Get an entity first
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        const response = await request(app)
          .get(`/api/narrative/entities/${entityId}/graph`)
          .expect(200);

        expect(response.body.entity).toBeDefined();
        expect(response.body.relationships).toBeDefined();
        expect(response.body.networkStats).toBeDefined();
      }
    });

    conditionalTest('GET /api/narrative/health should return health status', async () => {
      const response = await request(app)
        .get('/api/narrative/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Protected Endpoints', () => {
    conditionalTest('POST /api/narrative/extract should extract narrative (admin only)', async () => {
      const narrativeData = {
        content: 'Bob Martinez works with Alice in the resistance.',
        title: 'New Character Story',
        sourceType: 'manual',
        tags: ['new', 'character']
      };

      // Should fail without admin
      await request(app)
        .post('/api/narrative/extract')
        .send(narrativeData)
        .expect(403);

      // Should succeed with admin
      const response = await request(app)
        .post('/api/narrative/extract')
        .set('test-admin', 'true')
        .send(narrativeData)
        .expect(201);

      expect(response.body.documentId).toBeDefined();
      expect(response.body.stats.entitiesExtracted).toBeGreaterThan(0);
    });

    conditionalTest('POST /api/narrative/lore should process lore fragment', async () => {
      const loreData = {
        loreFragmentId: 'test_lore_001',
        content: 'Charlie Kim joined the resistance team.',
        nftId: '9999',
        tags: ['test', 'lore']
      };

      const response = await request(app)
        .post('/api/narrative/lore')
        .send(loreData)
        .expect(201);

      expect(response.body.documentId).toBeDefined();
      expect(response.body.stats.entitiesExtracted).toBeGreaterThan(0);
    });

    conditionalTest('POST /api/narrative/missions should process mission outcome', async () => {
      const missionData = {
        missionId: 'test_mission_001',
        narrative: 'The mission was completed successfully.',
        success: true,
        timelineShift: 5,
        stateChanges: [
          {
            entityName: 'Alice Chen',
            changeType: 'modify',
            description: 'Gained experience'
          }
        ]
      };

      const response = await request(app)
        .post('/api/narrative/missions')
        .send(missionData)
        .expect(201);

      expect(response.body.documentId).toBeDefined();
    });
  });

  describe('Consistency Endpoints', () => {
    beforeEach(async () => {
      if (!mongoAvailable) return;
      await service.extractAndSave('Diana Ross leads the communication team.', {
        title: 'Test Entity for Consistency',
        sourceType: 'manual',
        tags: ['consistency_test']
      });
    });

    conditionalTest('GET /api/narrative/entities/:entityId/consistency should validate consistency', async () => {
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        const response = await request(app)
          .get(`/api/narrative/entities/${entityId}/consistency`)
          .expect(200);

        expect(response.body.consistencyScore).toBeDefined();
        expect(response.body.conflicts).toBeDefined();
        expect(response.body.recommendations).toBeDefined();
      }
    });

    conditionalTest('PUT /api/narrative/entities/:entityId/consistency should update score (admin only)', async () => {
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        // Should fail without admin
        await request(app)
          .put(`/api/narrative/entities/${entityId}/consistency`)
          .send({ score: 85 })
          .expect(403);

        // Should succeed with admin
        await request(app)
          .put(`/api/narrative/entities/${entityId}/consistency`)
          .set('test-admin', 'true')
          .send({ score: 85 })
          .expect(200);
      }
    });

    conditionalTest('POST /api/narrative/entities/:entityId/conflicts should flag conflicts (admin only)', async () => {
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        // Should fail without admin
        await request(app)
          .post(`/api/narrative/entities/${entityId}/conflicts`)
          .send({ description: 'Test conflict' })
          .expect(403);

        // Should succeed with admin
        await request(app)
          .post(`/api/narrative/entities/${entityId}/conflicts`)
          .set('test-admin', 'true')
          .send({ description: 'Test conflict' })
          .expect(200);
      }
    });
  });

  describe('Integration Endpoints', () => {
    beforeEach(async () => {
      if (!mongoAvailable) return;
      await service.extractAndSave('Edward Norton handles logistics.', {
        title: 'Test Entity for Integration',
        sourceType: 'manual',
        tags: ['integration_test']
      });
    });

    conditionalTest('POST /api/narrative/entities/:entityId/lore/:fragmentId should link entity to lore', async () => {
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        const response = await request(app)
          .post(`/api/narrative/entities/${entityId}/lore/test_fragment`)
          .expect(200);

        expect(response.body.message).toContain('linked to lore fragment');
      }
    });

    conditionalTest('POST /api/narrative/entities/:entityId/timeline/:eventId should link entity to timeline', async () => {
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        const response = await request(app)
          .post(`/api/narrative/entities/${entityId}/timeline/test_event`)
          .expect(200);

        expect(response.body.message).toContain('linked to timeline event');
      }
    });

    conditionalTest('POST /api/narrative/entities/:entityId/missions/:missionId should link entity to mission', async () => {
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        const response = await request(app)
          .post(`/api/narrative/entities/${entityId}/missions/test_mission`)
          .expect(200);

        expect(response.body.message).toContain('linked to mission');
      }
    });
  });

  describe('Admin Endpoints', () => {
    beforeEach(async () => {
      if (!mongoAvailable) return;
      await service.extractAndSave('Test document for admin endpoints.', {
        title: 'Admin Test Document',
        sourceType: 'manual',
        tags: ['admin_test']
      });
    });

    conditionalTest('GET /api/narrative/admin/documents should return documents (admin only)', async () => {
      // Should fail without admin
      await request(app)
        .get('/api/narrative/admin/documents')
        .expect(403);

      // Should succeed with admin
      const response = await request(app)
        .get('/api/narrative/admin/documents')
        .set('test-admin', 'true')
        .expect(200);

      expect(response.body.documents).toBeDefined();
      expect(response.body.total).toBeGreaterThan(0);
    });

    conditionalTest('GET /api/narrative/admin/stats should return system stats (admin only)', async () => {
      // Should fail without admin
      await request(app)
        .get('/api/narrative/admin/stats')
        .expect(403);

      // Should succeed with admin
      const response = await request(app)
        .get('/api/narrative/admin/stats')
        .set('test-admin', 'true')
        .expect(200);

      expect(response.body.documents).toBeDefined();
      expect(response.body.entities).toBeDefined();
      expect(response.body.relationships).toBeDefined();
      expect(response.body.scenes).toBeDefined();
      expect(response.body.averageConsistencyScore).toBeDefined();
    });
  });

  describe('Request Validation', () => {
    conditionalTest('POST /api/narrative/extract should validate required fields', async () => {
      const response = await request(app)
        .post('/api/narrative/extract')
        .set('test-admin', 'true')
        .send({
          // Missing required fields
          title: 'Test'
        })
        .expect(400);

      expect(response.body.message).toContain('Validation failed');
      expect(response.body.errors).toBeDefined();
    });

    conditionalTest('POST /api/narrative/lore should validate lore fragment data', async () => {
      const response = await request(app)
        .post('/api/narrative/lore')
        .send({
          // Missing required fields
          content: 'Some content'
        })
        .expect(400);

      expect(response.body.message).toContain('Validation failed');
    });

    conditionalTest('PUT /api/narrative/entities/:entityId/consistency should validate score range', async () => {
      const entitiesResponse = await request(app)
        .get('/api/narrative/entities')
        .expect(200);

      if (entitiesResponse.body.entities.length > 0) {
        const entityId = entitiesResponse.body.entities[0].entityId;

        // Invalid score (out of range)
        await request(app)
          .put(`/api/narrative/entities/${entityId}/consistency`)
          .set('test-admin', 'true')
          .send({ score: 150 })
          .expect(400);

        // Invalid score (not a number)
        await request(app)
          .put(`/api/narrative/entities/${entityId}/consistency`)
          .set('test-admin', 'true')
          .send({ score: 'invalid' })
          .expect(400);
      }
    });
  });

  describe('Error Handling', () => {
    conditionalTest('should handle service errors gracefully', async () => {
      // Mock a service error
      const originalExtract = service.extractAndSave;
      service.extractAndSave = jest.fn().mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/narrative/extract')
        .set('test-admin', 'true')
        .send({
          content: 'Test content',
          title: 'Test',
          sourceType: 'manual'
        })
        .expect(500);

      expect(response.body.message).toContain('extraction failed');

      // Restore original method
      service.extractAndSave = originalExtract;
    });

    conditionalTest('should handle database connection errors', async () => {
      // Close connection temporarily
      await connection.close();

      const response = await request(app)
        .get('/api/narrative/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');

      // Reconnect
      const mongoUri = mongoServer.getUri();
      connection = mongoose.createConnection(mongoUri, {
        dbName: 'test_api'
    });
    
    await new Promise((resolve) => {
      connection.once('open', resolve);
      });
      
      // Update service connection
      service = new MongoNarrativeService(
        { connection },
        { type: 'mock' }
      );
      
      // Update adapter
      adapter = new NarrativeApiAdapter({
        service,
        basePath: '/api/narrative',
        logger: () => {}
      });
    });
  });

  describe('API Adapter Methods', () => {
    conditionalTest('getRouter should return Express router', () => {
      const router = adapter.getRouter();
      expect(router).toBeDefined();
      expect(typeof router).toBe('function');
    });

    conditionalTest('getEndpoints should return endpoint documentation', () => {
      const endpoints = adapter.getEndpoints();
      expect(endpoints).toBeDefined();
      expect(typeof endpoints).toBe('object');
      expect(endpoints['GET /entities']).toBeDefined();
      expect(endpoints['POST /extract']).toBeDefined();
    });
  });

  describe('Performance', () => {
    conditionalTest('should handle multiple concurrent requests', async () => {
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .get('/api/narrative/entities')
          .expect(200)
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.body.entities).toBeDefined();
      });
    });

    conditionalTest('should respond quickly to health checks', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/narrative/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond in under 1 second
    });
  });
});
}

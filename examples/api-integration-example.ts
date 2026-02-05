/**
 * Example showing how to integrate the Narrative API Adapter with an Express app
 * This demonstrates the integration pattern for the Proxim8 pipeline
 */

import express from 'express';
import mongoose from 'mongoose';
import { MongoNarrativeService } from '../src/services/mongodb-narrative-service';
import { NarrativeApiAdapter } from '../src/api/narrative-api-adapter';

// ============================================================================
// BASIC INTEGRATION EXAMPLE
// ============================================================================

async function basicIntegrationExample() {
  const app = express();
  
  // Standard Express middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Connect to MongoDB (use existing Proxim8 connection in real app)
  const connection = mongoose.createConnection(
    process.env.MONGODB_URI || 'mongodb://localhost:27017/proxim8',
    { dbName: 'proxim8' }
  );

  // Initialize narrative service
  const narrativeService = new MongoNarrativeService(
    { connection },
    { 
      type: 'gemini',
      apiKey: process.env.GOOGLE_GENAI_API_KEY
    }
  );

  // Create API adapter
  const narrativeApi = new NarrativeApiAdapter({
    service: narrativeService,
    basePath: '/api/narrative',
    enableAuth: true,
    logger: console.log
  });

  // Mount the narrative API
  narrativeApi.mount(app);

  // Start server
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Narrative API available at /api/narrative`);
    
    // Print available endpoints
    const endpoints = narrativeApi.getEndpoints();
    console.log('\n📋 Available endpoints:');
    Object.entries(endpoints).forEach(([endpoint, description]) => {
      console.log(`  ${endpoint} - ${description}`);
    });
  });

  return app;
}

// ============================================================================
// PROXIM8 INTEGRATION EXAMPLE
// ============================================================================

async function proxim8IntegrationExample() {
  const app = express();
  
  // Existing Proxim8 middleware (simulated)
  app.use(express.json());
  
  // Mock Proxim8 auth middleware
  app.use('/api/narrative', (req: any, res, next) => {
    // In real Proxim8, this would use the existing auth middleware
    req.user = {
      walletAddress: req.headers['wallet-address'] || 'mock_wallet',
      isAdmin: req.headers['admin'] === 'true'
    };
    next();
  });

  // Existing Proxim8 routes
  app.get('/api/lore/:nftId', (req, res) => {
    res.json({ message: 'Existing lore endpoint' });
  });

  app.get('/api/missions/:missionId', (req, res) => {
    res.json({ message: 'Existing mission endpoint' });
  });

  // Initialize narrative service with existing connection
  const narrativeService = new MongoNarrativeService(
    { 
      mongoUrl: process.env.MONGODB_URI,
      dbName: 'proxim8' // Same database as existing Proxim8
    },
    { type: 'mock' } // Use mock for demo
  );

  // Create and mount narrative API
  const narrativeApi = new NarrativeApiAdapter({
    service: narrativeService,
    basePath: '/api/narrative',
    logger: (msg, data) => console.log(`[NARRATIVE] ${msg}`, data)
  });

  narrativeApi.mount(app);

  // Integration endpoint - process lore with narrative extraction
  app.post('/api/lore/:nftId/extract', async (req: any, res) => {
    try {
      const { nftId } = req.params;
      const { content, title } = req.body;

      // Call narrative API internally
      const extractionResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/narrative/lore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'wallet-address': req.user?.walletAddress || 'system'
        },
        body: JSON.stringify({
          loreFragmentId: `lore_${nftId}`,
          content,
          nftId,
          tags: [`nft_${nftId}`, 'auto_extracted']
        })
      });

      const result = await extractionResponse.json();
      
      res.json({
        message: 'Lore processed with narrative extraction',
        nftId,
        extraction: result
      });
    } catch (error) {
      res.status(500).json({
        message: 'Extraction failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return app;
}

// ============================================================================
// MICROSERVICE EXAMPLE
// ============================================================================

async function microserviceExample() {
  const app = express();
  
  app.use(express.json());

  // CORS for cross-service communication
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });

  // Initialize as standalone narrative service
  const narrativeService = new MongoNarrativeService(
    { mongoUrl: process.env.MONGODB_URI },
    { 
      type: 'gemini',
      apiKey: process.env.GOOGLE_GENAI_API_KEY
    }
  );

  // Create API with full functionality
  const narrativeApi = new NarrativeApiAdapter({
    service: narrativeService,
    basePath: '/api/v1/narrative',
    enableAuth: false, // No auth for microservice
    logger: (msg, data) => console.log(`[NARRATIVE-SERVICE] ${msg}`, data)
  });

  narrativeApi.mount(app);

  // Service discovery endpoint
  app.get('/api/v1/info', (req, res) => {
    res.json({
      service: 'narrative-canon',
      version: '1.0.0',
      endpoints: narrativeApi.getEndpoints(),
      status: 'active'
    });
  });

  return app;
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example API calls after integration
 */
async function apiUsageExamples() {
  const baseUrl = 'http://localhost:3001/api/narrative';
  
  console.log('📝 Example API Usage:');
  
  // Extract narrative from text
  console.log('\n1. Extract narrative:');
  console.log(`POST ${baseUrl}/extract`);
  console.log(JSON.stringify({
    content: 'Alice Chen was a hacker in Neo-Tokyo...',
    title: 'Character Background',
    sourceType: 'lore',
    tags: ['character', 'background']
  }, null, 2));

  // Get all characters
  console.log('\n2. Get characters:');
  console.log(`GET ${baseUrl}/characters?page=1&limit=10`);

  // Get entity relationship graph
  console.log('\n3. Get relationship graph:');
  console.log(`GET ${baseUrl}/entities/doc123_alice/graph?depth=2`);

  // Process lore fragment
  console.log('\n4. Process lore fragment:');
  console.log(`POST ${baseUrl}/lore`);
  console.log(JSON.stringify({
    loreFragmentId: 'lore_fragment_123',
    content: 'Proxim8 #1337 enhanced Alice\'s abilities...',
    nftId: '1337',
    tags: ['proxim8', 'enhancement']
  }, null, 2));

  // Process mission outcome
  console.log('\n5. Process mission outcome:');
  console.log(`POST ${baseUrl}/missions`);
  console.log(JSON.stringify({
    missionId: 'mission_alpha',
    narrative: 'Alice successfully infiltrated the facility...',
    success: true,
    timelineShift: 5,
    stateChanges: [
      {
        entityName: 'Alice Chen',
        changeType: 'modify',
        description: 'Gained elite hacker status'
      }
    ]
  }, null, 2));

  // Validate consistency
  console.log('\n6. Validate consistency:');
  console.log(`GET ${baseUrl}/entities/doc123_alice/consistency`);

  // Get system stats (admin)
  console.log('\n7. Get system stats:');
  console.log(`GET ${baseUrl}/admin/stats`);
  console.log('Headers: { "admin": "true" }');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

if (require.main === module) {
  console.log('🎯 Narrative API Integration Examples\n');
  
  // Show usage examples
  apiUsageExamples();
  
  console.log('\n🚀 To run integration:');
  console.log('1. npm run build');
  console.log('2. node examples/api-integration-example.js');
  console.log('3. Set MONGODB_URI and GOOGLE_GENAI_API_KEY env vars');
  
  // Uncomment to run actual server
  // basicIntegrationExample().catch(console.error);
}

export {
  basicIntegrationExample,
  proxim8IntegrationExample,
  microserviceExample,
  apiUsageExamples
};
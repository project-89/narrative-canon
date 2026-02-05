#!/usr/bin/env node

/**
 * Quick validation script for MongoDB adapter
 * Tests basic functionality without running the full test suite
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Import built modules (assumes npm run build has been run)
let MongoNarrativeService;
try {
  const narrativeCanon = require('./dist/narrative-canon.cjs.js');
  MongoNarrativeService = narrativeCanon.MongoNarrativeService;
} catch (error) {
  console.error('❌ Build files not found. Run "npm run build" first.');
  console.error('Error:', error.message);
  process.exit(1);
}

async function validateMongoDB() {
  let mongoServer;
  let connection;
  let service;

  try {
    console.log('🚀 Starting MongoDB validation...\n');

    // Start in-memory MongoDB
    console.log('📦 Starting MongoDB Memory Server...');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    console.log('✅ MongoDB started at:', mongoUri);

    // Create connection
    console.log('🔗 Creating connection...');
    connection = mongoose.createConnection(mongoUri, {
      dbName: 'validation_test'
    });
    console.log('✅ Connection established');

    // Initialize service
    console.log('⚙️  Initializing narrative service...');
    service = new MongoNarrativeService(
      { connection },
      { type: 'mock' }
    );
    console.log('✅ Service initialized');

    // Test basic extraction
    console.log('\n📝 Testing narrative extraction...');
    const testContent = `
      Alice Chen was a skilled hacker living in Neo-Tokyo. She worked with her partner 
      Bob Martinez in the underground resistance against the oppressive Oneirocom corporation. 
      Their base of operations was hidden deep in Sector 7, where they planned their next 
      mission to infiltrate the corporate data centers.
    `;

    const result = await service.extractAndSave(testContent, {
      title: 'Validation Test Story',
      sourceType: 'manual',
      tags: ['validation', 'test']
    });

    console.log('✅ Extraction completed:');
    console.log(`   - Document ID: ${result.documentId}`);
    console.log(`   - Entities extracted: ${result.stats.entitiesExtracted}`);
    console.log(`   - Relationships extracted: ${result.stats.relationshipsExtracted}`);
    console.log(`   - Consistency score: ${result.stats.consistencyScore}`);

    // Test entity queries
    console.log('\n🔍 Testing entity queries...');
    const entities = await service.getEntities({
      type: 'character',
      page: 1,
      limit: 10
    });

    console.log('✅ Query completed:');
    console.log(`   - Total entities: ${entities.total}`);
    console.log(`   - Entities on page 1: ${entities.entities.length}`);
    
    if (entities.entities.length > 0) {
      const firstEntity = entities.entities[0];
      console.log(`   - First entity: ${firstEntity.name} (${firstEntity.type})`);
      console.log(`   - Consistency score: ${firstEntity.consistencyScore}`);
    }

    // Test relationship graph
    if (entities.entities.length > 0) {
      console.log('\n🕸️  Testing relationship graph...');
      const entityId = entities.entities[0].entityId;
      const graph = await service.getEntityGraph(entityId, 2);
      
      console.log('✅ Graph query completed:');
      console.log(`   - Entity: ${graph.entity.name}`);
      console.log(`   - Direct relationships: ${graph.relationships.length}`);
      console.log(`   - Network size: ${graph.networkStats.networkSize}`);
      console.log(`   - Average consistency: ${graph.networkStats.avgConsistencyScore.toFixed(1)}`);
    }

    // Test lore processing
    console.log('\n📚 Testing lore fragment processing...');
    const loreResult = await service.processLoreFragment(
      'validation_lore_001',
      'Proxim8 #1337 belonged to Alice Chen, enhancing her hacking abilities.',
      {
        nftId: '1337',
        tags: ['proxim8', 'nft']
      }
    );

    console.log('✅ Lore processing completed:');
    console.log(`   - Document ID: ${loreResult.documentId}`);
    console.log(`   - Entities extracted: ${loreResult.stats.entitiesExtracted}`);

    // Test mission outcome processing
    console.log('\n🎯 Testing mission outcome processing...');
    await service.processMissionOutcome('validation_mission_001', {
      narrative: 'Alice Chen successfully hacked the Oneirocom database.',
      success: true,
      timelineShift: 5,
      stateChanges: [
        {
          entityName: 'Alice Chen',
          changeType: 'modify',
          description: 'Gained elite hacker status'
        }
      ]
    });

    console.log('✅ Mission processing completed');

    // Verify consistency
    console.log('\n🔬 Testing consistency validation...');
    if (entities.entities.length > 0) {
      const entityId = entities.entities[0].entityId;
      const validation = await service.validateNarrativeConsistency(entityId);
      
      console.log('✅ Consistency validation completed:');
      console.log(`   - Consistency score: ${validation.consistencyScore}`);
      console.log(`   - Conflicts detected: ${validation.conflicts.length}`);
      console.log(`   - Recommendations: ${validation.recommendations.length}`);
    }

    console.log('\n🎉 All validations passed! MongoDB adapter is working correctly.');

  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    
    if (service) {
      await service.close();
      console.log('✅ Service closed');
    }
    
    if (mongoServer) {
      await mongoServer.stop();
      console.log('✅ MongoDB stopped');
    }
    
    console.log('✅ Cleanup complete');
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run validation
if (require.main === module) {
  validateMongoDB().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { validateMongoDB };
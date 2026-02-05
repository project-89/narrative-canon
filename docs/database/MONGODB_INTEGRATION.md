# MongoDB Integration Guide

This guide shows how to integrate narrative-canon with MongoDB storage in production, specifically designed for the Proxim8 pipeline architecture.

## Quick Start

### 1. Install Dependencies

```bash
cd experiments/narrative-extraction/narrative-canon
npm install mongoose zod
```

### 2. Basic Usage

```typescript
import { MongoNarrativeService } from './src/services/mongodb-narrative-service';

// Initialize with existing Proxim8 MongoDB connection
const narrativeService = new MongoNarrativeService(
  {
    connection: mongoose.connection, // Use existing Proxim8 connection
    dbName: 'proxim8' // Same database as Proxim8
  },
  {
    type: 'gemini',
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
    model: 'gemini-2.0-flash-exp'
  }
);

// Extract narrative from lore content
const result = await narrativeService.extractAndSave(
  "Alice and Bob met in the cyberpunk streets of Neo-Tokyo...",
  {
    title: "Proxim8 NFT #1337 Backstory",
    sourceType: 'lore',
    sourceId: 'lore_fragment_123',
    seasonId: 'season_1',
    tags: ['nft_1337', 'neo_tokyo', 'cyberpunk']
  }
);
```

## Integration with Proxim8 Systems

### Lore Controller Integration

Add narrative extraction to existing lore processing:

```typescript
// In server/src/controllers/loreController.ts

import { MongoNarrativeService } from '../narrative/mongodb-narrative-service';

// Initialize service (can be singleton)
const narrativeService = new MongoNarrativeService({
  connection: mongoose.connection // Reuse existing connection
});

export const createOrUpdateLore = async (req: RequestWithUser, res: Response) => {
  try {
    const { nftId } = req.params;
    const loreData = req.body;

    // Existing lore save logic
    const lore = await Lore.findOneAndUpdate(
      { nftId },
      { ...loreData, updatedAt: new Date() },
      { new: true, upsert: true }
    );

    // NEW: Extract narrative data
    if (lore.content) {
      try {
        const narrativeResult = await narrativeService.processLoreFragment(
          lore._id.toString(),
          lore.content,
          {
            nftId,
            tags: [nftId, 'lore', ...(lore.traits?.tags || [])]
          }
        );
        
        // Optionally store extraction metadata in lore
        lore.narrativeExtracted = true;
        lore.narrativeDocumentId = narrativeResult.documentId;
        lore.extractedEntities = narrativeResult.stats.entitiesExtracted;
        await lore.save();
        
      } catch (extractionError) {
        // Log but don't fail the lore save
        logger.warn(`Narrative extraction failed for lore ${lore._id}: ${extractionError}`);
      }
    }

    res.status(200).json(lore);
  } catch (error) {
    logger.error(`Error creating or updating lore: ${error}`);
    res.status(500).json({ message: "Server error", error });
  }
};
```

### Mission Outcome Integration

```typescript
// In server/src/controllers/missionController.ts

export const completeMission = async (req: RequestWithUser, res: Response) => {
  try {
    const { missionId } = req.params;
    const { outcome, narrative, stateChanges } = req.body;

    // Existing mission completion logic
    const mission = await Mission.findByIdAndUpdate(
      missionId,
      { status: 'completed', completedAt: new Date() },
      { new: true }
    );

    // NEW: Process narrative outcome
    if (narrative) {
      try {
        await narrativeService.processMissionOutcome(missionId, {
          narrative,
          success: outcome.success,
          timelineShift: outcome.timelineShift,
          stateChanges: stateChanges || []
        });
      } catch (error) {
        logger.warn(`Narrative processing failed for mission ${missionId}: ${error}`);
      }
    }

    res.status(200).json(mission);
  } catch (error) {
    logger.error(`Error completing mission: ${error}`);
    res.status(500).json({ message: "Server error", error });
  }
};
```

### New Narrative API Endpoints

Create new controller for narrative-specific queries:

```typescript
// server/src/controllers/narrativeController.ts

import { RequestWithUser } from '../middleware/auth';
import { MongoNarrativeService } from '../narrative/mongodb-narrative-service';

const narrativeService = new MongoNarrativeService({
  connection: mongoose.connection
});

export const getCharacters = async (req: RequestWithUser, res: Response) => {
  try {
    const { page = 1, limit = 10, canonicalStatus, minConsistency } = req.query;
    
    const result = await narrativeService.getEntities({
      type: 'character',
      canonicalStatus: canonicalStatus as any,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      minConsistencyScore: minConsistency ? parseInt(minConsistency as string) : undefined
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error(`Error getting characters: ${error}`);
    res.status(500).json({ message: "Server error", error });
  }
};

export const getCharacterGraph = async (req: RequestWithUser, res: Response) => {
  try {
    const { entityId } = req.params;
    const { depth = 2 } = req.query;

    const graph = await narrativeService.getEntityGraph(
      entityId, 
      parseInt(depth as string)
    );

    res.status(200).json(graph);
  } catch (error) {
    logger.error(`Error getting character graph: ${error}`);
    res.status(500).json({ message: "Server error", error });
  }
};

export const validateNarrativeConsistency = async (req: RequestWithUser, res: Response) => {
  try {
    const { entityId } = req.params;

    const validation = await narrativeService.validateNarrativeConsistency(entityId);

    res.status(200).json(validation);
  } catch (error) {
    logger.error(`Error validating consistency: ${error}`);
    res.status(500).json({ message: "Server error", error });
  }
};

// Admin endpoint for manual narrative extraction
export const extractNarrative = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.user?.isAdmin) {
      res.status(403).json({ message: "Unauthorized" });
      return;
    }

    const { content, title, sourceType, sourceId, tags } = req.body;

    const result = await narrativeService.extractAndSave(content, {
      title,
      sourceType,
      sourceId,
      tags: tags || []
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error(`Error extracting narrative: ${error}`);
    res.status(500).json({ message: "Server error", error });
  }
};
```

### Add Routes

```typescript
// server/src/routes/narrative.ts

import express from 'express';
import { auth } from '../middleware/auth';
import * as narrativeController from '../controllers/narrativeController';

const router = express.Router();

// Public endpoints
router.get('/characters', narrativeController.getCharacters);
router.get('/characters/:entityId/graph', narrativeController.getCharacterGraph);

// Protected endpoints
router.post('/extract', auth, narrativeController.extractNarrative);
router.get('/validate/:entityId', auth, narrativeController.validateNarrativeConsistency);

export default router;
```

### Environment Configuration

Add to your `.env` file:

```bash
# Narrative extraction settings
GOOGLE_GENAI_API_KEY=your_gemini_api_key
NARRATIVE_EXTRACTION_ENABLED=true
NARRATIVE_AUTO_EXTRACT_LORE=true
NARRATIVE_MIN_CONSISTENCY_SCORE=70
```

## Database Schema Migration

The MongoDB adapter creates its own collections alongside existing ones:

```
Existing Proxim8 Collections:
- lores
- loreragments  
- missions
- agents
- users

New Narrative Collections:
- narrativedocuments
- narrativeentities
- narrativerelationships
- narrativescenes
```

No migration required - new collections are created automatically.

## Production Deployment

### Memory Management

```typescript
// For production, consider memory limits
const narrativeService = new MongoNarrativeService(
  {
    connection: mongoose.connection,
  },
  {
    type: process.env.NODE_ENV === 'production' ? 'gemini' : 'mock',
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
  }
);

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  await narrativeService.close();
});
```

### Performance Considerations

1. **Batch Processing**: For large lore imports, process in batches:

```typescript
async function batchProcessLore(loreFragments: any[]) {
  const batchSize = 10;
  
  for (let i = 0; i < loreFragments.length; i += batchSize) {
    const batch = loreFragments.slice(i, i + batchSize);
    
    await Promise.all(batch.map(lore => 
      narrativeService.processLoreFragment(lore.id, lore.content, lore.metadata)
    ));
    
    // Prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

2. **Caching**: Consider Redis for frequently accessed narrative data:

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache entity graphs
const cacheKey = `narrative:entity:${entityId}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
} else {
  const graph = await narrativeService.getEntityGraph(entityId);
  await redis.setex(cacheKey, 3600, JSON.stringify(graph)); // 1 hour cache
  return graph;
}
```

3. **Background Processing**: Use job queues for heavy extractions:

```typescript
// Using Bull Queue
import Queue from 'bull';

const narrativeQueue = new Queue('narrative extraction', process.env.REDIS_URL);

narrativeQueue.process('extract-lore', async (job) => {
  const { loreId, content, metadata } = job.data;
  return narrativeService.processLoreFragment(loreId, content, metadata);
});

// Queue extraction instead of processing immediately
await narrativeQueue.add('extract-lore', {
  loreId: lore._id,
  content: lore.content,
  metadata: lore.metadata
});
```

## Frontend Integration

### React Hook for Narrative Data

```typescript
// client/src/hooks/useNarrativeEntities.ts

import { useState, useEffect } from 'react';

export function useNarrativeEntities(type: string, filters: any = {}) {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchEntities() {
      try {
        const params = new URLSearchParams({
          type,
          ...filters,
        });

        const response = await fetch(`/api/narrative/characters?${params}`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` }
        });

        const data = await response.json();
        setEntities(data.entities);
        setTotal(data.total);
      } catch (error) {
        console.error('Error fetching narrative entities:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchEntities();
  }, [type, JSON.stringify(filters)]);

  return { entities, loading, total };
}
```

### Character Relationship Visualization

```typescript
// client/src/components/narrative/CharacterGraph.tsx

export function CharacterGraph({ entityId }: { entityId: string }) {
  const [graph, setGraph] = useState(null);

  useEffect(() => {
    fetch(`/api/narrative/characters/${entityId}/graph`)
      .then(res => res.json())
      .then(setGraph);
  }, [entityId]);

  if (!graph) return <div>Loading...</div>;

  return (
    <div className="character-graph">
      <h3>{graph.entity.name}</h3>
      <div className="consistency-score">
        Consistency: {graph.entity.consistencyScore}%
      </div>
      
      <div className="relationships">
        {graph.relationships.map(rel => (
          <div key={rel.relationshipId} className="relationship">
            {rel.relationshipType}: {rel.targetEntityId}
            <span className="confidence">({rel.confidenceScore}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Monitoring and Analytics

### Consistency Tracking

```typescript
// Add to your monitoring dashboard
const consistencyStats = await narrativeService.getEntities({
  minConsistencyScore: 0
});

const stats = {
  totalEntities: consistencyStats.total,
  highConsistency: consistencyStats.entities.filter(e => e.consistencyScore >= 80).length,
  mediumConsistency: consistencyStats.entities.filter(e => e.consistencyScore >= 50 && e.consistencyScore < 80).length,
  lowConsistency: consistencyStats.entities.filter(e => e.consistencyScore < 50).length,
};
```

### Performance Metrics

```typescript
// Track extraction performance
const extractionStart = Date.now();
const result = await narrativeService.extractAndSave(content, metadata);
const extractionTime = Date.now() - extractionStart;

// Log metrics
logger.info('Narrative extraction completed', {
  documentId: result.documentId,
  entitiesExtracted: result.stats.entitiesExtracted,
  extractionTimeMs: extractionTime,
  consistencyScore: result.stats.consistencyScore
});
```

This integration approach allows you to add powerful narrative intelligence to Proxim8 while maintaining full compatibility with existing systems and following established patterns.
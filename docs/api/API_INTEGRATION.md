# API Integration Guide

The Narrative API Adapter automatically exposes the narrative-canon MongoDB service as REST endpoints, making integration with existing systems seamless.

## Quick Start

### 1. Basic Integration

```typescript
import express from 'express';
import { MongoNarrativeService, NarrativeApiAdapter } from '@narrative/canon';

const app = express();
app.use(express.json());

// Initialize narrative service
const narrativeService = new MongoNarrativeService(
  { mongoUrl: process.env.MONGODB_URI },
  { type: 'gemini', apiKey: process.env.GOOGLE_GENAI_API_KEY }
);

// Create and mount API adapter
const narrativeApi = new NarrativeApiAdapter({
  service: narrativeService,
  basePath: '/api/narrative'
});

narrativeApi.mount(app);

app.listen(3000, () => {
  console.log('🚀 Server running with narrative API at /api/narrative');
});
```

### 2. Proxim8 Integration

```typescript
// In your existing Proxim8 server
import { NarrativeApiAdapter } from '@narrative/canon';

// Use existing MongoDB connection
const narrativeService = new MongoNarrativeService(
  { connection: mongoose.connection }, // Reuse existing connection
  { type: 'gemini', apiKey: process.env.GOOGLE_GENAI_API_KEY }
);

const narrativeApi = new NarrativeApiAdapter({
  service: narrativeService,
  basePath: '/api/narrative',
  logger: logger.info // Use existing logger
});

// Mount alongside existing routes
app.use('/api/lore', loreRoutes);
app.use('/api/missions', missionRoutes);
narrativeApi.mount(app); // Adds /api/narrative/*
```

## API Endpoints

### Public Endpoints (Read-only)

#### `GET /api/narrative/entities`
Get entities with filtering and pagination.

**Query Parameters:**
- `type` - Entity type ('character', 'location', 'organization', 'concept', 'object')
- `canonicalStatus` - Status filter ('canon', 'disputed', 'extracted', 'validated')
- `sourceType` - Source filter ('lore', 'mission', 'manual', 'generated')
- `seasonId` - Filter by season
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `minConsistencyScore` - Minimum consistency score

**Example:**
```bash
GET /api/narrative/entities?type=character&canonicalStatus=canon&page=1&limit=10
```

**Response:**
```json
{
  "entities": [
    {
      "entityId": "doc123_alice",
      "name": "Alice Chen",
      "type": "character",
      "description": "A skilled hacker from Neo-Tokyo",
      "consistencyScore": 85,
      "canonicalStatus": "canon",
      "sourceFragments": ["lore_fragment_123"],
      "missionAppearances": ["mission_alpha"],
      "tags": ["hacker", "resistance"]
    }
  ],
  "total": 42,
  "totalPages": 5
}
```

#### `GET /api/narrative/entities/:entityId`
Get specific entity by ID.

#### `GET /api/narrative/entities/:entityId/graph`
Get entity relationship graph.

**Query Parameters:**
- `depth` - Graph traversal depth (default: 2)

**Response:**
```json
{
  "entity": { /* entity data */ },
  "relationships": [
    {
      "relationshipId": "rel_123",
      "sourceEntityId": "doc123_alice",
      "targetEntityId": "doc123_bob",
      "relationshipType": "ally",
      "confidenceScore": 85
    }
  ],
  "connectedEntities": [ /* connected entities */ ],
  "networkStats": {
    "directConnections": 3,
    "networkSize": 12,
    "avgConsistencyScore": 78.5
  }
}
```

#### `GET /api/narrative/characters`
Get characters (convenience endpoint for type='character').

#### `GET /api/narrative/locations`
Get locations (convenience endpoint for type='location').

#### `GET /api/narrative/organizations`
Get organizations (convenience endpoint for type='organization').

#### `GET /api/narrative/documents/:documentId/scenes`
Get scenes for a specific document.

#### `GET /api/narrative/health`
Health check endpoint.

### Protected Endpoints (Write operations)

#### `POST /api/narrative/extract` (Admin only)
Manual narrative extraction.

**Request Body:**
```json
{
  "content": "Alice Chen was a skilled hacker...",
  "title": "Character Background",
  "sourceType": "manual",
  "sourceId": "optional_source_id",
  "seasonId": "season_1",
  "tags": ["character", "background"],
  "userId": "optional_user_id"
}
```

**Response:**
```json
{
  "documentId": "manual_1234567890_abc123",
  "extraction": { /* extracted narrative structure */ },
  "stats": {
    "entitiesExtracted": 3,
    "relationshipsExtracted": 2,
    "scenesExtracted": 1,
    "consistencyScore": 78
  }
}
```

#### `POST /api/narrative/lore`
Process lore fragment (integrates with lore system).

**Request Body:**
```json
{
  "loreFragmentId": "lore_fragment_123",
  "content": "Proxim8 #1337 enhanced Alice's abilities...",
  "nftId": "1337",
  "seasonId": "season_1",
  "missionId": "mission_alpha",
  "tags": ["proxim8", "enhancement"]
}
```

#### `POST /api/narrative/missions`
Process mission outcome (integrates with mission system).

**Request Body:**
```json
{
  "missionId": "mission_alpha",
  "narrative": "Alice successfully infiltrated the facility...",
  "success": true,
  "timelineShift": 5,
  "stateChanges": [
    {
      "entityName": "Alice Chen",
      "changeType": "modify",
      "description": "Gained elite hacker status"
    }
  ]
}
```

### Consistency Endpoints

#### `GET /api/narrative/entities/:entityId/consistency`
Validate narrative consistency for an entity.

**Response:**
```json
{
  "consistencyScore": 78,
  "conflicts": [
    {
      "type": "relationship_contradiction",
      "description": "Entity has contradictory relationships: enemy, ally",
      "severity": "high",
      "affectedEntities": ["doc123_alice", "doc123_oneirocom"]
    }
  ],
  "recommendations": [
    "Consider reviewing source material for conflicts",
    "High-severity conflicts detected - requires manual review"
  ]
}
```

#### `PUT /api/narrative/entities/:entityId/consistency` (Admin only)
Update consistency score.

#### `POST /api/narrative/entities/:entityId/conflicts` (Admin only)
Flag conflicts.

### Integration Endpoints

#### `POST /api/narrative/entities/:entityId/lore/:fragmentId`
Link entity to lore fragment.

#### `POST /api/narrative/entities/:entityId/timeline/:eventId`
Link entity to timeline event.

#### `POST /api/narrative/entities/:entityId/missions/:missionId`
Link entity to mission.

### Admin Endpoints

#### `GET /api/narrative/admin/documents` (Admin only)
Get all documents with pagination.

#### `GET /api/narrative/admin/stats` (Admin only)
Get system statistics.

**Response:**
```json
{
  "documents": 156,
  "entities": 423,
  "relationships": 289,
  "scenes": 67,
  "averageConsistencyScore": 72.3,
  "lastUpdated": "2025-05-31T12:00:00.000Z"
}
```

## Integration Patterns

### 1. Automatic Lore Processing

```typescript
// In your existing lore controller
app.post('/api/lore/:nftId', async (req, res) => {
  // Existing lore save logic
  const lore = await Lore.create(req.body);
  
  // Automatically extract narrative
  try {
    await fetch('/api/narrative/lore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loreFragmentId: lore._id,
        content: lore.content,
        nftId: req.params.nftId,
        tags: ['auto_extracted']
      })
    });
  } catch (error) {
    console.warn('Narrative extraction failed:', error);
  }
  
  res.json(lore);
});
```

### 2. Mission Outcome Integration

```typescript
// In your existing mission controller
app.post('/api/missions/:missionId/complete', async (req, res) => {
  // Existing mission completion logic
  const mission = await Mission.findByIdAndUpdate(
    req.params.missionId,
    { status: 'completed' }
  );
  
  // Process narrative outcome
  if (req.body.narrative) {
    await fetch('/api/narrative/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missionId: req.params.missionId,
        narrative: req.body.narrative,
        success: req.body.success,
        timelineShift: req.body.timelineShift,
        stateChanges: req.body.stateChanges || []
      })
    });
  }
  
  res.json(mission);
});
```

### 3. Frontend Integration

```typescript
// React hook for narrative data
export function useNarrativeEntities(filters = {}) {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEntities() {
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/narrative/entities?${params}`);
      const data = await response.json();
      setEntities(data.entities);
      setLoading(false);
    }
    
    fetchEntities();
  }, [JSON.stringify(filters)]);

  return { entities, loading };
}

// Usage
function CharacterList() {
  const { entities, loading } = useNarrativeEntities({
    type: 'character',
    canonicalStatus: 'canon',
    minConsistencyScore: 70
  });

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {entities.map(entity => (
        <CharacterCard key={entity.entityId} entity={entity} />
      ))}
    </div>
  );
}
```

## Authentication Integration

### Proxim8 Auth Pattern

```typescript
// Use existing Proxim8 auth middleware
import { auth } from '../middleware/auth'; // Existing auth

app.use('/api/narrative', auth); // Apply to all narrative endpoints

const narrativeApi = new NarrativeApiAdapter({
  service: narrativeService,
  basePath: '/api/narrative'
  // Auth is handled by middleware above
});
```

### Custom Auth Integration

```typescript
// Custom auth middleware
app.use('/api/narrative', (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = {
      walletAddress: user.walletAddress,
      isAdmin: user.roles.includes('admin')
    };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});
```

## Error Handling

The API adapter provides consistent error responses:

```json
{
  "message": "Error description",
  "error": "Detailed error message",
  "errors": [ /* Validation errors array */ ]
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized
- `403` - Forbidden (admin required)
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable (health check failure)

## Performance Considerations

### Caching

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache middleware for read-heavy endpoints
app.use('/api/narrative/entities', async (req, res, next) => {
  const cacheKey = `entities:${JSON.stringify(req.query)}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  // Store original res.json
  const originalJson = res.json;
  res.json = function(data) {
    redis.setex(cacheKey, 300, JSON.stringify(data)); // 5 min cache
    return originalJson.call(this, data);
  };
  
  next();
});
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/narrative', limiter);
```

## Monitoring and Logging

```typescript
const narrativeApi = new NarrativeApiAdapter({
  service: narrativeService,
  basePath: '/api/narrative',
  logger: (message, data) => {
    console.log(`[NARRATIVE-API] ${message}`, data);
    
    // Send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      monitoringService.log('narrative-api', message, data);
    }
  }
});

// Health check monitoring
app.get('/api/narrative/health', async (req, res) => {
  const healthResponse = await narrativeApi.healthCheck(req, res);
  
  // Alert if unhealthy
  if (res.statusCode !== 200) {
    alertService.send('Narrative API unhealthy', healthResponse);
  }
});
```

## Deployment

### Docker Example

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build
RUN npm run build

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:$PORT/api/narrative/health || exit 1

# Start
CMD ["npm", "start"]
```

### Environment Variables

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/proxim8

# LLM
GOOGLE_GENAI_API_KEY=your_api_key

# Optional
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
```

This API adapter makes narrative intelligence accessible through standard REST endpoints, enabling seamless integration with existing systems while maintaining the full power of the narrative-canon library.
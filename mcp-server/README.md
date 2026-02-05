# Narrative Canon MCP Server

A Model Context Protocol (MCP) server that provides LLMs with direct access to narrative graph querying, analysis, and visualization capabilities using the narrative-canon library.

## Features

### 🔍 **Query Tools**
- **Natural Language Queries**: Ask questions like "What happened at Neo-Tokyo?" or "Who touched the sword?"
- **Location Event Queries**: Find all events at specific locations with filtering
- **Object Interaction Queries**: Track who interacted with objects and how
- **Entity Path Queries**: Discover relationship paths between entities
- **Temporal Event Queries**: Query events by timeline and participation

### 📊 **Data Management**
- **Narrative Extraction**: Process text into structured narrative data
- **Entity Management**: List, search, and inspect narrative entities
- **Scene Management**: Access and analyze narrative scenes
- **Database Statistics**: Get insights into narrative structure

### 📈 **Visualization & Export**
- **Graph Visualization**: Generate interactive graph data for entities and relationships
- **Timeline Visualization**: Create timeline views of narrative events
- **Multi-format Export**: Export data in JSON, GraphML, GEXF, and Cytoscape formats
- **Filtered Views**: Focus on specific entity types, relationships, or narrative subsets

## Installation

### Prerequisites
- Node.js 18+ 
- MongoDB instance
- Claude Desktop or compatible MCP client

### Setup

1. **Install the MCP server:**
```bash
cd narrative-canon/mcp-server
npm install
npm run build
```

2. **Configure Claude Desktop:**

Add to your `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "narrative-canon": {
      "command": "node",
      "args": ["/path/to/narrative-canon/mcp-server/dist/server.js"],
      "env": {
        "MONGO_URL": "mongodb://localhost:27017",
        "DB_NAME": "narrative-canon",
        "ENABLE_EXTRACTION": "true"
      }
    }
  }
}
```

3. **Start MongoDB:**
```bash
# Using homebrew on macOS
brew services start mongodb-community

# Or using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

4. **Restart Claude Desktop** to load the MCP server.

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `DB_NAME` | `narrative-canon` | Database name |
| `MAX_RESULTS` | `100` | Maximum results per query |
| `ENABLE_EXTRACTION` | `true` | Enable narrative text extraction |

## Usage Examples

Once configured, you can ask Claude to use the narrative tools:

### Basic Queries

```
"Use the narrative canon tools to extract this story and then analyze it:

[Your story text here]"
```

```
"Query the narrative database: What happened at the Dark Castle?"
```

```
"Find all characters who interacted with the ancient sword"
```

### Advanced Analysis

```
"Generate a graph visualization focusing on character relationships, then export it in Cytoscape format"
```

```
"Create a timeline of all events involving Alice, filtered to combat and discovery event types"
```

```
"Analyze the narrative structure and show me statistics about entity types and relationships"
```

## Available Tools

### Query Tools

#### `query_natural_language`
Query using natural language - supports complex questions about locations, objects, characters, and events.

**Example:** "What happened at Neo-Tokyo during the infiltration?"

#### `query_events_at_location`
Find events at specific locations with optional filtering by event type and time range.

#### `query_object_interactions` 
Track object usage and interactions across the narrative.

#### `query_entity_path`
Find relationship paths between entities with configurable depth limits.

#### `query_temporal_events`
Query events by timeline, entity involvement, and sequence ranges.

### Data Management Tools

#### `extract_narrative`
Process raw text into structured narrative data using AI extraction.

**Methods:**
- `chunked`: Scene-based extraction
- `hierarchical`: Multi-level structure extraction  
- `state_change`: Focus on entity state changes

#### `list_entities`
Browse entities with filtering by type, canonical status, and pagination.

#### `get_entity_details`
Get comprehensive information about specific entities including relationships.

#### `list_scenes`
Access narrative scenes from documents with event details.

### Analysis Tools

#### `analyze_narrative_structure`
Get database statistics and structure analysis.

#### `get_query_examples`
Retrieve example queries for different use cases.

### Visualization Tools

#### `generate_graph_visualization`
Create graph data for entity-relationship visualization.

**Options:**
- Filter by entity/relationship types
- Focus on entities around a center point
- Control graph size and depth
- Include/exclude orphaned entities

#### `generate_timeline_visualization`
Generate timeline data for narrative events.

**Options:**
- Filter by document, entity, or event types
- Control timeline scope and detail level

#### `export_graph_data`
Export graph data in multiple formats:

- **JSON**: Raw data format
- **GraphML**: Standard graph format for analysis tools
- **GEXF**: Gephi-compatible format
- **Cytoscape**: Ready for Cytoscape visualization

## Integration Examples

### With Claude Desktop

Ask Claude to:

```
"Extract the narrative structure from this text, then create a character relationship graph and export it in GraphML format for analysis in Gephi"
```

```
"Query all events involving magical objects, then generate a timeline visualization to show the chronological sequence"
```

### With Custom MCP Clients

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: "narrative-analysis-client",
  version: "1.0.0"
});

// Query natural language
const result = await client.request({
  method: "tools/call",
  params: {
    name: "query_natural_language",
    arguments: {
      query: "Who are the main characters in Neo-Tokyo?"
    }
  }
});

// Generate visualization
const vizData = await client.request({
  method: "tools/call", 
  params: {
    name: "generate_graph_visualization",
    arguments: {
      entityTypes: ["character"],
      maxNodes: 50,
      includeOrphans: false
    }
  }
});
```

## Performance Considerations

- **Large Graphs**: Use `maxNodes` parameter to limit visualization size
- **Deep Queries**: Set `maxDepth` on path queries to control traversal
- **Pagination**: Use `page` and `limit` for large entity lists
- **Filtering**: Apply entity/relationship type filters to focus results

## Troubleshooting

### MongoDB Connection Issues
```bash
# Check MongoDB status
brew services list | grep mongodb

# View server logs
tail -f /usr/local/var/log/mongodb/mongo.log
```

### MCP Server Issues
```bash
# Test server directly
node dist/server.js

# Check Claude Desktop logs
tail -f ~/Library/Logs/Claude/mcp.log
```

### Performance Issues
- Reduce `maxNodes` for visualization tools
- Use filtering to narrow query scope
- Consider database indexing for large datasets

## Development

### Building from Source
```bash
npm install
npm run build
npm run dev  # Watch mode for development
```

### Testing
```bash
# Test with sample narrative
node dist/server.js << EOF
{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
EOF
```

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the narrative-canon library documentation
- File issues in the project repository
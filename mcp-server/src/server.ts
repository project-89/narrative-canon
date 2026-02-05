#!/usr/bin/env node

/**
 * MCP Server for Narrative Canon Library
 * Provides LLM access to narrative graph querying and analysis capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';

// Import our narrative canon library components directly
import { MongoNarrativeAdapter } from '../../src/storage/mongodb-adapter.js';
import { TemporalNarrativeGraph } from '../../src/core/temporal-graph.js';
import { GraphQueryEngine, LLMQueryInterface } from '../../src/queries/index.js';
import { ChunkedSceneExtractor } from '../../src/extractors/chunked-scene-extractor.js';
import { HierarchicalNarrativeExtractor } from '../../src/extractors/hierarchical.js';
import { StateChangeExtractor } from '../../src/extractors/state-change-extractor.js';
import { MockLLM } from '../../src/llm/mock.js';

// Import visualization tools
import { VisualizationTools } from './visualization-tools.js';

// Server configuration
const SERVER_NAME = 'narrative-canon-mcp';
const SERVER_VERSION = '0.1.0';

// Global instances
let adapter: MongoNarrativeAdapter;
let temporalGraph: TemporalNarrativeGraph;
let queryEngine: GraphQueryEngine;
let llmInterface: LLMQueryInterface;
let chunkedExtractor: ChunkedSceneExtractor;
let hierarchicalExtractor: HierarchicalNarrativeExtractor;
let stateChangeExtractor: StateChangeExtractor;
let visualizationTools: VisualizationTools;

// Configuration schema
const ConfigSchema = z.object({
  mongoUrl: z.string().default('mongodb://localhost:27017'),
  dbName: z.string().default('narrative-canon'),
  maxResults: z.number().default(100),
  enableExtraction: z.boolean().default(true),
});

type Config = z.infer<typeof ConfigSchema>;

// Initialize the narrative system
async function initializeNarrativeSystem(config: Config) {
  try {
    // Create MongoDB connection
    const connection = mongoose.createConnection(config.mongoUrl, {
      dbName: config.dbName,
    });

    await new Promise((resolve, reject) => {
      connection.once('open', resolve);
      connection.once('error', reject);
    });

    // Initialize components
    adapter = new MongoNarrativeAdapter({ connection });
    temporalGraph = new TemporalNarrativeGraph();
    queryEngine = new GraphQueryEngine(adapter, temporalGraph);
    llmInterface = new LLMQueryInterface(queryEngine);
    visualizationTools = new VisualizationTools(adapter);

    if (config.enableExtraction) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
      if (apiKey && apiKey !== 'mock-api-key') {
        console.error('🔑 Using real Gemini API key for extraction');
        hierarchicalExtractor = new HierarchicalNarrativeExtractor(apiKey);
      } else {
        console.error('🤖 Using MockLLM for extraction');
        const mockLLM = new MockLLM();
        hierarchicalExtractor = mockLLM as any;
      }
      
      const mockLLM = new MockLLM();
      chunkedExtractor = new ChunkedSceneExtractor(mockLLM);
      stateChangeExtractor = new StateChangeExtractor(mockLLM);
    }

    console.error('✅ Narrative Canon MCP Server initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize narrative system:', error);
    throw error;
  }
}

// Tool definitions
const tools: Tool[] = [
  // === QUERY TOOLS ===
  {
    name: 'query_natural_language',
    description: 'Query the narrative graph using natural language. Supports queries like "What happened at Neo-Tokyo?" or "Who touched the sword?"',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query about the narrative'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'query_events_at_location',
    description: 'Find all events that happened at a specific location',
    inputSchema: {
      type: 'object',
      properties: {
        locationName: {
          type: 'string',
          description: 'Name of the location to search'
        },
        locationId: {
          type: 'string',
          description: 'ID of the location entity'
        },
        eventTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by specific event types, or ["*"] for all types'
        },
        timeRange: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'ISO date string' },
            end: { type: 'string', description: 'ISO date string' }
          }
        }
      }
    }
  },
  {
    name: 'query_object_interactions',
    description: 'Find who interacted with an object and how',
    inputSchema: {
      type: 'object',
      properties: {
        objectName: {
          type: 'string',
          description: 'Name of the object to search for'
        },
        objectId: {
          type: 'string',
          description: 'ID of the object entity'
        },
        interactionTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Types of interactions to find (touch, use, wield, etc.) or ["*"] for all'
        }
      }
    }
  },
  {
    name: 'query_entity_path',
    description: 'Find relationship paths between two entities',
    inputSchema: {
      type: 'object',
      properties: {
        startEntityId: {
          type: 'string',
          description: 'ID of the starting entity'
        },
        endEntityId: {
          type: 'string',
          description: 'ID of the target entity'
        },
        maxHops: {
          type: 'number',
          description: 'Maximum number of relationship hops (default: 6)'
        },
        relationshipTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Types of relationships to follow, or ["*"] for all'
        }
      },
      required: ['startEntityId', 'endEntityId']
    }
  },
  {
    name: 'query_temporal_events',
    description: 'Query events by timeline and entity involvement',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: {
          type: 'string',
          description: 'Entity that must be involved in events'
        },
        locationId: {
          type: 'string',
          description: 'Location where events occurred'
        },
        eventTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Types of events to include, or ["*"] for all'
        },
        sequenceRange: {
          type: 'object',
          properties: {
            start: { type: 'number' },
            end: { type: 'number' }
          }
        }
      }
    }
  },

  // === DATA MANAGEMENT TOOLS ===
  {
    name: 'extract_narrative',
    description: 'Extract narrative structure from text using AI processing',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The narrative text to analyze'
        },
        documentId: {
          type: 'string',
          description: 'Unique identifier for this document'
        },
        title: {
          type: 'string',
          description: 'Title of the narrative'
        },
        extractionMethod: {
          type: 'string',
          enum: ['chunked', 'hierarchical', 'state_change'],
          description: 'Method to use for extraction',
          default: 'hierarchical'
        }
      },
      required: ['text', 'documentId', 'title']
    }
  },
  {
    name: 'list_entities',
    description: 'List entities in the narrative database with filtering',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['character', 'location', 'organization', 'concept', 'object', 'technology'],
          description: 'Filter by entity type'
        },
        canonicalStatus: {
          type: 'string',
          enum: ['canon', 'disputed', 'extracted', 'validated'],
          description: 'Filter by canonical status'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)'
        },
        limit: {
          type: 'number',
          description: 'Number of results per page (default: 20)'
        }
      }
    }
  },
  {
    name: 'get_entity_details',
    description: 'Get detailed information about a specific entity',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: {
          type: 'string',
          description: 'ID of the entity to retrieve'
        }
      },
      required: ['entityId']
    }
  },
  {
    name: 'list_scenes',
    description: 'List scenes from a specific document',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'ID of the document to get scenes from'
        }
      },
      required: ['documentId']
    }
  },

  // === ANALYSIS TOOLS ===
  {
    name: 'get_query_examples',
    description: 'Get example queries that can be used with the system',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'analyze_narrative_structure',
    description: 'Analyze the overall structure and statistics of the narrative database',
    inputSchema: {
      type: 'object',
      properties: {
        includeStats: {
          type: 'boolean',
          description: 'Include detailed statistics',
          default: true
        }
      }
    }
  },

  // === VISUALIZATION TOOLS ===
  {
    name: 'generate_graph_visualization',
    description: 'Generate graph visualization data for entities and relationships',
    inputSchema: {
      type: 'object',
      properties: {
        entityTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by entity types (character, location, object, etc.)'
        },
        relationshipTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by relationship types'
        },
        maxNodes: {
          type: 'number',
          description: 'Maximum number of nodes to include (default: 500)'
        },
        includeOrphans: {
          type: 'boolean',
          description: 'Include entities without relationships (default: false)'
        },
        centerEntity: {
          type: 'string',
          description: 'Focus on entities connected to this entity'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum relationship depth from center entity (default: 3)'
        }
      }
    }
  },
  {
    name: 'generate_timeline_visualization',
    description: 'Generate timeline visualization data for narrative events',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'Filter by specific document'
        },
        entityId: {
          type: 'string',
          description: 'Filter by entity involvement'
        },
        maxEvents: {
          type: 'number',
          description: 'Maximum number of events (default: 1000)'
        },
        eventTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by event types'
        }
      }
    }
  },
  {
    name: 'export_graph_data',
    description: 'Export graph data in various formats (JSON, GraphML, GEXF, Cytoscape)',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['json', 'graphml', 'gexf', 'cytoscape'],
          description: 'Export format'
        },
        entityTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by entity types'
        },
        maxNodes: {
          type: 'number',
          description: 'Maximum number of nodes'
        },
        centerEntity: {
          type: 'string',
          description: 'Focus on entities connected to this entity'
        }
      },
      required: ['format']
    }
  },

  // === FILE PROCESSING TOOLS ===
  {
    name: 'process_file',
    description: 'Read and extract narrative structure from a single file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file to process'
        },
        documentId: {
          type: 'string',
          description: 'Unique identifier for this document (optional - will use filename if not provided)'
        },
        extractionMethod: {
          type: 'string',
          enum: ['chunked', 'hierarchical', 'state_change'],
          description: 'Method to use for extraction',
          default: 'hierarchical'
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite existing document with same ID',
          default: false
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'process_directory',
    description: 'Bulk process all markdown/text files in a directory and subdirectories',
    inputSchema: {
      type: 'object',
      properties: {
        directoryPath: {
          type: 'string',
          description: 'Absolute path to the directory to process'
        },
        fileExtensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'File extensions to process (default: [".md", ".txt"])',
          default: ['.md', '.txt']
        },
        extractionMethod: {
          type: 'string',
          enum: ['chunked', 'hierarchical', 'state_change'],
          description: 'Method to use for extraction',
          default: 'hierarchical'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to process subdirectories recursively',
          default: true
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum number of files to process (default: 100)',
          default: 100
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite existing documents',
          default: false
        },
        excludePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Patterns to exclude (e.g., ["node_modules", ".git", "dist"])',
          default: ['node_modules', '.git', 'dist', '.next', 'build']
        }
      },
      required: ['directoryPath']
    }
  },
  {
    name: 'list_files',
    description: 'List files in a directory that would be processed',
    inputSchema: {
      type: 'object',
      properties: {
        directoryPath: {
          type: 'string',
          description: 'Absolute path to the directory to scan'
        },
        fileExtensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'File extensions to include (default: [".md", ".txt"])',
          default: ['.md', '.txt']
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to scan subdirectories recursively',
          default: true
        },
        excludePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Patterns to exclude',
          default: ['node_modules', '.git', 'dist', '.next', 'build']
        }
      },
      required: ['directoryPath']
    }
  }
];

// File processing helper functions
async function processFile(args: any) {
  const { filePath, documentId, extractionMethod = 'hierarchical', overwrite = false } = args;
  
  try {
    // Check if file exists
    await fs.access(filePath);
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Generate document ID from filename if not provided
    const finalDocumentId = documentId || path.basename(filePath, path.extname(filePath));
    
    // Check if document already exists
    if (!overwrite) {
      const existing = await adapter.DocumentModel.findOne({ documentId: finalDocumentId });
      if (existing) {
        return {
          success: false,
          message: `Document with ID '${finalDocumentId}' already exists. Use overwrite: true to replace it.`,
          documentId: finalDocumentId,
          filePath
        };
      }
    }
    
    // Extract narrative structure
    if (!hierarchicalExtractor) {
      throw new Error('Extraction is not enabled in configuration');
    }
    
    let extracted;
    switch (extractionMethod) {
      case 'hierarchical':
        extracted = await hierarchicalExtractor.extractNarrative(content);
        break;
      default:
        extracted = await hierarchicalExtractor.extractNarrative(content);
    }
    
    // Save to database
    const savedDocumentId = await adapter.saveNarrativeDocument(
      finalDocumentId,
      path.basename(filePath),
      content,
      extracted,
      {
        extractionVersion: '1.0',
        llmModel: 'hierarchical-extractor',
        sourceType: 'manual'
      }
    );
    
    return {
      success: true,
      message: `Successfully processed file: ${filePath}`,
      documentId: savedDocumentId,
      filePath,
      extracted: {
        entities: extracted.entities?.length || 0,
        events: extracted.events?.length || 0,
        scenes: extracted.scenes?.length || 0,
        themes: extracted.themes?.length || 0
      }
    };
    
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw new Error(`Failed to process file ${filePath}: ${error.message}`);
  }
}

async function processDirectory(args: any) {
  const {
    directoryPath,
    fileExtensions = ['.md', '.txt'],
    extractionMethod = 'hierarchical',
    recursive = true,
    maxFiles = 100,
    overwrite = false,
    excludePatterns = ['node_modules', '.git', 'dist', '.next', 'build']
  } = args;
  
  try {
    // Get list of files to process
    const files = await getFilesInDirectory(directoryPath, fileExtensions, recursive, excludePatterns);
    
    if (files.length === 0) {
      return {
        success: true,
        message: `No files found in directory: ${directoryPath}`,
        processedFiles: [],
        skippedFiles: [],
        totalFiles: 0
      };
    }
    
    // Limit number of files
    const filesToProcess = files.slice(0, maxFiles);
    
    const results = {
      success: true,
      message: `Processing ${filesToProcess.length} files...`,
      processedFiles: [] as any[],
      skippedFiles: [] as any[],
      errors: [] as any[],
      totalFiles: filesToProcess.length
    };
    
    // Process files sequentially to avoid overwhelming the LLM
    for (const filePath of filesToProcess) {
      try {
        console.error(`📄 Processing: ${path.relative(directoryPath, filePath)}`);
        
        const result = await processFile({
          filePath,
          extractionMethod,
          overwrite
        });
        
        if (result.success) {
          results.processedFiles.push({
            filePath,
            documentId: result.documentId,
            extracted: result.extracted
          });
        } else {
          results.skippedFiles.push({
            filePath,
            reason: result.message
          });
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error: any) {
        console.error(`❌ Error processing ${filePath}: ${error.message}`);
        results.errors.push({
          filePath,
          error: error.message
        });
      }
    }
    
    results.message = `Processed ${results.processedFiles.length}/${results.totalFiles} files successfully. ${results.skippedFiles.length} skipped, ${results.errors.length} errors.`;
    
    return results;
    
  } catch (error: any) {
    throw new Error(`Failed to process directory ${directoryPath}: ${error.message}`);
  }
}

async function listFiles(args: any) {
  const {
    directoryPath,
    fileExtensions = ['.md', '.txt'],
    recursive = true,
    excludePatterns = ['node_modules', '.git', 'dist', '.next', 'build']
  } = args;
  
  try {
    const files = await getFilesInDirectory(directoryPath, fileExtensions, recursive, excludePatterns);
    
    const fileInfos = await Promise.all(
      files.map(async (filePath) => {
        const stats = await fs.stat(filePath);
        const relativePath = path.relative(directoryPath, filePath);
        
        return {
          filePath,
          relativePath,
          filename: path.basename(filePath),
          extension: path.extname(filePath),
          size: stats.size,
          modified: stats.mtime.toISOString()
        };
      })
    );
    
    return {
      directoryPath,
      totalFiles: fileInfos.length,
      files: fileInfos,
      fileExtensions,
      recursive,
      excludePatterns
    };
    
  } catch (error: any) {
    throw new Error(`Failed to list files in ${directoryPath}: ${error.message}`);
  }
}

async function getFilesInDirectory(
  dirPath: string,
  extensions: string[],
  recursive: boolean,
  excludePatterns: string[]
): Promise<string[]> {
  const files: string[] = [];
  
  async function scanDirectory(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      // Check if should be excluded
      if (excludePatterns.some(pattern => entry.name.includes(pattern))) {
        continue;
      }
      
      if (entry.isDirectory() && recursive) {
        await scanDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  await scanDirectory(dirPath);
  return files.sort();
}

// Tool handlers
async function handleToolCall(name: string, args: any) {
  try {
    switch (name) {
      case 'query_natural_language':
        return await llmInterface.executeNaturalLanguageQuery(args.query);

      case 'query_events_at_location':
        return await llmInterface.executeLocationQuery(args);

      case 'query_object_interactions':
        return await llmInterface.executeObjectQuery(args);

      case 'query_entity_path':
        return await llmInterface.executePathQuery(args);

      case 'query_temporal_events':
        return await llmInterface.executeTemporalQuery(args);

      case 'extract_narrative':
        if (!chunkedExtractor || !hierarchicalExtractor || !stateChangeExtractor) {
          throw new Error('Extraction is not enabled in configuration');
        }

        let extracted;
        switch (args.extractionMethod) {
          case 'chunked':
            // ChunkedSceneExtractor has different interface
            throw new Error('Chunked extraction not yet implemented in MCP server');
          case 'hierarchical':
            extracted = await hierarchicalExtractor.extractNarrative(args.text);
            break;
          case 'state_change':
            // StateChangeExtractor has different interface
            throw new Error('State change extraction not yet implemented in MCP server');
          default:
            extracted = await hierarchicalExtractor.extractNarrative(args.text);
        }
        
        // Save to database
        const documentId = await adapter.saveNarrativeDocument(
          args.documentId,
          args.title,
          args.text,
          extracted,
          {
            extractionVersion: '1.0',
            llmModel: 'narrative-extractor',
            sourceType: 'manual'
          }
        );

        return {
          documentId,
          extracted,
          message: 'Narrative extracted and saved successfully'
        };

      case 'list_entities':
        return await adapter.getEntitiesByType(args.type || 'character', {
          page: args.page || 1,
          limit: Math.min(args.limit || 20, 100),
          canonicalStatus: args.canonicalStatus
        });

      case 'get_entity_details':
        const entity = await adapter.EntityModel.findOne({ entityId: args.entityId });
        if (!entity) {
          throw new Error(`Entity not found: ${args.entityId}`);
        }
        
        const relationships = await adapter.getEntityRelationships(args.entityId);
        
        return {
          entity: entity.toObject(),
          relationships: relationships.map(r => r.toObject())
        };

      case 'list_scenes':
        return await adapter.getDocumentScenes(args.documentId);

      case 'get_query_examples':
        return llmInterface.getQueryExamples();

      case 'analyze_narrative_structure':
        const stats = {
          entities: await adapter.EntityModel.countDocuments(),
          relationships: await adapter.RelationshipModel.countDocuments(),
          scenes: await adapter.SceneModel.countDocuments(),
          documents: await adapter.DocumentModel.countDocuments()
        };

        if (args.includeStats) {
          const entityTypes = await adapter.EntityModel.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ]);

          const relationshipTypes = await adapter.RelationshipModel.aggregate([
            { $group: { _id: '$relationshipType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ]);

          return {
            totalCounts: stats,
            entityTypeBreakdown: entityTypes,
            relationshipTypeBreakdown: relationshipTypes
          };
        }

        return { totalCounts: stats };

      case 'generate_graph_visualization':
        return await visualizationTools.generateGraphVisualization(args);

      case 'generate_timeline_visualization':
        return await visualizationTools.generateTimelineVisualization(args);

      case 'export_graph_data':
        return await visualizationTools.exportGraphData(args.format, args);

      case 'process_file':
        return await processFile(args);

      case 'process_directory':
        return await processDirectory(args);

      case 'list_files':
        return await listFiles(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    throw new Error(`Tool execution failed: ${error.message}`);
  }
}

// Create and configure the server
const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const result = await handleToolCall(name, args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Main function
async function main() {
  // Parse configuration from environment variables
  const config = ConfigSchema.parse({
    mongoUrl: process.env.MONGO_URL,
    dbName: process.env.DB_NAME,
    maxResults: process.env.MAX_RESULTS ? parseInt(process.env.MAX_RESULTS) : undefined,
    enableExtraction: process.env.ENABLE_EXTRACTION !== 'false',
  });

  // Initialize the narrative system
  await initializeNarrativeSystem(config);

  // Create transport and connect
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`🚀 ${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
  console.error(`📊 Database: ${config.dbName} at ${config.mongoUrl}`);
  console.error(`🔧 Extraction enabled: ${config.enableExtraction}`);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('🛑 Shutting down MCP server...');
  if (adapter) {
    await adapter.close();
  }
  process.exit(0);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}
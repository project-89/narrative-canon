#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { NarrativePipeline } = require('./pipeline');
const { UnifiedLLMAdapter } = require('./llm/adapter');
const { TemporalGraphBuilder } = require('./graph/temporal');
// const { FileStore } = require('./storage/file-store');
const { generateVisualizationHTML } = require('./visualization/html-generator');
const chalk = require('chalk');
const ora = require('ora');
const { config } = require('dotenv');

// Load environment variables
config();

const program = new Command();

program
  .name('narrative-canon')
  .description('Extract and visualize narrative structures from text documents')
  .version('0.1.0');

program
  .command('extract <file>')
  .description('Extract narrative structure from a text file')
  .option('-o, --output <dir>', 'Output directory', './narrative-output')
  .option('-f, --format <format>', 'Output format (json, html, both)', 'both')
  .option('--use-mock', 'Use mock LLM instead of real API', false)
  .option('--api-key <key>', 'API key for LLM service')
  .option('--chunk-size <size>', 'Chunk size for large documents', '10000')
  .option('--verbose', 'Verbose output', false)
  .action(async (file: string, options: any) => {
    const spinner = ora('Initializing narrative extraction...').start();
    
    try {
      // Validate input file
      if (!fs.existsSync(file)) {
        throw new Error(`File not found: ${file}`);
      }
      
      const content = fs.readFileSync(file, 'utf-8');
      const fileSize = content.length;
      
      if (options.verbose) {
        spinner.info(`Processing ${chalk.blue(path.basename(file))} (${chalk.yellow(fileSize.toLocaleString())} characters)`);
      }
      
      // Initialize LLM adapter
      const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
      const useMock = options.useMock || !apiKey;
      
      if (useMock && !options.useMock) {
        spinner.warn(chalk.yellow('No API key found, using mock LLM'));
      }
      
      const adapter = new UnifiedLLMAdapter(apiKey, useMock);
      const pipeline = new NarrativePipeline(adapter);
      
      // Check if we need to chunk
      const chunkSize = parseInt(options.chunkSize);
      const needsChunking = fileSize > chunkSize;
      
      if (needsChunking && options.verbose) {
        const chunks = Math.ceil(fileSize / chunkSize);
        spinner.info(`Document will be processed in ${chalk.yellow(chunks)} chunks`);
      }
      
      // Extract narrative
      spinner.text = 'Extracting narrative structure...';
      const startTime = Date.now();
      
      let narrative;
      if (needsChunking) {
        narrative = await extractInChunks(content, pipeline, chunkSize, spinner, options.verbose);
      } else {
        narrative = await pipeline.extractNarrative(content);
      }
      
      const extractionTime = Date.now() - startTime;
      spinner.succeed(chalk.green(`Narrative extracted in ${(extractionTime / 1000).toFixed(2)}s`));
      
      // Build temporal graph
      spinner.start('Building temporal graph...');
      const graphBuilder = new TemporalGraphBuilder();
      const graph = pipeline.buildTemporalGraph(narrative);
      spinner.succeed(chalk.green('Temporal graph built'));
      
      // Create output directory
      const outputDir = path.resolve(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Save outputs
      if (options.format === 'json' || options.format === 'both') {
        spinner.start('Saving JSON output...');
        
        // Save narrative structure
        fs.writeFileSync(
          path.join(outputDir, 'narrative.json'),
          JSON.stringify(narrative, null, 2)
        );
        
        // Save graph structure
        fs.writeFileSync(
          path.join(outputDir, 'graph.json'),
          JSON.stringify(graph, null, 2)
        );
        
        spinner.succeed(chalk.green('JSON files saved'));
      }
      
      if (options.format === 'html' || options.format === 'both') {
        spinner.start('Generating HTML visualization...');
        
        const html = await generateVisualizationHTML({
          narrative,
          graph,
          metadata: {
            sourceFile: path.basename(file),
            extractionDate: new Date().toISOString(),
            extractionTime: extractionTime,
            usedMockLLM: useMock,
            characterCount: fileSize,
            chunkCount: needsChunking ? Math.ceil(fileSize / chunkSize) : 1
          }
        });
        
        const htmlPath = path.join(outputDir, 'narrative-visualization.html');
        fs.writeFileSync(htmlPath, html);
        
        spinner.succeed(chalk.green(`HTML visualization saved to ${chalk.blue(htmlPath)}`));
      }
      
      // Print summary
      console.log(chalk.bold('\n📊 Extraction Summary:'));
      console.log(`  • Characters: ${chalk.cyan(narrative.entities.length)}`);
      console.log(`  • Scenes: ${chalk.cyan(narrative.scenes.length)}`);
      console.log(`  • Relationships: ${chalk.cyan(narrative.relationships.length)}`);
      console.log(`  • State Changes: ${chalk.cyan(narrative.stateChanges.length)}`);
      console.log(`  • Timeline Events: ${chalk.cyan(narrative.chronology.length)}`);
      
    } catch (error) {
      spinner.fail(chalk.red('Extraction failed'));
      console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

program
  .command('serve <dir>')
  .description('Start a local server to view narrative visualizations')
  .option('-p, --port <port>', 'Port to serve on', '8080')
  .action(async (dir: string, options: any) => {
    try {
      const express = require('express');
      const app = express();
      
      app.use(express.static(path.resolve(dir)));
      
      const port = parseInt(options.port);
      app.listen(port, () => {
        console.log(chalk.green(`\n🌐 Narrative visualization server running at ${chalk.blue(`http://localhost:${port}`)}`));
        console.log(chalk.gray('Press Ctrl+C to stop\n'));
      });
    } catch (error) {
      console.error(chalk.red('Failed to start server:'), error instanceof Error ? error.message : String(error));
      console.log(chalk.yellow('\nTip: Install express with: npm install express'));
      process.exit(1);
    }
  });

program
  .command('analyze <file>')
  .description('Quick analysis of a narrative file without full extraction')
  .action(async (file: string) => {
    const spinner = ora('Analyzing narrative...').start();
    
    try {
      const content = fs.readFileSync(file, 'utf-8');
      
      // Basic statistics
      const stats = {
        characters: content.length,
        words: content.split(/\s+/).length,
        paragraphs: content.split(/\n\n+/).length,
        sentences: content.split(/[.!?]+/).length,
        
        // Pattern-based detection
        likelyCharacters: Array.from(new Set(
          content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []
        )).filter((name: any) => 
          content.split(name).length > 2 && // Mentioned more than once
          !['The', 'This', 'That', 'These', 'Those', 'There'].includes(name.split(' ')[0])
        ),
        
        dialogueLines: (content.match(/["'].*?["']/g) || []).length,
        timeMarkers: (content.match(/\b(morning|afternoon|evening|night|day|week|month|year|yesterday|tomorrow|today)\b/gi) || []).length,
        locationMarkers: (content.match(/\b(at|in|on|near|beside|behind|above|below)\s+(?:the\s+)?[A-Z][a-z]+/g) || []).length
      };
      
      spinner.succeed(chalk.green('Analysis complete'));
      
      console.log(chalk.bold('\n📈 Narrative Analysis:'));
      console.log(`  • Size: ${chalk.cyan(stats.characters.toLocaleString())} characters, ${chalk.cyan(stats.words.toLocaleString())} words`);
      console.log(`  • Structure: ${chalk.cyan(stats.paragraphs)} paragraphs, ${chalk.cyan(stats.sentences)} sentences`);
      console.log(`  • Dialogue: ${chalk.cyan(stats.dialogueLines)} lines detected`);
      console.log(`  • Temporal markers: ${chalk.cyan(stats.timeMarkers)}`);
      console.log(`  • Location markers: ${chalk.cyan(stats.locationMarkers)}`);
      console.log(`  • Likely characters: ${chalk.cyan(stats.likelyCharacters.length)}`);
      
      if (stats.likelyCharacters.length > 0 && stats.likelyCharacters.length <= 10) {
        console.log(`    ${stats.likelyCharacters.map(c => chalk.yellow(c)).join(', ')}`);
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Analysis failed'));
      console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Helper function for chunked extraction
async function extractInChunks(
  content: string, 
  pipeline: any, 
  chunkSize: number,
  spinner: any,
  verbose: boolean
): Promise<any> {
  const chunks = [];
  for (let i = 0; i < content.length; i += chunkSize * 0.8) { // 20% overlap
    chunks.push(content.slice(i, i + chunkSize));
  }
  
  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    if (verbose) {
      spinner.text = `Processing chunk ${i + 1}/${chunks.length}...`;
    }
    const result = await pipeline.extractNarrative(chunks[i]);
    results.push(result);
  }
  
  // Merge results
  spinner.text = 'Merging chunk results...';
  return mergeChunkResults(results);
}

function mergeChunkResults(results: any[]): any {
  const merged = {
    entities: [] as any[],
    scenes: [] as any[],
    relationships: [] as any[],
    stateChanges: [] as any[],
    chronology: [] as any[]
  };
  
  const entityMap = new Map();
  const relationshipSet = new Set();
  
  let sceneOffset = 0;
  
  for (const result of results) {
    // Merge entities (deduplicate by name)
    for (const entity of result.entities) {
      const key = entity.name.toLowerCase();
      if (!entityMap.has(key)) {
        entityMap.set(key, entity);
      }
    }
    
    // Merge scenes with offset
    for (const scene of result.scenes) {
      merged.scenes.push({
        ...scene,
        sequence: scene.sequence + sceneOffset
      });
    }
    sceneOffset += result.scenes.length;
    
    // Merge relationships (deduplicate)
    for (const rel of result.relationships) {
      const key = `${rel.source}-${rel.type}-${rel.target}`;
      if (!relationshipSet.has(key)) {
        relationshipSet.add(key);
        merged.relationships.push(rel);
      }
    }
    
    // Merge state changes
    merged.stateChanges.push(...result.stateChanges);
    
    // Merge chronology
    merged.chronology.push(...result.chronology);
  }
  
  merged.entities = Array.from(entityMap.values());
  
  // Re-sequence chronology
  merged.chronology = merged.chronology
    .sort((a, b) => a.sequence - b.sequence)
    .map((event, i) => ({ ...event, sequence: i }));
  
  return merged;
}

program.parse();

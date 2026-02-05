#!/usr/bin/env bun

import { Command } from 'commander';
import { NarrativePipeline } from './src/pipeline';
import { UnifiedLLMAdapter } from './src/llm/adapter';
import { generateVisualizationHTML } from './src/visualization/html-generator';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';

// Load .env
const envPath = path.join(import.meta.dir, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

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
      
      // Extract narrative
      spinner.text = 'Extracting narrative structure...';
      const startTime = Date.now();
      const narrative = await pipeline.extractNarrative(content);
      const extractionTime = Date.now() - startTime;
      
      spinner.succeed(chalk.green(`Narrative extracted in ${(extractionTime / 1000).toFixed(2)}s`));
      
      // Build temporal graph
      spinner.start('Building temporal graph...');
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
        
        fs.writeFileSync(
          path.join(outputDir, 'narrative.json'),
          JSON.stringify(narrative, null, 2)
        );
        
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
            characterCount: fileSize
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
  .action((dir: string, options: any) => {
    const port = parseInt(options.port);
    
    console.log(chalk.green(`\n🌐 Starting server...`));
    
    Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        let filePath = path.join(dir, url.pathname);
        
        if (url.pathname === '/') {
          filePath = path.join(dir, 'narrative-visualization.html');
        }
        
        try {
          const file = Bun.file(filePath);
          return new Response(file);
        } catch {
          return new Response('File not found', { status: 404 });
        }
      },
    });
    
    console.log(chalk.green(`✅ Server running at ${chalk.blue(`http://localhost:${port}`)}`));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));
  });

program.parse();
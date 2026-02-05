#!/usr/bin/env npx ts-node

import { NarrativePipeline } from './src/pipeline';
import { UnifiedLLMAdapter } from './src/llm/adapter';
import { generateVisualizationHTML } from './src/visualization/html-generator';
import * as fs from 'fs';
import * as path from 'path';
import { program } from 'commander';

program
  .name('narrative-extract')
  .description('Extract narrative structure from text files')
  .version('0.1.0')
  .argument('<file>', 'Text file to extract narrative from')
  .option('-o, --output <dir>', 'Output directory', './narrative-output')
  .option('--use-mock', 'Use mock LLM (no API key required)', false)
  .option('--html', 'Generate HTML visualization', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (file: string, options: any) => {
    try {
      // Check file exists
      if (!fs.existsSync(file)) {
        console.error(`❌ Error: File not found: ${file}`);
        process.exit(1);
      }

      // Read file
      const content = fs.readFileSync(file, 'utf-8');
      console.log(`\n📖 Extracting narrative from: ${file}`);
      console.log(`📄 File size: ${content.length.toLocaleString()} characters`);

      // Create adapter
      const apiKey = process.env.GEMINI_API_KEY;
      const useMock = options.useMock || !apiKey;
      
      if (useMock) {
        console.log('⚠️  Using mock LLM');
      } else {
        console.log('✅ Using Gemini API');
      }

      const adapter = new UnifiedLLMAdapter(apiKey, useMock);
      const pipeline = new NarrativePipeline(adapter);

      // Extract narrative
      console.log('\n🔄 Extracting narrative structure...');
      const startTime = Date.now();
      const narrative = await pipeline.extractNarrative(content);
      const extractionTime = Date.now() - startTime;

      console.log(`✅ Extraction complete in ${(extractionTime / 1000).toFixed(2)}s`);

      // Create output directory
      if (!fs.existsSync(options.output)) {
        fs.mkdirSync(options.output, { recursive: true });
      }

      // Save JSON
      const jsonPath = path.join(options.output, 'narrative.json');
      fs.writeFileSync(jsonPath, JSON.stringify(narrative, null, 2));
      console.log(`\n💾 Narrative saved to: ${jsonPath}`);

      // Build temporal graph
      const graph = pipeline.buildTemporalGraph(narrative);
      const graphPath = path.join(options.output, 'graph.json');
      fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
      console.log(`💾 Graph saved to: ${graphPath}`);

      // Generate HTML if requested
      if (options.html) {
        const html = await generateVisualizationHTML({
          narrative,
          graph,
          metadata: {
            sourceFile: path.basename(file),
            extractionDate: new Date().toISOString(),
            extractionTime: extractionTime,
            usedMockLLM: useMock,
            characterCount: content.length
          }
        });
        
        const htmlPath = path.join(options.output, 'visualization.html');
        fs.writeFileSync(htmlPath, html);
        console.log(`🌐 Visualization saved to: ${htmlPath}`);
      }

      // Print summary
      console.log('\n📊 Extraction Summary:');
      console.log(`  • Characters: ${narrative.entities.length}`);
      console.log(`  • Scenes: ${narrative.scenes.length}`);
      console.log(`  • Relationships: ${narrative.relationships.length}`);
      console.log(`  • State Changes: ${narrative.stateChanges.length}`);
      console.log(`  • Timeline Events: ${narrative.chronology.events.length}`);

      if (options.verbose) {
        console.log('\n🎭 Characters:');
        narrative.entities.forEach(char => {
          console.log(`  - ${char.name}: ${char.description || 'No description'}`);
        });
      }

      console.log('\n✅ Done!');

    } catch (error) {
      console.error('\n❌ Error:', error);
      process.exit(1);
    }
  });

program.parse();
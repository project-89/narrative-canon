#!/usr/bin/env ts-node

import { NarrativePipeline } from './src/pipeline';
import { UnifiedLLMAdapter } from './src/llm/adapter';
import { generateVisualizationHTML } from './src/visualization/html-generator';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

async function extractNarrative(inputFile: string, outputDir: string = './narrative-output') {
  console.log(`\n📖 Extracting narrative from: ${inputFile}`);
  
  try {
    // Read input file
    const content = fs.readFileSync(inputFile, 'utf-8');
    console.log(`📄 File size: ${content.length.toLocaleString()} characters`);
    
    // Initialize adapter
    const apiKey = process.env.GEMINI_API_KEY;
    const useMock = !apiKey;
    
    if (useMock) {
      console.log('⚠️  No API key found, using mock LLM');
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
    
    // Build temporal graph
    console.log('🔄 Building temporal graph...');
    const graph = pipeline.buildTemporalGraph(narrative);
    console.log('✅ Graph built');
    
    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save JSON files
    console.log('\n💾 Saving outputs...');
    fs.writeFileSync(
      path.join(outputDir, 'narrative.json'),
      JSON.stringify(narrative, null, 2)
    );
    fs.writeFileSync(
      path.join(outputDir, 'graph.json'),
      JSON.stringify(graph, null, 2)
    );
    
    // Generate HTML
    const html = await generateVisualizationHTML({
      narrative,
      graph,
      metadata: {
        sourceFile: path.basename(inputFile),
        extractionDate: new Date().toISOString(),
        extractionTime: extractionTime,
        usedMockLLM: useMock,
        characterCount: content.length
      }
    });
    
    const htmlPath = path.join(outputDir, 'narrative-visualization.html');
    fs.writeFileSync(htmlPath, html);
    
    // Print summary
    console.log('\n📊 Extraction Summary:');
    console.log(`  • Characters: ${narrative.entities.length}`);
    console.log(`  • Scenes: ${narrative.scenes.length}`);
    console.log(`  • Relationships: ${narrative.relationships.length}`);
    console.log(`  • State Changes: ${narrative.stateChanges.length}`);
    console.log(`  • Timeline Events: ${narrative.chronology.length}`);
    
    console.log(`\n✅ Files saved to: ${outputDir}`);
    console.log(`🌐 Open ${htmlPath} in a browser to view the visualization\n`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: ts-node run-extraction.ts <input-file> [output-dir]');
  console.log('Example: ts-node run-extraction.ts test-narrative.txt ./output');
  process.exit(1);
}

const inputFile = args[0];
const outputDir = args[1] || './narrative-output';

if (!fs.existsSync(inputFile)) {
  console.error(`Error: File not found: ${inputFile}`);
  process.exit(1);
}

// Run extraction
extractNarrative(inputFile, outputDir);
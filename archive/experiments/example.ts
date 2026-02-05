#!/usr/bin/env ts-node

import { NarrativePipeline } from './src/pipeline';
import { UnifiedLLMAdapter } from './src/llm/adapter';
import * as fs from 'fs';
import * as path from 'path';

async function extractNarrative() {
  console.log('🚀 Narrative Extraction Example\n');
  
  try {
    // Read the test narrative
    const testFile = path.join(__dirname, 'test-narrative.txt');
    const content = fs.readFileSync(testFile, 'utf-8');
    console.log(`📖 Loaded narrative: ${content.length} characters`);
    console.log(`📄 Title: "The Glitch in Neo-Tokyo"\n`);
    
    // Create a mock LLM adapter (no API key needed)
    const adapter = new UnifiedLLMAdapter(undefined, true);
    const pipeline = new NarrativePipeline(adapter);
    
    // Extract narrative structure
    console.log('🔄 Extracting narrative structure...');
    const startTime = Date.now();
    const narrative = await pipeline.extractNarrative(content);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Extraction complete in ${(duration / 1000).toFixed(2)}s!\n`);
    
    // Display extracted information
    console.log('📊 Extraction Summary:');
    console.log(`  • Characters: ${narrative.entities.length}`);
    console.log(`  • Scenes: ${narrative.scenes.length}`);
    console.log(`  • Relationships: ${narrative.relationships.length}`);
    console.log(`  • State Changes: ${narrative.stateChanges.length}`);
    console.log(`  • Timeline Events: ${narrative.chronology.events.length}`);
    
    // Show characters
    console.log('\n🎭 Main Characters:');
    narrative.entities.forEach(char => {
      console.log(`  - ${char.name}: ${char.description || 'No description'}`);
    });
    
    // Show scenes
    console.log('\n🎬 Scene Breakdown:');
    narrative.scenes.forEach(scene => {
      console.log(`  ${scene.sequence}. ${scene.description}`);
      if (scene.location) console.log(`     📍 Location: ${scene.location}`);
      console.log(`     👥 Characters: ${scene.characters.join(', ')}`);
    });
    
    // Show relationships
    if (narrative.relationships.length > 0) {
      console.log('\n🔗 Character Relationships:');
      narrative.relationships.forEach(rel => {
        console.log(`  - ${rel.source} → ${rel.target} (${rel.type})`);
        if (rel.description) console.log(`    ${rel.description}`);
      });
    }
    
    // Save to output file
    const outputDir = path.join(__dirname, 'example-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, 'narrative-structure.json');
    fs.writeFileSync(outputFile, JSON.stringify(narrative, null, 2));
    console.log(`\n💾 Full results saved to: ${outputFile}`);
    
    // Build temporal graph
    console.log('\n🕸️ Building temporal graph...');
    const graph = pipeline.buildTemporalGraph(narrative);
    console.log('✅ Graph constructed');
    
    const graphFile = path.join(outputDir, 'temporal-graph.json');
    fs.writeFileSync(graphFile, JSON.stringify(graph, null, 2));
    console.log(`💾 Graph saved to: ${graphFile}`);
    
    console.log('\n🎉 Example complete! Check the example-output directory for full results.');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

// Run the example
extractNarrative();
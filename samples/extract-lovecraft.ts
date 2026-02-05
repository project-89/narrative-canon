#!/usr/bin/env ts-node

import { NarrativePipeline } from '../src/pipeline';
import { UnifiedLLMAdapter } from '../src/llm/adapter';
import { generateVisualizationHTML } from '../src/visualization/html-generator';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function extractLovecraftNarrative() {
  console.log('🦑 Lovecraft Narrative Extraction Example\n');
  
  try {
    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ Error: GEMINI_API_KEY not found in environment variables');
      console.log('\nTo use the Gemini API:');
      console.log('1. Get an API key from: https://makersuite.google.com/app/apikey');
      console.log('2. Create a .env file in the narrative-canon directory');
      console.log('3. Add: GEMINI_API_KEY=your-key-here\n');
      console.log('For now, using mock LLM...\n');
    }
    
    // Read the Lovecraft story
    const storyFile = path.join(__dirname, 'lovecraft-story.txt');
    const content = fs.readFileSync(storyFile, 'utf-8');
    
    // Check if placeholder text
    if (content.includes('[Paste your Lovecraft story here]')) {
      console.error('❌ Please paste a Lovecraft story into samples/lovecraft-story.txt');
      console.log('\nSuggested stories:');
      console.log('- "The Call of Cthulhu" (medium length, classic)');
      console.log('- "The Colour Out of Space" (good for location/state changes)');
      console.log('- "The Shadow Over Innsmouth" (great character interactions)');
      console.log('- "Dagon" (very short, good for testing)');
      process.exit(1);
    }
    
    console.log(`📖 Loaded story: ${content.length.toLocaleString()} characters`);
    console.log(`📜 First line: "${content.split('\n')[0].substring(0, 60)}..."\n`);
    
    // Create LLM adapter
    const useMock = !apiKey;
    const adapter = new UnifiedLLMAdapter(apiKey, useMock);
    const pipeline = new NarrativePipeline(adapter);
    
    console.log(`🔮 Using ${useMock ? 'Mock' : 'Gemini'} LLM for extraction\n`);
    
    // Extract narrative structure
    console.log('🔄 Extracting narrative structure...');
    console.log('   (This may take 30-60 seconds with a real LLM)\n');
    
    const startTime = Date.now();
    const narrative = await pipeline.extractNarrative(content);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Extraction complete in ${(duration / 1000).toFixed(1)}s!\n`);
    
    // Display results
    console.log('📊 Extraction Summary:');
    console.log(`  • Characters: ${narrative.entities.length}`);
    console.log(`  • Scenes: ${narrative.scenes.length}`);
    console.log(`  • Relationships: ${narrative.relationships.length}`);
    console.log(`  • State Changes: ${narrative.stateChanges.length}`);
    console.log(`  • Timeline Events: ${narrative.chronology.events.length}`);
    
    // Show main characters
    console.log('\n🎭 Main Characters:');
    narrative.entities.slice(0, 5).forEach(char => {
      console.log(`  - ${char.name}: ${char.description || 'No description'}`);
    });
    
    // Show key scenes
    console.log('\n🎬 Key Scenes:');
    narrative.scenes.slice(0, 5).forEach(scene => {
      console.log(`  ${scene.sequence}. ${scene.description.substring(0, 80)}...`);
      if (scene.location) console.log(`     📍 ${scene.location}`);
    });
    
    // Show relationships
    if (narrative.relationships.length > 0) {
      console.log('\n🔗 Character Relationships:');
      narrative.relationships.slice(0, 5).forEach(rel => {
        console.log(`  - ${rel.source} → ${rel.target} (${rel.type})`);
      });
    }
    
    // Build temporal graph
    console.log('\n🕸️ Building temporal graph...');
    const graph = pipeline.buildTemporalGraph(narrative);
    console.log('✅ Graph constructed');
    
    // Save outputs
    const outputDir = path.join(__dirname, 'lovecraft-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save JSON
    fs.writeFileSync(
      path.join(outputDir, 'narrative.json'),
      JSON.stringify(narrative, null, 2)
    );
    fs.writeFileSync(
      path.join(outputDir, 'graph.json'),
      JSON.stringify(graph, null, 2)
    );
    
    // Generate HTML visualization
    console.log('🎨 Generating visualization...');
    const html = await generateVisualizationHTML({
      narrative,
      graph,
      metadata: {
        sourceFile: 'lovecraft-story.txt',
        extractionDate: new Date().toISOString(),
        extractionTime: duration,
        usedMockLLM: useMock,
        characterCount: content.length,
        chunkCount: Math.ceil(content.length / 10000)
      }
    });
    
    const htmlPath = path.join(outputDir, 'lovecraft-visualization.html');
    fs.writeFileSync(htmlPath, html);
    
    console.log('\n💾 Files saved:');
    console.log(`  • ${path.join(outputDir, 'narrative.json')}`);
    console.log(`  • ${path.join(outputDir, 'graph.json')}`);
    console.log(`  • ${htmlPath}`);
    
    console.log('\n🌐 Opening visualization in browser...');
    
    // Open in browser
    const { exec } = require('child_process');
    exec(`open "${htmlPath}"`);
    
    console.log('\n🎉 Complete! Check your browser for the interactive visualization.');
    
    if (useMock) {
      console.log('\n💡 Tip: Add a Gemini API key to see much richer extraction results!');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

// Run the extraction
extractLovecraftNarrative();
#!/usr/bin/env node

/**
 * Standalone Timeline Warfare Visualization Generator
 * 
 * Generates interactive browser visualizations from Timeline Warfare narrative data.
 * Can be run independently to create visualizations without playing the game.
 */

// Import the visualizer through the main narrative library
const narrativeCanon = require('./dist/narrative-canon.cjs.js');

// Check if we can access the visualizer
async function createVisualizer() {
  try {
    // Try to import the visualizer from the built modules
    const { TimelineWarfareVisualizer } = await import('./src/games/timeline-warfare-visualizer.ts');
    return TimelineWarfareVisualizer;
  } catch (error) {
    // Fallback: create our own simple visualizer
    console.log('⚠️  Using simplified visualization (full version requires TypeScript compilation)');
    
    const { NarrativePipeline } = narrativeCanon;
    const { GeminiAdapter, MockLLM } = narrativeCanon;
    
    class SimpleVisualizer {
      constructor() {
        const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
        const adapter = apiKey ? new GeminiAdapter(apiKey) : new MockLLM();
        this.pipeline = new NarrativePipeline(adapter);
      }
      
      async visualizeProject89Lore() {
        const lore = `The year is 2089. Agent Chen operates against Oneirocom Corporation in Neo-Tokyo.`;
        const structure = await this.pipeline.extractNarrative(lore);
        
        // Simple HTML output
        const html = `
<!DOCTYPE html>
<html><head><title>Project 89 Narrative</title></head>
<body>
<h1>Project 89 Narrative Analysis</h1>
<h2>Entities Found:</h2>
<ul>
${structure.entities.map(e => `<li><strong>${e.name}</strong> (${e.type}): ${e.description || 'No description'}</li>`).join('')}
</ul>
<h2>Scenes:</h2>
<ul>
${structure.scenes.map(s => `<li>Scene ${s.sequence}: ${s.description || 'No description'}</li>`).join('')}
</ul>
</body></html>`;
        
        const fs = require('fs');
        const path = require('path');
        
        if (!fs.existsSync('output')) {
          fs.mkdirSync('output');
        }
        
        const outputPath = path.join('output', 'simple_visualization.html');
        fs.writeFileSync(outputPath, html);
        
        return [outputPath];
      }
    }
    
    return SimpleVisualizer;
  }
}

async function main() {
  console.log('🚀 Timeline Warfare Visualization Generator');
  console.log('===========================================\n');
  
  try {
    const VisualizerClass = await createVisualizer();
    const visualizer = new VisualizerClass();
    
    console.log('📊 Generating Project 89 Timeline Warfare visualizations...');
    const outputs = await visualizer.visualizeProject89Lore();
    
    console.log('\n🎉 Visualization generation complete!');
    console.log('\nGenerated files:');
    outputs.forEach(file => {
      console.log(`  📁 ${file}`);
    });
    
    console.log('\n🌐 OPEN IN BROWSER:');
    console.log(`  📊 Standard Visualization:`);
    console.log(`     file://${process.cwd()}/${outputs[0]}`);
    console.log(`  🎮 Interactive Explorer:`);
    console.log(`     file://${process.cwd()}/${outputs[1]}`);
    console.log(`  📋 JSON Data:`);
    console.log(`     ${outputs[2]}`);
    
    console.log('\n💡 Features in the browser visualizations:');
    console.log('  🎯 Entity classification (organizations, characters, tech, locations)');
    console.log('  🕸️  Interactive relationship network');
    console.log('  📈 Timeline view with scene progression');
    console.log('  🔍 Detailed entity information panels');
    console.log('  📊 Statistical overview and metrics');
    
  } catch (error) {
    console.error('\n❌ Error generating visualizations:', error.message);
    
    if (error.message.includes('Cannot find module')) {
      console.log('\n💡 Make sure to build the project first:');
      console.log('   npm run build');
    }
    
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
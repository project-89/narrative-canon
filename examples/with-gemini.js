/**
 * Example using Gemini API for narrative extraction
 */

const { NarrativeCanon } = require('../dist/narrative-canon.cjs.js');
const fs = require('fs');
const path = require('path');

async function main() {
  // Check for API key
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.error('❌ Error: GOOGLE_AI_API_KEY environment variable not set');
    console.log('Please set your Gemini API key:');
    console.log('  export GOOGLE_AI_API_KEY=your-api-key-here');
    process.exit(1);
  }

  // Sample story (you can also load from file)
  const story = fs.readFileSync(
    path.join(__dirname, 'samples', 'alice-adventure.txt'), 
    'utf-8'
  );

  // Create narrative canon with Gemini
  const canon = new NarrativeCanon({
    llm: 'gemini',
    apiKey: process.env.GOOGLE_AI_API_KEY,
    debug: true
  });

  console.log('🚀 Using Gemini API for extraction...\n');
  
  try {
    // Extract narrative
    const narrative = await canon.extract(story, 'alice-gemini');
    
    // Get statistics
    const stats = canon.getStats(narrative);
    
    console.log('\n📊 Extraction Results:');
    console.log(`- Characters: ${stats.characters}`);
    console.log(`- Scenes: ${stats.scenes}`);
    console.log(`- Relationships: ${stats.relationships}`);
    console.log(`- State Changes: ${stats.stateChanges}`);
    
    // Save to JSON
    const outputPath = path.join(__dirname, 'output', 'alice-gemini.json');
    fs.writeFileSync(outputPath, JSON.stringify(narrative, null, 2));
    console.log(`\n💾 Saved extraction to: ${outputPath}`);
    
    // Generate visualization
    const htmlPath = path.join(__dirname, 'output', 'alice-gemini.html');
    await canon.visualize(narrative, htmlPath);
    console.log(`📊 Visualization saved to: ${htmlPath}`);
    
    // Show some interesting relationships
    console.log('\n🔍 Interesting Relationships:');
    narrative.relationships
      .filter(rel => rel.confidence && rel.confidence > 0.8)
      .slice(0, 5)
      .forEach(rel => {
        console.log(`  - ${rel.source} → ${rel.target} (${rel.type})`);
        console.log(`    "${rel.description}"`);
      });
      
  } catch (error) {
    console.error('❌ Error during extraction:', error.message);
    if (error.message.includes('API key')) {
      console.log('\nMake sure your Gemini API key is valid.');
    }
  }
}

// Run the example
main().catch(console.error);
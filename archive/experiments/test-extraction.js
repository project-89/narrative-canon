const { NarrativePipeline } = require('./dist/pipeline.js');
const { UnifiedLLMAdapter } = require('./dist/llm/adapter.js');
const fs = require('fs');
const path = require('path');

async function test() {
  console.log('Testing narrative extraction...\n');
  
  try {
    // Read test narrative
    const content = fs.readFileSync('test-narrative.txt', 'utf-8');
    console.log(`📖 Loaded narrative: ${content.length} characters`);
    
    // Create mock adapter
    const adapter = new UnifiedLLMAdapter(null, true);
    const pipeline = new NarrativePipeline(adapter);
    
    // Extract narrative
    console.log('\n🔄 Extracting narrative structure...');
    const narrative = await pipeline.extractNarrative(content);
    
    // Display results
    console.log('\n✅ Extraction complete!');
    console.log('\n📊 Summary:');
    console.log(`  • Characters: ${narrative.entities.length}`);
    console.log(`  • Scenes: ${narrative.scenes.length}`);
    console.log(`  • Relationships: ${narrative.relationships.length}`);
    console.log(`  • State Changes: ${narrative.stateChanges.length}`);
    console.log(`  • Timeline Events: ${narrative.chronology.length}`);
    
    // Save output
    const outputDir = './test-output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'narrative.json'),
      JSON.stringify(narrative, null, 2)
    );
    
    console.log(`\n💾 Results saved to ${outputDir}/narrative.json`);
    
    // Show some extracted characters
    console.log('\n🎭 Extracted Characters:');
    narrative.entities.slice(0, 5).forEach(char => {
      console.log(`  - ${char.name} (${char.type})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

test();
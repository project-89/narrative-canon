import { NarrativePipeline } from './src/pipeline';
import { UnifiedLLMAdapter } from './src/llm/adapter';
import * as fs from 'fs';

async function runTest() {
  console.log('🚀 Starting narrative extraction test...\n');
  
  try {
    // Read test narrative
    const content = fs.readFileSync('test-narrative.txt', 'utf-8');
    console.log(`📖 Loaded narrative: ${content.length} characters`);
    
    // Create mock adapter
    const adapter = new UnifiedLLMAdapter(undefined, true);
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
    
    // Show extracted characters
    console.log('\n🎭 Extracted Characters:');
    narrative.entities.forEach(char => {
      console.log(`  - ${char.name} (${char.type}): ${char.description || 'No description'}`);
    });
    
    // Show scenes
    console.log('\n🎬 Extracted Scenes:');
    narrative.scenes.forEach(scene => {
      console.log(`  ${scene.sequence}. ${scene.summary}`);
      console.log(`     Location: ${scene.location || 'Unknown'}`);
      console.log(`     Characters: ${scene.characters.join(', ')}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

runTest();
#!/usr/bin/env node

import { NarrativeCanon } from '../dist/narrative-canon.esm.js';

async function testRealLLM() {
  console.log('🧠 Real LLM Integration Test\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY');
    process.exit(1);
  }
  
  // Test stories of increasing complexity
  const tests = [
    {
      name: 'Minimal',
      story: 'Alice met Bob.',
      expectedEntities: 2
    },
    {
      name: 'Simple',
      story: 'Alice met Bob in the park. They talked about dreams.',
      expectedEntities: 3
    },
    {
      name: 'Medium',
      story: 'Alice met Bob in Central Park. They talked about their dreams and decided to start a business together. Bob revealed he was from the future.',
      expectedEntities: 4
    }
  ];
  
  for (const test of tests) {
    console.log(`🧪 Testing ${test.name} story...`);
    console.log(`📖 Story: "${test.story}"`);
    
    try {
      const canon = new NarrativeCanon({
        llm: 'gemini',
        apiKey: apiKey,
        debug: true
      });
      
      console.time(`⏱️  Extraction time`);
      const narrative = await canon.extract(test.story);
      console.timeEnd(`⏱️  Extraction time`);
      
      // Validate results
      const stats = canon.getStats(narrative);
      console.log(`\n📊 Results:`);
      console.log(`   • Entities: ${stats.characters + stats.locations + stats.organizations}`);
      console.log(`   • Characters: ${stats.characters}`);
      console.log(`   • Locations: ${stats.locations}`);
      console.log(`   • Scenes: ${stats.scenes}`);
      console.log(`   • Relationships: ${stats.relationships}`);
      
      // Show extracted details
      if (narrative.entities.length > 0) {
        console.log(`\n🎭 Extracted Entities:`);
        narrative.entities.forEach(e => {
          console.log(`   • ${e.name} (${e.type}): ${e.description || 'No description'}`);
        });
      }
      
      if (narrative.scenes.length > 0) {
        console.log(`\n🎬 Scenes:`);
        narrative.scenes.forEach((scene, idx) => {
          console.log(`   ${idx + 1}. ${scene.title || scene.description}`);
        });
      }
      
      // Check if results meet expectations
      const totalEntities = stats.characters + stats.locations + stats.organizations;
      if (totalEntities >= test.expectedEntities) {
        console.log(`\n✅ ${test.name} test PASSED\n`);
      } else {
        console.log(`\n⚠️  ${test.name} test extracted fewer entities than expected (got ${totalEntities}, expected ${test.expectedEntities})\n`);
      }
      
    } catch (error) {
      console.log(`\n❌ ${test.name} test FAILED: ${error.message}\n`);
      
      // Don't continue with more complex tests if simple ones fail
      break;
    }
    
    // Small delay between tests
    console.log('⏳ Waiting 2 seconds before next test...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('🏁 Real LLM testing complete');
}

testRealLLM().catch(error => {
  console.error('💥 Test failed completely:', error.message);
  process.exit(1);
});
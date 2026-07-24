#!/usr/bin/env node

import { NarrativeCanon } from '../dist/narrative-canon.esm.js';

async function speedTest() {
  console.log('⚡ Gemini Model Speed Test\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY');
    process.exit(1);
  }
  
  const testStory = "Alice met Bob in Central Park. They talked about their dreams and decided to start a business together. Bob revealed he was from the future.";
  
  console.log(`📖 Test Story: "${testStory}"\n`);
  
  // Test 1: Default (Slow but Smart) Models
  console.log('🐌 Testing with DEFAULT models (Gemini 2.5 Pro)...');
  console.log('   • Entity Extraction: gemini-2.5-pro-preview-05-06');
  console.log('   • Scene Detection: gemini-2.5-flash-preview-05-20');
  console.log('   • Relationships: gemini-2.5-pro-preview-05-06');
  console.log('   • State Changes: gemini-2.5-pro-preview-05-06\n');
  
  try {
    const slowCanon = new NarrativeCanon({
      llm: 'gemini',
      apiKey: apiKey,
      debug: false // Reduce noise
    });
    
    console.time('⏱️  Default Models Total Time');
    const slowResult = await slowCanon.extract(testStory);
    console.timeEnd('⏱️  Default Models Total Time');
    
    const slowStats = slowCanon.getStats(slowResult);
    console.log(`📊 Default Results: ${slowStats.characters} characters, ${slowStats.locations} locations, ${slowStats.scenes} scenes, ${slowStats.relationships} relationships\n`);
    
  } catch (error) {
    console.log(`❌ Default models failed: ${error.message}\n`);
  }
  
  // Test 2: Fast Mode (All Flash models)
  console.log('⚡ Testing with FAST MODE (Gemini 2.5 Flash for everything)...');
  console.log('   • All operations: gemini-2.5-flash-preview-05-20\n');
  
  try {
    // Set fast mode environment variable
    process.env.GEMINI_FAST_MODE = 'true';
    
    const fastCanon = new NarrativeCanon({
      llm: 'gemini',
      apiKey: apiKey,
      debug: false
    });
    
    console.time('⏱️  Fast Mode Total Time');
    const fastResult = await fastCanon.extract(testStory);
    console.timeEnd('⏱️  Fast Mode Total Time');
    
    const fastStats = fastCanon.getStats(fastResult);
    console.log(`📊 Fast Results: ${fastStats.characters} characters, ${fastStats.locations} locations, ${fastStats.scenes} scenes, ${fastStats.relationships} relationships\n`);
    
    // Compare quality
    console.log('🔍 Quality Comparison:');
    
    if (fastResult.entities.length > 0) {
      console.log('   Fast Mode Entities:');
      fastResult.entities.slice(0, 3).forEach(e => {
        console.log(`      • ${e.name} (${e.type}): ${e.description?.substring(0, 60)}...`);
      });
    }
    
    // Reset environment
    delete process.env.GEMINI_FAST_MODE;
    
  } catch (error) {
    console.log(`❌ Fast mode failed: ${error.message}\n`);
    delete process.env.GEMINI_FAST_MODE;
  }
  
  console.log('🏁 Speed test complete!');
  console.log('\n💡 Findings:');
  console.log('   • Fast mode uses Gemini 2.5 Flash for all operations');
  console.log('   • Default mode uses Pro for complex tasks, Flash for simple ones');
  console.log('   • Both should extract similar quality data');
  console.log('   • Fast mode should be 2-3x faster');
}

speedTest().catch(error => {
  console.error('💥 Speed test failed:', error.message);
  process.exit(1);
});
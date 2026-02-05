#!/usr/bin/env node

/**
 * GEMINI PRODUCTION SYSTEM VALIDATION
 * 
 * Tests the core Gemini integration without Mock LLM dependencies
 */

const { NarrativeCanon } = require('./dist/narrative-canon.cjs.js');

async function testGeminiProduction() {
  console.log('🔮 GEMINI PRODUCTION SYSTEM VALIDATION');
  console.log('=====================================\n');

  // Check for API key
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.log('❌ No Gemini API key found!');
    console.log('💡 Set GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable');
    console.log('🔗 Get your key at: https://ai.google.dev/');
    process.exit(1);
  }

  console.log('✅ API key detected');
  console.log('🎯 Testing with Project 89 narrative content...\n');

  try {
    // Initialize with Gemini (not Mock)
    const canon = new NarrativeCanon({
      llm: 'gemini',
      apiKey: apiKey,
      debug: true
    });

    // Test with Project 89 content
    const testNarrative = `
    Agent Chen stared at the holographic display in the Neo-Tokyo resistance safe house. 
    The year was 2089, and Oneirocom's timeline convergence protocol was accelerating.
    
    "Marcus, look at this," she called to her partner. Marcus Wong, another Project 89 operative, 
    hurried over with his neural interface flickering.
    
    "The probability threads are converging," Chen explained. "If Oneirocom succeeds with 
    the Neural Interface Mandate next week, we lose our window to deploy the Liberation Seeds."
    
    Suddenly, their quantum communicator crackled to life. "Agents Chen and Wong, this is 
    Seraph. Deploy to Timeline Node 2045-07-15 immediately. The Proxim8 collective has 
    detected a critical branching point."
    `;

    console.log('📖 Extracting Project 89 narrative...');
    const result = await canon.extract(testNarrative);

    console.log('\n✅ EXTRACTION COMPLETE!');
    console.log('========================\n');

    // Analyze results
    const stats = canon.getStats(result);
    console.log('📊 EXTRACTION STATISTICS:');
    console.log(`   Characters: ${stats.characters}`);
    console.log(`   Scenes: ${stats.scenes}`);
    console.log(`   Relationships: ${stats.relationships}`);
    console.log(`   State Changes: ${stats.stateChanges}`);
    console.log(`   Events: ${stats.events}\n`);

    // Show extracted entities
    if (result.entities && result.entities.length > 0) {
      console.log('👥 EXTRACTED ENTITIES:');
      result.entities.forEach(entity => {
        console.log(`   • ${entity.name} (${entity.type}): ${entity.description || 'No description'}`);
      });
      console.log('');
    }

    // Show scenes
    if (result.scenes && result.scenes.length > 0) {
      console.log('🎬 EXTRACTED SCENES:');
      result.scenes.forEach((scene, i) => {
        console.log(`   ${i + 1}. ${scene.title || scene.summary || 'Scene ' + scene.sequence}`);
        console.log(`      Location: ${scene.location || 'Unknown'}`);
        console.log(`      Characters: ${scene.characters.join(', ') || 'None'}`);
      });
      console.log('');
    }

    // Show relationships
    if (result.relationships && result.relationships.length > 0) {
      console.log('💫 EXTRACTED RELATIONSHIPS:');
      result.relationships.forEach(rel => {
        console.log(`   • ${rel.source} --[${rel.type}]--> ${rel.target}`);
        if (rel.description) {
          console.log(`     ${rel.description}`);
        }
      });
      console.log('');
    }

    // Test visualization generation
    console.log('📊 Generating visualization...');
    await canon.visualize(result, 'test-gemini-output.html');
    console.log('✅ Visualization saved to: test-gemini-output.html\n');

    // Success metrics
    const success = (
      stats.characters > 0 && 
      stats.scenes > 0 && 
      result.entities.length > 0
    );

    if (success) {
      console.log('🎉 GEMINI PRODUCTION SYSTEM: FULLY OPERATIONAL');
      console.log('🚀 Ready for Project 89 integration!');
      process.exit(0);
    } else {
      console.log('⚠️ GEMINI PRODUCTION SYSTEM: PARTIAL FUNCTIONALITY');
      console.log('🔧 Some extraction components may need adjustment');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ GEMINI PRODUCTION TEST FAILED:');
    console.error(error.message);
    
    if (error.message.includes('API')) {
      console.log('\n💡 Possible fixes:');
      console.log('   • Check your API key is valid');
      console.log('   • Ensure you have API quota remaining');
      console.log('   • Try again in a few minutes');
    }
    
    process.exit(1);
  }
}

// Run the test
testGeminiProduction().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
#!/usr/bin/env node

/**
 * Stability test for Narrative Canon
 * Tests both Mock LLM and real Gemini API
 */

import { NarrativeCanon, NarrativeGit } from '../dist/narrative-canon.esm.js';

const TEST_STORIES = {
  simple: "Alice met Bob in the park. They became friends.",
  
  medium: `Sarah entered the abandoned mansion carefully. The floorboards creaked under her feet. 
  In the library, she found an ancient book that glowed with mysterious light. 
  As she touched it, the room transformed around her. She was no longer in the mansion, 
  but in a magical realm where books came alive.`,
  
  complex: `The Council of Mages gathered in the Crystal Tower. Archmage Eldrin stood before them, 
  his staff glowing with power. "The prophecy speaks of a chosen one," he declared. 
  Young Kira, hidden in the shadows, knew he spoke of her. She had discovered her powers only 
  last week when she accidentally turned her teacher into a frog. 
  
  Meanwhile, in the Dark Fortress, Lord Malachar sensed a disturbance. "The child has awakened," 
  he told his lieutenant, Captain Darkblade. "Send the Shadow Hunters. She must not reach the Tower."
  
  Kira's protector, a mysterious warrior named Zane, appeared beside her. "We must leave now," 
  he whispered. Together, they slipped out through the secret passage that led to the Underground City.`
};

async function runStabilityTest() {
  console.log('🧪 Narrative Canon Stability Test\n');
  console.log('=' .repeat(50) + '\n');
  
  const results = {
    mockLLM: { passed: 0, failed: 0, errors: [] },
    geminiLLM: { passed: 0, failed: 0, errors: [] }
  };
  
  // Test 1: Mock LLM Mode
  console.log('📋 Test Suite 1: Mock LLM Mode\n');
  await testWithLLM('mock', null, results.mockLLM);
  
  // Test 2: Real Gemini API (if key available)
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    console.log('\n📋 Test Suite 2: Gemini API Mode\n');
    await testWithLLM('gemini', apiKey, results.geminiLLM);
  } else {
    console.log('\n⚠️  Skipping Gemini API tests (no API key found)\n');
  }
  
  // Test 3: Git Operations
  console.log('📋 Test Suite 3: Git Operations\n');
  await testGitOperations(results);
  
  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Test Summary\n');
  
  console.log('Mock LLM Tests:');
  console.log(`   ✅ Passed: ${results.mockLLM.passed}`);
  console.log(`   ❌ Failed: ${results.mockLLM.failed}`);
  
  if (apiKey) {
    console.log('\nGemini API Tests:');
    console.log(`   ✅ Passed: ${results.geminiLLM.passed}`);
    console.log(`   ❌ Failed: ${results.geminiLLM.failed}`);
  }
  
  const totalPassed = results.mockLLM.passed + results.geminiLLM.passed;
  const totalFailed = results.mockLLM.failed + results.geminiLLM.failed;
  
  console.log('\nOverall:');
  console.log(`   Total Tests: ${totalPassed + totalFailed}`);
  console.log(`   Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);
  
  if (results.mockLLM.errors.length > 0 || results.geminiLLM.errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    [...results.mockLLM.errors, ...results.geminiLLM.errors].forEach((err, idx) => {
      console.log(`   ${idx + 1}. ${err}`);
    });
  }
  
  process.exit(totalFailed > 0 ? 1 : 0);
}

async function testWithLLM(llmType, apiKey, results) {
  for (const [name, story] of Object.entries(TEST_STORIES)) {
    try {
      console.log(`🧪 Testing ${name} story...`);
      
      const canon = new NarrativeCanon({
        llm: llmType,
        apiKey: apiKey,
        debug: false
      });
      
      const startTime = Date.now();
      const narrative = await canon.extract(story);
      const duration = Date.now() - startTime;
      
      // Validate results
      const validations = [
        { name: 'Has entities', check: narrative.entities.length > 0 },
        { name: 'Has scenes', check: narrative.scenes.length > 0 },
        { name: 'Has valid structure', check: narrative.chronology && narrative.metadata },
        { name: 'Performance acceptable', check: duration < 30000 } // 30 seconds max
      ];
      
      const failed = validations.filter(v => !v.check);
      
      if (failed.length === 0) {
        console.log(`   ✅ Passed (${(duration / 1000).toFixed(2)}s)`);
        console.log(`      • Entities: ${narrative.entities.length}`);
        console.log(`      • Scenes: ${narrative.scenes.length}`);
        console.log(`      • Relationships: ${narrative.relationships.length}`);
        results.passed++;
      } else {
        console.log(`   ❌ Failed`);
        failed.forEach(f => console.log(`      • ${f.name}: FAILED`));
        results.failed++;
        results.errors.push(`${name} story: ${failed.map(f => f.name).join(', ')}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.failed++;
      results.errors.push(`${name} story: ${error.message}`);
    }
    
    console.log('');
  }
}

async function testGitOperations(results) {
  try {
    console.log('🧪 Testing Git operations...');
    
    const git = new NarrativeGit({
      author: 'test-suite',
      defaultBranch: 'main'
    });
    
    // Test basic operations
    git.add({
      type: 'ADD_ENTITY',
      payload: {
        id: 'test-char-1',
        type: 'character',
        name: 'Test Character'
      }
    });
    
    const commit1 = await git.commit('Add test character');
    
    // Test branching
    await git.branch('test-branch');
    await git.checkout('test-branch');
    
    git.add({
      type: 'UPDATE_ENTITY',
      payload: {
        entityId: 'test-char-1',
        changes: { properties: { status: 'modified' } }
      }
    });
    
    const commit2 = await git.commit('Modify character');
    
    // Test diff
    const diff = git.diff('main', 'test-branch');
    
    // Validations
    const gitValidations = [
      { name: 'Commits created', check: commit1 && commit2 },
      { name: 'Branches work', check: git.branches().length === 2 },
      { name: 'Diff works', check: diff.operations.length > 0 },
      { name: 'History tracked', check: git.log().length === 2 }
    ];
    
    const failed = gitValidations.filter(v => !v.check);
    
    if (failed.length === 0) {
      console.log('   ✅ All Git operations passed');
      results.mockLLM.passed++;
    } else {
      console.log('   ❌ Git operations failed');
      failed.forEach(f => console.log(`      • ${f.name}: FAILED`));
      results.mockLLM.failed++;
    }
    
  } catch (error) {
    console.log(`   ❌ Git operations error: ${error.message}`);
    results.mockLLM.failed++;
    results.mockLLM.errors.push(`Git operations: ${error.message}`);
  }
}

// Run the test
runStabilityTest().catch(console.error);

export { runStabilityTest };
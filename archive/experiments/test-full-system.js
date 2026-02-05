#!/usr/bin/env node

/**
 * Full System Test for Project 89 Narrative Git
 * 
 * Validates all components are working together properly
 */

const { NarrativeGit } = require('./dist/narrative-git');
const fs = require('fs').promises;
const path = require('path');

// Test scenarios
const testScenarios = {
  basicExtraction: {
    name: 'Basic Entity/Relationship Extraction',
    text: `Alexander Morfius founded Oneirocom in 2025. He was a visionary technologist who believed in merging human consciousness with AI. His daughter Aria Chen opposed his vision, leading a resistance movement called Project 89.`,
    validate: (state) => {
      const hasAlexander = Array.from(state.entities.values()).some(e => e.name.includes('Alexander'));
      const hasAria = Array.from(state.entities.values()).some(e => e.name.includes('Aria'));
      const hasRelationship = state.relationships.size > 0;
      return hasAlexander && hasAria && hasRelationship;
    }
  },
  
  sceneDetection: {
    name: 'Scene Boundary Detection',
    texts: [
      `The year is 2025. Oneirocom's towers pierce the skyline.`,
      `Suddenly, alarms blared throughout the facility. The resistance had breached the mainframe.`,
      `Years later, in 2089, the simulation finally cracked. Reality itself began to glitch.`
    ],
    validate: (commits) => {
      // Should create at least 2 scene boundaries
      return commits.length >= 2;
    }
  },
  
  timelineBranching: {
    name: 'Timeline Branching',
    branches: ['dark-timeline', 'optimal-timeline'],
    validate: (branches) => {
      return branches.includes('dark-timeline') && branches.includes('optimal-timeline');
    }
  },
  
  nonLinearCommits: {
    name: 'Non-Linear Timeline Commits',
    events: [
      { text: 'The final battle in 2089', date: new Date('2089-12-21') },
      { text: 'The founding of Oneirocom in 2025', date: new Date('2025-06-15') },
      { text: 'The resistance forms in 2030', date: new Date('2030-03-21') }
    ],
    validate: (timeline) => {
      // Should be ordered by narrative date, not commit order
      const dates = timeline.map(c => c.narrativeDate?.getTime() || 0);
      const sorted = [...dates].sort((a, b) => a - b);
      return JSON.stringify(dates) === JSON.stringify(sorted);
    }
  },
  
  mergeConflicts: {
    name: 'Merge Conflict Detection',
    branch1: {
      text: 'Alexander Morfius died in 2041, merging with the AI.',
      entity: 'Alexander Morfius',
      state: 'dead'
    },
    branch2: {
      text: 'Alexander Morfius lived on, leading Oneirocom into 2050.',
      entity: 'Alexander Morfius', 
      state: 'alive'
    },
    validate: (mergeResult) => {
      return mergeResult.conflicts.length > 0 && 
             mergeResult.conflicts.some(c => c.type === 'entity_state');
    }
  }
};

async function runFullSystemTest() {
  console.log('🧪 PROJECT 89 NARRATIVE GIT - FULL SYSTEM TEST\n');
  console.log('=' .repeat(50) + '\n');
  
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };
  
  // Test 1: Basic Extraction
  console.log('📋 Test 1: ' + testScenarios.basicExtraction.name);
  try {
    const git = new NarrativeGit({
      projectName: 'test-basic',
      llmConfig: {
        provider: 'mock',
        mockResponses: {
          entities: [
            { name: 'Alexander Morfius', type: 'character', attributes: { role: 'founder' } },
            { name: 'Aria Chen', type: 'character', attributes: { role: 'resistance leader' } },
            { name: 'Oneirocom', type: 'organization', attributes: { type: 'corporation' } }
          ],
          relationships: [
            { source: 'Alexander Morfius', target: 'Oneirocom', type: 'founded' },
            { source: 'Aria Chen', target: 'Alexander Morfius', type: 'opposes' }
          ]
        }
      }
    });
    
    await git.init();
    await git.add(testScenarios.basicExtraction.text);
    const state = await git.getCurrentState();
    
    if (testScenarios.basicExtraction.validate(state)) {
      console.log('   ✅ PASSED\n');
      results.passed++;
    } else {
      console.log('   ❌ FAILED: Extraction did not produce expected entities\n');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ ERROR: ' + error.message + '\n');
    results.failed++;
    results.errors.push({ test: 'Basic Extraction', error: error.message });
  }
  
  // Test 2: Scene Detection
  console.log('📋 Test 2: ' + testScenarios.sceneDetection.name);
  try {
    const git = new NarrativeGit({
      projectName: 'test-scenes',
      llmConfig: { provider: 'mock' }
    });
    
    await git.init();
    for (const text of testScenarios.sceneDetection.texts) {
      await git.add(text);
    }
    
    const log = await git.log();
    if (testScenarios.sceneDetection.validate(log)) {
      console.log('   ✅ PASSED\n');
      results.passed++;
    } else {
      console.log('   ❌ FAILED: Scene boundaries not detected properly\n');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ ERROR: ' + error.message + '\n');
    results.failed++;
    results.errors.push({ test: 'Scene Detection', error: error.message });
  }
  
  // Test 3: Timeline Branching
  console.log('📋 Test 3: ' + testScenarios.timelineBranching.name);
  try {
    const git = new NarrativeGit({
      projectName: 'test-branching',
      llmConfig: { provider: 'mock' }
    });
    
    await git.init();
    for (const branchName of testScenarios.timelineBranching.branches) {
      await git.branch(branchName);
    }
    
    const branches = await git.branches();
    if (testScenarios.timelineBranching.validate(branches)) {
      console.log('   ✅ PASSED\n');
      results.passed++;
    } else {
      console.log('   ❌ FAILED: Branches not created properly\n');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ ERROR: ' + error.message + '\n');
    results.failed++;
    results.errors.push({ test: 'Timeline Branching', error: error.message });
  }
  
  // Test 4: Non-Linear Commits
  console.log('📋 Test 4: ' + testScenarios.nonLinearCommits.name);
  try {
    const git = new NarrativeGit({
      projectName: 'test-nonlinear',
      llmConfig: { provider: 'mock' }
    });
    
    await git.init();
    
    // Add events out of chronological order
    for (const event of testScenarios.nonLinearCommits.events) {
      await git.addAtTime(event.text, event.date);
    }
    
    const timeline = git.timeline();
    if (testScenarios.nonLinearCommits.validate(timeline)) {
      console.log('   ✅ PASSED\n');
      results.passed++;
    } else {
      console.log('   ❌ FAILED: Timeline not properly ordered\n');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ ERROR: ' + error.message + '\n');
    results.failed++;
    results.errors.push({ test: 'Non-Linear Commits', error: error.message });
  }
  
  // Test 5: Merge Conflicts
  console.log('📋 Test 5: ' + testScenarios.mergeConflicts.name);
  try {
    const git = new NarrativeGit({
      projectName: 'test-merge',
      llmConfig: {
        provider: 'mock',
        mockResponses: {
          entities: [
            { name: 'Alexander Morfius', type: 'character', attributes: {} }
          ]
        }
      }
    });
    
    await git.init();
    await git.add('Initial state');
    
    // Create conflicting branches
    await git.branch('branch1');
    await git.checkout('branch1');
    await git.add(testScenarios.mergeConflicts.branch1.text);
    
    await git.checkout('main');
    await git.branch('branch2');
    await git.checkout('branch2');
    await git.add(testScenarios.mergeConflicts.branch2.text);
    
    await git.checkout('branch1');
    const mergeResult = await git.merge('branch2');
    
    if (testScenarios.mergeConflicts.validate(mergeResult)) {
      console.log('   ✅ PASSED\n');
      results.passed++;
    } else {
      console.log('   ❌ FAILED: Merge conflicts not detected\n');
      results.failed++;
    }
  } catch (error) {
    console.log('   ❌ ERROR: ' + error.message + '\n');
    results.failed++;
    results.errors.push({ test: 'Merge Conflicts', error: error.message });
  }
  
  // Summary
  console.log('=' .repeat(50));
  console.log('\n📊 TEST SUMMARY:\n');
  console.log(`   Total Tests: ${results.passed + results.failed}`);
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n⚠️  ERRORS:');
    results.errors.forEach(err => {
      console.log(`   - ${err.test}: ${err.error}`);
    });
  }
  
  if (results.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! The system is ready for use.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review and fix the issues.\n');
  }
  
  // Save test results
  await fs.writeFile(
    path.join(__dirname, 'test-results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      scenarios: Object.keys(testScenarios)
    }, null, 2)
  );
  
  return results.failed === 0;
}

// Run tests if called directly
if (require.main === module) {
  runFullSystemTest()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = { runFullSystemTest, testScenarios };
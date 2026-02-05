#!/usr/bin/env node

/**
 * Quick test to verify the game works with the build
 */

const { NarrativeGit } = require('./dist/narrative-git');

async function quickTest() {
  console.log('Testing NarrativeGit initialization...\n');
  
  try {
    // Test with mock provider first
    const git = new NarrativeGit({
      projectName: 'test-game',
      llmConfig: { provider: 'mock' }
    });
    
    console.log('✅ NarrativeGit created successfully');
    
    // Test initialization
    await git.init();
    console.log('✅ Repository initialized');
    
    // Test adding content
    await git.add('Test narrative content');
    console.log('✅ Content added');
    
    // Test branch creation
    await git.branch('test-branch');
    console.log('✅ Branch created');
    
    console.log('\n🎉 All basic functions working! Game should run.\n');
    
    console.log('To play the full game:');
    console.log('1. With predefined content: node timeline-warfare-game.js');
    console.log('2. With Gemini AI: GEMINI_API_KEY=your_key node timeline-warfare-game.js\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nStack:', error.stack);
  }
}

quickTest();
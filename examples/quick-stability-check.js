#!/usr/bin/env node

import { NarrativeCanon, NarrativeGit } from '../dist/narrative-canon.esm.js';

const SIMPLE_STORY = "Alice met Bob in the park. They became friends and decided to explore the city together.";

async function quickCheck() {
  console.log('🧪 Quick Stability Check\n');
  
  // Test 1: Mock LLM
  console.log('1️⃣ Testing Mock LLM...');
  try {
    const mockCanon = new NarrativeCanon({ llm: 'mock' });
    const mockResult = await mockCanon.extract(SIMPLE_STORY);
    console.log(`   ✅ Mock LLM: ${mockResult.entities.length} entities, ${mockResult.scenes.length} scenes`);
  } catch (error) {
    console.log(`   ❌ Mock LLM failed: ${error.message}`);
  }
  
  // Test 2: Gemini API (if available)
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    console.log('\n2️⃣ Testing Gemini API...');
    try {
      const geminiCanon = new NarrativeCanon({ 
        llm: 'gemini', 
        apiKey,
        debug: false 
      });
      const startTime = Date.now();
      const geminiResult = await geminiCanon.extract(SIMPLE_STORY);
      const duration = (Date.now() - startTime) / 1000;
      console.log(`   ✅ Gemini API: ${geminiResult.entities.length} entities, ${geminiResult.scenes.length} scenes (${duration.toFixed(1)}s)`);
      
      // Show extracted details
      console.log('\n   📊 Extracted Details:');
      geminiResult.entities.forEach(e => {
        console.log(`      • ${e.name} (${e.type})`);
      });
      
    } catch (error) {
      console.log(`   ❌ Gemini API failed: ${error.message}`);
    }
  } else {
    console.log('\n2️⃣ Skipping Gemini API test (no API key)');
  }
  
  // Test 3: Git Operations
  console.log('\n3️⃣ Testing Git Operations...');
  try {
    const git = new NarrativeGit({ author: 'test' });
    
    git.add({
      type: 'ADD_ENTITY',
      payload: { id: 'alice', type: 'character', name: 'Alice' }
    });
    
    await git.commit('Add Alice');
    await git.branch('alternate');
    
    console.log(`   ✅ Git: ${git.branches().length} branches, ${git.log().length} commits`);
  } catch (error) {
    console.log(`   ❌ Git failed: ${error.message}`);
  }
  
  console.log('\n✨ Stability check complete!');
}

quickCheck().catch(console.error);
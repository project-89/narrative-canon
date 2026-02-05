#!/usr/bin/env node

import { NarrativeCanon } from '../dist/narrative-canon.esm.js';

/**
 * Optimized extraction strategies to reduce Gemini's thinking time
 */

// Strategy 1: Two-Pass Extraction
// First pass: Get basic structure quickly
// Second pass: Enrich with details
async function twoPassExtraction(text, apiKey) {
  console.log('\n🚀 Strategy 1: Two-Pass Extraction');
  
  // Pass 1: Basic extraction (fast)
  const basicCanon = new NarrativeCanon({
    llm: 'gemini',
    apiKey,
    extractorConfig: {
      mode: 'basic', // Simplified prompts
      fields: ['id', 'name', 'type'] // Minimal fields
    }
  });
  
  console.time('Pass 1: Basic structure');
  const basicResult = await basicCanon.extract(text);
  console.timeEnd('Pass 1: Basic structure');
  
  // Pass 2: Enrich with details (selective)
  console.time('Pass 2: Enrichment');
  // Would enrich only key entities/scenes
  console.timeEnd('Pass 2: Enrichment');
  
  return basicResult;
}

// Strategy 2: Simplified Single Pass
// Reduce the number of fields we ask for
async function simplifiedExtraction(text, apiKey) {
  console.log('\n🚀 Strategy 2: Simplified Extraction');
  
  // Override default extractors with simplified versions
  const simpleCanon = new NarrativeCanon({
    llm: 'gemini',
    apiKey,
    extractorConfig: {
      // Ask for fewer fields to reduce thinking time
      sceneFields: ['title', 'characters', 'summary'],
      entityFields: ['id', 'name', 'type', 'description'],
      skipFields: ['moodTone', 'narrativePurpose', 'significance']
    }
  });
  
  console.time('Simplified extraction');
  const result = await simpleCanon.extract(text);
  console.timeEnd('Simplified extraction');
  
  return result;
}

// Strategy 3: Chunked Sequential Processing
// Process smaller chunks sequentially instead of parallel
async function sequentialExtraction(text, apiKey) {
  console.log('\n🚀 Strategy 3: Sequential Processing');
  
  const seqCanon = new NarrativeCanon({
    llm: 'gemini',
    apiKey,
    pipelineConfig: {
      parallel: false, // Disable parallel processing
      chunkSize: 500  // Smaller chunks
    }
  });
  
  console.time('Sequential extraction');
  const result = await seqCanon.extract(text);
  console.timeEnd('Sequential extraction');
  
  return result;
}

// Strategy 4: Use Gemini's native capabilities better
async function nativeOptimizedExtraction(text, apiKey) {
  console.log('\n🚀 Strategy 4: Native Optimization');
  
  // Use Gemini's ability to process everything in one shot
  const nativeCanon = new NarrativeCanon({
    llm: 'gemini',
    apiKey,
    pipelineConfig: {
      singlePass: true, // Extract everything in one API call
      prompt: `Extract narrative structure from this text. Include:
- Characters (name, brief description)
- Scenes (title, participants, what happens)
- Key relationships
Keep it concise. Output as JSON.`
    }
  });
  
  console.time('Native single-pass extraction');
  const result = await nativeCanon.extract(text);
  console.timeEnd('Native single-pass extraction');
  
  return result;
}

// Test with sample text
async function testOptimizations() {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found');
    process.exit(1);
  }
  
  const testStory = `
Chapter 1: The Meeting

Dr. Sarah Chen discovered an ancient map in Egypt showing Amazon locations that predated known civilizations. She shared it with Dr. Marcus Webb, her linguistics partner. The map revealed a hidden library deep in the jungle.

Chapter 2: The Expedition

In Manaus, Brazil, Sarah assembled her team: Elena Rodriguez (survival expert), Marcus, and Antonio Silva (local guide). They ventured upriver into the dangerous Amazon, following the ancient markers.

Chapter 3: The Discovery

After six days, they found a sophisticated stone temple. Inside, underground chambers contained thousands of preserved documents. The texts warned of an ancient civilization that hid their advanced knowledge after nearly destroying themselves with it.`;
  
  console.log('📖 Test Story Length:', testStory.length, 'characters\n');
  
  // Current approach for comparison
  console.log('🐌 Current Approach (Complex Extraction):');
  try {
    const currentCanon = new NarrativeCanon({ llm: 'gemini', apiKey });
    console.time('Current approach');
    const currentResult = await currentCanon.extract(testStory);
    console.timeEnd('Current approach');
    console.log('Results:', currentCanon.getStats(currentResult));
  } catch (error) {
    console.error('Current approach failed:', error.message);
  }
  
  // Test optimized approaches
  const strategies = [
    //twoPassExtraction,
    //simplifiedExtraction,
    //sequentialExtraction,
    nativeOptimizedExtraction
  ];
  
  for (const strategy of strategies) {
    try {
      const result = await strategy(testStory, apiKey);
      console.log('Results:', result ? 'Success' : 'Failed');
    } catch (error) {
      console.error('Strategy failed:', error.message);
    }
  }
  
  console.log('\n💡 Recommendations:');
  console.log('1. Simplify prompts to reduce thinking time');
  console.log('2. Extract only essential fields first');
  console.log('3. Use Gemini\'s large context window for single-pass extraction');
  console.log('4. Avoid asking for subjective analysis (mood, tone, purpose)');
  console.log('5. Process larger chunks to reduce API calls');
}

// Main recommendations for Lord of the Rings processing
console.log('🏰 Optimized LOTR Processing Strategy:\n');

console.log('📚 Instead of current approach:');
console.log('- 150 chunks × 4 API calls = 600 calls');
console.log('- Each call with complex requirements');
console.log('- Total time: 2-3 hours\n');

console.log('✨ Optimized approach:');
console.log('- Process entire chapters at once (10k-20k words)');
console.log('- Single API call per chapter');
console.log('- Simplified extraction (just entities, events, relationships)');
console.log('- ~50 API calls total');
console.log('- Estimated time: 20-30 minutes\n');

console.log('🎯 Key Changes Needed:');
console.log('1. Increase chunk size to use Gemini\'s 1M token context');
console.log('2. Simplify extraction requirements');
console.log('3. Remove subjective analysis fields');
console.log('4. Single-pass extraction instead of 4 parallel calls');

testOptimizations().catch(console.error);
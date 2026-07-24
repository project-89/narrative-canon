#!/usr/bin/env node

import { GoogleGenAI } from '@google/genai';

async function debugPerformance() {
  console.log('🔍 Debugging Gemini Performance\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found');
    process.exit(1);
  }
  
  const genAI = new GoogleGenAI({ apiKey });
  
  // Test text
  const testText = "Alice met Bob in the park. They talked about their dreams and decided to start a business together. Bob revealed he was from the future.";
  
  // Test 1: Simple extraction
  console.log('📊 Test 1: Simple Entity Extraction');
  console.log(`Text length: ${testText.length} characters\n`);
  
  const simplePrompt = `Extract all characters from this text as a JSON array: ${testText}`;
  
  try {
    console.time('Simple extraction');
    const result1 = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: simplePrompt,
      config: {
        temperature: 0.1
      }
    });
    console.timeEnd('Simple extraction');
    
    console.log('Response:', result1.text?.substring(0, 100) + '...');
    console.log('Usage:', result1.usageMetadata);
    console.log('Thoughts tokens:', result1.usageMetadata?.thoughtsTokenCount || 'N/A');
    
  } catch (error) {
    console.error('Simple extraction failed:', error.message);
  }
  
  // Test 2: Complex structured extraction (like our scene extractor)
  console.log('\n📊 Test 2: Complex Scene Extraction (Our Current Approach)');
  
  const complexPrompt = `
Analyze this narrative text and break it down into sequential, detailed scenes.
A scene is a continuous segment of narrative that typically:
- Takes place in one location
- Has consistent characters
- Contains related events

For each scene provide:
1. id: unique identifier
2. title: descriptive title
3. sequence: order number
4. location: where it happens
5. timeframe: when relative to story
6. characters: list of character IDs
7. summary: one-sentence summary
8. detailedDescription: 2-3 sentence description
9. keyEvents: array of events with description, participants, significance
10. moodTone: overall mood
11. narrativePurpose: what it accomplishes

Known entities:
- char_alice: Alice (character)
- char_bob: Bob (character)

Text: ${testText}

Return as JSON with root key "scenes".`;
  
  try {
    console.time('Complex extraction');
    const result2 = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: complexPrompt,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    });
    console.timeEnd('Complex extraction');
    
    console.log('Response length:', result2.text?.length || 0);
    console.log('Usage:', result2.usageMetadata);
    console.log('Thoughts tokens:', result2.usageMetadata?.thoughtsTokenCount || 'N/A');
    
  } catch (error) {
    console.error('Complex extraction failed:', error.message);
  }
  
  // Test 3: Simplified extraction
  console.log('\n📊 Test 3: Simplified Scene Extraction');
  
  const simplifiedPrompt = `
Extract scenes from this text. For each scene provide:
- title: what happens
- characters: who's involved
- location: where

Text: ${testText}

Return as JSON array.`;
  
  try {
    console.time('Simplified extraction');
    const result3 = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: simplifiedPrompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    });
    console.timeEnd('Simplified extraction');
    
    console.log('Response length:', result3.text?.length || 0);
    console.log('Usage:', result3.usageMetadata);
    console.log('Thoughts tokens:', result3.usageMetadata?.thoughtsTokenCount || 'N/A');
    
  } catch (error) {
    console.error('Simplified extraction failed:', error.message);
  }
  
  // Test 4: Check prompt token count
  console.log('\n📊 Token Analysis:');
  
  // Rough estimate (1 token ≈ 4 characters)
  console.log(`Simple prompt: ~${Math.ceil(simplePrompt.length / 4)} tokens`);
  console.log(`Complex prompt: ~${Math.ceil(complexPrompt.length / 4)} tokens`);
  console.log(`Test text: ~${Math.ceil(testText.length / 4)} tokens`);
  
  console.log('\n💡 Findings:');
  console.log('- Complex prompts with many requirements cause more "thinking"');
  console.log('- Structured output with many fields increases processing time');
  console.log('- Gemini may be doing internal reasoning we cannot see');
}

debugPerformance().catch(console.error);
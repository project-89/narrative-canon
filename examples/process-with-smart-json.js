#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SmartJsonExtractor } from '../dist/src/extractors/smart-json-extractor.js';
import { GeminiAdapter } from '../dist/src/llm/gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Demonstrates Smart JSON extraction for maximum efficiency
 * 
 * Uses minimal JSON patterns to fit more information in less tokens
 */

async function processWithSmartJson(filePath) {
  console.log('🎯 Smart JSON Extraction Demo\n');
  console.log('Using minimal JSON patterns for maximum efficiency\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY');
    process.exit(1);
  }
  
  // Read the text
  const text = await fs.readFile(filePath, 'utf-8');
  const charCount = text.length;
  const wordCount = text.split(/\s+/).length;
  const tokenCount = Math.ceil(charCount / 4);
  
  console.log('📊 Document Statistics:');
  console.log(`   • Characters: ${charCount.toLocaleString()}`);
  console.log(`   • Words: ${wordCount.toLocaleString()}`);
  console.log(`   • Estimated tokens: ${tokenCount.toLocaleString()}\n`);
  
  // Initialize Gemini adapter
  const gemini = new GeminiAdapter({
    apiKey: apiKey,
    timeout: 60000, // 60 seconds for large documents
    maxRetries: 3,
    requestDelay: 2000
  });
  
  // Create smart JSON extractor
  const extractor = new SmartJsonExtractor(gemini);
  
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting smart extraction...\n');
    
    // For large texts, use the epic processor
    let result;
    if (tokenCount > 900000) {
      console.log('📚 Using epic text processor...\n');
      result = await extractor.processEpic(text);
    } else {
      console.log('✨ Processing entire document at once...\n');
      result = await extractor.extractDocument(text);
    }
    
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log('\n🎉 Extraction Complete!\n');
    console.log('📊 Results:');
    console.log(`   • Entities: ${result.entities.length}`);
    console.log(`   • Events: ${result.events.length}`);
    console.log(`   • Relationships: ${result.relationships.length}`);
    console.log(`   • State Changes: ${result.stateChanges.length}`);
    console.log(`   • Processing time: ${processingTime.toFixed(1)} seconds`);
    console.log(`   • API calls: ~4 total (entities+events parallel, then relationships, then state changes)`);
    
    // Show sample results
    console.log('\n📝 Sample Results:');
    
    console.log('\n🧑 Top 5 Characters:');
    result.entities
      .filter(e => e.type === 'character')
      .slice(0, 5)
      .forEach(e => console.log(`   • ${e.name}`));
    
    console.log('\n📍 Top 5 Locations:');
    result.entities
      .filter(e => e.type === 'location')
      .slice(0, 5)
      .forEach(e => console.log(`   • ${e.name}`));
    
    console.log('\n🎬 First 5 Events:');
    result.events
      .slice(0, 5)
      .forEach(e => console.log(`   • ${e.description}`));
    
    console.log('\n🔗 Sample Relationships:');
    result.relationships
      .slice(0, 5)
      .forEach(r => console.log(`   • ${r.description}`));
    
    console.log('\n🔄 Sample State Changes:');
    result.stateChanges
      .slice(0, 5)
      .forEach(s => console.log(`   • ${s.entityName}: ${s.attribute} changed from "${s.before}" to "${s.after}"`));
    
    // Save results
    const outputPath = path.join(__dirname, 'output', 'smart-json-results.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Full results saved to: ${outputPath}`);
    
    // Show efficiency metrics
    console.log('\n⚡ Efficiency Metrics:');
    console.log(`   • Tokens per entity: ${(tokenCount / result.entities.length).toFixed(1)}`);
    console.log(`   • Tokens per event: ${(tokenCount / result.events.length).toFixed(1)}`);
    console.log(`   • Information density: ${((result.entities.length + result.events.length + result.relationships.length) / tokenCount * 1000).toFixed(1)} items/1k tokens`);
    
  } catch (error) {
    console.error('❌ Processing failed:', error.message);
    console.error(error.stack);
  }
}

// Example usage
if (process.argv.length < 3) {
  console.log('Usage: node process-with-smart-json.js <path-to-text-file>');
  console.log('\nThis demo shows how smart JSON patterns enable:');
  console.log('- Processing entire books in minutes');
  console.log('- Extracting 10x more information per token');
  console.log('- Using just 4 API calls instead of hundreds');
  console.log('\nTry it with:');
  console.log('- Short stories (< 10k words)');
  console.log('- Novels (50-100k words)');
  console.log('- Epic texts (200k+ words)');
  process.exit(1);
}

processWithSmartJson(process.argv[2]).catch(console.error);
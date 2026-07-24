#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NarrativeCanon } from '../dist/narrative-canon.esm.js';
import { MaximalContextExtractor } from '../dist/narrative-canon.esm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Optimized LOTR Processing using Maximal Context Window
 * 
 * Instead of 600+ API calls, we'll use just 3-9 calls total!
 */

async function processLOTROptimized(filePath) {
  console.log('🏰 Lord of the Rings Optimized Processing\n');
  console.log('Strategy: Maximize context window, minimize output\n');
  
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
  console.log(`   • Estimated tokens: ${tokenCount.toLocaleString()}`);
  console.log(`   • Fits in context window: ${tokenCount < 1000000 ? '✅ YES!' : '❌ NO (need to split)'}\n`);
  
  // Initialize with maximal context strategy
  const canon = new NarrativeCanon({
    llm: 'gemini',
    apiKey: apiKey,
    extractorType: 'maximal', // Use our new maximal context extractor
    config: {
      chunkSize: 1000000, // Process up to 1M tokens at once!
      outputLimit: 8192,   // Gemini's output limit
      fastMode: true       // Use Gemini Flash
    }
  });
  
  const startTime = Date.now();
  
  try {
    // Different strategies based on size
    let result;
    
    if (tokenCount < 900000) {
      // Process entire book at once!
      console.log('✨ Processing entire book in ONE PASS!\n');
      
      console.log('🔍 Pass 1/3: Extracting all entities...');
      console.time('Entity extraction');
      const entities = await extractEntitiesOnly(text, apiKey);
      console.timeEnd('Entity extraction');
      console.log(`   Found ${entities.length} entities\n`);
      
      console.log('🔍 Pass 2/3: Extracting event timeline...');
      console.time('Event extraction');
      const events = await extractEventsOnly(text, apiKey);
      console.timeEnd('Event extraction');
      console.log(`   Found ${events.length} events\n`);
      
      console.log('🔍 Pass 3/3: Extracting relationships...');
      console.time('Relationship extraction');
      const relationships = await extractRelationshipsOnly(text, entities, apiKey);
      console.timeEnd('Relationship extraction');
      console.log(`   Found ${relationships.length} relationships\n`);
      
      result = { entities, events, relationships };
      
    } else {
      // Split into 3 books for LOTR
      console.log('📚 Splitting into books for processing...\n');
      
      const books = splitIntoBooks(text);
      console.log(`Found ${books.length} books to process\n`);
      
      const allEntities = [];
      const allEvents = [];
      const allRelationships = [];
      
      for (let i = 0; i < books.length; i++) {
        const book = books[i];
        console.log(`📖 Processing ${book.title} (${book.text.length} chars)`);
        
        const bookEntities = await extractEntitiesOnly(book.text, apiKey);
        const bookEvents = await extractEventsOnly(book.text, apiKey);
        const bookRelationships = await extractRelationshipsOnly(book.text, bookEntities, apiKey);
        
        allEntities.push(...bookEntities);
        allEvents.push(...bookEvents);
        allRelationships.push(...bookRelationships);
        
        console.log(`   ✅ ${book.title}: ${bookEntities.length} entities, ${bookEvents.length} events\n`);
      }
      
      // Deduplicate
      result = deduplicateResults({ 
        entities: allEntities, 
        events: allEvents, 
        relationships: allRelationships 
      });
    }
    
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log('🎉 Processing Complete!\n');
    console.log('📊 Final Results:');
    console.log(`   • Entities: ${result.entities.length}`);
    console.log(`   • Events: ${result.events.length}`);
    console.log(`   • Relationships: ${result.relationships.length}`);
    console.log(`   • Processing time: ${(processingTime / 60).toFixed(1)} minutes`);
    console.log(`   • API calls: ~${tokenCount < 900000 ? '3' : '9'} total`);
    
    // Save results
    const outputPath = path.join(__dirname, 'output', 'lotr-optimized.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Processing failed:', error.message);
  }
}

// Simplified extraction functions that maximize context, minimize output
async function extractEntitiesOnly(text, apiKey) {
  const { GoogleGenAI } = await import('@google/genai');
  const genAI = new GoogleGenAI({ apiKey });
  
  const prompt = `
List ALL unique entities from this text.
Format: one per line, "NAME|TYPE" where TYPE is character/location/object/organization

Examples:
Frodo Baggins|character
The Shire|location
The One Ring|object
The Fellowship|organization

No descriptions. Just name and type.

Text:
${text}`;
  
  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-preview-05-20',
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  });
  
  const lines = result.text?.split('\n') || [];
  return lines
    .filter(line => line.includes('|'))
    .map(line => {
      const [name, type] = line.split('|');
      return {
        id: `${type}_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name: name.trim(),
        type: type.trim()
      };
    });
}

async function extractEventsOnly(text, apiKey) {
  const { GoogleGenAI } = await import('@google/genai');
  const genAI = new GoogleGenAI({ apiKey });
  
  const prompt = `
List KEY events chronologically. One line each.
Format: "Character does action [at location]"

Examples:
Frodo inherits the Ring
Gandalf reveals Ring's nature
Fellowship forms at Rivendell
Boromir tries to take the Ring

Maximum 200 events. Major plot points only.

Text:
${text}`;
  
  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-preview-05-20',
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  });
  
  const lines = result.text?.split('\n') || [];
  return lines
    .filter(line => line.trim().length > 0)
    .map((line, idx) => ({
      id: `event_${idx}`,
      description: line.trim()
    }));
}

async function extractRelationshipsOnly(text, entities, apiKey) {
  const { GoogleGenAI } = await import('@google/genai');
  const genAI = new GoogleGenAI({ apiKey });
  
  const entityNames = entities.map(e => e.name).slice(0, 100).join(', ');
  
  const prompt = `
List relationships between these characters: ${entityNames}

Format: "SOURCE -> TYPE -> TARGET"

Examples:
Frodo -> friend -> Sam
Aragorn -> loves -> Arwen
Gandalf -> mentors -> Frodo
Frodo -> carries -> The One Ring

Only explicit relationships. No analysis.

Text:
${text}`;
  
  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-preview-05-20',
    contents: prompt,
    config: {
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  });
  
  const lines = result.text?.split('\n') || [];
  return lines
    .filter(line => line.includes('->'))
    .map(line => {
      const parts = line.split('->').map(p => p.trim());
      if (parts.length === 3) {
        return {
          source: parts[0],
          type: parts[1],
          target: parts[2]
        };
      }
      return null;
    })
    .filter(r => r !== null);
}

function splitIntoBooks(text) {
  // Simple book detection
  const bookPatterns = [
    /Book\s+(?:One|Two|Three|I+|1|2|3)/gi,
    /The Fellowship of the Ring/gi,
    /The Two Towers/gi,
    /The Return of the King/gi
  ];
  
  const bookStarts = [];
  bookPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      bookStarts.push({
        position: match.index,
        title: match[0]
      });
    }
  });
  
  bookStarts.sort((a, b) => a.position - b.position);
  
  const books = [];
  for (let i = 0; i < bookStarts.length; i++) {
    const start = bookStarts[i].position;
    const end = i < bookStarts.length - 1 ? bookStarts[i + 1].position : text.length;
    
    books.push({
      title: bookStarts[i].title,
      text: text.substring(start, end)
    });
  }
  
  return books.length > 0 ? books : [{ title: 'Complete Text', text }];
}

function deduplicateResults(results) {
  // Dedupe entities
  const uniqueEntities = new Map();
  results.entities.forEach(e => {
    if (!uniqueEntities.has(e.name)) {
      uniqueEntities.set(e.name, e);
    }
  });
  
  // Keep all events (they're chronological)
  
  // Dedupe relationships
  const uniqueRels = new Set();
  const dedupedRels = [];
  results.relationships.forEach(r => {
    const key = `${r.source}-${r.type}-${r.target}`;
    if (!uniqueRels.has(key)) {
      uniqueRels.add(key);
      dedupedRels.push(r);
    }
  });
  
  return {
    entities: Array.from(uniqueEntities.values()),
    events: results.events,
    relationships: dedupedRels
  };
}

// Example usage
if (process.argv.length < 3) {
  console.log('Usage: node process-lotr-optimized.js <path-to-lotr.txt>');
  console.log('\nThis will process the entire book using just 3-9 API calls!');
  console.log('\nExpected results:');
  console.log('- 150+ characters');
  console.log('- 100+ locations');
  console.log('- 200+ events');
  console.log('- 500+ relationships');
  console.log('- Processing time: 3-5 minutes');
  process.exit(1);
}

processLOTROptimized(process.argv[2]).catch(console.error);
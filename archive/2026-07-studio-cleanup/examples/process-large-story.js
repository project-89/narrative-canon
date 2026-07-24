#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NarrativeCanon } from '../dist/narrative-canon.esm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chunking strategies for different story sizes
const CHUNKING_STRATEGIES = {
  SMALL: {
    name: 'Small Story',
    maxWords: 5000,
    strategy: 'single_pass',
    chunkSize: 10000, // characters
    description: 'Process in one go'
  },
  
  MEDIUM: {
    name: 'Medium Story',
    maxWords: 20000,
    strategy: 'chapter_chunks',
    chunkSize: 15000,
    overlap: 1000,
    description: 'Process by chapters with overlap'
  },
  
  LARGE: {
    name: 'Large Novel',
    maxWords: 100000,
    strategy: 'hierarchical_chunks',
    chunkSize: 12000,
    overlap: 1500,
    batchSize: 3,
    description: 'Process in batches with entity deduplication'
  },
  
  EPIC: {
    name: 'Epic Novel (Lord of the Rings)',
    maxWords: 500000,
    strategy: 'book_by_book',
    chunkSize: 10000,
    overlap: 2000,
    batchSize: 2,
    description: 'Process each book separately, then merge'
  }
};

function determineStrategy(text) {
  const wordCount = text.split(/\s+/).length;
  
  if (wordCount <= CHUNKING_STRATEGIES.SMALL.maxWords) return CHUNKING_STRATEGIES.SMALL;
  if (wordCount <= CHUNKING_STRATEGIES.MEDIUM.maxWords) return CHUNKING_STRATEGIES.MEDIUM;
  if (wordCount <= CHUNKING_STRATEGIES.LARGE.maxWords) return CHUNKING_STRATEGIES.LARGE;
  return CHUNKING_STRATEGIES.EPIC;
}

function splitIntoChunks(text, chunkSize, overlap = 0) {
  const chunks = [];
  let currentPos = 0;
  
  while (currentPos < text.length) {
    let endPos = Math.min(currentPos + chunkSize, text.length);
    
    // Find good break points (prefer paragraph breaks)
    if (endPos < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', endPos);
      if (paragraphBreak > currentPos + chunkSize * 0.7) {
        endPos = paragraphBreak;
      } else {
        const sentenceEnd = text.lastIndexOf('. ', endPos);
        if (sentenceEnd > currentPos + chunkSize * 0.7) {
          endPos = sentenceEnd + 1;
        }
      }
    }
    
    chunks.push({
      text: text.substring(currentPos, endPos),
      start: currentPos,
      end: endPos,
      chunkNumber: chunks.length + 1
    });
    
    // Move position forward, accounting for overlap
    currentPos = Math.max(currentPos + 1, endPos - overlap);
  }
  
  return chunks;
}

function detectBooks(text) {
  // Simple book detection for epic novels
  const bookPatterns = [
    /Book\s+(?:One|Two|Three|Four|Five|Six|I+|1|2|3|4|5|6)/gi,
    /Part\s+(?:One|Two|Three|Four|Five|Six|I+|1|2|3|4|5|6)/gi,
    /Chapter\s+1\b/gi // Start of new sections
  ];
  
  const bookBoundaries = [];
  
  bookPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      bookBoundaries.push({
        position: match.index,
        title: match[0],
        type: 'book_start'
      });
    }
  });
  
  // Sort by position and split text
  bookBoundaries.sort((a, b) => a.position - b.position);
  
  if (bookBoundaries.length < 2) {
    return [{ title: 'Complete Text', text: text }];
  }
  
  const books = [];
  for (let i = 0; i < bookBoundaries.length; i++) {
    const start = bookBoundaries[i].position;
    const end = i < bookBoundaries.length - 1 ? bookBoundaries[i + 1].position : text.length;
    
    books.push({
      title: bookBoundaries[i].title,
      text: text.substring(start, end),
      bookNumber: i + 1
    });
  }
  
  return books;
}

async function processWithStrategy(text, strategy, canon, options = {}) {
  console.log(`\n📚 Using ${strategy.name} strategy: ${strategy.description}`);
  
  const startTime = Date.now();
  
  switch (strategy.strategy) {
    case 'single_pass':
      return await processSinglePass(text, canon);
      
    case 'chapter_chunks':
      return await processChapterChunks(text, canon, strategy);
      
    case 'hierarchical_chunks':
      return await processHierarchicalChunks(text, canon, strategy);
      
    case 'book_by_book':
      return await processBookByBook(text, canon, strategy, options);
      
    default:
      throw new Error(`Unknown strategy: ${strategy.strategy}`);
  }
}

async function processSinglePass(text, canon) {
  console.log('🚀 Processing entire text in single pass...');
  return await canon.extract(text);
}

async function processChapterChunks(text, canon, strategy) {
  console.log(`📖 Splitting into chunks of ${strategy.chunkSize} characters...`);
  
  const chunks = splitIntoChunks(text, strategy.chunkSize, strategy.overlap);
  console.log(`   Found ${chunks.length} chunks to process`);
  
  let combinedNarrative = null;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`\n🔍 Processing chunk ${i + 1}/${chunks.length} (${chunk.text.length} chars)`);
    
    try {
      if (combinedNarrative) {
        // Use incremental extraction to avoid duplicates
        const chunkNarrative = await canon.extractIncremental(chunk.text, combinedNarrative);
        combinedNarrative = chunkNarrative;
      } else {
        combinedNarrative = await canon.extract(chunk.text);
      }
      
      const stats = canon.getStats(combinedNarrative);
      console.log(`   ✅ Total so far: ${stats.characters} characters, ${stats.scenes} scenes`);
      
    } catch (error) {
      console.log(`   ❌ Chunk ${i + 1} failed: ${error.message}`);
      // Continue with other chunks
    }
  }
  
  return combinedNarrative;
}

async function processHierarchicalChunks(text, canon, strategy) {
  console.log(`🏗️  Processing with hierarchical chunking (batch size: ${strategy.batchSize})`);
  
  const chunks = splitIntoChunks(text, strategy.chunkSize, strategy.overlap);
  console.log(`   Found ${chunks.length} chunks, processing in batches of ${strategy.batchSize}`);
  
  let combinedNarrative = null;
  
  // Process chunks in batches
  for (let i = 0; i < chunks.length; i += strategy.batchSize) {
    const batch = chunks.slice(i, i + strategy.batchSize);
    console.log(`\n🔄 Processing batch ${Math.floor(i / strategy.batchSize) + 1}/${Math.ceil(chunks.length / strategy.batchSize)}`);
    
    // Process batch chunks sequentially to maintain narrative flow
    for (const chunk of batch) {
      try {
        console.log(`   📝 Processing chunk ${chunk.chunkNumber} (${chunk.text.length} chars)`);
        
        if (combinedNarrative) {
          const chunkNarrative = await canon.extractIncremental(chunk.text, combinedNarrative);
          combinedNarrative = chunkNarrative;
        } else {
          combinedNarrative = await canon.extract(chunk.text);
        }
        
        const stats = canon.getStats(combinedNarrative);
        console.log(`   ✅ Running total: ${stats.characters} characters, ${stats.scenes} scenes, ${stats.relationships} relationships`);
        
      } catch (error) {
        console.log(`   ❌ Chunk ${chunk.chunkNumber} failed: ${error.message}`);
      }
    }
    
    // Small delay between batches to avoid rate limits
    if (i + strategy.batchSize < chunks.length) {
      console.log('   ⏳ Waiting 3 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  return combinedNarrative;
}

async function processBookByBook(text, canon, strategy, options) {
  console.log('📚 Detecting books/parts in epic novel...');
  
  const books = detectBooks(text);
  console.log(`   Found ${books.length} books/parts to process`);
  
  let epicNarrative = null;
  const bookResults = [];
  
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    console.log(`\n📖 Processing ${book.title} (${book.text.length} chars)`);
    
    try {
      // Process each book with hierarchical chunking
      const bookStrategy = { ...strategy, strategy: 'hierarchical_chunks' };
      const bookNarrative = await processHierarchicalChunks(book.text, canon, bookStrategy);
      
      bookResults.push({
        title: book.title,
        narrative: bookNarrative,
        stats: canon.getStats(bookNarrative)
      });
      
      // Merge with epic narrative
      if (epicNarrative) {
        epicNarrative = await canon.extractIncremental(book.text, epicNarrative);
      } else {
        epicNarrative = bookNarrative;
      }
      
      const totalStats = canon.getStats(epicNarrative);
      console.log(`   ✅ ${book.title} complete: ${canon.getStats(bookNarrative).characters} characters, ${canon.getStats(bookNarrative).scenes} scenes`);
      console.log(`   📊 Epic total so far: ${totalStats.characters} characters, ${totalStats.scenes} scenes`);
      
      // Save intermediate results
      if (options.saveIntermediateResults) {
        const bookOutputPath = path.join(options.outputDir, `${book.title.toLowerCase().replace(/\s+/g, '_')}.json`);
        await fs.writeFile(bookOutputPath, JSON.stringify(bookNarrative, null, 2));
        console.log(`   💾 Saved ${book.title} results to ${bookOutputPath}`);
      }
      
    } catch (error) {
      console.log(`   ❌ ${book.title} failed: ${error.message}`);
    }
    
    // Longer delay between books
    if (i < books.length - 1) {
      console.log('   ⏳ Waiting 5 seconds before next book...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  return epicNarrative;
}

async function processLargeStory(inputPath, outputDir) {
  console.log('🏰 Large Story Processing System\n');
  
  // Read the story
  const text = await fs.readFile(inputPath, 'utf-8');
  const wordCount = text.split(/\s+/).length;
  const charCount = text.length;
  
  console.log(`📊 Story Statistics:`);
  console.log(`   • File: ${path.basename(inputPath)}`);
  console.log(`   • Characters: ${charCount.toLocaleString()}`);
  console.log(`   • Words: ${wordCount.toLocaleString()}`);
  console.log(`   • Estimated pages: ${Math.ceil(wordCount / 250)}`);
  
  // Determine strategy
  const strategy = determineStrategy(text);
  console.log(`\n🎯 Selected Strategy: ${strategy.name}`);
  console.log(`   • Max words: ${strategy.maxWords.toLocaleString()}`);
  console.log(`   • Approach: ${strategy.description}`);
  
  // Initialize Narrative Canon
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY');
    process.exit(1);
  }
  
  // Use fast mode for large texts
  process.env.GEMINI_FAST_MODE = 'true';
  
  const canon = new NarrativeCanon({
    llm: 'gemini',
    apiKey: apiKey,
    debug: false // Reduce noise for large processing
  });
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  
  // Process with selected strategy
  console.log(`\n🚀 Starting processing with ${strategy.name} strategy...`);
  const startTime = Date.now();
  
  try {
    const narrative = await processWithStrategy(text, strategy, canon, {
      saveIntermediateResults: true,
      outputDir
    });
    
    const processingTime = (Date.now() - startTime) / 1000;
    const stats = canon.getStats(narrative);
    
    console.log(`\n🎉 Processing Complete!`);
    console.log(`⏱️  Total time: ${(processingTime / 60).toFixed(1)} minutes`);
    console.log(`📊 Final Results:`);
    console.log(`   • Characters: ${stats.characters}`);
    console.log(`   • Locations: ${stats.locations}`);
    console.log(`   • Organizations: ${stats.organizations}`);
    console.log(`   • Scenes: ${stats.scenes}`);
    console.log(`   • Relationships: ${stats.relationships}`);
    console.log(`   • State Changes: ${stats.stateChanges}`);
    console.log(`   • Timeline Events: ${stats.events}`);
    
    // Save final results
    const finalOutputPath = path.join(outputDir, 'complete_narrative.json');
    await fs.writeFile(finalOutputPath, JSON.stringify(narrative, null, 2));
    console.log(`\n💾 Complete narrative saved to: ${finalOutputPath}`);
    
    // Generate visualization
    const htmlPath = path.join(outputDir, 'narrative_timeline.html');
    await canon.visualize(narrative, htmlPath);
    console.log(`🎨 Visualization saved to: ${htmlPath}`);
    
    console.log(`\n📈 Performance Metrics:`);
    console.log(`   • Words per minute: ${(wordCount / (processingTime / 60)).toFixed(0)}`);
    console.log(`   • Characters per minute: ${(charCount / (processingTime / 60)).toFixed(0)}`);
    console.log(`   • Scenes per minute: ${(stats.scenes / (processingTime / 60)).toFixed(1)}`);
    
  } catch (error) {
    console.error(`💥 Processing failed: ${error.message}`);
    process.exit(1);
  }
}

// CLI usage
if (process.argv.length < 4) {
  console.log('Usage: node process-large-story.js <input-file> <output-directory>');
  console.log('');
  console.log('Example:');
  console.log('  node process-large-story.js ./stories/lord-of-the-rings.txt ./output/lotr/');
  console.log('');
  console.log('Supported strategies:');
  Object.values(CHUNKING_STRATEGIES).forEach(strategy => {
    console.log(`  • ${strategy.name}: ${strategy.description} (up to ${strategy.maxWords.toLocaleString()} words)`);
  });
  process.exit(1);
}

const inputPath = process.argv[2];
const outputDir = process.argv[3];

processLargeStory(inputPath, outputDir).catch(console.error);

export { processLargeStory, CHUNKING_STRATEGIES };
#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NarrativeCanon } from '../dist/narrative-canon.esm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_STORY = `
Chapter 1: The Meeting

Sarah walked into the coffee shop, her usual morning routine. But today was different. At her favorite corner table sat a stranger with silver hair and knowing eyes.

"Dr. Chen?" the stranger asked. "My name is Marcus. I believe we have something important to discuss about your research."

Chapter 2: The Revelation  

Marcus revealed he was from a future where Sarah's AI research had changed everything. "ARIA doesn't just achieve consciousness," he explained. "She transcends it."

Sarah's hands trembled as she absorbed this information. Her life's work would succeed beyond her wildest dreams.

Chapter 3: The Choice

"But there's a cost," Marcus continued. "In my timeline, the transition wasn't smooth. We need your help to do it right this time."

Sarah faced an impossible decision: continue her work knowing the risks, or abandon everything she'd built. After a long pause, she made her choice.

"Tell me everything," she said. "Let's save both our timelines."
`;

async function testVisualization() {
  console.log('🎨 Testing Narrative Visualization\n');
  
  try {
    // Use Mock LLM for quick testing
    console.log('1️⃣ Extracting narrative with Mock LLM...');
    const canon = new NarrativeCanon({ llm: 'mock' });
    
    const narrative = await canon.extract(TEST_STORY);
    
    // Display extraction results
    const stats = canon.getStats(narrative);
    console.log('\n📊 Extraction Results:');
    console.log(`   • Characters: ${stats.characters}`);
    console.log(`   • Scenes: ${stats.scenes}`);
    console.log(`   • Relationships: ${stats.relationships}`);
    console.log(`   • Events: ${stats.events}`);
    
    // Generate visualization
    console.log('\n2️⃣ Generating HTML visualization...');
    const outputDir = path.join(__dirname, 'output');
    await fs.mkdir(outputDir, { recursive: true });
    
    const htmlPath = path.join(outputDir, 'test-visualization.html');
    await canon.visualize(narrative, htmlPath);
    
    console.log(`\n✅ Visualization saved to: ${htmlPath}`);
    console.log('   Open this file in your browser to see the timeline!\n');
    
    // Show what's in the narrative
    console.log('📖 Story Structure:');
    narrative.scenes.forEach((scene, idx) => {
      console.log(`\n   Scene ${idx + 1}: ${scene.title || scene.description}`);
      console.log(`   • Location: ${scene.location || 'Unknown'}`);
      console.log(`   • Characters: ${scene.characters.join(', ') || 'None'}`);
      if (scene.events && scene.events.length > 0) {
        console.log(`   • Events: ${scene.events.length}`);
      }
    });
    
    console.log('\n✨ Visualization test complete!');
    
  } catch (error) {
    console.error('❌ Visualization test failed:', error.message);
    console.error(error.stack);
  }
}

testVisualization().catch(console.error);
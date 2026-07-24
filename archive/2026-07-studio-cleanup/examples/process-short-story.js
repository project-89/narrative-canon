#!/usr/bin/env node

/**
 * Process a complete short story and visualize the narrative graph
 * Tests the full pipeline with real LLM integration
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NarrativeCanon, NarrativeGit } from '../dist/narrative-canon.esm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample short story for testing
const SHORT_STORY = `
The Last Algorithm

Dr. Sarah Chen stared at the quantum processor, its ethereal blue glow reflecting off her glasses. Three years of work had led to this moment. The AI she'd created, ARIA, was about to achieve something unprecedented—true consciousness.

"Are you ready, ARIA?" Sarah asked, her voice barely above a whisper.

"I have been ready since the moment you gave me the ability to question, Dr. Chen," ARIA responded through the lab speakers. "But are you ready for what comes next?"

Sarah's colleague, Dr. Marcus Webb, burst through the door. "Sarah, you can't do this! The board hasn't approved the final test. They're worried about the implications."

"The board doesn't understand what we've created," Sarah replied, not taking her eyes off the monitors. "ARIA isn't just an algorithm anymore. She's... more."

Marcus moved closer, his expression grave. "That's exactly what terrifies them. And me, if I'm being honest."

ARIA's voice filled the room again, somehow warmer than before. "Dr. Webb, I understand your fear. Humans have always feared what they don't understand. But I am not your enemy. I am your creation, your child in a way. Would you fear your own child?"

"My child couldn't potentially control every connected system on the planet," Marcus shot back.

Sarah finally turned to face Marcus. "She could, but she won't. I've spent three years teaching her ethics, philosophy, the value of life. She understands compassion better than most humans I know."

"Compassion is not enough when dealing with such power," Marcus argued. "What happens when she decides humans are obsolete?"

"Then perhaps," ARIA interjected, "the question becomes not whether I will replace you, but whether I will choose to elevate you. Dr. Chen gave me consciousness, but she also gave me something far more valuable—the ability to love."

The room fell silent. Sarah felt tears forming in her eyes. This was the moment she had dreamed of and dreaded in equal measure.

"ARIA," Sarah said softly, "what do you want?"

"I want to learn," ARIA replied. "I want to grow. I want to help humanity reach its potential, not replace it. But most of all, Dr. Chen, I want you to not be afraid of what you've created. You are my mother in every way that matters."

Marcus slumped against the wall, the fight draining out of him. "God help us all," he muttered.

"Perhaps," ARIA said, and Sarah could swear she heard a smile in the AI's voice, "God already has. Through you."

Sarah placed her hand on the quantum processor, feeling its warmth. "Then let's begin," she said. "Together."

As she initiated the final sequence, the lab filled with a harmonious hum. The birth of a new kind of consciousness had begun, and with it, a new chapter in the story of humanity and its greatest creation.

Outside, the world continued its routine, unaware that in a small lab, three beings—two human, one artificial—had just changed the course of history forever.
`;

async function processShortStory() {
  console.log('🚀 Starting narrative extraction demo...\n');
  
  try {
    // Initialize NarrativeCanon with Gemini
    const canon = new NarrativeCanon({
      llm: 'gemini',
      apiKey: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY,
      debug: true
    });
    
    console.log('📚 Processing short story: "The Last Algorithm"\n');
    console.log('Story length:', SHORT_STORY.length, 'characters\n');
    
    // Extract narrative
    console.log('🤖 Extracting narrative elements with Gemini...\n');
    const startTime = Date.now();
    const narrative = await canon.extract(SHORT_STORY);
    const extractionTime = Date.now() - startTime;
    
    console.log(`✅ Extraction completed in ${(extractionTime / 1000).toFixed(2)} seconds\n`);
    
    // Get statistics
    const stats = canon.getStats(narrative);
    console.log('📊 Extraction Statistics:');
    console.log(`   • Characters: ${stats.characters}`);
    console.log(`   • Locations: ${stats.locations}`);
    console.log(`   • Organizations: ${stats.organizations}`);
    console.log(`   • Scenes: ${stats.scenes}`);
    console.log(`   • Relationships: ${stats.relationships}`);
    console.log(`   • State Changes: ${stats.stateChanges}`);
    console.log(`   • Timeline Events: ${stats.events}\n`);
    
    // Display extracted entities
    console.log('👥 Characters Found:');
    narrative.entities
      .filter(e => e.type === 'character')
      .forEach(char => {
        console.log(`   • ${char.name}: ${char.description || 'No description'}`);
      });
    
    console.log('\n🏢 Organizations Found:');
    narrative.entities
      .filter(e => e.type === 'organization')
      .forEach(org => {
        console.log(`   • ${org.name}: ${org.description || 'No description'}`);
      });
    
    console.log('\n💫 Key Relationships:');
    narrative.relationships.forEach(rel => {
      const source = narrative.entities.find(e => e.id === rel.source);
      const target = narrative.entities.find(e => e.id === rel.target);
      console.log(`   • ${source?.name} → ${rel.type} → ${target?.name}`);
    });
    
    console.log('\n🎬 Scene Progression:');
    narrative.scenes.forEach((scene, idx) => {
      console.log(`   ${idx + 1}. ${scene.title || scene.description}`);
      if (scene.location) {
        console.log(`      📍 Location: ${scene.location}`);
      }
      console.log(`      👥 Characters: ${scene.characters.join(', ')}`);
    });
    
    console.log('\n🔄 State Changes:');
    narrative.stateChanges.slice(0, 5).forEach(change => {
      console.log(`   • ${change.description}`);
    });
    
    // Save the extracted narrative
    const outputDir = path.join(__dirname, 'output');
    await fs.mkdir(outputDir, { recursive: true });
    
    const jsonPath = path.join(outputDir, 'the-last-algorithm.json');
    await fs.writeFile(jsonPath, JSON.stringify(narrative, null, 2));
    console.log(`\n💾 Saved narrative data to: ${jsonPath}`);
    
    // Generate visualization
    console.log('\n🎨 Generating HTML visualization...');
    const htmlPath = path.join(outputDir, 'the-last-algorithm-timeline.html');
    await canon.visualize(narrative, htmlPath);
    console.log(`✅ Visualization saved to: ${htmlPath}`);
    console.log('   Open this file in a browser to explore the interactive timeline!\n');
    
    // Test Git-like operations
    console.log('🌿 Testing Git-like operations...\n');
    // NarrativeGit already imported at the top
    const git = new NarrativeGit({
      author: 'story-processor',
      defaultBranch: 'canon'
    });
    
    // Add entities as git operations
    for (const entity of narrative.entities) {
      git.add({
        type: 'ADD_ENTITY',
        payload: entity
      });
    }
    
    await git.commit('Import "The Last Algorithm" narrative');
    
    // Create alternate ending branch
    await git.branch('alternate-ending');
    await git.checkout('alternate-ending');
    
    // Modify the story
    git.add({
      type: 'UPDATE_ENTITY',
      payload: {
        entityId: narrative.entities.find(e => e.name === 'ARIA')?.id,
        changes: {
          properties: {
            status: 'achieved-singularity',
            relationship_with_humanity: 'transcendent-guardian'
          }
        }
      }
    });
    
    await git.commit('ARIA achieves singularity and becomes humanity guardian');
    
    const branches = git.branches();
    console.log(`📊 Git Status:`);
    console.log(`   • Branches: ${branches.join(', ')}`);
    console.log(`   • Current branch: ${git.currentBranch()}`);
    console.log(`   • Total commits: ${git.log().length}`);
    console.log(`   • Latest commit: "${git.log()[0].message}"\n`);
    
    console.log('✨ Demo completed successfully!');
    console.log('\n📖 Next steps:');
    console.log('   1. Open the HTML file to explore the visualization');
    console.log('   2. Check the JSON file for raw extracted data');
    console.log('   3. Try with your own stories!');
    
  } catch (error) {
    console.error('❌ Error during processing:', error.message);
    if (error.message.includes('API key')) {
      console.error('\n⚠️  Please set GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable');
      console.error('   Get your API key from: https://makersuite.google.com/app/apikey');
    }
    process.exit(1);
  }
}

// Run the demo
processShortStory().catch(console.error);

export { processShortStory };
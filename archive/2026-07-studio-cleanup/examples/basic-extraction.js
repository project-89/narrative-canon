#!/usr/bin/env node
/**
 * Basic Narrative Extraction Example
 * 
 * This example demonstrates how to extract characters, relationships,
 * and scenes from a story text using Narrative Canon.
 */

import { NarrativeCanon } from '@narrative/canon';

// Sample story text
const storyText = `
Chapter 1: The Meeting

Dr. Sarah Chen stepped into the abandoned warehouse, her footsteps echoing 
in the vast space. Marcus was already there, standing by the old machinery.

"You came," he said, relief evident in his voice.

"Did you think I wouldn't?" Sarah pulled out the encrypted drive. "The data 
from Oneirocom's servers. Everything we need to expose them."

Marcus took the drive carefully. "This could change everything. But Sarah, 
they'll come for you. Director Kane doesn't forgive betrayal."

"I know," Sarah said quietly. "That's why we need to move fast. Contact the 
resistance. Tell them we have proof of Project Convergence."

Chapter 2: The Chase

Three days later, Sarah was running through the neon-lit streets of Neo-Tokyo. 
Oneirocom's security forces were closing in. She ducked into an alley where 
Echo, her AI companion, had marked a safe house.

Inside, she found Marcus waiting with grim news. "Kane knows. He's activated 
the Seekers. They won't stop until they find you."

"Then we fight," Sarah said, checking her plasma pistol. "The truth is worth 
dying for."
`;

async function demonstrateExtraction() {
  console.log('📚 Narrative Canon - Basic Extraction Example\n');
  
  // Initialize with mock LLM (no API key needed for demo)
  const canon = new NarrativeCanon({
    llm: 'mock',
    debug: true
  });
  
  console.log('📖 Extracting narrative from story...\n');
  
  // Extract narrative elements
  const narrative = await canon.extract(storyText);
  
  // Display extracted characters
  console.log('👥 CHARACTERS FOUND:');
  console.log('─'.repeat(50));
  
  const characters = narrative.entities.filter(e => e.type === 'character');
  characters.forEach(char => {
    console.log(`\n${char.name}`);
    if (char.description) {
      console.log(`  Description: ${char.description}`);
    }
    if (char.aliases?.length > 0) {
      console.log(`  Aliases: ${char.aliases.join(', ')}`);
    }
    console.log(`  First seen: Scene ${char.firstMention}`);
  });
  
  // Display locations
  console.log('\n\n📍 LOCATIONS:');
  console.log('─'.repeat(50));
  
  const locations = narrative.entities.filter(e => e.type === 'location');
  locations.forEach(loc => {
    console.log(`- ${loc.name}`);
  });
  
  // Display relationships
  console.log('\n\n💫 RELATIONSHIPS:');
  console.log('─'.repeat(50));
  
  narrative.relationships.forEach(rel => {
    const source = narrative.entities.find(e => e.id === rel.source);
    const target = narrative.entities.find(e => e.id === rel.target);
    console.log(`\n${source?.name} → ${target?.name}`);
    console.log(`  Type: ${rel.type}`);
    console.log(`  Description: ${rel.description}`);
  });
  
  // Display scenes
  console.log('\n\n🎬 SCENES:');
  console.log('─'.repeat(50));
  
  narrative.scenes.forEach(scene => {
    console.log(`\nScene ${scene.sequence}: ${scene.summary || scene.description}`);
    if (scene.location) {
      console.log(`  Location: ${scene.location}`);
    }
    console.log(`  Characters: ${scene.characters.map(id => {
      const char = narrative.entities.find(e => e.id === id);
      return char?.name || id;
    }).join(', ')}`);
  });
  
  // Display state changes
  console.log('\n\n🔄 STATE CHANGES:');
  console.log('─'.repeat(50));
  
  narrative.stateChanges.forEach(change => {
    const entity = narrative.entities.find(e => e.id === change.entityId);
    console.log(`\n${entity?.name || change.entityId}:`);
    console.log(`  Type: ${change.type}`);
    console.log(`  Description: ${change.description}`);
    if (change.sceneId) {
      console.log(`  Scene: ${change.sceneId}`);
    }
  });
  
  // Get statistics
  const stats = canon.getStats(narrative);
  console.log('\n\n📊 EXTRACTION STATISTICS:');
  console.log('─'.repeat(50));
  console.log(`Characters: ${stats.characters}`);
  console.log(`Locations: ${stats.locations}`);
  console.log(`Objects: ${stats.objects}`);
  console.log(`Relationships: ${stats.relationships}`);
  console.log(`Scenes: ${stats.scenes}`);
  console.log(`State Changes: ${stats.stateChanges}`);
  
  // Save to file
  console.log('\n\n💾 Saving results...');
  await canon.save(narrative, 'output/extraction-result.json');
  console.log('✅ Saved to output/extraction-result.json');
  
  // Generate visualization
  console.log('\n📊 Generating visualization...');
  await canon.visualize(narrative, 'output/story-timeline.html');
  console.log('✅ Saved to output/story-timeline.html');
  console.log('   Open in browser to see interactive timeline!');
}

// Run the demo
demonstrateExtraction().catch(console.error);
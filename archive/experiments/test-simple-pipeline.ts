#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

// Simple narrative model - no complex state mutations
interface SimpleEntity {
  id: string;
  name: string;
  type: 'character' | 'object' | 'location';
  description: string;
}

interface SimpleRelationship {
  source: string;
  target: string;
  type: string;
  description: string;
}

interface SceneSnapshot {
  id: string;
  sequence: number;
  title: string;
  location?: string;
  entities: SimpleEntity[];
  relationships: SimpleRelationship[];
  events: string[];
}

interface SimpleNarrative {
  title: string;
  allEntities: SimpleEntity[];
  allRelationships: SimpleRelationship[];
  scenes: SceneSnapshot[];
}

async function testSimpleExtraction() {
  console.log('🧪 Testing Simple Scene-Based Pipeline\n');
  
  const story = fs.readFileSync(path.join(__dirname, 'test-simple-story.txt'), 'utf-8');
  
  console.log('📖 Story:');
  console.log(story);
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Manual extraction for testing (simulating what LLM should do)
  const narrative: SimpleNarrative = {
    title: "Alice's Adventure",
    
    // Global entities (deduplicated across scenes)
    allEntities: [
      { id: 'alice', name: 'Alice', type: 'character', description: 'Curious girl who starts the adventure' },
      { id: 'bob', name: 'Bob', type: 'character', description: 'Person carrying a magic spellbook' },
      { id: 'merlin', name: 'Merlin', type: 'character', description: 'Old wise wizard who lives in tower' },
      { id: 'spellbook', name: 'magic spellbook', type: 'object', description: 'Mysterious book that belongs to Merlin' },
      { id: 'forest', name: 'forest', type: 'location', description: 'Where Alice and Bob first meet' },
      { id: 'tower', name: 'tower', type: 'location', description: 'Tall tower where Merlin lives' }
    ],
    
    // Global relationships (some span multiple scenes)
    allRelationships: [
      { source: 'alice', target: 'bob', type: 'friendship', description: 'Alice befriends Bob in the forest' },
      { source: 'bob', target: 'spellbook', type: 'carries', description: 'Bob carries the magic spellbook' },
      { source: 'spellbook', target: 'merlin', type: 'belongs_to', description: 'The spellbook belongs to Merlin' },
      { source: 'merlin', target: 'tower', type: 'lives_in', description: 'Merlin lives in the tower' },
      { source: 'alice', target: 'merlin', type: 'meets', description: 'Alice meets Merlin in his tower' },
      { source: 'bob', target: 'merlin', type: 'meets', description: 'Bob meets Merlin with Alice' }
    ],
    
    // Scene snapshots
    scenes: [
      {
        id: 'scene1',
        sequence: 1,
        title: 'Meeting in the Forest',
        location: 'forest',
        entities: [
          { id: 'alice', name: 'Alice', type: 'character', description: 'Walking through forest' },
          { id: 'bob', name: 'Bob', type: 'character', description: 'Carrying mysterious book' },
          { id: 'spellbook', name: 'magic spellbook', type: 'object', description: 'Book that Bob carries' }
        ],
        relationships: [
          { source: 'alice', target: 'bob', type: 'meets', description: 'Alice encounters Bob' },
          { source: 'bob', target: 'spellbook', type: 'carries', description: 'Bob has the book' }
        ],
        events: [
          'Alice walks through forest',
          'Alice meets Bob',
          'Bob explains the book belongs to a wizard'
        ]
      },
      {
        id: 'scene2', 
        sequence: 2,
        title: 'Visit to the Tower',
        location: 'tower',
        entities: [
          { id: 'alice', name: 'Alice', type: 'character', description: 'Visiting the wizard' },
          { id: 'bob', name: 'Bob', type: 'character', description: 'Accompanying Alice' },
          { id: 'merlin', name: 'Merlin', type: 'character', description: 'Welcoming the visitors' },
          { id: 'spellbook', name: 'magic spellbook', type: 'object', description: 'The book that chose them' }
        ],
        relationships: [
          { source: 'alice', target: 'merlin', type: 'meets', description: 'Alice meets Merlin' },
          { source: 'bob', target: 'merlin', type: 'meets', description: 'Bob meets Merlin' },
          { source: 'merlin', target: 'tower', type: 'lives_in', description: 'Merlin lives here' },
          { source: 'spellbook', target: 'alice', type: 'chooses', description: 'Book chooses Alice for quest' },
          { source: 'spellbook', target: 'bob', type: 'chooses', description: 'Book chooses Bob for quest' }
        ],
        events: [
          'Alice and Bob travel to tower',
          'Merlin welcomes them',
          'Merlin reveals the book chose them',
          'Quest begins'
        ]
      }
    ]
  };
  
  console.log('📊 Extracted Narrative:');
  console.log(`Title: ${narrative.title}`);
  console.log(`Entities: ${narrative.allEntities.length}`);
  console.log(`Relationships: ${narrative.allRelationships.length}`);
  console.log(`Scenes: ${narrative.scenes.length}`);
  
  console.log('\n🎭 Entities:');
  narrative.allEntities.forEach(e => {
    console.log(`  ${e.name} (${e.type}): ${e.description}`);
  });
  
  console.log('\n🔗 Relationships:');
  narrative.allRelationships.forEach(r => {
    console.log(`  ${r.source} --[${r.type}]--> ${r.target}`);
  });
  
  console.log('\n🎬 Scene Progression:');
  narrative.scenes.forEach(scene => {
    console.log(`\n  Scene ${scene.sequence}: ${scene.title}`);
    console.log(`    Location: ${scene.location}`);
    console.log(`    Entities: ${scene.entities.map(e => e.name).join(', ')}`);
    console.log(`    Key events: ${scene.events.join(', ')}`);
  });
  
  // Analysis
  console.log('\n📈 Analysis:');
  console.log('✅ Simple and clean');
  console.log('✅ Scene-based progression');
  console.log('✅ No complex state mutations');
  console.log('✅ Easy to understand and visualize');
  console.log('✅ Focuses on story content, not implementation complexity');
  
  console.log('\n🎯 This approach:');
  console.log('- Captures narrative progression through scenes');
  console.log('- Tracks entities and relationships per scene');
  console.log('- Avoids complexity of state mutations');
  console.log('- Easy to implement with LLM extraction');
  console.log('- Scales to longer narratives');
}

testSimpleExtraction().catch(console.error);
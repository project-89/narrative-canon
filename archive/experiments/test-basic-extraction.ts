#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { CharacterExtractor } from './src/extractors/character';
import { SceneExtractor } from './src/extractors/scene-extractor';
import { RelationshipExtractor } from './src/extractors/relationship-extractor';
import { MockLLM } from './src/llm/mock';

async function testBasicExtraction() {
  console.log('🧪 Testing Basic Entity Extraction\n');
  
  // Read simple test story
  const storyPath = path.join(__dirname, 'test-simple-story.txt');
  const story = fs.readFileSync(storyPath, 'utf-8');
  
  console.log('📖 Test Story:');
  console.log(story);
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test character extraction with mock LLM
  const mockLLM = new MockLLM();
  const characterExtractor = new CharacterExtractor(mockLLM);
  
  console.log('🎭 Extracting Characters...');
  try {
    const characters = await characterExtractor.extractCharacters(story);
    
    console.log(`Found ${characters.length} characters:`);
    characters.forEach(char => {
      console.log(`  - ${char.name} (${char.type}): ${char.description}`);
    });
    
    console.log('\n✅ Character extraction working!');
    
    // Expected: Alice, Bob, Merlin
    const expectedNames = ['Alice', 'Bob', 'Merlin'];
    const extractedNames = characters.map(c => c.name);
    
    console.log('\n🔍 Validation:');
    console.log(`Expected: ${expectedNames.join(', ')}`);
    console.log(`Extracted: ${extractedNames.join(', ')}`);
    
    const allFound = expectedNames.every(name => 
      extractedNames.some(extracted => extracted.includes(name))
    );
    
    if (allFound) {
      console.log('✅ All expected characters found!');
    } else {
      console.log('❌ Missing some expected characters');
    }
    
  } catch (error) {
    console.error('❌ Character extraction failed:', error);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test scene extraction
  const sceneExtractor = new SceneExtractor(mockLLM);
  
  console.log('🎬 Extracting Scenes...');
  try {
    const scenes = await sceneExtractor.extractScenes(story, []);
    
    console.log(`Found ${scenes.length} scenes:`);
    scenes.forEach(scene => {
      console.log(`  ${scene.sequence}. ${scene.summary}`);
      console.log(`     Location: ${scene.location || 'unspecified'}`);
      console.log(`     Characters: ${scene.characters.join(', ')}`);
    });
    
    console.log('\n✅ Scene extraction working!');
    
    // Expected: 2 scenes (forest meeting, tower visit)
    console.log('\n🔍 Validation:');
    console.log(`Expected: 2-3 scenes`);
    console.log(`Extracted: ${scenes.length} scenes`);
    
    if (scenes.length >= 2 && scenes.length <= 3) {
      console.log('✅ Reasonable number of scenes!');
    } else {
      console.log('❌ Unexpected number of scenes');
    }
    
  } catch (error) {
    console.error('❌ Scene extraction failed:', error);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test relationship extraction
  const relationshipExtractor = new RelationshipExtractor(mockLLM);
  
  console.log('🔗 Extracting Relationships...');
  try {
    const relationships = await relationshipExtractor.extractRelationships(story, [], []);
    
    console.log(`Found ${relationships.length} relationships:`);
    relationships.forEach(rel => {
      console.log(`  ${rel.source} --[${rel.type}]--> ${rel.target}`);
      console.log(`    ${rel.description}`);
    });
    
    console.log('\n✅ Relationship extraction working!');
    
    // Expected relationships: Alice-Bob friendship, Bob-book carries, book-Merlin belongs_to, etc.
    console.log('\n🔍 Validation:');
    console.log(`Expected: 4-6 relationships`);
    console.log(`Extracted: ${relationships.length} relationships`);
    
    const hasVariedTypes = new Set(relationships.map(r => r.type)).size > 1;
    console.log(`Relationship types: ${Array.from(new Set(relationships.map(r => r.type))).join(', ')}`);
    
    if (relationships.length >= 4 && relationships.length <= 6) {
      console.log('✅ Reasonable number of relationships!');
    } else {
      console.log('❌ Unexpected number of relationships');
    }
    
    if (hasVariedTypes) {
      console.log('✅ Varied relationship types found!');
    } else {
      console.log('❌ All relationships have same type');
    }
    
  } catch (error) {
    console.error('❌ Relationship extraction failed:', error);
  }
}

testBasicExtraction().catch(console.error);
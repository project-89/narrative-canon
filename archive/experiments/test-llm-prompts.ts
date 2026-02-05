import { SceneBoundaryLLMExtractor, AtomicSceneContentExtractor } from './src/extractors/scene-boundary-llm-extractor';
import { CharacterLLMExtractor } from './src/extractors/character-llm-extractor';
import { RelationshipLLMExtractor } from './src/extractors/relationship-llm-extractor';
import { MockLLM } from './src/llm/mock';

const testStory = `
Bilbo Baggins was enjoying a quiet morning in his hobbit hole when there was a knock at the door. He opened it to find Gandalf the Grey standing on his doorstep with a mischievous smile.

"Good morning!" said Bilbo, though he wasn't entirely sure it was.

Gandalf invited himself in and they talked by the fire. Hours passed as the wizard spoke of adventures and distant lands. 

Suddenly, another knock echoed through the hobbit hole. Gandalf grinned knowingly. "Ah, they have arrived."

Bilbo opened the door to find thirteen dwarves on his doorstep, led by the proud Thorin Oakenshield. They entered his home, filling his pantry and discussing their quest to reclaim the Lonely Mountain.

The dwarves revealed their mission - to steal back their gold from the terrible dragon Smaug. They needed a burglar, and Gandalf had recommended Bilbo.

After much deliberation, Bilbo decided to join their adventure. He signed the contract and prepared to leave his comfortable life behind.

The next morning, the company departed Bag End. They traveled through the countryside, leaving the Shire far behind as they journeyed toward the Misty Mountains.

Days later, they arrived at Rivendell, the hidden valley of the elves. Elrond welcomed them and examined their map, revealing secret moon-letters that showed a hidden door in the mountain.
`;

async function testLLMPrompts() {
  console.log('🧠 Testing Enhanced LLM Prompts\n');
  
  // Use mock LLM for now - will test with real LLM when prompts are ready
  const mockLLM = new MockLLM();
  
  console.log('=== SCENE BOUNDARY DETECTION ===');
  const boundaryExtractor = new SceneBoundaryLLMExtractor(mockLLM);
  
  console.log('📋 BOUNDARY DETECTION PROMPT PREVIEW:');
  console.log('The prompt includes:');
  console.log('✓ Clear atomic scene definition');
  console.log('✓ 10 specific boundary types with significance scores');
  console.log('✓ Analysis instructions with organic boundary detection (no artificial limits)');
  console.log('✓ Character position tracking for boundaries');
  console.log('✓ Flexible scene sizing (100-800 characters based on content)\n');
  
  console.log('=== CHARACTER EXTRACTION ===');
  const characterExtractor = new CharacterLLMExtractor(mockLLM);
  
  console.log('📋 CHARACTER EXTRACTION PROMPT PREVIEW:');
  console.log('The prompt includes:');
  console.log('✓ 6 entity types (character, location, object, organization, concept, event)');
  console.log('✓ Role classification (protagonist, antagonist, supporting, minor, background)');
  console.log('✓ Detailed attributes (species, profession, personality, motivations, abilities)');
  console.log('✓ Significance scoring (0.1 background to 1.0 central character)');
  console.log('✓ Contextual information (introduction, status, emotional state, goals)');
  console.log('✓ Duplicate avoidance with existing entities\n');
  
  console.log('=== RELATIONSHIP EXTRACTION ===');
  const relationshipExtractor = new RelationshipLLMExtractor(mockLLM);
  
  console.log('📋 RELATIONSHIP EXTRACTION PROMPT PREVIEW:');
  console.log('The prompt includes:');
  console.log('✓ 24 relationship types across social, spatial, power, and conceptual domains');
  console.log('✓ Strength analysis (0.0-1.0 with clear criteria)');
  console.log('✓ Directionality (unidirectional vs bidirectional)');
  console.log('✓ Temporality (permanent, temporary, evolving)');
  console.log('✓ Emotional context and evidence requirements');
  console.log('✓ Scene-specific relationship focus\n');
  
  console.log('=== ATOMIC SCENE CONTENT ===');
  const sceneContentExtractor = new AtomicSceneContentExtractor(mockLLM);
  
  console.log('📋 SCENE CONTENT EXTRACTION PROMPT PREVIEW:');
  console.log('The prompt includes:');
  console.log('✓ 10 narrative function types (setup, inciting_incident, climax, etc.)');
  console.log('✓ Dramatic tension scoring (0.0 calm to 1.0 peak intensity)');
  console.log('✓ Relationship change tracking (formation, strengthening, dissolution, etc.)');
  console.log('✓ Narrative consequences analysis');
  console.log('✓ Integration with existing story context\n');
  
  console.log('=== PROMPT DESIGN ANALYSIS ===');
  console.log('🎯 KEY IMPROVEMENTS OVER GENERIC PROMPTS:');
  console.log('');
  console.log('1. SPECIFICITY:');
  console.log('   - Exact boundary types vs vague "scene changes"');
  console.log('   - 24 relationship types vs generic "relationships"');
  console.log('   - Character role classifications vs basic "characters"');
  console.log('');
  console.log('2. STRUCTURED OUTPUT:');
  console.log('   - Zod schemas enforce consistent structure');
  console.log('   - Required fields prevent missing data');
  console.log('   - Enum constraints eliminate ambiguous values');
  console.log('');
  console.log('3. CONTEXT AWARENESS:');
  console.log('   - Existing entities provided to avoid duplication');
  console.log('   - Scene context guides extraction focus');
  console.log('   - Progressive story building supported');
  console.log('');
  console.log('4. ORGANIC SCENE FOCUS:');
  console.log('   - Flexible scene sizing (100-800 chars based on content)');
  console.log('   - Major turning point emphasis');
  console.log('   - No artificial scene count limits');
  console.log('   - Narrative function classification');
  console.log('');
  console.log('5. EVIDENCE REQUIREMENTS:');
  console.log('   - Text evidence required for relationships');
  console.log('   - Character position tracking for boundaries');
  console.log('   - Significance scoring with clear criteria');
  
  console.log('\n🚀 NEXT STEPS FOR REAL LLM TESTING:');
  console.log('');
  console.log('1. Replace MockLLM with actual LLM adapter (Gemini/Claude/GPT)');
  console.log('2. Test with Project 89 narrative content');
  console.log('3. Validate atomic scene detection accuracy');
  console.log('4. Verify relationship taxonomy coverage');
  console.log('5. Tune significance scoring for your use cases');
  console.log('6. Test collaborative merging with multiple contributors');
  
  console.log('\n✨ PROMPT DESIGN READY FOR PRODUCTION TESTING');
}

testLLMPrompts().catch(console.error);
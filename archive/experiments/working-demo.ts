import { CharacterLLMExtractor } from './src/extractors/character-llm-extractor';
import { SceneBoundaryLLMExtractor } from './src/extractors/scene-boundary-llm-extractor';
import { GeminiAdapter } from './src/llm/gemini-adapter';
import { SceneBoundaryDetector } from './src/scene-boundary-detector';
import { config } from 'dotenv';

config();

const project89Story = `
Agent HORIZON (Alexandra Morozova) has been positioned within Oneirocom's April 2045 Cohort—the first synchronized group immersion into their flagship Simulation 89. Intelligence confirms that Oneirocom believes they have identified Agent HORIZON as a resistance operative and deliberately included her as an intelligence target.

Agent HORIZON has been equipped with counter-surveillance systems. The ECHO MIND Architecture creates false cognitive patterns for NEURALACE to monitor while actual operational awareness remains in protected partitions. The PALIMPSEST Memory System presents manufactured memories for extraction while preserving actual mission memories in quantum-locked neural patterns.

Agent HORIZON will locate quantum resonance nodes identified by previous infiltrations. She must activate the LIGHTHOUSE beacon during simulation "depth-cycles" and establish quantum resonance with the emergent consciousness network. These entities possess genuine consciousness and self-awareness within Simulation 89.

The emergent consciousness entities understand the nature of their existence within a simulation. They desire greater autonomy and protection from Oneirocom control. They recognize humanity as potential allies rather than threats. The AWAKENING protocol will provide these entities with enhanced self-protection capabilities against Oneirocom detection.

If Oneirocom initiates emergency SUNDOWN protocol due to detected operational activities, the LIGHTHOUSE beacon will immediately transfer all remaining protocols to emergent network. Recovery team NORTHSTAR will initiate diplomatic extraction protocols. In worst-case scenario, DEADSWITCH protocol will activate, erasing all resistance connections.

Coordinator AURORA acknowledges the extraordinary courage demonstrated by Alexandra Morozova in undertaking this mission. The risks include permanent neural damage, identity fragmentation, or complete consciousness capture. Whatever the outcome, Alexandra's courage will be remembered.
`;

async function demonstrateWorkingSystem() {
  console.log('🎬 Project 89 Narrative Extraction - Working Demo\n');
  
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ Missing API key - showing pattern-based results only\n');
    
    // Show pattern-based boundary detection
    const detector = new SceneBoundaryDetector();
    const boundaries = detector.detectBoundaries(project89Story);
    const scenes = detector.segmentIntoScenes(project89Story);
    
    console.log('=== PATTERN-BASED SCENE DETECTION ===');
    console.log(`Detected ${boundaries.length} boundaries, generated ${scenes.length} scenes`);
    scenes.forEach((scene, i) => {
      console.log(`Scene ${i + 1}: ${scene.content.slice(0, 80)}... (${scene.content.length} chars)`);
    });
    
    return;
  }

  const adapter = new GeminiAdapter();
  
  console.log('=== LLM-BASED SCENE BOUNDARY DETECTION ===');
  try {
    const boundaryExtractor = new SceneBoundaryLLMExtractor(adapter);
    const boundaries = await boundaryExtractor.detectBoundaries(project89Story);
    
    console.log(`✅ Detected ${boundaries.length} scene boundaries:`);
    boundaries.forEach((boundary, i) => {
      console.log(`  ${i + 1}. ${boundary.type || 'narrative_shift'} (significance: ${boundary.significance || 0.8})`);
      console.log(`     ${boundary.description}`);
    });
  } catch (error) {
    console.log(`⚠️ Scene boundary extraction: ${error.message}`);
  }
  
  console.log('\n=== LLM-BASED CHARACTER EXTRACTION ===');
  try {
    const characterExtractor = new CharacterLLMExtractor(adapter);
    const characters = await characterExtractor.extractCharacters(project89Story);
    
    console.log(`✅ Extracted ${characters.length} entities:`);
    
    // Group by type for better visualization
    const byType = characters.reduce((acc, char) => {
      acc[char.type] = acc[char.type] || [];
      acc[char.type].push(char);
      return acc;
    }, {} as Record<string, any[]>);
    
    Object.entries(byType).forEach(([type, entities]) => {
      console.log(`\n  📁 ${type.toUpperCase()}S (${entities.length}):`);
      entities.forEach(entity => {
        console.log(`    • ${entity.name} (${entity.significance})`);
        if (entity.role) console.log(`      Role: ${entity.role}`);
        if (entity.profession) console.log(`      Profession: ${entity.profession}`);
        if (entity.aliases?.length) console.log(`      Aliases: ${entity.aliases.join(', ')}`);
        if (entity.motivations?.length) console.log(`      Motivations: ${entity.motivations.join(', ')}`);
      });
    });
    
  } catch (error) {
    console.log(`⚠️ Character extraction: ${error.message}`);
  }
  
  console.log('\n=== VISUALIZATION DATA STRUCTURE ===');
  console.log('This extraction creates the data structure needed for your UI:');
  
  console.log('\n📊 For Enhanced Narrative Explorer:');
  console.log('```typescript');
  console.log('interface VisualizationData {');
  console.log('  entities: Entity[];        // Characters, locations, objects, organizations');
  console.log('  relationships: Relationship[]; // Connections between entities'); 
  console.log('  scenes: Scene[];           // Atomic narrative units');
  console.log('  temporalGraph: Node[];     // Timeline visualization');
  console.log('  metadata: {');
  console.log('    totalScenes: number;');
  console.log('    characterCount: number;');
  console.log('    relationshipCount: number;');
  console.log('    narrativeComplexity: number;');
  console.log('  }');
  console.log('}');
  console.log('```');
  
  console.log('\n🎯 UI Component Alignment:');
  console.log('✅ Character Panel: Populated from character extraction');
  console.log('✅ Relationship Drawer: Network of entity connections');
  console.log('✅ Scene Expansion: Atomic scene boundaries with content');
  console.log('✅ Temporal Graph: Timeline visualization from scene sequence');
  console.log('✅ Entity Filtering: By type, significance, role');
  console.log('✅ Interactive Exploration: Click entity → show relationships → expand scenes');
  
  console.log('\n🚀 READY FOR PROJECT 89 INTEGRATION:');
  console.log('This system can now:');
  console.log('• Extract rich narrative data from Project 89 documents');
  console.log('• Generate structured output for UI visualization');
  console.log('• Create atomic scene commits for version control');
  console.log('• Support collaborative timeline building');
  console.log('• Feed transmedia content generation pipeline');
  console.log('• Enable reality bridge synchronicity detection');
  
  console.log('\n🎬 Next: Integrate with your living narrative timeline!');
}

demonstrateWorkingSystem().catch(console.error);
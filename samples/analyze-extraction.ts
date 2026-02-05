#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

// Analyze the current extraction and suggest improvements
function analyzeExtraction() {
  console.log('🔍 Analyzing Lovecraft Extraction Results\n');
  
  const outputDir = path.join(__dirname, 'lovecraft-output');
  const narrativePath = path.join(outputDir, 'narrative.json');
  const graphPath = path.join(outputDir, 'graph.json');
  
  // Read the extraction results
  const narrative = JSON.parse(fs.readFileSync(narrativePath, 'utf-8'));
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
  
  console.log('📊 Current Extraction Analysis:\n');
  
  // 1. Scene Analysis
  console.log('🎬 SCENES:');
  console.log(`Total scenes: ${narrative.scenes.length}`);
  narrative.scenes.slice(0, 3).forEach(scene => {
    console.log(`\n${scene.sequence}. ${scene.title}`);
    console.log(`   Location: ${scene.location || 'Not specified'}`);
    console.log(`   Description: ${scene.description}`);
    console.log(`   Characters: ${scene.characters.length} present`);
    console.log(`   Events: ${scene.events.length} events`);
  });
  
  console.log('\n❗ Scene Issues:');
  console.log('- Descriptions are too brief (single sentences)');
  console.log('- No temporal information (when scenes occur)');
  console.log('- Events lack detail and significance levels');
  console.log('- No mood/atmosphere captured');
  
  // 2. State Change Analysis
  console.log('\n🔄 STATE CHANGES:');
  console.log(`Total state changes: ${narrative.stateChanges.length}`);
  
  const changeTypes = {};
  narrative.stateChanges.forEach(change => {
    changeTypes[change.type] = (changeTypes[change.type] || 0) + 1;
  });
  
  console.log('\nChange type distribution:');
  Object.entries(changeTypes).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  console.log('\nSample state changes:');
  narrative.stateChanges.slice(0, 3).forEach(change => {
    console.log(`\n- ${change.description}`);
    console.log(`  Type: ${change.type}`);
    console.log(`  Changes object: ${JSON.stringify(change.changes)}`);
  });
  
  console.log('\n❗ State Change Issues:');
  console.log('- All changes are generic "entity_update"');
  console.log('- Empty "changes" objects (no actual data)');
  console.log('- No entity IDs to track what changed');
  console.log('- No relationship changes captured');
  console.log('- Missing critical transformations (corruption, madness)');
  
  // 3. Temporal Graph Analysis
  console.log('\n📈 TEMPORAL GRAPH:');
  console.log(`Current state entities: ${Object.keys(graph.currentState.entities).length}`);
  console.log(`Current relationships: ${Object.keys(graph.currentState.relationships).length}`);
  console.log(`History snapshots: ${Object.keys(graph.history).length}`);
  
  console.log('\n❗ Temporal Graph Issues:');
  console.log('- Graph is completely empty!');
  console.log('- No entities or relationships in the graph');
  console.log('- No historical snapshots');
  console.log('- State changes not applied to build graph evolution');
  
  // 4. Relationship Analysis
  console.log('\n🔗 RELATIONSHIPS:');
  console.log(`Total relationships: ${narrative.relationships.length}`);
  
  if (narrative.relationships.length > 0) {
    console.log('\nSample relationships:');
    narrative.relationships.slice(0, 5).forEach(rel => {
      const source = narrative.entities.find(e => e.id === rel.source)?.name || rel.source;
      const target = narrative.entities.find(e => e.id === rel.target)?.name || rel.target;
      console.log(`- ${source} → ${target} (${rel.type})`);
    });
  }
  
  // 5. What's Missing for Lovecraft
  console.log('\n🦑 LOVECRAFT-SPECIFIC GAPS:');
  console.log('\nMissing narrative elements:');
  console.log('- Progressive corruption (land → plants → animals → humans)');
  console.log('- Mental deterioration tracking');
  console.log('- The "colour" as an entity with agency');
  console.log('- Environmental state changes');
  console.log('- Knowledge/revelation progression');
  
  console.log('\nMissing graph evolution:');
  console.log('- Gardner family members disappearing (entity removal)');
  console.log('- Relationships breaking down as madness spreads');
  console.log('- New entities introduced (the colour, affected creatures)');
  console.log('- Location-based changes (well, farm, surrounding area)');
  
  // 6. Recommendations
  console.log('\n💡 RECOMMENDATIONS:\n');
  
  console.log('1. Enhanced State Changes:');
  console.log('   - Track entity properties (health, sanity, location)');
  console.log('   - Capture entity additions/removals');
  console.log('   - Record relationship formations and breaks');
  console.log('   - Include environmental changes');
  
  console.log('\n2. Detailed Scenes:');
  console.log('   - Multi-sentence descriptions');
  console.log('   - Temporal markers (dates, seasons, time progression)');
  console.log('   - Atmospheric details (mood, tension level)');
  console.log('   - Key events with significance ratings');
  
  console.log('\n3. Proper Graph Building:');
  console.log('   - Initialize with all entities');
  console.log('   - Apply state changes sequentially');
  console.log('   - Create snapshots at each significant change');
  console.log('   - Track entity/relationship history');
  
  console.log('\n4. Narrative-Specific Extraction:');
  console.log('   - Identify the "colour" as a character/force');
  console.log('   - Track corruption spread as state changes');
  console.log('   - Capture the investigation narrative arc');
  console.log('   - Note the framing device (narrator learning from Ammi)');
  
  // Save analysis
  const analysisPath = path.join(outputDir, 'extraction-analysis.txt');
  fs.writeFileSync(analysisPath, `
LOVECRAFT EXTRACTION ANALYSIS
============================

Current Issues:
- Generic state changes with no actual data
- Empty temporal graph
- Brief scene descriptions
- Missing critical narrative elements

Key Improvements Needed:
1. Track actual entity property changes
2. Build graph evolution through state changes
3. Capture relationship dynamics
4. Add temporal and atmospheric details
5. Identify non-human entities (the colour)
6. Track environmental corruption

The narrative should be represented as:
- Nodes: Characters, locations, the colour entity
- Edges: Relationships, influences, corruptions
- Evolution: Progressive deterioration and spread
`);
  
  console.log(`\n📄 Analysis saved to: ${analysisPath}`);
}

analyzeExtraction();
#!/usr/bin/env node

import { NarrativePipeline } from '../src/pipeline';
import { GeminiAdapter } from '../src/llm/gemini';
import { NarrativeStructure } from '../src/types';

// Demo: Show how incremental extraction avoids duplication

async function main() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error('❌ Please set GOOGLE_AI_API_KEY environment variable');
    process.exit(1);
  }

  console.log('🔬 Narrative Canon Deduplication Demo\n');
  
  const llm = new GeminiAdapter(apiKey);
  const pipeline = new NarrativePipeline(llm);

  // First narrative chunk
  const narrative1 = `
    Agent Chen sat in the Neo-Tokyo Sector 7 safehouse, monitoring the feeds. 
    Oneirocom Corporation's Timeline Enforcement Division was increasing patrols.
    The Convergence Protocol hummed in the background, a constant reminder of their control.
    Chen knew that the organization's grip on Timeline-Prime was tightening.
  `;

  console.log('📖 Extracting first narrative chunk...\n');
  const structure1 = await pipeline.extractNarrative(narrative1);
  
  console.log('🧠 ENTITIES FROM FIRST EXTRACTION:');
  structure1.entities.forEach(e => {
    console.log(`  • ${e.name} (${e.type}): ${e.id}`);
  });
  
  console.log('\n🔗 RELATIONSHIPS FROM FIRST EXTRACTION:');
  structure1.relationships.forEach(r => {
    console.log(`  • ${r.source} ${r.type} ${r.target}`);
  });

  // Second narrative chunk with overlapping entities
  const narrative2 = `
    The next morning, Agent Chen received intel about Oneirocom's data hub.
    The Timeline Enforcement Division had doubled their security protocols.
    Chen prepared to infiltrate the facility using the Ghost in the Machine strategy.
    Oneirocom Corporation remained unaware of the operative in Neo-Tokyo Sector 7.
  `;

  console.log('\n\n📖 Extracting second narrative chunk WITH deduplication...\n');
  const structure2 = await pipeline.extractNarrativeIncremental(narrative2, structure1);
  
  const newEntities = structure2.entities.filter(e => 
    !structure1.entities.some(e1 => e1.id === e.id)
  );
  
  const newRelationships = structure2.relationships.filter(r => 
    !structure1.relationships.some(r1 => 
      r1.source === r.source && r1.target === r.target && r1.type === r.type
    )
  );

  console.log('🆕 NEW ENTITIES (avoiding duplicates):');
  if (newEntities.length === 0) {
    console.log('  ✓ No new entities - all were already tracked!');
  } else {
    newEntities.forEach(e => {
      console.log(`  • ${e.name} (${e.type}): ${e.id}`);
    });
  }
  
  console.log('\n🆕 NEW RELATIONSHIPS (avoiding duplicates):');
  if (newRelationships.length === 0) {
    console.log('  ✓ No duplicate relationships created!');
  } else {
    newRelationships.forEach(r => {
      console.log(`  • ${r.source} ${r.type} ${r.target}`);
    });
  }

  console.log('\n📊 SUMMARY:');
  console.log(`  Total entities: ${structure2.entities.length}`);
  console.log(`  Total relationships: ${structure2.relationships.length}`);
  console.log(`  New entities added: ${newEntities.length}`);
  console.log(`  New relationships added: ${newRelationships.length}`);

  // Compare with naive extraction (no deduplication)
  console.log('\n\n⚠️  Comparing with NAIVE extraction (no deduplication)...\n');
  const naiveStructure2 = await pipeline.extractNarrative(narrative2);
  
  console.log('❌ NAIVE EXTRACTION WOULD CREATE:');
  console.log(`  ${naiveStructure2.entities.length} entities (many duplicates!)`);
  console.log(`  ${naiveStructure2.relationships.length} relationships`);
  
  console.log('\n🧠 DUPLICATED ENTITIES IN NAIVE APPROACH:');
  const duplicatedEntities = naiveStructure2.entities.filter(e2 => 
    structure1.entities.some(e1 => 
      e1.name.toLowerCase() === e2.name.toLowerCase() && e1.type === e2.type
    )
  );
  duplicatedEntities.forEach(e => {
    console.log(`  • ${e.name} (${e.type}) - DUPLICATE!`);
  });

  console.log('\n✨ Deduplication saved us from creating', duplicatedEntities.length, 'duplicate entities!');
}

main().catch(console.error);
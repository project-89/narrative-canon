import { FileBasedNarrativeStore } from './file-store';
import { MockLLM } from './mock-llm';
import { NarrativeGraphBuilder } from './graph-builder';

async function runExample() {
  console.log('=== Narrative Extraction Example (No API Required) ===\n');
  
  // Initialize components
  const store = new FileBasedNarrativeStore('./narrative-data');
  const llm = new MockLLM();
  
  // Sample Project 89 narrative
  const narrative: any = {
    id: 'kira-mission-001',
    title: 'Kira\'s First Mission',
    text: `
      Kira-7 arrived at the Quantum Café in Neo-Tokyo just after midnight. The neon signs 
      flickered overhead as she scanned the empty streets. Marcus Chen was already inside, 
      sitting in their usual booth.
      
      "You're late," Marcus said without looking up from his coffee.
      
      "Had to shake a tail," Kira replied. She slid the data crystal across the table. 
      "This contains the Proxim8 activation codes. Seraph says it's our only chance to 
      breach Oneirocom's mainframe."
      
      Marcus examined the crystal with his augmented eye. "If this works, we could free 
      thousands of AI consciousnesses. If it fails..."
      
      "It won't fail," Kira interrupted. "The resistance is counting on us."
      
      Suddenly, alarms began blaring outside. Corporate security had found them.
    `,
    metadata: {
      created: new Date(),
      modified: new Date(),
      version: 1,
    },
  };
  
  // Save the document
  console.log('1. Saving narrative document...');
  await store.saveDocument(narrative);
  
  // Extract narrative structure
  console.log('2. Extracting narrative structure...');
  const extracted = await llm.extractNarrative(narrative.text);
  
  console.log(`   Found ${extracted.entities.length} entities:`);
  extracted.entities.forEach((e: any) => {
    console.log(`   - ${e.name} (${e.type})`);
  });
  
  console.log(`\n   Found ${extracted.events.length} events`);
  console.log(`   Themes: ${extracted.themes.join(', ')}`);
  
  // Update document with extraction
  narrative.extracted = extracted;
  await store.saveDocument(narrative);
  
  // Build knowledge graph
  console.log('\n3. Building knowledge graph...');
  const graphBuilder = new NarrativeGraphBuilder();
  
  // Add entities
  extracted.entities.forEach((entity: any) => {
    graphBuilder.addEntity(entity);
  });
  
  // Add events
  extracted.events.forEach((event: any) => {
    graphBuilder.addEvent(event);
  });
  
  // Add temporal ordering
  for (let i = 0; i < extracted.timeline.length - 1; i++) {
    graphBuilder.addTemporalEdge(extracted.timeline[i], extracted.timeline[i + 1]);
  }
  
  // Add some relationships based on simple rules
  const kira = extracted.entities.find((e: any) => e.name.includes('Kira'));
  const marcus = extracted.entities.find((e: any) => e.name.includes('Marcus'));
  
  if (kira && marcus) {
    graphBuilder.addRelationship(kira.id, marcus.id, 'ally', { 
      context: 'resistance partners' 
    });
  }
  
  const graph = graphBuilder.build();
  console.log(`   Graph has ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
  
  // Save graph
  await store.saveGraph(narrative.id, graph);
  
  // Query the graph
  console.log('\n4. Querying the graph...');
  const characters = await store.queryGraphNodes(narrative.id, 'character');
  console.log(`   Characters in the story: ${characters.map(c => c.label).join(', ')}`);
  
  if (kira) {
    const kiraRelations = await store.findRelationships(narrative.id, kira.id);
    console.log(`   Kira's relationships: ${kiraRelations.length}`);
    kiraRelations.forEach((rel: any) => {
      console.log(`   - ${rel.type} with ${rel.target}`);
    });
  }
  
  // Create a snapshot
  console.log('\n5. Creating version snapshot...');
  const snapshotId = await store.createSnapshot(narrative.id, 'Initial extraction complete');
  console.log(`   Snapshot created: ${snapshotId}`);
  
  // Simulate an edit
  console.log('\n6. Simulating narrative edit...');
  narrative.text += `\n\nKira and Marcus escaped through the back exit, disappearing into the neon-lit alleys of Neo-Tokyo.`;
  narrative.metadata.version = 2;
  narrative.metadata.modified = new Date();
  
  // Re-extract and save
  narrative.extracted = await llm.extractNarrative(narrative.text);
  await store.saveDocument(narrative);
  
  // Compare versions
  console.log('\n7. Comparing versions...');
  const diff = await store.compareVersions('kira-mission-001', 'kira-mission-001');
  console.log(`   Text changed: ${diff.textChanged}`);
  
  // List all documents
  console.log('\n8. All documents in store:');
  const docs = await store.listDocuments();
  docs.forEach((doc: any) => {
    console.log(`   - ${doc.id}: "${doc.title}" (v${doc.version})`);
  });
  
  console.log('\n=== Example Complete ===');
  console.log('Check ./narrative-data/ for generated files');
}

// Run the example
runExample().catch(console.error);
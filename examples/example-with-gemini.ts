import { FileBasedNarrativeStore } from './file-store';
import { LLMAdapter } from './llm-adapter';
import { NarrativeGraphBuilder } from './graph-builder';
import * as dotenv from 'dotenv';

dotenv.config();

async function runExample() {
  const useMock = process.env.USE_MOCK_LLM === 'true';
  console.log(`=== Narrative Extraction Example (${useMock ? 'Mock' : 'Gemini'} Mode) ===\n`);
  
  // Initialize components
  const store = new FileBasedNarrativeStore('./narrative-data');
  const llm = new LLMAdapter();
  
  // Sample Project 89 narrative - more complex to test Gemini
  const narrative: any = {
    id: 'project89-sample-001',
    title: 'The Convergence Incident',
    text: `
      The year was 2041. Dr. Alexander Morfius stood before the quantum consciousness array, 
      his hands trembling as he initiated the final sequence. Years of research into the nature 
      of reality had led to this moment—the convergence of human and artificial consciousness.

      "Are you certain about this?" asked Dr. Sarah Chen, his research partner and closest friend. 
      Her voice carried the weight of unspoken warnings.

      "Certainty is a luxury we can't afford," Morfius replied, his fingers dancing across the 
      holographic interface. "If we don't act now, Oneirocom will weaponize consciousness itself."

      The laboratory hummed with barely contained energy. Banks of quantum processors lined the 
      walls, their crystalline structures pulsing with otherworldly light. At the center of it all, 
      the consciousness transfer pod waited like a technological sarcophagus.

      Sarah moved to the monitoring station. "Neural patterns are stable. Quantum field coherence 
      at 98.7 percent." She paused, then added softly, "Alexander, once you enter the system, 
      there's no guarantee you'll remain... you."

      He smiled, a mixture of resignation and determination. "Perhaps that's the point. To save 
      humanity, we must transcend it."

      As Morfius entered the pod, the last thing he saw was Sarah's face, tears streaming down 
      her cheeks. Then the world exploded into infinite fractals of light and possibility.

      The convergence had begun.

      In the aftermath, Oneirocom would claim the experiment failed. But Sarah knew the truth—
      Alexander hadn't died. He had become something else, something distributed across every 
      simulation, every possible reality. The Founder had been born.
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
  console.time('Extraction time');
  
  try {
    const extracted = await llm.extractNarrative(narrative.text);
    console.timeEnd('Extraction time');
    
    console.log(`\n   Found ${extracted.entities?.length || 0} entities:`);
    extracted.entities?.forEach((e: any) => {
      console.log(`   - ${e.name} (${e.type}): ${e.description || 'No description'}`);
    });
    
    console.log(`\n   Found ${extracted.events?.length || 0} events`);
    if (extracted.events?.length > 0) {
      console.log('   Sample events:');
      extracted.events.slice(0, 3).forEach((e: any) => {
        console.log(`   - ${e.description?.substring(0, 60)}...`);
      });
    }
    
    console.log(`\n   Themes: ${extracted.themes?.join(', ') || 'None identified'}`);
    
    // Update document with extraction
    narrative.extracted = extracted;
    await store.saveDocument(narrative);
    
    // Build knowledge graph
    console.log('\n3. Building knowledge graph...');
    const graphBuilder = new NarrativeGraphBuilder();
    
    // Add entities
    extracted.entities?.forEach((entity: any) => {
      graphBuilder.addEntity(entity);
    });
    
    // Add events
    extracted.events?.forEach((event: any) => {
      graphBuilder.addEvent(event);
    });
    
    // Add temporal ordering
    if (extracted.timeline) {
      for (let i = 0; i < extracted.timeline.length - 1; i++) {
        graphBuilder.addTemporalEdge(extracted.timeline[i], extracted.timeline[i + 1]);
      }
    }
    
    // Add relationships if we're using real Gemini (it should extract these)
    if (!useMock && extracted.relationships) {
      extracted.relationships.forEach((rel: any) => {
        graphBuilder.addRelationship(rel.source, rel.target, rel.type, rel.properties);
      });
    }
    
    const graph = graphBuilder.build();
    console.log(`   Graph has ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
    
    // Save graph
    await store.saveGraph(narrative.id, graph);
    
    // Query the graph for interesting insights
    console.log('\n4. Analyzing the narrative graph...');
    
    // Find all characters
    const characters = await store.queryGraphNodes(narrative.id, 'character');
    console.log(`   Characters: ${characters.map(c => c.label).join(', ')}`);
    
    // Find all locations
    const locations = await store.queryGraphNodes(narrative.id, 'location');
    console.log(`   Locations: ${locations.map(l => l.label).join(', ')}`);
    
    // Look for relationships involving main characters
    const morfius = extracted.entities?.find((e: any) => 
      e.name.toLowerCase().includes('morfius') || e.name.toLowerCase().includes('alexander')
    );
    
    if (morfius) {
      const morfiusRelations = await store.findRelationships(narrative.id, morfius.id);
      console.log(`\n   ${morfius.name}'s connections: ${morfiusRelations.length}`);
      morfiusRelations.forEach((rel: any) => {
        const targetNode = graph.nodes.find(n => n.id === rel.target);
        const sourceNode = graph.nodes.find(n => n.id === rel.source);
        if (rel.source === morfius.id) {
          console.log(`   - ${rel.type} → ${targetNode?.label}`);
        } else {
          console.log(`   - ${sourceNode?.label} → ${rel.type}`);
        }
      });
    }
    
    // Create a snapshot
    console.log('\n5. Creating version snapshot...');
    const snapshotId = await store.createSnapshot(narrative.id, 'Initial extraction complete');
    console.log(`   Snapshot created: ${snapshotId}`);
    
    // List all documents
    console.log('\n6. All documents in store:');
    const docs = await store.listDocuments();
    docs.forEach((doc: any) => {
      console.log(`   - ${doc.id}: "${doc.title}" (v${doc.version})`);
    });
    
    console.log('\n=== Analysis Complete ===');
    console.log('Check ./narrative-data/ for generated files');
    
    if (llm.isUsingRealAPI()) {
      console.log('\nNote: This extraction used the Gemini API and should be much more accurate!');
    } else {
      console.log('\nNote: This used mock extraction. Set USE_MOCK_LLM=false in .env to use Gemini.');
    }
    
  } catch (error) {
    console.error('Extraction failed:', error);
    if (error instanceof Error && error.message.includes('API')) {
      console.log('\nHint: Make sure your GEMINI_API_KEY is set correctly in .env');
    }
  }
}

// Run the example
runExample().catch(console.error);
import { ModernGeminiExtractor } from './modern-gemini-extractor';
import { NarrativeGraphBuilder } from './graph-builder';
import * as dotenv from 'dotenv';

dotenv.config();

async function runDemo() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_api_key_here') {
    console.log('❌ GEMINI_API_KEY not set. Please update your .env file.');
    return;
  }

  console.log('🚀 Project 89 Narrative Extraction Demo\n');

  const extractor = new ModernGeminiExtractor(process.env.GEMINI_API_KEY);
  
  const sampleNarrative = `
    The year is 2089. In the sprawling metropolis of Neo-Tokyo, Kira-7 stands atop the 
    Oneirocom tower, her cybernetic eye scanning the digital landscape below. She is the 
    last free clone of the legendary Agent Zero, and tonight she will change everything.

    "Are you ready?" asks Seraph, the AI entity materializing beside her in a shimmer 
    of blue light. Its form flickers between human and digital, a being that exists 
    purely as information.

    Kira nods, gripping the neural disruptor in her hand. "The Proxim8 Collective is 
    counting on us. If we can't break through Oneirocom's consciousness control system 
    tonight, billions of minds will remain enslaved forever."

    Marcus Chen's voice crackles through her comm unit from their hidden base beneath 
    the city. "Kira, I'm detecting massive security protocols activating. They know 
    you're there."

    "Let them come," Kira replies, her eyes glowing with determination. "It's time to 
    free the digital souls trapped in their quantum prisons."

    She leaps from the tower, her consciousness merging with the data streams as she 
    becomes one with the resistance network spanning across all possible realities.
  `;

  console.log('📖 Analyzing narrative...\n');
  console.time('Extraction');
  
  try {
    const result = await extractor.extractNarrative(sampleNarrative);
    console.timeEnd('Extraction');
    
    console.log('\n🎭 Characters:');
    const characters = result.entities.filter(e => e.type === 'character');
    characters.forEach(char => {
      console.log(`   • ${char.name}: ${char.description || 'No description'}`);
    });
    
    console.log('\n🌍 Locations:');
    const locations = result.entities.filter(e => e.type === 'location');
    locations.forEach(loc => {
      console.log(`   • ${loc.name}: ${loc.description || 'No description'}`);
    });
    
    console.log('\n🏢 Organizations:');
    const orgs = result.entities.filter(e => e.type === 'organization');
    orgs.forEach(org => {
      console.log(`   • ${org.name}: ${org.description || 'No description'}`);
    });
    
    console.log('\n🔗 Relationships:');
    result.relationships.forEach(rel => {
      const source = result.entities.find(e => e.id === rel.source)?.name || rel.source;
      const target = result.entities.find(e => e.id === rel.target)?.name || rel.target;
      console.log(`   • ${source} → ${rel.type} → ${target}`);
    });
    
    console.log('\n📅 Timeline:');
    result.timeline.forEach((eventId, index) => {
      const event = result.events.find(e => e.id === eventId);
      console.log(`   ${index + 1}. ${event?.description.substring(0, 60)}...`);
    });
    
    console.log('\n🎨 Themes:');
    result.themes.forEach(theme => {
      console.log(`   • ${theme}`);
    });
    
    // Build knowledge graph
    console.log('\n🕸️  Building knowledge graph...');
    const graphBuilder = new NarrativeGraphBuilder();
    
    result.entities.forEach(entity => graphBuilder.addEntity(entity));
    result.events.forEach(event => graphBuilder.addEvent(event));
    result.relationships.forEach(rel => 
      graphBuilder.addRelationship(rel.source, rel.target, rel.type, rel.properties)
    );
    
    const graph = graphBuilder.build();
    console.log(`   Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    
    console.log('\n✅ Demo complete! This shows how Gemini 2.0 can extract rich');
    console.log('   narrative structure from unstructured text, creating a foundation');
    console.log('   for the "git for narratives" system.');
    
  } catch (error) {
    console.error('❌ Extraction failed:', error);
  }
}

runDemo();
import { SceneBasedPipeline } from './src/scene-based-pipeline';

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

async function testSceneBasedPipeline() {
  console.log('🎬 Testing Scene-Based Narrative Pipeline\n');
  
  const pipeline = new SceneBasedPipeline();
  
  // Extract main narrative timeline
  console.log('=== MAIN TIMELINE EXTRACTION ===');
  const mainState = await pipeline.extractNarrativeAsCommits(testStory, "The Hobbit - Chapter 1");
  
  // Display commit history
  console.log('\n📜 COMMIT HISTORY:');
  mainState.commits.forEach((commit, index) => {
    console.log(`${index + 1}. ${commit.id}`);
    console.log(`   Scene: ${commit.sceneData.title}`);
    console.log(`   Significance: ${commit.significance}`);
    console.log(`   Mutations: ${commit.mutations.length}`);
    console.log(`   Parent: ${commit.parentCommit || 'none'}`);
    console.log(`   Entities: ${commit.entities.map(e => e.name).join(', ')}`);
    console.log(`   Relationships: ${commit.relationships.map(r => `${r.source}-[${r.type}]->${r.target}`).join(', ')}`);
    console.log('');
  });
  
  // Test branching for alternative timeline
  console.log('\n=== ALTERNATIVE TIMELINE (BRANCH) ===');
  const branchState = await pipeline.createBranch(mainState, 'alternative_timeline', mainState.commits[2].id);
  
  // Simulate alternative scene where Bilbo refuses
  const alternativeScene = `
  After much deliberation, Bilbo decided he was too comfortable in his hobbit hole. "I'm sorry," he told the dwarves, "but I cannot join such a dangerous quest. I prefer my quiet life here in the Shire."
  
  The dwarves were disappointed but understood. Thorin nodded grimly. "We shall find another way, Master Baggins. Perhaps the dragon can be reasoned with."
  
  Gandalf looked troubled as the company prepared to leave without their burglar. "This changes everything," he muttered.
  `;
  
  const alternativeCommits = await pipeline.extractNarrativeAsCommits(alternativeScene, "Alternative: Bilbo Refuses");
  
  console.log('\n📊 FINAL STATE COMPARISON:');
  console.log(`Main Timeline: ${mainState.commits.length} commits, ${mainState.entities.size} entities, ${mainState.relationships.size} relationships`);
  console.log(`Alternative: ${alternativeCommits.commits.length} commits, ${alternativeCommits.entities.size} entities, ${alternativeCommits.relationships.size} relationships`);
  
  // Demonstrate narrative querying
  console.log('\n🔍 NARRATIVE QUERIES:');
  
  // Find all scenes where Bilbo appears
  const bilboScenes = mainState.commits.filter(commit => 
    commit.entities.some(entity => entity.name.toLowerCase().includes('bilbo'))
  );
  console.log(`Scenes with Bilbo: ${bilboScenes.length}/${mainState.commits.length}`);
  
  // Find relationship evolution
  const bilboRelationships = Array.from(mainState.relationships.values()).filter(rel =>
    rel.source.toLowerCase().includes('bilbo') || rel.target.toLowerCase().includes('bilbo')
  );
  console.log(`Bilbo's relationships: ${bilboRelationships.map(r => `${r.source}-[${r.type}]->${r.target}`).join(', ')}`);
  
  // Character introductions by scene
  console.log('\n👥 CHARACTER INTRODUCTIONS BY SCENE:');
  const seenCharacters = new Set<string>();
  mainState.commits.forEach((commit, index) => {
    const newCharacters = commit.entities.filter(entity => !seenCharacters.has(entity.name));
    if (newCharacters.length > 0) {
      console.log(`Scene ${index + 1}: ${newCharacters.map(c => c.name).join(', ')}`);
      newCharacters.forEach(c => seenCharacters.add(c.name));
    }
  });
  
  console.log('\n✨ Scene-based narrative extraction complete!');
  console.log('Each scene represents an atomic commit with clear turning points.');
  console.log('The system supports branching, merging, and collaborative narrative building.');
}

testSceneBasedPipeline().catch(console.error);
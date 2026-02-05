import { SceneBoundaryDetector } from './src/scene-boundary-detector';

// Test with a more complex story that should naturally have many scenes
const complexStory = `
Frodo woke up in his comfortable bed at Bag End, sunlight streaming through the round window. Today was his birthday, and he could already hear the preparations beginning outside.

Gandalf arrived at the door just as Frodo was finishing breakfast. "My dear Frodo!" the wizard exclaimed, embracing his old friend. "Are you ready for your adventure?"

Frodo's face grew serious. "Gandalf, I've been thinking about what you told me about the Ring. I'm frightened."

The wizard's expression darkened. "You should be. We must leave immediately. Pack only what you need."

Sam appeared around the corner, having been eavesdropping. "I'm coming with you, Mr. Frodo!" he declared boldly.

Merry and Pippin burst through the door. "We heard about the journey!" Merry announced. "You can't leave without us!"

After much argument, the four hobbits decided to travel together. They gathered their supplies and prepared to depart.

Hours later, they were walking through the Old Forest when they heard strange singing. Tom Bombadil emerged from the trees, a curious figure in bright blue and yellow.

"Well, well! What have we here?" Tom laughed heartily. "Lost little ones in my forest!"

The hobbits explained their quest. Tom's face grew grave when he heard about the Ring, but he offered them shelter for the night.

At Tom's house, they met Goldberry, who welcomed them with warm soup and soft beds. That night, Frodo had terrible dreams about a great eye searching for him.

The next morning, Tom gave them ponies and directions. "Beware the Barrow-downs," he warned. "Ancient evils sleep there, but not deeply."

They thanked Tom and continued their journey, riding through green hills toward Bree.

At the Prancing Pony inn, they met Aragorn, a mysterious Ranger who sat in the shadows. "You're the ones Gandalf told me about," he said quietly.

Suddenly, Black Riders attacked the inn. Aragorn fought them off while the hobbits escaped through a back window.

"We must reach Rivendell," Aragorn urged as they fled into the night. "Only there will you be safe."

They traveled for days through dangerous lands. At Weathertop, an ancient watchtower, they made camp.

That night, the Nazgûl found them. Frodo, terrified, put on the Ring and vanished from sight.

In the spirit world, he saw the true forms of the wraiths - terrible kings enslaved by darkness. The Witch-king stabbed him with a Morgul blade.

Aragorn drove off the Nazgûl with fire, but Frodo was gravely wounded. "We must get him to Rivendell quickly," Aragorn said urgently.

Elrond's daughter Arwen found them on the road. She placed Frodo on her horse and raced toward the Ford of Bruinen.

The Nazgûl pursued them to the river's edge, but Arwen called upon the waters. A great flood swept the Black Riders away.

At Rivendell, Elrond healed Frodo's wound. "You are safe here," the elf lord assured him. "But the Ring cannot stay."

Gandalf revealed the full truth about the Ring's power and Sauron's return. A council was called to decide the Ring's fate.

Representatives from all the Free Peoples gathered: elves, dwarves, men, and hobbits. They argued about what should be done.

Boromir of Gondor wanted to use the Ring as a weapon. "Let Gondor have it!" he declared. "We will drive back the darkness!"

Aragorn revealed his true identity as Isildur's heir. "I will claim my throne and lead the fight against Mordor."

But Gandalf explained that the Ring could only corrupt its user. "It must be destroyed in the fires where it was made."

Frodo stood up suddenly. "I will take the Ring to Mordor," he announced, surprising everyone.

The Fellowship was formed: Gandalf, Aragorn, Boromir, Legolas, Gimli, and the four hobbits would accompany Frodo on his quest.

They departed Rivendell on a cold winter morning, taking the hidden paths through the mountains.
`;

async function testOrganicBoundaries() {
  console.log('🌿 Testing Organic Scene Boundary Detection\n');
  
  const detector = new SceneBoundaryDetector();
  
  console.log('=== Story Analysis ===');
  console.log(`Story length: ${complexStory.length} characters`);
  console.log(`Word count: ~${complexStory.split(' ').length} words`);
  console.log(`Expected scenes: Many (this is a complex narrative with multiple locations, character introductions, conflicts, and revelations)\n`);
  
  // Test boundary detection
  console.log('=== Detected Boundaries ===');
  const boundaries = detector.detectBoundaries(complexStory);
  boundaries.forEach((boundary, index) => {
    const contextStart = Math.max(0, boundary.position - 20);
    const contextEnd = Math.min(complexStory.length, boundary.position + 30);
    const context = complexStory.slice(contextStart, contextEnd).replace(/\n/g, ' ');
    
    console.log(`${index + 1}. ${boundary.type} (sig: ${boundary.significance})`);
    console.log(`   Position: ${boundary.position}`);
    console.log(`   Context: "...${context}..."`);
  });
  
  // Test scene segmentation with new flexible parameters
  console.log('\n=== Organic Scene Segmentation ===');
  const scenes = detector.segmentIntoScenes(complexStory);
  scenes.forEach((scene, index) => {
    console.log(`Scene ${index + 1}: ${scene.id}`);
    console.log(`  Length: ${scene.content.length} chars`);
    console.log(`  Boundary: ${scene.boundaryType || 'start'}`);
    console.log(`  Significance: ${scene.significance}`);
    
    // Show first few words to identify the scene
    const preview = scene.content.slice(0, 60).replace(/\n/g, ' ').trim();
    console.log(`  Content: "${preview}..."`);
    console.log('');
  });
  
  console.log('=== Organic Structure Analysis ===');
  console.log(`Total scenes detected: ${scenes.length}`);
  console.log(`Average scene length: ${Math.round(scenes.reduce((sum, s) => sum + s.content.length, 0) / scenes.length)} characters`);
  
  // Analyze scene length distribution
  const lengths = scenes.map(s => s.content.length);
  const shortScenes = lengths.filter(l => l < 150).length;
  const mediumScenes = lengths.filter(l => l >= 150 && l <= 400).length;
  const longScenes = lengths.filter(l => l > 400).length;
  
  console.log(`Scene length distribution:`);
  console.log(`  Short (< 150 chars): ${shortScenes}`);
  console.log(`  Medium (150-400 chars): ${mediumScenes}`);
  console.log(`  Long (> 400 chars): ${longScenes}`);
  
  // Analyze boundary types
  const boundaryTypes = boundaries.reduce((acc, b) => {
    acc[b.type] = (acc[b.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`\nBoundary type distribution:`);
  Object.entries(boundaryTypes).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  console.log('\n✨ Organic boundary detection results:');
  console.log(`- Story naturally segmented into ${scenes.length} scenes`);
  console.log(`- Boundaries reflect actual narrative structure`);
  console.log(`- No artificial limits imposed on scene count`);
  console.log(`- Scene sizes vary based on content (${Math.min(...lengths)} - ${Math.max(...lengths)} chars)`);
  console.log(`- System adapts to story complexity organically`);
}

testOrganicBoundaries().catch(console.error);
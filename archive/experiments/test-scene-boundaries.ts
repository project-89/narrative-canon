import { SceneBoundaryDetector, SceneBoundaryType } from './src/scene-boundary-detector';

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

async function testSceneBoundaryDetection() {
  console.log('Testing Scene Boundary Detection\n');
  
  const detector = new SceneBoundaryDetector();
  
  // Test boundary detection
  console.log('=== Detected Boundaries ===');
  const boundaries = detector.detectBoundaries(testStory);
  boundaries.forEach((boundary, index) => {
    const contextStart = Math.max(0, boundary.position - 30);
    const contextEnd = Math.min(testStory.length, boundary.position + 50);
    const context = testStory.slice(contextStart, contextEnd).replace(/\n/g, ' ');
    
    console.log(`${index + 1}. ${boundary.type} (significance: ${boundary.significance})`);
    console.log(`   Position: ${boundary.position}`);
    console.log(`   Context: "...${context}..."`);
    console.log(`   Description: ${boundary.description}\n`);
  });
  
  // Test scene segmentation
  console.log('=== Scene Segmentation ===');
  const scenes = detector.segmentIntoScenes(testStory);
  scenes.forEach((scene, index) => {
    console.log(`Scene ${index + 1}: ${scene.id}`);
    console.log(`Length: ${scene.content.length} characters`);
    console.log(`Boundary Type: ${scene.boundaryType || 'none'}`);
    console.log(`Significance: ${scene.significance}`);
    console.log(`Preview: "${scene.content.slice(0, 100).replace(/\n/g, ' ')}..."\n`);
  });
  
  // Validate expected scene structure
  console.log('=== Validation ===');
  console.log(`Total scenes detected: ${scenes.length}`);
  
  // We should have roughly these scenes:
  // 1. Bilbo's morning + Gandalf arrives
  // 2. Dwarves arrive + quest discussion  
  // 3. Decision + departure preparation
  // 4. Journey to Rivendell
  // 5. Arrival at Rivendell + map examination
  
  const expectedScenes = [
    'Bilbo morning and Gandalf arrival',
    'Dwarves arrival and quest discussion', 
    'Decision and departure preparation',
    'Journey through countryside',
    'Arrival at Rivendell'
  ];
  
  if (scenes.length >= 4 && scenes.length <= 6) {
    console.log('✅ Good scene count - story properly segmented into atomic units');
  } else {
    console.log(`❌ Unexpected scene count. Expected 4-6, got ${scenes.length}`);
  }
  
  // Check for key boundary types
  const boundaryTypes = boundaries.map(b => b.type);
  const hasArrival = boundaryTypes.includes(SceneBoundaryType.CHARACTER_ARRIVAL);
  const hasLocationChange = boundaryTypes.includes(SceneBoundaryType.LOCATION_CHANGE);
  const hasDecision = boundaryTypes.includes(SceneBoundaryType.DECISION_POINT);
  const hasTimeJump = boundaryTypes.includes(SceneBoundaryType.TIME_JUMP);
  
  console.log(`Character arrivals detected: ${hasArrival ? '✅' : '❌'}`);
  console.log(`Location changes detected: ${hasLocationChange ? '✅' : '❌'}`);
  console.log(`Decision points detected: ${hasDecision ? '✅' : '❌'}`);
  console.log(`Time jumps detected: ${hasTimeJump ? '✅' : '❌'}`);
}

testSceneBoundaryDetection().catch(console.error);
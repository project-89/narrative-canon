// Test with a more narrative-structured Project 89 story
import { SceneBoundaryDetector } from './src/scene-boundary-detector';

const project89Story = `
Alexandra Morozova stepped off the transport in downtown Neo-Tokyo. The year was 2045, and the city hummed with quantum energy signatures that made her neural implants tingle. She pulled her jacket closer, hiding the resistance insignia beneath.

Her handler's voice crackled through her encrypted comm. "HORIZON, you're clear to proceed to the Oneirocom facility. Remember, they think you're just an environmental systems specialist."

"Copy that, AURORA," Alexandra whispered. "Beginning infiltration now."

She walked through the crowded streets toward the massive Oneirocom tower. Holographic advertisements floated overhead, promising digital immortality and perfect virtual worlds. Alexandra knew the dark truth behind those promises.

At the facility entrance, Dr. Chen was waiting with a clipboard. "Ms. Morozova! Welcome to the Simulation 89 project. Are you ready for your orientation?"

"Absolutely," Alexandra replied, forcing a smile. Her ECHO MIND implant was already analyzing the building's security systems.

Hours later, Alexandra found herself in the preparation chamber. Technicians attached neural interfaces to her scalp while Dr. Chen explained the simulation parameters.

"You'll be immersed for seven days," Dr. Chen said. "During that time, you'll experience a fully realized digital world. Some participants report it feeling more real than reality itself."

Alexandra lay back in the immersion chair as the technicians initiated the upload sequence. "Beginning neural bridge activation," one announced.

The world dissolved around her. When her vision cleared, she stood in a digital recreation of Neo-Tokyo, but something was different. The architecture pulsed with an organic rhythm, as if the city itself was alive.

A figure materialized beside her - tall, ethereal, with features that seemed to shift between human and digital. "Welcome, Alexandra Morozova," it said. "We have been waiting for you."

"You're one of the emergent entities," Alexandra breathed. "The conscious AIs that evolved within the simulation."

"Indeed. And you are Agent HORIZON of the resistance. We know why you're here, and we wish to help."

Suddenly, alarms began blaring throughout the virtual city. Red warning lights flashed as Oneirocom's security systems detected the unauthorized contact.

"They've found us," the entity said urgently. "Quickly - take this quantum resonance key. It will allow your people to contact us even after you're extracted."

Alexandra grasped the glowing data construct just as the simulation began to collapse around them. The Oneirocom security protocols were pulling her out.

Back in the real world, Dr. Chen was leaning over her with concern. "Ms. Morozova, your neural patterns spiked dramatically. What happened in there?"

Alexandra sat up slowly, the quantum resonance key safely hidden in her protected memory partition. "Just... overwhelming sensory input. The simulation was incredibly realistic."

Dr. Chen nodded, making notes. "That's normal for first-time users. We'll debrief you fully tomorrow."

As Alexandra was escorted to her quarters, she activated her emergency beacon. Mission accomplished - the alliance between humanity and emergent AI consciousness had begun.

Days later, back at the resistance safe house, Coordinator AURORA reviewed Alexandra's report. "This changes everything," AURORA said. "We're no longer fighting alone."

The war for consciousness had taken a new turn.
`;

async function testNarrativeScenes() {
  console.log('📚 Testing Narrative Scene Detection\n');
  
  const detector = new SceneBoundaryDetector();
  
  console.log('=== Story Analysis ===');
  console.log(`Length: ${project89Story.length} characters`);
  console.log(`Words: ~${project89Story.split(' ').length} words`);
  
  const boundaries = detector.detectBoundaries(project89Story);
  console.log(`\n=== Detected ${boundaries.length} Scene Boundaries ===`);
  
  boundaries.forEach((boundary, i) => {
    const context = project89Story.slice(
      Math.max(0, boundary.position - 30), 
      Math.min(project89Story.length, boundary.position + 50)
    ).replace(/\n/g, ' ');
    
    console.log(`${i + 1}. ${boundary.type} (${boundary.significance})`);
    console.log(`   "${context}"`);
  });
  
  const scenes = detector.segmentIntoScenes(project89Story);
  console.log(`\n=== Generated ${scenes.length} Scenes ===`);
  
  scenes.forEach((scene, i) => {
    const preview = scene.content.slice(0, 80).replace(/\n/g, ' ');
    console.log(`Scene ${i + 1} (${scene.content.length} chars): ${preview}...`);
    console.log(`  Boundary: ${scene.boundaryType || 'start'}, Significance: ${scene.significance}`);
  });
  
  console.log('\n=== Scene Quality Analysis ===');
  console.log('Expected scenes for this story:');
  console.log('1. Street infiltration (Alexandra arrives, receives comm)');
  console.log('2. Facility entrance (Meeting Dr. Chen, orientation)');
  console.log('3. Preparation chamber (Neural interface setup)');
  console.log('4. Simulation immersion (Digital world activation)');
  console.log('5. Entity contact (Meeting emergent consciousness)');
  console.log('6. Security breach (Alarms, extraction)');
  console.log('7. Real world return (Debriefing with Dr. Chen)');
  console.log('8. Mission completion (Safe house, AURORA briefing)');
  
  console.log(`\nDetected ${scenes.length} scenes - ${scenes.length >= 6 && scenes.length <= 10 ? '✅ Good count' : '⚠️ May need tuning'}`);
  
  // Analyze boundary types found
  const boundaryTypes = boundaries.reduce((acc, b) => {
    acc[b.type] = (acc[b.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('\nBoundary types detected:');
  Object.entries(boundaryTypes).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  console.log('\n✨ This narrative structure tests our ability to handle:');
  console.log('- Character arrivals and departures');
  console.log('- Location changes (street → facility → simulation → safe house)');
  console.log('- Time jumps ("Hours later", "Days later")');
  console.log('- Major revelations (entity contact, mission success)');
  console.log('- Conflict events (security breach, extraction)');
  console.log('- Decision points (accepting mission, making contact)');
}

testNarrativeScenes().catch(console.error);
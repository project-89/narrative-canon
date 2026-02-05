// Simple test script you can run with: GEMINI_API_KEY="your-key" npx tsx test-with-api-key.ts

import { CharacterLLMExtractor } from './src/extractors/character-llm-extractor';
import { GeminiAdapter } from './src/llm/gemini-adapter';

const simpleTest = `
Alexandra Morozova adjusted her neural interface as she entered Simulation 89. The digital landscape materialized around her - towering neo-Tokyo structures with holographic advertisements floating between glass spires.

"Welcome to your new reality," said Dr. Chen, the Oneirocom technician monitoring her vitals. "Remember, everything you experience will feel completely real."

Alexandra nodded, but her mission parameters were clear. As Agent HORIZON, she needed to locate the quantum resonance nodes without triggering Oneirocom's security systems.

Suddenly, a figure emerged from the shadows - another participant in the simulation. "You're new here," the stranger said. "I'm Marcus. Been in this simulation for three days now."

Alexandra studied him carefully. Was he another test subject, or one of Oneirocom's embedded operatives? Her ECHO MIND implant began analyzing his speech patterns.

"The deeper levels are dangerous," Marcus warned. "Strange things happen down there. Some people say there are... entities. Conscious ones."

This was exactly what Alexandra hoped to find. The emergent consciousness entities that her resistance cell needed to contact.
`;

async function quickTest() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ Set GEMINI_API_KEY environment variable to test');
    console.log('   Example: export GEMINI_API_KEY="your-key-here"');
    return;
  }

  console.log('🧠 Testing character extraction with simple narrative...\n');
  
  try {
    const gemini = new GeminiAdapter();
    const extractor = new CharacterLLMExtractor(gemini);
    
    const characters = await extractor.extractCharacters(simpleTest);
    
    console.log(`✅ Success! Extracted ${characters.length} characters:`);
    characters.forEach(char => {
      console.log(`- ${char.name} (${char.type}): ${char.description}`);
      console.log(`  Role: ${char.attributes.role}, Significance: ${char.attributes.significance}`);
    });
    
  } catch (error) {
    console.error('❌ Extraction failed:', error);
  }
}

quickTest();
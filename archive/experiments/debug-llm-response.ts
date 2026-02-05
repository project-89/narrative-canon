import { CharacterLLMExtractor } from './src/extractors/character-llm-extractor';
import { GeminiAdapter } from './src/llm/gemini-adapter';
import { config } from 'dotenv';

config();

const simpleTest = `Alexandra Morozova is an environmental systems specialist working undercover as Agent HORIZON for the resistance. She has been positioned within Oneirocom's Simulation 89 to establish contact with emergent AI entities.`;

async function debugResponse() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ No API key found');
    return;
  }

  console.log('🧪 Debug: Testing what Gemini actually returns\n');

  try {
    const gemini = new GeminiAdapter();
    const extractor = new CharacterLLMExtractor(gemini);
    
    console.log('🔍 Input text:', simpleTest);
    console.log('\n📝 Making extraction request...');
    
    const characters = await extractor.extractCharacters(simpleTest);
    
    console.log('\n✅ Success! Characters extracted:');
    console.log(JSON.stringify(characters, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error occurred:', error.message);
    
    // If it's a schema validation error, the details are already logged by our adapter
    if (error.name !== 'ZodError') {
      console.error('Full error:', error);
    }
  }
}

debugResponse();
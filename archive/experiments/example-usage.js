#!/usr/bin/env node

/**
 * Example usage of the Narrative Canon system
 * Demonstrates the narrative extraction pipeline and integration
 */

// Use dynamic imports to handle ES modules
async function runExample() {
  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║        NARRATIVE CANON - PROJECT 89 EDITION              ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    console.log('📚 Example Usage Guide\n');
    
    // Check if we have required dependencies
    const hasGeminiKey = !!process.env.GOOGLE_AI_API_KEY;
    
    console.log('## Basic Usage\n');
    console.log('```javascript');
    console.log('// Import the narrative extraction system');
    console.log("import { NarrativePipeline } from './dist/pipeline.js';");
    console.log("import { GeminiAdapter } from './dist/llm/gemini.js';");
    console.log("import { MockLLMAdapter } from './dist/llm/mock.js';");
    console.log('');
    console.log('// Initialize with your preferred LLM');
    console.log('const adapter = process.env.GOOGLE_AI_API_KEY');
    console.log('  ? new GeminiAdapter(process.env.GOOGLE_AI_API_KEY)');
    console.log('  : new MockLLMAdapter();');
    console.log('');
    console.log('// Create pipeline');
    console.log('const pipeline = new NarrativePipeline(adapter);');
    console.log('');
    console.log('// Extract narrative elements');
    console.log('const narrative = await pipeline.extractNarrative(text);');
    console.log('```\n');
    
    console.log('## Extracted Data Structure\n');
    console.log('The pipeline extracts:');
    console.log('- **Entities**: Characters, locations, organizations, objects');
    console.log('- **Relationships**: Connections between entities');
    console.log('- **Scenes**: Sequential narrative segments');
    console.log('- **State Changes**: How entities evolve through the story');
    console.log('- **Timeline Data**: For stories with temporal elements\n');
    
    console.log('## Timeline Warfare Game\n');
    console.log('The narrative extraction powers a timeline manipulation game:');
    console.log('- Dynamic mission generation from your stories');
    console.log('- AI-powered narrative responses');
    console.log('- Timeline branching based on player choices\n');
    
    console.log('## Available Commands\n');
    console.log('1. Extract narrative from text file:');
    console.log('   ```bash');
    console.log('   node extract.js story.txt');
    console.log('   ```\n');
    
    console.log('2. Run extraction with visualization:');
    console.log('   ```bash');
    console.log('   node run-extraction.js');
    console.log('   ```\n');
    
    console.log('3. Play Timeline Warfare (simple version):');
    console.log('   ```bash');
    console.log('   node timeline-warfare-simple-gemini.js');
    console.log('   ```\n');
    
    console.log('4. Use the CLI tool:');
    console.log('   ```bash');
    console.log('   npx narrative-canon extract story.txt');
    console.log('   ```\n');
    
    if (!hasGeminiKey) {
      console.log('⚠️  Note: Set GOOGLE_AI_API_KEY environment variable for AI features\n');
      console.log('   Without it, the system uses mock data for demonstration.\n');
    }
    
    console.log('## Project 89 Integration\n');
    console.log('This system is designed for the Project 89 narrative universe:');
    console.log('- Extract resistance operations from mission reports');
    console.log('- Track timeline divergences and convergences');
    console.log('- Map the network of agents and their relationships');
    console.log('- Identify glitches and reality anomalies\n');
    
    console.log('## Technical Architecture\n');
    console.log('```');
    console.log('┌─────────────────┐     ┌──────────────┐');
    console.log('│  Text Input     │────▶│  Extractors  │');
    console.log('└─────────────────┘     └──────────────┘');
    console.log('                               │');
    console.log('                               ▼');
    console.log('                        ┌──────────────┐');
    console.log('                        │  LLM Adapter │');
    console.log('                        └──────────────┘');
    console.log('                               │');
    console.log('                               ▼');
    console.log('                        ┌──────────────┐');
    console.log('                        │   Pipeline   │');
    console.log('                        └──────────────┘');
    console.log('                               │');
    console.log('                               ▼');
    console.log('                 ┌─────────────┴─────────────┐');
    console.log('                 │                           │');
    console.log('           ┌─────▼──────┐           ┌───────▼────────┐');
    console.log('           │  JSON Data │           │ Visualizations │');
    console.log('           └────────────┘           └────────────────┘');
    console.log('```\n');
    
    console.log('## Next Steps\n');
    console.log('1. Set up your Gemini API key:');
    console.log('   ```bash');
    console.log('   export GOOGLE_AI_API_KEY="your-key-here"');
    console.log('   ```\n');
    
    console.log('2. Try extracting from a sample story:');
    console.log('   ```bash');
    console.log('   echo "Alice infiltrated Oneirocom..." > test.txt');
    console.log('   node extract.js test.txt');
    console.log('   ```\n');
    
    console.log('3. Explore the Timeline Warfare game:');
    console.log('   ```bash');
    console.log('   node timeline-warfare-simple-gemini.js');
    console.log('   ```\n');
    
    console.log('Happy narrative hacking! 🚀\n');
    
  } catch (error) {
    console.error('Error in example:', error);
  }
}

// Run the example
runExample();
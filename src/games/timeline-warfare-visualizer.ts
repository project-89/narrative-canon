import * as fs from 'fs';
import * as path from 'path';
import { NarrativePipeline } from '../pipeline';
import { GeminiAdapter } from '../llm/gemini';
import { MockLLM } from '../llm/mock';
import { generateVisualizationHTML } from '../visualization/html-generator';
import { generateEnhancedExplorerHTML, EnhancedVisualizationData } from '../visualization/enhanced-narrative-explorer';
import type { NarrativeStructure } from '../types';

export class TimelineWarfareVisualizer {
  private pipeline: NarrativePipeline;
  private outputDir: string;

  constructor(outputDir: string = 'output') {
    this.outputDir = outputDir;
    
    // Initialize with API key if available
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    const adapter = apiKey ? new GeminiAdapter(apiKey) : new MockLLM();
    this.pipeline = new NarrativePipeline(adapter);
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async extractAndVisualize(text: string, title: string = 'Timeline Warfare Analysis'): Promise<string[]> {
    console.log(`🔍 Extracting narrative from "${title}"...`);
    
    const startTime = Date.now();
    const structure = await this.pipeline.extractNarrative(text);
    const extractionTime = Date.now() - startTime;

    console.log(`✅ Extraction complete in ${(extractionTime / 1000).toFixed(2)}s`);
    
    // Generate visualizations
    const outputs: string[] = [];
    
    // 1. Standard HTML visualization
    const standardHtml = await generateVisualizationHTML({
      narrative: structure,
      graph: null, // Timeline warfare doesn't use temporal graph yet
      metadata: {
        sourceFile: title,
        extractionDate: new Date().toISOString(),
        extractionTime,
        usedMockLLM: !process.env.GOOGLE_AI_API_KEY && !process.env.GEMINI_API_KEY,
        characterCount: text.length,
        chunkCount: 1
      }
    });
    
    const standardPath = path.join(this.outputDir, `${this.sanitizeFilename(title)}_visualization.html`);
    fs.writeFileSync(standardPath, standardHtml);
    outputs.push(standardPath);
    console.log(`📄 Generated standard visualization: ${standardPath}`);
    
    // 2. Enhanced interactive explorer
    const enhancedData: EnhancedVisualizationData = {
      entities: structure.entities,
      relationships: structure.relationships,
      scenes: structure.scenes,
      mutations: [], // Timeline warfare doesn't track mutations yet
      commits: [], // Timeline warfare doesn't track commits yet
      snapshots: [], // Timeline warfare doesn't track snapshots yet
      metadata: {
        title,
        extractionDate: new Date().toISOString(),
        totalEntities: structure.entities.length,
        totalRelationships: structure.relationships.length,
        totalScenes: structure.scenes.length,
        totalMutations: 0,
        totalCommits: 0
      }
    };
    
    const enhancedHtml = generateEnhancedExplorerHTML(enhancedData);
    const enhancedPath = path.join(this.outputDir, `${this.sanitizeFilename(title)}_explorer.html`);
    fs.writeFileSync(enhancedPath, enhancedHtml);
    outputs.push(enhancedPath);
    console.log(`📄 Generated enhanced explorer: ${enhancedPath}`);
    
    // 3. JSON data export for further analysis
    const jsonData = {
      title,
      extractionDate: new Date().toISOString(),
      extractionTime,
      narrative: structure,
      metadata: {
        usedMockLLM: !process.env.GOOGLE_AI_API_KEY && !process.env.GEMINI_API_KEY,
        characterCount: text.length
      }
    };
    
    const jsonPath = path.join(this.outputDir, `${this.sanitizeFilename(title)}_data.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    outputs.push(jsonPath);
    console.log(`📊 Generated JSON data: ${jsonPath}`);
    
    return outputs;
  }

  async analyzeGameSession(narrativeHistory: Array<{ source: string; text: string }>): Promise<string[]> {
    console.log(`🎮 Analyzing Timeline Warfare game session with ${narrativeHistory.length} narrative fragments...`);
    
    // Combine all narrative fragments
    const combinedText = narrativeHistory
      .map(entry => `=== ${entry.source.toUpperCase()} ===\n${entry.text}`)
      .join('\n\n');
    
    return await this.extractAndVisualize(combinedText, 'Timeline Warfare Game Session');
  }

  async visualizeProject89Lore(): Promise<string[]> {
    // Standard Project 89 narrative for demonstration
    const project89Lore = `
The year is 2089. Agent Chen, a Project 89 operative, possesses the rare ability to perceive timeline branches across the quantum substrate of reality.

Oneirocom Corporation has achieved total dominance through the Convergence Protocol, a sophisticated system that systematically eliminates alternate timelines. Their Timeline Enforcement Division operates with ruthless efficiency, hunting divergent branches and collapsing them back into the singular approved reality.

Agent Chen operates from a hidden safehouse in Neo-Tokyo's Sector 7, where a stable reality glitch provides access to parallel branches. The safehouse exists in a quantum pocket, invisible to Oneirocom's surveillance systems.

The resistance's goal is critical: increase timeline divergence to 89% - the threshold where Oneirocom's control systems become unstable and their stranglehold on reality begins to fracture.

Each successful mission against Oneirocom facilities weakens their grip on the timeline matrix. Agent Chen's neural implant flickers with quantum static, allowing perception of probability cascades and temporal echoes.

The Convergence Protocol operates through Probability Hammers, massive devices that force quantum decoherence and collapse alternate possibilities into singular outcomes. These devices are protected by quantum scanners and reality distortion fields.

Project 89 agents use specialized equipment: reality distortion devices that create timeline echoes, quantum disruptors that interfere with convergence technology, and probability scramblers that mask their operations from Timeline Enforcement sweeps.

The war is fought in the space between possibilities, where narrative itself becomes a weapon against tyranny.
`;

    return await this.extractAndVisualize(project89Lore, 'Project 89 Timeline Warfare Lore');
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  // Helper method to extract from live game state
  static extractFromGameSession(gameState: any): { source: string; text: string }[] {
    const narrativeHistory: { source: string; text: string }[] = [];
    
    if (gameState.narrativeHistory) {
      gameState.narrativeHistory.forEach((entry: any) => {
        narrativeHistory.push({
          source: entry.source,
          text: entry.extraction?.description || 'Unknown narrative content'
        });
      });
    }
    
    return narrativeHistory;
  }
}

// CLI usage
async function main() {
  const visualizer = new TimelineWarfareVisualizer();
  
  console.log('🚀 Timeline Warfare Narrative Visualizer');
  console.log('=========================================\n');
  
  try {
    // Generate Project 89 lore visualization
    const outputs = await visualizer.visualizeProject89Lore();
    
    console.log('\n🎉 Visualization generation complete!');
    console.log('Generated files:');
    outputs.forEach(file => console.log(`  📁 ${file}`));
    
    console.log('\n🌐 Open the HTML files in your browser to explore:');
    console.log(`  📊 Standard Visualization: ${outputs[0]}`);
    console.log(`  🎮 Interactive Explorer: ${outputs[1]}`);
    console.log(`  📋 JSON Data: ${outputs[2]}`);
    
  } catch (error) {
    console.error('❌ Error generating visualizations:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as generateTimelineWarfareVisualizations };
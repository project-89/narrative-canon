#!/usr/bin/env ts-node

import { NarrativePipeline } from '../src/pipeline';
import { UnifiedLLMAdapter } from '../src/llm/adapter';
import { CharacterExtractor } from '../src/extractors/character';
import { EnhancedSceneExtractor } from '../src/extractors/enhanced-scene-extractor';
import { RelationshipExtractor } from '../src/extractors/relationship-extractor';
import { EnhancedStateChangeExtractor } from '../src/extractors/enhanced-state-change-extractor';
import { TemporalGraphBuilder } from '../src/graph/temporal';
import { generateVisualizationHTML } from '../src/visualization/html-generator';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Enhanced pipeline that captures narrative as graph evolution
class EnhancedNarrativePipeline extends NarrativePipeline {
  private characterExtractor: CharacterExtractor;
  private sceneExtractor: EnhancedSceneExtractor;
  private relationshipExtractor: RelationshipExtractor;
  private stateChangeExtractor: EnhancedStateChangeExtractor;

  constructor(llmAdapter: any) {
    super(llmAdapter);
    this.characterExtractor = new CharacterExtractor(llmAdapter);
    this.sceneExtractor = new EnhancedSceneExtractor(llmAdapter);
    this.relationshipExtractor = new RelationshipExtractor(llmAdapter);
    this.stateChangeExtractor = new EnhancedStateChangeExtractor(llmAdapter);
  }

  async extractNarrative(text: string) {
    console.log('📖 Starting enhanced narrative extraction...');
    
    // Phase 1: Extract characters with full details
    console.log('  Phase 1: Extracting characters...');
    const characters = await this.characterExtractor.extractCharacters(text);
    const entities = characters.map(char => ({
      id: char.id,
      name: char.name,
      type: 'character',
      description: char.description,
      aliases: char.aliases,
      firstMention: char.firstMention,
      properties: {
        mental_state: 'normal',
        physical_state: 'healthy',
        location: 'unknown'
      }
    }));

    // Phase 2: Extract detailed scenes
    console.log('  Phase 2: Extracting detailed scenes...');
    const scenes = await this.sceneExtractor.extractScenes(text, entities);

    // Phase 3: Extract relationships
    console.log('  Phase 3: Identifying relationships...');
    const relationships = await this.relationshipExtractor.extractRelationships(
      text, entities, scenes
    );

    // Phase 4: Extract meaningful state changes
    console.log('  Phase 4: Tracking narrative state changes...');
    const stateChanges = await this.stateChangeExtractor.extractStateChanges(
      text, scenes, entities
    );

    // Phase 5: Build chronology
    console.log('  Phase 5: Building chronology...');
    const chronology = this.buildEnhancedChronology(scenes, stateChanges, relationships);

    console.log('✅ Enhanced extraction complete!');
    
    return {
      entities,
      scenes,
      relationships: relationships.map((rel, idx) => ({
        id: rel.id || `rel_${idx}`,
        source: rel.source,
        target: rel.target,
        type: rel.type,
        description: rel.description,
        strength: rel.strength || 1,
        firstMentioned: rel.firstMentioned
      })),
      stateChanges,
      chronology: {
        events: chronology,
        timeline: chronology.map(e => e.id)
      },
      themes: this.extractThemes(text),
      metadata: {
        extractionDate: new Date().toISOString(),
        textLength: text.length,
        method: 'enhanced'
      }
    };
  }

  private buildEnhancedChronology(scenes: any[], stateChanges: any[], relationships: any[]) {
    const events: any[] = [];
    let sequence = 1;

    // Interleave scenes, state changes, and relationship formations
    scenes.forEach(scene => {
      // Add scene start
      events.push({
        sequence: sequence++,
        type: 'scene',
        id: scene.id,
        title: scene.title,
        description: scene.description,
        location: scene.location,
        participants: scene.characters,
        timestamp: scene.timeframe
      });

      // Add state changes for this scene
      const sceneChanges = stateChanges.filter(sc => sc.sceneId === scene.id);
      sceneChanges.forEach(change => {
        events.push({
          sequence: sequence++,
          type: 'state_change',
          id: `change_${sequence}`,
          changeType: change.changes.type,
          description: change.description,
          entities: [change.entityId, change.changes.targetEntity].filter(Boolean),
          impact: change.changes.impact
        });
      });

      // Add new relationships formed in this scene
      const sceneRelationships = relationships.filter(rel => 
        rel.firstMentioned >= scene.sequence - 1 && rel.firstMentioned < scene.sequence
      );
      sceneRelationships.forEach(rel => {
        events.push({
          sequence: sequence++,
          type: 'relationship',
          id: `rel_event_${sequence}`,
          description: `${rel.source} and ${rel.target} form ${rel.type} relationship`,
          participants: [rel.source, rel.target]
        });
      });
    });

    return events;
  }

  private extractThemes(text: string): string[] {
    // For Lovecraft, common themes
    const themes = [];
    if (text.toLowerCase().includes('cosmic')) themes.push('cosmic horror');
    if (text.toLowerCase().includes('madness')) themes.push('madness');
    if (text.toLowerCase().includes('ancient')) themes.push('ancient knowledge');
    if (text.toLowerCase().includes('transformation')) themes.push('transformation');
    if (text.toLowerCase().includes('color') || text.toLowerCase().includes('colour')) {
      themes.push('alien influence');
    }
    return themes;
  }
}

async function extractEnhancedLovecraft() {
  console.log('🦑 Enhanced Lovecraft Narrative Extraction\n');
  
  try {
    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    const useMock = !apiKey;
    
    if (useMock) {
      console.log('⚠️  No API key found, using mock LLM\n');
    }
    
    // Read the story
    const storyFile = path.join(__dirname, 'lovecraft-story.txt');
    const content = fs.readFileSync(storyFile, 'utf-8');
    
    console.log(`📖 Loaded story: ${content.length.toLocaleString()} characters`);
    console.log(`📜 "${content.split('\n')[0]}"\n`);
    
    // Create enhanced pipeline
    const adapter = new UnifiedLLMAdapter(apiKey, useMock);
    const pipeline = new EnhancedNarrativePipeline(adapter);
    
    // Extract narrative
    const startTime = Date.now();
    const narrative = await pipeline.extractNarrative(content);
    const duration = Date.now() - startTime;
    
    console.log(`\n⏱️  Extraction completed in ${(duration / 1000).toFixed(1)}s`);
    
    // Build proper temporal graph
    console.log('\n🕸️ Building temporal graph with full history...');
    const graphBuilder = new TemporalGraphBuilder();
    
    // Initialize graph with entities
    narrative.entities.forEach(entity => {
      graphBuilder.addEntity(entity);
    });
    
    // Add initial relationships
    narrative.relationships.forEach(rel => {
      graphBuilder.addRelationship(rel);
    });
    
    // Apply state changes to build history
    narrative.stateChanges.forEach(change => {
      graphBuilder.applyStateChange(change);
    });
    
    const temporalGraph = graphBuilder.build();
    
    // Create enhanced output
    const outputDir = path.join(__dirname, 'lovecraft-enhanced-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save narrative and graph
    fs.writeFileSync(
      path.join(outputDir, 'narrative.json'),
      JSON.stringify(narrative, null, 2)
    );
    fs.writeFileSync(
      path.join(outputDir, 'temporal-graph.json'),
      JSON.stringify({
        sequences: temporalGraph.sequences,
        snapshots: Array.from(temporalGraph.graphSnapshots.entries()),
        stateChanges: temporalGraph.stateChanges,
        entityHistory: Array.from(temporalGraph.entityHistory.entries()),
        relationshipHistory: Array.from(temporalGraph.relationshipHistory.entries())
      }, null, 2)
    );
    
    // Generate visualization with enhanced data
    const html = await generateVisualizationHTML({
      narrative,
      graph: temporalGraph,
      metadata: {
        sourceFile: 'lovecraft-story.txt',
        extractionDate: new Date().toISOString(),
        extractionTime: duration,
        usedMockLLM: useMock,
        characterCount: content.length,
        method: 'enhanced'
      }
    });
    
    const htmlPath = path.join(outputDir, 'enhanced-visualization.html');
    fs.writeFileSync(htmlPath, html);
    
    // Display summary
    console.log('\n📊 Enhanced Extraction Summary:');
    console.log(`  • Characters: ${narrative.entities.length}`);
    console.log(`  • Detailed Scenes: ${narrative.scenes.length}`);
    console.log(`  • Relationships: ${narrative.relationships.length}`);
    console.log(`  • State Changes: ${narrative.stateChanges.length}`);
    console.log(`  • Timeline Events: ${narrative.chronology.events.length}`);
    console.log(`  • Graph Snapshots: ${temporalGraph.sequences.length}`);
    console.log(`  • Themes: ${narrative.themes.join(', ')}`);
    
    console.log('\n📁 Files saved to:', outputDir);
    console.log('🌐 Opening enhanced visualization...');
    
    const { exec } = require('child_process');
    exec(`open "${htmlPath}"`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

extractEnhancedLovecraft();
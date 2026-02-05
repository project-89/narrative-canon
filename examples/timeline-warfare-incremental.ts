#!/usr/bin/env node

/**
 * Timeline Warfare with Incremental Narrative Building
 * 
 * This version demonstrates how the narrative canon builds incrementally
 * as players progress through missions, avoiding entity duplication.
 */

import { NarrativePipeline } from '../src/pipeline';
import { GeminiAdapter } from '../src/llm/gemini';
import { NarrativeStructure } from '../src/types';
import { MongoNarrativeAdapter } from '../src/storage/mongodb-adapter';
import * as readline from 'readline';
import chalk from 'chalk';

interface GameState {
  narrativeStructure: NarrativeStructure;
  missionCount: number;
  timeline: string;
}

class IncrementalTimelineWarfare {
  private pipeline: NarrativePipeline;
  private storage?: MongoNarrativeAdapter;
  private gameState: GameState;
  private rl: readline.Interface;

  constructor(private llm: GeminiAdapter) {
    this.pipeline = new NarrativePipeline(llm);
    this.gameState = {
      narrativeStructure: {
        entities: [],
        scenes: [],
        relationships: [],
        stateChanges: [],
        chronology: { events: [], timeline: [] },
        themes: [],
        metadata: {}
      },
      missionCount: 0,
      timeline: 'Timeline-Prime'
    };
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async initializeStorage() {
    if (process.env.MONGODB_URI) {
      try {
        this.storage = new MongoNarrativeAdapter(process.env.MONGODB_URI);
        await this.storage.connect();
        console.log(chalk.green('✓ Connected to MongoDB for persistent storage'));
      } catch (error) {
        console.warn(chalk.yellow('⚠️ MongoDB not available, using in-memory storage only'));
      }
    }
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  async showIntro() {
    console.clear();
    console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════════════════════════╗
║          TIMELINE WARFARE: INCREMENTAL NARRATIVE             ║
╟──────────────────────────────────────────────────────────────╢
║  Watch as the narrative canon builds incrementally without   ║
║  creating duplicate entities or relationships!               ║
╚══════════════════════════════════════════════════════════════╝
    `));

    console.log(chalk.yellow('\n📚 This demo shows how narrative extraction:'));
    console.log('  • Tracks entities across multiple missions');
    console.log('  • Avoids creating duplicate entities');
    console.log('  • Builds relationships incrementally');
    console.log('  • Maintains a coherent narrative structure\n');

    await this.prompt('Press ENTER to begin...');
  }

  async generateMission(): Promise<string> {
    const missionTemplates = [
      "Agent Chen infiltrates Oneirocom's {location} to {objective}. They encounter {obstacle} and must {action}.",
      "The Timeline Enforcement Division launches Operation {codename} targeting {target}. Agent Chen must {action} before {consequence}.",
      "A reality glitch in {location} reveals {discovery}. Chen investigates and finds {revelation} about the Convergence Protocol.",
      "Oneirocom deploys new {technology} in {location}. Chen teams up with {ally} to {objective}.",
      "Timeline divergence detected at {location}. Chen discovers {entity} is {action} to {objective}."
    ];

    const locations = ['Neo-Tokyo Sector 7', 'data hub', 'quantum lab', 'temporal nexus', 'safehouse'];
    const objectives = ['steal classified data', 'sabotage the protocol', 'rescue an operative', 'plant false intel', 'decode transmissions'];
    const obstacles = ['enhanced security', 'temporal anomalies', 'double agents', 'reality distortions', 'TED patrols'];
    const actions = ['improvise a solution', 'call for backup', 'use stealth', 'trigger a diversion', 'hack the system'];

    const template = missionTemplates[Math.floor(Math.random() * missionTemplates.length)];
    
    // Simple template replacement
    let mission = template
      .replace('{location}', locations[Math.floor(Math.random() * locations.length)])
      .replace('{objective}', objectives[Math.floor(Math.random() * objectives.length)])
      .replace('{obstacle}', obstacles[Math.floor(Math.random() * obstacles.length)])
      .replace('{action}', actions[Math.floor(Math.random() * actions.length)])
      .replace('{codename}', `Phantom-${Math.floor(Math.random() * 100)}`)
      .replace('{target}', 'resistance cells')
      .replace('{consequence}', 'timeline collapse')
      .replace('{discovery}', 'hidden data streams')
      .replace('{revelation}', 'shocking truth')
      .replace('{technology}', 'Probability Hammers')
      .replace('{ally}', 'a rogue TED officer')
      .replace('{entity}', 'a rival faction');

    return mission;
  }

  async executeMission() {
    this.gameState.missionCount++;
    
    console.clear();
    console.log(chalk.cyan.bold(`\n🎯 MISSION ${this.gameState.missionCount}\n`));
    
    const missionNarrative = await this.generateMission();
    console.log(chalk.white(missionNarrative));
    console.log(chalk.gray('\n─'.repeat(60) + '\n'));

    console.log(chalk.yellow('📖 Extracting narrative elements...'));
    
    // Extract incrementally to avoid duplicates
    const newStructure = await this.pipeline.extractNarrativeIncremental(
      missionNarrative,
      this.gameState.narrativeStructure
    );

    // Calculate what's new
    const newEntities = newStructure.entities.filter(e => 
      !this.gameState.narrativeStructure.entities.some(existing => existing.id === e.id)
    );
    
    const newRelationships = newStructure.relationships.filter(r => 
      !this.gameState.narrativeStructure.relationships.some(existing => 
        existing.source === r.source && existing.target === r.target && existing.type === r.type
      )
    );

    // Update game state
    this.gameState.narrativeStructure = newStructure;

    // Display extraction results
    console.log(chalk.green('\n✅ Narrative Extraction Complete!\n'));
    
    if (newEntities.length > 0) {
      console.log(chalk.cyan('🆕 New Entities Discovered:'));
      newEntities.forEach(e => {
        console.log(`   • ${chalk.bold(e.name)} (${e.type})`);
      });
    } else {
      console.log(chalk.gray('   ✓ No new entities (all were already tracked)'));
    }

    if (newRelationships.length > 0) {
      console.log(chalk.cyan('\n🔗 New Relationships Formed:'));
      newRelationships.forEach(r => {
        const sourceEntity = newStructure.entities.find(e => e.id === r.source);
        const targetEntity = newStructure.entities.find(e => e.id === r.target);
        console.log(`   • ${sourceEntity?.name || r.source} ${chalk.yellow(r.type)} ${targetEntity?.name || r.target}`);
      });
    } else {
      console.log(chalk.gray('\n   ✓ No new relationships'));
    }

    // Save to storage if available
    if (this.storage) {
      try {
        await this.storage.saveNarrative(newStructure, {
          source: 'timeline-warfare-incremental',
          missionNumber: this.gameState.missionCount
        });
        console.log(chalk.gray('\n💾 Saved to persistent storage'));
      } catch (error) {
        console.error(chalk.red('Failed to save to storage:', error));
      }
    }

    await this.prompt('\nPress ENTER to continue...');
  }

  async showNarrativeStatus() {
    console.clear();
    console.log(chalk.cyan.bold('\n📊 NARRATIVE CANON STATUS\n'));
    
    const { entities, relationships, scenes, stateChanges } = this.gameState.narrativeStructure;
    
    console.log(chalk.yellow(`Missions Completed: ${this.gameState.missionCount}`));
    console.log(chalk.gray('─'.repeat(60)));
    
    console.log(chalk.white(`\n🧠 Total Entities: ${entities.length}`));
    const entityTypes = entities.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(`   • ${type}: ${count}`);
    });

    console.log(chalk.white(`\n🔗 Total Relationships: ${relationships.length}`));
    const relationshipTypes = relationships.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(relationshipTypes).slice(0, 5).forEach(([type, count]) => {
      console.log(`   • ${type}: ${count}`);
    });
    if (Object.keys(relationshipTypes).length > 5) {
      console.log(`   • ... and ${Object.keys(relationshipTypes).length - 5} more types`);
    }

    console.log(chalk.white(`\n📍 Total Scenes: ${scenes.length}`));
    console.log(chalk.white(`🔄 Total State Changes: ${stateChanges.length}`));

    // Show some key entities
    console.log(chalk.cyan('\n🌟 Key Entities:'));
    const characters = entities.filter(e => e.type === 'character').slice(0, 5);
    characters.forEach(char => {
      const relationshipCount = relationships.filter(r => 
        r.source === char.id || r.target === char.id
      ).length;
      console.log(`   • ${char.name} - ${relationshipCount} relationships`);
    });

    await this.prompt('\nPress ENTER to continue...');
  }

  async queryNarrative() {
    console.clear();
    console.log(chalk.cyan.bold('\n🔍 QUERY NARRATIVE CANON\n'));
    
    console.log(chalk.yellow('Example queries:'));
    console.log('  • "Who is Agent Chen?"');
    console.log('  • "What is Oneirocom doing?"');
    console.log('  • "Show all locations"');
    console.log('  • "What technology exists?"');
    console.log('  • Type "back" to return\n');

    let querying = true;
    while (querying) {
      const query = await this.prompt(chalk.cyan('\nQuery> '));
      
      if (query.toLowerCase() === 'back') {
        querying = false;
        continue;
      }

      // Simple query processing
      const lowerQuery = query.toLowerCase();
      
      if (lowerQuery.includes('who is')) {
        const name = query.replace(/who is /i, '').replace('?', '').trim();
        const entity = this.gameState.narrativeStructure.entities.find(e => 
          e.name.toLowerCase().includes(name.toLowerCase())
        );
        
        if (entity) {
          console.log(chalk.green(`\n${entity.name} (${entity.type})`));
          if (entity.description) console.log(chalk.gray(entity.description));
          
          const relationships = this.gameState.narrativeStructure.relationships.filter(r => 
            r.source === entity.id || r.target === entity.id
          );
          
          if (relationships.length > 0) {
            console.log(chalk.yellow('\nRelationships:'));
            relationships.forEach(r => {
              const other = r.source === entity.id 
                ? this.gameState.narrativeStructure.entities.find(e => e.id === r.target)
                : this.gameState.narrativeStructure.entities.find(e => e.id === r.source);
              const direction = r.source === entity.id ? '→' : '←';
              console.log(`  ${direction} ${r.type} ${other?.name || r.target}`);
            });
          }
        } else {
          console.log(chalk.red('Entity not found in narrative canon.'));
        }
      } else if (lowerQuery.includes('all') && lowerQuery.includes('location')) {
        const locations = this.gameState.narrativeStructure.entities.filter(e => e.type === 'location');
        console.log(chalk.green('\nLocations:'));
        locations.forEach(loc => {
          console.log(`  • ${loc.name}`);
        });
      } else if (lowerQuery.includes('technology')) {
        const tech = this.gameState.narrativeStructure.entities.filter(e => e.type === 'technology');
        console.log(chalk.green('\nTechnology:'));
        tech.forEach(t => {
          console.log(`  • ${t.name}`);
        });
      } else {
        // Generic search
        const matches = this.gameState.narrativeStructure.entities.filter(e => 
          e.name.toLowerCase().includes(lowerQuery) || 
          (e.description && e.description.toLowerCase().includes(lowerQuery))
        );
        
        if (matches.length > 0) {
          console.log(chalk.green('\nMatching entities:'));
          matches.forEach(m => {
            console.log(`  • ${m.name} (${m.type})`);
          });
        } else {
          console.log(chalk.yellow('No direct matches. Try a different query.'));
        }
      }
    }
  }

  async mainMenu() {
    while (true) {
      console.clear();
      console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════════════════════════╗
║          TIMELINE WARFARE: INCREMENTAL NARRATIVE             ║
╟──────────────────────────────────────────────────────────────╢
║  Timeline: ${this.gameState.timeline.padEnd(49)}║
║  Missions: ${String(this.gameState.missionCount).padEnd(49)}║
║  Entities: ${String(this.gameState.narrativeStructure.entities.length).padEnd(49)}║
╚══════════════════════════════════════════════════════════════╝
      `));

      console.log(chalk.yellow('\nActions:'));
      console.log('  1. Execute New Mission');
      console.log('  2. View Narrative Status');
      console.log('  3. Query Narrative Canon');
      console.log('  4. Exit\n');

      const choice = await this.prompt('Choose action (1-4): ');

      switch (choice) {
        case '1':
          await this.executeMission();
          break;
        case '2':
          await this.showNarrativeStatus();
          break;
        case '3':
          await this.queryNarrative();
          break;
        case '4':
          console.log(chalk.green('\n👋 Thanks for playing!'));
          this.rl.close();
          if (this.storage) await this.storage.disconnect();
          process.exit(0);
        default:
          console.log(chalk.red('Invalid choice!'));
          await this.prompt('Press ENTER to continue...');
      }
    }
  }

  async start() {
    try {
      await this.initializeStorage();
      await this.showIntro();
      await this.mainMenu();
    } catch (error) {
      console.error(chalk.red('Game error:', error));
      this.rl.close();
      if (this.storage) await this.storage.disconnect();
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('❌ Please set GOOGLE_AI_API_KEY environment variable'));
    process.exit(1);
  }

  const llm = new GeminiAdapter(apiKey);
  const game = new IncrementalTimelineWarfare(llm);
  await game.start();
}

main().catch(console.error);
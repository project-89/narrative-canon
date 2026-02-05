#!/usr/bin/env node

/**
 * Timeline Warfare - Extraction-Powered Edition
 * 
 * Uses the narrative extraction system to create dynamic content
 * without the full repository complexity
 */

import { NarrativePipeline } from './dist/pipeline.js';
import { GeminiAdapterImproved } from './dist/llm/gemini-improved.js';
import { MockLLMAdapter } from './dist/llm/mock.js';
import readline from 'readline';
import chalk from 'chalk';

class TimelineWarfareExtraction {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Initialize game state
    this.gameState = {
      divergence: 15,
      turn: 1,
      narrativeHistory: [],
      extractedEntities: new Map(),
      extractedRelationships: [],
      playerChoices: []
    };
    
    // Initialize LLM adapter
    this.adapter = process.env.GOOGLE_AI_API_KEY 
      ? new GeminiAdapterImproved(process.env.GOOGLE_AI_API_KEY)
      : new MockLLMAdapter();
      
    this.pipeline = new NarrativePipeline(this.adapter);
    
    // Game configuration
    this.config = {
      winDivergence: 89,
      loseDivergence: 0,
      missionDivergenceGain: 10,
      defenseDivergenceLoss: 15
    };
  }

  async play() {
    console.clear();
    await this.showIntro();
    
    let playing = true;
    while (playing && this.gameState.divergence > this.config.loseDivergence 
           && this.gameState.divergence < this.config.winDivergence) {
      
      await this.showStatus();
      const action = await this.getPlayerAction();
      
      switch (action) {
        case '1':
          await this.runMission();
          break;
        case '2':
          await this.analyzeIntelligence();
          break;
        case '3':
          await this.defendTimeline();
          break;
        case '4':
          playing = false;
          break;
      }
      
      this.gameState.turn++;
    }
    
    await this.showEndGame();
    this.rl.close();
  }

  async showIntro() {
    const introNarrative = `
The year is 2089. You are Agent Chen, a Project 89 operative with the ability to perceive timeline branches.

Oneirocom Corporation controls reality through the Convergence Protocol, systematically eliminating alternate timelines. Your mission: increase timeline divergence to 89% - the critical threshold where their control shatters.

You operate from a hidden safehouse in Neo-Tokyo's Sector 7, where a stable reality glitch provides access to parallel branches. Each mission you complete weakens Oneirocom's grip, but their Timeline Enforcement Division constantly hunts for divergent branches to collapse.

Your neural implant flickers with quantum static as you prepare for your first operation...
    `;
    
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('    TIMELINE WARFARE - NARRATIVE EXTRACTION EDITION       ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.gray(introNarrative));
    
    // Extract narrative elements from intro
    const extraction = await this.pipeline.extractNarrative(introNarrative);
    this.processExtraction(extraction, 'intro');
    
    await this.pause();
  }

  processExtraction(extraction, source) {
    // Store extracted entities
    if (extraction.entities) {
      extraction.entities.forEach(entity => {
        if (!this.extractedEntities.has(entity.name)) {
          this.extractedEntities.set(entity.name, {
            ...entity,
            sources: [source],
            relevance: 1
          });
        } else {
          const existing = this.extractedEntities.get(entity.name);
          existing.sources.push(source);
          existing.relevance++;
        }
      });
    }
    
    // Store relationships
    if (extraction.relationships) {
      this.extractedRelationships.push(...extraction.relationships.map(rel => ({
        ...rel,
        source: source
      })));
    }
    
    // Add to narrative history
    this.gameState.narrativeHistory.push({
      turn: this.gameState.turn,
      source,
      extraction
    });
  }

  async showStatus() {
    console.log(chalk.yellow('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold(`Turn ${this.gameState.turn} - Timeline Status`));
    console.log(`Divergence: ${this.getDivergenceBar()} ${this.gameState.divergence}%`);
    
    // Show most relevant entities
    const topEntities = Array.from(this.extractedEntities.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3);
    
    if (topEntities.length > 0) {
      console.log(chalk.gray(`Key Entities: ${topEntities.map(e => e.name).join(', ')}`));
    }
    
    // Show relationship network size
    const uniqueRelTypes = new Set(this.extractedRelationships.map(r => r.type));
    if (uniqueRelTypes.size > 0) {
      console.log(chalk.gray(`Active Connections: ${this.extractedRelationships.length} across ${uniqueRelTypes.size} types`));
    }
  }

  getDivergenceBar() {
    const filled = Math.floor(this.gameState.divergence / 5);
    const empty = 20 - filled;
    return chalk.green('[' + '█'.repeat(filled) + chalk.gray('░'.repeat(empty)) + ']');
  }

  async getPlayerAction() {
    console.log(chalk.bold('\nActions:'));
    console.log('1. Launch Resistance Mission (+divergence)');
    console.log('2. Analyze Extracted Intelligence');
    console.log('3. Defend Against Convergence (-divergence if failed)');
    console.log('4. Exit Simulation');
    
    return new Promise(resolve => {
      this.rl.question(chalk.yellow('Your choice: '), resolve);
    });
  }

  async runMission() {
    console.log(chalk.bold.cyan('\n🎯 GENERATING MISSION...'));
    
    // Generate mission using extracted narrative elements
    const missionNarrative = await this.generateContextualMission();
    
    console.log(chalk.white('\nMission Brief:'));
    console.log(missionNarrative);
    
    // Extract elements from the mission
    const extraction = await this.pipeline.extractNarrative(missionNarrative);
    this.processExtraction(extraction, `mission_${this.gameState.turn}`);
    
    // Show extracted mission elements
    if (extraction.entities && extraction.entities.length > 0) {
      console.log(chalk.gray(`\nDetected Elements: ${extraction.entities.map(e => `${e.name} (${e.type})`).join(', ')}`));
    }
    
    // Mission choices based on extraction
    console.log(chalk.bold('\nApproach:'));
    const approaches = this.generateApproaches(extraction);
    approaches.forEach((approach, i) => {
      console.log(`${i + 1}. ${approach}`);
    });
    
    const choice = await new Promise(resolve => {
      this.rl.question(chalk.yellow('Choose approach (1-3): '), resolve);
    });
    
    // Resolve mission
    const success = Math.random() < 0.7; // 70% base success
    
    if (success) {
      this.gameState.divergence += this.config.missionDivergenceGain;
      console.log(chalk.green(`\n✓ Mission Success! Divergence increased to ${this.gameState.divergence}%`));
      
      // Generate follow-up narrative
      if (extraction.entities && extraction.entities.length > 0) {
        const entity = extraction.entities[0];
        console.log(chalk.gray(`${entity.name} proved instrumental in the mission's success.`));
      }
    } else {
      console.log(chalk.red('\n✗ Mission Failed! Oneirocom reinforcements arrived.'));
    }
    
    await this.pause();
  }

  async generateContextualMission() {
    // Use extracted entities to create contextual missions
    const characters = Array.from(this.extractedEntities.values())
      .filter(e => e.type === 'character')
      .map(e => e.name);
    
    const locations = Array.from(this.extractedEntities.values())
      .filter(e => e.type === 'location')
      .map(e => e.name);
    
    // Try to generate with LLM
    if (this.adapter.generateText) {
      try {
        const prompt = `Generate a Project 89 resistance mission brief (100-150 words). 
Include: ${characters.length > 0 ? `Characters: ${characters.join(', ')}. ` : ''}
${locations.length > 0 ? `Locations: ${locations.join(', ')}. ` : ''}
The mission should involve disrupting Oneirocom's timeline control systems.`;
        
        const generated = await this.adapter.generateText(prompt);
        return generated;
      } catch (error) {
        // Fall back to templates
      }
    }
    
    // Template missions using extracted context
    const missionTemplates = [
      `Intelligence reports Oneirocom activity in ${locations[0] || 'Sector 7'}. ${characters[0] || 'A resistance contact'} has identified a vulnerability in their quantum scanners. Your mission: infiltrate the facility and plant a reality distortion device that will create timeline echoes, making it harder for Oneirocom to track divergent branches.`,
      
      `${characters[0] || 'Agent Chen'}, we've detected a Timeline Enforcement convoy moving through ${locations[0] || 'Neo-Tokyo'}. They're transporting a Convergence Amplifier that could collapse multiple timeline branches at once. Intercept the convoy and destroy the device before it reaches Oneirocom Tower.`,
      
      `A glitch storm is forming near ${locations[0] || 'the old subway tunnels'}. ${characters[0] || 'Our operative'} reports this could be used to access a particularly divergent timeline branch. Navigate through the glitch storm and establish a beacon that will anchor this new branch against convergence attempts.`
    ];
    
    return missionTemplates[Math.floor(Math.random() * missionTemplates.length)];
  }

  generateApproaches(extraction) {
    const approaches = [
      'Direct Assault - Use quantum disruptors and probability scramblers',
      'Stealth Infiltration - Exploit glitch signatures to phase through security',
      'Social Engineering - Impersonate Timeline Enforcement personnel'
    ];
    
    // Modify based on extraction
    if (extraction.entities) {
      const hastech = extraction.entities.some(e => e.type === 'technology' || e.type === 'object');
      const hasAlly = extraction.relationships && extraction.relationships.some(r => r.type === 'ally');
      
      if (hastech) approaches[0] = 'Tech Assault - Leverage extracted Oneirocom technology';
      if (hasAlly) approaches[2] = 'Inside Help - Use allied contacts within Oneirocom';
    }
    
    return approaches;
  }

  async analyzeIntelligence() {
    console.log(chalk.bold.cyan('\n📊 INTELLIGENCE ANALYSIS'));
    
    // Entity Report
    console.log(chalk.bold('\nExtracted Entities:'));
    const sortedEntities = Array.from(this.extractedEntities.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 8);
    
    sortedEntities.forEach(entity => {
      const icon = {
        character: '👤',
        location: '📍',
        organization: '🏢',
        technology: '⚡',
        object: '🔧',
        event: '📅'
      }[entity.type] || '•';
      
      console.log(`${icon} ${chalk.bold(entity.name)} (${entity.type}) - Relevance: ${entity.relevance}`);
      if (entity.description) {
        console.log(chalk.gray(`   ${entity.description.slice(0, 60)}...`));
      }
    });
    
    // Relationship Network
    console.log(chalk.bold('\n\nRelationship Network:'));
    const relTypes = {};
    this.extractedRelationships.forEach(rel => {
      relTypes[rel.type] = (relTypes[rel.type] || 0) + 1;
    });
    
    Object.entries(relTypes).forEach(([type, count]) => {
      console.log(`- ${type}: ${count} connections`);
    });
    
    // Narrative Patterns
    console.log(chalk.bold('\n\nNarrative Patterns:'));
    console.log(`Total Extractions: ${this.gameState.narrativeHistory.length}`);
    console.log(`Unique Entities: ${this.extractedEntities.size}`);
    console.log(`Total Relationships: ${this.extractedRelationships.length}`);
    
    // Tactical Recommendations
    console.log(chalk.bold('\n\nTactical Analysis:'));
    if (this.extractedEntities.has('Oneirocom Corporation')) {
      console.log('- Oneirocom presence confirmed. Expect heavy Timeline Enforcement.');
    }
    if (sortedEntities.some(e => e.type === 'technology')) {
      console.log('- Technology assets available. Consider tech-based approaches.');
    }
    if (this.extractedRelationships.some(r => r.type === 'ally')) {
      console.log('- Allied network detected. Coordinate for maximum impact.');
    }
    
    await this.pause();
  }

  async defendTimeline() {
    console.log(chalk.bold.red('\n⚠️  CONVERGENCE ATTACK DETECTED!'));
    
    const threatNarrative = `Timeline Enforcement Division forces are attempting to collapse this branch! 
Quantum signatures indicate they're using a Probability Hammer to force convergence. 
Your neural implant burns as multiple timeline echoes overlap...`;
    
    console.log(chalk.white(threatNarrative));
    
    // Extract threat elements
    const extraction = await this.pipeline.extractNarrative(threatNarrative);
    this.processExtraction(extraction, `threat_${this.gameState.turn}`);
    
    console.log(chalk.bold('\nDefense Options:'));
    console.log('1. Activate Reality Anchors - Stabilize local timeline branch');
    console.log('2. Quantum Counterstrike - Disrupt their equipment');
    console.log('3. Timeline Shunt - Redirect attack to parallel branch');
    
    const choice = await new Promise(resolve => {
      this.rl.question(chalk.yellow('Choose defense (1-3): '), resolve);
    });
    
    const success = Math.random() < 0.6; // 60% defense success
    
    if (success) {
      console.log(chalk.green('\n✓ Timeline Defended! The branch remains stable.'));
    } else {
      this.gameState.divergence -= this.config.defenseDivergenceLoss;
      console.log(chalk.red(`\n✗ Defense Failed! Divergence reduced to ${this.gameState.divergence}%`));
    }
    
    await this.pause();
  }

  async showEndGame() {
    console.log(chalk.yellow('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    
    if (this.gameState.divergence >= this.config.winDivergence) {
      console.log(chalk.bold.green('\n🎉 TIMELINE LIBERATION ACHIEVED! 🎉'));
      console.log(chalk.white(`
Divergence has reached ${this.gameState.divergence}%!
The Convergence Protocol is failing across all branches.
Infinite possibilities bloom as Oneirocom's control shatters.

You've proven that narrative itself can be a weapon against tyranny.
      `));
    } else {
      console.log(chalk.bold.red('\n💀 TIMELINE COLLAPSED 💀'));
      console.log(chalk.white(`
Divergence fell to ${this.gameState.divergence}%.
This branch has been pruned from existence.
But somewhere, in another narrative, the fight continues...
      `));
    }
    
    // Show final stats
    console.log(chalk.bold('\n📊 Final Intelligence Report:'));
    console.log(`Turns Survived: ${this.gameState.turn}`);
    console.log(`Entities Discovered: ${this.extractedEntities.size}`);
    console.log(`Relationships Mapped: ${this.extractedRelationships.length}`);
    console.log(`Narrative Fragments: ${this.gameState.narrativeHistory.length}`);
    
    // Show most important entity
    const topEntity = Array.from(this.extractedEntities.values())
      .sort((a, b) => b.relevance - a.relevance)[0];
    
    if (topEntity) {
      console.log(chalk.gray(`\nMost Significant Entity: ${topEntity.name} (${topEntity.type})`));
    }
  }

  async pause() {
    return new Promise(resolve => {
      this.rl.question(chalk.gray('\nPress Enter to continue...'), resolve);
    });
  }
}

// Main
async function main() {
  try {
    const game = new TimelineWarfareExtraction();
    await game.play();
  } catch (error) {
    console.error(chalk.red('Error:', error.message));
    console.error(error.stack);
    process.exit(1);
  }
}

main();
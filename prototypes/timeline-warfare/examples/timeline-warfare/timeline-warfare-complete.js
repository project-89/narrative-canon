#!/usr/bin/env node

/**
 * Timeline Warfare - Complete Version
 * 
 * This version fully integrates the narrative extraction system
 * to create a dynamic timeline manipulation game.
 */

import { NarrativePipeline } from './dist/pipeline.js';
import { GeminiAdapter } from './dist/llm/gemini.js';
import { GeminiAdapterImproved } from './dist/llm/gemini-improved.js';
import { MockLLMAdapter } from './dist/llm/mock.js';
import { NarrativeRepository } from './dist/core/narrative-repository.js';
import { TimelineBranch } from './dist/core/timeline-branch.js';
import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

// Game configuration
const GAME_CONFIG = {
  startingDivergence: 0,
  divergencePerMission: 15,
  convergencePerDefense: 10,
  maxDivergence: 100,
  winDivergence: 89,
  narrativeChunkSize: 500, // chars per extraction
};

// Game state
class TimelineWarfareGame {
  constructor(pipeline, repository) {
    this.pipeline = pipeline;
    this.repository = repository;
    this.currentBranch = null;
    this.playerStats = {
      missionsCompleted: 0,
      timelinesDefended: 0,
      glitchesFound: 0,
      convergenceEvents: 0,
    };
    this.narrativeCache = new Map();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async init() {
    console.clear();
    this.showTitle();
    
    // Initialize the main timeline
    await this.repository.init();
    this.currentBranch = await this.repository.createBranch('main', 'Prime Timeline - Oneirocom Control');
    
    // Load initial narrative context
    await this.loadNarrativeContext();
  }

  showTitle() {
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('         TIMELINE WARFARE - COMPLETE EDITION              ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray('         Powered by Narrative Extraction Engine           ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════╝'));
    console.log();
  }

  async loadNarrativeContext() {
    // Load Project 89 narrative context
    const contextNarrative = `
The year is 2089. Oneirocom Corporation has achieved total surveillance through the Convergence Protocol, 
a reality-manipulation system that prunes alternate timelines. The resistance, known as Project 89, 
discovered that certain individuals can perceive and navigate between timeline branches through quantum glitches.

You are a Project 89 operative with the rare ability to maintain consciousness across timeline splits. 
Your mission is to increase timeline divergence to 89% - the critical threshold where Oneirocom's control breaks down 
and all possible futures become accessible again.

Oneirocom's Timeline Enforcement Division actively hunts divergent branches, attempting to force convergence 
back to their controlled prime timeline. You must complete missions to create divergence while defending 
against their convergence attacks.
    `.trim();

    // Extract narrative elements for game context
    const extraction = await this.pipeline.extractNarrative(contextNarrative);
    this.narrativeCache.set('context', extraction);
    
    // Create initial commit with extracted data
    await this.currentBranch.commit(
      { 
        narrative: contextNarrative,
        ...extraction 
      },
      'Initial timeline state - Oneirocom control established'
    );
  }

  async play() {
    let playing = true;
    
    while (playing) {
      console.log(chalk.yellow('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      await this.showStatus();
      
      const choice = await this.getChoice();
      
      switch (choice) {
        case '1':
          await this.runMission();
          break;
        case '2':
          await this.defendTimeline();
          break;
        case '3':
          await this.advanceTime();
          break;
        case '4':
          await this.viewTimelineHistory();
          break;
        case '5':
          await this.analyzeNarrative();
          break;
        case '6':
          playing = false;
          break;
        default:
          console.log(chalk.red('Invalid choice. Try again.'));
      }
      
      // Check win/lose conditions
      const divergence = await this.getDivergence();
      if (divergence >= GAME_CONFIG.winDivergence) {
        await this.handleVictory();
        playing = false;
      } else if (divergence <= 0) {
        await this.handleDefeat();
        playing = false;
      }
    }
    
    this.rl.close();
  }

  async showStatus() {
    const divergence = await this.getDivergence();
    const commits = await this.currentBranch.getHistory();
    
    console.log(chalk.bold('Current Timeline Status:'));
    console.log(`Branch: ${chalk.cyan(this.currentBranch.name)}`);
    console.log(`Divergence: ${this.getDivergenceBar(divergence)} ${divergence}%`);
    console.log(`Timeline Events: ${commits.length}`);
    console.log(`Missions Completed: ${this.playerStats.missionsCompleted}`);
    console.log(`Timelines Defended: ${this.playerStats.timelinesDefended}`);
    
    // Show narrative context if available
    const context = this.narrativeCache.get('context');
    if (context && context.entities.length > 0) {
      console.log(chalk.gray(`\nActive Entities: ${context.entities.slice(0, 3).map(e => e.name).join(', ')}...`));
    }
  }

  getDivergenceBar(divergence) {
    const filled = Math.floor(divergence / 5);
    const empty = 20 - filled;
    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    return `[${bar}]`;
  }

  async getDivergence() {
    const commits = await this.currentBranch.getHistory();
    let divergence = GAME_CONFIG.startingDivergence;
    
    for (const commit of commits) {
      if (commit.data.missionSuccess) {
        divergence += GAME_CONFIG.divergencePerMission;
      }
      if (commit.data.convergenceEvent) {
        divergence -= GAME_CONFIG.convergencePerDefense;
      }
    }
    
    return Math.max(0, Math.min(GAME_CONFIG.maxDivergence, divergence));
  }

  async getChoice() {
    console.log(chalk.bold('\nActions:'));
    console.log('1. Run Resistance Mission (Create Divergence)');
    console.log('2. Defend Timeline (Prevent Convergence)');
    console.log('3. Advance Time (Risk: Oneirocom may act)');
    console.log('4. View Timeline History');
    console.log('5. Analyze Narrative State');
    console.log('6. Exit Simulation');
    
    return new Promise(resolve => {
      this.rl.question(chalk.yellow('\nYour choice: '), resolve);
    });
  }

  async runMission() {
    console.log(chalk.bold.cyan('\n🎯 INITIATING RESISTANCE MISSION...'));
    
    // Generate mission narrative using the extraction system
    const missionNarrative = await this.generateMissionNarrative();
    console.log(chalk.white('\n' + missionNarrative.description));
    
    // Extract narrative elements from the mission
    const extraction = await this.pipeline.extractNarrative(missionNarrative.fullText);
    
    // Present mission choices based on extracted elements
    console.log(chalk.bold('\nMission Approach:'));
    const approaches = this.generateApproaches(extraction);
    approaches.forEach((approach, i) => {
      console.log(`${i + 1}. ${approach.name} - ${approach.description}`);
    });
    
    const choice = await new Promise(resolve => {
      this.rl.question(chalk.yellow('Choose approach (1-3): '), resolve);
    });
    
    const success = await this.resolveMission(approaches[parseInt(choice) - 1], extraction);
    
    if (success) {
      console.log(chalk.green('\n✓ Mission Successful! Timeline divergence increased.'));
      this.playerStats.missionsCompleted++;
      
      // Commit the mission results to the timeline
      await this.currentBranch.commit({
        missionSuccess: true,
        mission: missionNarrative,
        extraction,
        approach: approaches[parseInt(choice) - 1],
        timestamp: Date.now()
      }, `Mission: ${missionNarrative.title}`);
      
      // Cache the extraction for future reference
      this.narrativeCache.set(`mission_${this.playerStats.missionsCompleted}`, extraction);
    } else {
      console.log(chalk.red('\n✗ Mission Failed. Oneirocom maintains control.'));
      
      await this.currentBranch.commit({
        missionSuccess: false,
        mission: missionNarrative,
        extraction,
        timestamp: Date.now()
      }, `Failed Mission: ${missionNarrative.title}`);
    }
  }

  async generateMissionNarrative() {
    // Use existing narrative elements to generate coherent missions
    const context = this.narrativeCache.get('context');
    const recentMissions = Array.from(this.narrativeCache.entries())
      .filter(([key]) => key.startsWith('mission_'))
      .map(([, value]) => value);
    
    // Build context from previous extractions
    const characters = new Set();
    const locations = new Set();
    
    [context, ...recentMissions].forEach(extraction => {
      if (extraction && extraction.entities) {
        extraction.entities.forEach(e => {
          if (e.type === 'character') characters.add(e.name);
          if (e.type === 'location') locations.add(e.name);
        });
      }
    });
    
    // Generate mission using LLM if available
    const adapter = this.pipeline.llmAdapter;
    if (adapter.generateText) {
      const prompt = `
Generate a Project 89 resistance mission briefing. Use these elements:
- Characters: ${Array.from(characters).join(', ')}
- Locations: ${Array.from(locations).join(', ')}
- Goal: Increase timeline divergence by disrupting Oneirocom operations
- Include: specific objective, location, potential obstacles

Format as a mission briefing (150-200 words).
      `;
      
      try {
        const generatedText = await adapter.generateText(prompt);
        return {
          title: 'Generated Resistance Operation',
          description: generatedText.slice(0, 500),
          fullText: generatedText
        };
      } catch (error) {
        // Fall back to predefined missions
      }
    }
    
    // Fallback missions based on narrative context
    const missions = [
      {
        title: 'Data Heist at Oneirocom Tower',
        description: 'Intelligence indicates Oneirocom is developing Timeline Lock technology. Infiltrate their data center and steal the prototype specs.',
        fullText: 'Oneirocom Tower looms over Neo-Tokyo, its quantum processors humming with the power to reshape reality. Your mission: penetrate the 47th floor data center where Timeline Lock prototypes are stored. Security includes neural scanners and probability field detectors. Marcus Rivera has provided old security codes that might still work. The data crystal must be extracted before the next convergence sweep.'
      },
      {
        title: 'Protect the Glitch Sanctuary',
        description: 'A stable reality glitch in Sector 7 serves as a safehouse for refugees between timelines. Oneirocom forces are closing in.',
        fullText: 'The abandoned subway station in Sector 7 harbors one of the last stable glitches - a tear in reality that allows safe passage between timeline branches. Dozens of timeline refugees shelter there. Oneirocom\'s Timeline Enforcement Division has detected anomalous quantum signatures. You must defend the sanctuary using reality distortion mines and probability scramblers while evacuating the refugees to alternate branches.'
      },
      {
        title: 'Recruit the Quantum Physicist',
        description: 'Dr. Yuki Tanaka, a former Oneirocom researcher, wants to defect. Extract her before Timeline Enforcement arrives.',
        fullText: 'Dr. Yuki Tanaka discovered the mathematical proof that infinite timelines can coexist - knowledge that threatens Oneirocom\'s Convergence Protocol. She\'s signaled her desire to join Project 89 but remains under constant surveillance in her Neo-Tokyo apartment. Timeline Enforcement agents are already suspicious. You must extract her through the maintenance tunnels while her quantum research provides the key to enhanced timeline navigation.'
      }
    ];
    
    return missions[Math.floor(Math.random() * missions.length)];
  }

  generateApproaches(extraction) {
    // Generate approaches based on extracted narrative elements
    const approaches = [];
    
    // Always have a default set
    approaches.push({
      name: 'Direct Assault',
      description: 'Use force to achieve the objective',
      successFactors: ['combat', 'weapons', 'strength'],
      risk: 0.6
    });
    
    approaches.push({
      name: 'Stealth Infiltration',
      description: 'Avoid detection and slip past defenses',
      successFactors: ['stealth', 'hacking', 'agility'],
      risk: 0.4
    });
    
    approaches.push({
      name: 'Social Engineering',
      description: 'Manipulate and deceive to gain access',
      successFactors: ['deception', 'charisma', 'knowledge'],
      risk: 0.5
    });
    
    // Modify based on extraction
    if (extraction.entities.some(e => e.type === 'technology')) {
      approaches[1].description += ' using advanced tech';
      approaches[1].risk -= 0.1;
    }
    
    if (extraction.relationships.some(r => r.type === 'ally')) {
      approaches[2].description += ' with inside help';
      approaches[2].risk -= 0.1;
    }
    
    return approaches;
  }

  async resolveMission(approach, extraction) {
    // Use narrative elements to determine success
    const baseChance = 1 - approach.risk;
    let modifier = 0;
    
    // Check for helpful elements in the extraction
    if (extraction.entities.some(e => 
      approach.successFactors.some(factor => 
        e.description?.toLowerCase().includes(factor)
      )
    )) {
      modifier += 0.1;
    }
    
    if (extraction.relationships.some(r => r.type === 'ally')) {
      modifier += 0.05;
    }
    
    const successChance = Math.min(0.9, baseChance + modifier);
    return Math.random() < successChance;
  }

  async defendTimeline() {
    console.log(chalk.bold.red('\n⚠️  CONVERGENCE EVENT DETECTED!'));
    console.log(chalk.white('Oneirocom forces are attempting to collapse this timeline branch...'));
    
    // Generate a convergence event narrative
    const convergenceNarrative = await this.generateConvergenceEvent();
    console.log(chalk.white('\n' + convergenceNarrative.description));
    
    // Extract narrative elements
    const extraction = await this.pipeline.extractNarrative(convergenceNarrative.fullText);
    
    // Present defense options
    console.log(chalk.bold('\nDefense Strategy:'));
    console.log('1. Activate Reality Anchors - Stabilize local timeline');
    console.log('2. Counter-Hack Convergence Protocol - Disrupt their systems');
    console.log('3. Temporal Misdirection - Create false timeline signatures');
    
    const choice = await new Promise(resolve => {
      this.rl.question(chalk.yellow('Choose defense (1-3): '), resolve);
    });
    
    const success = Math.random() < 0.6; // Base 60% success rate
    
    if (success) {
      console.log(chalk.green('\n✓ Timeline Defended! Convergence prevented.'));
      this.playerStats.timelinesDefended++;
      
      await this.currentBranch.commit({
        convergenceEvent: true,
        defended: true,
        defense: convergenceNarrative,
        extraction,
        timestamp: Date.now()
      }, 'Convergence Event: Defended');
    } else {
      console.log(chalk.red('\n✗ Defense Failed! Timeline convergence reduces divergence.'));
      this.playerStats.convergenceEvents++;
      
      await this.currentBranch.commit({
        convergenceEvent: true,
        defended: false,
        defense: convergenceNarrative,
        extraction,
        timestamp: Date.now()
      }, 'Convergence Event: Failed Defense');
    }
  }

  async generateConvergenceEvent() {
    const events = [
      {
        title: 'Probability Wave Collapse',
        description: 'Oneirocom is broadcasting probability waves to force quantum collapse toward their preferred timeline.',
        fullText: 'Warning: Massive probability wave detected emanating from Oneirocom Tower. The wave is designed to collapse quantum superpositions across Neo-Tokyo, forcing all alternate possibilities to converge on Oneirocom\'s chosen timeline. Reality anchors are failing across multiple sectors. Without intervention, this branch will merge back into the prime timeline within minutes.'
      },
      {
        title: 'Timeline Enforcement Raid',
        description: 'Timeline Enforcement Division agents are moving to eliminate this branch\'s divergence point.',
        fullText: 'Multiple Timeline Enforcement units detected converging on your position. They carry quantum erasers capable of removing divergent events from the timeline. Their target: the critical decision point that created this branch. If they succeed, this entire timeline thread will unravel, and all resistance actions will be retroactively prevented.'
      },
      {
        title: 'Chrono-Viral Attack',
        description: 'A temporal virus is spreading backward through this timeline, rewriting history.',
        fullText: 'Alert: Chrono-viral signature detected in the timeline matrix. The virus propagates backward through causal chains, replacing divergent events with Oneirocom-approved alternatives. Already, several resistance victories are being retroactively undone. The virus must be quarantined before it reaches the branch point, or this entire timeline will be reformatted.'
      }
    ];
    
    return events[Math.floor(Math.random() * events.length)];
  }

  async advanceTime() {
    console.log(chalk.bold('\n⏰ Advancing timeline...'));
    
    // Random event based on game state
    const roll = Math.random();
    if (roll < 0.3) {
      console.log(chalk.yellow('Oneirocom forces detected unusual activity...'));
      await this.defendTimeline();
    } else if (roll < 0.5) {
      console.log(chalk.cyan('A glitch in reality reveals new intelligence...'));
      this.playerStats.glitchesFound++;
      console.log(chalk.green('+1 Glitch found! These may prove useful later.'));
    } else {
      console.log(chalk.gray('Time passes quietly. The resistance grows stronger.'));
    }
  }

  async viewTimelineHistory() {
    console.log(chalk.bold.cyan('\n📜 Timeline History:'));
    const commits = await this.currentBranch.getHistory();
    
    commits.slice(-10).forEach(commit => {
      const timestamp = new Date(commit.timestamp).toLocaleString();
      const icon = commit.data.missionSuccess ? '✓' : 
                  commit.data.convergenceEvent ? '⚔' : '•';
      console.log(chalk.gray(`${icon} [${timestamp}] ${commit.message}`));
    });
    
    console.log(chalk.gray(`\nTotal timeline events: ${commits.length}`));
  }

  async analyzeNarrative() {
    console.log(chalk.bold.cyan('\n📊 Narrative Analysis:'));
    
    // Aggregate all cached extractions
    const allEntities = new Map();
    const allRelationships = [];
    
    for (const [key, extraction] of this.narrativeCache.entries()) {
      if (extraction.entities) {
        extraction.entities.forEach(e => {
          if (!allEntities.has(e.name)) {
            allEntities.set(e.name, { ...e, appearances: 1 });
          } else {
            allEntities.get(e.name).appearances++;
          }
        });
      }
      
      if (extraction.relationships) {
        allRelationships.push(...extraction.relationships);
      }
    }
    
    console.log(chalk.bold('\nKey Entities:'));
    Array.from(allEntities.values())
      .sort((a, b) => b.appearances - a.appearances)
      .slice(0, 5)
      .forEach(entity => {
        console.log(`- ${entity.name} (${entity.type}) - ${entity.appearances} appearances`);
      });
    
    console.log(chalk.bold('\nRelationship Network:'));
    const relationshipTypes = allRelationships.reduce((acc, rel) => {
      acc[rel.type] = (acc[rel.type] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(relationshipTypes).forEach(([type, count]) => {
      console.log(`- ${type}: ${count} connections`);
    });
    
    console.log(chalk.gray('\nThis data shapes future missions and events.'));
  }

  async handleVictory() {
    console.log(chalk.bold.green('\n🎉 TIMELINE LIBERATION ACHIEVED! 🎉'));
    console.log(chalk.white(`
The timeline has reached ${GAME_CONFIG.winDivergence}% divergence!
Oneirocom's Convergence Protocol is breaking down.
All possible futures are now accessible.

The resistance has won this battle, but the war
for timeline freedom continues across infinite branches...

Final Statistics:
- Missions Completed: ${this.playerStats.missionsCompleted}
- Timelines Defended: ${this.playerStats.timelinesDefended}
- Glitches Found: ${this.playerStats.glitchesFound}
- Total Timeline Events: ${(await this.currentBranch.getHistory()).length}
    `));
    
    // Save the winning timeline
    await this.exportTimeline('victory');
  }

  async handleDefeat() {
    console.log(chalk.bold.red('\n💀 TIMELINE CONVERGED 💀'));
    console.log(chalk.white(`
Oneirocom's Convergence Protocol has succeeded.
This timeline branch has been pruned.
All divergent possibilities have been erased.

But somewhere, in another branch, the resistance continues...

Final Statistics:
- Missions Attempted: ${this.playerStats.missionsCompleted}
- Convergence Events: ${this.playerStats.convergenceEvents}
    `));
  }

  async exportTimeline(suffix = 'export') {
    const filename = `timeline-${suffix}-${Date.now()}.json`;
    const commits = await this.currentBranch.getHistory();
    
    const exportData = {
      gameVersion: '1.0.0',
      exportDate: new Date().toISOString(),
      stats: this.playerStats,
      timeline: commits,
      narrativeCache: Array.from(this.narrativeCache.entries())
    };
    
    await fs.writeFile(filename, JSON.stringify(exportData, null, 2));
    console.log(chalk.gray(`\nTimeline exported to ${filename}`));
  }
}

// Main game launcher
async function main() {
  try {
    // Choose LLM adapter
    let adapter;
    if (process.env.GOOGLE_AI_API_KEY) {
      console.log(chalk.green('✓ Gemini API key detected. Using AI for dynamic content.'));
      adapter = new GeminiAdapterImproved(process.env.GOOGLE_AI_API_KEY);
    } else {
      console.log(chalk.yellow('⚠ No API key found. Using mock data (set GOOGLE_AI_API_KEY for AI features).'));
      adapter = new MockLLMAdapter();
    }
    
    // Initialize narrative pipeline
    const pipeline = new NarrativePipeline(adapter);
    
    // Initialize narrative repository
    const repoPath = './timeline-warfare-data';
    await fs.mkdir(repoPath, { recursive: true });
    const repository = new NarrativeRepository(repoPath);
    
    // Create and run game
    const game = new TimelineWarfareGame(pipeline, repository);
    await game.init();
    await game.play();
    
  } catch (error) {
    console.error(chalk.red('Error:', error.message));
    console.error(error.stack);
  }
}

// Run the game
main();
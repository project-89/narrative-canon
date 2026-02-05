#!/usr/bin/env node

/**
 * Timeline Warfare - A Playable Game
 * 
 * Fight Oneirocom's timeline convergence by completing missions
 * that create divergent branches in the narrative.
 */

const readline = require('readline');
const { NarrativeGit } = require('./dist/narrative-git');
const fs = require('fs').promises;
const path = require('path');

// Game state
class TimelineWarfareGame {
  constructor(llmConfig) {
    this.git = new NarrativeGit({
      projectName: 'timeline-warfare-game',
      llmConfig: llmConfig || { provider: 'mock' }
    });
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.gameState = {
      currentYear: 2025,
      divergence: 0,
      resistanceStrength: 0.2,
      oneirocomControl: 0.8,
      activeBranches: [],
      completedMissions: [],
      resources: 100,
      agents: 3
    };
    
    this.isUsingLLM = llmConfig && llmConfig.provider !== 'mock';
  }
  
  async init() {
    console.clear();
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║               TIMELINE WARFARE - PROJECT 89               ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    console.log('The year is 2025. Oneirocom has engineered all timelines to');
    console.log('converge on their total control by 2089. You lead a cell of');
    console.log('Proxim8 agents working to create divergent timeline branches.\n');
    
    await this.sleep(2000);
    
    // Initialize git repository
    await this.git.init();
    await this.git.addAtTime(
      'Oneirocom controls global infrastructure. All timelines converge on corporate dominance.',
      new Date('2025-01-01'),
      'The Convergent Timeline'
    );
    
    await this.gameLoop();
  }
  
  async gameLoop() {
    while (this.gameState.currentYear < 2089 && this.gameState.divergence < 100) {
      console.clear();
      await this.displayStatus();
      
      const choice = await this.getPlayerChoice();
      
      switch (choice) {
        case '1':
          await this.generateMission();
          break;
        case '2':
          await this.viewTimeline();
          break;
        case '3':
          await this.defendTimeline();
          break;
        case '4':
          await this.attemptWeaving();
          break;
        case '5':
          await this.advanceTime();
          break;
        case '6':
          console.log('\nThe timeline remains under Oneirocom control...');
          this.rl.close();
          return;
      }
      
      await this.checkOneirocomResponse();
    }
    
    await this.endGame();
  }
  
  async displayStatus() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                    TIMELINE STATUS                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    console.log(`📅 Current Year: ${this.gameState.currentYear}`);
    console.log(`📊 Timeline Divergence: ${this.getProgressBar(this.gameState.divergence)}% `);
    console.log(`💪 Resistance Strength: ${this.getProgressBar(this.gameState.resistanceStrength * 100)}% `);
    console.log(`🏢 Oneirocom Control: ${this.getProgressBar(this.gameState.oneirocomControl * 100)}% `);
    console.log(`👥 Available Agents: ${this.gameState.agents}`);
    console.log(`💰 Resources: ${this.gameState.resources}`);
    console.log(`🌿 Active Branches: ${this.gameState.activeBranches.length}\n`);
  }
  
  getProgressBar(percentage) {
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    return `[${'█'.repeat(filled)}${'-'.repeat(empty)}] ${Math.floor(percentage)}`;
  }
  
  async getPlayerChoice() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ACTIONS:');
    console.log('1. Generate New Mission');
    console.log('2. View Timeline Branches');
    console.log('3. Defend Against Oneirocom');
    console.log('4. Attempt Timeline Weaving');
    console.log('5. Advance Time');
    console.log('6. Exit Game\n');
    
    return new Promise(resolve => {
      this.rl.question('Choose action (1-6): ', resolve);
    });
  }
  
  async generateMission() {
    if (this.gameState.agents < 1) {
      console.log('\n❌ No agents available! Advance time to recruit more.\n');
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🎯 GENERATING MISSION...\n');
    
    let mission;
    if (this.isUsingLLM) {
      // Use LLM to generate dynamic mission
      mission = await this.generateLLMMission();
    } else {
      // Use predefined missions
      mission = this.selectPredefinedMission();
    }
    
    console.log(`Mission: ${mission.name}`);
    console.log(`Target: ${mission.target}`);
    console.log(`Risk: ${mission.risk}/10`);
    console.log(`Potential Divergence: +${mission.divergenceGain}%\n`);
    console.log(`Description: ${mission.description}\n`);
    
    const accept = await this.askQuestion('Accept mission? (y/n): ');
    
    if (accept.toLowerCase() === 'y') {
      await this.executeMission(mission);
    }
  }
  
  async generateLLMMission() {
    // Create context for LLM
    const prompt = `Generate a covert mission for the resistance in the year ${this.gameState.currentYear}.
    
Context: Oneirocom controls surveillance, infrastructure, and governance. The resistance (Project 89) uses Proxim8 agents to disrupt their control.

Current resistance strength: ${Math.floor(this.gameState.resistanceStrength * 100)}%
Oneirocom control: ${Math.floor(this.gameState.oneirocomControl * 100)}%

Generate a mission with:
- name: Short mission codename
- target: What/who is being targeted
- description: 2-3 sentence mission briefing
- risk: 1-10 difficulty rating
- divergenceGain: 5-20 (how much this disrupts the timeline)
- successNarrative: What happens if successful (2-3 sentences)
- failureNarrative: What happens if failed (1-2 sentences)

Make it cyberpunk themed and relevant to the year ${this.gameState.currentYear}.`;

    try {
      const response = await this.git.llmAdapter.generateJSON(prompt, {
        name: 'string',
        target: 'string',
        description: 'string',
        risk: 'number',
        divergenceGain: 'number',
        successNarrative: 'string',
        failureNarrative: 'string'
      });
      
      return response;
    } catch (error) {
      console.log('LLM generation failed, using fallback...');
      return this.selectPredefinedMission();
    }
  }
  
  selectPredefinedMission() {
    const missions = [
      {
        name: 'Operation Static',
        target: 'Oneirocom Data Center',
        description: 'Infiltrate the Neo Tokyo data center and inject false telemetry to hide resistance movements.',
        risk: 6,
        divergenceGain: 12,
        successNarrative: 'The data injection succeeds. Oneirocom\'s predictive algorithms begin showing errors, creating blind spots the resistance can exploit.',
        failureNarrative: 'Security protocols detect the intrusion. Oneirocom tightens surveillance.'
      },
      {
        name: 'Operation Blackout',
        target: 'Power Grid Node 7',
        description: 'Sabotage a key power node to disrupt Oneirocom\'s quantum computers for 48 hours.',
        risk: 8,
        divergenceGain: 15,
        successNarrative: 'The blackout cascades through three sectors. Citizens experience life without constant surveillance, sparking questions about freedom.',
        failureNarrative: 'The sabotage fails. Two agents are captured.'
      },
      {
        name: 'Operation Whisper',
        target: 'Corporate Media Hub',
        description: 'Hack the news feeds to broadcast evidence of Oneirocom\'s crimes to millions.',
        risk: 7,
        divergenceGain: 18,
        successNarrative: 'The broadcast reaches 40 million viewers before being cut. Public trust in Oneirocom wavers, protests begin in multiple cities.',
        failureNarrative: 'Oneirocom\'s AI detects and blocks the transmission.'
      }
    ];
    
    return missions[Math.floor(Math.random() * missions.length)];
  }
  
  async executeMission(mission) {
    console.log('\n🎲 Executing mission...\n');
    this.gameState.agents--;
    
    // Calculate success based on risk and resistance strength
    const successChance = (1 - mission.risk / 10) + (this.gameState.resistanceStrength * 0.3);
    const roll = Math.random();
    
    await this.sleep(1500);
    
    if (roll < successChance) {
      // Mission success!
      console.log('✅ MISSION SUCCESS!\n');
      console.log(mission.successNarrative + '\n');
      
      // Create new timeline branch
      const branchName = `branch-${this.gameState.currentYear}-${mission.name.toLowerCase().replace(/\s+/g, '-')}`;
      await this.git.branch(branchName);
      await this.git.checkout(branchName);
      
      await this.git.addAtTime(
        mission.successNarrative,
        new Date(`${this.gameState.currentYear}-${Math.floor(Math.random() * 12 + 1)}-${Math.floor(Math.random() * 28 + 1)}`),
        `Mission Success: ${mission.name}`
      );
      
      this.gameState.activeBranches.push(branchName);
      this.gameState.divergence = Math.min(100, this.gameState.divergence + mission.divergenceGain);
      this.gameState.resistanceStrength = Math.min(1, this.gameState.resistanceStrength + 0.05);
      this.gameState.oneirocomControl = Math.max(0, this.gameState.oneirocomControl - 0.03);
      this.gameState.completedMissions.push(mission);
      
      // Generate cascade effects
      if (this.isUsingLLM) {
        await this.generateCascadeEffects(mission);
      }
      
    } else {
      // Mission failed
      console.log('❌ MISSION FAILED!\n');
      console.log(mission.failureNarrative + '\n');
      
      this.gameState.oneirocomControl = Math.min(1, this.gameState.oneirocomControl + 0.02);
      if (mission.risk > 7) {
        console.log('💀 An agent was captured!\n');
      }
    }
    
    await this.sleep(3000);
  }
  
  async generateCascadeEffects(mission) {
    const prompt = `The resistance successfully completed: ${mission.successNarrative}

Generate 2-3 cascade effects that would happen 1-5 years later as a result.
Each effect should show how this success ripples through time.

Current year: ${this.gameState.currentYear}`;

    try {
      const cascades = await this.git.llmAdapter.generateJSON(prompt, {
        effects: ['array', { description: 'string', yearsLater: 'number' }]
      });
      
      console.log('\n🌊 CASCADE EFFECTS:\n');
      for (const cascade of cascades.effects) {
        console.log(`  • ${this.gameState.currentYear + cascade.yearsLater}: ${cascade.description}`);
        
        // Add to timeline
        await this.git.addAtTime(
          cascade.description,
          new Date(`${this.gameState.currentYear + cascade.yearsLater}-01-01`),
          'Cascade Effect'
        );
      }
      console.log('');
    } catch (error) {
      // Silent fallback
    }
  }
  
  async viewTimeline() {
    console.log('\n📊 TIMELINE BRANCHES:\n');
    
    const branches = await this.git.branches();
    for (const branch of branches) {
      const commits = this.git.timeline(branch);
      console.log(`\n[${branch}] - ${commits.length} events`);
      
      // Show last 3 events
      const recent = commits.slice(-3);
      for (const commit of recent) {
        const date = commit.narrativeDate || commit.timestamp;
        console.log(`  ${date.getFullYear()}: ${commit.title || commit.message}`);
      }
    }
    
    console.log('\n');
    await this.askQuestion('Press Enter to continue...');
  }
  
  async defendTimeline() {
    if (this.gameState.activeBranches.length === 0) {
      console.log('\n❌ No active timeline branches to defend!\n');
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🚨 ONEIROCOM COUNTER-OFFENSIVE DETECTED!\n');
    
    const targetBranch = this.gameState.activeBranches[
      Math.floor(Math.random() * this.gameState.activeBranches.length)
    ];
    
    let counterNarrative;
    if (this.isUsingLLM) {
      const prompt = `Oneirocom detected timeline divergence in branch: ${targetBranch}
Generate their counter-narrative to reconverge the timeline. Should be dystopian and oppressive.`;
      
      try {
        const response = await this.git.llmAdapter.generate(prompt);
        counterNarrative = response;
      } catch (error) {
        counterNarrative = 'Oneirocom deploys memetic weapons to shift public opinion back to compliance.';
      }
    } else {
      counterNarrative = 'Oneirocom stages a false flag operation to justify increased surveillance.';
    }
    
    console.log(`Target: ${targetBranch}`);
    console.log(`Counter-narrative: ${counterNarrative}\n`);
    console.log('Deploy agents to defend? (Cost: 1 agent, 20 resources)\n');
    
    const defend = await this.askQuestion('Defend? (y/n): ');
    
    if (defend.toLowerCase() === 'y' && this.gameState.agents >= 1 && this.gameState.resources >= 20) {
      this.gameState.agents--;
      this.gameState.resources -= 20;
      
      const defendSuccess = Math.random() < 0.6;
      
      if (defendSuccess) {
        console.log('\n✅ Timeline defended! The counter-narrative fails to take hold.\n');
        this.gameState.divergence += 5;
      } else {
        console.log('\n❌ Defense failed! Timeline begins reconverging...\n');
        this.gameState.divergence = Math.max(0, this.gameState.divergence - 10);
        this.gameState.oneirocomControl += 0.05;
      }
    } else {
      console.log('\n❌ Timeline reconverges. Divergence lost.\n');
      this.gameState.divergence = Math.max(0, this.gameState.divergence - 15);
    }
    
    await this.sleep(3000);
  }
  
  async attemptWeaving() {
    if (this.gameState.activeBranches.length < 3) {
      console.log('\n❌ Need at least 3 active branches to attempt weaving!\n');
      console.log(`Current branches: ${this.gameState.activeBranches.length}`);
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🔀 ATTEMPTING TIMELINE WEAVE...\n');
    console.log('Analyzing branch coherence...\n');
    
    await this.sleep(1500);
    
    // Calculate coherence based on game state
    const coherence = (this.gameState.divergence / 100) * 
                     (this.gameState.resistanceStrength) * 
                     (1 - this.gameState.oneirocomControl);
    
    if (coherence > 0.3) {
      console.log('✅ TIMELINE WEAVE SUCCESSFUL!\n');
      console.log('A new stable timeline has been created where Oneirocom\'s');
      console.log('dominance is no longer inevitable!\n');
      
      this.gameState.divergence = 100;
      
      await this.git.branch('liberation-timeline');
      await this.git.checkout('liberation-timeline');
      
      await this.git.addAtTime(
        'The woven timeline stabilizes. Multiple resistance victories cascade into systemic change. Oneirocom\'s control matrix begins to crumble.',
        new Date(`${this.gameState.currentYear}-12-21`),
        'Timeline Liberation Achieved'
      );
      
      await this.sleep(3000);
      await this.endGame(true);
    } else {
      console.log('❌ WEAVE FAILED - Insufficient coherence!\n');
      console.log('The branches are too disparate to form a stable alternative.\n');
      console.log(`Coherence: ${Math.floor(coherence * 100)}% (need 30%)\n`);
      
      this.gameState.resources -= 30;
      await this.sleep(3000);
    }
  }
  
  async advanceTime() {
    console.log('\n⏭️  Advancing time...\n');
    
    this.gameState.currentYear += 5;
    this.gameState.agents = Math.min(5, this.gameState.agents + 2);
    this.gameState.resources += 50;
    
    // Natural convergence pressure
    this.gameState.divergence = Math.max(0, this.gameState.divergence - 5);
    this.gameState.oneirocomControl = Math.min(1, this.gameState.oneirocomControl + 0.02);
    
    console.log(`Year advanced to ${this.gameState.currentYear}`);
    console.log(`+2 agents recruited`);
    console.log(`+50 resources gained`);
    console.log(`-5% divergence (temporal convergence)\n`);
    
    await this.sleep(2000);
  }
  
  async checkOneirocomResponse() {
    if (this.gameState.divergence > 30 && Math.random() < 0.3) {
      console.log('\n⚠️  Oneirocom is mobilizing a response...\n');
      await this.sleep(1500);
    }
  }
  
  async endGame(victory = false) {
    console.clear();
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                      GAME OVER                            ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    if (victory || this.gameState.divergence >= 100) {
      console.log('🎉 VICTORY! Timeline liberated!\n');
      console.log('You have successfully broken Oneirocom\'s convergent timeline.');
      console.log('The future is no longer predetermined. Humanity is free to');
      console.log('choose its own path.\n');
    } else {
      console.log('💀 DEFEAT - Timeline converged\n');
      console.log('Despite your efforts, all timelines converge on Oneirocom\'s');
      console.log('total dominance in 2089. The resistance fades into history.\n');
    }
    
    console.log('Final Statistics:');
    console.log(`- Missions Completed: ${this.gameState.completedMissions.length}`);
    console.log(`- Timeline Divergence: ${Math.floor(this.gameState.divergence)}%`);
    console.log(`- Branches Created: ${this.gameState.activeBranches.length}`);
    console.log(`- Final Year: ${this.gameState.currentYear}\n`);
    
    // Save game timeline
    const timelineData = {
      victory,
      finalState: this.gameState,
      branches: {}
    };
    
    const branches = await this.git.branches();
    for (const branch of branches) {
      timelineData.branches[branch] = this.git.timeline(branch).map(c => ({
        date: c.narrativeDate || c.timestamp,
        event: c.title || c.message
      }));
    }
    
    await fs.writeFile(
      'timeline-warfare-save.json',
      JSON.stringify(timelineData, null, 2)
    );
    
    console.log('Timeline data saved to timeline-warfare-save.json\n');
    
    this.rl.close();
  }
  
  askQuestion(question) {
    return new Promise(resolve => {
      this.rl.question(question, resolve);
    });
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main entry point
async function startGame() {
  console.log('Timeline Warfare - Configuration\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const useLLM = await new Promise(resolve => {
    rl.question('Use Gemini for dynamic content? (requires API key) (y/n): ', answer => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
  
  rl.close();
  
  let llmConfig;
  if (useLLM) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.log('\n❌ No Gemini API key found!');
      console.log('Set GEMINI_API_KEY environment variable and try again.\n');
      process.exit(1);
    }
    
    llmConfig = {
      provider: 'gemini',
      apiKey: apiKey,
      model: 'gemini-1.5-flash'
    };
    
    console.log('\n✅ Gemini configured for dynamic content generation!\n');
  } else {
    llmConfig = { provider: 'mock' };
    console.log('\n📝 Using predefined content (no API key required)\n');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const game = new TimelineWarfareGame(llmConfig);
  await game.init();
}

// Run the game
if (require.main === module) {
  startGame().catch(console.error);
}

module.exports = { TimelineWarfareGame };
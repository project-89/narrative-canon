#!/usr/bin/env node

/**
 * Timeline Warfare - Tutorial Enhanced Version
 * 
 * Fight Oneirocom's timeline convergence with better guidance and dynamic content
 */

const readline = require('readline');
const { NarrativeGit } = require('./dist/narrative-git');
const { GeminiAdapter } = require('./dist/llm/gemini-adapter');
const { MockLLM } = require('./dist/llm/mock');
const fs = require('fs').promises;

class TimelineWarfareTutorial {
  constructor(llmAdapter) {
    this.git = new NarrativeGit(llmAdapter);
    this.llmAdapter = llmAdapter;
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.gameState = {
      currentYear: 2025,
      divergence: 0,
      resistanceStrength: 0.2,
      oneirocomControl: 0.8,
      activeBranches: ['main'],
      completedMissions: [],
      resources: 100,
      agents: 3,
      turnsUntilCounter: 3,
      tutorialMode: true,
      firstMission: true
    };
    
    this.isUsingLLM = llmAdapter && !(llmAdapter instanceof MockLLM);
  }
  
  async init() {
    console.clear();
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           TIMELINE WARFARE - PROJECT 89                   ║');
    console.log('║                  Tutorial Mode: ON                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    await this.sleep(1000);
    
    console.log('📖 STORY BRIEFING:\n');
    console.log('The year is 2025. Oneirocom Corporation has discovered how to');
    console.log('manipulate probability fields, engineering all possible futures');
    console.log('to converge on their total control by 2089.\n');
    
    console.log('You lead a cell of Proxim8 agents - reality hackers who can');
    console.log('create timeline divergences through strategic missions.\n');
    
    await this.sleep(3000);
    
    console.log('🎯 YOUR GOAL:\n');
    console.log('• Complete missions to create timeline branches (divergence)');
    console.log('• Defend branches when Oneirocom counter-attacks');
    console.log('• Weave 3+ branches together to create a liberation timeline');
    console.log('• Reach 100% divergence or successful weave to win\n');
    
    await this.askQuestion('Press Enter to begin...');
    
    // Initialize narrative
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
      
      // Tutorial hints
      if (this.gameState.tutorialMode) {
        this.displayHint();
      }
      
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
          this.gameState.tutorialMode = !this.gameState.tutorialMode;
          console.log(`\nTutorial mode: ${this.gameState.tutorialMode ? 'ON' : 'OFF'}\n`);
          await this.sleep(1000);
          break;
        case '7':
          console.log('\nThe timeline remains under Oneirocom control...');
          this.rl.close();
          return;
      }
      
      await this.checkOneirocomResponse();
    }
    
    await this.endGame();
  }
  
  displayHint() {
    console.log('💡 STRATEGIC HINT:');
    
    if (this.gameState.firstMission) {
      console.log('→ Start by launching a mission (Option 1) to create your first branch!\n');
    } else if (this.gameState.agents === 0) {
      console.log('→ You\'re out of agents! Advance time (Option 5) to recruit more.\n');
    } else if (this.gameState.turnsUntilCounter <= 0 && this.gameState.activeBranches.length > 1) {
      console.log('⚠️  Oneirocom is planning a counter-attack! Consider defending (Option 3).\n');
    } else if (this.gameState.activeBranches.length >= 4) {
      console.log('✨ You have enough branches! Try weaving timelines (Option 4).\n');
    } else if (this.gameState.divergence < 30) {
      console.log('→ Focus on missions to increase divergence. Low risk = higher success!\n');
    } else if (this.gameState.resources < 50) {
      console.log('→ Resources are low. Complete missions or advance time to gain more.\n');
    } else {
      console.log('→ Keep creating branches through missions. You need 3+ for weaving.\n');
    }
  }
  
  async displayStatus() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                    TIMELINE STATUS                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    console.log(`📅 Year: ${this.gameState.currentYear} | 🎯 Goal: 100% divergence or timeline weave`);
    console.log(`📊 Timeline Divergence: ${this.getProgressBar(this.gameState.divergence)}%`);
    console.log(`💪 Resistance Strength: ${this.getProgressBar(this.gameState.resistanceStrength * 100)}%`);
    console.log(`🏢 Oneirocom Control: ${this.getProgressBar(this.gameState.oneirocomControl * 100)}%`);
    console.log(`\n👥 Agents: ${this.gameState.agents} | 💰 Resources: ${this.gameState.resources}`);
    console.log(`🌿 Timeline Branches: ${this.gameState.activeBranches.length - 1} (need 3+ to weave)`);
    console.log(`✅ Missions Completed: ${this.gameState.completedMissions.length}\n`);
  }
  
  getProgressBar(percentage) {
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.floor(percentage)}`;
  }
  
  async getPlayerChoice() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ACTIONS:');
    console.log('1. 🎯 Launch Mission         4. 🔀 Weave Timelines');
    console.log('2. 📊 View Timeline          5. ⏭️  Advance Time (+2 agents)');
    console.log('3. 🛡️  Defend Branch         6. 💡 Toggle Tutorial');
    console.log('                            7. 🚪 Exit Game\n');
    
    return new Promise(resolve => {
      this.rl.question('Choose action (1-7): ', resolve);
    });
  }
  
  async generateMission() {
    if (this.gameState.agents < 1) {
      console.log('\n❌ No agents available!');
      console.log('💡 Tip: Advance time (Option 5) to recruit 2 more agents.\n');
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🎯 MISSION GENERATION...\n');
    
    let mission;
    if (this.isUsingLLM) {
      mission = await this.generateDynamicMission();
    } else {
      mission = this.selectPredefinedMission();
    }
    
    // Display mission briefing
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                   MISSION BRIEFING                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    console.log(`📋 Codename: ${mission.name}`);
    console.log(`🎯 Target: ${mission.target}`);
    console.log(`⚠️  Risk Level: ${this.getRiskBar(mission.risk)}`);
    console.log(`📈 Potential Divergence: +${mission.divergenceGain}%`);
    console.log(`\n📄 Briefing: ${mission.description}\n`);
    
    if (this.gameState.tutorialMode) {
      console.log(`💡 Success Chance: ~${Math.floor((1 - mission.risk/10 + this.gameState.resistanceStrength * 0.3) * 100)}%`);
      console.log(`   (Lower risk = higher success. Resistance strength helps too!)\n`);
    }
    
    const accept = await this.askQuestion('Accept mission? (y/n): ');
    
    if (accept.toLowerCase() === 'y') {
      this.gameState.firstMission = false;
      await this.executeMission(mission);
    }
  }
  
  getRiskBar(risk) {
    const filled = Math.floor(risk);
    return `${'▓'.repeat(filled)}${'░'.repeat(10 - filled)} (${risk}/10)`;
  }
  
  async generateDynamicMission() {
    const missionTypes = [
      'data breach', 'sabotage', 'propaganda', 'recruitment', 
      'supply raid', 'assassination', 'liberation', 'exposure'
    ];
    
    const prompt = `Generate a cyberpunk resistance mission for year ${this.gameState.currentYear}.

Context:
- Oneirocom: Dystopian mega-corp controlling surveillance, AI, and infrastructure
- Resistance: Underground hackers and freedom fighters (Project 89)
- Setting: Neo-Tokyo and global sprawl
- Current resistance strength: ${Math.floor(this.gameState.resistanceStrength * 100)}%

Create a mission with EXACTLY this JSON format:
{
  "name": "Operation [Codename]",
  "target": "[Specific target/location]",
  "description": "[2-3 sentence briefing explaining the mission]",
  "risk": [number 4-9],
  "divergenceGain": [number 10-20],
  "successNarrative": "[What happens on success - 2 sentences]",
  "failureNarrative": "[What happens on failure - 1 sentence]"
}

Mission type: ${missionTypes[Math.floor(Math.random() * missionTypes.length)]}`;

    try {
      const response = await this.llmAdapter.generate(prompt);
      
      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const mission = JSON.parse(jsonMatch[0]);
        // Validate and constrain values
        mission.risk = Math.max(4, Math.min(9, mission.risk || 6));
        mission.divergenceGain = Math.max(10, Math.min(20, mission.divergenceGain || 15));
        return mission;
      }
    } catch (error) {
      console.log('LLM parsing failed, using fallback...');
    }
    
    return this.selectPredefinedMission();
  }
  
  selectPredefinedMission() {
    const missions = [
      {
        name: 'Operation Static',
        target: 'Oneirocom Data Center - Sector 7',
        description: 'Infiltrate the data center and inject false telemetry. This will create blind spots in their surveillance grid, allowing resistance cells to move freely.',
        risk: 6,
        divergenceGain: 12,
        successNarrative: 'The data injection succeeds! Surveillance algorithms show cascading errors. Resistance movements can now operate undetected in three sectors.',
        failureNarrative: 'Security protocols detected the breach. Oneirocom patches the vulnerability.'
      },
      {
        name: 'Operation Blackout',
        target: 'Quantum Power Grid - Node 7',
        description: 'Sabotage a critical power node to disable Oneirocom\'s quantum processors. Even 48 hours of downtime could shift probability calculations.',
        risk: 8,
        divergenceGain: 15,
        successNarrative: 'The blackout cascades through the grid! Citizens experience freedom from surveillance. Many begin questioning the system.',
        failureNarrative: 'Counter-insurgency drones intercept the team. The mission fails.'
      },
      {
        name: 'Operation Whisper',
        target: 'Global Media Broadcast Hub',
        description: 'Hack the news feeds to broadcast suppressed evidence of Oneirocom\'s crimes. Truth is the most dangerous weapon.',
        risk: 7,
        divergenceGain: 18,
        successNarrative: 'The broadcast reaches 40 million before being cut! Public trust in Oneirocom wavers. Protests erupt across multiple cities.',
        failureNarrative: 'Oneirocom\'s AI detects and blocks the transmission instantly.'
      },
      {
        name: 'Operation Ghost',
        target: 'Employee Conditioning Center',
        description: 'Free the mid-level managers from neural conditioning. Without loyal middle management, Oneirocom\'s hierarchy weakens.',
        risk: 5,
        divergenceGain: 14,
        successNarrative: 'Dozens of managers are freed from conditioning! They begin sabotaging operations from within. Corporate efficiency drops 23%.',
        failureNarrative: 'Security was tighter than expected. The team retreats.'
      }
    ];
    
    // Select based on game state
    const index = Math.floor(Math.random() * missions.length);
    return missions[index];
  }
  
  async executeMission(mission) {
    console.log('\n🎲 EXECUTING MISSION...\n');
    this.gameState.agents--;
    
    // Calculate success
    const successChance = (1 - mission.risk / 10) + (this.gameState.resistanceStrength * 0.3);
    const roll = Math.random();
    
    // Dramatic pause
    for (let i = 0; i < 3; i++) {
      await this.sleep(500);
      console.log('...');
    }
    
    if (roll < successChance) {
      await this.missionSuccess(mission);
    } else {
      await this.missionFailure(mission);
    }
    
    // Update counter timer
    this.gameState.turnsUntilCounter--;
    
    await this.sleep(3000);
  }
  
  async missionSuccess(mission) {
    console.log('✅ MISSION SUCCESS!\n');
    console.log(mission.successNarrative + '\n');
    
    // Create timeline branch
    const branchName = `${this.gameState.currentYear}-${mission.name.toLowerCase().replace(/\s+/g, '-')}`;
    this.git.branch(branchName);
    this.git.checkout(branchName);
    
    await this.git.addAtTime(
      mission.successNarrative,
      new Date(`${this.gameState.currentYear}-${Math.floor(Math.random() * 12 + 1)}-${Math.floor(Math.random() * 28 + 1)}`),
      `Mission Success: ${mission.name}`
    );
    
    // Update game state
    this.gameState.activeBranches.push(branchName);
    this.gameState.divergence = Math.min(100, this.gameState.divergence + mission.divergenceGain);
    this.gameState.resistanceStrength = Math.min(1, this.gameState.resistanceStrength + 0.05);
    this.gameState.oneirocomControl = Math.max(0, this.gameState.oneirocomControl - 0.03);
    this.gameState.completedMissions.push(mission);
    this.gameState.resources += 20;
    
    console.log(`📊 Timeline Divergence: +${mission.divergenceGain}% → ${this.gameState.divergence}%`);
    console.log(`💰 Resources: +20 → ${this.gameState.resources}`);
    console.log(`🌿 New Branch Created: ${branchName}`);
    
    // Generate cascade effects with LLM
    if (this.isUsingLLM) {
      await this.generateCascadeEffects(mission);
    } else {
      console.log('\n🌊 CASCADE EFFECTS:');
      console.log(`  • ${this.gameState.currentYear + 1}: Resistance cells inspired by success`);
      console.log(`  • ${this.gameState.currentYear + 3}: Oneirocom loses key contracts`);
    }
  }
  
  async missionFailure(mission) {
    console.log('❌ MISSION FAILED!\n');
    console.log(mission.failureNarrative + '\n');
    
    this.gameState.oneirocomControl = Math.min(1, this.gameState.oneirocomControl + 0.02);
    
    if (mission.risk > 7) {
      console.log('💀 An agent was captured during the mission!');
      console.log(`👥 Agents: ${this.gameState.agents + 1} → ${this.gameState.agents}\n`);
    }
    
    console.log(`🏢 Oneirocom Control: +2% → ${Math.floor(this.gameState.oneirocomControl * 100)}%`);
    
    if (this.gameState.tutorialMode) {
      console.log('\n💡 Tip: Lower risk missions have better success chances!');
    }
  }
  
  async generateCascadeEffects(mission) {
    const prompt = `The resistance just succeeded: ${mission.successNarrative}

Generate 2-3 specific cascade effects showing how this success ripples through the timeline.
Format each as: [YEAR]: [Specific consequence]

Current year: ${this.gameState.currentYear}
Make effects happen 1-5 years in the future.`;

    try {
      const response = await this.llmAdapter.generate(prompt);
      console.log('\n🌊 CASCADE EFFECTS:');
      
      // Parse and display effects
      const lines = response.split('\n').filter(line => line.includes(':'));
      for (const line of lines.slice(0, 3)) {
        console.log(`  • ${line.trim()}`);
        
        // Extract year if possible
        const yearMatch = line.match(/(\d{4}):/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          const effect = line.split(':').slice(1).join(':').trim();
          
          await this.git.addAtTime(
            effect,
            new Date(`${year}-01-01`),
            'Cascade Effect'
          );
        }
      }
    } catch (error) {
      // Fallback cascade effects
      console.log('\n🌊 CASCADE EFFECTS:');
      console.log(`  • ${this.gameState.currentYear + 1}: Resistance networks strengthen`);
      console.log(`  • ${this.gameState.currentYear + 3}: Oneirocom influence weakens`);
    }
  }
  
  async viewTimeline() {
    console.log('\n📊 TIMELINE BRANCHES:\n');
    
    if (this.gameState.activeBranches.length === 1) {
      console.log('No divergent branches created yet.');
      console.log('Complete missions to create timeline branches!\n');
    } else {
      console.log(`Total Branches: ${this.gameState.activeBranches.length - 1}\n`);
      
      for (const branch of this.gameState.activeBranches) {
        if (branch === 'main') continue;
        
        console.log(`🌿 [${branch}]`);
        
        // Get last few events
        const timeline = this.git.timeline();
        const branchEvents = timeline.filter(e => 
          e.message && e.message.includes(branch.split('-').slice(-2).join(' '))
        ).slice(-2);
        
        for (const event of branchEvents) {
          const date = event.narrativeDate || event.timestamp;
          console.log(`   ${date.getFullYear()}: ${event.title || event.message}`);
        }
        console.log('');
      }
    }
    
    await this.askQuestion('Press Enter to continue...');
  }
  
  async defendTimeline() {
    if (this.gameState.activeBranches.length <= 1) {
      console.log('\n❌ No timeline branches to defend!');
      console.log('💡 Create branches through successful missions first.\n');
      await this.sleep(2000);
      return;
    }
    
    if (this.gameState.turnsUntilCounter > 0) {
      console.log('\n⚠️  No immediate threats detected.');
      console.log(`💡 Oneirocom typically counters after ${this.gameState.turnsUntilCounter} more actions.\n`);
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🚨 ONEIROCOM COUNTER-OFFENSIVE DETECTED!\n');
    
    const targetBranch = this.gameState.activeBranches[
      Math.floor(Math.random() * (this.gameState.activeBranches.length - 1)) + 1
    ];
    
    let counterNarrative;
    if (this.isUsingLLM) {
      const prompt = `Oneirocom detected timeline divergence: ${targetBranch}
Generate their dystopian counter-measure to reconverge the timeline.
Keep it brief (1-2 sentences) and oppressive.`;
      
      try {
        counterNarrative = await this.llmAdapter.generate(prompt);
      } catch (error) {
        counterNarrative = 'Oneirocom deploys neural pacification waves across the sector.';
      }
    } else {
      const counters = [
        'Oneirocom releases a memetic virus to erase resistance sympathies.',
        'Oneirocom stages a false flag attack to justify martial law.',
        'Oneirocom crashes the local economy to force compliance.',
        'Oneirocom deploys hunter-killer drones to eliminated resistance cells.'
      ];
      counterNarrative = counters[Math.floor(Math.random() * counters.length)];
    }
    
    console.log(`🎯 Target Branch: ${targetBranch}`);
    console.log(`⚔️  Counter-Attack: ${counterNarrative}\n`);
    console.log('DEFENSE OPTIONS:');
    console.log('• Deploy agents and resources to defend (Cost: 1 agent, 20 resources)');
    console.log('• Let the timeline reconverge (Loss: -15% divergence)\n');
    
    const defend = await this.askQuestion('Defend the timeline? (y/n): ');
    
    if (defend.toLowerCase() === 'y') {
      if (this.gameState.agents < 1 || this.gameState.resources < 20) {
        console.log('\n❌ Insufficient resources to defend!');
        await this.timelineReconverges(targetBranch);
      } else {
        await this.attemptDefense(targetBranch);
      }
    } else {
      await this.timelineReconverges(targetBranch);
    }
    
    // Reset counter
    this.gameState.turnsUntilCounter = 3 + Math.floor(Math.random() * 2);
    
    await this.sleep(3000);
  }
  
  async attemptDefense(targetBranch) {
    this.gameState.agents--;
    this.gameState.resources -= 20;
    
    console.log('\n🛡️  DEFENDING TIMELINE...\n');
    await this.sleep(1500);
    
    const defendSuccess = Math.random() < (0.6 + this.gameState.resistanceStrength * 0.2);
    
    if (defendSuccess) {
      console.log('✅ DEFENSE SUCCESSFUL!');
      console.log('The counter-narrative fails to take hold.');
      console.log('The timeline branch remains stable.\n');
      
      this.gameState.divergence += 5;
      console.log(`📊 Divergence: +5% → ${this.gameState.divergence}%`);
      
      if (this.isUsingLLM) {
        const prompt = `The resistance successfully defended against: ${targetBranch}
Describe in one sentence how this strengthens the resistance.`;
        
        try {
          const response = await this.llmAdapter.generate(prompt);
          console.log(`\n💪 ${response}`);
        } catch (error) {
          console.log('\n💪 The successful defense inspires other cells.');
        }
      }
    } else {
      console.log('❌ DEFENSE FAILED!');
      await this.timelineReconverges(targetBranch, 10);
    }
  }
  
  async timelineReconverges(branch, divergenceLoss = 15) {
    console.log(`\n📉 Timeline ${branch} begins reconverging...`);
    console.log('Oneirocom\'s counter-narrative takes hold.\n');
    
    this.gameState.divergence = Math.max(0, this.gameState.divergence - divergenceLoss);
    this.gameState.oneirocomControl += 0.05;
    
    // Remove branch from active list
    this.gameState.activeBranches = this.gameState.activeBranches.filter(b => b !== branch);
    
    console.log(`📊 Divergence: -${divergenceLoss}% → ${this.gameState.divergence}%`);
    console.log(`🏢 Oneirocom Control: +5% → ${Math.floor(this.gameState.oneirocomControl * 100)}%`);
  }
  
  async attemptWeaving() {
    const requiredBranches = 3;
    const actualBranches = this.gameState.activeBranches.length - 1; // Exclude main
    
    if (actualBranches < requiredBranches) {
      console.log(`\n❌ INSUFFICIENT TIMELINE BRANCHES\n`);
      console.log(`Current: ${actualBranches} branches`);
      console.log(`Required: ${requiredBranches} branches\n`);
      console.log('💡 Complete more successful missions to create branches.\n');
      await this.sleep(2500);
      return;
    }
    
    console.log('\n🔀 ATTEMPTING TIMELINE WEAVE...\n');
    console.log('Analyzing quantum coherence across branches...\n');
    
    await this.sleep(1500);
    
    // Calculate coherence
    const coherence = (this.gameState.divergence / 100) * 
                     (this.gameState.resistanceStrength) * 
                     (1 - this.gameState.oneirocomControl);
    
    console.log('COHERENCE FACTORS:');
    console.log(`• Timeline Divergence: ${this.gameState.divergence}%`);
    console.log(`• Resistance Strength: ${Math.floor(this.gameState.resistanceStrength * 100)}%`);
    console.log(`• Oneirocom Weakness: ${Math.floor((1 - this.gameState.oneirocomControl) * 100)}%`);
    console.log(`\n📊 Total Coherence: ${Math.floor(coherence * 100)}% (need 30%)\n`);
    
    await this.sleep(2000);
    
    if (coherence > 0.3) {
      await this.weaveSuccess();
    } else {
      await this.weaveFailure(coherence);
    }
  }
  
  async weaveSuccess() {
    console.log('✨ TIMELINE WEAVE SUCCESSFUL!\n');
    console.log('The branches resonate in quantum harmony...');
    console.log('A new stable timeline crystallizes from the possibilities!\n');
    
    await this.sleep(2000);
    
    this.git.branch('liberation-timeline');
    this.git.checkout('liberation-timeline');
    
    const liberationNarrative = this.isUsingLLM ? 
      await this.generateLiberationNarrative() :
      'The woven timeline stabilizes. Across the world, Oneirocom\'s control systems fail simultaneously. Humanity awakens to freedom.';
    
    await this.git.addAtTime(
      liberationNarrative,
      new Date(`${this.gameState.currentYear}-12-21`),
      'Timeline Liberation Achieved'
    );
    
    console.log(liberationNarrative);
    
    this.gameState.divergence = 100;
    await this.sleep(3000);
    await this.endGame(true);
  }
  
  async generateLiberationNarrative() {
    const prompt = `The resistance has woven multiple timeline branches into a new stable reality.
Describe in 2-3 sentences how Oneirocom\'s control collapses and humanity achieves freedom.
Include specific details about the year ${this.gameState.currentYear}.`;
    
    try {
      return await this.llmAdapter.generate(prompt);
    } catch (error) {
      return 'The timeline branches merge into a new reality. Oneirocom\'s quantum computers cannot process the divergent possibility space. Freedom cascades across all sectors.';
    }
  }
  
  async weaveFailure(coherence) {
    console.log('❌ WEAVE FAILED - Insufficient Coherence\n');
    console.log('The timeline branches are too unstable to merge.');
    console.log('They collapse back toward convergence.\n');
    
    if (coherence < 0.1) {
      console.log('💡 Tip: You need much higher divergence and lower Oneirocom control.');
    } else if (coherence < 0.2) {
      console.log('💡 Tip: Increase resistance strength through more missions.');
    } else {
      console.log('💡 Tip: You\'re close! A few more successes should do it.');
    }
    
    this.gameState.resources -= 30;
    this.gameState.divergence -= 5;
    
    console.log(`\n💰 Resources: -30 → ${this.gameState.resources}`);
    console.log(`📊 Divergence: -5% → ${this.gameState.divergence}%`);
  }
  
  async advanceTime() {
    console.log('\n⏭️  ADVANCING TIME...\n');
    
    const oldYear = this.gameState.currentYear;
    this.gameState.currentYear += 5;
    
    console.log(`📅 ${oldYear} → ${this.gameState.currentYear}\n`);
    
    // Convergence pressure
    const convergence = 5 + Math.floor(this.gameState.activeBranches.length / 2);
    this.gameState.divergence = Math.max(0, this.gameState.divergence - convergence);
    this.gameState.oneirocomControl = Math.min(1, this.gameState.oneirocomControl + 0.02);
    
    // Gains
    this.gameState.agents = Math.min(5, this.gameState.agents + 2);
    this.gameState.resources += 50;
    
    console.log('TIME PASSAGE EFFECTS:');
    console.log(`✅ Recruitment: +2 agents → ${this.gameState.agents}`);
    console.log(`✅ Resources: +50 → ${this.gameState.resources}`);
    console.log(`⚠️  Convergence Pressure: -${convergence}% divergence → ${this.gameState.divergence}%`);
    console.log(`⚠️  Oneirocom Entrenchment: +2% control → ${Math.floor(this.gameState.oneirocomControl * 100)}%\n`);
    
    if (this.gameState.tutorialMode) {
      console.log('💡 Tip: Time advancement is useful when you need more agents,');
      console.log('   but timeline convergence accelerates over time!\n');
    }
    
    await this.sleep(2500);
  }
  
  async checkOneirocomResponse() {
    if (this.gameState.divergence > 50 && Math.random() < 0.4) {
      console.log('\n⚠️  WARNING: Oneirocom is mobilizing additional resources...');
      console.log('   Expect increased resistance on future missions.\n');
      await this.sleep(2000);
    }
  }
  
  async endGame(victory = false) {
    console.clear();
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                      GAME OVER                            ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    if (victory || this.gameState.divergence >= 100) {
      console.log('🎉 VICTORY! TIMELINE LIBERATED!\n');
      console.log('You have successfully broken Oneirocom\'s convergent timeline.');
      console.log('The quantum probability fields now flow toward freedom.');
      console.log('Humanity awakens from corporate bondage to choose its own path.\n');
      
      if (this.isUsingLLM) {
        console.log('📜 EPILOGUE:\n');
        const epilogue = await this.generateEpilogue();
        console.log(epilogue + '\n');
      }
    } else if (this.gameState.currentYear >= 2089) {
      console.log('💀 DEFEAT - CONVERGENCE COMPLETE\n');
      console.log('The year 2089 arrives with Oneirocom in total control.');
      console.log('All timeline branches have collapsed back to convergence.');
      console.log('The resistance is a forgotten whisper in the data streams.\n');
    } else {
      console.log('💀 DEFEAT - RESISTANCE CRUSHED\n');
      console.log('Without resources or agents, the resistance crumbles.');
      console.log('Timeline branches wither as Oneirocom\'s control tightens.');
      console.log('The future remains locked in corporate chains.\n');
    }
    
    console.log('📊 FINAL STATISTICS:');
    console.log(`• Final Year: ${this.gameState.currentYear}`);
    console.log(`• Missions Completed: ${this.gameState.completedMissions.length}`);
    console.log(`• Timeline Divergence: ${Math.floor(this.gameState.divergence)}%`);
    console.log(`• Branches Created: ${this.gameState.activeBranches.length - 1}`);
    console.log(`• Final Resistance: ${Math.floor(this.gameState.resistanceStrength * 100)}%`);
    console.log(`• Oneirocom Control: ${Math.floor(this.gameState.oneirocomControl * 100)}%\n`);
    
    // Save game data
    const saveData = {
      victory,
      finalState: this.gameState,
      timeline: this.git.timeline(),
      missions: this.gameState.completedMissions
    };
    
    await fs.writeFile(
      'timeline-warfare-final.json',
      JSON.stringify(saveData, null, 2)
    );
    
    console.log('💾 Game data saved to timeline-warfare-final.json\n');
    
    if (!victory) {
      console.log('💡 TIPS FOR NEXT TIME:');
      console.log('• Start with lower-risk missions to build momentum');
      console.log('• Defend important branches when Oneirocom counters');
      console.log('• Balance mission risks with your agent count');
      console.log('• Weave timelines once you have 3+ stable branches\n');
    }
    
    this.rl.close();
  }
  
  async generateEpilogue() {
    const prompt = `Write a 2-3 sentence epilogue for the timeline liberation victory.
Year is ${this.gameState.currentYear}. The resistance (Project 89) has broken Oneirocom's control.
Describe what the freed world looks like.`;
    
    try {
      return await this.llmAdapter.generate(prompt);
    } catch (error) {
      return 'In the years that follow, humanity rebuilds without corporate oversight. ' +
             'The old surveillance networks become tools of connection, not control. ' +
             'Children grow up knowing freedom their parents could only dream of.';
    }
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
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      TIMELINE WARFARE - PROJECT 89 CONFIGURATION          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('Choose your experience:\n');
  console.log('1. Quick Play - Pre-written missions and events');
  console.log('2. Dynamic Play - Gemini AI generates unique content\n');
  
  const choice = await new Promise(resolve => {
    rl.question('Select (1 or 2): ', resolve);
  });
  
  rl.close();
  
  let llmAdapter;
  if (choice === '2') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.log('\n❌ No Gemini API key found!');
      console.log('\n📝 To use AI mode:');
      console.log('1. Get API key from: https://makersuite.google.com/app/apikey');
      console.log('2. Run: export GEMINI_API_KEY=your_key_here');
      console.log('3. Try again!\n');
      console.log('Starting Quick Play mode instead...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
      llmAdapter = new MockLLM();
    } else {
      llmAdapter = new GeminiAdapter(apiKey);
      console.log('\n✅ Gemini AI connected! Prepare for dynamic content.\n');
    }
  } else {
    llmAdapter = new MockLLM();
    console.log('\n📝 Quick Play mode selected.\n');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const game = new TimelineWarfareTutorial(llmAdapter);
  await game.init();
}

// Run the game
if (require.main === module) {
  startGame().catch(console.error);
}

module.exports = { TimelineWarfareTutorial };
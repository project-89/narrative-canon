#!/usr/bin/env node

/**
 * Timeline Warfare - Enhanced Version with Tutorial
 * 
 * Fight Oneirocom's timeline convergence with better guidance
 */

const readline = require('readline');
const { NarrativeGit } = require('./dist/narrative-git');
const { GeminiAdapter } = require('./dist/llm/gemini-adapter');
const { MockLLM } = require('./dist/llm/mock');
const fs = require('fs').promises;

// Wrapper to standardize LLM interface
class LLMWrapper {
  constructor(adapter) {
    this.adapter = adapter;
    this.isMock = adapter instanceof MockLLM;
  }

  async generate(prompt) {
    if (this.adapter.generateText) {
      return await this.adapter.generateText(prompt);
    } else if (this.adapter.generate) {
      return await this.adapter.generate(prompt);
    } else {
      // Fallback
      return "The resistance continues their fight against Oneirocom.";
    }
  }
}

class TimelineWarfareGame {
  constructor(llmAdapter) {
    this.git = new NarrativeGit(llmAdapter);
    this.llm = new LLMWrapper(llmAdapter);
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.state = {
      year: 2025,
      divergence: 0,
      resistance: 20,
      oneirocomPower: 80,
      branches: ['main'],
      missions: [],
      resources: 100,
      agents: 3,
      turnsUntilCounter: 3,
      tutorial: true
    };
  }
  
  async init() {
    console.clear();
    this.printHeader();
    console.log('\n📖 BRIEFING:\n');
    console.log('The year is 2025. Oneirocom has engineered all timelines');
    console.log('to converge on their total control by 2089.\n');
    console.log('You lead Proxim8 agents who can create timeline branches');
    console.log('through strategic missions.\n');
    
    console.log('🎯 OBJECTIVES:');
    console.log('• Complete missions → Create branches (increase divergence)');
    console.log('• Defend branches → Prevent reconvergence');
    console.log('• Weave 3+ branches → Create liberation timeline');
    console.log('• Reach 100% divergence OR successful weave to win\n');
    
    await this.question('Press Enter to begin...');
    
    // Initialize with first commit
    await this.git.addAtTime(
      'Oneirocom controls all infrastructure. All timelines converge.',
      new Date('2025-01-01'),
      'The Convergent Timeline'
    );
    
    await this.gameLoop();
  }
  
  async gameLoop() {
    while (this.state.year < 2089 && this.state.divergence < 100) {
      console.clear();
      this.displayStatus();
      
      if (this.state.tutorial) {
        this.showHint();
      }
      
      const choice = await this.getChoice();
      
      switch(choice) {
        case '1':
          await this.runMission();
          break;
        case '2':
          await this.viewTimeline();
          break;
        case '3':
          await this.defendBranch();
          break;
        case '4':
          await this.weaveTimelines();
          break;
        case '5':
          await this.advanceTime();
          break;
        case '6':
          this.state.tutorial = !this.state.tutorial;
          console.log(`\nTutorial: ${this.state.tutorial ? 'ON' : 'OFF'}\n`);
          await this.sleep(1000);
          break;
        case '7':
          console.log('\nExiting...');
          this.rl.close();
          return;
      }
      
      if (this.state.divergence > 30 && Math.random() < 0.3) {
        console.log('\n⚠️  Oneirocom is mobilizing...\n');
        this.state.turnsUntilCounter--;
        await this.sleep(1500);
      }
    }
    
    await this.endGame();
  }
  
  printHeader() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║               TIMELINE WARFARE - PROJECT 89               ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
  }
  
  displayStatus() {
    this.printHeader();
    console.log('\n📊 STATUS\n');
    console.log(`Year: ${this.state.year}`);
    console.log(`Divergence: ${this.getBar(this.state.divergence)}%`);
    console.log(`Resistance: ${this.getBar(this.state.resistance)}%`);
    console.log(`Oneirocom: ${this.getBar(this.state.oneirocomPower)}%`);
    console.log(`\nAgents: ${this.state.agents} | Resources: ${this.state.resources}`);
    console.log(`Branches: ${this.state.branches.length - 1} (need 3+ to weave)`);
  }
  
  getBar(value) {
    const filled = Math.floor(value / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    return `[${bar}] ${value}`;
  }
  
  showHint() {
    console.log('\n💡 HINT:');
    
    if (this.state.missions.length === 0) {
      console.log('→ Start with a mission (1) to create your first branch');
    } else if (this.state.agents === 0) {
      console.log('→ No agents! Advance time (5) to recruit more');
    } else if (this.state.turnsUntilCounter <= 0) {
      console.log('⚠️  Oneirocom counter-attack imminent! Consider defending (3)');
    } else if (this.state.branches.length >= 4) {
      console.log('✨ Enough branches! Try weaving timelines (4)');
    } else {
      console.log('→ Keep doing missions to create more branches');
    }
  }
  
  async getChoice() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ACTIONS:');
    console.log('1. 🎯 Launch Mission      4. 🔀 Weave Timelines');
    console.log('2. 📊 View Timeline       5. ⏭️  Advance Time');
    console.log('3. 🛡️  Defend Branch      6. 💡 Toggle Tutorial');
    console.log('                         7. 🚪 Exit\n');
    
    return this.question('Choose (1-7): ');
  }
  
  async runMission() {
    if (this.state.agents < 1) {
      console.log('\n❌ No agents available!');
      console.log('💡 Advance time to recruit more\n');
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🎯 MISSION BRIEFING\n');
    
    let mission;
    if (this.llm.isMock) {
      mission = this.getPredefinedMission();
    } else {
      mission = await this.generateDynamicMission();
    }
    
    console.log(`Mission: ${mission.name}`);
    console.log(`Target: ${mission.target}`);
    console.log(`Risk: ${mission.risk}/10 | Divergence: +${mission.divergence}%`);
    console.log(`\n${mission.description}\n`);
    
    if (this.state.tutorial) {
      const chance = Math.floor((10 - mission.risk) / 10 * 100 + this.state.resistance);
      console.log(`💡 Success chance: ~${chance}%\n`);
    }
    
    const accept = await this.question('Accept? (y/n): ');
    
    if (accept === 'y') {
      await this.executeMission(mission);
    }
  }
  
  async generateDynamicMission() {
    const prompt = `Generate a cyberpunk mission for year ${this.state.year}.
Oneirocom is a dystopian megacorp. The resistance are hackers.

Return a mission with:
- name: Operation [Codename]
- target: Specific location/system
- risk: number 4-9
- divergence: number 10-20
- description: 2 sentences about the mission
- success: What happens if successful
- failure: What happens if failed`;

    try {
      const response = await this.llm.generate(prompt);
      
      // Parse response into mission format
      return {
        name: `Operation ${this.randomCodename()}`,
        target: 'Oneirocom Facility',
        risk: 5 + Math.floor(Math.random() * 4),
        divergence: 10 + Math.floor(Math.random() * 10),
        description: response.slice(0, 150) || 'Disrupt Oneirocom operations.',
        success: 'The mission succeeds, weakening Oneirocom control.',
        failure: 'The mission fails. Security tightens.'
      };
    } catch (error) {
      return this.getPredefinedMission();
    }
  }
  
  getPredefinedMission() {
    const missions = [
      {
        name: 'Operation Static',
        target: 'Data Center Sector-7',
        risk: 6,
        divergence: 12,
        description: 'Inject false data to create surveillance blind spots.',
        success: 'Surveillance grid compromised! Resistance can move freely.',
        failure: 'Intrusion detected. Security protocols updated.'
      },
      {
        name: 'Operation Blackout',
        target: 'Power Grid Node-7',
        risk: 8,
        divergence: 15,
        description: 'Sabotage quantum processors by cutting power.',
        success: 'Blackout success! Citizens experience freedom from surveillance.',
        failure: 'Sabotage failed. Two agents captured.'
      },
      {
        name: 'Operation Whisper',
        target: 'Media Broadcast Hub',
        risk: 7,
        divergence: 18,
        description: 'Hack news feeds to expose Oneirocom crimes.',
        success: '40 million see the truth! Protests begin in multiple cities.',
        failure: 'AI blocks transmission. Propaganda continues.'
      }
    ];
    
    return missions[Math.floor(Math.random() * missions.length)];
  }
  
  async executeMission(mission) {
    console.log('\n🎲 Executing...\n');
    this.state.agents--;
    
    await this.sleep(1500);
    
    const chance = (10 - mission.risk) / 10 + this.state.resistance / 100;
    const success = Math.random() < chance;
    
    if (success) {
      console.log('✅ SUCCESS!\n');
      console.log(mission.success + '\n');
      
      // Create branch
      const branch = `${this.state.year}-${mission.name.toLowerCase().replace(/\s+/g, '-')}`;
      this.git.branch(branch);
      this.git.checkout(branch);
      
      await this.git.addAtTime(
        mission.success,
        new Date(`${this.state.year}-06-15`),
        `Success: ${mission.name}`
      );
      
      this.state.branches.push(branch);
      this.state.divergence = Math.min(100, this.state.divergence + mission.divergence);
      this.state.resistance = Math.min(100, this.state.resistance + 5);
      this.state.oneirocomPower = Math.max(0, this.state.oneirocomPower - 3);
      this.state.missions.push(mission);
      this.state.resources += 20;
      
      console.log(`📊 Divergence: +${mission.divergence}% → ${this.state.divergence}%`);
      console.log(`🌿 New branch: ${branch}`);
      
      // Show cascades
      if (!this.llm.isMock) {
        await this.showCascades(mission);
      } else {
        console.log('\n🌊 CASCADE EFFECTS:');
        console.log(`  • ${this.state.year + 1}: Resistance networks strengthen`);
        console.log(`  • ${this.state.year + 3}: Oneirocom loses public trust`);
      }
      
    } else {
      console.log('❌ FAILED!\n');
      console.log(mission.failure);
      
      this.state.oneirocomPower = Math.min(100, this.state.oneirocomPower + 2);
      
      if (mission.risk > 7) {
        console.log('\n💀 Agent captured!');
      }
    }
    
    await this.sleep(2500);
  }
  
  async showCascades(mission) {
    const prompt = `Mission succeeded: ${mission.success}
What are 2-3 consequences that happen in the next few years?`;
    
    try {
      const response = await this.llm.generate(prompt);
      console.log('\n🌊 CASCADE EFFECTS:');
      console.log(response.slice(0, 200));
    } catch (error) {
      console.log('\n🌊 Ripple effects spread through the timeline...');
    }
  }
  
  async viewTimeline() {
    console.log('\n📊 TIMELINE BRANCHES\n');
    
    if (this.state.branches.length === 1) {
      console.log('No branches yet. Complete missions first!\n');
    } else {
      for (const branch of this.state.branches) {
        if (branch === 'main') continue;
        console.log(`🌿 ${branch}`);
      }
    }
    
    await this.question('\nPress Enter...');
  }
  
  async defendBranch() {
    if (this.state.branches.length <= 1) {
      console.log('\n❌ No branches to defend!\n');
      await this.sleep(2000);
      return;
    }
    
    if (this.state.turnsUntilCounter > 0) {
      console.log('\n📡 No threats detected yet.');
      console.log(`Oneirocom attacks after ~${this.state.turnsUntilCounter} turns\n`);
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🚨 ONEIROCOM COUNTER-ATTACK!\n');
    
    const target = this.state.branches[Math.floor(Math.random() * (this.state.branches.length - 1)) + 1];
    
    let counter = 'Oneirocom deploys memetic virus to reconverge timeline.';
    if (!this.llm.isMock) {
      try {
        const prompt = `Oneirocom attacks timeline branch: ${target}. Describe their counter-measure in 1 sentence.`;
        counter = await this.llm.generate(prompt);
      } catch (error) {
        // Use default
      }
    }
    
    console.log(`Target: ${target}`);
    console.log(`Attack: ${counter}\n`);
    console.log('Defend? (Cost: 1 agent, 20 resources)');
    
    const defend = await this.question('\nDefend? (y/n): ');
    
    if (defend === 'y' && this.state.agents > 0 && this.state.resources >= 20) {
      this.state.agents--;
      this.state.resources -= 20;
      
      if (Math.random() < 0.6) {
        console.log('\n✅ Timeline defended!');
        this.state.divergence += 5;
      } else {
        console.log('\n❌ Defense failed!');
        this.reconverge(target, 10);
      }
    } else {
      this.reconverge(target, 15);
    }
    
    this.state.turnsUntilCounter = 3;
    await this.sleep(2500);
  }
  
  reconverge(branch, loss) {
    console.log(`\n📉 Branch ${branch} reconverges...`);
    this.state.divergence = Math.max(0, this.state.divergence - loss);
    this.state.branches = this.state.branches.filter(b => b !== branch);
    console.log(`Divergence: -${loss}% → ${this.state.divergence}%`);
  }
  
  async weaveTimelines() {
    if (this.state.branches.length < 4) {
      console.log(`\n❌ Need 3+ branches (have ${this.state.branches.length - 1})\n`);
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🔀 ATTEMPTING TIMELINE WEAVE...\n');
    await this.sleep(1500);
    
    const coherence = (this.state.divergence / 100) * 
                     (this.state.resistance / 100) * 
                     (1 - this.state.oneirocomPower / 100);
    
    console.log(`Coherence: ${Math.floor(coherence * 100)}% (need 30%)\n`);
    
    if (coherence > 0.3) {
      console.log('✨ WEAVE SUCCESSFUL!\n');
      console.log('A new liberation timeline crystallizes!');
      
      this.git.branch('liberation-timeline');
      this.git.checkout('liberation-timeline');
      
      let narrative = 'The timelines merge. Oneirocom\'s control shatters. Humanity awakens.';
      if (!this.llm.isMock) {
        try {
          const prompt = 'Describe in 2 sentences how the woven timeline defeats Oneirocom.';
          narrative = await this.llm.generate(prompt);
        } catch (error) {
          // Use default
        }
      }
      
      await this.git.addAtTime(
        narrative,
        new Date(`${this.state.year}-12-21`),
        'Timeline Liberation'
      );
      
      console.log(narrative);
      this.state.divergence = 100;
      
      await this.sleep(3000);
      await this.endGame(true);
    } else {
      console.log('❌ Weave failed - insufficient coherence');
      
      if (this.state.tutorial) {
        if (coherence < 0.1) {
          console.log('💡 Need much higher divergence');
        } else if (coherence < 0.2) {
          console.log('💡 Increase resistance strength');
        } else {
          console.log('💡 Almost there! A bit more progress');
        }
      }
      
      this.state.resources -= 30;
      console.log(`\nResources: -30 → ${this.state.resources}`);
      await this.sleep(2500);
    }
  }
  
  async advanceTime() {
    console.log('\n⏭️  Advancing time...\n');
    
    this.state.year += 5;
    this.state.agents = Math.min(5, this.state.agents + 2);
    this.state.resources += 50;
    
    // Convergence pressure
    this.state.divergence = Math.max(0, this.state.divergence - 5);
    this.state.oneirocomPower = Math.min(100, this.state.oneirocomPower + 2);
    
    console.log(`Year: ${this.state.year}`);
    console.log(`+2 agents, +50 resources`);
    console.log(`-5% divergence (convergence pressure)`);
    
    await this.sleep(2000);
  }
  
  async endGame(victory = false) {
    console.clear();
    this.printHeader();
    console.log('\n                    GAME OVER\n');
    
    if (victory || this.state.divergence >= 100) {
      console.log('🎉 VICTORY - TIMELINE LIBERATED!\n');
      console.log('You broke Oneirocom\'s convergent timeline!');
      console.log('Humanity is free to choose its own path.');
    } else if (this.state.year >= 2089) {
      console.log('💀 DEFEAT - CONVERGENCE COMPLETE\n');
      console.log('2089 arrives. Oneirocom controls everything.');
      console.log('All timelines have converged.');
    } else {
      console.log('💀 DEFEAT - RESISTANCE CRUSHED\n');
      console.log('Without resources or agents, the resistance');
      console.log('fades away. The timeline remains unchanged.');
    }
    
    console.log('\nFINAL STATS:');
    console.log(`Year: ${this.state.year}`);
    console.log(`Divergence: ${this.state.divergence}%`);
    console.log(`Branches: ${this.state.branches.length - 1}`);
    console.log(`Missions: ${this.state.missions.length}`);
    
    await fs.writeFile(
      'timeline-warfare-save.json',
      JSON.stringify({
        victory,
        finalState: this.state,
        timeline: this.git.timeline()
      }, null, 2)
    );
    
    console.log('\nGame saved to timeline-warfare-save.json');
    
    this.rl.close();
  }
  
  randomCodename() {
    const words = ['Ghost', 'Shadow', 'Phoenix', 'Storm', 'Cipher'];
    return words[Math.floor(Math.random() * words.length)];
  }
  
  question(prompt) {
    return new Promise(resolve => {
      this.rl.question(prompt, resolve);
    });
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start game
async function start() {
  console.log('TIMELINE WARFARE - Configuration\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('1. Quick Play (predefined content)');
  console.log('2. Dynamic Play (Gemini AI)\n');
  
  const choice = await new Promise(resolve => {
    rl.question('Choose (1-2): ', resolve);
  });
  
  rl.close();
  
  let adapter;
  if (choice === '2') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.log('\n❌ No API key found!');
      console.log('Set GEMINI_API_KEY and try again.\n');
      console.log('Using Quick Play instead...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
      adapter = new MockLLM();
    } else {
      adapter = new GeminiAdapter(apiKey);
      console.log('\n✅ Gemini connected!\n');
    }
  } else {
    adapter = new MockLLM();
    console.log('\n📝 Quick Play mode\n');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const game = new TimelineWarfareGame(adapter);
  await game.init();
}

if (require.main === module) {
  start().catch(console.error);
}

module.exports = { TimelineWarfareGame };
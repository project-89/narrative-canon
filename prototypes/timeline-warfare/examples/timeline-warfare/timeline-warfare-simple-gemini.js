#!/usr/bin/env node

/**
 * Timeline Warfare - Simple Gemini Version
 * 
 * Uses Gemini for dynamic content without the complex narrative extraction
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const readline = require('readline');
const fs = require('fs/promises');

const { GoogleGenerativeAI } = await import('@google/generative-ai');

class TimelineWarfareGemini {
  constructor(apiKey) {
    this.genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    this.model = this.genAI ? this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }) : null;
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.state = {
      year: 2025,
      divergence: 0,
      resistance: 20,
      oneirocomPower: 80,
      branches: [],
      missions: [],
      resources: 100,
      agents: 3,
      turnsUntilCounter: 3,
      tutorial: true,
      timeline: [] // Simple timeline tracking
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
    
    // Add initial timeline event
    this.addTimelineEvent('2025-01-01', 'Oneirocom controls all infrastructure. All timelines converge.');
    
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
    console.log(`Branches: ${this.state.branches.length} (need 3+ to weave)`);
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
    } else if (this.state.branches.length >= 3) {
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
    
    console.log('\n🎯 GENERATING MISSION...\n');
    
    let mission;
    if (this.model) {
      mission = await this.generateDynamicMission();
    } else {
      mission = this.getPredefinedMission();
    }
    
    console.log(`📋 ${mission.name}`);
    console.log(`🎯 Target: ${mission.target}`);
    console.log(`⚠️  Risk: ${mission.risk}/10 | 📈 Divergence: +${mission.divergence}%`);
    console.log(`\n📄 ${mission.description}\n`);
    
    if (this.state.tutorial) {
      const chance = Math.floor((10 - mission.risk) / 10 * 100 + this.state.resistance);
      console.log(`💡 Success chance: ~${chance}%\n`);
    }
    
    const accept = await this.question('Accept mission? (y/n): ');
    
    if (accept.toLowerCase() === 'y') {
      await this.executeMission(mission);
    }
  }
  
  async generateDynamicMission() {
    const prompt = `Generate a cyberpunk resistance mission for year ${this.state.year}.

Context: Oneirocom is a dystopian megacorp controlling surveillance and infrastructure. 
The resistance (Project 89) are hackers and freedom fighters in Neo Tokyo.
Current resistance strength: ${this.state.resistance}%

Create a mission with these exact fields (respond with ONLY these fields, one per line):
NAME: Operation [Codename]
TARGET: [Specific location or system]
RISK: [number between 4-9]
DIVERGENCE: [number between 10-20]
DESCRIPTION: [1-2 sentence mission briefing]
SUCCESS: [What happens if successful - 1 sentence]
FAILURE: [What happens if failed - 1 sentence]`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      
      // Parse the response
      const lines = response.split('\n');
      const mission = {
        name: 'Operation Shadow',
        target: 'Oneirocom Facility',
        risk: 6,
        divergence: 15,
        description: 'Infiltrate and disrupt Oneirocom operations.',
        success: 'Systems compromised, surveillance weakened.',
        failure: 'Mission failed, security tightened.'
      };
      
      // Extract fields from response
      lines.forEach(line => {
        if (line.startsWith('NAME:')) mission.name = line.substring(5).trim();
        else if (line.startsWith('TARGET:')) mission.target = line.substring(7).trim();
        else if (line.startsWith('RISK:')) mission.risk = parseInt(line.substring(5).trim()) || 6;
        else if (line.startsWith('DIVERGENCE:')) mission.divergence = parseInt(line.substring(11).trim()) || 15;
        else if (line.startsWith('DESCRIPTION:')) mission.description = line.substring(12).trim();
        else if (line.startsWith('SUCCESS:')) mission.success = line.substring(8).trim();
        else if (line.startsWith('FAILURE:')) mission.failure = line.substring(8).trim();
      });
      
      // Validate ranges
      mission.risk = Math.max(4, Math.min(9, mission.risk));
      mission.divergence = Math.max(10, Math.min(20, mission.divergence));
      
      return mission;
      
    } catch (error) {
      console.log('Using fallback mission...');
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
        description: 'Inject false data to create surveillance blind spots for resistance movements.',
        success: 'Surveillance grid compromised! Resistance cells can move freely.',
        failure: 'Intrusion detected. Security protocols updated.'
      },
      {
        name: 'Operation Blackout',
        target: 'Power Grid Node-7',
        risk: 8,
        divergence: 15,
        description: 'Sabotage quantum processors by cutting power for 48 hours.',
        success: 'Blackout cascades! Citizens experience freedom from surveillance.',
        failure: 'Sabotage failed. Two agents captured.'
      },
      {
        name: 'Operation Whisper',
        target: 'Media Broadcast Hub',
        risk: 7,
        divergence: 18,
        description: 'Hack news feeds to expose Oneirocom crimes to the public.',
        success: '40 million see the truth! Protests erupt across multiple cities.',
        failure: 'AI blocks transmission. Propaganda continues.'
      },
      {
        name: 'Operation Ghost',
        target: 'Employee Conditioning Center',
        risk: 5,
        divergence: 14,
        description: 'Free managers from neural conditioning to sabotage from within.',
        success: 'Dozens freed! Corporate efficiency drops 23% as insiders rebel.',
        failure: 'Security was tighter than intel suggested.'
      }
    ];
    
    return missions[Math.floor(Math.random() * missions.length)];
  }
  
  async executeMission(mission) {
    console.log('\n🎲 EXECUTING MISSION...\n');
    this.state.agents--;
    
    // Dramatic pause
    for (let i = 0; i < 3; i++) {
      await this.sleep(500);
      console.log('...');
    }
    
    const chance = (10 - mission.risk) / 10 + this.state.resistance / 100;
    const success = Math.random() < chance;
    
    if (success) {
      console.log('✅ MISSION SUCCESS!\n');
      console.log(mission.success + '\n');
      
      // Create branch
      const branch = `${this.state.year}-${mission.name.toLowerCase().replace(/\s+/g, '-')}`;
      this.state.branches.push(branch);
      this.addTimelineEvent(`${this.state.year}-06-15`, `${mission.name}: ${mission.success}`, branch);
      
      this.state.divergence = Math.min(100, this.state.divergence + mission.divergence);
      this.state.resistance = Math.min(100, this.state.resistance + 5);
      this.state.oneirocomPower = Math.max(0, this.state.oneirocomPower - 3);
      this.state.missions.push(mission);
      this.state.resources += 20;
      
      console.log(`📊 Divergence: +${mission.divergence}% → ${this.state.divergence}%`);
      console.log(`💰 Resources: +20 → ${this.state.resources}`);
      console.log(`🌿 New branch: ${branch}`);
      
      // Show cascades
      await this.showCascades(mission);
      
    } else {
      console.log('❌ MISSION FAILED!\n');
      console.log(mission.failure);
      
      this.state.oneirocomPower = Math.min(100, this.state.oneirocomPower + 2);
      
      if (mission.risk > 7) {
        console.log('\n💀 Agent captured!');
      }
      
      this.addTimelineEvent(`${this.state.year}-06-15`, `${mission.name} failed: ${mission.failure}`);
    }
    
    await this.sleep(2500);
  }
  
  async showCascades(mission) {
    console.log('\n🌊 CASCADE EFFECTS:');
    
    if (this.model) {
      const prompt = `The resistance succeeded: ${mission.success}
List 2-3 specific consequences that happen over the next 1-5 years.
Format: [YEAR]: [Consequence]
Current year: ${this.state.year}`;
      
      try {
        const result = await this.model.generateContent(prompt);
        const response = result.response.text();
        
        const lines = response.split('\n').filter(line => line.includes(':'));
        lines.slice(0, 3).forEach(line => {
          console.log(`  • ${line.trim()}`);
          
          // Add to timeline
          const yearMatch = line.match(/(\d{4}):/);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            const effect = line.split(':').slice(1).join(':').trim();
            this.addTimelineEvent(`${year}-01-01`, `Cascade: ${effect}`);
          }
        });
      } catch (error) {
        this.showDefaultCascades();
      }
    } else {
      this.showDefaultCascades();
    }
  }
  
  showDefaultCascades() {
    console.log(`  • ${this.state.year + 1}: Resistance networks strengthen`);
    console.log(`  • ${this.state.year + 3}: Oneirocom loses public trust`);
    this.addTimelineEvent(`${this.state.year + 1}-01-01`, 'Cascade: Resistance networks strengthen');
    this.addTimelineEvent(`${this.state.year + 3}-01-01`, 'Cascade: Oneirocom loses public trust');
  }
  
  async viewTimeline() {
    console.log('\n📊 TIMELINE VIEW\n');
    
    if (this.state.branches.length === 0) {
      console.log('No branches created yet. Complete missions first!\n');
    } else {
      console.log(`Active Branches: ${this.state.branches.length}\n`);
      
      // Show branches
      this.state.branches.forEach(branch => {
        console.log(`🌿 ${branch}`);
      });
      
      console.log('\nRecent Timeline Events:');
      // Show last 5 timeline events
      this.state.timeline.slice(-5).forEach(event => {
        console.log(`  ${event.date}: ${event.description}`);
      });
    }
    
    await this.question('\nPress Enter to continue...');
  }
  
  async defendBranch() {
    if (this.state.branches.length === 0) {
      console.log('\n❌ No branches to defend!\n');
      await this.sleep(2000);
      return;
    }
    
    if (this.state.turnsUntilCounter > 0) {
      console.log('\n📡 No immediate threats detected.');
      console.log(`💡 Oneirocom typically counters after ${this.state.turnsUntilCounter} more actions.\n`);
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🚨 ONEIROCOM COUNTER-ATTACK!\n');
    
    const target = this.state.branches[Math.floor(Math.random() * this.state.branches.length)];
    
    let counter = 'Oneirocom deploys memetic virus to reconverge timeline.';
    if (this.model) {
      try {
        const prompt = `Oneirocom attacks timeline branch: ${target}
Describe their dystopian counter-measure in 1 sentence.`;
        
        const result = await this.model.generateContent(prompt);
        counter = result.response.text().trim();
      } catch (error) {
        // Use default
      }
    }
    
    console.log(`🎯 Target: ${target}`);
    console.log(`⚔️  ${counter}\n`);
    console.log('Defense costs: 1 agent, 20 resources');
    
    const defend = await this.question('\nDefend the branch? (y/n): ');
    
    if (defend.toLowerCase() === 'y' && this.state.agents > 0 && this.state.resources >= 20) {
      this.state.agents--;
      this.state.resources -= 20;
      
      console.log('\n🛡️  DEFENDING...\n');
      await this.sleep(1500);
      
      if (Math.random() < 0.6) {
        console.log('✅ Defense successful! Branch preserved.');
        this.state.divergence += 5;
        this.addTimelineEvent(`${this.state.year}-09-01`, `Defended ${target} from Oneirocom attack`);
      } else {
        console.log('❌ Defense failed! Branch reconverging...');
        this.reconverge(target, 10);
      }
    } else {
      console.log('\n📉 Unable to defend. Branch reconverging...');
      this.reconverge(target, 15);
    }
    
    this.state.turnsUntilCounter = 3;
    await this.sleep(2500);
  }
  
  reconverge(branch, loss) {
    this.state.divergence = Math.max(0, this.state.divergence - loss);
    this.state.branches = this.state.branches.filter(b => b !== branch);
    console.log(`\n📊 Divergence: -${loss}% → ${this.state.divergence}%`);
    this.addTimelineEvent(`${this.state.year}-09-15`, `Branch ${branch} reconverged by Oneirocom`);
  }
  
  async weaveTimelines() {
    if (this.state.branches.length < 3) {
      console.log(`\n❌ INSUFFICIENT BRANCHES\n`);
      console.log(`Current: ${this.state.branches.length} branches`);
      console.log(`Required: 3+ branches\n`);
      console.log('💡 Complete more successful missions.\n');
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🔀 ATTEMPTING TIMELINE WEAVE...\n');
    console.log('Calculating quantum coherence...\n');
    await this.sleep(1500);
    
    const coherence = (this.state.divergence / 100) * 
                     (this.state.resistance / 100) * 
                     (1 - this.state.oneirocomPower / 100);
    
    console.log('COHERENCE FACTORS:');
    console.log(`• Divergence: ${this.state.divergence}%`);
    console.log(`• Resistance: ${this.state.resistance}%`);
    console.log(`• Oneirocom Weakness: ${100 - this.state.oneirocomPower}%`);
    console.log(`\n📊 Total Coherence: ${Math.floor(coherence * 100)}% (need 30%)\n`);
    
    await this.sleep(2000);
    
    if (coherence > 0.3) {
      console.log('✨ WEAVE SUCCESSFUL!\n');
      console.log('Timeline branches resonate in quantum harmony...');
      console.log('A new liberation timeline crystallizes!\n');
      
      let narrative = 'The woven timelines create a cascade of freedom. Oneirocom\'s control matrix shatters across all realities.';
      if (this.model) {
        try {
          const prompt = 'Describe in 2 sentences how the woven timeline defeats Oneirocom and frees humanity.';
          const result = await this.model.generateContent(prompt);
          narrative = result.response.text().trim();
        } catch (error) {
          // Use default
        }
      }
      
      console.log(narrative);
      this.addTimelineEvent(`${this.state.year}-12-21`, `LIBERATION: ${narrative}`);
      
      this.state.divergence = 100;
      await this.sleep(3000);
      await this.endGame(true);
      
    } else {
      console.log('❌ WEAVE FAILED - Insufficient coherence\n');
      console.log('The branches are too unstable to merge.');
      
      if (this.state.tutorial) {
        if (coherence < 0.1) {
          console.log('\n💡 You need much higher divergence and lower Oneirocom control.');
        } else if (coherence < 0.2) {
          console.log('\n💡 Increase resistance strength through more missions.');
        } else {
          console.log('\n💡 You\'re close! A few more successes should do it.');
        }
      }
      
      this.state.resources -= 30;
      console.log(`\n💰 Resources: -30 → ${this.state.resources}`);
      await this.sleep(2500);
    }
  }
  
  async advanceTime() {
    console.log('\n⏭️  ADVANCING TIME...\n');
    
    const oldYear = this.state.year;
    this.state.year += 5;
    this.state.agents = Math.min(5, this.state.agents + 2);
    this.state.resources += 50;
    
    // Convergence pressure
    const convergence = 5 + Math.floor(this.state.branches.length / 2);
    this.state.divergence = Math.max(0, this.state.divergence - convergence);
    this.state.oneirocomPower = Math.min(100, this.state.oneirocomPower + 2);
    
    console.log(`📅 ${oldYear} → ${this.state.year}\n`);
    console.log('TIME PASSAGE EFFECTS:');
    console.log(`✅ Recruitment: +2 agents → ${this.state.agents}`);
    console.log(`✅ Resources: +50 → ${this.state.resources}`);
    console.log(`⚠️  Convergence: -${convergence}% divergence → ${this.state.divergence}%`);
    console.log(`⚠️  Entrenchment: +2% Oneirocom → ${this.state.oneirocomPower}%`);
    
    this.addTimelineEvent(`${this.state.year}-01-01`, `Time advances. Convergence pressure increases.`);
    
    if (this.state.tutorial) {
      console.log('\n💡 Time advancement helps when you need agents,');
      console.log('   but timeline convergence accelerates!');
    }
    
    await this.sleep(2500);
  }
  
  async endGame(victory = false) {
    console.clear();
    this.printHeader();
    console.log('\n                    GAME OVER\n');
    
    if (victory || this.state.divergence >= 100) {
      console.log('🎉 VICTORY - TIMELINE LIBERATED!\n');
      console.log('You successfully broke Oneirocom\'s convergent timeline!');
      console.log('The quantum probability fields now flow toward freedom.');
      console.log('Humanity awakens to choose its own destiny.\n');
      
      if (this.model) {
        console.log('📜 EPILOGUE:\n');
        try {
          const prompt = `Write a 2-3 sentence epilogue for humanity's liberation from Oneirocom in ${this.state.year}.`;
          const result = await this.model.generateContent(prompt);
          console.log(result.response.text().trim() + '\n');
        } catch (error) {
          console.log('In the years that follow, humanity rebuilds without corporate chains.\n');
        }
      }
    } else if (this.state.year >= 2089) {
      console.log('💀 DEFEAT - CONVERGENCE COMPLETE\n');
      console.log('The year 2089 arrives with Oneirocom in total control.');
      console.log('All timelines have collapsed to the convergent path.');
      console.log('The resistance becomes a forgotten echo.\n');
    } else {
      console.log('💀 DEFEAT - RESISTANCE CRUSHED\n');
      console.log('Without resources or agents, the resistance crumbles.');
      console.log('Timeline branches wither as convergence accelerates.');
      console.log('The future remains locked in corporate dominion.\n');
    }
    
    console.log('📊 FINAL STATISTICS:');
    console.log(`• Final Year: ${this.state.year}`);
    console.log(`• Missions Completed: ${this.state.missions.length}`);
    console.log(`• Timeline Divergence: ${this.state.divergence}%`);
    console.log(`• Branches Created: ${this.state.branches.length}`);
    console.log(`• Final Resistance: ${this.state.resistance}%`);
    console.log(`• Oneirocom Control: ${this.state.oneirocomPower}%`);
    
    // Save game data
    await fs.writeFile(
      'timeline-warfare-final.json',
      JSON.stringify({
        victory,
        finalState: this.state,
        timeline: this.state.timeline
      }, null, 2)
    );
    
    console.log('\n💾 Game saved to timeline-warfare-final.json');
    
    if (!victory && this.state.tutorial) {
      console.log('\n💡 TIPS FOR NEXT TIME:');
      console.log('• Start with lower-risk missions (5-6)');
      console.log('• Defend important branches when attacked');
      console.log('• Balance agents with mission risks');
      console.log('• Aim for 3+ branches before weaving');
    }
    
    this.rl.close();
  }
  
  addTimelineEvent(date, description, branch = 'main') {
    this.state.timeline.push({
      date,
      description,
      branch,
      year: parseInt(date.split('-')[0])
    });
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
  if (!process.stdin.isTTY) {
    console.log('⚠️  Timeline Warfare Gemini requires an interactive terminal.');
    console.log('    Run this script directly from a shell to play the full game.');
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         TIMELINE WARFARE - GEMINI EDITION                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('This version can use Google Gemini AI for dynamic content.\n');
  console.log('1. Play without AI (predefined missions)');
  console.log('2. Play with Gemini AI (dynamic missions)\n');
  
  const choice = await new Promise(resolve => {
    rl.question('Choose (1-2): ', resolve);
  });
  
  rl.close();
  
  let apiKey = null;
  if (choice === '2') {
    apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.log('\n❌ No API key found!');
      console.log('\n📝 To use Gemini:');
      console.log('1. Get API key from: https://makersuite.google.com/app/apikey');
      console.log('2. Run: export GEMINI_API_KEY=your_key_here');
      console.log('3. Try again!\n');
      console.log('Starting without AI...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log('\n✅ Gemini AI connected! Prepare for dynamic content.\n');
    }
  } else {
    console.log('\n📝 Playing without AI.\n');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const game = new TimelineWarfareGemini(apiKey);
  await game.init();
}

const isMain = process.argv[1] === __filename;

if (isMain) {
  start().catch(console.error);
}

export { TimelineWarfareGemini };

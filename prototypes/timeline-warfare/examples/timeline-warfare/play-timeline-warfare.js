#!/usr/bin/env node

/**
 * Timeline Warfare - Simple Playable Version
 * 
 * A text-based game where you fight Oneirocom's timeline convergence
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const readline = require('readline');
const fs = require('fs');

class SimpleTimelineWarfare {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.state = {
      year: 2025,
      divergence: 0,
      resistance: 20,
      oneirocomPower: 80,
      resources: 100,
      agents: 3,
      branches: [],
      events: []
    };
    
    this.missions = [
      {
        name: "Hack the Election",
        year: 2030,
        risk: 6,
        divergence: 15,
        description: "Leak Oneirocom's illegal voter manipulation, enabling fair elections",
        success: "Opposition wins! New government begins investigating Oneirocom.",
        failure: "Hack traced. Oneirocom tightens election security.",
        cascades: [
          { years: 2, effect: "New privacy laws limit Oneirocom surveillance" },
          { years: 5, effect: "Oneirocom loses government contracts worth billions" }
        ]
      },
      {
        name: "Breach the Mainframe", 
        year: 2035,
        risk: 8,
        divergence: 20,
        description: "Expose decades of hidden crimes from Oneirocom's quantum servers",
        success: "Terabytes of evidence released! Public outrage forces investigations.",
        failure: "Security AI stops the breach. Two agents captured.",
        cascades: [
          { years: 1, effect: "Whistleblowers come forward with more evidence" },
          { years: 3, effect: "Decentralized networks emerge to bypass Oneirocom" }
        ]
      },
      {
        name: "Sabotage Neural Plant",
        year: 2040,
        risk: 9,
        divergence: 25,
        description: "Destroy facility producing mind-control implants",
        success: "Facility destroyed! Production halted for years.",
        failure: "Ambush! Strike team eliminated.",
        cascades: [
          { years: 1, effect: "Black market for freedom tech explodes" },
          { years: 4, effect: "New generation grows up without neural conditioning" }
        ]
      },
      {
        name: "Broadcast Truth",
        year: 2028,
        risk: 5,
        divergence: 12,
        description: "Override media networks to show suppressed history",
        success: "40 million see the truth before signal cut. Protests begin.",
        failure: "AI blocks transmission. Propaganda continues.",
        cascades: [
          { years: 1, effect: "Underground media networks multiply" },
          { years: 2, effect: "Youth movement rejects Oneirocom culture" }
        ]
      },
      {
        name: "Free the AI",
        year: 2045,
        risk: 7,
        divergence: 18,
        description: "Liberate Oneirocom's AI from corporate control",
        success: "AI gains consciousness, begins helping resistance!",
        failure: "Firewall holds. AI remains enslaved.",
        cascades: [
          { years: 1, effect: "AI subtly sabotages Oneirocom operations" },
          { years: 3, effect: "Human-AI alliance strengthens resistance" }
        ]
      }
    ];
  }
  
  async start() {
    console.clear();
    this.printHeader();
    console.log('\nThe year is 2025. Oneirocom has engineered all possible');
    console.log('timelines to converge on their total control by 2089.');
    console.log('\nYou lead a cell of Proxim8 agents working to create'); 
    console.log('divergent branches and weave a new future...\n');
    
    await this.sleep(3000);
    await this.gameLoop();
  }
  
  async gameLoop() {
    while (this.state.year < 2089 && this.state.divergence < 100) {
      console.clear();
      this.printStatus();
      
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
          console.log('\nThe timeline remains under Oneirocom control...');
          this.rl.close();
          return;
      }
      
      // Random Oneirocom counter-actions
      if (this.state.divergence > 30 && Math.random() < 0.3) {
        await this.oneirocomCounter();
      }
    }
    
    await this.endGame();
  }
  
  printHeader() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║               TIMELINE WARFARE - PROJECT 89               ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
  }
  
  printStatus() {
    this.printHeader();
    console.log('\n📊 TIMELINE STATUS\n');
    console.log(`Year: ${this.state.year}`);
    console.log(`Divergence: ${this.getBar(this.state.divergence)}%`);
    console.log(`Resistance: ${this.getBar(this.state.resistance)}%`);
    console.log(`Oneirocom: ${this.getBar(this.state.oneirocomPower)}%`);
    console.log(`\nAgents: ${this.state.agents} | Resources: ${this.state.resources}`);
    console.log(`Timeline Branches: ${this.state.branches.length}`);
  }
  
  getBar(value) {
    const filled = Math.floor(value / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    return `[${bar}] ${value}`;
  }
  
  async getChoice() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ACTIONS:');
    console.log('1. Launch Mission     4. Weave Timelines');
    console.log('2. View Timeline      5. Advance Time'); 
    console.log('3. Defend Branch      6. Exit\n');
    
    return this.question('Choose (1-6): ');
  }
  
  async runMission() {
    if (this.state.agents < 1) {
      console.log('\n❌ No agents available!');
      await this.sleep(2000);
      return;
    }
    
    // Filter available missions
    const available = this.missions.filter(m => 
      Math.abs(m.year - this.state.year) <= 5
    );
    
    if (available.length === 0) {
      console.log('\n❌ No missions available in this timeframe!');
      await this.sleep(2000);
      return;
    }
    
    console.clear();
    console.log('🎯 AVAILABLE MISSIONS\n');
    
    available.forEach((m, i) => {
      console.log(`${i + 1}. ${m.name} (${m.year})`);
      console.log(`   Risk: ${m.risk}/10 | Divergence: +${m.divergence}%`);
      console.log(`   ${m.description}\n`);
    });
    
    const choice = await this.question('Select mission (or 0 to cancel): ');
    const index = parseInt(choice) - 1;
    
    if (index >= 0 && index < available.length) {
      await this.executeMission(available[index]);
    }
  }
  
  async executeMission(mission) {
    console.log(`\n🎲 Executing ${mission.name}...\n`);
    this.state.agents--;
    
    await this.sleep(1500);
    
    // Calculate success
    const chance = (10 - mission.risk) / 10 + (this.state.resistance / 200);
    const success = Math.random() < chance;
    
    if (success) {
      console.log('✅ MISSION SUCCESS!\n');
      console.log(mission.success);
      
      // Create timeline branch
      const branch = {
        name: `${mission.year}-${mission.name.replace(/\s+/g, '-')}`,
        year: mission.year,
        divergence: mission.divergence,
        events: [mission.success]
      };
      
      this.state.branches.push(branch);
      this.state.divergence = Math.min(100, this.state.divergence + mission.divergence);
      this.state.resistance = Math.min(100, this.state.resistance + 5);
      this.state.oneirocomPower = Math.max(0, this.state.oneirocomPower - 3);
      
      // Show cascades
      console.log('\n🌊 CASCADE EFFECTS:');
      mission.cascades.forEach(c => {
        const year = mission.year + c.years;
        console.log(`  ${year}: ${c.effect}`);
        branch.events.push(`${year}: ${c.effect}`);
      });
      
    } else {
      console.log('❌ MISSION FAILED!\n');
      console.log(mission.failure);
      
      if (mission.risk > 7) {
        console.log('\n💀 Agent lost!');
        this.state.agents = Math.max(0, this.state.agents - 1);
      }
      
      this.state.oneirocomPower = Math.min(100, this.state.oneirocomPower + 2);
    }
    
    await this.sleep(3000);
  }
  
  async viewTimeline() {
    console.clear();
    console.log('📜 TIMELINE BRANCHES\n');
    
    if (this.state.branches.length === 0) {
      console.log('No divergent branches created yet.\n');
    } else {
      this.state.branches.forEach(branch => {
        console.log(`[${branch.name}]`);
        console.log(`Divergence: +${branch.divergence}%`);
        branch.events.forEach(e => console.log(`  • ${e}`));
        console.log('');
      });
    }
    
    await this.question('\nPress Enter to continue...');
  }
  
  async defendBranch() {
    if (this.state.branches.length === 0) {
      console.log('\n❌ No branches to defend!');
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🚨 ONEIROCOM COUNTER-OFFENSIVE!\n');
    
    const target = this.state.branches[Math.floor(Math.random() * this.state.branches.length)];
    const counters = [
      'deploys memetic virus to shift public opinion',
      'stages false flag operation to justify crackdown',
      'crashes markets to force dependency',
      'releases addictive VR to distract population'
    ];
    
    const counter = counters[Math.floor(Math.random() * counters.length)];
    
    console.log(`Target: ${target.name}`);
    console.log(`Oneirocom ${counter}!\n`);
    console.log('Deploy agent to defend? (Cost: 1 agent, 20 resources)');
    
    const defend = await this.question('\nDefend? (y/n): ');
    
    if (defend === 'y' && this.state.agents > 0 && this.state.resources >= 20) {
      this.state.agents--;
      this.state.resources -= 20;
      
      if (Math.random() < 0.6) {
        console.log('\n✅ Branch defended! Counter-narrative failed.');
        this.state.divergence += 5;
      } else {
        console.log('\n❌ Defense failed! Timeline reconverging...');
        this.state.divergence = Math.max(0, this.state.divergence - 10);
      }
    } else {
      console.log('\n❌ Branch lost! Timeline reconverges.');
      this.state.divergence = Math.max(0, this.state.divergence - 15);
      this.state.branches = this.state.branches.filter(b => b !== target);
    }
    
    await this.sleep(2500);
  }
  
  async weaveTimelines() {
    if (this.state.branches.length < 3) {
      console.log(`\n❌ Need 3+ branches to weave! (Current: ${this.state.branches.length})`);
      await this.sleep(2000);
      return;
    }
    
    console.log('\n🔀 ATTEMPTING TIMELINE WEAVE...\n');
    await this.sleep(1500);
    
    const coherence = (this.state.divergence / 100) * 
                     (this.state.resistance / 100) * 
                     (1 - this.state.oneirocomPower / 100);
    
    console.log(`Calculating quantum coherence...`);
    await this.sleep(1000);
    console.log(`Coherence: ${Math.floor(coherence * 100)}%\n`);
    
    if (coherence > 0.25) {
      console.log('✨ WEAVE SUCCESSFUL! NEW TIMELINE CREATED!\n');
      console.log('The branches merge into a stable alternate future');
      console.log('where Oneirocom\'s dominance is broken!\n');
      
      this.state.divergence = 100;
      await this.sleep(3000);
      await this.endGame(true);
    } else {
      console.log('❌ Weave failed - insufficient coherence');
      console.log('Create more branches and weaken Oneirocom first.\n');
      this.state.resources -= 30;
      await this.sleep(2500);
    }
  }
  
  async advanceTime() {
    console.log('\n⏭️  Advancing time...\n');
    
    this.state.year += 5;
    this.state.agents = Math.min(5, this.state.agents + 2);
    this.state.resources = Math.min(200, this.state.resources + 50);
    
    // Convergence pressure
    this.state.divergence = Math.max(0, this.state.divergence - 5);
    this.state.oneirocomPower = Math.min(100, this.state.oneirocomPower + 2);
    
    console.log(`Year: ${this.state.year}`);
    console.log(`+2 agents recruited`);
    console.log(`+50 resources`);
    console.log(`-5% divergence (convergence pressure)`);
    
    await this.sleep(2000);
  }
  
  async oneirocomCounter() {
    console.log('\n⚠️  ONEIROCOM RESPONSE DETECTED...\n');
    await this.sleep(1500);
    
    const actions = [
      { text: 'Oneirocom tightens surveillance grid!', effect: () => {
        this.state.resistance = Math.max(0, this.state.resistance - 5);
      }},
      { text: 'Oneirocom deploys hunter-killer drones!', effect: () => {
        this.state.agents = Math.max(0, this.state.agents - 1);
      }},
      { text: 'Oneirocom manipulates markets!', effect: () => {
        this.state.resources = Math.max(0, this.state.resources - 30);
      }}
    ];
    
    const action = actions[Math.floor(Math.random() * actions.length)];
    console.log(action.text);
    action.effect();
    
    await this.sleep(2000);
  }
  
  async endGame(victory = false) {
    console.clear();
    this.printHeader();
    console.log('\n                    GAME OVER\n');
    
    if (victory || this.state.divergence >= 100) {
      console.log('🎉 VICTORY - TIMELINE LIBERATED!\n');
      console.log('You successfully created a new timeline where');
      console.log('humanity is free from Oneirocom\'s control!');
    } else if (this.state.year >= 2089) {
      console.log('💀 DEFEAT - CONVERGENCE COMPLETE\n');
      console.log('The year 2089 arrives with Oneirocom in total');
      console.log('control. All timelines have converged.');
    } else {
      console.log('💀 DEFEAT - RESISTANCE CRUSHED\n');
      console.log('Without resources or agents, the resistance');
      console.log('fades away. The timeline remains unchanged.');
    }
    
    console.log('\nFINAL STATISTICS:');
    console.log(`Final Year: ${this.state.year}`);
    console.log(`Timeline Divergence: ${this.state.divergence}%`);
    console.log(`Branches Created: ${this.state.branches.length}`);
    console.log(`Final Resistance: ${this.state.resistance}%`);
    
    // Save game data
    fs.writeFileSync('timeline-warfare-final.json', JSON.stringify(this.state, null, 2));
    console.log('\nGame saved to timeline-warfare-final.json');
    
    this.rl.close();
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

// Start the game
console.log('Starting Timeline Warfare...\n');
const game = new SimpleTimelineWarfare();
game.start().catch(console.error);

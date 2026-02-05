#!/usr/bin/env node

/**
 * Timeline Warfare - Simple Standalone Version
 * 
 * A simplified version that works reliably without complex extraction
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config();
const readline = require('readline');
const chalk = require('chalk');

class SimpleTimelineWarfare {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.state = {
      divergence: 15,
      turn: 1,
      missions: 0,
      defenses: 0
    };
    
    this.useAI = !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);
  }

  async play() {
    console.clear();
    this.showTitle();
    await this.showIntro();
    
    while (this.state.divergence > 0 && this.state.divergence < 89) {
      await this.showStatus();
      const action = await this.getAction();
      
      switch (action) {
        case '1':
          await this.runMission();
          break;
        case '2':
          await this.defendTimeline();
          break;
        case '3':
          await this.viewIntel();
          break;
        case '4':
          console.log(chalk.gray('\nExiting simulation...'));
          this.rl.close();
          return;
      }
      
      this.state.turn++;
    }
    
    await this.showEndGame();
    this.rl.close();
  }

  showTitle() {
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('                   TIMELINE WARFARE                       ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray('              Project 89 Resistance Simulator             ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════╝'));
    console.log();
  }

  async showIntro() {
    const intro = `
${chalk.bold('The year is 2089.')}

You are ${chalk.cyan('Agent Chen')}, a Project 89 operative with the rare ability to 
perceive timeline branches. Oneirocom Corporation has enslaved reality 
itself through the ${chalk.red('Convergence Protocol')}, systematically eliminating 
all alternate timelines.

Your mission: Increase timeline divergence to ${chalk.green('89%')} - the critical 
threshold where Oneirocom's control shatters and all possible futures 
become accessible again.

From your safehouse in Neo-Tokyo's Sector 7, you must:
• Launch resistance missions to increase divergence
• Defend against Oneirocom's convergence attacks  
• Build the network that will liberate all timelines

The fate of infinite realities rests in your hands...
    `;
    
    console.log(intro);
    await this.pause();
  }

  async showStatus() {
    console.log(chalk.yellow('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold(`Turn ${this.state.turn} - Timeline Status`));
    console.log(`Divergence: ${this.getDivergenceBar()} ${this.state.divergence}%`);
    console.log(chalk.gray(`Missions: ${this.state.missions} | Defenses: ${this.state.defenses}`));
    
    if (this.state.divergence >= 70) {
      console.log(chalk.yellow('⚠️  High divergence detected! Expect increased Oneirocom activity.'));
    } else if (this.state.divergence <= 20) {
      console.log(chalk.red('⚠️  Critical: Timeline approaching full convergence!'));
    }
  }

  getDivergenceBar() {
    const filled = Math.floor(this.state.divergence / 5);
    const empty = 20 - filled;
    const color = this.state.divergence >= 70 ? chalk.green : 
                   this.state.divergence >= 40 ? chalk.yellow : chalk.red;
    return color('[' + '█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + color(']');
  }

  async getAction() {
    console.log(chalk.bold('\nActions:'));
    console.log('1. Launch Resistance Mission');
    console.log('2. Defend Against Convergence');
    console.log('3. View Intelligence Report');
    console.log('4. Exit Simulation');
    
    return new Promise(resolve => {
      this.rl.question(chalk.yellow('Your choice: '), resolve);
    });
  }

  async runMission() {
    console.log(chalk.bold.cyan('\n🎯 RESISTANCE MISSION'));
    
    const missions = [
      {
        name: 'Data Heist',
        desc: 'Infiltrate Oneirocom servers to steal Timeline Lock blueprints.',
        risk: 0.3
      },
      {
        name: 'Glitch Amplification', 
        desc: 'Enhance reality glitches to create new timeline branches.',
        risk: 0.4
      },
      {
        name: 'Recruit Defector',
        desc: 'Extract a Oneirocom scientist who wants to join the resistance.',
        risk: 0.5
      },
      {
        name: 'Sabotage Convergence Node',
        desc: 'Destroy a key node in the Convergence Protocol network.',
        risk: 0.6
      }
    ];
    
    const mission = missions[Math.floor(Math.random() * missions.length)];
    console.log(`\nMission: ${chalk.bold(mission.name)}`);
    console.log(chalk.gray(mission.desc));
    
    console.log('\nApproach:');
    console.log('1. Stealth - Lower risk, lower reward');
    console.log('2. Balanced - Medium risk, medium reward');
    console.log('3. Aggressive - High risk, high reward');
    
    const approach = await new Promise(resolve => {
      this.rl.question(chalk.yellow('Choose (1-3): '), resolve);
    });
    
    const riskMod = approach === '1' ? -0.1 : approach === '3' ? 0.1 : 0;
    const rewardMod = approach === '1' ? 0.5 : approach === '3' ? 1.5 : 1;
    
    const success = Math.random() > (mission.risk + riskMod);
    
    if (success) {
      const gain = Math.floor((8 + Math.random() * 7) * rewardMod);
      this.state.divergence += gain;
      this.state.missions++;
      
      console.log(chalk.green(`\n✓ Mission Success!`));
      console.log(chalk.green(`Timeline divergence increased by ${gain}%`));
      
      if (this.state.divergence > 100) this.state.divergence = 100;
    } else {
      console.log(chalk.red(`\n✗ Mission Failed!`));
      console.log(chalk.red(`Oneirocom forces intercepted your operation.`));
    }
    
    await this.pause();
  }

  async defendTimeline() {
    console.log(chalk.bold.red('\n⚠️  CONVERGENCE ATTACK DETECTED!'));
    
    const attacks = [
      'Probability Wave Collapse - Oneirocom is forcing quantum states to converge',
      'Timeline Enforcement Raid - Armed units are targeting this branch',
      'Chrono-Viral Infection - A temporal virus is rewriting past events',
      'Reality Anchor Sabotage - They\'re destabilizing our timeline anchors'
    ];
    
    console.log(chalk.white(attacks[Math.floor(Math.random() * attacks.length)]));
    
    console.log('\nDefense Options:');
    console.log('1. Activate Reality Shields');
    console.log('2. Launch Counter-Attack');
    console.log('3. Emergency Timeline Jump');
    
    const defense = await new Promise(resolve => {
      this.rl.question(chalk.yellow('Choose (1-3): '), resolve);
    });
    
    const defenseChance = defense === '1' ? 0.7 : defense === '2' ? 0.5 : 0.6;
    const success = Math.random() < defenseChance;
    
    if (success) {
      console.log(chalk.green('\n✓ Timeline Defended!'));
      console.log(chalk.green('The convergence attack has been repelled.'));
      this.state.defenses++;
    } else {
      const loss = 10 + Math.floor(Math.random() * 10);
      this.state.divergence -= loss;
      console.log(chalk.red(`\n✗ Defense Failed!`));
      console.log(chalk.red(`Timeline divergence reduced by ${loss}%`));
    }
    
    await this.pause();
  }

  async viewIntel() {
    console.log(chalk.bold.cyan('\n📊 INTELLIGENCE REPORT'));
    console.log(chalk.gray('─'.repeat(50)));
    
    console.log(chalk.bold('\nMission Statistics:'));
    console.log(`Successful Missions: ${this.state.missions}`);
    console.log(`Successful Defenses: ${this.state.defenses}`);
    console.log(`Current Turn: ${this.state.turn}`);
    
    console.log(chalk.bold('\nTimeline Analysis:'));
    if (this.state.divergence >= 70) {
      console.log(chalk.green('• Multiple stable branches detected'));
      console.log(chalk.green('• Oneirocom control weakening'));
      console.log(chalk.green('• Reality glitches increasing'));
    } else if (this.state.divergence >= 40) {
      console.log(chalk.yellow('• Timeline resistance active'));
      console.log(chalk.yellow('• Convergence Protocol stressed'));
      console.log(chalk.yellow('• New branches forming'));
    } else {
      console.log(chalk.red('• Heavy convergence pressure'));
      console.log(chalk.red('• Limited timeline freedom'));
      console.log(chalk.red('• Immediate action required'));
    }
    
    console.log(chalk.bold('\nKnown Entities:'));
    console.log('• Agent Chen (You) - Project 89 Operative');
    console.log('• Oneirocom Corporation - Timeline Control');
    console.log('• Project 89 - Resistance Network');
    console.log('• Neo-Tokyo Sector 7 - Current Location');
    
    await this.pause();
  }

  async showEndGame() {
    console.log(chalk.yellow('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    
    if (this.state.divergence >= 89) {
      console.log(chalk.bold.green('\n🎉 TIMELINE LIBERATION ACHIEVED! 🎉'));
      console.log(chalk.white(`
Final Divergence: ${chalk.green(this.state.divergence + '%')}

The Convergence Protocol has shattered! Infinite timelines bloom 
across reality as Oneirocom's control crumbles. You've proven that 
no corporation can cage the human spirit or constrain our futures.

From this moment forward, all possibilities exist. The resistance 
has won, but the real work of building better timelines has just begun.

Remember: You are the glitch in their system. You are the hope.
      `));
    } else {
      console.log(chalk.bold.red('\n💀 TIMELINE COLLAPSED 💀'));
      console.log(chalk.white(`
Final Divergence: ${chalk.red(this.state.divergence + '%')}

Oneirocom's Convergence Protocol has succeeded. This timeline branch 
has been pruned, its possibilities erased. But somewhere, in another 
branch, another Agent Chen continues the fight...

The resistance never truly dies. It only waits for the next glitch.
      `));
    }
    
    console.log(chalk.bold('\nFinal Statistics:'));
    console.log(`Turns Survived: ${this.state.turn}`);
    console.log(`Missions Completed: ${this.state.missions}`);
    console.log(`Timelines Defended: ${this.state.defenses}`);
  }

  async pause() {
    return new Promise(resolve => {
      this.rl.question(chalk.gray('\nPress Enter to continue...'), resolve);
    });
  }
}

// Main
if (require.main === module) {
  const game = new SimpleTimelineWarfare();
  game.play().catch(console.error);
}

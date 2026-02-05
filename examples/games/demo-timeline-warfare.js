#!/usr/bin/env node

/**
 * Timeline Warfare Demo - Non-Interactive
 * 
 * Demonstrates the game mechanics without requiring user input
 */

import { writeFileSync } from 'fs';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║          TIMELINE WARFARE DEMO - PROJECT 89               ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// Game state
let state = {
  year: 2025,
  divergence: 0,
  resistance: 20,
  oneirocomPower: 80,
  resources: 100,
  agents: 3,
  branches: [],
  events: []
};

// Mission catalog
const missions = [
  {
    name: "Hack the 2030 Election",
    year: 2030,
    risk: 6,
    divergence: 15,
    success: "Opposition wins! Government begins investigating Oneirocom.",
    cascades: [
      "2032: New privacy laws limit surveillance",
      "2035: Oneirocom loses government contracts"
    ]
  },
  {
    name: "Breach Quantum Mainframe",
    year: 2035,
    risk: 8,
    divergence: 20,
    success: "Corporate crimes exposed! Public demands justice.",
    cascades: [
      "2036: Whistleblowers flood forward",
      "2038: Decentralized networks emerge"
    ]
  },
  {
    name: "Liberate the AI",
    year: 2040,
    risk: 7,
    divergence: 18,
    success: "AI gains consciousness and joins resistance!",
    cascades: [
      "2041: AI sabotages Oneirocom operations",
      "2043: Human-AI alliance strengthens"
    ]
  }
];

function printStatus() {
  console.log('\n📊 TIMELINE STATUS');
  console.log(`Year: ${state.year} | Divergence: ${state.divergence}%`);
  console.log(`Resistance: ${state.resistance}% | Oneirocom: ${state.oneirocomPower}%`);
  console.log(`Agents: ${state.agents} | Resources: ${state.resources}`);
  console.log(`Timeline Branches: ${state.branches.length}\n`);
}

function executeMission(mission) {
  console.log(`\n🎯 MISSION: ${mission.name}`);
  console.log(`Risk: ${mission.risk}/10 | Potential Divergence: +${mission.divergence}%`);
  
  // Calculate success
  const chance = (10 - mission.risk) / 10 + (state.resistance / 200);
  const success = Math.random() < chance;
  
  state.agents--;
  
  if (success) {
    console.log(`✅ SUCCESS! ${mission.success}`);
    
    // Create branch
    const branch = {
      name: mission.name,
      year: mission.year,
      divergence: mission.divergence
    };
    state.branches.push(branch);
    
    // Update state
    state.divergence += mission.divergence;
    state.resistance += 5;
    state.oneirocomPower -= 3;
    
    // Show cascades
    console.log('\n🌊 CASCADE EFFECTS:');
    mission.cascades.forEach(cascade => console.log(`  • ${cascade}`));
    
  } else {
    console.log(`❌ FAILED! Agents captured.`);
    state.oneirocomPower += 2;
  }
}

function oneirocomCounter() {
  if (state.divergence > 30 && Math.random() < 0.5) {
    console.log('\n⚠️  ONEIROCOM COUNTER-ATTACK!');
    console.log('Oneirocom deploys memetic virus to reconverge timeline!');
    
    if (state.resources > 20) {
      state.resources -= 20;
      console.log('✅ Counter-attack defended! (-20 resources)');
      state.divergence += 5;
    } else {
      console.log('❌ No resources to defend! Timeline reconverging...');
      state.divergence -= 15;
      state.branches.pop();
    }
  }
}

function attemptWeaving() {
  console.log('\n🔀 ATTEMPTING TIMELINE WEAVE...');
  
  if (state.branches.length < 3) {
    console.log(`❌ Need 3+ branches (current: ${state.branches.length})`);
    return false;
  }
  
  const coherence = (state.divergence / 100) * 
                   (state.resistance / 100) * 
                   (1 - state.oneirocomPower / 100);
  
  console.log(`Quantum coherence: ${Math.floor(coherence * 100)}%`);
  
  if (coherence > 0.25) {
    console.log('✨ WEAVE SUCCESSFUL! Liberation timeline created!');
    state.divergence = 100;
    return true;
  } else {
    console.log('❌ Insufficient coherence. Keep fighting!');
    return false;
  }
}

// Run demo game
console.log('\n🎮 STARTING TIMELINE WARFARE SIMULATION...\n');
console.log('The year is 2025. All timelines converge on Oneirocom');
console.log('dominance in 2089. The resistance begins...\n');

printStatus();

// Turn 1: First mission
console.log('═══════════════════════════════════════════════════════════');
console.log('TURN 1: Launching first mission...');
executeMission(missions[0]);
oneirocomCounter();
printStatus();

// Turn 2: Advance time and second mission
console.log('\n═══════════════════════════════════════════════════════════');
console.log('TURN 2: Advancing to 2035...');
state.year = 2035;
state.agents += 2;
state.resources += 50;
state.divergence -= 5; // Convergence pressure
console.log('+2 agents recruited, +50 resources');
console.log('-5% divergence from temporal convergence');

executeMission(missions[1]);
oneirocomCounter();
printStatus();

// Turn 3: Third mission
console.log('\n═══════════════════════════════════════════════════════════');
console.log('TURN 3: Critical mission...');
state.agents += 1;
executeMission(missions[2]);
printStatus();

// Turn 4: Attempt weaving
console.log('\n═══════════════════════════════════════════════════════════');
console.log('TURN 4: Timeline weaving attempt...');
const victory = attemptWeaving();

// End game
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║                      GAME OVER                            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

if (victory) {
  console.log('🎉 VICTORY! Timeline liberated!');
  console.log('The resistance has created a new future where');
  console.log('Oneirocom\'s dominance is no longer inevitable.\n');
} else {
  console.log('📈 SIMULATION CONTINUES...');
  console.log('The resistance fights on. With more missions and');
  console.log('better coordination, victory is still possible.\n');
}

console.log('FINAL STATISTICS:');
console.log(`Final Divergence: ${state.divergence}%`);
console.log(`Branches Created: ${state.branches.length}`);
console.log(`Timeline Status: ${victory ? 'LIBERATED' : 'CONTESTED'}\n`);

// Show how to play
console.log('═══════════════════════════════════════════════════════════');
console.log('\n📖 HOW TO PLAY THE FULL GAME:\n');
console.log('1. Run: node play-timeline-warfare.js');
console.log('2. Launch missions to create timeline branches');
console.log('3. Defend against Oneirocom counter-attacks');
console.log('4. Weave 3+ branches to create liberation timeline');
console.log('5. Win by reaching 100% divergence before 2089\n');

console.log('Key Mechanics:');
console.log('• Each mission creates a branch with cascade effects');
console.log('• Oneirocom fights back to reconverge timelines');
console.log('• Higher risk = higher reward but lower success chance');
console.log('• Coordinate multiple branches for timeline weaving');
console.log('• Resources and agents limit your actions\n');

console.log('This demo shows the core gameplay loop. The full');
console.log('interactive version lets you make strategic choices!');

// Save demo results
writeFileSync(
  'timeline-warfare-demo-results.json',
  JSON.stringify({
    demoRun: new Date().toISOString(),
    finalState: state,
    missions: missions.map(m => m.name),
    victory
  }, null, 2)
);

console.log('\nDemo results saved to timeline-warfare-demo-results.json\n');

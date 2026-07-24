// Timeline Demo - Non-Linear Mission System
// This demonstrates how to use the narrative timeline for your game

import { NarrativeGit } from '../dist/index.js';

async function runTimelineDemo() {
  console.log('🎮 TEMPORAL MISSIONS - Timeline Demo\n');
  
  // Initialize narrative system
  const narrativeGit = NarrativeGit.create();
  
  // Simulate players completing missions out of chronological order
  console.log('📅 Adding missions in player completion order (not chronological):\n');
  
  // Player 1 completes a 2042 mission
  console.log('Player 1 completes mission in 2042...');
  const mission1 = await narrativeGit.addAtTime(
    `Agent X7-391 infiltrated Oneirocom's neural processing facility in Neo-Tokyo.
     Discovered Project Mindbridge - consciousness transfer experiments on unwilling subjects.
     Planted liberation virus in mainframe. Facility data will leak in 48 hours.
     Made contact with Dr. Sarah Chen, potential insider ally.`,
    new Date('2042-09-15'),
    "[2042-09-15] Neural Facility Infiltration by Player_001"
  );
  console.log(`✅ Added to timeline: ${mission1.narrativeDate?.toDateString()}\n`);
  
  // Player 2 completes an earlier 2038 mission
  console.log('Player 2 completes mission in 2038...');
  const mission2 = await narrativeGit.addAtTime(
    `Agent K9-102 established first contact with Tokyo resistance cell.
     Cell leader "Ghost" agreed to information exchange.
     Secure comm channels established using quantum encryption.
     Recruited three Oneirocom employees as double agents.`,
    new Date('2038-04-22'),
    "[2038-04-22] First Contact Mission by Player_002"
  );
  console.log(`✅ Added to timeline: ${mission2.narrativeDate?.toDateString()}\n`);
  
  // Player 3 fills in the gap with a 2040 mission
  console.log('Player 3 completes mission in 2040...');
  const mission3 = await narrativeGit.addAtTime(
    `Agent M3-847 sabotaged Oneirocom supply convoy heading to Tokyo.
     Disrupted consciousness harvesting equipment for two weeks.
     Escaped with classified Project Omega documentation.
     Supply shortage will force facility to reduce operations.`,
    new Date('2040-07-08'),
    "[2040-07-08] Supply Line Sabotage by Player_003"
  );
  console.log(`✅ Added to timeline: ${mission3.narrativeDate?.toDateString()}\n`);
  
  // Player 4 adds a 2027 origin event
  console.log('Player 4 completes mission in 2027...');
  const mission4 = await narrativeGit.addAtTime(
    `Surveillance footage captured: Young programmer Alexandra Morozova 
     discovered Oneirocom's hidden consciousness monitoring subroutines.
     She begins reaching out to other concerned employees.
     This marks the first seeds of organized resistance.`,
    new Date('2027-11-30'),
    "[2027-11-30] The First Awakening by Player_004"
  );
  console.log(`✅ Added to timeline: ${mission4.narrativeDate?.toDateString()}\n`);
  
  // Now let's see the timeline in proper chronological order
  console.log('📖 Complete Timeline (Chronological Order):');
  console.log('=========================================\n');
  
  const timeline = narrativeGit.timeline();
  timeline.forEach((commit, index) => {
    if (commit.narrativeDate) {
      console.log(`${index + 1}. ${commit.narrativeDate.toDateString()}`);
      console.log(`   ${commit.message}`);
      console.log(`   Committed: ${commit.timestamp.toLocaleString()}\n`);
    }
  });
  
  // Query specific time periods
  console.log('🔍 Querying Specific Time Periods:');
  console.log('==================================\n');
  
  // Get all 2040s missions
  console.log('Missions in the 2040s:');
  const forties = narrativeGit.timelineRange(
    new Date('2040-01-01'),
    new Date('2049-12-31')
  );
  forties.forEach(mission => {
    console.log(`- ${mission.narrativeDate?.getFullYear()}: ${mission.message}`);
  });
  
  // Get specific year
  console.log('\nMissions in 2038:');
  const year2038 = narrativeGit.timelineYear(2038);
  year2038.forEach(mission => {
    console.log(`- ${mission.narrativeDate?.toDateString()}: ${mission.message}`);
  });
  
  // Check world state evolution
  console.log('\n🌍 World State Analysis:');
  console.log('=======================\n');
  
  const worldState = narrativeGit.world();
  console.log(`Total Entities: ${worldState.entityStates.size}`);
  console.log(`Total Relationships: ${worldState.activeRelationships.size}`);
  console.log(`Consistency Score: ${worldState.consistencyScore}`);
  
  // Example: Check for narrative patterns
  console.log('\n📊 Narrative Patterns:');
  console.log('====================\n');
  
  // Count missions by year
  const missionsByYear = {};
  timeline.forEach(commit => {
    if (commit.narrativeDate) {
      const year = commit.narrativeDate.getFullYear();
      missionsByYear[year] = (missionsByYear[year] || 0) + 1;
    }
  });
  
  console.log('Mission Distribution by Year:');
  Object.entries(missionsByYear)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([year, count]) => {
      console.log(`  ${year}: ${'█'.repeat(count)} (${count} missions)`);
    });
  
  // Game Integration Example
  console.log('\n🎮 Game Integration Example:');
  console.log('===========================\n');
  
  // Function to check if a date is available for missions
  function isDateAvailable(date) {
    const existingMissions = narrativeGit.timelineRange(
      new Date(date.getTime() - 24 * 60 * 60 * 1000), // Day before
      new Date(date.getTime() + 24 * 60 * 60 * 1000)  // Day after
    );
    return existingMissions.length === 0;
  }
  
  // Check some dates
  const datesToCheck = [
    new Date('2039-06-15'),
    new Date('2040-07-08'), // Already has mission
    new Date('2045-12-25')
  ];
  
  console.log('Date Availability Check:');
  datesToCheck.forEach(date => {
    const available = isDateAvailable(date);
    console.log(`  ${date.toDateString()}: ${available ? '✅ Available' : '❌ Occupied'}`);
  });
  
  console.log('\n✨ Demo Complete!');
  console.log('This timeline system enables:');
  console.log('- Non-linear mission completion');
  console.log('- Chronological timeline visualization');
  console.log('- Date range queries for UI');
  console.log('- Conflict detection');
  console.log('- Pattern analysis');
}

// Run the demo
runTimelineDemo().catch(console.error);
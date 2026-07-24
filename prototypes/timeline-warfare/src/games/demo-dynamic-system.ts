#!/usr/bin/env node
/**
 * Demo of the Dynamic Mission Generation System
 * 
 * This demonstrates the key features we've built:
 * - AI-generated missions that reference previous outcomes
 * - Timeline branching and narrative consistency
 * - Branch merging minigame
 */

import chalk from 'chalk';
import { MockLLM } from '../../../../src/llm/mock';
import TimelineManager from './timeline-manager';
import BranchMergeMinigame from './branch-merge-minigame';
import { Mission } from './mission-generator';

async function demoSystem() {
  console.clear();
  console.log(chalk.bold.cyan('╔══════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║           DYNAMIC TIMELINE WARFARE SYSTEM DEMO                 ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════╝'));

  const mockLLM = new MockLLM();
  const timelineManager = new TimelineManager(mockLLM);
  
  console.log(chalk.yellow('\n🚀 Initializing Timeline System...'));
  const timelineState = timelineManager.initializeTimeline();
  
  console.log(chalk.green('\n✅ Timeline initialized with Project 89 entities:'));
  const activeBranch = timelineState.branches.get(timelineState.activeBranch)!;
  
  Array.from(activeBranch.entities.values()).forEach(entity => {
    console.log(chalk.white(`• ${entity.name} (${entity.type}): ${entity.description}`));
  });

  console.log(chalk.cyan('\n🔗 Initial relationships:'));
  activeBranch.relationships.forEach(rel => {
    console.log(chalk.gray(`• ${rel.source} ${rel.type} ${rel.target}`));
  });

  await pause();

  // Generate first set of missions
  console.log(chalk.yellow('\n🧠 AI Mission Director generating first operations...'));
  
  const missions = await timelineManager.generateNextMissions(timelineState, []);
  
  console.log(chalk.green('\n📋 Generated Missions:'));
  missions.forEach((mission, index) => {
    console.log(chalk.white(`\n${index + 1}. ${mission.title}`));
    console.log(chalk.gray(`   ${mission.description}`));
    console.log(chalk.yellow(`   Divergence Impact: ${mission.divergenceImpact > 0 ? '+' : ''}${mission.divergenceImpact}%`));
    
    if (mission.continuityReferences.length > 0) {
      console.log(chalk.blue('   Continuity References:'));
      mission.continuityReferences.forEach(ref => {
        console.log(chalk.gray(`   • ${ref}`));
      });
    }
  });

  await pause();

  // Simulate executing a mission
  if (missions.length > 0) {
    const selectedMission = missions[0];
    console.log(chalk.cyan(`\n⚡ Executing Mission: ${selectedMission.title}`));
    console.log(chalk.white('Simulating SUCCESS outcome...'));

    const result = await timelineManager.executeMission(
      timelineState,
      selectedMission,
      'success'
    );

    console.log(chalk.green('\n✅ Mission completed successfully!'));
    console.log(chalk.yellow(`Divergence change: ${result.divergenceChange > 0 ? '+' : ''}${result.divergenceChange}%`));
    
    const newDivergence = timelineState.branches.get(timelineState.activeBranch)!.divergenceLevel;
    console.log(chalk.cyan(`New divergence level: ${newDivergence}%`));

    if (result.newBranches && result.newBranches.length > 0) {
      console.log(chalk.magenta('\n🌿 Timeline branch created!'));
      result.newBranches.forEach(branch => {
        timelineState.branches.set(branch.id, branch);
        console.log(chalk.white(`• ${branch.name} (${branch.divergenceLevel}% divergence)`));
      });
    }
  }

  await pause();

  // Generate second set of missions that reference the first
  console.log(chalk.yellow('\n🧠 Generating follow-up missions based on previous outcomes...'));
  
  const followupMissions = await timelineManager.generateNextMissions(
    timelineState, 
    ['First mission completed successfully']
  );

  console.log(chalk.green('\n📋 New Missions (Building on Previous Outcomes):'));
  followupMissions.forEach((mission, index) => {
    console.log(chalk.white(`\n${index + 1}. ${mission.title}`));
    console.log(chalk.gray(`   ${mission.description}`));
    
    if (mission.continuityReferences.length > 0) {
      console.log(chalk.blue('   📖 References to Previous Missions:'));
      mission.continuityReferences.forEach(ref => {
        console.log(chalk.gray(`   • ${ref}`));
      });
    }
  });

  await pause();

  // Demo timeline branching and conflict resolution
  const branches = Array.from(timelineState.branches.values());
  if (branches.length > 1) {
    console.log(chalk.yellow('\n⚠️ Multiple timeline branches detected!'));
    
    branches.forEach((branch, index) => {
      console.log(chalk.white(`${index + 1}. ${branch.name} (${branch.divergenceLevel}% divergence)`));
      console.log(chalk.gray(`   Missions: ${branch.missionHistory.length}`));
    });

    console.log(chalk.cyan('\n🔀 Simulating timeline convergence protocol...'));
    
    const conflicts = await timelineManager.detectBranchConflicts(timelineState);
    
    if (conflicts.length > 0) {
      console.log(chalk.red(`\n⚠️ ${conflicts.length} timeline conflicts detected:`));
      conflicts.forEach((conflict, index) => {
        console.log(chalk.white(`${index + 1}. ${conflict.description}`));
        console.log(chalk.gray(`   Type: ${conflict.conflictType}`));
        console.log(chalk.gray(`   Entities: ${conflict.entities.join(', ')}`));
      });

      console.log(chalk.green('\n✨ In the full game, this would launch the Branch Merge Minigame!'));
      console.log(chalk.white('Players would resolve each conflict by choosing:'));
      console.log(chalk.blue('• Accept Branch 1\'s version'));
      console.log(chalk.green('• Accept Branch 2\'s version'));
      console.log(chalk.magenta('• Create hybrid solution'));
    } else {
      console.log(chalk.green('\n✅ No timeline conflicts detected. Branches are stable.'));
    }
  }

  await pause();

  // Show the narrative consistency
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║                    NARRATIVE CONSISTENCY DEMO                   ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════╝'));

  const currentBranch = timelineState.branches.get(timelineState.activeBranch)!;
  
  console.log(chalk.yellow('\n📊 Timeline Summary:'));
  console.log(timelineManager.getBranchSummary(currentBranch));

  console.log(chalk.blue('\n🧠 Narrative Intelligence Gathered:'));
  console.log(chalk.white(`• Entities tracked: ${currentBranch.entities.size}`));
  console.log(chalk.white(`• Relationships mapped: ${currentBranch.relationships.length}`));
  console.log(chalk.white(`• State changes recorded: ${currentBranch.stateChanges.length}`));
  console.log(chalk.white(`• Mission history: ${currentBranch.missionHistory.length} operations`));

  console.log(chalk.green('\n🎯 Key Features Demonstrated:'));
  console.log(chalk.white('✅ AI-generated missions that build on previous outcomes'));
  console.log(chalk.white('✅ Narrative consistency tracking across missions'));  
  console.log(chalk.white('✅ Timeline branching based on major choices'));
  console.log(chalk.white('✅ Conflict detection between timeline branches'));
  console.log(chalk.white('✅ Entity and relationship evolution over time'));
  console.log(chalk.white('✅ Mission continuity references to past events'));

  console.log(chalk.bold.magenta('\n🌟 This creates a living, evolving narrative where every choice matters!'));
  console.log(chalk.cyan('Each mission builds on the last, creating an interconnected web of consequences.'));
  console.log(chalk.yellow('The AI maintains consistency while generating infinite possibilities.'));

  await pause();

  console.log(chalk.bold.green('\n🎉 Demo complete! The dynamic Timeline Warfare system is ready.'));
}

function pause(): Promise<void> {
  return new Promise(resolve => {
    process.stdout.write(chalk.gray('\nPress Enter to continue...'));
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

// Run the demo directly when this file is executed
demoSystem().catch(console.error);

export { demoSystem };
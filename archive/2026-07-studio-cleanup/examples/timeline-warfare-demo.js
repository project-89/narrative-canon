#!/usr/bin/env node

/**
 * Timeline Warfare Demo
 * 
 * Demonstrates the push-pull dynamic between Proxim8 missions 
 * creating divergence and Oneirocom trying to re-converge timelines
 */

const { NarrativeGit } = require('../dist/narrative-git');

// Cascade effect calculator
class CascadeEngine {
  calculateCascades(event, date) {
    const cascades = [];
    
    // Political events cascade to policy and economic changes
    if (event.includes('election') || event.includes('political')) {
      cascades.push({
        date: new Date(date.getFullYear() + 2, date.getMonth()),
        effect: 'New environmental policies reduce Oneirocom\'s mining permits',
        magnitude: 0.7
      });
      
      cascades.push({
        date: new Date(date.getFullYear() + 5, date.getMonth()),
        effect: 'Oneirocom loses key government surveillance contracts',
        magnitude: 0.9
      });
    }
    
    // Tech breaches cascade to awareness and resistance
    if (event.includes('hack') || event.includes('breach')) {
      cascades.push({
        date: new Date(date.getFullYear() + 1, date.getMonth()),
        effect: 'Citizens become aware of surveillance, privacy movement grows',
        magnitude: 0.6
      });
      
      cascades.push({
        date: new Date(date.getFullYear() + 3, date.getMonth()),
        effect: 'Underground mesh networks bypass Oneirocom infrastructure',
        magnitude: 0.8
      });
    }
    
    return cascades;
  }
}

// Oneirocom's counter-narrative system
class OneirocomAI {
  generateCounterNarrative(divergence) {
    const counters = {
      political: 'Oneirocom funds extremist group to create crisis, justifying authoritarian response',
      tech: 'Oneirocom releases "security patch" that actually increases surveillance',
      economic: 'Oneirocom triggers market crash, forcing government bailout and control',
      social: 'Oneirocom deploys memetic virus to shift public opinion'
    };
    
    // Determine type of divergence
    const type = this.analyzeDivergenceType(divergence);
    return {
      narrative: counters[type] || 'Oneirocom adjusts the timeline parameters',
      type: 'convergence-attempt',
      strength: 0.8
    };
  }
  
  analyzeDivergenceType(divergence) {
    if (divergence.includes('election') || divergence.includes('government')) return 'political';
    if (divergence.includes('hack') || divergence.includes('tech')) return 'tech';
    if (divergence.includes('market') || divergence.includes('economic')) return 'economic';
    return 'social';
  }
}

async function runTimelineWarfareDemo() {
  console.log('🎮 TIMELINE WARFARE DEMONSTRATION\n');
  console.log('=' .repeat(60) + '\n');
  
  const git = new NarrativeGit({
    projectName: 'timeline-warfare',
    llmConfig: { provider: 'mock' }
  });
  
  const cascadeEngine = new CascadeEngine();
  const oneirocom = new OneirocomAI();
  
  // Initialize with convergent timeline
  console.log('📍 BASELINE: The Convergent Timeline (2025)\n');
  await git.init();
  await git.addAtTime(
    'All timelines converge. Oneirocom controls global infrastructure, surveillance, and governance. Resistance is futile.',
    new Date('2025-01-01'),
    'The Convergent Timeline - All Roads Lead to Rome'
  );
  
  console.log('   Status: All timelines lead to Oneirocom dominance in 2089\n');
  
  // Mission 1: Political disruption
  console.log('🎯 MISSION 1: Disrupt 2030 Election\n');
  await git.branch('mission-2030-election');
  await git.checkout('mission-2030-election');
  
  const mission1Date = new Date('2030-11-15');
  await git.addAtTime(
    'Proxim8 agents leak Oneirocom\'s illegal surveillance data. Opposition party wins unexpected landslide victory.',
    mission1Date,
    'Proxim8 Success: Election Disruption'
  );
  
  console.log('   ✅ Timeline Branch Created: mission-2030-election');
  console.log('   📊 Divergence Level: 35%\n');
  
  // Add cascade effects
  console.log('🌊 CASCADE EFFECTS:\n');
  const cascades1 = cascadeEngine.calculateCascades('election disrupted', mission1Date);
  
  for (const cascade of cascades1) {
    await git.addAtTime(
      cascade.effect,
      cascade.date,
      `Cascade Effect (magnitude: ${cascade.magnitude})`
    );
    console.log(`   ${cascade.date.getFullYear()}: ${cascade.effect}`);
  }
  
  console.log('\n   📊 Divergence Level: 67%\n');
  
  // Oneirocom responds
  console.log('🚨 ONEIROCOM RESPONSE DETECTED:\n');
  const counter1 = oneirocom.generateCounterNarrative('political election disrupted');
  
  await git.addAtTime(
    counter1.narrative,
    new Date('2031-03-21'),
    'Oneirocom Counter-Narrative Deployed'
  );
  
  console.log(`   2031: ${counter1.narrative}`);
  console.log('   ⚠️  Timeline convergence pressure applied!\n');
  console.log('   📊 Divergence Level: 45% (reduced)\n');
  
  // Mission 2: Tech breach (parallel branch)
  console.log('🎯 MISSION 2: Hack Oneirocom Mainframe\n');
  await git.checkout('main');
  await git.branch('mission-2035-tech-breach');
  await git.checkout('mission-2035-tech-breach');
  
  const mission2Date = new Date('2035-06-15');
  await git.addAtTime(
    'Proxim8 hackers breach Oneirocom\'s quantum encryption. Decades of corporate crimes exposed to public.',
    mission2Date,
    'Proxim8 Success: Mainframe Breach'
  );
  
  console.log('   ✅ Timeline Branch Created: mission-2035-tech-breach');
  
  // Mission 2 cascades
  const cascades2 = cascadeEngine.calculateCascades('hack breach', mission2Date);
  for (const cascade of cascades2) {
    await git.addAtTime(cascade.effect, cascade.date, `Cascade: ${cascade.magnitude}`);
  }
  
  console.log('   📊 Divergence Level: 72%\n');
  
  // Attempt to weave timelines
  console.log('🔀 ATTEMPTING TIMELINE WEAVE:\n');
  
  // Check both branches for coherence
  const branches = ['mission-2030-election', 'mission-2035-tech-breach'];
  const timelines = {};
  
  for (const branch of branches) {
    timelines[branch] = git.timeline(branch);
  }
  
  // Simple coherence check
  const hasPoliciticalChange = timelines['mission-2030-election'].some(
    c => c.message.includes('election')
  );
  const hasTechBreach = timelines['mission-2035-tech-breach'].some(
    c => c.message.includes('breach')
  );
  
  if (hasPoliciticalChange && hasTechBreach) {
    console.log('   ✅ Timeline threads are coherent!');
    console.log('   🌟 Weaving new stable timeline...\n');
    
    // Create woven timeline
    await git.branch('liberation-timeline');
    await git.checkout('liberation-timeline');
    
    // Merge both branches
    await git.merge('mission-2030-election');
    await git.merge('mission-2035-tech-breach');
    
    // Add culmination event
    await git.addAtTime(
      'The combined political shift and tech revelations spark global awakening. Oneirocom\'s control matrix begins to crumble.',
      new Date('2040-01-01'),
      'Timeline Woven: Liberation Path Stabilized'
    );
    
    console.log('   🎉 NEW STABLE TIMELINE CREATED: liberation-timeline');
    console.log('   📊 Timeline Stability: 89%');
    console.log('   🏆 Oneirocom Dominance: DISRUPTED\n');
  } else {
    console.log('   ❌ Insufficient coherence for timeline weaving');
    console.log('   💡 Complete more missions to strengthen divergence\n');
  }
  
  // Show final timeline state
  console.log('📈 TIMELINE WARFARE STATUS:\n');
  
  const allBranches = await git.branches();
  console.log('Active Timeline Branches:');
  for (const branch of allBranches) {
    const commits = git.timeline(branch);
    const divergence = branch === 'main' ? 0 : Math.min(95, commits.length * 15);
    console.log(`   - ${branch}: ${commits.length} events (${divergence}% divergence)`);
  }
  
  // Demonstrate timeline query
  console.log('\n🔍 YEAR 2035 ACROSS ALL TIMELINES:\n');
  const events2035 = git.timelineYear(2035);
  
  const timelineGroups = {};
  events2035.forEach(event => {
    if (!timelineGroups[event.branch]) {
      timelineGroups[event.branch] = [];
    }
    timelineGroups[event.branch].push(event);
  });
  
  for (const [branch, events] of Object.entries(timelineGroups)) {
    console.log(`   [${branch}]`);
    events.forEach(e => {
      const date = e.narrativeDate || e.timestamp;
      console.log(`     - ${date.toISOString().split('T')[0]}: ${e.title || e.message}`);
    });
  }
  
  console.log('\n✨ DEMONSTRATION COMPLETE\n');
  
  // Save game state
  const gameState = {
    timelines: {},
    divergenceLevels: {},
    playerProgress: {
      missionsCompleted: 2,
      timelinesCreated: 1,
      oneirocomCountered: 1
    }
  };
  
  for (const branch of allBranches) {
    gameState.timelines[branch] = git.timeline(branch).map(c => ({
      date: c.narrativeDate || c.timestamp,
      event: c.title || c.message
    }));
    gameState.divergenceLevels[branch] = branch === 'main' ? 0 : Math.min(95, git.timeline(branch).length * 15);
  }
  
  require('fs').writeFileSync(
    'timeline-warfare-state.json',
    JSON.stringify(gameState, null, 2)
  );
  
  console.log('💾 Game state saved to timeline-warfare-state.json\n');
}

// Run demo
if (require.main === module) {
  runTimelineWarfareDemo().catch(console.error);
}

module.exports = { runTimelineWarfareDemo, CascadeEngine, OneirocomAI };
#!/usr/bin/env node
import { NarrativeGit } from './dist/narrative-canon.esm.js';

async function demonstrateParadoxMerge() {
  console.log('🔀 Timeline Merge with Paradox Resolution\n');

  const git = new NarrativeGit({
    author: 'timeline-merger',
    autoExecuteHooks: false
  });

  // Setup initial state
  console.log('📝 Setting up narrative...\n');
  
  git.add({
    id: 'char1',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'sarah',
      type: 'character',
      name: 'Sarah',
      description: 'Key character whose fate diverges',
      properties: { status: 'alive' }
    }
  });
  
  await git.commit('Initial state');
  
  // Create divergent timelines
  await git.branch('timeline-a');
  await git.checkout('timeline-a');
  
  git.add({
    id: 'death',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'sarah',
      changes: {
        properties: { status: 'dead' }
      }
    }
  });
  
  await git.commit('Sarah dies in timeline A');
  
  await git.checkout('main');
  await git.branch('timeline-b');
  await git.checkout('timeline-b');
  
  git.add({
    id: 'power',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'sarah',
      changes: {
        properties: { 
          status: 'alive',
          abilities: ['time-sight', 'reality-bending']
        }
      }
    }
  });
  
  await git.commit('Sarah gains powers in timeline B');
  
  // Attempt merge with paradox resolution
  console.log('🌀 Attempting to merge timeline-a into timeline-b...\n');
  
  const mergeResult = await git.merge('timeline-a', {
    strategy: 'three-way',
    paradoxResolution: {
      strategy: 'quantum-superposition',
      autoResolve: true,
      preserveBothStates: true
    },
    message: 'Merge divergent timelines with quantum resolution'
  });
  
  if (mergeResult.success) {
    console.log('✅ Merge successful!');
    console.log(`   Commit: ${mergeResult.commitId}`);
    console.log(`   Conflicts resolved: ${mergeResult.conflicts?.length || 0}`);
    
    // Show final state
    const state = git.export();
    const sarah = state.entities.find(e => e.id === 'sarah');
    console.log('\n📋 Sarah\'s Final State:');
    console.log(`   ${JSON.stringify(sarah?.properties, null, 2)}`);
  } else {
    console.log('❌ Merge failed with conflicts:');
    mergeResult.conflicts?.forEach(conflict => {
      console.log(`   - ${conflict.type}: ${conflict.entityId}`);
    });
  }
  
  console.log('\n💡 The paradox resolution system allows merging');
  console.log('   incompatible timelines by creating quantum states,');
  console.log('   timeline echoes, or other narrative devices.\n');
}

demonstrateParadoxMerge().catch(console.error);
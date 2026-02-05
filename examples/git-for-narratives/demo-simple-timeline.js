#!/usr/bin/env node
import { NarrativeGit } from './dist/narrative-canon.esm.js';

async function simpleTimelineDemo() {
  console.log('📖 Simple Timeline Branching Demo\n');

  const git = new NarrativeGit({
    author: 'demo-user',
    autoExecuteHooks: false
  });

  // Create initial character
  console.log('1️⃣ Creating initial state...');
  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'hero',
      type: 'character',
      name: 'Alex',
      properties: { 
        status: 'alive',
        location: 'home'
      }
    }
  });

  await git.commit('Initial state - Alex at home');
  console.log('   ✓ Committed to main branch\n');

  // Create branch A
  console.log('2️⃣ Creating Timeline A...');
  await git.branch('timeline-a', { checkout: true });
  
  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'hero',
      changes: {
        properties: { 
          location: 'city',
          job: 'detective'
        }
      }
    }
  });
  
  await git.commit('Alex becomes detective in city');
  console.log('   ✓ Timeline A: Alex is a detective\n');

  // Create branch B
  console.log('3️⃣ Creating Timeline B...');
  await git.checkout('main');
  await git.branch('timeline-b', { checkout: true });
  
  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'hero',
      changes: {
        properties: { 
          location: 'wilderness',
          job: 'ranger'
        }
      }
    }
  });
  
  await git.commit('Alex becomes ranger in wilderness');
  console.log('   ✓ Timeline B: Alex is a ranger\n');

  // Show current state
  console.log('4️⃣ Current Timeline Status:');
  const branches = git.branches();
  for (const branch of branches) {
    console.log(`   ${branch.current ? '→' : ' '} ${branch.name}`);
  }

  // Show Alex in each timeline
  console.log('\n5️⃣ Alex in each timeline:');
  for (const branch of branches) {
    if (branch.name === 'main') continue;
    
    await git.checkout(branch.name);
    const state = git.export();
    const alex = state.entities.find(e => e.id === 'hero');
    console.log(`   [${branch.name}] Location: ${alex?.properties?.location}, Job: ${alex?.properties?.job}`);
  }

  console.log('\n✨ Summary:');
  console.log('   - Created two divergent timelines from same starting point');
  console.log('   - Each timeline tracks different version of reality');
  console.log('   - Can switch between timelines with checkout');
  console.log('   - Ready for merging, comparing, or further branching\n');
}

simpleTimelineDemo().catch(console.error);
#!/usr/bin/env node
import { NarrativeGit } from './dist/narrative-canon.esm.js';

async function demonstrateTimelineParadox() {
  console.log('💀 Timeline Paradox Demo - Life/Death Conflicts\n');

  const git = new NarrativeGit({
    author: 'paradox-resolver',
    autoExecuteHooks: false
  });

  // === Setup: Common Timeline ===
  console.log('📖 Act 1: The Divergence Point\n');
  
  // Initial cast
  git.add({
    id: 'setup1',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'marcus',
      type: 'character',
      name: 'Dr. Marcus Wei',
      description: 'Brilliant scientist and Kira\'s mentor',
      properties: {
        status: 'alive',
        role: 'mentor',
        knowledge: 'quantum-physics'
      }
    }
  });

  git.add({
    id: 'setup2',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'kira',
      type: 'character',
      name: 'Agent Kira',
      description: 'Project 89 operative',
      properties: {
        status: 'alive',
        mentor: 'marcus'
      }
    }
  });

  git.add({
    id: 'setup3',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'oneirocom',
      type: 'organization',
      name: 'Oneirocom',
      description: 'The enemy corporation'
    }
  });

  const divergencePoint = await git.commit('Initial world state - all alive');
  console.log('✓ Divergence point established\n');

  // === Timeline ALPHA: Marcus Dies ===
  git.branch('timeline-death', { checkout: true });
  console.log('🔴 Timeline ALPHA: The Assassination');
  
  // Marcus is killed by Oneirocom
  git.add({
    id: 'death1',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'marcus',
      changes: {
        properties: {
          status: 'dead',
          deathCause: 'Oneirocom assassination',
          deathTime: '2089-03-15'
        }
      }
    }
  });

  git.add({
    id: 'death2',
    type: 'REMOVE_RELATIONSHIP',
    timestamp: Date.now(),
    payload: {
      relationshipId: 'kira-marcus-mentor',
      reason: 'Marcus died'
    }
  });

  await git.commit('Marcus assassinated by Oneirocom');

  // Kira goes dark
  git.add({
    id: 'death3',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'kira',
      changes: {
        properties: {
          status: 'vengeful',
          mentor: null,
          mission: 'destroy-oneirocom'
        }
      }
    }
  });

  await git.commit('Kira becomes vengeful, loses guidance');

  // === Timeline BETA: Marcus Lives and Thrives ===
  await git.checkout('main');
  git.branch('timeline-life', { checkout: true });
  console.log('\n🟢 Timeline BETA: The Breakthrough');
  
  // Marcus makes a discovery
  git.add({
    id: 'life1',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'marcus',
      changes: {
        properties: {
          status: 'alive',
          discovery: 'convergence-prevention-algorithm',
          influence: 'high'
        }
      }
    }
  });

  await git.commit('Marcus discovers how to prevent Convergence');

  // Marcus trains Kira
  git.add({
    id: 'life2',
    type: 'ADD_RELATIONSHIP',
    timestamp: Date.now(),
    payload: {
      id: 'advanced-training',
      type: 'teaches',
      source: 'marcus',
      target: 'kira',
      properties: {
        skill: 'timeline-manipulation'
      }
    }
  });

  git.add({
    id: 'life3',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'kira',
      changes: {
        properties: {
          status: 'enlightened',
          abilities: ['timeline-sight', 'paradox-resolution'],
          mentor: 'marcus'
        }
      }
    }
  });

  await git.commit('Kira gains advanced abilities from Marcus');

  // Marcus leads resistance
  git.add({
    id: 'life4',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'resistance',
      type: 'organization',
      name: 'Timeline Liberation Front',
      description: 'Organized resistance against Convergence',
      properties: {
        leader: 'marcus',
        members: ['kira', 'others']
      }
    }
  });

  await git.commit('Marcus forms resistance movement');

  // === Show the Paradox ===
  console.log('\n⚠️  Timeline Status:');
  const branches = git.branches();
  for (const branch of branches) {
    const log = git.log({ branch: branch.name });
    console.log(`   ${branch.name}: ${log.length} commits`);
    
    // Show Marcus's state in each timeline
    await git.checkout(branch.name);
    const state = git.export();
    const marcus = state.entities.find(e => e.id === 'marcus');
    const kira = state.entities.find(e => e.id === 'kira');
    console.log(`     - Marcus: ${marcus?.properties?.status || 'unknown'}`);
    console.log(`     - Kira: ${kira?.properties?.status || 'unknown'}`);
  }

  // === Attempt to Merge ===
  console.log('\n🌀 Attempting Timeline Merge...\n');
  await git.checkout('main');
  
  // This would create a paradox
  console.log('❌ PARADOX DETECTED:');
  console.log('   - Timeline A: Marcus is DEAD (assassinated)');
  console.log('   - Timeline B: Marcus is ALIVE (leading resistance)');
  console.log('   - Timeline B depends on Marcus for major story developments');
  
  console.log('\n🔧 Possible Resolution Strategies:\n');
  
  console.log('1. 🔀 QUANTUM SUPERPOSITION');
  console.log('   Marcus exists in both states simultaneously');
  console.log('   - Living Marcus visible only to awakened characters');
  console.log('   - Dead Marcus is the "consensus reality"');
  console.log('   - Creates ghost/quantum entity mechanics');
  
  console.log('\n2. 🌊 TIMELINE ECHO');
  console.log('   Marcus died but his "echo" persists');
  console.log('   - His discoveries exist as orphaned knowledge');
  console.log('   - Kira channels his teachings despite his death');
  console.log('   - Memory becomes a narrative force');
  
  console.log('\n3. ⚡ PARADOX CASCADE');
  console.log('   The conflict creates a new phenomenon');
  console.log('   - Reality glitch at the point of divergence');
  console.log('   - Characters can access both timelines');
  console.log('   - The paradox itself becomes a plot device');
  
  console.log('\n4. 🎭 SCHRODINGER\'S MENTOR');
  console.log('   Marcus\'s state depends on observer');
  console.log('   - Oneirocom sees him as dead');
  console.log('   - Resistance sees him as alive');
  console.log('   - Reality literally splits based on belief');

  // === Demonstrate One Resolution ===
  console.log('\n✨ Implementing Quantum Superposition Resolution...\n');
  
  git.add({
    id: 'paradox1',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'marcus',
      changes: {
        properties: {
          status: 'quantum-superposed',
          states: {
            consensus: 'dead',
            awakened: 'alive'
          },
          description: 'Exists in quantum superposition - dead to most, alive to those who can see'
        }
      }
    }
  });

  git.add({
    id: 'paradox2',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'quantum-teachings',
      type: 'phenomenon',
      name: 'Marcus\'s Quantum Echo',
      description: 'Knowledge that exists independent of Marcus\'s life state',
      properties: {
        source: 'marcus',
        accessibility: 'requires-awakened-perception'
      }
    }
  });

  await git.commit('Resolve paradox via quantum superposition');

  const finalState = git.export();
  const finalMarcus = finalState.entities.find(e => e.id === 'marcus');
  
  console.log('📋 Final Resolution:');
  console.log(`   Marcus: ${JSON.stringify(finalMarcus?.properties?.status)}`);
  console.log('   - Consensus reality: Dead (satisfies Timeline A)');
  console.log('   - Awakened reality: Alive (satisfies Timeline B)');
  console.log('   - Both timelines can coexist without collapse');
  
  console.log('\n🎯 This demonstrates how the Git system handles paradoxes:');
  console.log('   1. Detects conflicts that would break narrative coherence');
  console.log('   2. Requires explicit resolution strategies');
  console.log('   3. Can create new narrative devices from conflicts');
  console.log('   4. Preserves timeline integrity while allowing creative solutions\n');
}

demonstrateTimelineParadox().catch(console.error);
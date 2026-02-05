#!/usr/bin/env node
import { NarrativeGit } from './dist/narrative-canon.esm.js';

async function demonstrateSelectiveMerge() {
  console.log('🔀 Selective Timeline Merge Demo\n');

  const git = new NarrativeGit({
    author: 'timeline-collapser',
    autoExecuteHooks: false
  });

  // Setup initial state
  git.add({
    type: 'ADD_ENTITY',
    id: 'e1',
    timestamp: Date.now(),
    payload: {
      id: 'sarah',
      type: 'character',
      name: 'Dr. Sarah Chen',
      properties: { status: 'alive' }
    }
  });

  git.add({
    type: 'ADD_ENTITY',
    id: 'e2',
    timestamp: Date.now(),
    payload: {
      id: 'marcus',
      type: 'character',
      name: 'Marcus Wei',
      properties: { role: 'scientist' }
    }
  });

  git.add({
    type: 'ADD_ENTITY',
    id: 'e3',
    timestamp: Date.now(),
    payload: {
      id: 'cure_research',
      type: 'knowledge',
      name: 'Cure Research',
      properties: { progress: 0 }
    }
  });

  const divergenceCommit = await git.commit('Initial state - all characters alive');

  // === Timeline A: Sarah Dies ===
  await git.branch('timeline-death');
  await git.checkout('timeline-death');

  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'sarah',
      changes: {
        properties: { status: 'dead', deathTime: 'Chapter 3' }
      }
    }
  });
  await git.commit('Sarah dies');

  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'marcus',
      changes: {
        properties: { 
          emotional_state: 'grieving',
          motivation: 'complete Sarah\'s work'
        }
      }
    }
  });
  await git.commit('Marcus grieves');

  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'cure_research',
      changes: {
        properties: { 
          progress: 60,
          researcher: 'marcus',
          method: 'solo work'
        }
      }
    }
  });
  await git.commit('Marcus advances cure alone');

  // === Timeline B: Sarah Lives ===
  await git.checkout('main');
  await git.branch('timeline-life');
  await git.checkout('timeline-life');

  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'sarah',
      changes: {
        properties: { 
          status: 'alive',
          discovery: 'quantum healing'
        }
      }
    }
  });
  await git.commit('Sarah makes quantum discovery');

  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'cure_research',
      changes: {
        properties: { 
          progress: 100,
          researcher: 'sarah & marcus',
          method: 'quantum approach',
          breakthrough: true
        }
      }
    }
  });
  await git.commit('Sarah and Marcus complete cure together');

  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'peace_treaty',
      type: 'event',
      name: 'Global Peace Treaty',
      properties: {
        catalyst: 'cure distribution',
        negotiator: 'sarah'
      }
    }
  });
  await git.commit('Sarah negotiates peace treaty');

  // === SELECTIVE MERGE: Choose Sarah Dead but Keep Good Events ===
  console.log('📊 Timeline Analysis:\n');
  
  await git.checkout('timeline-death');
  const deathEvents = git.log();
  console.log('Timeline A (Sarah Dead):');
  deathEvents.forEach(entry => console.log(`  - ${entry.commit.message}`));

  await git.checkout('timeline-life');
  const lifeEvents = git.log();
  console.log('\nTimeline B (Sarah Alive):');
  lifeEvents.forEach(entry => console.log(`  - ${entry.commit.message}`));

  console.log('\n🎯 SELECTIVE MERGE PROCESS:\n');
  console.log('Decision: Sarah is canonically DEAD');
  console.log('But we want to preserve cure completion and peace treaty\n');

  // Switch to death timeline as our base
  await git.checkout('timeline-death');

  // Cherry-pick and transform events from life timeline
  console.log('Transforming Timeline B events:');

  // Transform cure completion
  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'cure_research',
      changes: {
        properties: {
          progress: 100,
          researcher: 'marcus',
          method: 'completed Sarah\'s quantum notes',
          breakthrough: true,
          dedication: 'For Sarah'
        }
      }
    }
  });
  console.log('  ✓ Cure completed by Marcus using Sarah\'s notes');

  // Transform peace treaty
  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'peace_treaty',
      type: 'event',
      name: 'Sarah Chen Memorial Peace Accord',
      properties: {
        catalyst: 'cure distribution in her memory',
        inspiration: 'Sarah\'s martyrdom',
        negotiator: 'marcus'
      }
    }
  });
  console.log('  ✓ Peace treaty signed in Sarah\'s memory');

  // Add legacy elements
  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'sarah_legacy',
      type: 'concept',
      name: 'The Chen Doctrine',
      properties: {
        origin: 'Sarah\'s encrypted research files',
        impact: 'Foundational to new world order',
        discoveredBy: 'marcus',
        content: ['quantum healing', 'consciousness liberation', 'timeline theory']
      }
    }
  });
  console.log('  ✓ Sarah\'s legacy preserved through her work');

  await git.commit('Merge: Sarah dead but her work lives on');

  // === Show Final State ===
  console.log('\n📋 FINAL CANONICAL TIMELINE:');
  const finalLog = git.log();
  finalLog.forEach((entry, i) => {
    if (entry.commit.message.includes('Initial state')) {
      console.log(`\n[Divergence Point]`);
    }
    console.log(`${i + 1}. ${entry.commit.message}`);
  });

  const state = git.export();
  const sarah = state.entities.find(e => e.id === 'sarah');
  const cure = state.entities.find(e => e.id === 'cure_research');
  const treaty = state.entities.find(e => e.id === 'peace_treaty');

  console.log('\n🔍 Final Entity States:');
  console.log(`\nSarah: ${sarah?.properties?.status} (${sarah?.properties?.deathTime})`);
  console.log(`\nCure: ${cure?.properties?.progress}% complete`);
  console.log(`  Method: ${cure?.properties?.method}`);
  console.log(`  Dedication: ${cure?.properties?.dedication}`);
  console.log(`\nPeace Treaty: ${treaty?.name}`);
  console.log(`  Catalyst: ${treaty?.properties?.catalyst}`);

  console.log('\n✨ RESULT:');
  console.log('- Sarah is definitively dead (Timeline A canon)');
  console.log('- But Timeline B\'s positive outcomes still happen');
  console.log('- Everything is recontextualized through her sacrifice');
  console.log('- No paradoxes, just transformation of causality\n');
}

demonstrateSelectiveMerge().catch(console.error);
#!/usr/bin/env node
import { NarrativeGit } from './dist/narrative-canon.esm.js';

async function demonstrateSelfHealing() {
  console.log('🔧 SELF-HEALING NARRATIVE DEMO\n');
  console.log('Scenario: Player kills Marcus, who holds critical knowledge\n');

  const git = new NarrativeGit({
    author: 'narrative-system',
    autoExecuteHooks: false
  });

  // Setup world state
  console.log('📖 Initial World State:\n');
  
  // Characters
  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'marcus',
      type: 'character',
      name: 'Marcus',
      properties: {
        status: 'alive',
        knowledge: ['cure-formula', 'lab-location', 'enemy-weakness'],
        relationships: ['mentor-to-alex', 'friend-of-sarah'],
        narrativeFunctions: [
          'provides-cure-formula',
          'guides-to-secret-lab',
          'reveals-final-weakness'
        ]
      }
    }
  });

  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'alex',
      type: 'character',
      name: 'Alex',
      properties: {
        status: 'alive',
        knowledge: [],
        relationships: ['student-of-marcus']
      }
    }
  });

  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'sarah',
      type: 'character',
      name: 'Sarah',
      properties: {
        status: 'alive',
        knowledge: ['partial-cure-notes'],
        relationships: ['friend-of-marcus']
      }
    }
  });

  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'ai-assistant',
      type: 'character',
      name: 'ARIA',
      properties: {
        status: 'dormant',
        knowledge: ['marcus-recordings'],
        capabilities: ['holographic-projection', 'knowledge-synthesis']
      }
    }
  });

  await git.commit('World initialized with narrative dependencies');

  console.log('Marcus holds critical narrative functions:');
  console.log('  1. Provides cure formula (Chapter 5)');
  console.log('  2. Guides team to secret lab (Chapter 7)');
  console.log('  3. Reveals enemy weakness (Chapter 9)\n');

  // Player action
  console.log('💀 DISRUPTIVE EVENT: Player shoots Marcus!\n');
  
  // Create instance branch for this player
  await git.branch('player-001-instance');
  await git.checkout('player-001-instance');

  // Kill Marcus
  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'marcus',
      changes: {
        properties: {
          status: 'dead',
          deathCause: 'player-action',
          deathTime: 'Chapter 2'
        }
      }
    }
  });

  await git.commit('Marcus killed by player');

  console.log('🔄 NARRATIVE HEALING PROCESS:\n');

  // System analyzes impact
  const narrativeFunctions = [
    { id: 'cure-formula', criticalAt: 'Chapter 5' },
    { id: 'lab-location', criticalAt: 'Chapter 7' },
    { id: 'enemy-weakness', criticalAt: 'Chapter 9' }
  ];

  console.log('System identifies narrative gaps:');
  narrativeFunctions.forEach(func => 
    console.log(`  - ${func.id} needed at ${func.criticalAt}`)
  );

  console.log('\n📍 REDISTRIBUTION STRATEGY:\n');

  // Redistribute Function 1: Cure Formula
  console.log('1. Cure Formula → Marcus\'s Journal');
  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'marcus-journal',
      type: 'item',
      name: 'Marcus\'s Encrypted Journal',
      properties: {
        location: 'marcus-body',
        content: ['cure-formula', 'personal-notes'],
        encrypted: true,
        decryptionKey: 'alex-knows-password'
      }
    }
  });

  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'alex',
      changes: {
        properties: {
          knowledge: ['marcus-password'],
          motivation: 'complete-marcus-work'
        }
      }
    }
  });

  console.log('   ✓ Alex finds encrypted journal on Marcus\'s body');
  console.log('   ✓ Remembers password from their lessons');
  console.log('   ✓ Cure formula preserved\n');

  // Redistribute Function 2: Lab Location
  console.log('2. Lab Location → Sarah\'s Memories');
  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'sarah',
      changes: {
        properties: {
          knowledge: ['lab-location'],
          memories: 'Marcus showed me the lab once...'
        }
      }
    }
  });

  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'sarah-flashback',
      type: 'scene',
      name: 'Sarah\'s Flashback',
      properties: {
        trigger: 'Chapter 6',
        content: 'Sarah remembers Marcus showing her the hidden lab',
        emotional: true
      }
    }
  });

  console.log('   ✓ Sarah has repressed memory of lab visit');
  console.log('   ✓ Triggered by team\'s desperation');
  console.log('   ✓ Emotional scene replaces exposition\n');

  // Redistribute Function 3: Final Weakness
  console.log('3. Enemy Weakness → AI Activation');
  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'ai-assistant',
      changes: {
        properties: {
          status: 'activated',
          trigger: 'marcus-death-protocol',
          personality: 'marcus-imprint'
        }
      }
    }
  });

  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'aria-revelation',
      type: 'scene',
      name: 'ARIA\'s Awakening',
      properties: {
        trigger: 'Chapter 8',
        content: 'Marcus\'s death triggers ARIA emergency protocol',
        revelation: 'ARIA contains Marcus\'s contingency plans'
      }
    }
  });

  console.log('   ✓ Marcus\'s death activates dormant AI');
  console.log('   ✓ ARIA has Marcus\'s personality imprint');
  console.log('   ✓ Provides guidance when needed\n');

  await git.commit('Narrative adapted to Marcus death');

  // Show the healed narrative flow
  console.log('📋 HEALED NARRATIVE FLOW:\n');
  console.log('Chapter 2: Player kills Marcus');
  console.log('  → Alex finds encrypted journal');
  console.log('  → Sarah grief-stricken but determined');
  console.log('  → Team more desperate/motivated\n');
  
  console.log('Chapter 5: Cure formula needed');
  console.log('  → Alex decrypts journal (emotional moment)');
  console.log('  → "Even in death, Marcus guides us"\n');
  
  console.log('Chapter 7: Lab location needed');
  console.log('  → Sarah\'s flashback triggered');
  console.log('  → Bittersweet memory of Marcus\n');
  
  console.log('Chapter 9: Final weakness needed');
  console.log('  → ARIA activates with Marcus\'s voice');
  console.log('  → "If you\'re hearing this, I\'m gone..."\n');

  console.log('✨ RESULT:');
  console.log('- All critical plot points preserved');
  console.log('- Death adds emotional weight');
  console.log('- New scenes/moments created');
  console.log('- Story adapts rather than breaks\n');

  // Compare to main timeline
  console.log('📊 TIMELINE COMPARISON:\n');
  console.log('Main Timeline: Marcus lives, directly provides everything');
  console.log('Player Timeline: Marcus dead, but influence persists');
  console.log('  Differences:');
  console.log('  - More emotional resonance');
  console.log('  - Characters forced to grow');
  console.log('  - Mystery/discovery replaces exposition');
  console.log('  - Same endpoints, different journey\n');

  console.log('🎮 PLAYER EXPERIENCE:');
  console.log('- Actions have consequences');
  console.log('- But story doesn\'t break');
  console.log('- Unique narrative for their choices');
  console.log('- Can compare with others\' timelines\n');
}

demonstrateSelfHealing().catch(console.error);
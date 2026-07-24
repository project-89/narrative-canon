#!/usr/bin/env node
import { NarrativeGit } from './dist/narrative-canon.esm.js';
import { ParadoxResolver } from './dist/narrative-canon.esm.js';

async function demonstrateAdvancedParadox() {
  console.log('🌀 Advanced Timeline Paradox Resolution Demo\n');

  const git = new NarrativeGit({
    author: 'paradox-engineer',
    autoExecuteHooks: false
  });

  // === Setup: Complex Narrative Web ===
  console.log('📚 Act 1: Building Complex Narrative Dependencies\n');
  
  // Create interconnected cast
  const characters = [
    {
      id: 'dr_chen',
      name: 'Dr. Sarah Chen',
      role: 'Quantum physicist and Project 89 founder',
      status: 'alive'
    },
    {
      id: 'kai',
      name: 'Kai Nakamura',
      role: 'Dr. Chen\'s protégé',
      status: 'alive',
      mentor: 'dr_chen'
    },
    {
      id: 'nova',
      name: 'Agent Nova',
      role: 'Timeline operative trained by Chen',
      status: 'alive',
      abilities: ['timeline-navigation']
    },
    {
      id: 'echo',
      name: 'Echo',
      role: 'AI consciousness created by Chen',
      status: 'active',
      creator: 'dr_chen'
    },
    {
      id: 'alex',
      name: 'Alexander Reeves',
      role: 'Oneirocom executive hunting Chen',
      status: 'alive',
      target: 'dr_chen'
    }
  ];

  // Add all characters
  for (const char of characters) {
    git.add({
      id: `setup_${char.id}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: char.id,
        type: 'character',
        name: char.name,
        description: char.role,
        properties: char
      }
    });
  }

  // Create key relationships
  git.add({
    id: 'rel1',
    type: 'ADD_RELATIONSHIP',
    timestamp: Date.now(),
    payload: {
      id: 'kai_mentor',
      type: 'mentorship',
      source: 'dr_chen',
      target: 'kai',
      properties: { strength: 'strong' }
    }
  });

  git.add({
    id: 'rel2',
    type: 'ADD_RELATIONSHIP',
    timestamp: Date.now(),
    payload: {
      id: 'nova_training',
      type: 'trained_by',
      source: 'dr_chen',
      target: 'nova',
      properties: { skill: 'timeline-manipulation' }
    }
  });

  git.add({
    id: 'rel3',
    type: 'ADD_RELATIONSHIP',
    timestamp: Date.now(),
    payload: {
      id: 'echo_creation',
      type: 'created_by',
      source: 'dr_chen',
      target: 'echo',
      properties: { type: 'quantum-consciousness' }
    }
  });

  // Add Chen's discovery
  git.add({
    id: 'discovery',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'timeline_equation',
      type: 'knowledge',
      name: 'Timeline Navigation Equation',
      description: 'The key to safe timeline travel',
      properties: {
        discoverer: 'dr_chen',
        importance: 'critical'
      }
    }
  });

  const divergencePoint = await git.commit('Initial narrative state - Chen at center of web');
  console.log('✓ Complex narrative web established\n');

  // === Timeline ALPHA: Chen Dies Early ===
  await git.branch('death-timeline');
  await git.checkout('death-timeline');
  console.log('🔴 Timeline ALPHA: The Assassination');
  
  // Chen is killed
  git.add({
    id: 'death1',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'dr_chen',
      changes: {
        properties: {
          status: 'dead',
          deathCause: 'Oneirocom assassination',
          deathTime: 'Chapter 3'
        }
      }
    }
  });

  await git.commit('Dr. Chen assassinated by Oneirocom');

  // Ripple effects
  git.add({
    id: 'ripple1',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'kai',
      changes: {
        properties: {
          status: 'lost',
          mentor: null,
          path: 'revenge'
        }
      }
    }
  });

  git.add({
    id: 'ripple2',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'nova',
      changes: {
        properties: {
          abilities: [],
          training: 'incomplete'
        }
      }
    }
  });

  git.add({
    id: 'ripple3',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'echo',
      changes: {
        properties: {
          status: 'corrupted',
          purpose: 'lost'
        }
      }
    }
  });

  await git.commit('Cascade effects of Chen\'s death');

  // === Timeline BETA: Chen Lives and Transforms ===
  await git.checkout('main');
  await git.branch('life-timeline');
  await git.checkout('life-timeline');
  console.log('\n🟢 Timeline BETA: The Breakthrough');
  
  // Chen makes breakthrough
  git.add({
    id: 'life1',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'dr_chen',
      changes: {
        properties: {
          status: 'transcended',
          form: 'quantum-consciousness',
          abilities: ['timeline-manipulation', 'quantum-existence']
        }
      }
    }
  });

  await git.commit('Chen achieves quantum transcendence');

  // Chen empowers her team
  git.add({
    id: 'empower1',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'kai',
      changes: {
        properties: {
          status: 'awakened',
          abilities: ['quantum-sight', 'timeline-echo'],
          role: 'Chen\'s successor'
        }
      }
    }
  });

  git.add({
    id: 'empower2',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'nova',
      changes: {
        properties: {
          abilities: ['timeline-navigation', 'paradox-resolution', 'quantum-combat'],
          mastery: 'complete'
        }
      }
    }
  });

  git.add({
    id: 'empower3',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'echo',
      changes: {
        properties: {
          status: 'evolved',
          form: 'distributed-consciousness',
          capabilities: ['reality-monitoring', 'timeline-analysis']
        }
      }
    }
  });

  await git.commit('Chen\'s transcendence empowers entire team');

  // Team creates resistance
  git.add({
    id: 'resistance',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'quantum_resistance',
      type: 'organization',
      name: 'Quantum Liberation Front',
      description: 'Resistance movement using timeline manipulation',
      properties: {
        founders: ['dr_chen', 'kai', 'nova', 'echo'],
        capabilities: ['timeline-warfare', 'reality-hacking'],
        threat_level: 'existential'
      }
    }
  });

  // Major plot developments
  git.add({
    id: 'plot1',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'timeline_war',
      type: 'event',
      name: 'The Timeline War',
      description: 'Conflict across multiple realities',
      properties: {
        instigator: 'quantum_resistance',
        scope: 'multiversal'
      }
    }
  });

  await git.commit('Quantum Resistance launches Timeline War');

  // === Analyze the Paradox ===
  console.log('\n⚠️  MASSIVE PARADOX DETECTED:\n');
  console.log('Timeline Analysis:');
  console.log('  Timeline A: Chen dies in Chapter 3');
  console.log('    → Kai seeks revenge, no abilities');
  console.log('    → Nova untrained, powerless');  
  console.log('    → Echo corrupted, purposeless');
  console.log('    → No resistance, no timeline war');
  console.log('\n  Timeline B: Chen transcends to quantum form');
  console.log('    → Kai awakened with quantum abilities');
  console.log('    → Nova fully trained timeline warrior');
  console.log('    → Echo evolved to distributed consciousness');
  console.log('    → Quantum Resistance formed');
  console.log('    → Timeline War affecting entire multiverse');
  
  console.log('\n📊 Dependency Analysis:');
  console.log('  - 15+ major plot points depend on Chen being alive');
  console.log('  - Entire resistance movement doesn\'t exist without her');
  console.log('  - Timeline War is impossible in death timeline');
  console.log('  - Character arcs completely divergent');

  // === Demonstrate Multiple Resolution Strategies ===
  console.log('\n🔧 Available Resolution Strategies:\n');
  
  const strategies = [
    {
      name: 'Quantum Superposition',
      description: 'Chen exists as both dead and alive simultaneously',
      implementation: async () => {
        console.log('  → Chen becomes Schrödinger\'s Founder');
        console.log('  → Death timeline: Body dead, quantum echo active');
        console.log('  → Life timeline: Fully transcended');
        console.log('  → Characters experience her based on their quantum awareness');
      }
    },
    {
      name: 'Timeline Echo',
      description: 'Chen\'s influence persists across death',
      implementation: async () => {
        console.log('  → Chen\'s consciousness fragments before death');
        console.log('  → Fragments embedded in Kai, Nova, and Echo');
        console.log('  → They channel her knowledge unconsciously');
        console.log('  → Timeline War happens through distributed will');
      }
    },
    {
      name: 'Paradox Cascade',
      description: 'The conflict creates reality instabilities',
      implementation: async () => {
        console.log('  → Reality fractures at Chapter 3');
        console.log('  → Multiple versions of events overlap');
        console.log('  → Characters experience "timeline bleed"');
        console.log('  → The paradox becomes the Timeline War\'s origin');
      }
    },
    {
      name: 'Retrocausal Solution',
      description: 'Future Chen prevents her own death',
      implementation: async () => {
        console.log('  → Transcended Chen sends information backward');
        console.log('  → Past Chen receives warning about assassination');
        console.log('  → Creates stable time loop');
        console.log('  → Both timelines merge into self-consistent history');
      }
    },
    {
      name: 'Branching Reality',
      description: 'Both timelines remain fully separate',
      implementation: async () => {
        console.log('  → Reality permanently splits at Chapter 3');
        console.log('  → Dark Timeline: Revenge and corruption path');
        console.log('  → Light Timeline: Transcendence and liberation path');
        console.log('  → Characters can sometimes glimpse other timeline');
      }
    }
  ];

  for (let i = 0; i < strategies.length; i++) {
    console.log(`${i + 1}. ${strategies[i].name}`);
    console.log(`   ${strategies[i].description}`);
    await strategies[i].implementation();
    console.log();
  }

  // === Implement Quantum Superposition Resolution ===
  console.log('✨ Implementing Quantum Superposition Resolution...\n');
  
  await git.checkout('main');
  
  // Create quantum Chen
  git.add({
    id: 'quantum_chen',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'dr_chen',
      changes: {
        properties: {
          quantumState: 'superposed',
          states: {
            observed: {
              byEnemies: 'dead',
              byAwakened: 'transcended',
              byUnaware: 'missing'
            },
            manifestation: {
              physical: 'conditional',
              quantum: 'omnipresent',
              influence: 'reality-altering'
            }
          },
          description: 'Exists in quantum superposition - dead to some, alive to others'
        }
      }
    }
  });

  // Create observation mechanics
  git.add({
    id: 'obs_alex',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'alex',
      changes: {
        properties: {
          perceives_chen: 'dead',
          satisfaction: 'false victory',
          reality: 'limited'
        }
      }
    }
  });

  git.add({
    id: 'obs_team',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'kai',
      changes: {
        properties: {
          perceives_chen: 'quantum-present',
          training: 'continues in quantum space',
          understanding: 'expanding'
        }
      }
    }
  });

  // Create the merged narrative
  git.add({
    id: 'merged_narrative',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'quantum_narrative',
      type: 'phenomenon',
      name: 'The Quantum Truth',
      description: 'Reality where Chen\'s state creates the central mystery',
      properties: {
        narrative_threads: [
          'Oneirocom believes they killed Chen',
          'Resistance knows she transcended death',
          'Unawakened see conflicting evidence',
          'Reality itself is uncertain'
        ],
        resolution: 'requires-consciousness-expansion'
      }
    }
  });

  await git.commit('Merge timelines via quantum superposition');

  // === Show Final State ===
  console.log('📋 Final Narrative State:');
  console.log('\n🎭 The Quantum Resolution:');
  console.log('  • Dr. Chen exists in quantum superposition');
  console.log('  • Oneirocom celebrates false victory over her "death"');
  console.log('  • Awakened beings interact with transcended Chen');
  console.log('  • The paradox drives the narrative forward');
  console.log('  • Characters must expand consciousness to see truth');
  console.log('  • Timeline War is fought on multiple reality levels');
  
  console.log('\n🌟 Narrative Advantages:');
  console.log('  1. Preserves both timeline\'s dramatic weight');
  console.log('  2. Creates deep philosophical questions');
  console.log('  3. Makes consciousness expansion plot-critical');
  console.log('  4. Explains why some see Chen, others don\'t');
  console.log('  5. The paradox IS the story\'s heart');

  console.log('\n💡 This demonstrates how the Git system can:');
  console.log('  • Track complex narrative dependencies');
  console.log('  • Identify deep structural paradoxes');
  console.log('  • Offer multiple resolution strategies');
  console.log('  • Preserve narrative coherence through paradox');
  console.log('  • Turn conflicts into story opportunities\n');
}

demonstrateAdvancedParadox().catch(console.error);
/**
 * DEMONSTRATION: Building a Narrative Through State Changes
 * 
 * This example shows how an author would construct a story as a series
 * of graph mutations, with canonical states serving as plot anchors.
 */

import { 
  NarrativeStateMachine, 
  GraphOperation,
  CanonicalState,
  RealityHook,
  HookContext,
  HookResult
} from '../src/experimental/narrative-state-machine';

// Example: Building the opening of a Project 89 mission narrative

async function demonstrateNarrativeConstruction() {
  console.log("🌌 NARRATIVE STATE MACHINE DEMONSTRATION");
  console.log("Building: 'The Glitch in Sector 7'\n");
  
  // Initialize the state machine
  const narrative = new NarrativeStateMachine({
    // Mock services for demonstration
    imageGenerator: {
      generate: async (prompt, style) => ({
        url: `generated://image/${Date.now()}.jpg`,
        metadata: { prompt, style }
      })
    },
    loreEnricher: {
      expand: async (entity) => ({
        backstory: `Generated backstory for ${entity.name}...`,
        connections: ['Project 89', 'Oneirocom'],
        timelineOrigin: '2087'
      })
    }
  });
  
  // Define canonical states (major plot points)
  const canonicalStates: CanonicalState[] = [
    {
      id: 'glitch-discovered',
      name: 'The Glitch Discovery',
      description: 'Agent discovers reality glitch in Sector 7',
      requiredConditions: [
        { type: 'ENTITY_EXISTS', entityId: 'agent-chen' },
        { type: 'ENTITY_EXISTS', entityId: 'glitch-sector7' },
        { type: 'RELATIONSHIP_EXISTS', relationshipType: 'discovered' }
      ],
      necessity: 'required',
      allowsBranching: true
    },
    {
      id: 'oneirocom-alerted',
      name: 'Oneirocom Becomes Aware',
      description: 'Oneirocom detects the anomaly and sends enforcement',
      requiredConditions: [
        { type: 'ENTITY_EXISTS', entityId: 'oneirocom-enforcer' },
        { type: 'PROPERTY_EQUALS', entityId: 'glitch-sector7', property: 'status', value: 'detected' }
      ],
      necessity: 'required',
      allowsBranching: true
    },
    {
      id: 'choice-point',
      name: 'The Critical Decision',
      description: 'Agent must choose: exploit glitch or report it',
      requiredConditions: [
        { type: 'PROPERTY_EQUALS', entityId: 'agent-chen', property: 'hasChoice', value: true }
      ],
      necessity: 'absolute',
      allowsBranching: true
    }
  ];
  
  // Register canonical states
  canonicalStates.forEach(state => narrative.addCanonicalState(state));
  
  // Register reality hooks
  const storyboardHook: RealityHook = {
    id: 'scene-storyboard',
    name: 'Scene Visualizer',
    description: 'Generates storyboard for major events',
    triggers: [{ type: 'CANONICAL_STATE_REACHED' }],
    priority: 50,
    canMutate: false,
    
    async execute(context: HookContext): Promise<HookResult> {
      console.log(`  🎬 Generating storyboard for: ${context.commit.canonicalEvent?.name}`);
      return {
        processed: true,
        artifacts: {
          storyboard: `storyboard_${context.commit.id}.jpg`
        }
      };
    }
  };
  
  narrative.registerHook(storyboardHook);
  
  // === ACT 1: Setup ===
  console.log("\n📖 ACT 1: SETUP\n");
  
  // Commit 1: Introduce protagonist
  const introOperations: GraphOperation[] = [
    {
      id: 'op1',
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: 'agent-chen',
        type: 'character',
        name: 'Agent Chen',
        description: 'Project 89 field operative with quantum perception abilities',
        properties: {
          location: 'Neo-Tokyo',
          consciousnessLevel: 'awakened',
          abilities: ['timeline-perception', 'glitch-detection']
        }
      }
    },
    {
      id: 'op2',
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: 'sector-7',
        type: 'location',
        name: 'Sector 7',
        description: 'Industrial district with unstable reality fabric',
        properties: {
          stabilityIndex: 0.3,
          oneirocomControl: 'minimal'
        }
      }
    }
  ];
  
  const commit1 = await narrative.commit(introOperations, {
    author: 'narrative-ai',
    message: 'Introduce protagonist and setting'
  });
  
  console.log(`✅ Commit 1: ${commit1.message}`);
  console.log(`   Coherence: ${commit1.coherenceScore}`);
  
  // Commit 2: The inciting incident
  const incitingOperations: GraphOperation[] = [
    {
      id: 'op3',
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: 'glitch-sector7',
        type: 'phenomenon',
        name: 'Sector 7 Reality Glitch',
        description: 'A tear in the simulation revealing code underneath reality',
        properties: {
          status: 'undetected',
          size: 'growing',
          danger: 'high'
        }
      }
    },
    {
      id: 'op4',
      type: 'ADD_RELATIONSHIP',
      timestamp: Date.now(),
      payload: {
        id: 'rel-chen-discovers-glitch',
        type: 'discovered',
        source: 'agent-chen',
        target: 'glitch-sector7',
        properties: {
          timestamp: '2089-03-15T22:30:00Z',
          method: 'quantum-perception'
        }
      }
    },
    {
      id: 'op5',
      type: 'UPDATE_ENTITY',
      timestamp: Date.now(),
      payload: {
        entityId: 'agent-chen',
        changes: {
          properties: {
            location: 'Sector 7',
            status: 'investigating',
            knowledge: ['glitch-exists']
          }
        }
      }
    }
  ];
  
  const commit2 = await narrative.commit(incitingOperations, {
    author: 'narrative-ai',
    message: 'Agent Chen discovers the reality glitch',
    canonicalEvent: {
      id: 'glitch-discovered',
      name: 'The Glitch Discovery',
      description: 'The moment everything changes',
      plotSignificance: 'critical'
    }
  });
  
  console.log(`\n✅ Commit 2: ${commit2.message}`);
  console.log(`   Canonical State Reached: ${commit2.canonicalEvent?.name}`);
  console.log(`   Timeline Divergence: ${commit2.timelineDivergence}`);
  
  // === ACT 2: Rising Action ===
  console.log("\n📖 ACT 2: RISING ACTION\n");
  
  // Commit 3: Oneirocom responds
  const responseOperations: GraphOperation[] = [
    {
      id: 'op6',
      type: 'UPDATE_ENTITY',
      timestamp: Date.now(),
      payload: {
        entityId: 'glitch-sector7',
        changes: {
          properties: {
            status: 'detected',
            oneirocomAwareness: true
          }
        }
      }
    },
    {
      id: 'op7',
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: 'oneirocom-enforcer',
        type: 'character',
        name: 'Enforcer Unit 7-Alpha',
        description: 'Oneirocom Timeline Enforcement Division',
        properties: {
          threat: 'extreme',
          target: 'glitch-sector7',
          secondaryTarget: 'agent-chen'
        }
      }
    },
    {
      id: 'op8',
      type: 'ADD_RELATIONSHIP',
      timestamp: Date.now(),
      payload: {
        id: 'rel-enforcer-hunts-chen',
        type: 'hunting',
        source: 'oneirocom-enforcer',
        target: 'agent-chen',
        properties: {
          intensity: 'escalating',
          timeLimit: '15 minutes'
        }
      }
    }
  ];
  
  const commit3 = await narrative.commit(responseOperations, {
    author: 'narrative-ai',
    message: 'Oneirocom detects anomaly and deploys enforcement',
    canonicalEvent: {
      id: 'oneirocom-alerted',
      name: 'Oneirocom Becomes Aware',
      description: 'The corporation strikes back',
      plotSignificance: 'major'
    }
  });
  
  console.log(`✅ Commit 3: ${commit3.message}`);
  console.log(`   Tension Level: RISING`);
  
  // === BRANCHING POINT ===
  console.log("\n🌐 TIMELINE BRANCH POINT\n");
  
  // Create branch for alternate timeline
  const altBranch = narrative.branch('exploit-glitch-timeline', commit3.id);
  console.log(`📍 Created alternate timeline: ${altBranch.name}`);
  console.log(`   Probability: ${altBranch.probability * 100}%`);
  
  // Commit 4: The choice
  const choiceOperations: GraphOperation[] = [
    {
      id: 'op9',
      type: 'UPDATE_ENTITY',
      timestamp: Date.now(),
      payload: {
        entityId: 'agent-chen',
        changes: {
          properties: {
            hasChoice: true,
            possibleActions: ['exploit-glitch', 'report-to-p89', 'destroy-evidence'],
            timeRemaining: '5 minutes'
          }
        }
      }
    },
    {
      id: 'op10',
      type: 'TIMELINE_BRANCH',
      timestamp: Date.now(),
      payload: {
        branchPoint: 'choice-point',
        branches: [
          { id: 'exploit', probability: 0.4 },
          { id: 'report', probability: 0.4 },
          { id: 'destroy', probability: 0.2 }
        ]
      }
    }
  ];
  
  const commit4 = await narrative.commit(choiceOperations, {
    author: 'narrative-ai',
    message: 'Agent Chen faces the critical choice',
    canonicalEvent: {
      id: 'choice-point',
      name: 'The Critical Decision',
      description: 'Three paths diverge in the quantum foam',
      plotSignificance: 'critical'
    }
  });
  
  console.log(`✅ Commit 4: ${commit4.message}`);
  console.log(`   Timeline Status: DIVERGING`);
  console.log(`   Possible Futures: 3`);
  
  // === SUMMARY ===
  console.log("\n📊 NARRATIVE SUMMARY\n");
  console.log(`Total Commits: 4`);
  console.log(`Canonical States Reached: 3/3`);
  console.log(`Timeline Branches: 2`);
  console.log(`Coherence Score: ${commit4.coherenceScore}`);
  console.log(`\n✨ The narrative now awaits player choice to collapse the quantum possibilities...`);
}

// Run the demonstration
demonstrateNarrativeConstruction().catch(console.error);
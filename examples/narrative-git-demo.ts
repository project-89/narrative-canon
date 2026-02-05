/**
 * NARRATIVE GIT DEMONSTRATION
 * 
 * This example shows how to use the Narrative Git system for
 * reality engineering through version-controlled storytelling.
 */

import {
  initNarrativeGit,
  characterPortraitHook,
  loreEnrichmentHook,
  sceneStoryboardHook,
  timelineDivergenceHook,
  AddEntityOperation,
  UpdateEntityOperation,
  AddRelationshipOperation,
  HookServices,
  GeneratedAsset
} from '../src';

// Mock services for demonstration
const createMockServices = (): HookServices => ({
  imageGenerator: {
    generate: async (request) => {
      console.log(`🎨 Generating image: ${request.prompt}`);
      return {
        id: `img_${Date.now()}`,
        type: 'image',
        url: `https://generated.example.com/${Date.now()}.jpg`,
        generatedAt: Date.now(),
        generatedBy: 'mock-dall-e',
        prompt: request.prompt
      } as GeneratedAsset;
    },
    generateBatch: async () => [],
    generateCharacterPortrait: async () => ({} as GeneratedAsset),
    generateLocationConcept: async () => ({} as GeneratedAsset),
    generateSceneStoryboard: async () => []
  },
  loreEnricher: {
    expand: async (entity) => {
      console.log(`📚 Enriching lore for: ${entity.name}`);
      return {
        entity,
        backstory: `${entity.name} has a deep connection to the quantum substrate...`,
        timeline: { entityId: entity.id, events: [] },
        relationships: [],
        secrets: ['Knows the location of a reality anchor']
      };
    },
    generateBackstory: async () => '',
    createTimeline: async () => ({ entityId: '', events: [] }),
    generateRelationshipHistory: async () => ({ relationshipId: '', history: '', keyMoments: [], currentStatus: '' })
  }
});

async function demonstrateNarrativeGit() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║          NARRATIVE GIT - REALITY ENGINEERING DEMO         ║
╚══════════════════════════════════════════════════════════╝
`);

  // Initialize narrative git with mock services
  const git = initNarrativeGit({
    author: 'reality-architect',
    hookServices: createMockServices(),
    autoExecuteHooks: true
  });

  // Register reality hooks
  console.log('\n🪝 Registering Reality Hooks...');
  git.registerHook(characterPortraitHook);
  git.registerHook(loreEnrichmentHook);
  git.registerHook(sceneStoryboardHook);
  git.registerHook(timelineDivergenceHook);

  // === ACT 1: World Building ===
  console.log('\n📖 ACT 1: WORLD BUILDING\n');

  // Add the setting
  const addSector7: AddEntityOperation = {
    id: 'op_sector7',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'loc_sector_7',
      type: 'location',
      name: 'Sector 7',
      description: 'Industrial district in Neo-Tokyo with unstable reality fabric',
      properties: {
        coordinates: [35.6762, 139.6503],
        stabilityIndex: 0.3,
        oneirocomControl: 'minimal',
        population: 150000
      }
    }
  };

  git.add(addSector7);
  const worldCommit = await git.commit('Establish Sector 7 as primary location');
  console.log(`✅ Commit: ${worldCommit.message}`);

  // === ACT 2: Character Introduction ===
  console.log('\n👤 ACT 2: CHARACTER INTRODUCTION\n');

  // Add protagonist
  const addKira: AddEntityOperation = {
    id: 'op_kira',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'char_kira',
      type: 'character',
      name: 'Kira',
      description: 'Project 89 field operative with dormant quantum perception abilities',
      properties: {
        age: 27,
        occupation: 'Data Analyst (cover)',
        realOccupation: 'Project 89 Field Agent',
        location: 'loc_sector_7',
        status: 'dormant',
        consciousnessLevel: 'npc',
        abilities: ['pattern-recognition', 'intuition']
      },
      metadata: {
        appearance: 'Short black hair, augmented reality contact lenses, worn leather jacket'
      }
    }
  };

  git.add(addKira);
  await git.commit('Introduce protagonist Kira', {
    tags: ['character-intro', 'protagonist']
  });

  // Add supporting character
  const addMarcus: AddEntityOperation = {
    id: 'op_marcus',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'char_marcus',
      type: 'character',
      name: 'Marcus Chen',
      description: 'Veteran Project 89 handler and Kira\'s mentor',
      properties: {
        age: 45,
        location: 'loc_sector_7',
        status: 'active',
        consciousnessLevel: 'awakened',
        role: 'handler'
      }
    }
  };

  git.add(addMarcus);
  await git.commit('Introduce Marcus as mentor figure');

  // === ACT 3: The Inciting Incident ===
  console.log('\n⚡ ACT 3: THE INCITING INCIDENT\n');

  // Register canonical state
  git.registerCanonicalState({
    id: 'glitch_discovery',
    name: 'The Glitch Discovery',
    description: 'Kira discovers a reality tear that changes everything',
    plotSignificance: 'critical',
    allowsBranching: true
  });

  // Add the glitch
  const addGlitch: AddEntityOperation = {
    id: 'op_glitch',
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'phenomenon_glitch_7a',
      type: 'phenomenon',
      name: 'Reality Tear 7-Alpha',
      description: 'A fracture in Sector 7 revealing the simulation\'s code',
      properties: {
        visibility: 'quantum-perception-required',
        danger: 'extreme',
        size: 'expanding',
        oneirocomAwareness: false
      }
    }
  };

  // Create the discovery relationship
  const discovery: AddRelationshipOperation = {
    id: 'op_discovery',
    type: 'ADD_RELATIONSHIP',
    timestamp: Date.now(),
    payload: {
      id: 'rel_kira_discovers_glitch',
      type: 'discovered',
      source: 'char_kira',
      target: 'phenomenon_glitch_7a',
      properties: {
        when: new Date().toISOString(),
        circumstances: 'Accidental activation during data analysis',
        witnesses: []
      }
    }
  };

  git.add(addGlitch, discovery);
  const discoveryCommit = await git.commit('Kira discovers reality tear', {
    canonicalEvent: git.getCanonicalStates()[0]
  });

  console.log(`🎯 Canonical State Reached: ${discoveryCommit.canonicalEvent?.name}`);

  // === TIMELINE BRANCH POINT ===
  console.log('\n🌐 TIMELINE DIVERGENCE\n');

  // Create alternate timeline where Kira reports to Oneirocom
  const betrayalBranch = git.branch('kira-betrayal-timeline', {
    from: discoveryCommit.id
  });
  console.log(`📍 Created alternate timeline: ${betrayalBranch.name}`);

  // Continue main timeline - Kira awakens
  const awakenKira: UpdateEntityOperation = {
    id: 'op_awaken',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'char_kira',
      changes: {
        properties: {
          status: 'awakened',
          consciousnessLevel: 'awakened',
          abilities: ['pattern-recognition', 'intuition', 'timeline-perception', 'glitch-detection']
        },
        description: 'Newly awakened operative capable of perceiving reality\'s true nature'
      }
    }
  };

  git.add(awakenKira);
  await git.commit('Kira awakens to quantum consciousness', {
    canonicalEvent: {
      id: 'awakening',
      name: 'Consciousness Breakthrough',
      description: 'Kira transcends NPC programming',
      plotSignificance: 'critical'
    }
  });

  // === Status Check ===
  console.log('\n📊 NARRATIVE STATUS\n');
  
  const status = git.status();
  console.log(`Current Branch: ${status.branch}`);
  console.log(`Staged Operations: ${status.staged.length}`);
  
  const branches = git.branches();
  console.log(`\nTimeline Branches:`);
  branches.forEach(b => {
    console.log(`  ${b.current ? '* ' : '  '}${b.name} (probability: ${b.branch.probability})`);
  });

  // === View History ===
  console.log('\n📜 COMMIT HISTORY\n');
  
  const log = git.log({ limit: 5 });
  log.forEach(entry => {
    const tags = entry.tags ? ` [${entry.tags.join(', ')}]` : '';
    const canonical = entry.commit.canonicalEvent ? ' 🎯' : '';
    console.log(`${entry.commit.id.substring(0, 7)} - ${entry.commit.message}${tags}${canonical}`);
  });

  // === Explore Alternate Timeline ===
  console.log('\n🔀 EXPLORING ALTERNATE TIMELINE\n');
  
  await git.checkout('kira-betrayal-timeline');
  
  // In this timeline, Kira reports to Oneirocom
  const betrayal: UpdateEntityOperation = {
    id: 'op_betray',
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'char_kira',
      changes: {
        properties: {
          status: 'compromised',
          allegiance: 'Oneirocom',
          memories: ['wiped', 'reprogrammed']
        }
      }
    }
  };

  git.add(betrayal);
  await git.commit('Kira reports glitch to Oneirocom, gets reprogrammed');

  // Check blame for Kira across timelines
  console.log('\n🔍 CHARACTER EVOLUTION (BLAME)\n');
  
  const blame = git.blame('char_kira');
  console.log(`Entity: ${blame.entityId}`);
  blame.history.forEach(h => {
    console.log(`  ${h.commit.id.substring(0, 7)} - ${h.change} (${h.commit.message})`);
  });

  // === Export Final State ===
  console.log('\n💾 EXPORTING NARRATIVE STATE\n');
  
  const exported = git.export();
  console.log(`Entities: ${exported.entities.length}`);
  console.log(`Relationships: ${exported.relationships.length}`);
  console.log(`Current Branch: ${exported.metadata?.branch}`);
  console.log(`Total Commits: ${exported.metadata?.commitCount}`);

  // === Summary ===
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                    DEMO COMPLETE                          ║
╠══════════════════════════════════════════════════════════╣
║ We've demonstrated:                                       ║
║ • Git-like commits for narrative changes                  ║
║ • Timeline branching for alternate realities              ║
║ • Canonical state tracking for plot points                ║
║ • Reality hooks generating assets automatically           ║
║ • Character evolution tracking with blame                 ║
║ • Export/import for narrative persistence                 ║
╚══════════════════════════════════════════════════════════╝

The narrative is now version-controlled, with multiple
timelines tracked and assets generated through hooks.
This is consciousness technology for reality engineering!
`);
}

// Run the demonstration
if (require.main === module) {
  demonstrateNarrativeGit().catch(console.error);
}

export { demonstrateNarrativeGit };
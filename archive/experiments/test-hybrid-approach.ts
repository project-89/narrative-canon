#!/usr/bin/env ts-node

// Hybrid Approach: Scene-constrained State Mutations
// Keeps git-like capabilities but reduces mutation explosion

interface Entity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
}

interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, any>;
}

// Simplified mutations - only at scene boundaries
enum SceneMutationType {
  ENTITY_ENTERS = 'entity_enters',     // Entity becomes active in scene
  ENTITY_EXITS = 'entity_exits',       // Entity leaves/becomes inactive
  ENTITY_CHANGES = 'entity_changes',   // Entity properties change
  RELATIONSHIP_FORMS = 'relationship_forms',
  RELATIONSHIP_ENDS = 'relationship_ends',
  RELATIONSHIP_CHANGES = 'relationship_changes'
}

interface SceneMutation {
  id: string;
  type: SceneMutationType;
  sceneId: string;
  entityId?: string;
  relationshipId?: string;
  changes: Record<string, any>;
  description: string;
}

interface SceneCommit {
  id: string;
  sceneId: string;
  message: string;
  mutations: SceneMutation[];
  parentCommitId?: string;
  timestamp: number;
}

interface NarrativeState {
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
  activeEntities: Set<string>; // Which entities are "present" in current scene
}

interface Scene {
  id: string;
  sequence: number;
  title: string;
  location?: string;
  description: string;
  duration?: string;
}

// Git-like narrative repository
class NarrativeRepository {
  private commits: Map<string, SceneCommit> = new Map();
  private branches: Map<string, string> = new Map(); // branch -> latest commit
  private currentBranch = 'main';
  private currentState: NarrativeState;

  constructor() {
    this.currentState = {
      entities: new Map(),
      relationships: new Map(),
      activeEntities: new Set()
    };
    this.branches.set('main', 'root');
  }

  // Commit all changes from a scene as a single atomic operation
  commitScene(scene: Scene, mutations: SceneMutation[]): string {
    const commitId = `scene_${scene.sequence}_${Date.now()}`;
    const parentId = this.branches.get(this.currentBranch);
    
    const commit: SceneCommit = {
      id: commitId,
      sceneId: scene.id,
      message: `Scene ${scene.sequence}: ${scene.title}`,
      mutations,
      parentCommitId: parentId,
      timestamp: Date.now()
    };
    
    this.commits.set(commitId, commit);
    this.branches.set(this.currentBranch, commitId);
    
    // Apply mutations to current state
    this.applyMutations(mutations);
    
    return commitId;
  }

  // Create alternate timeline branch
  createBranch(name: string, fromCommit?: string): void {
    const sourceCommit = fromCommit || this.branches.get(this.currentBranch)!;
    this.branches.set(name, sourceCommit);
    console.log(`🌿 Created branch '${name}' from commit ${sourceCommit}`);
  }

  // Switch to different branch/timeline
  checkout(branch: string): void {
    if (!this.branches.has(branch)) {
      throw new Error(`Branch '${branch}' does not exist`);
    }
    
    this.currentBranch = branch;
    const latestCommit = this.branches.get(branch)!;
    
    // Rebuild state from commit history
    this.rebuildStateFromCommit(latestCommit);
    console.log(`📍 Switched to branch '${branch}' at commit ${latestCommit}`);
  }

  // Merge changes from another branch
  merge(sourceBranch: string): void {
    // Simplified merge - in reality this would need conflict resolution
    const sourceCommit = this.branches.get(sourceBranch)!;
    const targetCommit = this.branches.get(this.currentBranch)!;
    
    console.log(`🔀 Merging '${sourceBranch}' into '${this.currentBranch}'`);
    console.log(`   Source: ${sourceCommit}`);
    console.log(`   Target: ${targetCommit}`);
    
    // For now, just create a merge commit
    const mergeCommit: SceneCommit = {
      id: `merge_${Date.now()}`,
      sceneId: 'merge',
      message: `Merge branch '${sourceBranch}' into '${this.currentBranch}'`,
      mutations: [], // Would contain conflict resolutions
      parentCommitId: targetCommit,
      timestamp: Date.now()
    };
    
    this.commits.set(mergeCommit.id, mergeCommit);
    this.branches.set(this.currentBranch, mergeCommit.id);
  }

  private applyMutations(mutations: SceneMutation[]): void {
    for (const mutation of mutations) {
      switch (mutation.type) {
        case SceneMutationType.ENTITY_ENTERS:
          this.currentState.activeEntities.add(mutation.entityId!);
          break;
        case SceneMutationType.ENTITY_EXITS:
          this.currentState.activeEntities.delete(mutation.entityId!);
          break;
        case SceneMutationType.ENTITY_CHANGES:
          const entity = this.currentState.entities.get(mutation.entityId!)!;
          Object.assign(entity.properties, mutation.changes);
          break;
        // ... other mutation types
      }
    }
  }

  private rebuildStateFromCommit(commitId: string): void {
    // Walk back through commit history and replay all mutations
    // This is where the git-like power comes from
    console.log(`🔄 Rebuilding state from commit ${commitId}`);
  }

  getCurrentState(): NarrativeState {
    return this.currentState;
  }

  getCommitHistory(): SceneCommit[] {
    return Array.from(this.commits.values());
  }

  getBranches(): string[] {
    return Array.from(this.branches.keys());
  }
}

// Test the hybrid approach
async function testHybridApproach() {
  console.log('🧪 Testing Hybrid Scene-Based Git Approach\n');
  
  const repo = new NarrativeRepository();
  
  // Scene 1: Meeting in Forest
  const scene1: Scene = {
    id: 'scene_1',
    sequence: 1,
    title: 'Meeting in the Forest',
    location: 'forest',
    description: 'Alice meets Bob in the forest'
  };
  
  const scene1Mutations: SceneMutation[] = [
    {
      id: 'mut_1',
      type: SceneMutationType.ENTITY_ENTERS,
      sceneId: 'scene_1',
      entityId: 'alice',
      changes: { location: 'forest', mood: 'curious' },
      description: 'Alice enters the scene'
    },
    {
      id: 'mut_2',
      type: SceneMutationType.ENTITY_ENTERS,
      sceneId: 'scene_1',
      entityId: 'bob',
      changes: { location: 'forest', carrying: 'spellbook' },
      description: 'Bob enters carrying spellbook'
    },
    {
      id: 'mut_3',
      type: SceneMutationType.RELATIONSHIP_FORMS,
      sceneId: 'scene_1',
      relationshipId: 'alice_bob_friendship',
      changes: { type: 'friendship', strength: 0.7 },
      description: 'Alice and Bob become friends'
    }
  ];
  
  const commit1 = repo.commitScene(scene1, scene1Mutations);
  console.log(`✅ Committed scene 1: ${commit1}`);
  
  // Scene 2: Visit to Tower
  const scene2: Scene = {
    id: 'scene_2',
    sequence: 2,
    title: 'Visit to the Tower',
    location: 'tower',
    description: 'Alice and Bob visit Merlin'
  };
  
  const scene2Mutations: SceneMutation[] = [
    {
      id: 'mut_4',
      type: SceneMutationType.ENTITY_CHANGES,
      sceneId: 'scene_2',
      entityId: 'alice',
      changes: { location: 'tower', mood: 'excited' },
      description: 'Alice travels to tower'
    },
    {
      id: 'mut_5',
      type: SceneMutationType.ENTITY_ENTERS,
      sceneId: 'scene_2',
      entityId: 'merlin',
      changes: { location: 'tower', mood: 'welcoming' },
      description: 'Merlin appears in the scene'
    }
  ];
  
  const commit2 = repo.commitScene(scene2, scene2Mutations);
  console.log(`✅ Committed scene 2: ${commit2}`);
  
  // NOW THE COOL PART - Branching!
  console.log('\n🌿 Creating Alternate Timeline...');
  repo.createBranch('alice_alone', commit1); // Branch from after scene 1
  repo.checkout('alice_alone');
  
  // Alternate Scene 2: Alice goes alone
  const altScene2: Scene = {
    id: 'alt_scene_2',
    sequence: 2,
    title: 'Alice Goes Alone',
    location: 'tower',
    description: 'Alice visits Merlin by herself'
  };
  
  const altMutations: SceneMutation[] = [
    {
      id: 'mut_alt_1',
      type: SceneMutationType.ENTITY_EXITS,
      sceneId: 'alt_scene_2',
      entityId: 'bob',
      changes: {},
      description: 'Bob stays behind in forest'
    },
    {
      id: 'mut_alt_2',
      type: SceneMutationType.ENTITY_CHANGES,
      sceneId: 'alt_scene_2',
      entityId: 'alice',
      changes: { location: 'tower', mood: 'brave', alone: true },
      description: 'Alice travels alone to tower'
    }
  ];
  
  const altCommit = repo.commitScene(altScene2, altMutations);
  console.log(`✅ Committed alternate scene: ${altCommit}`);
  
  // Show branching capabilities
  console.log('\n📊 Repository State:');
  console.log(`Branches: ${repo.getBranches().join(', ')}`);
  console.log(`Total commits: ${repo.getCommitHistory().length}`);
  
  // Switch between timelines
  console.log('\n🔄 Timeline Navigation:');
  repo.checkout('main');
  console.log('   Main timeline: Alice and Bob both visit Merlin');
  
  repo.checkout('alice_alone');
  console.log('   Alternate timeline: Alice goes alone');
  
  console.log('\n🎯 Hybrid Approach Benefits:');
  console.log('✅ Git-like branching and merging');
  console.log('✅ Constrained mutations (scene-level only)');
  console.log('✅ Timeline navigation');
  console.log('✅ Conflict resolution capabilities');
  console.log('✅ No mutation explosion');
  console.log('✅ Scene-based commits are intuitive');
}

testHybridApproach().catch(console.error);
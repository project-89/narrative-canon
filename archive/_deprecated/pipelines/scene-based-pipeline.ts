import { SceneBoundaryDetector, SceneSegment } from './scene-boundary-detector';
import { CharacterExtractor } from './extractors/character';
import { RelationshipExtractor } from './extractors/relationship-extractor';
import { SceneExtractor } from './extractors/scene-extractor';
import { Scene as ExtractedScene } from './types';
import { Entity, Relationship, Scene, GraphMutation, NarrativeCommit } from './types';
import { MockLLM } from './llm/mock';

export interface SceneCommit {
  id: string;
  sceneId: string;
  content: string;
  entities: Entity[];
  relationships: Relationship[];
  sceneData: Scene;
  mutations: GraphMutation[];
  parentCommit?: string;
  timestamp: Date;
  significance: number;
}

export interface NarrativeState {
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
  scenes: Map<string, Scene>;
  commits: SceneCommit[];
  currentBranch: string;
}

export class SceneBasedPipeline {
  private boundaryDetector: SceneBoundaryDetector;
  private characterExtractor: CharacterExtractor;
  private relationshipExtractor: RelationshipExtractor; 
  private sceneExtractor: SceneExtractor;

  constructor(llmAdapter = new MockLLM()) {
    this.boundaryDetector = new SceneBoundaryDetector();
    this.characterExtractor = new CharacterExtractor(llmAdapter);
    this.relationshipExtractor = new RelationshipExtractor(llmAdapter);
    this.sceneExtractor = new SceneExtractor(llmAdapter);
  }

  async extractNarrativeAsCommits(text: string, title: string = "Untitled Story"): Promise<NarrativeState> {
    console.log(`\n🎬 Processing narrative: ${title}`);
    
    // 1. Segment story into atomic scenes
    const segments = this.boundaryDetector.segmentIntoScenes(text);
    console.log(`📚 Found ${segments.length} atomic scenes`);
    
    // 2. Initialize narrative state
    const state: NarrativeState = {
      entities: new Map(),
      relationships: new Map(), 
      scenes: new Map(),
      commits: [],
      currentBranch: 'main'
    };

    // 3. Process each scene as a commit
    let previousCommitId: string | undefined;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`\n🎭 Processing ${segment.id} (${segment.content.length} chars, significance: ${segment.significance})`);
      
      const commit = await this.processSceneAsCommit(
        segment, 
        state, 
        previousCommitId,
        i + 1
      );
      
      state.commits.push(commit);
      previousCommitId = commit.id;
      
      console.log(`  ✨ Commit ${commit.id}: +${commit.entities.length} entities, +${commit.relationships.length} relationships`);
    }

    console.log(`\n📊 Final state: ${state.entities.size} entities, ${state.relationships.size} relationships, ${state.scenes.size} scenes`);
    return state;
  }

  private async processSceneAsCommit(
    segment: SceneSegment, 
    state: NarrativeState,
    parentCommit: string | undefined,
    sceneNumber: number
  ): Promise<SceneCommit> {
    
    // Extract scene content
    const entities = await this.characterExtractor.extractCharacters(segment.content);
    const scenes = await this.sceneExtractor.extractScenes(segment.content, entities);
    const relationships = await this.relationshipExtractor.extractRelationships(
      segment.content, 
      Array.from(state.entities.values()),
      scenes
    );
    // Convert from scene-extractor Scene to types.ts Scene
    const extractedScene = scenes[0];
    const sceneData: Scene = extractedScene ? {
      id: extractedScene.id,
      title: `Scene ${sceneNumber}`,
      sequence: extractedScene.sequence,
      location: extractedScene.location || undefined,
      characters: extractedScene.characters,
      description: extractedScene.summary,
      events: (extractedScene.events || []).map(e => ({
        id: e.id,
        sequence: e.sequence,
        sceneId: extractedScene.id,
        description: e.description,
        participants: e.participants
      }))
    } : {
      id: segment.id,
      title: `Scene ${sceneNumber}`,
      sequence: sceneNumber,
      location: undefined,
      characters: entities.map(e => e.name),
      description: segment.content.slice(0, 100) + '...',
      events: []
    };

    // Generate mutations for this scene commit
    const mutations: GraphMutation[] = [];
    
    // Entity mutations
    for (const entity of entities) {
      if (!state.entities.has(entity.id)) {
        mutations.push({
          type: 'add_entity',
          entityId: entity.id,
          data: entity
        });
        state.entities.set(entity.id, entity);
      }
    }

    // Relationship mutations
    for (const relationship of relationships) {
      const relKey = `${relationship.source}_${relationship.target}_${relationship.type}`;
      if (!state.relationships.has(relKey)) {
        mutations.push({
          type: 'add_relationship',
          relationshipId: relKey,
          data: relationship
        });
        state.relationships.set(relKey, {
          id: relKey,
          source: relationship.source,
          target: relationship.target,
          type: relationship.type,
          strength: 0.5
        });
      }
    }

    // Scene mutation
    mutations.push({
      type: 'add_scene',
      sceneId: segment.id,
      data: sceneData
    });
    state.scenes.set(segment.id, sceneData);

    // Create the commit
    const commit: SceneCommit = {
      id: `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sceneId: segment.id,
      content: segment.content,
      entities,
      relationships: relationships.map(r => ({
        id: `${r.source}_${r.target}_${r.type}`,
        source: r.source,
        target: r.target,
        type: r.type,
        strength: 0.5
      })), 
      sceneData,
      mutations,
      parentCommit,
      timestamp: new Date(),
      significance: segment.significance
    };

    return commit;
  }

  // Enable branching for "what if" scenarios
  async createBranch(state: NarrativeState, branchName: string, fromCommit?: string): Promise<NarrativeState> {
    const branchState: NarrativeState = {
      entities: new Map(state.entities),
      relationships: new Map(state.relationships),
      scenes: new Map(state.scenes),
      commits: [...state.commits],
      currentBranch: branchName
    };

    if (fromCommit) {
      // Revert to specific commit if needed
      const commitIndex = branchState.commits.findIndex(c => c.id === fromCommit);
      if (commitIndex >= 0) {
        branchState.commits = branchState.commits.slice(0, commitIndex + 1);
        // Would need to rebuild state from commits here
      }
    }

    return branchState;
  }

  // Merge branches with conflict resolution
  async mergeBranches(mainState: NarrativeState, branchState: NarrativeState): Promise<NarrativeState> {
    // Simple merge - in practice you'd want sophisticated conflict resolution
    const mergedState: NarrativeState = {
      entities: new Map([...mainState.entities, ...branchState.entities]),
      relationships: new Map([...mainState.relationships, ...branchState.relationships]),
      scenes: new Map([...mainState.scenes, ...branchState.scenes]),
      commits: [...mainState.commits, ...branchState.commits],
      currentBranch: mainState.currentBranch
    };

    return mergedState;
  }
}
/**
 * NARRATIVE REPOSITORY
 *
 * Main API for the "git for narrative" system.
 * Coordinates extraction, versioning, branching, merging, and consistency checking.
 */

import {
  NarrativeCommit,
  NarrativeBranch,
  MergeRequest,
  WorldStateSnapshot,
  NarrativeConsistencyEngine,
  NarrativeMergeEngine,
  EntityChange,
  RelationshipChange,
  SceneChange,
  Inconsistency,
  NarrativeEntity,
  NarrativeRelationship,
  NarrativeScene,
} from "./narrative-versioning";
import { SceneBoundaryDetector } from "../scene-boundary-detector";
import { CharacterLLMExtractor } from "../extractors/character-llm-extractor";
import { RelationshipLLMExtractor } from "../extractors/relationship-llm-extractor";
import { SceneExtractor } from "../extractors/scene-extractor";
import { LLMAdapter } from "../llm/types";

/**
 * Main narrative repository - like a Git repository but for stories
 */
export class NarrativeRepository {
  private commits: Map<string, NarrativeCommit> = new Map();
  private branches: Map<string, NarrativeBranch> = new Map();
  private currentBranch: string = "main";
  private consistencyEngine: NarrativeConsistencyEngine;
  private mergeEngine: NarrativeMergeEngine;

  // Extractors
  private boundaryDetector: SceneBoundaryDetector;
  private characterExtractor: CharacterLLMExtractor;
  private relationshipExtractor: RelationshipLLMExtractor;
  private sceneExtractor: SceneExtractor;

  constructor(llmAdapter: LLMAdapter) {
    this.consistencyEngine = new NarrativeConsistencyEngine();
    this.mergeEngine = new NarrativeMergeEngine();

    // Initialize extractors
    this.boundaryDetector = new SceneBoundaryDetector();
    this.characterExtractor = new CharacterLLMExtractor(llmAdapter);
    this.relationshipExtractor = new RelationshipLLMExtractor(llmAdapter);
    this.sceneExtractor = new SceneExtractor(llmAdapter);

    // Initialize main branch
    this.createBranch("main", "Initial branch");
  }

  // ============================================================================
  // HIGH-LEVEL NARRATIVE OPERATIONS
  // ============================================================================

  /**
   * Extract narrative from text and create a commit
   */
  async extractAndCommit(
    text: string,
    title: string = "Untitled Story",
    author: string = "system",
    message?: string,
    narrativeDate?: Date
  ): Promise<NarrativeCommit> {
    // 1. Extract scenes using boundary detection
    const scenes = await this.extractScenes(text, title);

    // 2. Extract entities and relationships from all scenes in parallel
    console.log(
      `Extracting entities and relationships from ${scenes.length} scenes in parallel...`
    );
    const sceneExtractions = await Promise.all(
      scenes.map(async (scene, index) => {
        try {
          const [entities, relationships] = await Promise.all([
            this.characterExtractor.extractCharacters(scene.content),
            this.relationshipExtractor.extractRelationships(scene.content),
          ]);

          return {
            scene,
            entities: entities.map((entity) =>
              this.convertToNarrativeEntity(entity)
            ),
            relationships: relationships.map((rel) =>
              this.convertToNarrativeRelationship(rel)
            ),
          };
        } catch (error) {
          console.warn(
            `Failed to extract from scene ${index + 1}:`,
            error instanceof Error ? error.message : error
          );
          return {
            scene,
            entities: [] as NarrativeEntity[],
            relationships: [] as NarrativeRelationship[],
          };
        }
      })
    );

    // Flatten results
    const allEntities = sceneExtractions.flatMap((result) => result.entities);
    const allRelationships = sceneExtractions.flatMap(
      (result) => result.relationships
    );

    // 3. Deduplicate and merge entities/relationships
    const uniqueEntities = this.deduplicateEntities(allEntities);
    const uniqueRelationships = this.deduplicateRelationships(allRelationships);

    // 4. Create changes from current state
    const entityChanges = this.createEntityChanges(uniqueEntities);
    const relationshipChanges =
      this.createRelationshipChanges(uniqueRelationships);
    const sceneChanges = this.createSceneChanges(scenes);

    // 5. Create world state snapshot
    const worldState = this.createWorldState(
      uniqueEntities,
      uniqueRelationships,
      scenes
    );

    // 6. Run consistency checks
    const inconsistencies =
      await this.consistencyEngine.checkConsistency(worldState);
    worldState.inconsistencies = inconsistencies;
    worldState.consistencyScore =
      this.calculateConsistencyScore(inconsistencies);

    // 7. Create commit
    const commit: NarrativeCommit = {
      id: `commit_${Date.now()}`,
      hash: this.generateCommitHash(worldState),
      parentCommits: this.getHeadCommits(),
      timestamp: new Date(),
      author,
      message: message || `Extract narrative: ${title}`,
      narrativeDate: narrativeDate,
      timelineContext: narrativeDate
        ? {
            year: narrativeDate.getFullYear(),
            month: narrativeDate.getMonth() + 1,
            day: narrativeDate.getDate(),
          }
        : undefined,
      entities: entityChanges,
      relationships: relationshipChanges,
      scenes: sceneChanges,
      worldState,
      branch: this.currentBranch,
      tags: ["extraction"],
      significance: this.calculateSignificance(
        entityChanges,
        relationshipChanges,
        sceneChanges
      ),
      conflictResolutions: [],
    };

    // 8. Store commit and update branch
    this.commits.set(commit.hash, commit);
    this.updateBranchHead(this.currentBranch, commit.hash);

    return commit;
  }

  /**
   * Append additional text to existing narrative
   */
  async appendNarrative(
    text: string,
    author: string = "system",
    message?: string
  ): Promise<NarrativeCommit> {
    // Extract from new text
    const scenes = await this.extractScenes(text, "Continuation");

    // Get current world state
    const currentState = this.getCurrentWorldState();

    // Extract new entities/relationships
    const newEntities: NarrativeEntity[] = [];
    const newRelationships: NarrativeRelationship[] = [];

    for (const scene of scenes) {
      const entities = await this.characterExtractor.extractCharacters(
        scene.content
      );
      const relationships =
        await this.relationshipExtractor.extractRelationships(scene.content);

      // Convert to NarrativeEntity format
      const narrativeEntities = entities.map((entity) =>
        this.convertToNarrativeEntity(entity)
      );
      const narrativeRelationships = relationships.map((rel) =>
        this.convertToNarrativeRelationship(rel)
      );

      newEntities.push(...narrativeEntities);
      newRelationships.push(...narrativeRelationships);
    }

    // Merge with existing state
    const mergedEntities = this.mergeEntities(currentState, newEntities);
    const mergedRelationships = this.mergeRelationships(
      currentState,
      newRelationships
    );

    // Create incremental changes
    const entityChanges = this.createIncrementalEntityChanges(
      currentState,
      mergedEntities
    );
    const relationshipChanges = this.createIncrementalRelationshipChanges(
      currentState,
      mergedRelationships
    );
    const sceneChanges = this.createIncrementalSceneChanges(
      currentState,
      scenes
    );

    // Create new world state
    const worldState = this.createWorldState(
      mergedEntities,
      mergedRelationships,
      [...this.getCurrentScenes(), ...scenes]
    );

    // Consistency checks
    const inconsistencies =
      await this.consistencyEngine.checkConsistency(worldState);
    worldState.inconsistencies = inconsistencies;
    worldState.consistencyScore =
      this.calculateConsistencyScore(inconsistencies);

    // Create commit
    const commit: NarrativeCommit = {
      id: `commit_${Date.now()}`,
      hash: this.generateCommitHash(worldState),
      parentCommits: this.getHeadCommits(),
      timestamp: new Date(),
      author,
      message: message || "Append narrative continuation",
      entities: entityChanges,
      relationships: relationshipChanges,
      scenes: sceneChanges,
      worldState,
      branch: this.currentBranch,
      tags: ["append"],
      significance: this.calculateSignificance(
        entityChanges,
        relationshipChanges,
        sceneChanges
      ),
      conflictResolutions: [],
    };

    this.commits.set(commit.hash, commit);
    this.updateBranchHead(this.currentBranch, commit.hash);

    return commit;
  }

  // ============================================================================
  // BRANCHING & MERGING
  // ============================================================================

  /**
   * Create new narrative branch
   */
  createBranch(
    name: string,
    description: string,
    fromCommit?: string
  ): NarrativeBranch {
    const sourceCommit = fromCommit || this.getBranchHead(this.currentBranch);

    const branch: NarrativeBranch = {
      name,
      createdFrom: sourceCommit || "genesis",
      createdAt: new Date(),
      creator: "system",
      description,
      head: sourceCommit || "genesis",
      commits: sourceCommit ? [sourceCommit] : [],
      active: true,
      type: name === "main" ? "main" : "feature",
      contributors: [],
      reviewers: [],
      status: "active",
    };

    this.branches.set(name, branch);
    return branch;
  }

  /**
   * Switch to different branch
   */
  checkout(branchName: string): boolean {
    if (!this.branches.has(branchName)) {
      return false;
    }
    this.currentBranch = branchName;
    return true;
  }

  /**
   * Create merge request between branches
   */
  async createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string,
    author: string
  ): Promise<MergeRequest> {
    const sourceCommits = this.getBranchCommits(sourceBranch);
    const targetCommits = this.getBranchCommits(targetBranch);
    const commonAncestor = this.findCommonAncestor(
      sourceCommits,
      targetCommits
    );

    return await this.mergeEngine.analyzeMerge(
      sourceCommits,
      targetCommits,
      commonAncestor
    );
  }

  /**
   * Execute merge request
   */
  async executeMerge(mergeRequest: MergeRequest): Promise<NarrativeCommit> {
    const mergeCommit = await this.mergeEngine.executeMerge(mergeRequest);

    this.commits.set(mergeCommit.hash, mergeCommit);
    this.updateBranchHead(mergeRequest.targetBranch, mergeCommit.hash);

    return mergeCommit;
  }

  // ============================================================================
  // QUERY & ANALYSIS
  // ============================================================================

  /**
   * Get current narrative state
   */
  getCurrentWorldState(): WorldStateSnapshot {
    const headCommit = this.getHeadCommit();
    return headCommit?.worldState || this.createEmptyWorldState();
  }

  /**
   * Get narrative history
   */
  getHistory(branchName?: string): NarrativeCommit[] {
    const branch = branchName || this.currentBranch;
    return this.getBranchCommits(branch);
  }

  /**
   * Search entities across narrative
   */
  searchEntities(query: string): NarrativeEntity[] {
    const worldState = this.getCurrentWorldState();
    const entities: NarrativeEntity[] = [];

    for (const [entityId, state] of worldState.entityStates) {
      // This would need the full entity data - simplified for demo
      if (entityId.toLowerCase().includes(query.toLowerCase())) {
        entities.push({
          id: entityId,
          name: entityId,
          type: "character",
          aliases: [],
          significance: state.significance,
          personality: [],
          motivations: [],
          abilities: [],
          emotional_state: [],
          goals: [],
          firstMentioned: 0,
          lastModified: state.lastModified,
          version: 1,
          changeHistory: [],
        });
      }
    }

    return entities;
  }

  /**
   * Get relationship network
   */
  getRelationshipNetwork(): Map<string, NarrativeRelationship[]> {
    const worldState = this.getCurrentWorldState();
    const network = new Map<string, NarrativeRelationship[]>();

    for (const [relId, relState] of worldState.activeRelationships) {
      if (!network.has(relState.source)) {
        network.set(relState.source, []);
      }

      // Convert state back to relationship - simplified for demo
      const relationship: NarrativeRelationship = {
        id: relId,
        source: relState.source,
        target: relState.target,
        type: relState.type,
        description: "",
        strength: relState.strength,
        directionality: "bidirectional",
        temporality: "evolving",
        evidence: relState.evidence,
        overall_tone: "neutral",
        first_mentioned: 0,
        lastModified: relState.lastModified,
        version: 1,
        changeHistory: [],
      };

      network.get(relState.source)!.push(relationship);
    }

    return network;
  }

  /**
   * Check narrative consistency
   */
  async checkConsistency(): Promise<Inconsistency[]> {
    const worldState = this.getCurrentWorldState();
    return await this.consistencyEngine.checkConsistency(worldState);
  }

  /**
   * Get commits ordered by narrative date
   */
  getNarrativeTimeline(branch?: string): NarrativeCommit[] {
    const branchName = branch || this.currentBranch;
    const commits = this.getBranchCommits(branchName);

    // Separate commits with and without narrative dates
    const datedCommits = commits.filter((c) => c.narrativeDate);
    const undatedCommits = commits.filter((c) => !c.narrativeDate);

    // Sort dated commits by narrative date
    datedCommits.sort((a, b) => {
      const dateA = a.narrativeDate!.getTime();
      const dateB = b.narrativeDate!.getTime();

      // If same date, use narrative order or commit timestamp
      if (dateA === dateB) {
        if (a.narrativeOrder !== undefined && b.narrativeOrder !== undefined) {
          return a.narrativeOrder - b.narrativeOrder;
        }
        return a.timestamp.getTime() - b.timestamp.getTime();
      }

      return dateA - dateB;
    });

    // Append undated commits at the end (in commit order)
    return [...datedCommits, ...undatedCommits];
  }

  /**
   * Get commits within a narrative date range
   */
  getTimelineRange(
    startDate: Date,
    endDate: Date,
    branch?: string
  ): NarrativeCommit[] {
    const timeline = this.getNarrativeTimeline(branch);

    return timeline.filter((commit) => {
      if (!commit.narrativeDate) return false;
      const date = commit.narrativeDate.getTime();
      return date >= startDate.getTime() && date <= endDate.getTime();
    });
  }

  /**
   * Add narrative at specific point in timeline
   */
  async addAtTime(
    text: string,
    narrativeDate: Date,
    message?: string,
    title?: string
  ): Promise<NarrativeCommit> {
    // Check for temporal conflicts before committing
    const potentialConflicts = await this.checkTemporalConflicts(
      narrativeDate,
      text
    );

    if (potentialConflicts.length > 0) {
      console.warn("⚠️ Temporal conflicts detected:", potentialConflicts);
    }

    return this.extractAndCommit(
      text,
      title || `Event at ${narrativeDate.toISOString()}`,
      "user",
      message,
      narrativeDate
    );
  }

  /**
   * Check for temporal conflicts before adding content
   */
  private async checkTemporalConflicts(
    narrativeDate: Date,
    text: string
  ): Promise<string[]> {
    const conflicts: string[] = [];

    // Get existing commits near this date
    const window = 30 * 24 * 60 * 60 * 1000; // 30 days
    const nearbyCommits = this.getTimelineRange(
      new Date(narrativeDate.getTime() - window),
      new Date(narrativeDate.getTime() + window)
    );

    // Extract entities from the new text (simplified check)
    const entities = await this.characterExtractor.extractCharacters(text, []);

    // Check for entity lifecycle conflicts
    for (const entity of entities) {
      for (const commit of nearbyCommits) {
        // Check if entity was destroyed before this date
        const destruction = commit.entities.find(
          (e) => e.entityId === entity.id && e.changeType === "delete"
        );

        if (destruction && commit.narrativeDate! < narrativeDate) {
          conflicts.push(
            `Entity ${entity.name} was destroyed on ${commit.narrativeDate?.toDateString()} but appears in new content`
          );
        }
      }
    }

    return conflicts;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async extractScenes(
    text: string,
    title: string
  ): Promise<NarrativeScene[]> {
    const segments = this.boundaryDetector.segmentIntoScenes(text);

    const scenes: NarrativeScene[] = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const extractedScenes = await this.sceneExtractor.extractScenes(
        segment.content,
        []
      );

      // Use the first extracted scene or create a basic one
      const sceneData =
        extractedScenes.length > 0
          ? extractedScenes[0]
          : {
              id: `scene_${i}`,
              sequence: i + 1,
              summary: `Scene ${i + 1}`,
              location: undefined,
              characters: [],
              events: [],
            };

      scenes.push({
        id: `scene_${i}`,
        title: sceneData.summary || `Scene ${i + 1}`,
        content: segment.content,
        position: i,
        significance: segment.significance,
        entities: sceneData.characters,
        relationships: [], // Would be filled from relationship extraction
        events:
          sceneData?.events?.map((event) => ({
            id: event.id,
            description: event.description,
            participants: event.participants,
            sequence: event.sequence,
            significance: 0.5,
            outcomes: [],
          })) || [],
        lastModified: "",
        version: 1,
        changeHistory: [],
      });
    }

    return scenes;
  }

  private deduplicateEntities(entities: NarrativeEntity[]): NarrativeEntity[] {
    const seen = new Map<string, NarrativeEntity>();

    for (const entity of entities) {
      const key = entity.name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, entity);
      } else {
        // Merge entities with same name
        const existing = seen.get(key)!;
        existing.aliases = [
          ...new Set([...existing.aliases, ...entity.aliases]),
        ];
        existing.personality = [
          ...new Set([...existing.personality, ...entity.personality]),
        ];
        existing.motivations = [
          ...new Set([...existing.motivations, ...entity.motivations]),
        ];
      }
    }

    return Array.from(seen.values());
  }

  private deduplicateRelationships(
    relationships: NarrativeRelationship[]
  ): NarrativeRelationship[] {
    const seen = new Map<string, NarrativeRelationship>();

    for (const rel of relationships) {
      const key = `${rel.source}_${rel.target}_${rel.type}`;
      if (!seen.has(key)) {
        seen.set(key, rel);
      } else {
        // Merge evidence
        const existing = seen.get(key)!;
        existing.evidence = [
          ...new Set([...existing.evidence, ...rel.evidence]),
        ];
      }
    }

    return Array.from(seen.values());
  }

  private createEntityChanges(entities: NarrativeEntity[]): EntityChange[] {
    return entities.map((entity) => ({
      changeType: "create" as const,
      entityId: entity.id,
      entity,
      changes: entity,
      evidence: [],
    }));
  }

  private createRelationshipChanges(
    relationships: NarrativeRelationship[]
  ): RelationshipChange[] {
    return relationships.map((rel) => ({
      changeType: "create" as const,
      relationshipId: rel.id,
      relationship: rel,
      changes: rel,
      evidence: rel.evidence,
    }));
  }

  private createSceneChanges(scenes: NarrativeScene[]): SceneChange[] {
    return scenes.map((scene) => ({
      changeType: "create" as const,
      sceneId: scene.id,
      scene,
      changes: scene,
      position: scene.position,
    }));
  }

  private createWorldState(
    entities: NarrativeEntity[],
    relationships: NarrativeRelationship[],
    scenes: NarrativeScene[]
  ): WorldStateSnapshot {
    const entityStates = new Map();
    const activeRelationships = new Map();
    const sceneTimeline = scenes.map((scene) => ({
      sceneId: scene.id,
      position: scene.position,
      significance: scene.significance,
      entities: scene.entities,
      events: scene.events.map((e) => e.description),
    }));

    entities.forEach((entity) => {
      entityStates.set(entity.id, {
        entityId: entity.id,
        lastModified: "",
        properties: entity,
        status: "active",
        significance: entity.significance,
        relationshipCount: 0,
      });
    });

    relationships.forEach((rel) => {
      activeRelationships.set(rel.id, {
        relationshipId: rel.id,
        lastModified: "",
        source: rel.source,
        target: rel.target,
        type: rel.type,
        strength: rel.strength,
        active: true,
        evidence: rel.evidence,
      });
    });

    return {
      commitId: "",
      timestamp: new Date(),
      entityStates,
      activeRelationships,
      sceneTimeline,
      consistencyScore: 1.0,
      inconsistencies: [],
      metrics: {
        totalEntities: entities.length,
        totalRelationships: relationships.length,
        totalScenes: scenes.length,
        narrativeComplexity: this.calculateComplexity(
          entities,
          relationships,
          scenes
        ),
        characterDevelopment: 0.5,
        plotCohesion: 0.5,
        worldConsistency: 1.0,
        temporalCoherence: 1.0,
      },
    };
  }

  private calculateComplexity(
    entities: NarrativeEntity[],
    relationships: NarrativeRelationship[],
    scenes: NarrativeScene[]
  ): number {
    // Simple complexity metric
    return (
      (entities.length * 0.3 +
        relationships.length * 0.5 +
        scenes.length * 0.2) /
      10
    );
  }

  private calculateConsistencyScore(inconsistencies: Inconsistency[]): number {
    if (inconsistencies.length === 0) return 1.0;

    const weights = { minor: 0.1, major: 0.3, critical: 0.6 };
    const totalImpact = inconsistencies.reduce((sum, inc) => {
      return sum + weights[inc.severity];
    }, 0);

    return Math.max(0, 1.0 - totalImpact / 10);
  }

  private calculateSignificance(
    entityChanges: EntityChange[],
    relationshipChanges: RelationshipChange[],
    sceneChanges: SceneChange[]
  ): number {
    return Math.min(
      1.0,
      (entityChanges.length * 0.2 +
        relationshipChanges.length * 0.3 +
        sceneChanges.length * 0.5) /
        10
    );
  }

  private generateCommitHash(state: WorldStateSnapshot): string {
    const stateString = JSON.stringify(state);
    return btoa(stateString).substring(0, 40);
  }

  private getHeadCommits(): string[] {
    const headCommit = this.getHeadCommit();
    return headCommit ? [headCommit.hash] : [];
  }

  private getHeadCommit(): NarrativeCommit | undefined {
    const branch = this.branches.get(this.currentBranch);
    if (!branch || !branch.head) return undefined;
    return this.commits.get(branch.head);
  }

  private getBranchHead(branchName: string): string | undefined {
    return this.branches.get(branchName)?.head;
  }

  private updateBranchHead(branchName: string, commitHash: string): void {
    const branch = this.branches.get(branchName);
    if (branch) {
      branch.head = commitHash;
      branch.commits.push(commitHash);
    }
  }

  private getBranchCommits(branchName: string): NarrativeCommit[] {
    const branch = this.branches.get(branchName);
    if (!branch) return [];

    return branch.commits
      .map((hash) => this.commits.get(hash)!)
      .filter(Boolean);
  }

  private findCommonAncestor(
    commits1: NarrativeCommit[],
    commits2: NarrativeCommit[]
  ): NarrativeCommit {
    // Simple implementation - would be more sophisticated in practice
    return commits1[0] || commits2[0] || this.createGenesisCommit();
  }

  private createGenesisCommit(): NarrativeCommit {
    return {
      id: "genesis",
      hash: "genesis",
      parentCommits: [],
      timestamp: new Date(),
      author: "system",
      message: "Genesis commit",
      entities: [],
      relationships: [],
      scenes: [],
      worldState: this.createEmptyWorldState(),
      branch: "main",
      tags: ["genesis"],
      significance: 0,
      conflictResolutions: [],
    };
  }

  private createEmptyWorldState(): WorldStateSnapshot {
    return {
      commitId: "genesis",
      timestamp: new Date(),
      entityStates: new Map(),
      activeRelationships: new Map(),
      sceneTimeline: [],
      consistencyScore: 1.0,
      inconsistencies: [],
      metrics: {
        totalEntities: 0,
        totalRelationships: 0,
        totalScenes: 0,
        narrativeComplexity: 0,
        characterDevelopment: 0,
        plotCohesion: 0,
        worldConsistency: 0,
        temporalCoherence: 0,
      },
    };
  }

  private mergeEntities(
    currentState: WorldStateSnapshot,
    newEntities: NarrativeEntity[]
  ): NarrativeEntity[] {
    // Implementation would merge existing entities with new ones
    return newEntities; // Simplified for demo
  }

  private mergeRelationships(
    currentState: WorldStateSnapshot,
    newRelationships: NarrativeRelationship[]
  ): NarrativeRelationship[] {
    // Implementation would merge existing relationships with new ones
    return newRelationships; // Simplified for demo
  }

  private createIncrementalEntityChanges(
    currentState: WorldStateSnapshot,
    entities: NarrativeEntity[]
  ): EntityChange[] {
    // Implementation would create only the changes since last commit
    return this.createEntityChanges(entities); // Simplified for demo
  }

  private createIncrementalRelationshipChanges(
    currentState: WorldStateSnapshot,
    relationships: NarrativeRelationship[]
  ): RelationshipChange[] {
    // Implementation would create only the changes since last commit
    return this.createRelationshipChanges(relationships); // Simplified for demo
  }

  private createIncrementalSceneChanges(
    currentState: WorldStateSnapshot,
    scenes: NarrativeScene[]
  ): SceneChange[] {
    // Implementation would create only the new scenes
    return this.createSceneChanges(scenes); // Simplified for demo
  }

  private getCurrentScenes(): NarrativeScene[] {
    const worldState = this.getCurrentWorldState();
    return worldState.sceneTimeline.map((entry) => ({
      id: entry.sceneId,
      title: `Scene ${entry.position}`,
      content: "",
      position: entry.position,
      significance: entry.significance,
      entities: entry.entities,
      relationships: [],
      events: entry.events.map((desc, i) => ({
        id: `event_${i}`,
        description: desc,
        participants: entry.entities,
        sequence: i,
        significance: 0.5,
        outcomes: [],
      })),
      lastModified: "",
      version: 1,
      changeHistory: [],
    }));
  }

  private convertToNarrativeEntity(entity: any): NarrativeEntity {
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      aliases: Array.isArray(entity.aliases)
        ? entity.aliases
        : entity.aliases
          ? [entity.aliases]
          : [],
      significance: entity.significance || 0.5,
      role: entity.role,
      species: entity.species,
      profession: entity.profession,
      personality: Array.isArray(entity.personality)
        ? entity.personality
        : entity.personality
          ? [entity.personality]
          : [],
      motivations: Array.isArray(entity.motivations)
        ? entity.motivations
        : entity.motivations
          ? [entity.motivations]
          : [],
      abilities: Array.isArray(entity.abilities)
        ? entity.abilities
        : entity.abilities
          ? [entity.abilities]
          : [],
      introduction: entity.introduction,
      status: entity.status,
      emotional_state: Array.isArray(entity.emotional_state)
        ? entity.emotional_state
        : entity.emotional_state
          ? [entity.emotional_state]
          : [],
      goals: Array.isArray(entity.goals)
        ? entity.goals
        : entity.goals
          ? [entity.goals]
          : [],
      firstMentioned: entity.first_mention || entity.firstMentioned || 0,
      lastModified: "",
      version: 1,
      changeHistory: [],
    };
  }

  private convertToNarrativeRelationship(
    relationship: any
  ): NarrativeRelationship {
    return {
      id: relationship.id,
      source: relationship.source,
      target: relationship.target,
      type: relationship.type,
      description: relationship.description,
      strength: relationship.strength,
      directionality: relationship.directionality || "bidirectional",
      temporality: relationship.temporality || "evolving",
      evidence: relationship.evidence || [],
      source_emotion: relationship.source_emotion,
      target_emotion: relationship.target_emotion,
      overall_tone: relationship.overall_tone || "neutral",
      first_mentioned: relationship.first_mentioned || 0,
      scene_context: relationship.scene_context,
      lastModified: "",
      version: 1,
      changeHistory: [],
    };
  }
}

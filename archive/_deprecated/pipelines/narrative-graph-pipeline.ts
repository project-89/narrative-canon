import {
  NarrativeStateMachine,
  GraphMutation,
  GraphMutationType,
} from "./narrative-state-machine";
import { StateMachineExtractor } from "./extractors/state-machine-extractor";
import { CharacterLLMExtractor } from "./extractors/character-llm-extractor";
import { SceneExtractor } from "./extractors/scene-extractor";
import { LLMAdapter, Scene } from "./types";
import { z } from "zod";

/**
 * Narrative Graph Pipeline
 *
 * Extracts narrative as an evolving graph with full state history.
 * This is the foundation for the "git for narrative" system.
 */

// GraphSceneSchema is now imported from chunked-scene-extractor

export class NarrativeGraphPipeline {
  private stateMachine: NarrativeStateMachine;
  private characterExtractor: CharacterLLMExtractor;
  private sceneExtractor: SceneExtractor;
  private mutationExtractor: StateMachineExtractor;
  private scenes: Scene[] = [];
  private mutations: GraphMutation[] = [];

  constructor(private llmAdapter: LLMAdapter) {
    this.stateMachine = new NarrativeStateMachine();
    this.characterExtractor = new CharacterLLMExtractor(llmAdapter);
    this.sceneExtractor = new SceneExtractor(llmAdapter);
    this.mutationExtractor = new StateMachineExtractor(llmAdapter);
  }

  async extractNarrativeGraph(text: string) {
    console.log("🎭 Starting Narrative Graph Extraction...\n");

    // Phase 1: Extract all entities (characters, objects, locations)
    console.log("Phase 1: Identifying all entities...");
    const entities = await this.extractAllEntities(text);
    console.log(`  Found ${entities.length} entities`);

    // Phase 2: Extract scenes with graph-aware details
    console.log("\nPhase 2: Extracting graph-aware scenes...");
    this.scenes = await this.extractGraphScenes(text, entities);
    console.log(`  Found ${this.scenes.length} scenes`);

    // Phase 3: Extract mutations (the core of our system)
    console.log("\nPhase 3: Extracting narrative mutations...");
    this.mutations = await this.mutationExtractor.extractMutations(
      text,
      this.scenes,
      entities
    );
    console.log(`  Found ${this.mutations.length} mutations`);

    // Phase 4: Build the narrative graph through commits
    console.log("\nPhase 4: Building narrative state machine...");
    await this.buildNarrativeStateMachine(this.scenes, this.mutations);

    // Phase 5: Generate analysis and export
    console.log("\nPhase 5: Generating analysis...");
    const analysis = this.analyzeNarrativeGraph();

    return {
      entities,
      scenes: this.scenes,
      mutations: this.mutations,
      stateMachine: this.stateMachine.export(),
      analysis,
      metadata: {
        extractionMethod: "graph-state-machine",
        totalCommits: this.stateMachine.getHistory().length,
        graphComplexity: this.calculateGraphComplexity(),
      },
    };
  }

  private async extractAllEntities(text: string) {
    // Extract characters first
    const characters = await this.characterExtractor.extractCharacters(
      text,
      []
    );

    // Also extract non-character entities
    const entityPrompt = `
Extract ALL entities from this narrative, not just characters.

Include:
1. Characters (people, named beings)
2. Objects (especially important items like the meteorite)
3. Locations (specific places like "the Gardner farm", "the well")
4. Concepts/Forces (like "the colour" in Lovecraft)
5. Groups (families, organizations)

For "The Colour Out of Space", key entities include:
- The meteorite itself
- The colour entity
- The Gardner farm
- The well
- The blasted heath
- Each family member
- The professors/scientists
- Animals that are affected

Provide for each entity:
- id: Unique ID in format entity_type_name (e.g., "object_meteorite", "location_gardner_farm")
- name: The entity's name
- type: One of: character, object, location, concept, force, group
- description: Brief description
- initialProperties: Object with initial properties like location, state, etc.

Text: ${text.substring(0, 5000)}...`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        entityPrompt,
        z.object({
          entities: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              type: z.enum([
                "character",
                "object",
                "location",
                "concept",
                "force",
                "group",
              ]),
              description: z.string(),
              initialProperties: z.record(z.any()).optional(),
            })
          ),
        })
      );

      // Merge with characters
      const allEntities = [
        ...characters.map((c) => ({
          id: c.id,
          name: c.name,
          type: "character" as const,
          description: c.description || "",
          initialProperties: { state: "normal", location: "unknown" },
        })),
        ...result.entities.filter((e) => e.type !== "character"),
      ];

      return allEntities;
    } catch (error) {
      console.error("Error extracting entities:", error);
      return characters.map((c) => ({
        id: c.id,
        name: c.name,
        type: "character" as const,
        description: c.description || "",
        initialProperties: {},
      }));
    }
  }

  private async extractGraphScenes(text: string, entities: any[]) {
    // Use simple scene extractor
    try {
      const scenes = await this.sceneExtractor.extractScenes(text, entities);
      console.log(`Extracted ${scenes.length} scenes`);
      return scenes;
    } catch (error) {
      console.error("Error extracting scenes:", error);
      return [];
    }
  }

  private async buildNarrativeStateMachine(
    scenes: any[],
    mutations: GraphMutation[]
  ) {
    // Group mutations by scene
    const mutationsByScene = new Map<string, GraphMutation[]>();

    mutations.forEach((mutation) => {
      const sceneMutations = mutationsByScene.get(mutation.sceneId) || [];
      sceneMutations.push(mutation);
      mutationsByScene.set(mutation.sceneId, sceneMutations);
    });

    // Create commits for each scene
    scenes.forEach((scene, index) => {
      const sceneMutations = mutationsByScene.get(scene.id) || [];

      if (sceneMutations.length > 0) {
        const commitMessage = `Scene ${scene.sequence}: ${scene.summary}`;
        const author = "narrator";

        try {
          this.stateMachine.commit(sceneMutations, commitMessage, author);
          console.log(
            `  Committed ${sceneMutations.length} mutations for ${scene.summary}`
          );
        } catch (error) {
          // Filter out conflicting mutations
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `  ⚠️  Conflict in scene ${scene.sequence}: ${errorMessage}`
          );

          // Try to resolve by filtering out update mutations for entities that are being removed
          const entityRemovals = new Set<string>();
          sceneMutations.forEach((m) => {
            if (m.type === GraphMutationType.ENTITY_REMOVED) {
              entityRemovals.add(m.entityId!);
            }
          });

          const filteredMutations = sceneMutations.filter((m) => {
            // Keep the mutation unless it's an update for an entity being removed
            return !(
              m.type === GraphMutationType.ENTITY_UPDATED &&
              entityRemovals.has(m.entityId!)
            );
          });

          if (filteredMutations.length < sceneMutations.length) {
            console.log(
              `  Filtered ${sceneMutations.length - filteredMutations.length} conflicting mutations`
            );
            try {
              this.stateMachine.commit(
                filteredMutations,
                commitMessage,
                author
              );
              console.log(
                `  Successfully committed ${filteredMutations.length} mutations after filtering`
              );
            } catch (retryError) {
              const retryErrorMessage =
                retryError instanceof Error
                  ? retryError.message
                  : String(retryError);
              console.error(
                `  Failed to commit even after filtering: ${retryErrorMessage}`
              );
            }
          }
        }
      }
    });

    // Create branch points for significant moments
    const history = this.stateMachine.getHistory();
    if (history.length > 5) {
      // Create a branch at the midpoint (before things go wrong)
      const midpoint = Math.floor(history.length / 2);
      this.stateMachine.checkout(history[midpoint].id);
      this.stateMachine.branch("before-corruption");

      // Return to main timeline
      this.stateMachine.checkout("main");
    }
  }

  private analyzeNarrativeGraph() {
    const history = this.stateMachine.getHistory();
    const currentState = this.stateMachine.getCurrentSnapshot();

    // Analyze entity lifecycle
    const entityLifecycles = new Map<
      string,
      {
        introduced: number;
        removed?: number;
        mutations: number;
      }
    >();

    history.forEach((commit) => {
      commit.mutations.forEach((mutation) => {
        if (mutation.entityId) {
          const lifecycle = entityLifecycles.get(mutation.entityId) || {
            introduced: mutation.timestamp,
            mutations: 0,
          };

          lifecycle.mutations++;

          if (mutation.type === GraphMutationType.ENTITY_REMOVED) {
            (lifecycle as any).removed = mutation.timestamp;
          }

          entityLifecycles.set(mutation.entityId, lifecycle);
        }
      });
    });

    // Analyze relationship dynamics
    const relationshipDynamics = new Map<
      string,
      {
        formed: number;
        changes: number;
        broken?: number;
        peak_strength?: number;
      }
    >();

    history.forEach((commit) => {
      commit.mutations.forEach((mutation) => {
        if (mutation.relationshipId) {
          const dynamics = relationshipDynamics.get(
            mutation.relationshipId
          ) || {
            formed: mutation.timestamp,
            changes: 0,
          };

          dynamics.changes++;

          if (mutation.type === GraphMutationType.RELATIONSHIP_BROKEN) {
            (dynamics as any).broken = mutation.timestamp;
          }

          relationshipDynamics.set(mutation.relationshipId, dynamics);
        }
      });
    });

    // Find critical moments (commits with high impact)
    const criticalMoments = history
      .filter((commit) => {
        const impacts = commit.mutations.map((m) => m.impact);
        return impacts.includes("major") || impacts.includes("transformative");
      })
      .map((commit) => ({
        timestamp: commit.timestamp,
        message: commit.message,
        impact: commit.mutations.find(
          (m) => m.impact === "transformative" || m.impact === "major"
        )?.impact,
      }));

    return {
      totalCommits: history.length,
      totalMutations: history.reduce(
        (sum, commit) => sum + commit.mutations.length,
        0
      ),
      entityLifecycles: Array.from(entityLifecycles.entries()),
      relationshipDynamics: Array.from(relationshipDynamics.entries()),
      criticalMoments,
      finalState: {
        activeEntities: currentState.entities.size,
        activeRelationships: currentState.relationships.size,
        totalProperties: currentState.properties.size,
      },
      graphEvolution: this.traceGraphEvolution(),
    };
  }

  private traceGraphEvolution() {
    const evolution: any[] = [];
    const history = this.stateMachine.getHistory().reverse(); // Chronological order

    history.forEach((commit, index) => {
      const snapshot = this.stateMachine.getSnapshotAt(commit.timestamp);
      if (snapshot) {
        evolution.push({
          timestamp: commit.timestamp,
          entities: snapshot.entities.size,
          relationships: snapshot.relationships.size,
          message: commit.message,
          mutationTypes: Array.from(
            new Set(commit.mutations.map((m) => m.type))
          ),
        });
      }
    });

    return evolution;
  }

  private calculateGraphComplexity() {
    const current = this.stateMachine.getCurrentSnapshot();
    const entities = current.entities.size;
    const relationships = current.relationships.size;
    const properties = current.properties.size;

    // Simple complexity metric
    return {
      nodes: entities,
      edges: relationships,
      properties: properties,
      complexity: entities + relationships * 2 + properties * 0.5,
    };
  }

  private basicSceneExtraction(text: string) {
    // Simple paragraph-based scene extraction as fallback
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.length > 100);
    const scenes = [];

    for (let i = 0; i < paragraphs.length; i += 3) {
      scenes.push({
        id: `scene_${scenes.length + 1}`,
        sequence: scenes.length + 1,
        summary: `Scene ${scenes.length + 1}`,
        location: null,
        characters: [],
        events: [],
      });
    }

    return scenes;
  }

  // Save complete narrative data
  saveCompleteNarrativeData() {
    const stateMachineExport = this.stateMachine.export();
    const currentSnapshot = this.stateMachine.getCurrentSnapshot();

    return {
      // Complete entity database
      entities: Array.from(currentSnapshot.entities.values()),

      // Complete relationship database
      relationships: Array.from(currentSnapshot.relationships.values()),

      // All scenes with full details
      scenes: this.scenes,

      // All mutations (graph changes over time)
      mutations: this.mutations,

      // Git-like commit history
      commits: stateMachineExport.commits,

      // Snapshots at each point in time
      snapshots: stateMachineExport.snapshots,

      // Analysis and metrics
      analysis: this.analyzeNarrativeGraph(),

      // Metadata
      metadata: {
        extractionDate: new Date().toISOString(),
        totalEntities: currentSnapshot.entities.size,
        totalRelationships: currentSnapshot.relationships.size,
        totalScenes: this.scenes.length,
        totalMutations: this.mutations.length,
        totalCommits: stateMachineExport.commits.length,
      },
    };
  }

  // Export for visualization
  generateVisualizationData() {
    const stateMachineExport = this.stateMachine.export();
    const history = this.stateMachine.getHistory();

    return {
      // For timeline view
      commits: history.map((commit) => ({
        id: commit.id,
        timestamp: commit.timestamp,
        message: commit.message,
        author: commit.author,
        mutationCount: commit.mutations.length,
        impacts: commit.mutations.map((m) => m.impact),
      })),

      // For graph evolution view
      snapshots: stateMachineExport.snapshots.map((snapshot) => ({
        timestamp: snapshot.timestamp,
        entityCount: snapshot.entities.length,
        relationshipCount: snapshot.relationships.length,
        entities: snapshot.entities,
        relationships: snapshot.relationships,
      })),

      // For diff view
      mutations: history.flatMap((commit) =>
        commit.mutations.map((m) => ({
          ...m,
          commitId: commit.id,
          commitMessage: commit.message,
        }))
      ),

      // Current state
      currentGraph: {
        entities: Array.from(
          this.stateMachine.getCurrentSnapshot().entities.values()
        ),
        relationships: Array.from(
          this.stateMachine.getCurrentSnapshot().relationships.values()
        ),
      },
    };
  }
}

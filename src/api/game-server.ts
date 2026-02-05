/**
 * Timeline Warfare Game Server
 *
 * Full integration of NarrativeGit with game mechanics for the web UI.
 * Provides endpoints for missions, cascades, Oneirocom responses, and timeline weaving.
 */

import 'dotenv/config';
import express, { Router, Request, Response } from 'express';
import cors from 'cors';
import { NarrativeGit } from '../git/narrative-git';
import { NarrativePipeline } from '../pipeline';
import { GeminiAdapter } from '../llm/gemini';
import { MockLLM } from '../llm/mock';
import { EntitySimilarityDetector } from '../core/entity-similarity';
import { GraphOperation } from '../git/types';
import { LLMAdapter, Entity, Relationship, Interaction, NarrativeStructure } from '../types';
import { CascadeSystem, OneirocomCounterCascade, WorldState, TimelineEvent, CascadeEffect } from '../game/cascade-system';

// Game constants
const WIN_DIVERGENCE = 89;
const LOSE_DIVERGENCE = 0;
const STARTING_DIVERGENCE = 15;

// Game state interface
interface GameState {
  year: number;
  divergence: number;
  oneirocomPower: number;
  resistanceStrength: number;
  turn: number;
  status: 'active' | 'won' | 'lost' | 'paused';
  activeMission: GeneratedMission | null;
  cascadeEffects: CascadeEffect[];
  recentEvents: TimelineEvent[];
}

interface GeneratedMission {
  id: string;
  title: string;
  narrative: string;
  approaches: Array<{
    id: string;
    name: string;
    description: string;
    risk: 'low' | 'medium' | 'high';
    divergenceGain: number;
    successProbability: number;
  }>;
  affectedEntities: string[];
  continuityReferences: string[];
}

interface MissionResult {
  success: boolean;
  narrative: string;
  divergenceChange: number;
  newEntities: Entity[];
  newRelationships: Relationship[];
  cascadeEffects: CascadeEffect[];
}

/**
 * Timeline Warfare Game Server
 */
export class GameServer {
  private app: express.Application;
  private git: NarrativeGit;
  private pipeline: NarrativePipeline;
  private llm: LLMAdapter;
  private similarityDetector: EntitySimilarityDetector;
  private cascadeSystem: CascadeSystem;
  private oneirocomCounter: OneirocomCounterCascade;
  private gameState: GameState;
  private initialized: boolean = false;

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.similarityDetector = new EntitySimilarityDetector();
    this.cascadeSystem = new CascadeSystem();
    this.oneirocomCounter = new OneirocomCounterCascade();

    this.gameState = {
      year: 2089,
      divergence: STARTING_DIVERGENCE,
      oneirocomPower: 85,
      resistanceStrength: 15,
      turn: 0,
      status: 'paused',
      activeMission: null,
      cascadeEffects: [],
      recentEvents: []
    };

    // Initialize LLM
    this.initializeLLM();

    // Setup routes
    this.setupRoutes();
  }

  private initializeLLM(): void {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (apiKey) {
      console.log('Using Gemini API for game generation');
      this.llm = new GeminiAdapter({
        apiKey,
        timeout: 60000,
        maxRetries: 2,
      });
    } else {
      console.log('No API key found - using mock LLM');
      this.llm = new MockLLM();
    }

    this.pipeline = new NarrativePipeline(this.llm);
  }

  private async initializeGame(): Promise<void> {
    if (this.initialized) return;

    console.log('Initializing game world...');

    // Create git repository for this game session
    this.git = new NarrativeGit({
      author: 'timeline-warfare',
      defaultBranch: 'convergent-timeline',
    });

    // Seed the world with initial entities
    const initialEntities: GraphOperation[] = [
      {
        id: 'init_oneirocom',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'oneirocom',
          name: 'Oneirocom Corporation',
          type: 'organization',
          description: 'Megacorporation that controls reality through the Convergence Protocol. Rules from Oneirocom Tower in Neo-Tokyo.',
          properties: { power: 85, status: 'dominant' }
        }
      },
      {
        id: 'init_player',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'agent-chen',
          name: 'Agent Chen',
          type: 'character',
          description: 'Project 89 operative with timeline perception abilities. Operating from a safehouse in Sector 7.',
          properties: { status: 'active', abilities: ['timeline-sight', 'branch-navigation'] }
        }
      },
      {
        id: 'init_project89',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'project-89',
          name: 'Project 89',
          type: 'organization',
          description: 'Underground resistance movement fighting to increase timeline divergence and break Oneirocom control.',
          properties: { strength: 15, status: 'active' }
        }
      },
      {
        id: 'init_neotokyo',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'neo-tokyo',
          name: 'Neo-Tokyo',
          type: 'location',
          description: 'Megacity in 2089, divided into sectors. Sector 7 contains stable reality glitches used by the resistance.',
          properties: { controlledBy: 'oneirocom' }
        }
      },
      {
        id: 'init_sector7',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'sector-7',
          name: 'Sector 7 Safehouse',
          type: 'location',
          description: 'A hidden resistance base in the unstable reality zone. Walls flicker with holographic displays showing timeline maps.',
          properties: { security: 'high', status: 'active' }
        }
      },
      {
        id: 'init_convergence',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'convergence-protocol',
          name: 'The Convergence Protocol',
          type: 'concept',
          description: 'Oneirocom\'s system for collapsing alternate timelines, ensuring all realities converge on their controlled outcome.',
          properties: { status: 'active', effectiveness: 85 }
        }
      },
      {
        id: 'init_tower',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'oneirocom-tower',
          name: 'Oneirocom Tower',
          type: 'location',
          description: 'A massive spire of black glass and chrome rising above Neo-Tokyo. The Convergence Engine pulses with blue energy at its peak.',
          properties: { security: 'maximum', controlledBy: 'oneirocom' }
        }
      },
      {
        id: 'init_convergence_engine',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'convergence-engine',
          name: 'Convergence Engine',
          type: 'technology',
          description: 'The device at the heart of Oneirocom Tower that allows manipulation and pruning of alternate timelines.',
          properties: { status: 'active', power: 100 }
        }
      },
      {
        id: 'init_voss',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'director-voss',
          name: 'Director Voss',
          type: 'character',
          description: 'The cold, calculating head of Oneirocom Timeline Enforcement. Silver hair slicked back, wears an immaculate white suit.',
          properties: { role: 'antagonist', threat: 'high' }
        }
      }
    ];

    // Add relationships
    const initialRelationships: GraphOperation[] = [
      {
        id: 'rel_chen_p89',
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id: 'chen-member-p89',
          source: 'agent-chen',
          target: 'project-89',
          type: 'member_of',
          description: 'Agent Chen is an operative of Project 89'
        }
      },
      {
        id: 'rel_p89_oneirocom',
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id: 'p89-opposes-oneirocom',
          source: 'project-89',
          target: 'oneirocom',
          type: 'opposes',
          description: 'Project 89 fights against Oneirocom\'s timeline control'
        }
      },
      {
        id: 'rel_oneirocom_convergence',
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id: 'oneirocom-uses-convergence',
          source: 'oneirocom',
          target: 'convergence-protocol',
          type: 'controls',
          description: 'Oneirocom operates the Convergence Protocol'
        }
      },
      {
        id: 'rel_voss_oneirocom',
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id: 'voss-leads-oneirocom',
          source: 'director-voss',
          target: 'oneirocom',
          type: 'leads',
          description: 'Director Voss leads Oneirocom\'s Timeline Enforcement'
        }
      },
      {
        id: 'rel_chen_voss',
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id: 'chen-opposes-voss',
          source: 'agent-chen',
          target: 'director-voss',
          type: 'opposes',
          description: 'Agent Chen and Director Voss are bitter enemies'
        }
      },
      {
        id: 'rel_tower_engine',
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id: 'tower-houses-engine',
          source: 'oneirocom-tower',
          target: 'convergence-engine',
          type: 'houses',
          description: 'The Convergence Engine is housed in Oneirocom Tower'
        }
      },
      {
        id: 'rel_p89_sector7',
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id: 'p89-operates-sector7',
          source: 'project-89',
          target: 'sector-7',
          type: 'operates_from',
          description: 'Project 89 operates from their Sector 7 safehouse'
        }
      }
    ];

    // Commit initial world state
    this.git.add(...initialEntities, ...initialRelationships);
    await this.git.commit('Initialize world state: 2089, Oneirocom dominant, resistance forming');

    this.gameState.status = 'active';
    this.initialized = true;

    console.log(`Game initialized with ${initialEntities.length} entities, ${initialRelationships.length} relationships`);
  }

  private buildNarrativeContext(): string {
    const state = this.git.export();
    const commits = this.git.log({ limit: 5 });

    const characters = state.entities.filter(e => e.type === 'character');
    const locations = state.entities.filter(e => e.type === 'location');
    const organizations = state.entities.filter(e => e.type === 'organization');

    return `
WORLD STATE (Year ${this.gameState.year}):
- Timeline Divergence: ${this.gameState.divergence}% (target: ${WIN_DIVERGENCE}% for liberation)
- Oneirocom Control: ${this.gameState.oneirocomPower}%
- Resistance Strength: ${this.gameState.resistanceStrength}%
- Current Branch: ${this.git.branches().find(b => b.current)?.name || 'main'}

CHARACTERS (${characters.length}):
${characters.map(e => `- ${e.name}: ${e.description || 'No description'}`).join('\n')}

LOCATIONS (${locations.length}):
${locations.map(e => `- ${e.name}: ${e.description || 'No description'}`).join('\n')}

ORGANIZATIONS (${organizations.length}):
${organizations.map(e => `- ${e.name}: ${e.description || 'No description'}`).join('\n')}

RELATIONSHIPS (${state.relationships.length}):
${state.relationships.map(r => `- ${r.source} --[${r.type}]--> ${r.target}`).join('\n')}

RECENT TIMELINE EVENTS:
${commits.map((c, i) => `${i + 1}. ${c.commit.message.split('\n')[0]}`).join('\n')}
    `.trim();
  }

  private async generateMission(): Promise<GeneratedMission> {
    // Use pending follow-up mission if available (creates narrative chains)
    if (this.pendingFollowUpMission) {
      const followUp = this.pendingFollowUpMission;
      this.pendingFollowUpMission = null;
      console.log(`🔗 Using follow-up mission: ${followUp.title}`);
      return followUp;
    }

    const context = this.buildNarrativeContext();

    const prompt = `You are a narrative AI for a cyberpunk timeline-manipulation game. Generate a mission for Agent Chen.

=== ESTABLISHED NARRATIVE REALITY ===
${context}

=== MISSION GENERATION TASK ===
Generate a mission that:
1. References at least 2 existing entities
2. May introduce 1-2 new elements that logically connect
3. Builds on recent events
4. Has meaningful consequences for timeline divergence

Respond in this exact JSON format:
{
  "id": "mission_${Date.now()}",
  "title": "Mission title (short, evocative)",
  "narrative": "2-3 paragraphs describing the situation. Reference existing characters and locations.",
  "approaches": [
    {
      "id": "approach_1",
      "name": "Approach name",
      "description": "What this approach involves",
      "risk": "low|medium|high",
      "divergenceGain": number between 5-20,
      "successProbability": number between 40-85
    }
  ],
  "affectedEntities": ["entity-id-1", "entity-id-2"],
  "continuityReferences": ["Reference to existing element"]
}

Generate exactly 3 approaches with different risk/reward profiles.`;

    try {
      const response = await this.llm.generateText(prompt, {
        temperature: 0.8,
        modelPreference: 'fast'
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error generating mission:', error);
    }

    // Fallback mission
    return this.generateFallbackMission();
  }

  private generateFallbackMission(): GeneratedMission {
    const templates = [
      {
        id: `mission_${Date.now()}`,
        title: 'The Data Heist',
        narrative: `Intelligence has located a Oneirocom data vault in Sector 4. Inside are records of timeline branches they've collapsed - proof of their crimes against reality itself.

Your contact, a rogue Oneirocom analyst named Dr. Yuki Tanaka, has provided access codes. But the vault is guarded by Timeline Enforcement Division agents equipped with probability scanners.

"The window is narrow," Tanaka's message reads. "Once they detect divergent activity, they'll lock down the entire sector."`,
        approaches: [
          { id: 'a1', name: 'Ghost Protocol', description: 'Use glitch-stepping to phase through security undetected', risk: 'low' as const, divergenceGain: 8, successProbability: 75 },
          { id: 'a2', name: 'System Override', description: 'Hack their probability scanners to create false readings', risk: 'medium' as const, divergenceGain: 12, successProbability: 60 },
          { id: 'a3', name: 'Direct Assault', description: 'Hit fast and hard before they can react', risk: 'high' as const, divergenceGain: 18, successProbability: 45 },
        ],
        affectedEntities: ['oneirocom', 'agent-chen'],
        continuityReferences: ['Building on established resistance operations']
      },
      {
        id: `mission_${Date.now()}`,
        title: 'The Awakening',
        narrative: `A civilian in Sector 7 has spontaneously developed timeline perception - an ability Oneirocom thought they had suppressed in the general population decades ago.

Her name is Maya Torres, a former architect who now sees the ghostly outlines of pruned realities overlapping with the "official" timeline. Oneirocom's retrieval teams are already en route.

If you can reach her first, she could be invaluable to the resistance. But extracting her means exposing Project 89's presence in Sector 7.`,
        approaches: [
          { id: 'a1', name: 'Covert Extraction', description: 'Smuggle her out through maintenance tunnels', risk: 'low' as const, divergenceGain: 7, successProbability: 70 },
          { id: 'a2', name: 'Misdirection', description: 'Create a decoy timeline event to draw away Oneirocom forces', risk: 'medium' as const, divergenceGain: 13, successProbability: 55 },
          { id: 'a3', name: 'Public Awakening', description: 'Help Maya broadcast her visions to Neo-Tokyo, triggering mass awareness', risk: 'high' as const, divergenceGain: 20, successProbability: 40 },
        ],
        affectedEntities: ['sector-7', 'project-89'],
        continuityReferences: ['Sector 7 resistance operations']
      }
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  private async executeMission(mission: GeneratedMission, approachId: string): Promise<MissionResult> {
    const approach = mission.approaches.find(a => a.id === approachId);
    if (!approach) {
      throw new Error('Invalid approach selected');
    }

    // Calculate success based on probability
    const roll = Math.random() * 100;
    const success = roll < approach.successProbability;

    // Generate outcome narrative
    const outcomeNarrative = await this.generateOutcome(mission, approach, success);

    // Calculate divergence change
    const divergenceChange = success
      ? approach.divergenceGain
      : -Math.floor(approach.divergenceGain / 3);

    // Update game state
    this.gameState.divergence = Math.max(0, Math.min(100, this.gameState.divergence + divergenceChange));
    this.gameState.turn++;

    // Extract new entities from outcome
    const extraction = await this.extractFromNarrative(outcomeNarrative);

    // AUTO-BRANCH ON SUCCESS: Create timeline branch per original design
    let branchCreated: string | null = null;
    if (success && approach.risk !== 'low') {
      const branchName = this.generateBranchName(mission, approach);
      try {
        this.git.branch(branchName, { checkout: true });
        branchCreated = branchName;
        console.log(`🌿 Timeline branch created: ${branchName}`);
      } catch (e) {
        console.log(`Branch creation skipped: ${(e as Error).message}`);
      }
    }

    // Commit changes to git
    const operations = this.extractionToOperations(extraction, mission.title);
    if (operations.length > 0) {
      this.git.add(...operations);
      const commitMsg = success
        ? `${mission.title}: ${approach.name} succeeded (+${approach.divergenceGain}% divergence)${branchCreated ? ` [branch: ${branchCreated}]` : ''}`
        : `${mission.title}: ${approach.name} failed (${divergenceChange}% divergence)`;
      await this.git.commit(commitMsg);
    }

    // Generate cascade effects
    const cascadeEffects = this.generateCascadeEffects(mission, approach, success);

    // Check win/lose conditions
    if (this.gameState.divergence >= WIN_DIVERGENCE) {
      this.gameState.status = 'won';
    } else if (this.gameState.divergence <= LOSE_DIVERGENCE) {
      this.gameState.status = 'lost';
    }

    // Auto-generate follow-up mission based on outcome (async, don't block)
    this.generateFollowUpMission(mission, approach, success, outcomeNarrative).catch(console.error);

    return {
      success,
      narrative: outcomeNarrative,
      divergenceChange,
      newEntities: extraction.entities,
      newRelationships: extraction.relationships,
      cascadeEffects
    };
  }

  /**
   * Generate a follow-up mission based on the outcome of the previous mission.
   * This creates narrative continuity and consequence chains.
   */
  private async generateFollowUpMission(
    previousMission: GeneratedMission,
    approach: GeneratedMission['approaches'][0],
    success: boolean,
    outcomeNarrative: string
  ): Promise<void> {
    const context = this.buildNarrativeContext();

    const prompt = `You are a narrative AI for a cyberpunk timeline-manipulation game.

=== PREVIOUS MISSION OUTCOME ===
Mission: ${previousMission.title}
Approach: ${approach.name}
Result: ${success ? 'SUCCESS' : 'FAILURE'}
Narrative: ${outcomeNarrative}

=== CURRENT WORLD STATE ===
${context}

=== TASK ===
Generate the NEXT logical mission that follows from this outcome. The mission should:
1. Be a direct consequence of what just happened
2. Reference entities introduced or affected in the previous mission
3. Either build on success or address the failure's consequences
4. Create narrative momentum toward the 89% divergence goal

Respond in this exact JSON format:
{
  "id": "mission_${Date.now()}",
  "title": "Mission title",
  "narrative": "2-3 paragraphs setting up the situation as a consequence of the previous outcome",
  "approaches": [
    {"id": "a1", "name": "Name", "description": "Description", "risk": "low|medium|high", "divergenceGain": 5-20, "successProbability": 40-85}
  ],
  "affectedEntities": ["entity-id"],
  "continuityReferences": ["Previous mission callback"]
}

Generate exactly 3 approaches.`;

    try {
      const response = await this.llm.generateText(prompt, {
        temperature: 0.8,
        modelPreference: 'fast'
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const followUp = JSON.parse(jsonMatch[0]);
        // Store as pending mission - available for next generate call
        this.pendingFollowUpMission = followUp;
        console.log(`📜 Follow-up mission generated: ${followUp.title}`);
      }
    } catch (error) {
      console.error('Error generating follow-up mission:', error);
    }
  }

  private pendingFollowUpMission: GeneratedMission | null = null;

  /**
   * Generate a meaningful branch name from mission context
   */
  private generateBranchName(mission: GeneratedMission, approach: GeneratedMission['approaches'][0]): string {
    const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const missionSlug = sanitize(mission.title);
    const approachSlug = sanitize(approach.name);
    return `timeline-${missionSlug}-${approachSlug}-${Date.now() % 10000}`;
  }

  /**
   * Calculate coherence score between timeline branches (for weaving)
   */
  private async calculateTimelineCoherence(branchNames: string[]): Promise<{
    score: number;
    sharedEntities: string[];
    conflicts: string[];
    canWeave: boolean;
  }> {
    const currentBranch = this.git.branches().find(b => b.current)?.name || 'main';
    const branchStates: Map<string, ReturnType<typeof this.git.export>> = new Map();
    const allEntities: Map<string, Set<string>> = new Map(); // entityId -> branches that have it

    // Collect state from each branch
    for (const branchName of branchNames) {
      try {
        await this.git.checkout(branchName);
        const state = this.git.export();
        branchStates.set(branchName, state);

        for (const entity of state.entities) {
          if (!allEntities.has(entity.id)) {
            allEntities.set(entity.id, new Set());
          }
          allEntities.get(entity.id)!.add(branchName);
        }
      } catch (e) {
        console.error(`Could not checkout branch ${branchName}`);
      }
    }

    // Return to original branch
    await this.git.checkout(currentBranch);

    // Find shared entities (appear in 2+ branches)
    const sharedEntities = Array.from(allEntities.entries())
      .filter(([_, branches]) => branches.size > 1)
      .map(([entityId]) => entityId);

    // Find conflicts (same entity with different descriptions - simplified check)
    const conflicts: string[] = [];
    for (const entityId of sharedEntities) {
      const descriptions = new Set<string>();
      for (const [branchName, state] of branchStates) {
        const entity = state.entities.find(e => e.id === entityId);
        if (entity?.description) {
          descriptions.add(entity.description);
        }
      }
      if (descriptions.size > 1) {
        conflicts.push(entityId);
      }
    }

    // Calculate coherence score
    const totalEntities = allEntities.size;
    const sharedRatio = totalEntities > 0 ? sharedEntities.length / totalEntities : 0;
    const conflictPenalty = conflicts.length * 0.1;
    const score = Math.max(0, Math.min(1, sharedRatio - conflictPenalty + 0.3)); // Base coherence bonus

    return {
      score,
      sharedEntities,
      conflicts,
      canWeave: score > 0.6 && conflicts.length === 0
    };
  }

  private async generateOutcome(
    mission: GeneratedMission,
    approach: GeneratedMission['approaches'][0],
    success: boolean
  ): Promise<string> {
    const context = this.buildNarrativeContext();

    const prompt = `Continue this cyberpunk narrative. Be consistent with established world.

${context}

MISSION: ${mission.title}
APPROACH: ${approach.name} - ${approach.description}
OUTCOME: ${success ? 'SUCCESS' : 'FAILURE'}

Write 2-3 paragraphs describing what happens. Reference existing entities.`;

    try {
      const response = await this.llm.generateText(prompt, {
        temperature: 0.7,
        modelPreference: 'fast'
      });
      return response;
    } catch {
      if (success) {
        return `The ${approach.name} approach succeeds. Agent Chen moves with precision, exploiting the momentary confusion. The mission objective is achieved, sending ripples through the timeline. Oneirocom's sensors flare with divergence warnings, but it's too late - this branch of reality has been strengthened.`;
      } else {
        return `The ${approach.name} approach encounters unexpected resistance. Timeline Enforcement agents were prepared, their probability scanners already calibrated for this type of incursion. Agent Chen barely escapes, but the mission objective remains unmet. The resistance will need to regroup and try again.`;
      }
    }
  }

  private async extractFromNarrative(text: string): Promise<NarrativeStructure> {
    try {
      return await this.pipeline.extractNarrative(text);
    } catch {
      return {
        entities: [],
        relationships: [],
        scenes: [],
        stateChanges: [],
        interactions: [],
        chronology: { events: [], timeline: [] },
        themes: [],
        metadata: {}
      };
    }
  }

  private extractionToOperations(extraction: NarrativeStructure, source: string): GraphOperation[] {
    const operations: GraphOperation[] = [];
    const timestamp = Date.now();
    const existingState = this.git.export();

    // Build a set of normalized existing entity names for fast lookup
    const existingNames = new Set(
      existingState.entities.map(e => e.name.toLowerCase().trim())
    );

    for (const entity of extraction.entities) {
      const normalizedName = entity.name.toLowerCase().trim();

      // Check for exact name match (case-insensitive) first
      if (existingNames.has(normalizedName)) {
        continue; // Skip - exact match exists
      }

      // Then check for high similarity with same-type entities
      let isDuplicate = false;
      for (const existing of existingState.entities) {
        if (existing.type !== entity.type) continue;
        const similarity = this.similarityDetector.calculateNameSimilarity(entity.name, existing.name);
        if (similarity >= 0.75) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        existingNames.add(normalizedName); // Prevent duplicates within same extraction
        operations.push({
          id: `add_${entity.id}_${timestamp}`,
          type: 'ADD_ENTITY',
          timestamp,
          payload: { ...entity, properties: { ...entity.properties, source } }
        });
      }
    }

    for (const rel of extraction.relationships) {
      const relExists = existingState.relationships.some(
        r => r.source === rel.source && r.target === rel.target && r.type === rel.type
      );

      if (!relExists) {
        operations.push({
          id: `add_rel_${rel.source}_${rel.target}_${timestamp}`,
          type: 'ADD_RELATIONSHIP',
          timestamp,
          payload: rel
        });
      }
    }

    return operations;
  }

  private generateCascadeEffects(
    mission: GeneratedMission,
    approach: GeneratedMission['approaches'][0],
    success: boolean
  ): CascadeEffect[] {
    const worldState: WorldState = {
      resistanceStrength: this.gameState.resistanceStrength / 100,
      oneirocomControl: this.gameState.oneirocomPower / 100,
      timelineDivergence: this.gameState.divergence / 100,
      primaryLocation: 'Neo-Tokyo',
      recentEvents: this.gameState.recentEvents,
      activeCascades: this.gameState.cascadeEffects
    };

    const event: TimelineEvent = {
      id: `event_${Date.now()}`,
      date: new Date(),
      description: `${mission.title}: ${approach.name} ${success ? 'succeeded' : 'failed'}`,
      type: approach.risk === 'high' ? 'political' : 'technological',
      magnitude: success ? approach.divergenceGain / 25 : 0.2,
      entities: mission.affectedEntities
    };

    this.gameState.recentEvents.push(event);
    if (this.gameState.recentEvents.length > 10) {
      this.gameState.recentEvents.shift();
    }

    const cascades = this.cascadeSystem.calculateCascades(event, worldState);
    this.gameState.cascadeEffects = [...this.gameState.cascadeEffects, ...cascades];

    return cascades;
  }

  private async generateOneirocomResponse(): Promise<{ event: TimelineEvent; divergenceLoss: number; narrative: string } | null> {
    // Only trigger response sometimes, more likely at higher divergence
    if (Math.random() > (this.gameState.divergence / 100)) {
      return null;
    }

    const context = this.buildNarrativeContext();
    const recentEvents = this.gameState.recentEvents.slice(-3).map(e => e.description).join('\n');

    const prompt = `You are Director Voss, head of Oneirocom's Timeline Enforcement Division. The resistance (Project 89) has been making progress, and you must respond.

=== CURRENT SITUATION ===
${context}

=== RECENT RESISTANCE ACTIVITY ===
${recentEvents || 'General resistance operations ongoing'}

=== TASK ===
Generate Oneirocom's counter-response. This should be a specific action that:
1. Directly counters recent resistance successes
2. Attempts to collapse timeline divergence
3. References existing entities and locations
4. Feels like a logical corporate/authoritarian response

Respond in JSON:
{
  "title": "Counter-operation name",
  "narrative": "2-3 paragraphs from Oneirocom's perspective, describing their response",
  "divergenceLoss": number between 3-8,
  "method": "surveillance|enforcement|propaganda|timeline_collapse|technology",
  "affectedEntities": ["entity-ids"]
}`;

    try {
      const response = await this.llm.generateText(prompt, {
        temperature: 0.7,
        modelPreference: 'fast'
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const counterOp = JSON.parse(jsonMatch[0]);
        const divergenceLoss = Math.min(8, Math.max(3, counterOp.divergenceLoss || 5));

        const event: TimelineEvent = {
          id: `oneirocom_${Date.now()}`,
          date: new Date(),
          description: counterOp.title,
          type: 'political',
          magnitude: divergenceLoss / 10,
          entities: counterOp.affectedEntities || ['oneirocom']
        };

        // Commit the counter-narrative
        this.git.add({
          id: `oneirocom_response_${Date.now()}`,
          type: 'ADD_ENTITY',
          timestamp: Date.now(),
          payload: {
            id: `event-oneirocom-${this.gameState.turn}`,
            name: counterOp.title,
            type: 'event',
            description: counterOp.narrative,
            properties: { turn: this.gameState.turn, divergenceLoss, method: counterOp.method }
          }
        });

        console.log(`🏢 Oneirocom responds: ${counterOp.title} (-${divergenceLoss}%)`);
        return { event, divergenceLoss, narrative: counterOp.narrative };
      }
    } catch (error) {
      console.error('Error generating Oneirocom response:', error);
    }

    // Fallback to rule-based response
    const worldState: WorldState = {
      resistanceStrength: this.gameState.resistanceStrength / 100,
      oneirocomControl: this.gameState.oneirocomPower / 100,
      timelineDivergence: this.gameState.divergence / 100,
      primaryLocation: 'Neo-Tokyo',
      recentEvents: this.gameState.recentEvents,
      activeCascades: this.gameState.cascadeEffects
    };

    const counters = this.oneirocomCounter.generateCounterMeasures(
      this.gameState.cascadeEffects.filter(c => c.probability > 0.5),
      worldState
    );

    if (counters.length === 0) return null;

    const counter = counters[0];
    const divergenceLoss = Math.floor(Math.random() * 5) + 3;

    this.git.add({
      id: `oneirocom_response_${Date.now()}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: `event-oneirocom-${this.gameState.turn}`,
        name: 'Oneirocom Counter-Operation',
        type: 'event',
        description: counter.description,
        properties: { turn: this.gameState.turn, divergenceLoss }
      }
    });

    return { event: counter, divergenceLoss, narrative: counter.description };
  }

  private setupRoutes(): void {
    const router = Router();

    // Health check
    router.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0' });
    });

    // Game state
    router.get('/game/state', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        res.json(this.gameState);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Start new game
    router.post('/game/start', async (req: Request, res: Response) => {
      try {
        this.initialized = false;
        this.gameState = {
          year: 2089,
          divergence: STARTING_DIVERGENCE,
          oneirocomPower: 85,
          resistanceStrength: 15,
          turn: 0,
          status: 'active',
          activeMission: null,
          cascadeEffects: [],
          recentEvents: []
        };
        await this.initializeGame();
        res.json({ success: true, state: this.gameState });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Generate mission
    router.post('/game/mission/generate', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const mission = await this.generateMission();
        this.gameState.activeMission = mission;
        res.json(mission);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get active mission
    router.get('/game/mission', (req: Request, res: Response) => {
      if (!this.gameState.activeMission) {
        return res.status(404).json({ error: 'No active mission' });
      }
      res.json(this.gameState.activeMission);
    });

    // Execute mission
    router.post('/game/mission/execute', async (req: Request, res: Response) => {
      try {
        const { approachId } = req.body;
        if (!this.gameState.activeMission) {
          return res.status(400).json({ error: 'No active mission' });
        }
        const result = await this.executeMission(this.gameState.activeMission, approachId);
        this.gameState.activeMission = null;
        res.json({ ...result, gameState: this.gameState });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Oneirocom response
    router.post('/game/oneirocom/respond', async (req: Request, res: Response) => {
      try {
        const response = await this.generateOneirocomResponse();
        if (!response) {
          return res.json({ triggered: false });
        }

        this.gameState.divergence = Math.max(0, this.gameState.divergence - response.divergenceLoss);
        await this.git.commit(`Oneirocom counter: ${response.event.description} (-${response.divergenceLoss}%)`);

        if (this.gameState.divergence <= LOSE_DIVERGENCE) {
          this.gameState.status = 'lost';
        }

        res.json({ triggered: true, ...response, gameState: this.gameState });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get cascade effects
    router.get('/game/cascades', (req: Request, res: Response) => {
      res.json(this.gameState.cascadeEffects);
    });

    // What-if exploration: Create a branch, simulate a choice, see the outcome
    router.post('/game/explore-timeline', async (req: Request, res: Response) => {
      try {
        const { approachId, branchName } = req.body;

        if (!this.gameState.activeMission) {
          return res.status(400).json({ error: 'No active mission to explore' });
        }

        const originalBranch = this.git.branches().find(b => b.current)?.name || 'main';
        const exploreBranchName = branchName || `what-if-${Date.now()}`;

        // Create exploration branch
        this.git.branch(exploreBranchName, { checkout: true });
        console.log(`🔀 Created exploration branch: ${exploreBranchName}`);

        // Execute the mission on this branch
        const mission = this.gameState.activeMission;
        const approach = mission.approaches.find(a => a.id === approachId);

        if (!approach) {
          await this.git.checkout(originalBranch);
          return res.status(400).json({ error: 'Invalid approach ID' });
        }

        const result = await this.executeMission(mission, approachId);

        // Get the new state on this branch
        const branchState = this.git.export();
        const branchCommits = this.git.log({ limit: 5 });

        res.json({
          explorationBranch: exploreBranchName,
          originalBranch,
          missionResult: result,
          branchState: {
            entities: branchState.entities.length,
            relationships: branchState.relationships.length,
            divergence: this.gameState.divergence,
            commits: branchCommits.map(c => c.commit.message.split('\n')[0])
          },
          instructions: {
            keepBranch: `POST /api/narrative/git/checkout with { "branch": "${exploreBranchName}" }`,
            discardBranch: `POST /api/narrative/git/checkout with { "branch": "${originalBranch}" }`,
            mergeBranch: `POST /api/narrative/git/merge with { "source": "${exploreBranchName}" }`
          }
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Compare two timeline branches
    router.get('/game/compare-timelines', async (req: Request, res: Response) => {
      try {
        const { branch1, branch2 } = req.query;

        if (!branch1 || !branch2) {
          return res.status(400).json({ error: 'Must provide branch1 and branch2 query params' });
        }

        const currentBranch = this.git.branches().find(b => b.current)?.name || 'main';

        // Get state from branch 1
        await this.git.checkout(branch1 as string);
        const state1 = this.git.export();
        const commits1 = this.git.log({ limit: 10 });

        // Get state from branch 2
        await this.git.checkout(branch2 as string);
        const state2 = this.git.export();
        const commits2 = this.git.log({ limit: 10 });

        // Return to original branch
        await this.git.checkout(currentBranch);

        // Calculate differences
        const uniqueEntities1 = state1.entities.filter(e =>
          !state2.entities.some(e2 => e2.id === e.id)
        );
        const uniqueEntities2 = state2.entities.filter(e =>
          !state1.entities.some(e1 => e1.id === e.id)
        );

        res.json({
          branch1: {
            name: branch1,
            entities: state1.entities.length,
            relationships: state1.relationships.length,
            commits: commits1.length,
            uniqueEntities: uniqueEntities1.map(e => ({ id: e.id, name: e.name, type: e.type }))
          },
          branch2: {
            name: branch2,
            entities: state2.entities.length,
            relationships: state2.relationships.length,
            commits: commits2.length,
            uniqueEntities: uniqueEntities2.map(e => ({ id: e.id, name: e.name, type: e.type }))
          },
          divergencePoint: 'Determined by earliest differing commit'
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Timeline Weaving: Merge multiple branches into a stable alternate timeline
    router.post('/game/weave-timelines', async (req: Request, res: Response) => {
      try {
        const { branches: branchNames } = req.body;

        if (!branchNames || branchNames.length < 2) {
          return res.status(400).json({ error: 'Must provide at least 2 branches to weave' });
        }

        // Calculate coherence
        const coherence = await this.calculateTimelineCoherence(branchNames);

        if (!coherence.canWeave) {
          return res.json({
            success: false,
            message: 'Timeline threads lack coherence. Cannot weave.',
            coherenceScore: coherence.score,
            sharedEntities: coherence.sharedEntities,
            conflicts: coherence.conflicts,
            suggestion: coherence.conflicts.length > 0
              ? 'Resolve entity conflicts before weaving'
              : 'Complete more missions to create shared narrative threads'
          });
        }

        // Weave successful - create merged timeline
        const weavedBranchName = `woven-timeline-${Date.now()}`;
        const originalBranch = this.git.branches().find(b => b.current)?.name || 'main';

        // Create the woven branch
        this.git.branch(weavedBranchName, { checkout: true });

        // Merge all source branches
        for (const sourceBranch of branchNames) {
          try {
            await this.git.merge(sourceBranch, { strategy: 'ours' });
          } catch (e) {
            console.log(`Merge from ${sourceBranch}: ${(e as Error).message}`);
          }
        }

        // Generate weaving narrative via LLM
        const context = this.buildNarrativeContext();
        const weavingPrompt = `You are narrating a pivotal moment in Timeline Warfare.

Multiple timeline branches are being woven together into a new stable reality:
${branchNames.map(b => `- ${b}`).join('\n')}

${context}

Shared narrative elements: ${coherence.sharedEntities.join(', ')}
Coherence score: ${(coherence.score * 100).toFixed(1)}%

Write 2-3 paragraphs describing this timeline convergence event. Make it feel epic - this is multiple realities merging into a stronger divergent timeline that Oneirocom cannot easily collapse.`;

        let weavingNarrative = 'The timeline threads interweave, forming a new stable reality resistant to Oneirocom\'s convergence attempts.';
        try {
          weavingNarrative = await this.llm.generateText(weavingPrompt, {
            temperature: 0.7,
            modelPreference: 'fast'
          });
        } catch (e) {
          console.error('Error generating weaving narrative:', e);
        }

        // Commit the weaving event
        await this.git.commit(`Timeline Weaving: ${branchNames.length} branches merged into ${weavedBranchName}`);

        // Boost divergence for successful weave
        const divergenceBonus = Math.floor(coherence.score * 10);
        this.gameState.divergence = Math.min(100, this.gameState.divergence + divergenceBonus);

        // Check win condition
        if (this.gameState.divergence >= WIN_DIVERGENCE) {
          this.gameState.status = 'won';
        }

        res.json({
          success: true,
          wovenBranch: weavedBranchName,
          sourceBranches: branchNames,
          coherenceScore: coherence.score,
          narrative: weavingNarrative,
          divergenceBonus,
          newDivergence: this.gameState.divergence,
          message: `Successfully wove ${branchNames.length} timelines into ${weavedBranchName}! +${divergenceBonus}% divergence.`
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Narrative status (for compatibility with existing UI)
    router.get('/narrative/status', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const state = this.git.export();
        const commits = this.git.log();
        const branches = this.git.branches();
        res.json({
          currentBranch: branches.find(b => b.current)?.name || 'main',
          head: commits[0]?.commit.id || '',
          clean: true,
          entities: state.entities.length,
          relationships: state.relationships.length,
          branches: branches.length,
          commits: commits.length
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Entities - with relationship counts and deduplication
    router.get('/narrative/entities', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const { type } = req.query;
        const state = this.git.export();

        // Deduplicate entities by name (case-insensitive)
        const seenNames = new Map<string, typeof state.entities[0]>();
        for (const entity of state.entities) {
          const normalizedName = entity.name.toLowerCase().trim();
          const existing = seenNames.get(normalizedName);
          if (!existing) {
            seenNames.set(normalizedName, entity);
          } else {
            // Keep the one with more properties/description
            const existingScore = (existing.description?.length || 0) + Object.keys(existing.properties || {}).length;
            const newScore = (entity.description?.length || 0) + Object.keys(entity.properties || {}).length;
            if (newScore > existingScore) {
              seenNames.set(normalizedName, entity);
            }
          }
        }

        let entities = Array.from(seenNames.values());

        if (type && type !== 'all') {
          entities = entities.filter(e => e.type === type);
        }

        // Add relationship counts
        const entitiesWithCounts = entities.map(entity => {
          const relationshipCount = state.relationships.filter(
            r => r.source === entity.id || r.target === entity.id
          ).length;
          return {
            ...entity,
            relationships: relationshipCount,
            interactions: 0 // TODO: count interactions when implemented
          };
        });

        res.json(entitiesWithCounts);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/narrative/entities/:id', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const state = this.git.export();
        const entity = state.entities.find(e => e.id === req.params.id);
        if (!entity) return res.status(404).json({ error: 'Entity not found' });
        res.json(entity);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Relationships
    router.get('/narrative/relationships', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const state = this.git.export();
        res.json(state.relationships);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Interactions
    router.get('/narrative/interactions', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const state = this.git.export();
        res.json(state.interactions || []);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Git operations
    router.get('/narrative/git/log', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const commits = this.git.log({ limit: 50 });
        res.json(commits.map(entry => ({
          id: entry.commit.id,
          hash: entry.commit.id.slice(0, 12),
          message: entry.commit.message,
          timestamp: entry.commit.timestamp,
          branch: entry.branch,
          tags: entry.tags,
          isHead: entry.isHead
        })));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/narrative/git/branches', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const branches = this.git.branches();
        res.json(branches.map(b => ({
          id: b.name,
          name: b.name,
          isActive: b.current,
          isCanon: b.name === 'convergent-timeline',
          commitCount: b.branch.commits?.length || 0
        })));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/narrative/git/branch', async (req: Request, res: Response) => {
      try {
        const { name, from } = req.body;
        const branch = this.git.branch(name, { from, checkout: true });
        res.json({ success: true, branch: name });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/narrative/git/checkout', async (req: Request, res: Response) => {
      try {
        const { branch } = req.body;
        await this.git.checkout(branch);
        res.json({ success: true, branch });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/narrative/git/merge', async (req: Request, res: Response) => {
      try {
        const { source, strategy } = req.body;
        const result = await this.git.merge(source, { strategy });
        res.json({ success: true, ...result });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Graph for visualization
    router.get('/narrative/graph', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const state = this.git.export();
        const nodes = state.entities.map((e, i) => ({
          id: e.id,
          type: 'entityNode',
          position: { x: 100 + (i % 4) * 200, y: 50 + Math.floor(i / 4) * 200 },
          data: { label: e.name, type: e.type, description: e.description }
        }));
        const edges = state.relationships.map(r => ({
          id: r.id,
          source: r.source,
          target: r.target,
          label: r.type.replace('_', ' '),
          type: 'smoothstep'
        }));
        res.json({ nodes, edges });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Commit diff - shows what changed in a specific commit
    router.get('/narrative/git/commit/:commitId', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const { commitId } = req.params;
        const commits = this.git.log({ limit: 100 });
        const commitEntry = commits.find(c => c.commit.id === commitId || c.commit.id.startsWith(commitId));

        if (!commitEntry) {
          return res.status(404).json({ error: 'Commit not found' });
        }

        const commit = commitEntry.commit;
        const operations = commit.operations || [];

        // Build diff from operations
        const entityDiffs: any[] = [];
        const relationshipDiffs: any[] = [];

        operations.forEach((op: GraphOperation) => {
          if (op.type === 'ADD_ENTITY') {
            entityDiffs.push({
              entityId: op.payload.id,
              entityName: op.payload.name,
              entityType: op.payload.type,
              changeType: 'added',
              changes: Object.entries(op.payload)
                .filter(([key]) => !['id'].includes(key))
                .map(([field, value]) => ({
                  field,
                  newValue: typeof value === 'object' ? JSON.stringify(value) : String(value)
                }))
            });
          } else if (op.type === 'UPDATE_ENTITY') {
            entityDiffs.push({
              entityId: op.payload.id,
              entityName: op.payload.name || op.payload.id,
              entityType: op.payload.type || 'unknown',
              changeType: 'modified',
              changes: Object.entries(op.payload.changes || op.payload)
                .filter(([key]) => !['id'].includes(key))
                .map(([field, value]) => ({
                  field,
                  newValue: typeof value === 'object' ? JSON.stringify(value) : String(value)
                }))
            });
          } else if (op.type === 'REMOVE_ENTITY') {
            entityDiffs.push({
              entityId: op.payload.id,
              entityName: op.payload.id,
              entityType: 'unknown',
              changeType: 'removed',
              changes: []
            });
          } else if (op.type === 'ADD_RELATIONSHIP') {
            relationshipDiffs.push({
              relationshipId: op.payload.id,
              changeType: 'added',
              sourceEntity: op.payload.source,
              targetEntity: op.payload.target,
              relationType: op.payload.type
            });
          } else if (op.type === 'REMOVE_RELATIONSHIP') {
            relationshipDiffs.push({
              relationshipId: op.payload.id,
              changeType: 'removed',
              sourceEntity: op.payload.source || 'unknown',
              targetEntity: op.payload.target || 'unknown',
              relationType: op.payload.type || 'unknown'
            });
          }
        });

        res.json({
          commit: {
            id: commit.id,
            hash: commit.id.slice(0, 12),
            message: commit.message,
            timestamp: commit.timestamp,
            branch: commitEntry.branch,
            tags: commitEntry.tags,
            author: commit.author || 'timeline-warfare'
          },
          entityDiffs,
          relationshipDiffs,
          operationCount: operations.length,
          metrics: {
            entitiesChanged: entityDiffs.length,
            relationshipsChanged: relationshipDiffs.length
          }
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Full commit log with operations count
    router.get('/narrative/git/commits', async (req: Request, res: Response) => {
      try {
        if (!this.initialized) {
          await this.initializeGame();
        }
        const commits = this.git.log({ limit: 50 });
        res.json(commits.map((entry, index) => {
          const ops = entry.commit.operations || [];
          const entityOps = ops.filter((o: GraphOperation) =>
            ['ADD_ENTITY', 'UPDATE_ENTITY', 'REMOVE_ENTITY'].includes(o.type)
          );
          const relOps = ops.filter((o: GraphOperation) =>
            ['ADD_RELATIONSHIP', 'REMOVE_RELATIONSHIP'].includes(o.type)
          );

          return {
            id: entry.commit.id,
            hash: entry.commit.id.slice(0, 12),
            message: entry.commit.message,
            timestamp: entry.commit.timestamp,
            branch: entry.branch,
            tags: entry.tags || [],
            author: entry.commit.author || 'timeline-warfare',
            isHead: index === 0,
            operations: ops.map((o: GraphOperation) => ({
              type: o.type.includes('ADD') ? 'add' : o.type.includes('REMOVE') ? 'remove' : 'update',
              entityType: o.payload?.type || 'unknown',
              entityName: o.payload?.name || o.payload?.id || 'Unknown'
            })),
            metrics: {
              entitiesChanged: entityOps.length,
              relationshipsChanged: relOps.length,
              consistencyScore: 0.95 + Math.random() * 0.05 // Placeholder
            }
          };
        }));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Story/Session management
    router.get('/stories', (req: Request, res: Response) => {
      // For now, return the current session info
      // In future, could persist multiple stories
      res.json({
        current: {
          id: 'timeline-warfare-session',
          name: 'Timeline Warfare Campaign',
          description: 'Current game session',
          createdAt: new Date().toISOString(),
          gameState: {
            divergence: this.gameState.divergence,
            turn: this.gameState.turn,
            status: this.gameState.status
          }
        },
        stories: [
          {
            id: 'timeline-warfare-session',
            name: 'Timeline Warfare Campaign',
            description: 'Fight to liberate the timeline from Oneirocom control',
            createdAt: new Date().toISOString()
          }
        ]
      });
    });

    router.post('/stories/new', async (req: Request, res: Response) => {
      try {
        const { name, description } = req.body;
        // Reset and start a new story
        this.initialized = false;
        this.gameState = {
          year: 2089,
          divergence: STARTING_DIVERGENCE,
          oneirocomPower: 85,
          resistanceStrength: 15,
          turn: 0,
          status: 'active',
          activeMission: null,
          cascadeEffects: [],
          recentEvents: []
        };
        await this.initializeGame();
        res.json({
          success: true,
          story: {
            id: 'timeline-warfare-session',
            name: name || 'Timeline Warfare Campaign',
            description: description || 'A new campaign to liberate the timeline',
            createdAt: new Date().toISOString()
          }
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.use('/api', router);
  }

  listen(port: number): void {
    this.app.listen(port, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   Timeline Warfare Game Server                              ║
║                                                              ║
║   Local:    http://localhost:${port}                          ║
║   Health:   http://localhost:${port}/api/health               ║
║                                                              ║
║   Game Mode: Active                                          ║
║   LLM: ${process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY ? 'Gemini' : 'Mock'}                                                ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  }
}

// Start server if run directly
const PORT = process.env.API_PORT || 3088;
const server = new GameServer();
server.listen(Number(PORT));

export default GameServer;

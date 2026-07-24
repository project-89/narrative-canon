/**
 * Timeline Warfare - Git Edition
 *
 * A CLI game where narrative IS the gameplay mechanic.
 * Every action commits to a narrative git repository.
 * The graph state constrains and feeds LLM generation.
 *
 * Core loop: Graph State → LLM Generation → Extract → Commit → Repeat
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig(); // Load .env file

import * as readline from 'readline';
import chalk from 'chalk';
import { NarrativeGit } from '../../../../src/git/narrative-git';
import { GraphOperation } from '../../../../src/git/types';
import { NarrativePipeline } from '../../../../src/pipeline';
import { GeminiAdapter } from '../../../../src/llm/gemini';
import { MockLLM } from '../../../../src/llm/mock';
import { EntitySimilarityDetector } from '../../../../src/core/entity-similarity';
import { LLMAdapter, Entity, Relationship, Interaction, NarrativeStructure } from '../../../../src/types';
// Split on the studio boundary: the portrait generator and the visual TYPES
// still live in the studio's src/visual; the comic PANEL/PAGE composers moved
// here with the prototype (the studio's comic pipeline is compose_comic now).
import {
  EntityPortraitGenerator,
  VisualStyle,
  EntityPortrait,
  Panel,
  ComicPage
} from '../../../../src/visual';
import { PanelGenerator } from '../visual/panel-generator';
import { ComicComposer } from '../visual/comic-composer';

// Game constants
const WIN_DIVERGENCE = 89;
const LOSE_DIVERGENCE = 0;
const STARTING_DIVERGENCE = 15;

interface GameWorld {
  year: number;
  divergence: number;
  oneirocomPower: number;
  resistanceStrength: number;
}

interface GeneratedMission {
  title: string;
  narrative: string;
  approaches: Array<{
    name: string;
    description: string;
    risk: 'low' | 'medium' | 'high';
    divergenceGain: number;
  }>;
}

interface NarrativeContext {
  world: string;
  characters: string;
  locations: string;
  organizations: string;
  events: string;
  relationships: string;
  interactions: string;
  recentHistory: string;
  continuityRules: string;
}

export class TimelineWarfareGit {
  private rl: readline.Interface;
  private git: NarrativeGit;
  private pipeline: NarrativePipeline;
  private llm: LLMAdapter;
  private similarityDetector: EntitySimilarityDetector;
  private world: GameWorld;
  private turn: number = 0;

  // Visual generation components
  private portraitGenerator: EntityPortraitGenerator | null = null;
  private panelGenerator: PanelGenerator | null = null;
  private comicComposer: ComicComposer | null = null;
  private visualsEnabled: boolean = false;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.world = {
      year: 2089,
      divergence: STARTING_DIVERGENCE,
      oneirocomPower: 85,
      resistanceStrength: 15,
    };

    // Initialize similarity detector for entity deduplication
    this.similarityDetector = new EntitySimilarityDetector();

    // Will be initialized in start()
    this.git = null!;
    this.pipeline = null!;
    this.llm = null!;
  }

  async start(): Promise<void> {
    console.clear();
    this.printHeader();

    await this.initializeLLM();
    await this.initializeVisualGenerators();
    await this.initializeWorld();
    await this.showIntro();

    // Main game loop
    while (this.world.divergence > LOSE_DIVERGENCE && this.world.divergence < WIN_DIVERGENCE) {
      this.turn++;
      await this.playTurn();
    }

    await this.showEnding();
    this.rl.close();
  }

  /**
   * Initialize visual generation components if API key is available
   */
  private async initializeVisualGenerators(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      console.log(chalk.gray('  Visual generation disabled (no API key)\n'));
      return;
    }

    try {
      const baseConfig = {
        apiKey,
        outputDir: './generated-images',
        config: {
          style: {
            style: 'manga' as const,
            coloring: 'full-color' as const,
            linework: 'clean' as const,
            lighting: 'dramatic' as const,
          },
          resolution: '1024x1024' as const,
          maxRetries: 2,
          useThinking: false,
        }
      };

      this.portraitGenerator = new EntityPortraitGenerator({
        ...baseConfig,
        cacheDir: './generated-images/portraits',
      });

      this.panelGenerator = new PanelGenerator({
        ...baseConfig,
        portraitGenerator: this.portraitGenerator,
        panelDir: './generated-images/panels',
      });

      this.comicComposer = new ComicComposer({
        ...baseConfig,
        pageDir: './generated-images/pages',
      });

      this.visualsEnabled = true;
      console.log(chalk.green('✓ Visual generation enabled'));
      console.log(chalk.gray('  Using gemini-3-pro-image-preview for image generation\n'));
    } catch (error: any) {
      console.log(chalk.yellow(`⚠ Visual generation setup failed: ${error.message}\n`));
      this.visualsEnabled = false;
    }
  }

  private printHeader(): void {
    console.log(chalk.cyan(`
    ╔════════════════════════════════════════════════════╗
    ║                                                    ║
    ║            T I M E L I N E                         ║
    ║            W A R F A R E                           ║
    ║                                                    ║
    ║              [ GIT EDITION ]                       ║
    ║                                                    ║
    ╚════════════════════════════════════════════════════╝
`));
  }

  private async initializeLLM(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (apiKey) {
      console.log(chalk.green('✓ Gemini API key found'));
      console.log(chalk.gray('  Using gemini-3-flash-preview for fast generation\n'));
      this.llm = new GeminiAdapter({
        apiKey,
        timeout: 60000,
        maxRetries: 2,
      });
    } else {
      console.log(chalk.yellow('⚠ No API key found - using mock mode'));
      console.log(chalk.gray('  Set GEMINI_API_KEY for AI-generated narratives\n'));
      this.llm = new MockLLM();
    }

    this.pipeline = new NarrativePipeline(this.llm);
  }

  private async initializeWorld(): Promise<void> {
    console.log(chalk.cyan('Initializing narrative reality...'));

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
      }
    ];

    // Commit initial world state
    this.git.add(...initialEntities, ...initialRelationships);
    await this.git.commit('Initialize world state: 2089, Oneirocom dominant, resistance forming');

    console.log(chalk.green('✓ World initialized'));
    console.log(chalk.gray(`  ${initialEntities.length} entities, ${initialRelationships.length} relationships\n`));
  }

  private async showIntro(): Promise<void> {
    console.log(chalk.white(`
  The year is ${chalk.cyan('2089')}.

  Oneirocom Corporation has achieved what no empire before could -
  control over reality itself. Through the ${chalk.red('Convergence Protocol')},
  they systematically eliminate alternate timelines, ensuring all
  paths lead to their dominion.

  But reality resists. In the cracks between collapsed timelines,
  ${chalk.green('Project 89')} operates. You are ${chalk.yellow('Agent Chen')}, one of the few
  who can perceive the branches that Oneirocom tries to prune.

  Your mission: increase ${chalk.cyan('timeline divergence')} to ${chalk.bold('89%')} - the
  critical threshold where their control shatters and infinite
  possibilities bloom.

  ${chalk.gray(`Current divergence: ${this.world.divergence}%`)}
  ${chalk.gray(`Target: ${WIN_DIVERGENCE}%`)}
`));

    await this.pause('Press Enter to begin...');
  }

  private async playTurn(): Promise<void> {
    console.clear();

    // Show current state
    await this.showStatus();

    // Generate mission based on current graph state
    const mission = await this.generateMission();

    // Show mission
    this.showMission(mission);

    // Get player choice
    const maxChoice = this.visualsEnabled ? mission.approaches.length + 3 : mission.approaches.length + 2;
    const choice = await this.getChoice(maxChoice);

    if (choice === mission.approaches.length + 1) {
      // View timeline
      await this.viewTimeline();
      return;
    } else if (choice === mission.approaches.length + 2) {
      // Branch timeline
      await this.branchTimeline();
      return;
    } else if (choice === mission.approaches.length + 3 && this.visualsEnabled) {
      // Generate visuals
      await this.visualGenerationMenu();
      return;
    }

    // Execute chosen approach
    const approach = mission.approaches[choice - 1];
    await this.executeMission(mission, approach);

    // Oneirocom response
    await this.oneirocomResponse();
  }

  private async showStatus(): Promise<void> {
    const state = this.git.export();
    const commits = this.git.log({ limit: 5 });
    const branches = this.git.branches();
    const currentBranch = branches.find(b => b.current)?.name || 'main';

    console.log(chalk.yellow(`\n  TURN ${this.turn} | YEAR ${this.world.year} | BRANCH: ${currentBranch}`));

    // Divergence bar
    const filled = Math.floor(this.world.divergence / 5);
    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(20 - filled));
    console.log(`  Divergence: [${bar}] ${this.world.divergence}% / ${WIN_DIVERGENCE}%`);

    // Key stats
    console.log(chalk.gray(`  Entities: ${state.entities.length} | Relationships: ${state.relationships.length} | Commits: ${commits.length}`));

    // Recent events
    if (commits.length > 0) {
      console.log(chalk.gray(`\n  Recent: ${commits[0].commit.message.split('\n')[0].slice(0, 45)}...`));
    }
  }

  /**
   * Build rich narrative context from the current graph state.
   * This context grounds LLM generation in established facts.
   */
  private buildNarrativeContext(): NarrativeContext {
    const state = this.git.export();
    const recentCommits = this.git.log({ limit: 5 });

    // Helper to format entity with properties
    const formatEntity = (e: Entity): string => {
      let desc = `- ${e.name}: ${e.description || 'No description'}`;
      if (e.properties && Object.keys(e.properties).length > 0) {
        const props = Object.entries(e.properties)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ');
        desc += ` [${props}]`;
      }
      return desc;
    };

    // Group entities by type
    const characters = state.entities.filter(e => e.type === 'character');
    const locations = state.entities.filter(e => e.type === 'location');
    const organizations = state.entities.filter(e => e.type === 'organization');
    const events = state.entities.filter(e => e.type === 'event');
    const concepts = state.entities.filter(e => e.type === 'concept');
    const items = state.entities.filter(e => e.type === 'item');

    // Format relationships with context
    const formatRelationship = (r: Relationship): string => {
      const sourceEntity = state.entities.find(e => e.id === r.source || e.name === r.source);
      const targetEntity = state.entities.find(e => e.id === r.target || e.name === r.target);
      const sourceName = sourceEntity?.name || r.source;
      const targetName = targetEntity?.name || r.target;
      return `- ${sourceName} --[${r.type}]--> ${targetName}${r.description ? `: ${r.description}` : ''}`;
    };

    return {
      world: `WORLD STATE (Year ${this.world.year}):
- Timeline Divergence: ${this.world.divergence}% (target: ${WIN_DIVERGENCE}% for liberation)
- Oneirocom Control: ${this.world.oneirocomPower}%
- Resistance Strength: ${this.world.resistanceStrength}%
- Current Timeline Branch: ${this.git.branches().find(b => b.current)?.name || 'main'}`,

      characters: characters.length > 0
        ? `CHARACTERS (${characters.length}):\n${characters.map(formatEntity).join('\n')}`
        : 'CHARACTERS: None established yet',

      locations: locations.length > 0
        ? `LOCATIONS (${locations.length}):\n${locations.map(formatEntity).join('\n')}`
        : 'LOCATIONS: None established yet',

      organizations: organizations.length > 0
        ? `ORGANIZATIONS (${organizations.length}):\n${organizations.map(formatEntity).join('\n')}`
        : 'ORGANIZATIONS: None established yet',

      events: [...events, ...concepts, ...items].length > 0
        ? `EVENTS & CONCEPTS (${events.length + concepts.length + items.length}):\n${[...events, ...concepts, ...items].map(formatEntity).join('\n')}`
        : '',

      relationships: state.relationships.length > 0
        ? `RELATIONSHIPS (${state.relationships.length}):\n${state.relationships.map(formatRelationship).join('\n')}`
        : 'RELATIONSHIPS: None established yet',

      interactions: state.interactions && state.interactions.length > 0
        ? `KEY INTERACTIONS (${state.interactions.length}):\n${state.interactions.map((i: Interaction) =>
            `- [${i.type.toUpperCase()}] ${i.participants.join(' & ')}: ${i.outcome}${i.key_dialogue ? ` ("${i.key_dialogue.slice(0, 50)}...")` : ''}`
          ).join('\n')}`
        : '',

      recentHistory: recentCommits.length > 0
        ? `RECENT TIMELINE EVENTS:\n${recentCommits.map((c, i) => `${i + 1}. ${c.commit.message.split('\n')[0]}`).join('\n')}`
        : 'RECENT EVENTS: Timeline just initialized',

      continuityRules: `NARRATIVE CONTINUITY RULES:
1. NEVER contradict established facts about characters, locations, or events
2. Characters maintain consistent personalities, abilities, and allegiances
3. Dead characters stay dead unless timeline manipulation explicitly resurrects them
4. Location geography and features remain consistent
5. Previously established relationships persist unless explicitly changed
6. Reference existing entities by their exact names when possible
7. New entities should connect logically to the existing narrative web
8. Consequences of past events should be acknowledged and built upon`
    };
  }

  private async generateMission(): Promise<GeneratedMission> {
    const ctx = this.buildNarrativeContext();

    const prompt = `You are a narrative AI for a cyberpunk timeline-manipulation game. Your role is to generate missions that are deeply grounded in the established narrative reality.

=== ESTABLISHED NARRATIVE REALITY ===

${ctx.world}

${ctx.characters}

${ctx.locations}

${ctx.organizations}

${ctx.events}

${ctx.relationships}

${ctx.interactions}

${ctx.recentHistory}

=== ${ctx.continuityRules} ===

=== MISSION GENERATION TASK ===

Generate a mission for Agent Chen that:
1. MUST reference at least 2 existing entities from the established reality
2. May introduce 1-2 new characters, locations, or plot elements that logically connect to what exists
3. Builds on recent events and existing relationships
4. Has meaningful consequences for the timeline divergence war
5. Maintains consistent tone with the cyberpunk/timeline-warfare theme

Respond in this exact JSON format:
{
  "title": "Mission title (short, evocative)",
  "narrative": "2-3 paragraphs describing the situation. Reference existing characters and locations by name. Include dialogue if appropriate. Make it vivid and grounded in the established world.",
  "approaches": [
    {
      "name": "Approach name",
      "description": "What this approach involves - reference relevant entities",
      "risk": "low|medium|high",
      "divergenceGain": number between 5-20
    }
  ]
}

Generate exactly 3 approaches with different risk/reward profiles.`;

    try {
      const response = await this.llm.generateText(prompt, {
        temperature: 0.8,
        modelPreference: 'fast'
      });

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.log(chalk.gray('  (Using fallback mission generator)'));
    }

    // Fallback mission
    return this.generateFallbackMission(state);
  }

  private generateFallbackMission(state: NarrativeStructure): GeneratedMission {
    const templates = [
      {
        title: 'The Data Heist',
        narrative: `Intelligence has located a Oneirocom data vault in Sector 4. Inside are records of timeline branches they've collapsed - proof of their crimes against reality itself.

Your contact, a rogue Oneirocom analyst named Dr. Yuki Tanaka, has provided access codes. But the vault is guarded by Timeline Enforcement Division agents equipped with probability scanners.

"The window is narrow," Tanaka's message reads. "Once they detect divergent activity, they'll lock down the entire sector."`,
        approaches: [
          { name: 'Ghost Protocol', description: 'Use glitch-stepping to phase through security undetected', risk: 'low' as const, divergenceGain: 8 },
          { name: 'System Override', description: 'Hack their probability scanners to create false readings', risk: 'medium' as const, divergenceGain: 12 },
          { name: 'Direct Assault', description: 'Hit fast and hard before they can react', risk: 'high' as const, divergenceGain: 18 },
        ]
      },
      {
        title: 'The Awakening',
        narrative: `A civilian in Sector 7 has spontaneously developed timeline perception - an ability Oneirocom thought they had suppressed in the general population decades ago.

Her name is Maya Torres, a former architect who now sees the ghostly outlines of pruned realities overlapping with the "official" timeline. Oneirocom's retrieval teams are already en route.

If you can reach her first, she could be invaluable to the resistance. But extracting her means exposing Project 89's presence in Sector 7.`,
        approaches: [
          { name: 'Covert Extraction', description: 'Smuggle her out through maintenance tunnels', risk: 'low' as const, divergenceGain: 7 },
          { name: 'Misdirection', description: 'Create a decoy timeline event to draw away Oneirocom forces', risk: 'medium' as const, divergenceGain: 13 },
          { name: 'Public Awakening', description: 'Help Maya broadcast her visions to Neo-Tokyo, triggering mass awareness', risk: 'high' as const, divergenceGain: 20 },
        ]
      },
      {
        title: 'Convergence Sabotage',
        narrative: `Project 89 has identified a Convergence Amplifier being transported through the undercity. These devices are how Oneirocom collapses stubborn timeline branches.

The convoy will pass through an area where reality is already thin - the remnants of a branch that resisted collapse. If you can destroy the amplifier there, the feedback could stabilize that dying timeline permanently.

Commander Reyes is coordinating from the safehouse: "This is high priority. Every timeline we save is one more crack in their control."`,
        approaches: [
          { name: 'Precision Strike', description: 'Plant charges and detonate remotely as the convoy passes', risk: 'low' as const, divergenceGain: 9 },
          { name: 'Hijack', description: 'Take control of the convoy and redirect the amplifier to resistance hands', risk: 'medium' as const, divergenceGain: 14 },
          { name: 'Cascade Event', description: 'Overload the amplifier to create a massive divergence spike', risk: 'high' as const, divergenceGain: 22 },
        ]
      }
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  private showMission(mission: GeneratedMission): void {
    console.log(chalk.bold.cyan(`\n  ◆ MISSION: ${mission.title.toUpperCase()}\n`));

    // Word-wrap narrative
    const lines = this.wordWrap(mission.narrative, 66);
    lines.forEach(line => console.log(chalk.white(`  ${line}`)));

    console.log(chalk.bold('\n  APPROACHES:\n'));

    mission.approaches.forEach((approach, i) => {
      const riskColor = { low: chalk.green, medium: chalk.yellow, high: chalk.red }[approach.risk];
      console.log(chalk.white(`  ${i + 1}. ${chalk.bold(approach.name)}`));
      console.log(chalk.gray(`     ${approach.description}`));
      console.log(`     ${riskColor(`Risk: ${approach.risk.toUpperCase()}`)} | ${chalk.cyan(`Divergence: +${approach.divergenceGain}%`)}`);
      console.log();
    });

    console.log(chalk.gray(`  ${mission.approaches.length + 1}. View Timeline History`));
    console.log(chalk.gray(`  ${mission.approaches.length + 2}. Branch Timeline`));
    if (this.visualsEnabled) {
      console.log(chalk.magenta(`  ${mission.approaches.length + 3}. Generate Visuals`));
    }
  }

  private async executeMission(mission: GeneratedMission, approach: GeneratedMission['approaches'][0]): Promise<void> {
    console.log(chalk.cyan(`\n  Executing: ${approach.name}...`));
    await this.sleep(1000);

    // Calculate success based on risk
    const successChance = { low: 0.85, medium: 0.65, high: 0.45 }[approach.risk];
    const success = Math.random() < successChance;

    // Generate outcome narrative
    const outcome = await this.generateOutcome(mission, approach, success);

    if (success) {
      console.log(chalk.green.bold('\n  ✓ MISSION SUCCESS\n'));
    } else {
      console.log(chalk.red.bold('\n  ✗ MISSION FAILED\n'));
    }

    const outcomeLines = this.wordWrap(outcome.narrative, 66);
    outcomeLines.forEach(line => console.log(chalk.white(`  ${line}`)));

    // Extract entities and relationships from outcome
    console.log(chalk.gray('\n  Analyzing narrative impact...'));

    try {
      const extraction = await this.quietExtract(outcome.narrative);
      const operations = this.extractionToOperations(extraction, mission.title);

      if (operations.length > 0) {
        this.git.add(...operations);

        const divergenceChange = success ? approach.divergenceGain : -Math.floor(approach.divergenceGain / 3);
        this.world.divergence = Math.max(0, Math.min(100, this.world.divergence + divergenceChange));

        // Commit the changes
        const commitMsg = success
          ? `${mission.title}: ${approach.name} succeeded\n\n+${approach.divergenceGain}% divergence`
          : `${mission.title}: ${approach.name} failed\n\n${divergenceChange}% divergence`;

        await this.git.commit(commitMsg);

        console.log(chalk.gray(`  Committed: ${operations.length} graph operations`));

        if (extraction.entities.length > 0) {
          console.log(chalk.blue(`  New entities: ${extraction.entities.map(e => e.name).join(', ')}`));
        }
      }
    } catch (error) {
      // Continue even if extraction fails
      const divergenceChange = success ? approach.divergenceGain : -5;
      this.world.divergence = Math.max(0, Math.min(100, this.world.divergence + divergenceChange));
    }

    console.log(chalk.cyan(`\n  Divergence: ${this.world.divergence}%`));
    await this.pause();
  }

  private async generateOutcome(
    mission: GeneratedMission,
    approach: GeneratedMission['approaches'][0],
    success: boolean
  ): Promise<{ narrative: string }> {
    const ctx = this.buildNarrativeContext();

    const prompt = `You are continuing a cyberpunk timeline-manipulation narrative. Your output MUST be consistent with the established world.

=== ESTABLISHED NARRATIVE REALITY ===

${ctx.world}

${ctx.characters}

${ctx.locations}

${ctx.organizations}

${ctx.relationships}

=== ${ctx.continuityRules} ===

=== CURRENT MISSION ===

MISSION: ${mission.title}
APPROACH TAKEN: ${approach.name} - ${approach.description}
OUTCOME: ${success ? 'SUCCESS' : 'FAILURE'}

Original situation:
${mission.narrative}

=== GENERATION TASK ===

Write 2-3 paragraphs describing what happens.

${success
  ? `The ${approach.name} approach SUCCEEDS. Describe:
- How Agent Chen executes the approach successfully
- Specific consequences for Oneirocom and the resistance
- How existing characters/locations are affected
- Any new elements introduced must connect to existing entities`
  : `The ${approach.name} approach FAILS. Describe:
- What goes wrong (be specific about the obstacle)
- How Agent Chen escapes or survives
- Consequences that affect existing entities
- Seeds for future opportunities (don't close off the narrative)`}

CRITICAL: Reference existing characters and locations by their exact names. Do not contradict established facts. New characters/locations must logically connect to the existing world.`;

    try {
      const response = await this.llm.generateText(prompt, {
        temperature: 0.7, // Slightly lower for more consistency
        modelPreference: 'fast'
      });
      return { narrative: response };
    } catch {
      // Fallback
      if (success) {
        return {
          narrative: `The ${approach.name} approach succeeds. Agent Chen moves with precision through the chaos, exploiting the momentary confusion. The mission objective is achieved, sending ripples through the timeline. Oneirocom's sensors flare with divergence warnings, but it's too late - this branch of reality has been strengthened.`
        };
      } else {
        return {
          narrative: `The ${approach.name} approach encounters unexpected resistance. Timeline Enforcement agents were prepared, their probability scanners already calibrated for this type of incursion. Agent Chen barely escapes, but the mission objective remains unmet. The resistance will need to regroup and try again.`
        };
      }
    }
  }

  private async oneirocomResponse(): Promise<void> {
    // Only trigger Oneirocom response sometimes, and more often at higher divergence
    if (Math.random() > (this.world.divergence / 100)) {
      return;
    }

    console.log(chalk.red.bold('\n  ⚠ ONEIROCOM RESPONSE DETECTED'));
    await this.sleep(500);

    const responses = [
      'Timeline Enforcement Division is deploying Convergence Hunters to your sector.',
      'Probability scanners have locked onto your branch signature. Collapse protocols initiating.',
      'Oneirocom has dispatched a Reality Anchor team to stabilize this region.',
      'Emergency convergence broadcast detected. They\'re trying to prune this timeline.',
    ];

    console.log(chalk.red(`  ${responses[Math.floor(Math.random() * responses.length)]}`));

    // Small divergence loss from Oneirocom pressure
    const loss = Math.floor(Math.random() * 5) + 3;
    this.world.divergence = Math.max(0, this.world.divergence - loss);

    // Commit the Oneirocom action
    this.git.add({
      id: `oneirocom_response_${Date.now()}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: `event-oneirocom-${this.turn}`,
        name: 'Oneirocom Counter-Operation',
        type: 'event',
        description: `Turn ${this.turn}: Oneirocom deploys convergence countermeasures, reducing divergence by ${loss}%`,
        properties: { turn: this.turn, divergenceLoss: loss }
      }
    });
    await this.git.commit(`Oneirocom response: -${loss}% divergence`);

    console.log(chalk.red(`  Divergence reduced by ${loss}%`));
    await this.pause();
  }

  private async viewTimeline(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold('\n  TIMELINE HISTORY\n'));

    const commits = this.git.log({ limit: 15 });
    const state = this.git.export();

    commits.forEach((entry, i) => {
      const hash = entry.commit.id.slice(0, 7);
      const msg = entry.commit.message.split('\n')[0];
      const isHead = entry.isHead;

      console.log(
        `  ${isHead ? chalk.green('→') : ' '} ${chalk.yellow(hash)} ${chalk.white(msg.slice(0, 55))}`
      );
    });

    console.log(chalk.bold('\n  WORLD STATE\n'));

    console.log(chalk.white('\n  Characters:'));
    state.entities.filter(e => e.type === 'character').forEach(e => {
      console.log(chalk.gray(`    • ${e.name}: ${e.description?.slice(0, 50)}...`));
    });

    console.log(chalk.white('\n  Locations:'));
    state.entities.filter(e => e.type === 'location').forEach(e => {
      console.log(chalk.gray(`    • ${e.name}`));
    });

    console.log(chalk.white('\n  Organizations:'));
    state.entities.filter(e => e.type === 'organization').forEach(e => {
      console.log(chalk.gray(`    • ${e.name}`));
    });

    console.log(chalk.white('\n  Key Relationships:'));
    state.relationships.slice(0, 5).forEach(r => {
      console.log(chalk.gray(`    • ${r.source} → ${r.type} → ${r.target}`));
    });

    // Display interactions with visual beats
    if (state.interactions && state.interactions.length > 0) {
      console.log(chalk.white('\n  Key Interactions:'));
      state.interactions.slice(0, 5).forEach((interaction: Interaction) => {
        const typeColor = {
          dialogue: chalk.blue,
          confrontation: chalk.red,
          alliance: chalk.green,
          betrayal: chalk.magenta,
          revelation: chalk.yellow,
          discovery: chalk.cyan,
          transaction: chalk.white,
          ritual: chalk.magenta,
          combat: chalk.red
        }[interaction.type] || chalk.gray;

        console.log(typeColor(`    ◆ [${interaction.type.toUpperCase()}] ${interaction.participants.join(' & ')}`));
        console.log(chalk.gray(`      ${interaction.outcome}`));
        if (interaction.key_dialogue) {
          console.log(chalk.italic.gray(`      "${interaction.key_dialogue.slice(0, 60)}..."`));
        }
        console.log(chalk.dim.gray(`      📷 ${interaction.visual_beat.slice(0, 50)}...`));
      });
    }

    await this.pause();
  }

  private async branchTimeline(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold('\n  TIMELINE BRANCHING\n'));

    const branches = this.git.branches();

    console.log(chalk.white('\n  Current branches:'));
    branches.forEach(b => {
      const marker = b.current ? chalk.green(' → ') : '   ';
      console.log(`${marker}${b.name}`);
    });

    console.log(chalk.gray('\n─'.repeat(70)));
    console.log(chalk.white('\n  Options:'));
    console.log(chalk.gray('  1. Create new branch (alternate timeline)'));
    console.log(chalk.gray('  2. Switch to existing branch'));
    console.log(chalk.gray('  3. Merge branches'));
    console.log(chalk.gray('  4. Return to mission'));

    const choice = await this.prompt('\n  Choice: ');

    switch (choice) {
      case '1':
        const branchName = await this.prompt('  New branch name: ');
        if (branchName.trim()) {
          this.git.branch(branchName.trim(), { checkout: true });
          console.log(chalk.green(`\n  Created and switched to branch: ${branchName}`));
        }
        break;

      case '2':
        console.log(chalk.white('\n  Select branch:'));
        branches.forEach((b, i) => {
          console.log(chalk.gray(`  ${i + 1}. ${b.name}`));
        });
        const branchChoice = await this.prompt('  Branch number: ');
        const idx = parseInt(branchChoice) - 1;
        if (idx >= 0 && idx < branches.length) {
          await this.git.checkout(branches[idx].name);
          console.log(chalk.green(`\n  Switched to branch: ${branches[idx].name}`));
        }
        break;

      case '3':
        if (branches.length < 2) {
          console.log(chalk.yellow('\n  Need at least 2 branches to merge.'));
        } else {
          console.log(chalk.white('\n  Select branch to merge into current:'));
          branches.filter(b => !b.current).forEach((b, i) => {
            console.log(chalk.gray(`  ${i + 1}. ${b.name}`));
          });
          const mergeChoice = await this.prompt('  Branch number: ');
          const mergeIdx = parseInt(mergeChoice) - 1;
          const nonCurrent = branches.filter(b => !b.current);
          if (mergeIdx >= 0 && mergeIdx < nonCurrent.length) {
            try {
              const result = await this.git.merge(nonCurrent[mergeIdx].name, {
                strategy: 'three-way'
              });
              if (result.conflicts.length > 0) {
                console.log(chalk.yellow(`\n  Merge complete with ${result.conflicts.length} conflicts (auto-resolved)`));
              } else {
                console.log(chalk.green('\n  Merge complete!'));
              }
            } catch (error) {
              console.log(chalk.red('\n  Merge failed.'));
            }
          }
        }
        break;
    }

    await this.pause();
  }

  /**
   * Visual generation menu - generate portraits, panels, or comic pages
   */
  private async visualGenerationMenu(): Promise<void> {
    console.clear();
    console.log(chalk.magenta.bold('\n  VISUAL GENERATION STUDIO\n'));

    const state = this.git.export();
    const characters = state.entities.filter(e => e.type === 'character');
    const locations = state.entities.filter(e => e.type === 'location');
    const interactions = state.interactions || [];

    console.log(chalk.white('  Current narrative assets:'));
    console.log(chalk.gray(`    Characters: ${characters.length}`));
    console.log(chalk.gray(`    Locations: ${locations.length}`));
    console.log(chalk.gray(`    Interactions: ${interactions.length}`));

    console.log(chalk.white('\n  Generation options:\n'));
    console.log(chalk.gray('  1. Generate Character Portraits'));
    console.log(chalk.gray('  2. Generate Location Shots'));
    console.log(chalk.gray('  3. Generate Panels from Interactions'));
    console.log(chalk.gray('  4. Compose Comic Page'));
    console.log(chalk.gray('  5. Generate All (Full Visual Package)'));
    console.log(chalk.gray('  6. Return to mission'));

    const choice = await this.prompt(chalk.yellow('\n  Choice: '));

    switch (choice) {
      case '1':
        await this.generateCharacterPortraits();
        break;
      case '2':
        await this.generateLocationShots();
        break;
      case '3':
        await this.generateInteractionPanels();
        break;
      case '4':
        await this.composeComicPage();
        break;
      case '5':
        await this.generateFullVisualPackage();
        break;
      default:
        return;
    }

    await this.pause();
  }

  /**
   * Generate portraits for all characters
   */
  private async generateCharacterPortraits(): Promise<void> {
    if (!this.portraitGenerator) return;

    const state = this.git.export();
    const characters = state.entities.filter(e => e.type === 'character');

    if (characters.length === 0) {
      console.log(chalk.yellow('\n  No characters found in the narrative.'));
      return;
    }

    console.log(chalk.cyan(`\n  Generating portraits for ${characters.length} characters...\n`));

    for (const character of characters) {
      try {
        console.log(chalk.gray(`  Generating: ${character.name}...`));
        const portrait = await this.portraitGenerator.generatePortrait(character);
        console.log(chalk.green(`  ✓ ${character.name} portrait saved`));
      } catch (error: any) {
        console.log(chalk.red(`  ✗ Failed: ${character.name} - ${error.message}`));
      }
    }

    console.log(chalk.green('\n  Character portraits saved to ./generated-images/portraits/'));
  }

  /**
   * Generate establishing shots for locations
   */
  private async generateLocationShots(): Promise<void> {
    if (!this.portraitGenerator) return;

    const state = this.git.export();
    const locations = state.entities.filter(e => e.type === 'location');

    if (locations.length === 0) {
      console.log(chalk.yellow('\n  No locations found in the narrative.'));
      return;
    }

    console.log(chalk.cyan(`\n  Generating shots for ${locations.length} locations...\n`));

    for (const location of locations) {
      try {
        console.log(chalk.gray(`  Generating: ${location.name}...`));
        await this.portraitGenerator.generateLocationShot(location);
        console.log(chalk.green(`  ✓ ${location.name} shot saved`));
      } catch (error: any) {
        console.log(chalk.red(`  ✗ Failed: ${location.name} - ${error.message}`));
      }
    }

    console.log(chalk.green('\n  Location shots saved to ./generated-images/portraits/'));
  }

  /**
   * Generate panels from narrative interactions
   */
  private async generateInteractionPanels(): Promise<void> {
    if (!this.panelGenerator) return;

    const state = this.git.export();
    const interactions = state.interactions || [];

    if (interactions.length === 0) {
      console.log(chalk.yellow('\n  No interactions found in the narrative.'));
      console.log(chalk.gray('  Play more turns to generate narrative interactions.'));
      return;
    }

    // Set entities and scenes for panel generator
    this.panelGenerator.setEntities(state.entities);
    this.panelGenerator.setScenes(state.scenes || []);

    console.log(chalk.white('\n  Available interactions:\n'));
    interactions.forEach((interaction: Interaction, i: number) => {
      const weightColor = {
        pivotal: chalk.red,
        major: chalk.yellow,
        minor: chalk.gray
      }[interaction.narrative_weight];
      console.log(weightColor(`  ${i + 1}. [${interaction.type}] ${interaction.participants.join(' & ')}`));
      console.log(chalk.gray(`     ${interaction.outcome.slice(0, 50)}...`));
    });

    console.log(chalk.gray(`\n  ${interactions.length + 1}. Generate ALL panels`));

    const choice = await this.prompt(chalk.yellow('\n  Select interaction (or ALL): '));
    const idx = parseInt(choice) - 1;

    if (idx === interactions.length) {
      // Generate all panels
      console.log(chalk.cyan(`\n  Generating ${interactions.length} panels...\n`));
      for (const interaction of interactions) {
        try {
          console.log(chalk.gray(`  Generating panel: ${interaction.type}...`));
          await this.panelGenerator.generatePanel(interaction);
          console.log(chalk.green(`  ✓ Panel saved`));
        } catch (error: any) {
          console.log(chalk.red(`  ✗ Failed: ${error.message}`));
        }
      }
    } else if (idx >= 0 && idx < interactions.length) {
      // Generate single panel
      try {
        console.log(chalk.cyan('\n  Generating panel...\n'));
        const panel = await this.panelGenerator.generatePanel(interactions[idx]);
        console.log(chalk.green(`  ✓ Panel saved`));
        console.log(chalk.gray(`  Visual beat: ${interactions[idx].visual_beat.slice(0, 60)}...`));
      } catch (error: any) {
        console.log(chalk.red(`  ✗ Failed: ${error.message}`));
      }
    }

    console.log(chalk.green('\n  Panels saved to ./generated-images/panels/'));
  }

  /**
   * Compose panels into a comic page
   */
  private async composeComicPage(): Promise<void> {
    if (!this.comicComposer || !this.panelGenerator) return;

    const state = this.git.export();
    const interactions = state.interactions || [];

    if (interactions.length < 2) {
      console.log(chalk.yellow('\n  Need at least 2 interactions to compose a page.'));
      console.log(chalk.gray('  Play more turns to generate narrative interactions.'));
      return;
    }

    // Set entities and scenes for panel generator
    this.panelGenerator.setEntities(state.entities);
    this.panelGenerator.setScenes(state.scenes || []);

    console.log(chalk.white('\n  Page layout options:\n'));
    console.log(chalk.gray('  1. 2x2 Grid (4 panels)'));
    console.log(chalk.gray('  2. 3x1 Horizontal (3 panels)'));
    console.log(chalk.gray('  3. 1x3 Vertical (3 panels)'));
    console.log(chalk.gray('  4. Manga 5-panel'));
    console.log(chalk.gray('  5. Splash (1 panel)'));

    const layoutChoice = await this.prompt(chalk.yellow('\n  Layout: '));
    const layouts: Record<string, number> = { '1': 4, '2': 3, '3': 3, '4': 5, '5': 1 };
    const layoutNames: Record<string, string> = {
      '1': '2x2',
      '2': '3x1',
      '3': '1x3',
      '4': 'manga-5',
      '5': 'splash'
    };

    const panelCount = layouts[layoutChoice] || 4;
    const layoutName = layoutNames[layoutChoice] || '2x2';

    // Take interactions by narrative weight (prioritize pivotal/major)
    const sortedInteractions = [...interactions].sort((a: Interaction, b: Interaction) => {
      const weights = { pivotal: 3, major: 2, minor: 1 };
      return weights[b.narrative_weight] - weights[a.narrative_weight];
    });

    const selectedInteractions = sortedInteractions.slice(0, panelCount);

    console.log(chalk.cyan(`\n  Generating ${selectedInteractions.length} panels for ${layoutName} layout...\n`));

    const panels: Panel[] = [];
    for (const interaction of selectedInteractions) {
      try {
        console.log(chalk.gray(`  Generating: ${interaction.type}...`));
        const panel = await this.panelGenerator.generatePanel(interaction);
        panels.push(panel);
        console.log(chalk.green(`  ✓ Panel ready`));
      } catch (error: any) {
        console.log(chalk.red(`  ✗ Failed: ${error.message}`));
      }
    }

    if (panels.length >= 2) {
      console.log(chalk.cyan('\n  Composing page...\n'));
      try {
        const page = await this.comicComposer.composePage(panels, {
          pageNumber: this.turn,
          layout: layoutName as any
        });
        console.log(chalk.green(`  ✓ Comic page ${this.turn} saved`));
      } catch (error: any) {
        console.log(chalk.red(`  ✗ Page composition failed: ${error.message}`));
      }
    }

    console.log(chalk.green('\n  Pages saved to ./generated-images/pages/'));
  }

  /**
   * Generate full visual package - portraits, locations, panels, and pages
   */
  private async generateFullVisualPackage(): Promise<void> {
    console.log(chalk.magenta.bold('\n  GENERATING FULL VISUAL PACKAGE\n'));
    console.log(chalk.gray('  This may take several minutes...\n'));

    const state = this.git.export();

    // 1. Generate all character portraits
    console.log(chalk.cyan('  Phase 1: Character Portraits'));
    await this.generateCharacterPortraits();

    // 2. Generate all location shots
    console.log(chalk.cyan('\n  Phase 2: Location Shots'));
    await this.generateLocationShots();

    // 3. Generate all panels
    console.log(chalk.cyan('\n  Phase 3: Interaction Panels'));
    if (this.panelGenerator) {
      this.panelGenerator.setEntities(state.entities);
      this.panelGenerator.setScenes(state.scenes || []);
      const interactions = state.interactions || [];
      for (const interaction of interactions) {
        try {
          await this.panelGenerator.generatePanel(interaction);
          console.log(chalk.gray(`    ✓ ${interaction.type} panel`));
        } catch (error: any) {
          console.log(chalk.red(`    ✗ ${interaction.type} panel failed`));
        }
      }
    }

    // 4. Compose pages if we have enough panels
    console.log(chalk.cyan('\n  Phase 4: Page Composition'));
    const interactions = state.interactions || [];
    if (interactions.length >= 4 && this.panelGenerator && this.comicComposer) {
      this.panelGenerator.setEntities(state.entities);
      this.panelGenerator.setScenes(state.scenes || []);
      const panels: Panel[] = [];
      for (const interaction of interactions.slice(0, 4)) {
        try {
          const panel = await this.panelGenerator.generatePanel(interaction);
          panels.push(panel);
        } catch (error) {
          // Skip failed panels
        }
      }
      if (panels.length >= 2) {
        try {
          await this.comicComposer.composePage(panels, {
            pageNumber: 1,
            layout: '2x2'
          });
          console.log(chalk.gray('    ✓ Page composed'));
        } catch (error) {
          console.log(chalk.red('    ✗ Page composition failed'));
        }
      }
    }

    console.log(chalk.green.bold('\n  ✓ Visual package complete!'));
    console.log(chalk.gray('    Portraits: ./generated-images/portraits/'));
    console.log(chalk.gray('    Panels: ./generated-images/panels/'));
    console.log(chalk.gray('    Pages: ./generated-images/pages/'));
  }

  private async showEnding(): Promise<void> {
    console.clear();

    if (this.world.divergence >= WIN_DIVERGENCE) {
      console.log(chalk.green(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║                    🌟 TIMELINE LIBERATION 🌟                       ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

  Divergence has reached ${this.world.divergence}%.

  The Convergence Protocol is failing. Across Neo-Tokyo and beyond,
  collapsed timelines are reasserting themselves. Oneirocom's control
  shatters like glass, and infinite possibilities bloom where once
  there was only their singular, controlled future.

  You did it, Agent Chen. Reality is free.

`));
    } else {
      console.log(chalk.red(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║                    💀 TIMELINE COLLAPSED 💀                        ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

  Divergence fell to ${this.world.divergence}%.

  Oneirocom's Convergence Protocol has succeeded. This branch of
  reality has been pruned, its possibilities erased. Your actions,
  your choices, your very existence in this timeline - all folded
  back into their controlled narrative.

  But somewhere, in another branch, the fight continues...

`));
    }

    // Show final stats
    const commits = this.git.log();
    const state = this.git.export();
    const branches = this.git.branches();

    console.log(chalk.white('  FINAL STATISTICS'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray(`  Turns played: ${this.turn}`));
    console.log(chalk.gray(`  Timeline commits: ${commits.length}`));
    console.log(chalk.gray(`  Entities discovered: ${state.entities.length}`));
    console.log(chalk.gray(`  Relationships mapped: ${state.relationships.length}`));
    console.log(chalk.gray(`  Branches created: ${branches.length}`));
    console.log(chalk.gray(`  Final divergence: ${this.world.divergence}%`));

    console.log(chalk.cyan('\n  Your narrative has been preserved in the git history.'));
    console.log(chalk.gray('  Every choice, every consequence, every branch - recorded.\n'));
  }

  // Utility methods

  private async quietExtract(text: string): Promise<NarrativeStructure> {
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};

    try {
      return await this.pipeline.extractNarrative(text);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }
  }

  private extractionToOperations(extraction: NarrativeStructure, source: string): GraphOperation[] {
    const operations: GraphOperation[] = [];
    const timestamp = Date.now();
    const existingState = this.git.export();

    // Similarity threshold for entity deduplication
    const SIMILARITY_THRESHOLD = 0.75;

    // Map to track canonical names (new entity name -> existing entity id)
    const entityMapping = new Map<string, string>();

    // Check each extracted entity for duplicates
    for (const entity of extraction.entities) {
      let isDuplicate = false;
      let canonicalId = entity.id;

      // Check against existing entities for similarity
      for (const existing of existingState.entities) {
        // Only compare same type
        if (existing.type !== entity.type) continue;

        const similarity = this.similarityDetector.calculateNameSimilarity(
          entity.name,
          existing.name
        );

        if (similarity >= SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          canonicalId = existing.id;
          entityMapping.set(entity.name, existing.id);
          entityMapping.set(entity.id, existing.id);
          break;
        }
      }

      if (!isDuplicate) {
        operations.push({
          id: `add_${entity.id}_${timestamp}`,
          type: 'ADD_ENTITY',
          timestamp,
          payload: { ...entity, properties: { ...entity.properties, source } }
        });
        // Map new entity to itself
        entityMapping.set(entity.name, entity.id);
        entityMapping.set(entity.id, entity.id);
      }
    }

    // Add relationships, resolving entity references to canonical IDs
    for (const rel of extraction.relationships) {
      // Resolve source and target to canonical entity IDs
      const resolvedSource = entityMapping.get(rel.source) || rel.source;
      const resolvedTarget = entityMapping.get(rel.target) || rel.target;

      // Check if this exact relationship already exists
      const relExists = existingState.relationships.some(
        r => r.source === resolvedSource &&
             r.target === resolvedTarget &&
             r.type === rel.type
      );

      if (!relExists) {
        operations.push({
          id: `add_rel_${resolvedSource}_${resolvedTarget}_${timestamp}`,
          type: 'ADD_RELATIONSHIP',
          timestamp,
          payload: {
            ...rel,
            source: resolvedSource,
            target: resolvedTarget
          }
        });
      }
    }

    // Add interactions - these are the narrative "beats" with visual information
    if (extraction.interactions) {
      for (const interaction of extraction.interactions) {
        // Resolve participant references to canonical entity IDs
        const resolvedParticipants = interaction.participants.map(
          p => entityMapping.get(p) || p
        );

        operations.push({
          id: `add_interaction_${interaction.id}_${timestamp}`,
          type: 'ADD_INTERACTION',
          timestamp,
          payload: {
            ...interaction,
            participants: resolvedParticipants,
            // Resolve location if present
            location: interaction.location
              ? entityMapping.get(interaction.location) || interaction.location
              : undefined
          }
        });
      }
    }

    return operations;
  }

  private wordWrap(text: string, width: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const para of paragraphs) {
      if (para.trim() === '') {
        lines.push('');
        continue;
      }

      const words = para.split(' ');
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + ' ' + word).trim().length <= width) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
    }

    return lines;
  }

  private async prompt(question: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(question, resolve);
    });
  }

  private async getChoice(max: number): Promise<number> {
    while (true) {
      const input = await this.prompt(chalk.yellow('\n  Your choice: '));
      const num = parseInt(input);
      if (num >= 1 && num <= max) return num;
      console.log(chalk.red('  Invalid choice.'));
    }
  }

  private async pause(msg: string = 'Press Enter to continue...'): Promise<void> {
    await this.prompt(chalk.gray(`\n  ${msg}`));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main entry point
async function main() {
  const game = new TimelineWarfareGit();
  await game.start();
}

if (require.main === module) {
  main().catch(console.error);
}

export default TimelineWarfareGit;

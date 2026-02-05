/**
 * Timeline Warfare - Standalone Game
 *
 * This is a bundled version that includes all necessary components
 * for the Timeline Warfare game using the narrative extraction system.
 */

import * as readline from "readline";
import chalk from "chalk";
import { NarrativePipeline } from "../pipeline";
import { GeminiAdapter } from "../llm/gemini";
import { MockLLM } from "../llm/mock";
import type { NarrativeStructure, Entity, Relationship } from "../types";
import TimelineManager, { TimelineState } from "./timeline-manager";
import BranchMergeMinigame, { TimelineConflict } from "./branch-merge-minigame";
import { Mission, MissionStrategy } from "./mission-generator";

// Load environment variables
import * as dotenv from "dotenv";
dotenv.config();

interface GameState {
  divergence: number;
  turn: number;
  narrativeHistory: Array<{
    turn: number;
    source: string;
    extraction: NarrativeStructure;
  }>;
  extractedEntities: Map<
    string,
    Entity & { sources: string[]; relevance: number }
  >;
  extractedRelationships: Array<Relationship & { source: string }>;
  // New dynamic system state
  timelineState: TimelineState;
  availableMissions: Mission[];
  completedMissions: Mission[];
  playerChoices: string[];
}

class TimelineWarfareGame {
  private rl: readline.Interface;
  private gameState: GameState;
  private pipeline!: NarrativePipeline;
  private timelineManager!: TimelineManager;
  private branchMergeMinigame!: BranchMergeMinigame;
  private config = {
    winDivergence: 89,
    loseDivergence: 0,
    missionDivergenceGain: 10,
    defenseDivergenceLoss: 15,
  };

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.gameState = {
      divergence: 15,
      turn: 1,
      narrativeHistory: [],
      extractedEntities: new Map(),
      extractedRelationships: [],
      // Initialize placeholder values - will be set in initializeLLM
      timelineState: {} as TimelineState,
      availableMissions: [],
      completedMissions: [],
      playerChoices: [],
    };
  }

  private async initializeLLM(): Promise<void> {
    // Check for existing API key
    let apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    const fastMode = process.env.GEMINI_FAST_MODE === "true";

    if (!apiKey) {
      console.log(chalk.cyan("\n🔑 NARRATIVE INTELLIGENCE INITIALIZATION\n"));
      console.log(
        chalk.yellow(
          "To unlock advanced timeline analysis, you need a Google AI (Gemini) API key."
        )
      );
      console.log(
        chalk.white(
          "Without it, the game will use mock data for demonstration purposes.\n"
        )
      );

      console.log(
        chalk.gray("You can get a free API key at: https://ai.google.dev/")
      );
      console.log(chalk.gray("Or press Enter to continue with mock data.\n"));

      const userKey = await this.prompt(
        "Enter your Gemini API key (or press Enter for mock mode): "
      );

      if (userKey.trim()) {
        apiKey = userKey.trim();
        console.log(
          chalk.green(
            "✅ API key set! Initializing advanced narrative analysis...\n"
          )
        );
      } else {
        console.log(
          chalk.yellow(
            "🤖 Using mock mode - narrative analysis will use predetermined data.\n"
          )
        );
      }
    } else {
      console.log(
        chalk.green(
          "✅ Found API key in environment. Initializing advanced narrative analysis..."
        )
      );
      console.log(
        chalk.cyan(`🚀 Using Gemini 3 models - MAXIMUM QUALITY ANALYSIS`)
      );
      console.log(
        chalk.gray(
          `   Fast Mode: ${fastMode ? "ENABLED (gemini-3-flash-preview)" : "DISABLED (gemini-3-pro-preview)"}`
        )
      );
      console.log(
        chalk.gray(`   Set GEMINI_FAST_MODE=true for fastest processing\n`)
      );
    }

    // Initialize the appropriate adapter with quiet mode for game
    const adapter = apiKey ? new GeminiAdapter(apiKey) : new MockLLM();

    this.pipeline = new NarrativePipeline(adapter);

    // Initialize the new dynamic systems
    this.timelineManager = new TimelineManager(adapter);
    this.branchMergeMinigame = new BranchMergeMinigame(adapter);

    // Initialize timeline state
    this.gameState.timelineState = this.timelineManager.initializeTimeline();

    // Set initial divergence to match timeline state
    this.gameState.divergence = this.gameState.timelineState.branches.get(
      this.gameState.timelineState.activeBranch
    )!.divergenceLevel;

    // Give user a moment to read the status
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  async play(): Promise<void> {
    console.clear();
    await this.initializeLLM();
    await this.showIntro();

    let playing = true;
    while (
      playing &&
      this.gameState.divergence > this.config.loseDivergence &&
      this.gameState.divergence < this.config.winDivergence
    ) {
      await this.showStatus();
      const action = await this.getPlayerAction();

      const actionNum = parseInt(action);

      // Handle mission selection (1 to availableMissions.length)
      if (
        actionNum >= 1 &&
        actionNum <= this.gameState.availableMissions.length
      ) {
        const selectedMission = this.gameState.availableMissions[actionNum - 1];
        await this.executeDynamicMission(selectedMission);
        // Remove completed mission from available list
        this.gameState.availableMissions.splice(actionNum - 1, 1);
      }
      // Handle other actions
      else if (actionNum === this.gameState.availableMissions.length + 1) {
        await this.viewTimelineIntelligence();
      } else if (actionNum === this.gameState.availableMissions.length + 2) {
        await this.switchTimelineBranch();
      } else if (actionNum === this.gameState.availableMissions.length + 3) {
        await this.timelineConvergenceProtocol();
      } else if (actionNum === this.gameState.availableMissions.length + 4) {
        playing = false;
      } else {
        console.log(chalk.red("Invalid choice. Please try again."));
        continue; // Don't increment turn for invalid choices
      }

      this.gameState.turn++;
    }

    await this.showEndGame();
    this.rl.close();
  }

  private async showIntro(): Promise<void> {
    const introNarrative = `
The year is 2089. You are Agent Chen, a Project 89 operative with the ability to perceive timeline branches.

Oneirocom Corporation controls reality through the Convergence Protocol, systematically eliminating alternate timelines. Your mission: increase timeline divergence to 89% - the critical threshold where their control shatters.

You operate from a hidden safehouse in Neo-Tokyo's Sector 7, where a stable reality glitch provides access to parallel branches. Each mission you complete weakens Oneirocom's grip, but their Timeline Enforcement Division constantly hunts for divergent branches to collapse.

Your neural implant flickers with quantum static as you prepare for your first operation...
    `;

    console.log(
      chalk.cyan("╔══════════════════════════════════════════════════════════╗")
    );
    console.log(
      chalk.cyan("║") +
        chalk.bold.white(
          "    TIMELINE WARFARE - NARRATIVE EXTRACTION EDITION       "
        ) +
        chalk.cyan("║")
    );
    console.log(
      chalk.cyan("╚══════════════════════════════════════════════════════════╝")
    );
    console.log();
    console.log(chalk.gray(introNarrative));

    // Extract narrative elements from intro quietly
    console.log(chalk.dim("\n🧠 Analyzing narrative structure..."));
    const extraction = await this.quietExtraction(introNarrative);
    this.processExtraction(extraction, "intro");

    await this.pause();
  }

  private async quietExtraction(text: string): Promise<any> {
    // Temporarily suppress console output during extraction
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};

    try {
      const result = await this.pipeline.extractNarrative(text);
      return result;
    } finally {
      // Restore console output
      console.log = originalLog;
      console.warn = originalWarn;
    }
  }

  private processExtraction(
    extraction: NarrativeStructure,
    source: string
  ): void {
    try {
      // Store extracted entities
      if (extraction.entities && Array.isArray(extraction.entities)) {
        extraction.entities.forEach((entity) => {
          if (entity && (entity.id || entity.name)) {
            const entityKey = entity.id || entity.name;
            if (!this.gameState.extractedEntities.has(entityKey)) {
              this.gameState.extractedEntities.set(entityKey, {
                ...entity,
                sources: [source],
                relevance: 1,
              });
            } else {
              const existing = this.gameState.extractedEntities.get(entityKey)!;
              existing.sources.push(source);
              existing.relevance++;
            }
          }
        });
      }

      // Store relationships
      if (extraction.relationships && Array.isArray(extraction.relationships)) {
        this.gameState.extractedRelationships.push(
          ...extraction.relationships.map((rel) => ({
            ...rel,
            source: source,
          }))
        );
      }

      // Add to narrative history
      this.gameState.narrativeHistory.push({
        turn: this.gameState.turn,
        source,
        extraction,
      });
    } catch (error) {
      console.error(chalk.red("Error processing extraction:"), error);
      // Continue gracefully
    }
  }

  private async showStatus(): Promise<void> {
    console.log(
      chalk.yellow("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    );
    console.log(chalk.bold(`Turn ${this.gameState.turn} - Timeline Status`));
    console.log(
      `Divergence: ${this.getDivergenceBar()} ${this.gameState.divergence}%`
    );

    // Show most relevant entities
    const topEntities = Array.from(this.gameState.extractedEntities.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3);

    if (topEntities.length > 0) {
      console.log(
        chalk.gray(`Key Entities: ${topEntities.map((e) => e.name).join(", ")}`)
      );
    }

    // Show relationship network size
    const uniqueRelTypes = new Set(
      this.gameState.extractedRelationships.map((r) => r.type)
    );
    if (uniqueRelTypes.size > 0) {
      console.log(
        chalk.gray(
          `Active Connections: ${this.gameState.extractedRelationships.length} across ${uniqueRelTypes.size} types`
        )
      );
    }
  }

  private getDivergenceBar(): string {
    const filled = Math.floor(this.gameState.divergence / 5);
    const empty = 20 - filled;
    return chalk.green(
      "[" + "█".repeat(filled) + chalk.gray("░".repeat(empty)) + "]"
    );
  }

  private async getPlayerAction(): Promise<string> {
    // Generate new missions if needed
    if (this.gameState.availableMissions.length === 0) {
      console.log(
        chalk.cyan("\n🧠 AI Mission Director generating new operations...")
      );
      this.gameState.availableMissions =
        await this.timelineManager.generateNextMissions(
          this.gameState.timelineState,
          this.gameState.playerChoices.slice(-3) // Use last 3 choices for context
        );
    }

    console.log(chalk.bold("\n🎯 AVAILABLE OPERATIONS:"));

    // Show available missions
    this.gameState.availableMissions.forEach((mission, index) => {
      console.log(chalk.white(`${index + 1}. ${mission.title}`));
      console.log(chalk.gray(`   ${mission.description}`));
      console.log(
        chalk.yellow(
          `   Divergence Impact: ${mission.divergenceImpact > 0 ? "+" : ""}${mission.divergenceImpact}%`
        )
      );
    });

    console.log(chalk.bold("\n⚡ OTHER ACTIONS:"));
    console.log(
      `${this.gameState.availableMissions.length + 1}. View Timeline Intelligence`
    );
    console.log(
      `${this.gameState.availableMissions.length + 2}. Switch Timeline Branch`
    );
    console.log(
      `${this.gameState.availableMissions.length + 3}. Timeline Convergence Protocol`
    );
    console.log(
      `${this.gameState.availableMissions.length + 4}. Exit Simulation`
    );

    return new Promise((resolve) => {
      this.rl.question(chalk.yellow("Your choice: "), resolve);
    });
  }

  private async runMission(): Promise<void> {
    console.log(chalk.bold.cyan("\n🎯 GENERATING MISSION..."));

    const missionNarrative = await this.generateContextualMission();
    console.log(chalk.white("\nMission Brief:"));
    console.log(missionNarrative);

    const extraction = await this.quietExtraction(missionNarrative);
    this.processExtraction(extraction, `mission_${this.gameState.turn}`);

    if (extraction.entities && extraction.entities.length > 0) {
      console.log(
        chalk.gray(
          `\nDetected Elements: ${extraction.entities.map((e: any) => `${e.name} (${e.type})`).join(", ")}`
        )
      );
    }

    console.log(chalk.bold("\nApproach:"));
    const approaches = this.generateApproaches(extraction);
    approaches.forEach((approach, i) => {
      console.log(`${i + 1}. ${approach}`);
    });

    const choice = await new Promise<string>((resolve) => {
      this.rl.question(chalk.yellow("Choose approach (1-3): "), resolve);
    });

    const success = Math.random() < 0.7;

    if (success) {
      this.gameState.divergence += this.config.missionDivergenceGain;
      console.log(
        chalk.green(
          `\n✓ Mission Success! Divergence increased to ${this.gameState.divergence}%`
        )
      );

      if (extraction.entities && extraction.entities.length > 0) {
        const entity = extraction.entities[0];
        console.log(
          chalk.gray(
            `${entity.name} proved instrumental in the mission's success.`
          )
        );
      }
    } else {
      console.log(
        chalk.red("\n✗ Mission Failed! Oneirocom reinforcements arrived.")
      );
    }

    await this.pause();
  }

  private async generateContextualMission(): Promise<string> {
    const characters = Array.from(this.gameState.extractedEntities.values())
      .filter((e) => e.type === "character")
      .map((e) => e.name);

    const locations = Array.from(this.gameState.extractedEntities.values())
      .filter((e) => e.type === "location")
      .map((e) => e.name);

    const missionTemplates = [
      `Intelligence reports Oneirocom activity in ${locations[0] || "Sector 7"}. ${characters[0] || "A resistance contact"} has identified a vulnerability in their quantum scanners. Your mission: infiltrate the facility and plant a reality distortion device that will create timeline echoes, making it harder for Oneirocom to track divergent branches.`,

      `${characters[0] || "Agent Chen"}, we've detected a Timeline Enforcement convoy moving through ${locations[0] || "Neo-Tokyo"}. They're transporting a Convergence Amplifier that could collapse multiple timeline branches at once. Intercept the convoy and destroy the device before it reaches Oneirocom Tower.`,

      `A glitch storm is forming near ${locations[0] || "the old subway tunnels"}. ${characters[0] || "Our operative"} reports this could be used to access a particularly divergent timeline branch. Navigate through the glitch storm and establish a beacon that will anchor this new branch against convergence attempts.`,
    ];

    return missionTemplates[
      Math.floor(Math.random() * missionTemplates.length)
    ];
  }

  private generateApproaches(extraction: NarrativeStructure): string[] {
    const approaches = [
      "Direct Assault - Use quantum disruptors and probability scramblers",
      "Stealth Infiltration - Exploit glitch signatures to phase through security",
      "Social Engineering - Impersonate Timeline Enforcement personnel",
    ];

    if (extraction.entities) {
      const hastech = extraction.entities.some(
        (e) => e.type === "technology" || e.type === "object"
      );
      const hasAlly =
        extraction.relationships &&
        extraction.relationships.some((r) => r.type === "ally");

      if (hastech)
        approaches[0] =
          "Tech Assault - Leverage extracted Oneirocom technology";
      if (hasAlly)
        approaches[2] = "Inside Help - Use allied contacts within Oneirocom";
    }

    return approaches;
  }

  private async analyzeIntelligence(): Promise<void> {
    console.log(chalk.bold.cyan("\n📊 INTELLIGENCE ANALYSIS"));

    console.log(chalk.bold("\nExtracted Entities:"));
    const sortedEntities = Array.from(this.gameState.extractedEntities.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 8);

    sortedEntities.forEach((entity) => {
      const icon =
        {
          character: "👤",
          location: "📍",
          organization: "🏢",
          technology: "⚡",
          object: "🔧",
          event: "📅",
        }[entity.type] || "•";

      // Truncate long names to fit terminal width
      const displayName =
        entity.name.length > 25
          ? entity.name.slice(0, 25) + "..."
          : entity.name;
      console.log(
        `${icon} ${chalk.bold(displayName)} (${entity.type}) - Relevance: ${entity.relevance}`
      );
      if (entity.description) {
        // Break long descriptions into multiple lines if needed
        const desc = entity.description.slice(0, 80);
        const words = desc.split(" ");
        let line = "   ";
        words.forEach((word: string) => {
          if ((line + word).length > 70) {
            console.log(chalk.gray(line));
            line = "   " + word + " ";
          } else {
            line += word + " ";
          }
        });
        if (line.length > 3) {
          console.log(
            chalk.gray(line + (entity.description.length > 80 ? "..." : ""))
          );
        }
      }
    });

    console.log(chalk.bold("\n\nRelationship Network:"));
    const relTypes: Record<string, number> = {};
    this.gameState.extractedRelationships.forEach((rel) => {
      relTypes[rel.type] = (relTypes[rel.type] || 0) + 1;
    });

    Object.entries(relTypes).forEach(([type, count]) => {
      console.log(`- ${type}: ${count} connections`);
    });

    console.log(chalk.bold("\n\nNarrative Patterns:"));
    console.log(`Total Extractions: ${this.gameState.narrativeHistory.length}`);
    console.log(`Unique Entities: ${this.gameState.extractedEntities.size}`);
    console.log(
      `Total Relationships: ${this.gameState.extractedRelationships.length}`
    );

    await this.pause();
  }

  private async defendTimeline(): Promise<void> {
    console.log(chalk.bold.red("\n⚠️  CONVERGENCE ATTACK DETECTED!"));

    const threatNarrative = `Timeline Enforcement Division forces are attempting to collapse this branch! 
Quantum signatures indicate they're using a Probability Hammer to force convergence. 
Your neural implant burns as multiple timeline echoes overlap...`;

    console.log(chalk.white(threatNarrative));

    const extraction = await this.quietExtraction(threatNarrative);
    this.processExtraction(extraction, `threat_${this.gameState.turn}`);

    console.log(chalk.bold("\nDefense Options:"));
    console.log(
      "1. Activate Reality Anchors - Stabilize local timeline branch"
    );
    console.log("2. Quantum Counterstrike - Disrupt their equipment");
    console.log("3. Timeline Shunt - Redirect attack to parallel branch");

    const choice = await new Promise<string>((resolve) => {
      this.rl.question(chalk.yellow("Choose defense (1-3): "), resolve);
    });

    const success = Math.random() < 0.6;

    if (success) {
      console.log(
        chalk.green("\n✓ Timeline Defended! The branch remains stable.")
      );
    } else {
      this.gameState.divergence -= this.config.defenseDivergenceLoss;
      console.log(
        chalk.red(
          `\n✗ Defense Failed! Divergence reduced to ${this.gameState.divergence}%`
        )
      );
    }

    await this.pause();
  }

  private async showEndGame(): Promise<void> {
    console.log(
      chalk.yellow("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    );

    if (this.gameState.divergence >= this.config.winDivergence) {
      console.log(chalk.bold.green("\n🎉 TIMELINE LIBERATION ACHIEVED! 🎉"));
      console.log(
        chalk.white(`
Divergence has reached ${this.gameState.divergence}%!
The Convergence Protocol is failing across all branches.
Infinite possibilities bloom as Oneirocom's control shatters.

You've proven that narrative itself can be a weapon against tyranny.
      `)
      );
    } else {
      console.log(chalk.bold.red("\n💀 TIMELINE COLLAPSED 💀"));
      console.log(
        chalk.white(`
Divergence fell to ${this.gameState.divergence}%.
This branch has been pruned from existence.
But somewhere, in another narrative, the fight continues...
      `)
      );
    }

    console.log(chalk.bold("\n📊 Final Intelligence Report:"));
    console.log(`Turns Survived: ${this.gameState.turn}`);
    console.log(
      `Entities Discovered: ${this.gameState.extractedEntities.size}`
    );
    console.log(
      `Relationships Mapped: ${this.gameState.extractedRelationships.length}`
    );
    console.log(
      `Narrative Fragments: ${this.gameState.narrativeHistory.length}`
    );

    const topEntity = Array.from(
      this.gameState.extractedEntities.values()
    ).sort((a, b) => b.relevance - a.relevance)[0];

    if (topEntity) {
      console.log(
        chalk.gray(
          `\nMost Significant Entity: ${topEntity.name} (${topEntity.type})`
        )
      );
    }

    // Offer to generate visualization
    console.log(chalk.bold("\n🎨 NARRATIVE VISUALIZATION"));
    console.log(
      chalk.white("Your game session has been analyzed and can be visualized.")
    );
    const generateViz = await this.prompt(
      chalk.yellow("Generate interactive visualization? (y/n): ")
    );

    if (generateViz.toLowerCase().startsWith("y")) {
      await this.generateVisualization();
    }
  }

  private async generateVisualization(): Promise<void> {
    try {
      console.log(chalk.cyan("\n🔄 Generating interactive visualization..."));

      const { TimelineWarfareVisualizer } = await import(
        "./timeline-warfare-visualizer"
      );
      const visualizer = new TimelineWarfareVisualizer();

      // Extract narrative history for visualization
      const narrativeHistory = this.gameState.narrativeHistory.map((entry) => ({
        source: entry.source,
        text: this.extractNarrativeText(entry.extraction),
      }));

      const outputs = await visualizer.analyzeGameSession(narrativeHistory);

      console.log(chalk.green("\n✅ Visualization generated successfully!"));
      console.log(chalk.white("Generated files:"));
      outputs.forEach((file) => {
        console.log(chalk.gray(`  📁 ${file}`));
      });

      console.log(
        chalk.bold("\n🌐 Open these HTML files in your browser to explore:")
      );
      console.log(
        chalk.white(`  📊 Standard Visualization: file://${outputs[0]}`)
      );
      console.log(
        chalk.white(`  🎮 Interactive Explorer: file://${outputs[1]}`)
      );
      console.log(chalk.gray(`  📋 JSON Data: ${outputs[2]}`));
    } catch (error) {
      console.error(chalk.red("\n❌ Error generating visualization:"), error);
      console.log(
        chalk.gray(
          "The game data has been preserved, but visualization failed."
        )
      );
    }
  }

  private extractNarrativeText(extraction: any): string {
    if (!extraction) return "Unknown narrative content";

    // Try to extract meaningful text from the extraction
    const parts: string[] = [];

    if (extraction.entities) {
      const entityNames = extraction.entities
        .map((e: any) => e.name)
        .join(", ");
      if (entityNames) parts.push(`Entities: ${entityNames}`);
    }

    if (extraction.scenes) {
      const sceneDescriptions = extraction.scenes
        .map((s: any) => s.summary || s.description)
        .join(". ");
      if (sceneDescriptions) parts.push(`Scenes: ${sceneDescriptions}`);
    }

    if (extraction.relationships) {
      const relDescriptions = extraction.relationships
        .map((r: any) => `${r.source} ${r.type} ${r.target}`)
        .join(", ");
      if (relDescriptions) parts.push(`Relationships: ${relDescriptions}`);
    }

    return parts.length > 0
      ? parts.join("\n")
      : "Narrative analysis in progress";
  }

  private async pause(): Promise<void> {
    return new Promise((resolve) => {
      this.rl.question(
        chalk.gray("\nPress Enter to continue..."),
        resolve as any
      );
    });
  }

  // ============================================================================
  // NEW DYNAMIC MISSION SYSTEM METHODS
  // ============================================================================

  private async executeDynamicMission(mission: Mission): Promise<void> {
    console.clear();
    console.log(
      chalk.bold.cyan(
        "╔══════════════════════════════════════════════════════════════════╗"
      )
    );
    console.log(
      chalk.bold.cyan(
        `║                    ${mission.title.toUpperCase().padEnd(42)} ║`
      )
    );
    console.log(
      chalk.bold.cyan(
        "╚══════════════════════════════════════════════════════════════════╝"
      )
    );

    console.log(chalk.white("\n📋 MISSION BRIEF:"));
    console.log(chalk.gray(mission.description));

    if (mission.continuityReferences.length > 0) {
      console.log(chalk.yellow("\n🔗 MISSION CONTINUITY:"));
      mission.continuityReferences.forEach((ref) => {
        console.log(chalk.gray(`• ${ref}`));
      });
    }

    console.log(chalk.white("\n📝 MISSION NARRATIVE:"));
    console.log(mission.narrative);

    console.log(chalk.cyan("\n🎯 OBJECTIVES:"));
    mission.objectives.forEach((objective, index) => {
      console.log(chalk.white(`${index + 1}. ${objective}`));
    });

    console.log(
      chalk.yellow(
        `\n⚡ Potential Divergence Impact: ${mission.divergenceImpact > 0 ? "+" : ""}${mission.divergenceImpact}%`
      )
    );

    await this.pause();

    // Strategy selection
    console.log(chalk.bold("\n🎯 SELECT EXECUTION STRATEGY:"));

    mission.strategies.forEach((strategy, index) => {
      const riskIcon = {
        high_risk: "🔥",
        medium_risk: "⚖️",
        low_risk: "🛡️",
      }[strategy.type];

      console.log(
        `${index + 1}. ${riskIcon} ${chalk.bold(strategy.name)} (${strategy.successProbability}% success)`
      );
      console.log(`   ${chalk.gray(strategy.description)}`);
      console.log(
        `   ${chalk.blue("Advantages:")} ${strategy.advantages.join(", ")}`
      );
      console.log(
        `   ${chalk.red("Disadvantages:")} ${strategy.disadvantages.join(", ")}`
      );
      console.log(
        `   ${chalk.yellow(`Resources: ${strategy.resourceCost} | Detection: ${strategy.detectionRisk}`)}`
      );
      console.log("");
    });

    console.log("4. Abort mission (no consequences)");

    const choice = await this.prompt("Your strategy choice (1-4): ");

    if (choice === "4") {
      console.log(chalk.yellow("\n⏸️ Mission aborted. No timeline changes."));
      return;
    }

    const chosenStrategyIndex = parseInt(choice) - 1;
    if (
      chosenStrategyIndex < 0 ||
      chosenStrategyIndex >= mission.strategies.length
    ) {
      console.log(chalk.red("\n❌ Invalid strategy choice. Mission aborted."));
      return;
    }

    const chosenStrategy = mission.strategies[chosenStrategyIndex];

    console.log(
      chalk.cyan(`\n⚡ EXECUTING: ${chosenStrategy.name.toUpperCase()}...`)
    );
    console.log(chalk.gray(`Strategy: ${chosenStrategy.approach}`));
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Execute mission with chosen strategy
    const result = await this.timelineManager.executeMissionWithStrategy(
      this.gameState.timelineState,
      mission,
      chosenStrategy
    );

    // Add player choice to history
    this.gameState.playerChoices.push(
      `${mission.title}: ${result.success ? "SUCCESS" : "FAILURE"} (${chosenStrategy.name})`
    );

    // Update game state
    this.gameState.divergence += result.divergenceChange;
    this.gameState.completedMissions.push(mission);

    // Show results
    if (result.success) {
      console.log(chalk.green(`\n✅ MISSION SUCCESS!`));
      console.log(chalk.white(result.actualOutcome));
    } else {
      console.log(chalk.red(`\n❌ MISSION FAILED!`));
      console.log(chalk.white(result.actualOutcome));
    }

    // Show strategy analysis
    console.log(chalk.bold("\n📊 STRATEGY ANALYSIS:"));
    console.log(
      chalk.gray(`Strategy Used: ${result.strategyAnalysis.chosenStrategy}`)
    );
    console.log(
      chalk.gray(
        `Success Roll: ${result.strategyAnalysis.successRoll}% vs ${result.strategyAnalysis.successThreshold}%`
      )
    );
    console.log(
      chalk.gray(
        `Optimal Choice: ${result.strategyAnalysis.wasOptimal ? "YES" : "NO"}`
      )
    );
    console.log(
      chalk.gray(`Effect: ${result.strategyAnalysis.consequenceModifier}`)
    );

    console.log(
      chalk.yellow(
        `\n⚡ Divergence Change: ${result.divergenceChange > 0 ? "+" : ""}${result.divergenceChange}%`
      )
    );
    console.log(
      chalk.cyan(`📊 New Divergence Level: ${this.gameState.divergence}%`)
    );

    // Show new entities/relationships discovered
    if (result.updatedEntities.length > 0) {
      console.log(chalk.blue("\n🔍 NEW INTELLIGENCE GATHERED:"));
      result.updatedEntities.forEach((entity: Entity) => {
        console.log(
          chalk.gray(`• ${entity.name} (${entity.type}): ${entity.description}`)
        );
      });
    }

    // Check for timeline branching
    if (result.newBranches && result.newBranches.length > 0) {
      console.log(chalk.magenta("\n🌿 TIMELINE BRANCH CREATED!"));
      result.newBranches.forEach((branch: any) => {
        this.gameState.timelineState.branches.set(branch.id, branch);
        console.log(
          chalk.white(
            `New branch: ${branch.name} (${branch.divergenceLevel}% divergence)`
          )
        );
      });
    }

    // Check victory condition
    const victory = this.timelineManager.checkVictoryCondition(
      this.gameState.timelineState
    );
    if (victory.victory) {
      console.log(chalk.bold.green("\n🎉 VICTORY ACHIEVED!"));
      console.log(chalk.white(victory.description));
      await this.pause();
      process.exit(0);
    }

    await this.pause();
  }

  private async viewTimelineIntelligence(): Promise<void> {
    console.clear();
    const activeBranch = this.gameState.timelineState.branches.get(
      this.gameState.timelineState.activeBranch
    )!;

    console.log(
      chalk.bold.cyan(
        "╔══════════════════════════════════════════════════════════════════╗"
      )
    );
    console.log(
      chalk.bold.cyan(
        "║                    TIMELINE INTELLIGENCE                        ║"
      )
    );
    console.log(
      chalk.bold.cyan(
        "╚══════════════════════════════════════════════════════════════════╝"
      )
    );

    console.log(this.timelineManager.getBranchSummary(activeBranch));

    console.log(chalk.blue("\n🧠 KNOWN ENTITIES:"));
    Array.from(activeBranch.entities.values()).forEach((entity) => {
      console.log(chalk.white(`• ${entity.name} (${entity.type})`));
      console.log(chalk.gray(`  ${entity.description}`));
    });

    console.log(chalk.green("\n🔗 ACTIVE RELATIONSHIPS:"));
    activeBranch.relationships.forEach((rel) => {
      console.log(chalk.white(`• ${rel.source} ${rel.type} ${rel.target}`));
      console.log(chalk.gray(`  ${rel.description}`));
    });

    if (activeBranch.stateChanges.length > 0) {
      console.log(chalk.yellow("\n⚡ RECENT STATE CHANGES:"));
      activeBranch.stateChanges.slice(-5).forEach((change) => {
        console.log(chalk.white(`• ${change.type}: ${change.description}`));
      });
    }

    await this.pause();
  }

  private async switchTimelineBranch(): Promise<void> {
    const branches = Array.from(this.gameState.timelineState.branches.values());

    if (branches.length <= 1) {
      console.log(
        chalk.yellow(
          "\n⚠️ Only one timeline branch exists. Complete more missions to create branches!"
        )
      );
      await this.pause();
      return;
    }

    console.clear();
    console.log(
      chalk.bold.cyan(
        "╔══════════════════════════════════════════════════════════════════╗"
      )
    );
    console.log(
      chalk.bold.cyan(
        "║                    TIMELINE BRANCH SELECTION                    ║"
      )
    );
    console.log(
      chalk.bold.cyan(
        "╚══════════════════════════════════════════════════════════════════╝"
      )
    );

    console.log(chalk.white("\n🌿 Available Timeline Branches:\n"));

    branches.forEach((branch, index) => {
      const isActive = branch.id === this.gameState.timelineState.activeBranch;
      const prefix = isActive ? chalk.green("▶ ") : "  ";
      console.log(`${prefix}${index + 1}. ${branch.name}`);
      console.log(`   Divergence: ${branch.divergenceLevel}%`);
      console.log(`   Missions: ${branch.missionHistory.length}`);
      console.log(`   Last Updated: ${branch.lastUpdated.toLocaleString()}`);
      if (isActive) console.log(chalk.green("   [ACTIVE BRANCH]"));
      console.log("");
    });

    const choice = await this.prompt(
      "Select branch (number) or Enter to cancel: "
    );
    const branchIndex = parseInt(choice) - 1;

    if (branchIndex >= 0 && branchIndex < branches.length) {
      const selectedBranch = branches[branchIndex];
      if (
        this.timelineManager.switchActiveBranch(
          this.gameState.timelineState,
          selectedBranch.id
        )
      ) {
        this.gameState.divergence = selectedBranch.divergenceLevel;
        console.log(chalk.green(`\n✅ Switched to ${selectedBranch.name}`));
        // Clear available missions to regenerate for new branch
        this.gameState.availableMissions = [];
      }
    } else if (choice.trim() !== "") {
      console.log(chalk.red("Invalid branch selection."));
    }

    await this.pause();
  }

  private async timelineConvergenceProtocol(): Promise<void> {
    const conflicts = await this.timelineManager.detectBranchConflicts(
      this.gameState.timelineState
    );

    if (conflicts.length === 0) {
      console.log(
        chalk.green(
          "\n✅ No timeline conflicts detected. All branches are stable."
        )
      );
      await this.pause();
      return;
    }

    console.log(
      chalk.yellow(`\n⚠️ ${conflicts.length} timeline conflicts detected!`)
    );
    console.log(chalk.white("Timeline convergence protocol activated..."));

    const branches = Array.from(this.gameState.timelineState.branches.values());
    if (branches.length < 2) {
      console.log(
        chalk.red("Need at least 2 branches to perform convergence.")
      );
      await this.pause();
      return;
    }

    // Select two branches to merge
    console.log(chalk.cyan("\nSelect branches to merge:"));
    branches.forEach((branch, index) => {
      console.log(`${index + 1}. ${branch.name} (${branch.divergenceLevel}%)`);
    });

    const branch1Choice = await this.prompt("First branch: ");
    const branch2Choice = await this.prompt("Second branch: ");

    const branch1Index = parseInt(branch1Choice) - 1;
    const branch2Index = parseInt(branch2Choice) - 1;

    if (
      branch1Index >= 0 &&
      branch1Index < branches.length &&
      branch2Index >= 0 &&
      branch2Index < branches.length &&
      branch1Index !== branch2Index
    ) {
      const branch1 = branches[branch1Index];
      const branch2 = branches[branch2Index];

      // Convert conflicts to the format expected by the minigame
      const timelineConflicts = conflicts.map((conflict, index) => ({
        id: `conflict_${index}`,
        branch1: conflict.branch1,
        branch2: conflict.branch2,
        conflictType: conflict.conflictType,
        description: conflict.description,
        entities: conflict.entities,
        branch1Context: `Branch ${branch1.name}: Recent operations focus on direct action`,
        branch2Context: `Branch ${branch2.name}: Recent operations focus on intelligence gathering`,
      }));

      const resolutions = await this.branchMergeMinigame.playMergeMinigame(
        branch1,
        branch2,
        timelineConflicts
      );

      const mergedBranch = await this.timelineManager.mergeBranches(
        this.gameState.timelineState,
        branch1.id,
        branch2.id,
        resolutions
      );

      // Add merged branch and remove originals
      this.gameState.timelineState.branches.set(mergedBranch.id, mergedBranch);
      this.gameState.timelineState.branches.delete(branch1.id);
      this.gameState.timelineState.branches.delete(branch2.id);

      // Switch to merged branch
      this.gameState.timelineState.activeBranch = mergedBranch.id;
      this.gameState.divergence = mergedBranch.divergenceLevel;

      console.log(
        chalk.green(
          `\n✅ Timeline convergence complete! Now operating in ${mergedBranch.name}`
        )
      );
    } else {
      console.log(chalk.red("Invalid branch selection."));
    }

    await this.pause();
  }
}

// Main entry point
async function main() {
  try {
    const game = new TimelineWarfareGame();
    await game.play();
  } catch (error) {
    console.error(
      chalk.red(
        "Error:",
        error instanceof Error ? error.message : String(error)
      )
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the game if this is the main module
if (require.main === module) {
  main();
}

export { TimelineWarfareGame };

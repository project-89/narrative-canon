#!/usr/bin/env tsx
/**
 * Aureum Game Design Pipeline v3 — Two-Phase Architecture
 *
 * Phase 1: Design Room — Creative agents produce a Game Design Document (GDD)
 *   Creative Director → Mechanic Designer → (narrative-writer reused for flavor)
 *
 * Phase 2: Implementation Room — DSL Engineer translates GDD → ArgOS DSL
 *   DSL Engineer (with validate_dsl + load_dsl tools)
 *
 * Phase 2.5: Card Art Direction — CardDesigner designs each card with structured metadata
 *
 * Phase 3: Playtesting — Simulator runs games, quality gate decides ship/iterate
 *
 * Usage:
 *   npx tsx src/engine/templates/game-pipeline-v3.ts "a pirate treasure hunt card game"
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { LlmAgent, SequentialAgent, LoopAgent, InMemoryRunner, EXIT_LOOP } from '@google/adk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENAI_API_KEY && !process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.resolve(__dirname, '../../../../microdrama-studio/.env') });
}
if (process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENAI_API_KEY) {
  process.env.GOOGLE_GENAI_API_KEY = process.env.GOOGLE_API_KEY;
}

import { creativeDirectorAgent } from './agents/creative-director';
import { mechanicDesignerAgent } from './agents/mechanic-designer';
import { narrativeWriterAgent } from './agents/narrative-writer';
import { dslEngineerAgent } from './agents/dsl-engineer';
import { cardDesignerAgent } from './agents/card-designer';
import { playtesterAgent } from './agents/playtester';
import { getWorld } from './tools/aureum-adk-tools';
import { AureumNarrativeBridge } from '../../bridge/aureum-narrative-bridge';
import * as fs from 'fs';

// ─── Terminal Colors ─────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};

function log(agent: string, color: string, msg: string): void {
  console.log(`${color}[${agent}]${c.reset} ${msg}`);
}

// ─── Difficulty Presets ───────────────────────────────────────────────────────

interface DifficultyPreset {
  name: string;
  winRate: [number, number];
  gameLength: [number, number];
  description: string;
}

const DIFFICULTY_PRESETS: Record<string, DifficultyPreset> = {
  casual: { name: 'casual', winRate: [70, 90], gameLength: [5, 10], description: 'Relaxing, rewarding — players should feel powerful' },
  balanced: { name: 'balanced', winRate: [40, 60], gameLength: [8, 15], description: 'Standard challenge — tension with reachable wins' },
  hardcore: { name: 'hardcore', winRate: [15, 35], gameLength: [10, 20], description: 'Punishing, roguelike — victories are earned and rare' },
};

function parseDifficulty(args: string[]): DifficultyPreset {
  const idx = args.indexOf('--difficulty');
  if (idx !== -1 && args[idx + 1]) {
    const key = args[idx + 1].toLowerCase();
    if (DIFFICULTY_PRESETS[key]) return DIFFICULTY_PRESETS[key];
    console.warn(`Unknown difficulty "${key}", using balanced`);
  }
  return DIFFICULTY_PRESETS.balanced;
}

// ─── Quality Gate Agent (difficulty-aware) ───────────────────────────────────

function createQualityGateAgent(difficulty: DifficultyPreset) {
  return new LlmAgent({
    name: 'QualityGate',
    model: 'gemini-3-flash-preview',
    description: 'Decides whether to ship or iterate the game design.',
    instruction: `You are the Quality Gate. Review the Playtester's quality report.

## Difficulty Target: ${difficulty.name.toUpperCase()}
- Target win rate: ${difficulty.winRate[0]}-${difficulty.winRate[1]}%
- Target game length: ${difficulty.gameLength[0]}-${difficulty.gameLength[1]} rounds
- Philosophy: ${difficulty.description}

## Decision Rules

**SHIP (call exit_loop):** ALL of these must be true:
- Game validated successfully (no critical issues)
- Simulation ran without 100% timeouts
- At least 1 win and 1 loss occurred in simulation
- Overall quality score >= 6
- Win rate is within ${difficulty.winRate[0]}-${difficulty.winRate[1]}% (the target range)
- Average game length is within ${difficulty.gameLength[0]}-${difficulty.gameLength[1]} rounds

If ALL conditions are met, call the exit_loop tool immediately. Say nothing else.

**ITERATE (do NOT call exit_loop):** If ANY condition above is NOT met:
Return a SHORT paragraph (3-5 sentences) with SPECIFIC, ACTIONABLE balance feedback.
Always cite the actual numbers vs. the targets. Examples:
- "Win rate is 87% but target is ${difficulty.winRate[0]}-${difficulty.winRate[1]}%. Increase enemy damage from 2 to 4, or raise the win threshold."
- "Average game length is 3 rounds but target is ${difficulty.gameLength[0]}-${difficulty.gameLength[1]}. Reduce card damage values by 50%."
- "All games timeout. Win condition uses wrong stat name. Check the tracker stat."

Do NOT call exit_loop when iterating. Just return the feedback text.
The pipeline will automatically loop back to the Design Room with your feedback.`,
    tools: [EXIT_LOOP],
    outputKey: 'quality_feedback',
  });
}

// ─── Pipeline Construction (built per-run with difficulty preset) ────────────

function buildPipeline(difficulty: DifficultyPreset) {
  const designRoom = new SequentialAgent({
    name: 'DesignRoom',
    description: 'Creative agents collaborate to produce a Game Design Document',
    subAgents: [creativeDirectorAgent, mechanicDesignerAgent, narrativeWriterAgent],
  });

  const qualityGateAgent = createQualityGateAgent(difficulty);

  const innerPipeline = new SequentialAgent({
    name: 'InnerPipeline',
    subAgents: [designRoom, dslEngineerAgent, cardDesignerAgent, playtesterAgent, qualityGateAgent],
  });

  return new LoopAgent({
    name: 'GameDesignLoop',
    subAgents: [innerPipeline],
    maxIterations: 3,
  });
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Parse CLI args: prompt is first non-flag arg, --difficulty is optional
  const args = process.argv.slice(2);
  const difficulty = parseDifficulty(args);
  const prompt = args.filter(a => a !== '--difficulty' && !DIFFICULTY_PRESETS[a.toLowerCase()]).join(' ');

  if (!prompt) {
    console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗`);
    console.log(`║    🎲 AUREUM GAME PIPELINE v3 — DSL Edition 🎲   ║`);
    console.log(`╚══════════════════════════════════════════════════╝${c.reset}`);
    console.log('');
    console.log(`${c.bold}Usage:${c.reset}`);
    console.log(`  npx tsx src/engine/templates/game-pipeline-v3.ts "your game description" [--difficulty casual|balanced|hardcore]`);
    console.log('');
    console.log(`${c.bold}Difficulty Presets:${c.reset}`);
    for (const [key, preset] of Object.entries(DIFFICULTY_PRESETS)) {
      console.log(`  ${c.yellow}${key}${c.reset}: win rate ${preset.winRate[0]}-${preset.winRate[1]}%, ${preset.gameLength[0]}-${preset.gameLength[1]} rounds — ${preset.description}`);
    }
    console.log('');
    console.log(`${c.bold}Pipeline:${c.reset}`);
    console.log(`  ${c.cyan}Phase 1: Design Room${c.reset}`);
    console.log(`    ${c.cyan}1. Creative Director${c.reset}  — game vision, theme, GDD draft`);
    console.log(`    ${c.yellow}2. Mechanic Designer${c.reset}  — balance cards, verify math`);
    console.log(`    ${c.magenta}3. Narrative Writer${c.reset}   — flavor text, lore, atmosphere`);
    console.log(`  ${c.green}Phase 2: Implementation${c.reset}`);
    console.log(`    ${c.green}4. DSL Engineer${c.reset}       — translates GDD → ArgOS DSL`);
    console.log(`    ${c.blue}5. Card Designer${c.reset}      — card art direction, flavor, visual beats`);
    console.log(`  ${c.red}Phase 3: Playtesting${c.reset}`);
    console.log(`    ${c.red}6. Playtester${c.reset}         — simulates games, quality report`);
    console.log(`    ${c.bold}7. Quality Gate${c.reset}       — ship or iterate (up to 3x)`);
    console.log('');
    process.exit(0);
  }

  if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error(`${c.red}Missing API key. Run: source ../microdrama-studio/.env${c.reset}`);
    process.exit(1);
  }

  const pipeline = buildPipeline(difficulty);

  console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗`);
  console.log(`║    🎲 AUREUM GAME PIPELINE v3 — DSL Edition 🎲   ║`);
  console.log(`╚══════════════════════════════════════════════════╝${c.reset}`);
  console.log('');
  log('Pipeline', c.cyan, `Starting with prompt: "${prompt}"`);
  log('Pipeline', c.cyan, `Difficulty: ${c.yellow}${difficulty.name.toUpperCase()}${c.reset} (win rate ${difficulty.winRate[0]}-${difficulty.winRate[1]}%, ${difficulty.gameLength[0]}-${difficulty.gameLength[1]} rounds)`);
  console.log('');

  const runner = new InMemoryRunner({
    agent: pipeline,
    appName: 'aureum_game_pipeline_v3',
  });

  const session = await runner.sessionService.createSession({
    appName: 'aureum_game_pipeline_v3',
    userId: 'user',
  });

  log('Pipeline', c.cyan, `Session: ${session.id}`);
  console.log('');

  const stageColors: Record<string, string> = {
    CreativeDirector: c.cyan,
    MechanicDesigner: c.yellow,
    NarrativeWriter: c.magenta,
    DSLEngineer: c.green,
    CardDesigner: c.blue,
    Playtester: c.red,
    QualityGate: c.bold,
  };

  log('Pipeline', c.cyan, 'Running pipeline...');
  console.log('');

  const startTime = Date.now();
  let iteration = 0;
  let lastPhase1Seen = false;

  const difficultyContext = `\n\n[DIFFICULTY: ${difficulty.name} — target win rate ${difficulty.winRate[0]}-${difficulty.winRate[1]}%, target game length ${difficulty.gameLength[0]}-${difficulty.gameLength[1]} rounds. ${difficulty.description}]`;
  const userMessage = {
    role: 'user' as const,
    parts: [{ text: `Design a card game based on this description: "${prompt}"${difficultyContext}` }],
  };

  for await (const event of runner.runAsync({
    userId: 'user',
    sessionId: session.id,
    newMessage: userMessage,
  })) {
    const content = (event as any).content;
    if (!content?.parts) continue;

    const agentName = (event as any).author ?? 'unknown';
    const color = stageColors[agentName] ?? c.dim;
    const text = content.parts.map((p: any) => p.text ?? '').join('');
    if (text.length === 0 || !stageColors[agentName]) continue;

    // Track iterations by watching for CreativeDirector re-appearing
    if (agentName === 'CreativeDirector') {
      if (lastPhase1Seen) {
        iteration++;
        console.log('');
        log('Pipeline', c.cyan, `═══ ITERATION ${iteration + 1} ═══`);
        console.log('');
      }
      lastPhase1Seen = true;
    }

    // Log agent output
    if (agentName === 'CreativeDirector' || agentName === 'MechanicDesigner' || agentName === 'NarrativeWriter') {
      log(agentName, color, `GDD output... (${text.length} chars)`);
      const firstLine = text.split('\n').find((l: string) => l.trim() && !l.startsWith('#'));
      if (firstLine) log(agentName, color, `  → ${firstLine.slice(0, 120)}`);
    } else if (agentName === 'DSLEngineer') {
      log(agentName, color, `DSL output... (${text.length} chars)`);
      const entityCount = (text.match(/^[A-Za-z_]+\./gm) || []).length;
      const ruleCount = (text.match(/^trigger:/gm) || []).length;
      if (entityCount > 0 || ruleCount > 0) {
        log(agentName, color, `  → ~${entityCount} entities, ~${ruleCount} rules in DSL`);
      }
      const preview = text.slice(0, 120).replace(/\n/g, ' ');
      log(agentName, color, `  → ${preview}...`);
    } else if (agentName === 'CardDesigner') {
      log(agentName, color, `🎨 Card designs... (${text.length} chars)`);
      const preview = text.slice(0, 120).replace(/\n/g, ' ');
      log(agentName, color, `  → ${preview}...`);
    } else {
      log(agentName, color, `Output... (${text.length} chars)`);
      const preview = text.slice(0, 120).replace(/\n/g, ' ');
      log(agentName, color, `  → ${preview}...`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  log('Pipeline', c.cyan, `Completed in ${elapsed}s (${iteration + 1} iteration${iteration > 0 ? 's' : ''})`);
  console.log('');

  // Check for saved game files (check both possible save directories)
  const saveDirs = [
    path.resolve(__dirname, '..', '..', 'generated-games'),        // src/generated-games
    path.resolve(__dirname, '..', '..', '..', '..', 'generated-games'), // project root generated-games
  ];
  let latestFile = '';
  let latestMtime = 0;
  for (const dir of saveDirs) {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        const fullPath = path.join(dir, f);
        const mtime = fs.statSync(fullPath).mtimeMs;
        if (mtime > latestMtime) {
          latestMtime = mtime;
          latestFile = fullPath;
        }
      }
    }
  }
  if (latestFile) {
    log('Pipeline', c.cyan, `💾 Latest saved game: ${latestFile}`);
  }

  // ─── Snapshot to NarrativeGit ────────────────────────────────────────────
  const world = getWorld();
  if (world && world.all().length > 0) {
    try {
      const bridge = AureumNarrativeBridge.create({ author: 'game-pipeline' });

      // Derive game name from saved file or prompt
      const gameName = latestFile
        ? path.basename(latestFile, '.json').replace(/[^a-zA-Z0-9_-]/g, '_')
        : prompt.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

      // Card metadata is already applied by CardDesigner agent via design_cards tool
      const designedCards = world.all().filter((e: any) => e.meta?.display_name).length;
      if (designedCards > 0) {
        log('Pipeline', c.green, `🎨 ${designedCards} cards have structured designs from CardDesigner`);
      }

      const commitId = await bridge.snapshotWorld(
        world,
        `Game shipped: ${gameName} (${difficulty.name} difficulty, ${world.all().length} entities)`
      );

      const graphState = bridge.getGit().export();
      console.log('');
      log('Pipeline', c.green, `📊 NarrativeGit: ${world.all().length} entities committed to graph`);
      log('Pipeline', c.green, `   Commit: ${commitId}`);

      // List entity types committed
      const entityTypes = new Map<string, number>();
      for (const e of world.all()) {
        const type = e.tags.has('card') ? 'card'
          : e.tags.has('enemy') ? 'enemy'
          : e.tags.has('player') ? 'player'
          : e.tags.has('game_state') ? 'game'
          : 'other';
        entityTypes.set(type, (entityTypes.get(type) ?? 0) + 1);
      }
      const typeSummary = Array.from(entityTypes.entries())
        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
        .join(', ');
      log('Pipeline', c.green, `   Entities: ${typeSummary}`);

      // Export graph to JSON for inspection
      const graphExportPath = latestFile
        ? latestFile.replace('.json', '.graph.json')
        : path.resolve(__dirname, '..', '..', 'generated-games', `${gameName}.graph.json`);
      fs.writeFileSync(graphExportPath, JSON.stringify(graphState, null, 2));
      log('Pipeline', c.green, `   Graph export: ${graphExportPath}`);
    } catch (err: any) {
      log('Pipeline', c.yellow, `⚠️  Graph commit failed: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
    }
  }

  log('Pipeline', c.cyan, 'Done!');
}

main().catch((err) => {
  console.error(`${c.red}Pipeline error: ${err}${c.reset}`);
  console.error(err.stack);
  process.exit(1);
});

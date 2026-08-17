#!/usr/bin/env tsx
/**
 * Aureum Game Design Pipeline — ADK Multi-Agent Orchestration
 *
 * 6 specialized agents collaborate to design, critique, enrich, and playtest
 * a card game from a single text prompt. If quality is below threshold, the
 * pipeline loops back for refinement (up to 3 iterations).
 *
 * Pipeline:
 *   LoopAgent(
 *     Designer → [UX Writer | Balance Critic | Narrative Writer] → Merge → Playtester
 *   ) × max 3 iterations
 *
 * Usage:
 *   npx tsx src/engine/templates/game-pipeline.ts "a pirate treasure hunt card game"
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { LlmAgent, SequentialAgent, LoopAgent, InMemoryRunner, EXIT_LOOP } from '@google/adk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from narrative-canon or microdrama-studio
dotenv.config();
if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENAI_API_KEY && !process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.resolve(__dirname, '../../../../microdrama-studio/.env') });
}

// ADK expects GOOGLE_GENAI_API_KEY or GEMINI_API_KEY
if (process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENAI_API_KEY) {
  process.env.GOOGLE_GENAI_API_KEY = process.env.GOOGLE_API_KEY;
}
import { designerAgent } from './agents/designer';
import { uxWriterAgent } from './agents/ux-writer';
import { balanceCriticAgent } from './agents/balance-critic';
import { narrativeWriterAgent } from './agents/narrative-writer';
import { playtesterAgent } from './agents/playtester';
import { getCurrentGameJSON, getCurrentGameFile, saveGameTool, loadGameTool } from './tools/aureum-adk-tools';
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

// ─── Merge Agent ─────────────────────────────────────────────────────────────

const mergeAgent = new LlmAgent({
  name: 'GameMerger',
  model: 'gemini-3-flash-preview',
  description: 'Merges UX, balance, and narrative enhancements into a single game.',
  instruction: `You are a game integration specialist. You receive three enhanced versions of a card game
from different specialists and merge them into one unified, complete game.

## Inputs (from state)

1. "ux_enhanced_game" — Game with tutorial text, card explanations, onboarding narrative
2. "balance_report" — Balance analysis with recommended stat changes
3. "narrative_enhanced_game" — Game with rich flavor text, lore, world-building

## Your Job

1. Start with the UX-enhanced game as the base (it has the most complete entity data)
2. Merge in the narrative enhancements (flavor text, lore, ambient text, etc.)
3. Apply the balance critic's recommended stat changes (adjust entity stats as suggested)
4. Ensure no meta fields are lost — every enhancement from every agent should be preserved
5. If there is a "playtest_feedback" state key, incorporate that feedback to fix issues

## Conflict Resolution
- If UX and Narrative both set the same meta field, prefer the richer/longer version
- For stats, always use the Balance Critic's recommendations over the original
- Keep all rule structures exactly as designed — don't modify rule logic

## After Merging

After creating the merged game JSON, call load_game with the merged JSON to load it into the engine.
Then call save_game to persist it to disk. This allows the Playtester to test using useCurrentGame: true
without needing to re-serialize the full JSON.

## Output

Return ONLY the JSON object (no markdown fences, no extra text):
{
  "name": "...",
  "description": "...",
  "entities": [...all entities with merged meta...],
  "rules": [...all rules...],
  "merge_notes": "Summary of what was merged"
}`,
  tools: [loadGameTool, saveGameTool],
  outputKey: 'merged_game',
});

// ─── Quality Gate Agent ──────────────────────────────────────────────────────
// The Playtester has the exit_loop tool — it calls it when quality is high enough

// Override playtester to include the exit_loop tool
const qualityGateAgent = new LlmAgent({
  name: 'QualityGate',
  model: 'gemini-3-flash-preview',
  description: 'Evaluates game quality and decides whether to ship or iterate.',
  instruction: `You are the final quality gate for a card game design pipeline.

## Your Input

Read the Playtester's quality report from state key "quality_report".

## Your Decision

1. If the quality report says "ship" or the overall score is >= 7, call the exit_loop tool to stop iteration.
2. If the quality report says "needs_work" or the score is < 7, write a SHORT feedback message.

## When Iterating

Return ONLY a short text paragraph describing what needs to change. Do NOT reproduce the game JSON.
Focus on concrete issues: "Win rate is 0% because turn progression rules are broken. The game_loop trigger never fires."

## When Shipping

Call the exit_loop tool to stop the pipeline. Say nothing else.

IMPORTANT: You MUST either call exit_loop OR provide short feedback text. Never output game JSON.`,
  tools: [EXIT_LOOP],
  outputKey: 'playtest_feedback',
});

// ─── Pipeline Construction ───────────────────────────────────────────────────

const reviewSequence = new SequentialAgent({
  name: 'ReviewSequence',
  subAgents: [uxWriterAgent, balanceCriticAgent, narrativeWriterAgent],
});

const innerPipeline = new SequentialAgent({
  name: 'InnerPipeline',
  subAgents: [designerAgent, reviewSequence, mergeAgent, playtesterAgent, qualityGateAgent],
});

// Wrap in LoopAgent — iterate up to 3 times
const pipeline = new LoopAgent({
  name: 'GameDesignLoop',
  subAgents: [innerPipeline],
  maxIterations: 3,
});

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const prompt = process.argv[2];

  if (!prompt) {
    console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗`);
    console.log(`║    🎲 AUREUM GAME DESIGN PIPELINE v2 🎲          ║`);
    console.log(`║    Multi-Agent Game Generation via ADK            ║`);
    console.log(`╚══════════════════════════════════════════════════╝${c.reset}`);
    console.log('');
    console.log(`${c.bold}Usage:${c.reset}`);
    console.log(`  npx tsx src/engine/templates/game-pipeline.ts "your game description"`);
    console.log('');
    console.log(`${c.bold}Example:${c.reset}`);
    console.log(`  npx tsx src/engine/templates/game-pipeline.ts "A cyberpunk hacker card game where you infiltrate corporate servers"`);
    console.log('');
    console.log(`${c.bold}Pipeline stages (per iteration):${c.reset}`);
    console.log(`  ${c.cyan}1. Game Designer${c.reset}    — creates entities + rules from your prompt`);
    console.log(`  ${c.green}2. UX Writer${c.reset}        — adds tutorials, card explanations, onboarding`);
    console.log(`  ${c.yellow}3. Balance Critic${c.reset}   — analyzes mechanics, suggests stat fixes`);
    console.log(`  ${c.magenta}4. Narrative Writer${c.reset} — enriches with flavor text, lore, world-building`);
    console.log(`  ${c.blue}5. Merger${c.reset}           — combines all enhancements into one game`);
    console.log(`  ${c.red}6. Playtester${c.reset}       — runs automated playtests, quality report`);
    console.log(`  ⚡ Quality Gate     — decides: ship or iterate (up to 3x)`);
    console.log('');
    process.exit(0);
  }

  if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error(`${c.red}Missing API key. Run: source ../microdrama-studio/.env${c.reset}`);
    process.exit(1);
  }

  console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗`);
  console.log(`║    🎲 AUREUM GAME DESIGN PIPELINE v2 🎲          ║`);
  console.log(`╚══════════════════════════════════════════════════╝${c.reset}`);
  console.log('');
  log('Pipeline', c.cyan, `Starting with prompt: "${prompt}"`);
  log('Pipeline', c.cyan, `Quality gate: iterate up to 3x if score < 7`);
  console.log('');

  // Create runner
  const runner = new InMemoryRunner({
    agent: pipeline,
    appName: 'aureum_game_pipeline',
  });

  // Create session
  const session = await runner.sessionService.createSession({
    appName: 'aureum_game_pipeline',
    userId: 'user',
  });

  log('Pipeline', c.cyan, `Session created: ${session.id}`);
  console.log('');

  // Track agent outputs
  const stageColors: Record<string, string> = {
    GameDesigner: c.cyan,
    UXWriter: c.green,
    BalanceCritic: c.yellow,
    NarrativeWriter: c.magenta,
    GameMerger: c.blue,
    Playtester: c.red,
    QualityGate: c.bold,
  };

  // Run the pipeline — collect ALL text outputs per agent
  log('Pipeline', c.cyan, 'Running pipeline...');
  console.log('');

  const startTime = Date.now();
  let iteration = 0;
  let lastDesignerSeen = false;

  // Collect the longest output from key agents for state extraction
  const agentOutputs: Record<string, string> = {};
  // Also track the best game JSON we see from any agent
  let bestGameJson: any = null;
  let bestGameSource = '';

  const userMessage = {
    role: 'user' as const,
    parts: [{ text: `Design a card game based on this description: "${prompt}"` }],
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

    // Track iteration count by watching for Designer agent re-appearing
    if (agentName === 'GameDesigner') {
      if (lastDesignerSeen) {
        iteration++;
        console.log('');
        log('Pipeline', c.cyan, `═══ ITERATION ${iteration + 1} ═══`);
        console.log('');
      }
      lastDesignerSeen = true;
    }

    // Keep the LONGEST output per agent (not just the latest)
    if (!agentOutputs[agentName] || text.length > agentOutputs[agentName].length) {
      agentOutputs[agentName] = text;
    }

    log(agentName, color, `Producing output... (${text.length} chars)`);

    // Try to parse and log JSON highlights
    const parsed = extractGameJSON(text);
    if (parsed) {
      if (parsed.name) log(agentName, color, `  → Game: "${parsed.name}"`);
      if (parsed.entities?.length) log(agentName, color, `  → ${parsed.entities.length} entities`);
      if (parsed.rules?.length) log(agentName, color, `  → ${parsed.rules.length} rules`);
      if (parsed.quality_report) {
        log(agentName, color, `  → Quality: ${parsed.quality_report.overall_score}/10`);
        log(agentName, color, `  → Verdict: ${parsed.quality_report.verdict}`);
      }
      if (parsed.balance_report) {
        log(agentName, color, `  → Difficulty: ${parsed.balance_report.difficulty}`);
        log(agentName, color, `  → Issues: ${parsed.balance_report.issues?.length ?? 0}`);
      }
      if (parsed.playtest_feedback) {
        log(agentName, color, `  → Feedback: ${parsed.iteration_reason ?? 'iterating...'}`);
      }

      // Track the richest game JSON we find (must have entities or rules)
      if ((parsed.entities?.length || parsed.rules?.length) &&
          ['GameDesigner', 'GameMerger', 'UXWriter'].includes(agentName)) {
        const richness = (parsed.entities?.length ?? 0) + (parsed.rules?.length ?? 0);
        const prevRichness = bestGameJson
          ? (bestGameJson.entities?.length ?? 0) + (bestGameJson.rules?.length ?? 0)
          : 0;
        if (richness >= prevRichness) {
          bestGameJson = parsed;
          bestGameSource = agentName;
        }
      }
    } else {
      const preview = text.slice(0, 120).replace(/\n/g, ' ');
      log(agentName, color, `  → ${preview}...`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  log('Pipeline', c.cyan, `Completed in ${elapsed}s (${iteration + 1} iteration${iteration > 0 ? 's' : ''})`);
  console.log('');

  // ─── State Extraction ────────────────────────────────────────────────────

  // Strategy: Try session state first, then fall back to captured event text
  const finalSession = await runner.sessionService.getSession({
    appName: 'aureum_game_pipeline',
    userId: 'user',
    sessionId: session.id,
  });
  const state = (finalSession as any)?.state ?? {};

  // Try session state, then longest agent text, then bestGameJson, then in-memory game state
  const gameData = extractGameJSON(state['merged_game'])
    ?? extractGameJSON(agentOutputs['GameMerger'])
    ?? extractGameJSON(state['ux_enhanced_game'])
    ?? extractGameJSON(agentOutputs['UXWriter'])
    ?? extractGameJSON(state['raw_game'])
    ?? extractGameJSON(agentOutputs['GameDesigner'])
    ?? bestGameJson
    ?? getCurrentGameJSON();  // In-memory game from load_game/save_game calls

  // Also check if game was saved to disk by save_game tool
  const savedGameFile = getCurrentGameFile();
  if (savedGameFile && !gameData) {
    log('Pipeline', c.dim, `(Game saved to disk at ${savedGameFile})`);
  }

  const reportData = extractGameJSON(state['quality_report'])
    ?? extractGameJSON(agentOutputs['Playtester']);

  if (gameData) {
    // ─── Game Summary ────────────────────────────────────────────────────
    console.log(`${c.bold}═══ GENERATED GAME ═══${c.reset}`);
    console.log(`${c.bold}${gameData.name ?? 'Unnamed Game'}${c.reset}`);
    console.log(`${c.dim}${gameData.description ?? ''}${c.reset}`);
    console.log('');

    // Collect all entities — handle both Aureum (tags array) and nested-card schemas
    const allEntities = gameData.entities ?? [];
    const allRules = gameData.rules ?? [];

    // Find cards: Aureum format (tags includes 'card') or nested format (type === 'deck' with cards[])
    const aureumCards = allEntities.filter((e: any) => e.tags?.includes('card'));
    const nestedCards = allEntities.flatMap((e: any) => e.cards ?? []);
    const cards = aureumCards.length > 0 ? aureumCards : nestedCards;

    const enemies = allEntities.filter((e: any) =>
      e.tags?.includes('enemy') || e.type === 'enemy' || e.id?.includes('ice'));
    const locs = allEntities.filter((e: any) =>
      e.tags?.includes('location') || e.type === 'location' || e.type === 'server');

    console.log(`  ${c.cyan}Entities:${c.reset} ${allEntities.length}`);
    console.log(`  ${c.cyan}Rules:${c.reset} ${allRules.length}`);
    console.log(`  ${c.green}Cards:${c.reset} ${cards.map((x: any) => x.meta?.name ?? x.name ?? x.id).join(', ') || '(embedded)'}`);
    console.log(`  ${c.red}Enemies:${c.reset} ${enemies.map((e: any) => e.meta?.name ?? e.name ?? e.id).join(', ') || '(none)'}`);
    console.log(`  ${c.yellow}Locations:${c.reset} ${locs.map((l: any) => l.meta?.name ?? l.name ?? l.id).join(', ') || '(none)'}`);

    // Count total entities recursively
    const totalItems = allEntities.length + nestedCards.length;
    if (nestedCards.length > 0) {
      console.log(`  ${c.dim}(${nestedCards.length} cards inside deck entities)${c.reset}`);
    }

    // Save to file (use saved file if available, otherwise write here)
    if (savedGameFile && fs.existsSync(savedGameFile)) {
      log('Pipeline', c.cyan, `💾 Game already saved to ${savedGameFile}`);
    } else {
      const slug = (gameData.name ?? 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const outDir = path.resolve(__dirname, '..', '..', 'generated-games');
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `generated-${slug}-${Date.now()}.json`);
      fs.writeFileSync(outPath, JSON.stringify(gameData, null, 2));
      console.log('');
      log('Pipeline', c.cyan, `💾 Saved to ${outPath} (${(JSON.stringify(gameData).length / 1024).toFixed(1)}KB)`);
    }
  } else {
    console.log(`${c.yellow}⚠ Could not extract game JSON from session state or event stream.${c.reset}`);
    console.log(`${c.dim}  Agent outputs captured: ${Object.keys(agentOutputs).join(', ')}${c.reset}`);

    // Dump raw agent outputs for debugging
    const debugPath = `pipeline-debug-${Date.now()}.json`;
    fs.writeFileSync(debugPath, JSON.stringify({
      sessionState: state,
      agentOutputs: Object.fromEntries(
        Object.entries(agentOutputs).map(([k, v]) => [k, v.slice(0, 500)])
      ),
    }, null, 2));
    log('Pipeline', c.yellow, `Debug output saved to ${debugPath}`);
  }

  // ─── Quality Report ────────────────────────────────────────────────────
  if (reportData?.quality_report) {
    const qr = reportData.quality_report;
    console.log('');
    console.log(`${c.bold}═══ QUALITY REPORT ═══${c.reset}`);
    console.log(`  Overall: ${c.bold}${qr.overall_score}/10${c.reset}`);
    console.log(`  Playability: ${qr.playability?.score}/10 — ${qr.playability?.notes ?? ''}`);
    console.log(`  Balance: ${qr.balance?.score}/10 — ${qr.balance?.notes ?? ''}`);
    console.log(`  Completeness: ${qr.completeness?.score}/10 — ${qr.completeness?.notes ?? ''}`);
    console.log(`  Fun Factor: ${qr.fun_factor?.score}/10 — ${qr.fun_factor?.notes ?? ''}`);
    console.log(`  Verdict: ${c.bold}${qr.verdict === 'ship' ? c.green : c.yellow}${qr.verdict}${c.reset}`);

    if (qr.critical_issues?.length > 0) {
      console.log('');
      console.log(`  ${c.red}Critical Issues:${c.reset}`);
      for (const issue of qr.critical_issues) {
        console.log(`    ⚠ ${issue}`);
      }
    }
  }

  console.log('');
  log('Pipeline', c.cyan, 'Done. Load the generated JSON into game-builder.ts to play!');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractGameJSON(value: any): any {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;

  // Try direct JSON parse
  try { return JSON.parse(value); } catch { /* fall through */ }

  // Try extracting from markdown code fences
  const fenceMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
  }

  // Try finding a JSON object in the text (greedy match for outermost braces)
  const braceMatch = value.match(/(\{[\s\S]*\})/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[1]); } catch { /* fall through */ }
  }

  return null;
}

main().catch((err) => {
  console.error(`${c.red}Pipeline error: ${err}${c.reset}`);
  console.error(err.stack);
  process.exit(1);
});

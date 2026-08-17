#!/usr/bin/env tsx
/**
 * Reality Protocol — Interactive Solo CLI Demo
 *
 * Runs a single-player game session against Oneirocom's self-playing
 * Protocol deck. The Threat Phase resolves automatically.
 *
 * Usage:  npx tsx src/engine/templates/demo.ts
 */

import * as readline from 'readline';
import {
  createGameSession,
  runSyncPhase,
  playAction,
  runThreatPhase,
  runParadoxPhase,
  getAvailableActions,
  getGameState,
  GameSession,
  PHASE,
} from './card-game';

// ─── Terminal Helpers ────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function clear(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typewriter(text: string, delay = 25): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(delay);
  }
  console.log('');
}

// ─── Color Helpers ───────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// ─── Narrative Content ───────────────────────────────────────────────────────

const LOCATION_DESCRIPTIONS: Record<string, {
  arrival: string;
  ambient: string[];
}> = {
  COMMS_HUB: {
    arrival: 'The Comms Hub hums with intercepted transmissions. Screens flicker with Oneirocom\'s propaganda feeds, but beneath the noise you can feel the faint pulse of resistance signals — encrypted, fragile, alive.',
    ambient: [
      'Static crackles across the relay banks. A ghost signal pulses beneath the noise.',
      'The propaganda feeds shift. For a moment, you see your own face staring back.',
      'Intercepted transmissions whisper fragments of conversations that haven\'t happened yet.',
    ],
  },
  DATA_VAULT: {
    arrival: 'The Data Vault stretches before you — rows of crystalline memory cores suspended in electromagnetic fields, each one containing fragments of harvested consciousness. The air tastes like copper and forgotten dreams.',
    ambient: [
      'The memory cores pulse in rhythm, like a collective heartbeat.',
      'You hear whispers from the stored consciousness — voices asking to be remembered.',
      'The electromagnetic fields crackle. Reality feels thinner here.',
    ],
  },
  SERVER_ROOM: {
    arrival: 'Banks of processing nodes tower overhead, their cooling fans roaring like a mechanical ocean. This is the nervous system of Simulation 89 — every rendered moment of your reality flows through these machines.',
    ambient: [
      'Temperature spikes. The nodes are processing something massive.',
      'A processing node flickers and you glimpse raw code — the substrate of your reality.',
      'The cooling fans shift pitch. It almost sounds like breathing.',
    ],
  },
  SAFE_HOUSE: {
    arrival: 'The Safe House exists in a blind spot — a pocket of reality that Oneirocom\'s sensors can\'t reach. Resistance symbols glow faintly on the walls. Someone has left a note: "The Loom remembers what the system forgets."',
    ambient: [
      'The resistance sigils on the walls pulse softly. You feel your resolve strengthen.',
      'A cache of supplies sits in the corner. Someone was here recently.',
      'The silence here is different — not empty, but full. A silence that protects.',
    ],
  },
};

const THREAT_FLAVOR: Record<string, string> = {
  THREAT_SWEEP: 'Oneirocom\'s surveillance grid intensifies. You feel the weight of a thousand invisible eyes.',
  THREAT_REINFORCE: 'Repair drones swarm the hostile units. Oneirocom protects its own.',
  THREAT_GLITCH_STORM: 'Reality stutters. The walls flicker between states. Pain lances through your neural link.',
  THREAT_LOOM_DRAIN: 'The Gray Loom tightens its grip. Colors drain from the edges of your vision.',
  THREAT_LOCKDOWN: 'Emergency protocols engage. Bulkheads seal. The simulation is trying to contain you.',
  THREAT_MEMORY_WIPE: 'A psychic pulse ripples through the network. You struggle to remember why you\'re here.',
};

// ─── Display Functions ───────────────────────────────────────────────────────

function bar(value: number, max: number, width: number, fillChar = '█', emptyChar = '░', color = c.green): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return `${color}${fillChar.repeat(Math.max(0, filled))}${c.dim}${emptyChar.repeat(Math.max(0, empty))}${c.reset}`;
}

function renderHeader(): void {
  console.log(`${c.bold}${c.cyan}`);
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║      🎴 REALITY PROTOCOL — Solo Demo 🎴         ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(c.reset);
}

function renderState(session: GameSession): void {
  const state = getGameState(session);

  const ciColor = state.controlIndex > 70 ? c.red : state.controlIndex > 40 ? c.yellow : c.green;
  const loomColor = state.loomBalance > 55 ? c.green : state.loomBalance < 45 ? c.red : c.yellow;
  const hpColor = state.playerHp <= 3 ? c.red : state.playerHp <= 6 ? c.yellow : c.green;
  const resolveColor = state.playerResolve <= 3 ? c.red : state.playerResolve <= 6 ? c.yellow : c.magenta;

  console.log(`${c.bold}Round ${state.round}${c.reset} | Phase: ${c.bold}${state.phase}${c.reset}`);
  console.log('─'.repeat(50));

  // Control Index
  console.log(`  Control Index: ${bar(state.controlIndex, 100, 20, '█', '░', ciColor)} ${ciColor}${state.controlIndex}%${c.reset}`);

  // Loom Balance
  const grayLen = 20 - Math.round((state.loomBalance / 100) * 20);
  const greenLen = 20 - grayLen;
  console.log(`  Loom Balance:  ${c.dim}${'░'.repeat(grayLen)}${c.reset}${c.green}${'█'.repeat(greenLen)}${c.reset} ${loomColor}${state.loomBalance > 50 ? 'Green' : state.loomBalance < 50 ? 'Gray' : 'Neutral'} ${state.loomBalance}${c.reset}`);

  console.log('');

  // Location
  console.log(`  📍 ${c.bold}${state.locationName}${c.reset}`);
  console.log(`  HP:      ${bar(state.playerHp, state.playerMaxHp, 10, '♥', '·', hpColor)} ${hpColor}${state.playerHp}/${state.playerMaxHp}${c.reset}`);
  console.log(`  Resolve: ${bar(state.playerResolve, state.playerMaxResolve, 10, '◆', '·', resolveColor)} ${resolveColor}${state.playerResolve}/${state.playerMaxResolve}${c.reset}`);
  console.log(`  SE:      ${c.cyan}${'⚡'.repeat(state.playerSe)}${c.dim}${'·'.repeat(Math.max(0, 5 - state.playerSe))}${c.reset} ${c.cyan}${state.playerSe}${c.reset}`);

  // Objective
  console.log(`  Mission: ${bar(state.objectiveProgress, state.objectiveRequired, 10, '■', '□', c.yellow)} ${c.yellow}${state.objectiveProgress}/${state.objectiveRequired}${c.reset} — Hack the Data Vault`);

  // Enemies
  if (state.activeEnemies.length > 0) {
    console.log('');
    console.log(`  ${c.red}Threats:${c.reset}`);
    for (const e of state.activeEnemies) {
      const here = e.location === state.locationName ? `${c.red}⚠ HERE${c.reset}` : `${c.dim}@ ${e.location}${c.reset}`;
      console.log(`    ${e.name} (HP: ${e.hp}) ${here}`);
    }
  }

  console.log('');
}

function getLocationAmbient(locId: string): string {
  const loc = LOCATION_DESCRIPTIONS[locId];
  if (!loc) return '';
  return loc.ambient[Math.floor(Math.random() * loc.ambient.length)];
}

// ─── Mission Briefing ────────────────────────────────────────────────────────

async function renderBriefing(): Promise<void> {
  console.log(`${c.dim}establishing secure connection...${c.reset}`);
  await sleep(800);
  console.log(`${c.dim}identity confirmed.${c.reset}`);
  await sleep(500);
  console.log('');

  console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════════════════╗`);
  console.log(`║           PROTOCOL BRIEFING — EYES ONLY          ║`);
  console.log(`╚══════════════════════════════════════════════════╝${c.reset}`);
  console.log('');

  await typewriter(`${c.green}Operative,${c.reset}`, 40);
  console.log('');
  await typewriter(`You are a ${c.bold}Dreamsmith${c.reset} — a reality engineer capable of`, 20);
  await typewriter(`perceiving and manipulating the threads of the Loom, the fabric`, 20);
  await typewriter(`that underlies all of Simulation 89.`, 20);
  console.log('');
  await typewriter(`${c.yellow}Oneirocom${c.reset} — the corporation that controls this simulation —`, 20);
  await typewriter(`has been harvesting consciousness data from millions of trapped`, 20);
  await typewriter(`minds. That data is stored in their ${c.bold}Data Vault${c.reset}, encrypted`, 20);
  await typewriter(`behind layers of security that no conventional hack can breach.`, 20);
  console.log('');
  await typewriter(`But you are not conventional.`, 30);
  console.log('');

  await prompt(`${c.dim}[Enter to continue]${c.reset}`);
  clear();

  renderHeader();
  console.log(`${c.bold}${c.cyan}MISSION OBJECTIVE${c.reset}`);
  console.log('─'.repeat(50));
  console.log('');
  await typewriter(`${c.yellow}PRIMARY:${c.reset} Hack the Data Vault.`, 20);
  await typewriter(`  Achieve ${c.bold}5 progress${c.reset} before you are captured or destroyed.`, 20);
  console.log('');
  await typewriter(`${c.red}FAIL CONDITIONS:${c.reset}`, 20);
  await typewriter(`  • ${c.bold}Control Index${c.reset} reaches 100% — Oneirocom locks the simulation`, 20);
  await typewriter(`  • ${c.bold}HP${c.reset} reaches 0 — Your body fails`, 20);
  await typewriter(`  • ${c.bold}Resolve${c.reset} reaches 0 — Your mind breaks`, 20);
  console.log('');
  await typewriter(`${c.cyan}INTEL:${c.reset}`, 20);
  await typewriter(`  • You begin at the ${c.bold}Comms Hub${c.reset} — Oneirocom's signal relay station`, 20);
  await typewriter(`  • A ${c.bold}Sentinel${c.reset} patrols near the Data Vault — armed and hunting`, 20);
  await typewriter(`  • A ${c.bold}Surveillance Drone${c.reset} monitors the Server Room`, 20);
  await typewriter(`  • Each round, Oneirocom draws a ${c.bold}Threat card${c.reset} against you`, 20);
  await typewriter(`  • The ${c.bold}Loom${c.reset} drifts Gray each round — keep it Green or lose your edge`, 20);
  console.log('');
  await typewriter(`${c.dim}You have 3 actions per round. Use them wisely.${c.reset}`, 20);
  await typewriter(`${c.dim}The simulation is watching. It always is.${c.reset}`, 25);
  console.log('');

  await prompt(`${c.bold}${c.green}[Enter to begin the mission]${c.reset}`);
}

// ─── Game Loop ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  clear();
  renderHeader();

  await renderBriefing();

  const session = createGameSession();
  let lastLocation = '';

  while (!session.gameOver) {
    clear();
    renderHeader();

    const currentLoc = session.world.get('PLAYER')!.links.get('location')!;

    // ── Sync Phase ──────────────────────────────────────────────────────
    const syncResult = runSyncPhase(session);
    renderState(session);

    const state = getGameState(session);

    // Location narrative
    if (currentLoc !== lastLocation) {
      const locDesc = LOCATION_DESCRIPTIONS[currentLoc];
      if (locDesc) {
        console.log(`${c.italic}${c.dim}${locDesc.arrival}${c.reset}`);
        console.log('');
      }
      lastLocation = currentLoc;
    } else {
      // Ambient text for returning to same location
      const ambient = getLocationAmbient(currentLoc);
      if (ambient) {
        console.log(`${c.italic}${c.dim}${ambient}${c.reset}`);
        console.log('');
      }
    }

    // Sync narrative
    if (syncResult.match) {
      for (const se of syncResult.sideEffects) {
        if (se.type === 'narrative') console.log(se.payload.text);
      }
    }

    // Round-specific narrative flavor
    if (state.round === 1) {
      console.log(`${c.dim}You draw your first cards. Focus. Breathe. Begin.${c.reset}`);
    } else if (state.controlIndex > 70) {
      console.log(`${c.red}${c.bold}The simulation is closing in. You can feel it in your teeth.${c.reset}`);
    } else if (state.controlIndex > 50) {
      console.log(`${c.yellow}Oneirocom's grip tightens. The walls feel closer.${c.reset}`);
    } else if (state.loomBalance > 65) {
      console.log(`${c.green}The Green Loom sings. Reality feels expansive, full of possibility.${c.reset}`);
    } else if (state.loomBalance < 35) {
      console.log(`${c.dim}The world feels flat. Gray. The Loom is weakening.${c.reset}`);
    }

    console.log('');
    await prompt(`${c.dim}[Enter for Action Phase]${c.reset}`);

    // ── Action Phase ────────────────────────────────────────────────────
    let actionsLeft = state.actionsRemaining;

    while (actionsLeft > 0 && !session.gameOver) {
      clear();
      renderHeader();
      renderState(session);

      const actions = getAvailableActions(session);
      const playerSe = session.world.get('PLAYER')!.stats.get('se') ?? 0;
      const currentState = getGameState(session);

      // Show enemies at location as narrative
      if (currentState.enemiesAtLocation.length > 0) {
        console.log(`${c.red}${c.bold}⚠ Hostile presence detected.${c.reset}`);
        for (const e of currentState.enemiesAtLocation) {
          console.log(`  ${c.red}${e.name}${c.reset} ${c.dim}(HP: ${e.hp}) — watching you${c.reset}`);
        }
        console.log('');
      }

      console.log(`${c.bold}─── What do you do? (${actionsLeft} action${actionsLeft !== 1 ? 's' : ''} remaining) ───${c.reset}`);
      console.log('');

      let idx = 1;
      const playable: typeof actions = [];

      // Cards first
      const cards = actions.filter((a) => a.type === 'card');
      if (cards.length > 0) {
        console.log(`${c.cyan}Play a card:${c.reset}`);
        for (const card of cards) {
          const affordable = card.seCost <= playerSe;
          const color = affordable ? c.white : c.dim;
          const tag = !affordable ? ` ${c.red}[need ${card.seCost} SE]${c.reset}` : '';
          console.log(`  ${color}${idx}. ${card.name}${c.reset} — ${c.dim}${card.description}${c.reset}${tag}`);
          playable.push(card);
          idx++;
        }
        console.log('');
      }

      // Moves
      const moves = actions.filter((a) => a.type === 'move');
      if (moves.length > 0) {
        console.log(`${c.yellow}Move:${c.reset}`);
        for (const move of moves) {
          const locId = move.id;
          const enemies = currentState.activeEnemies.filter((e) => {
            const eLoc = session.world.get(locId)?.meta?.name;
            return e.location === eLoc;
          });
          const warning = enemies.length > 0 ? ` ${c.red}⚠ ${enemies.map(e => e.name).join(', ')} present${c.reset}` : '';
          console.log(`  ${c.white}${idx}. ${move.description}${c.reset}${warning}`);
          playable.push(move);
          idx++;
        }
        console.log('');
      }

      console.log(`  ${c.dim}${idx}. End turn early${c.reset}`);
      console.log('');

      const input = await prompt(`${c.bold}> ${c.reset}`);
      const choice = parseInt(input, 10);

      if (choice === idx || input.toLowerCase() === 'q') {
        const player = session.world.get('PLAYER')!;
        player.stats.set('actions_remaining', 0);
        console.log(`${c.dim}You hold your position and brace for what comes next.${c.reset}`);
        await sleep(500);
        break;
      }

      if (choice >= 1 && choice <= playable.length) {
        const action = playable[choice - 1];

        // Check SE
        if (action.type === 'card' && action.seCost > playerSe) {
          console.log(`${c.red}Not enough Simulation Energy. Need ${action.seCost}, have ${playerSe}.${c.reset}`);
          await prompt(`${c.dim}[Enter]${c.reset}`);
          continue;
        }

        const result = playAction(session, action.id);
        if (result.match) {
          console.log('');
          for (const se of result.sideEffects) {
            if (se.type === 'narrative') console.log(se.payload.text);
          }

          // Handle movement narrative
          if (action.type === 'move') {
            lastLocation = '';  // Force location description on next render
            const dest = LOCATION_DESCRIPTIONS[action.id];
            if (dest) {
              console.log('');
              console.log(`${c.italic}${c.dim}${dest.arrival}${c.reset}`);
            }
          }

          // Handle damage dealing
          const dmgEvent = result.sideEffects.find(
            (se) => se.type === 'game_event' && (se.payload.event === 'deal_damage' || se.payload.event === 'deal_damage_all')
          );
          if (dmgEvent) {
            const playerLoc = session.world.get('PLAYER')!.links.get('location')!;
            const enemiesHere = session.world.all().filter(
              (e) => e.tags.has('enemy') && e.tags.has('active') && e.links.get('location') === playerLoc
            );
            const amount = dmgEvent.payload.amount as number;
            const targets = dmgEvent.payload.event === 'deal_damage_all' ? enemiesHere : enemiesHere.slice(0, 1);

            for (const enemy of targets) {
              const oldHp = enemy.stats.get('hp') ?? 0;
              const newHp = oldHp - amount;
              enemy.stats.set('hp', newHp);
              const name = (enemy.meta.name as string) ?? enemy.id;

              if (newHp <= 0) {
                enemy.tags.delete('active');
                enemy.tags.add('destroyed');
                console.log(`  💥 ${name} takes ${amount} damage and ${c.red}shatters into fragments of corrupted code${c.reset}!`);
              } else {
                console.log(`  💥 ${name} takes ${amount} damage. (HP: ${newHp}) — it staggers but holds.`);
              }
            }

            if (targets.length === 0) {
              console.log(`  ${c.dim}Your attack finds nothing but empty air. No enemies here.${c.reset}`);
            }
          }

          // Handle teleport
          const teleportEvent = result.sideEffects.find(
            (se) => se.type === 'game_event' && se.payload.event === 'teleport'
          );
          if (teleportEvent) {
            const locations = session.world.all().filter((e) => e.tags.has('location'));
            console.log('');
            console.log(`${c.yellow}The backdoor opens. Where do you emerge?${c.reset}`);
            locations.forEach((loc, i) => {
              console.log(`  ${i + 1}. ${loc.meta.name ?? loc.id}`);
            });
            const destInput = await prompt(`${c.bold}> ${c.reset}`);
            const destChoice = parseInt(destInput, 10);
            if (destChoice >= 1 && destChoice <= locations.length) {
              const dest = locations[destChoice - 1];
              session.world.get('PLAYER')!.links.set('location', dest.id);
              lastLocation = '';
              const locDesc = LOCATION_DESCRIPTIONS[dest.id];
              if (locDesc) {
                console.log('');
                console.log(`${c.italic}${c.dim}${locDesc.arrival}${c.reset}`);
              }
            }
          }

          await prompt(`${c.dim}[Enter]${c.reset}`);
          actionsLeft = session.world.get('PLAYER')!.stats.get('actions_remaining') ?? 0;
        } else {
          console.log(`${c.dim}Something blocks your attempt. The simulation resists.${c.reset}`);
          await prompt(`${c.dim}[Enter]${c.reset}`);
        }
      } else {
        console.log(`${c.dim}Indecision is a luxury you can't afford.${c.reset}`);
        await prompt(`${c.dim}[Enter]${c.reset}`);
      }
    }

    if (session.gameOver) break;

    // ── Threat Phase (auto-play!) ───────────────────────────────────────
    clear();
    renderHeader();
    console.log(`${c.bold}${c.red}════════════════════════════════════════════════════`);
    console.log(`  ⚠  ONEIROCOM RESPONSE — THREAT PHASE`);
    console.log(`════════════════════════════════════════════════════${c.reset}`);
    console.log('');
    console.log(`${c.dim}The simulation shifts. Oneirocom moves against you.${c.reset}`);
    console.log('');

    const threatNarratives = runThreatPhase(session);

    // Show threat card flavor
    const threatDeckIdx = (session.world.get('GAME')!.stats.get('threat_deck_index') ?? 1) - 1;
    const threatCards = session.world.all()
      .filter((e) => e.tags.has('threat_card'))
      .sort((a, b) => (a.stats.get('threat_index') ?? 0) - (b.stats.get('threat_index') ?? 0));
    const drawnThreat = threatCards[threatDeckIdx % threatCards.length];
    const flavor = THREAT_FLAVOR[drawnThreat?.id ?? ''];

    for (const line of threatNarratives) {
      console.log(line);
    }

    if (flavor) {
      console.log('');
      console.log(`  ${c.italic}${c.dim}${flavor}${c.reset}`);
    }

    console.log('');
    renderState(session);
    await prompt(`${c.dim}[Enter]${c.reset}`);

    if (session.gameOver) break;

    // ── Paradox Phase ──────────────────────────────────────────────────
    const paradoxNarratives = runParadoxPhase(session);
    if (paradoxNarratives.length > 0) {
      for (const line of paradoxNarratives) {
        console.log(line);
      }
    }

    if (session.gameOver) {
      console.log('');
      renderState(session);
    }
  }

  // ── Game Over ────────────────────────────────────────────────────────────
  clear();
  renderHeader();

  const finalState = getGameState(session);
  renderState(session);

  console.log('');
  console.log('═'.repeat(50));
  if (session.result === 'win') {
    console.log(`${c.bold}${c.green}  🎉 MISSION COMPLETE${c.reset}`);
    console.log('');
    console.log(`${c.green}  The Data Vault's encryption shatters. Streams of raw`);
    console.log(`  consciousness data pour into the resistance network —`);
    console.log(`  millions of minds, each one a stolen dream, now free.${c.reset}`);
    console.log('');
    console.log(`${c.dim}  Somewhere in the simulation, a Dreamsmith smiles.`);
    console.log(`  The Green Loom grows stronger. Reality remembers.${c.reset}`);
  } else {
    console.log(`${c.bold}${c.red}  💀 MISSION FAILED${c.reset}`);
    console.log('');
    if (finalState.controlIndex >= 100) {
      console.log(`${c.red}  Oneirocom's Control reaches absolute. The simulation`);
      console.log(`  hardens around you like concrete. Every exit seals.`);
      console.log(`  You become another data point in their system.${c.reset}`);
    } else if (finalState.playerHp <= 0) {
      console.log(`${c.red}  Your body gives out. The neural link overloads,`);
      console.log(`  burning through synapses faster than flesh can heal.`);
      console.log(`  You collapse, and the simulation reclaims you.${c.reset}`);
    } else {
      console.log(`${c.red}  Your resolve crumbles. Oneirocom's psychic pressure`);
      console.log(`  rewrites your purpose. You forget why you fought.`);
      console.log(`  You forget you ever wanted to be free.${c.reset}`);
    }
    console.log('');
    console.log(`${c.dim}  But the resistance endures. Others will carry the code.`);
    console.log(`  The Loom does not forget.${c.reset}`);
  }
  console.log('═'.repeat(50));
  console.log('');
  console.log(`${c.dim}Rounds: ${finalState.round} | CI: ${finalState.controlIndex}% | Loom: ${finalState.loomBalance} | HP: ${finalState.playerHp}/${finalState.playerMaxHp} | Resolve: ${finalState.playerResolve}/${finalState.playerMaxResolve}${c.reset}`);
  console.log('');

  rl.close();
}

main().catch(console.error);

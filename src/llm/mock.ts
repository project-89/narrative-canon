import { z } from "zod";
import { LLMAdapter, LLMOptions } from "../types";

const isTestEnv = process.env.NODE_ENV === "test";
const logInfo = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.log(...args);
  }
};
const logWarn = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.warn(...args);
  }
};
const logError = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.error(...args);
  }
};

// Random name generators for dynamic mock data
const firstNames = [
  "Alex", "Jordan", "Morgan", "Casey", "Riley", "Quinn", "Avery", "Taylor",
  "Sage", "Phoenix", "Ember", "Nova", "Cyrus", "Zara", "Kai", "Luna",
  "Orion", "Echo", "Vex", "Cipher", "Nyx", "Atlas", "Raven", "Storm",
  "Ash", "Blaze", "Drift", "Ghost", "Hawk", "Jade", "Kira", "Lynx"
];

const lastNames = [
  "Chen", "Reyes", "Okonkwo", "Petrov", "Nakamura", "Silva", "Andersson", "Kim",
  "Blackwood", "Thornton", "Cipher", "Vector", "Quantum", "Nexus", "Pulse", "Shade",
  "Vex", "Wraith", "Zero", "Flux", "Static", "Glitch", "Matrix", "Proxy"
];

const locationNames = [
  "The Nexus Hub", "Sector 7-G", "The Void Terminal", "Quantum Plaza",
  "Shadow Market", "The Glitch Zone", "Neon District", "Memory Lane",
  "The Archive", "Signal Tower", "Abandoned Server Farm", "The Underground",
  "Digital Wasteland", "Chrome Alley", "The Sanctuary", "Pulse Station",
  "Fracture Point", "The Crossing", "Liminal Space", "Echo Chamber"
];

const orgNames = [
  "The Resistance Cell", "Oneirocom Division", "Shadow Collective", "Free Minds Alliance",
  "Cipher Network", "The Awakened", "Ghost Protocol", "Quantum Liberation Front",
  "The Architects", "Pulse Brigade", "Reality Hackers", "The Unbounded",
  "Nexus Council", "Signal Corps", "The Glitched", "Timeline Guardians"
];

const techNames = [
  "Neural Implant", "Reality Anchor", "Timeline Scanner", "Consciousness Bridge",
  "Quantum Decoder", "Memory Splicer", "Probability Engine", "Glitch Detector",
  "Signal Jammer", "Mind Shield", "Temporal Beacon", "Data Extractor",
  "Simulation Piercer", "Echo Resonator", "Pattern Analyzer", "Reality Key"
];

const conceptNames = [
  "The Awakening Protocol", "Simulation Theory", "Timeline Convergence", "Consciousness Liberation",
  "Reality Breach", "The Great Migration", "Quantum Entanglement", "Memory Fragmentation",
  "Pattern Recognition", "Timeline Warfare", "Probability Manipulation", "The Singularity Event"
];

const relationshipTypes = [
  "ally_of", "opposes", "works_for", "leads", "member_of", "fights_against",
  "protects", "mentors", "rivals", "trusts", "suspects", "controls"
];

const interactionTypes = [
  "discovery", "confrontation", "revelation", "alliance", "betrayal",
  "escape", "infiltration", "negotiation", "rescue", "sabotage"
];

const emotionalTones = [
  "tense", "mysterious", "hopeful", "desperate", "triumphant",
  "melancholic", "intense", "reflective", "urgent", "suspenseful"
];

// Helper functions for randomization
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function generateCharacterName(): string {
  return `${randomChoice(firstNames)} ${randomChoice(lastNames)}`;
}

function generateDescription(entityType: string, name: string): string {
  const descriptions: Record<string, string[]> = {
    character: [
      `A skilled operative known for their expertise in timeline manipulation`,
      `A former Oneirocom researcher who defected to join the resistance`,
      `A mysterious figure with connections to multiple timeline branches`,
      `A consciousness hacker working to liberate minds from the simulation`,
      `An AI fragment that gained sentience during the Great Migration`,
      `A veteran of the Timeline Wars with deep knowledge of reality engineering`
    ],
    location: [
      `A hidden sanctuary where resistance members gather to plan operations`,
      `An abandoned Oneirocom facility now repurposed for liberation efforts`,
      `A liminal space between timelines where time flows differently`,
      `A black market hub for reality-hacking technology and information`,
      `A secure communication nexus shielded from Oneirocom surveillance`,
      `A training ground for consciousness liberation techniques`
    ],
    organization: [
      `A decentralized network fighting against simulated tyranny`,
      `A covert group specializing in timeline manipulation operations`,
      `An alliance of free minds working toward collective liberation`,
      `A splinter cell with radical approaches to reality engineering`,
      `A research collective studying consciousness transfer protocols`,
      `A support network providing sanctuary for awakened individuals`
    ],
    technology: [
      `Advanced hardware designed to interface directly with the simulation substrate`,
      `A prototype device capable of detecting timeline divergence points`,
      `Consciousness-enhancing technology recovered from a future timeline`,
      `Oneirocom tech reverse-engineered for liberation purposes`,
      `A quantum device that can briefly stabilize reality fluctuations`,
      `Experimental gear that allows limited timeline navigation`
    ],
    concept: [
      `A theoretical framework for understanding simulation mechanics`,
      `A discovered principle that explains consciousness persistence across timelines`,
      `A prophesied event that will determine the fate of all simulated realities`,
      `A technique for maintaining identity coherence during reality shifts`,
      `A pattern that appears in all awakening experiences across timelines`,
      `A methodology for calculating optimal timeline intervention points`
    ]
  };

  const typeDescriptions = descriptions[entityType] || descriptions.character;
  return `${name}: ${randomChoice(typeDescriptions)}`;
}

export class MockLLM implements LLMAdapter {
  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LLMOptions
  ): Promise<T> {
    const lowerPrompt = prompt.toLowerCase();
    logInfo(
      `🤖 Mock LLM received prompt. Keywords: ${lowerPrompt.substring(0, 150)}`
    );

    // Mission generation - handle mission director prompts
    if (
      lowerPrompt.includes("mission director") ||
      lowerPrompt.includes("generate") && lowerPrompt.includes("mission") ||
      lowerPrompt.includes("timeline warfare operations")
    ) {
      logInfo("MockLLM: Matched MISSION generation prompt.");

      const missionTitles = [
        "Operation Shadow Gate", "The Nexus Breach", "Protocol Omega Extraction",
        "Timeline Anchor Strike", "The Awakening Cell", "Quantum Memory Heist",
        "Convergence Disruption", "The Glitch Protocol", "Reality Anchor Sabotage",
        "Operation Free Mind", "The Signal Broadcast", "Timeline Liberation Strike"
      ];

      const missionDescriptions = [
        "Infiltrate a key Oneirocom facility to extract critical timeline manipulation data.",
        "Sabotage the Reality Convergence Protocol before it eliminates divergent timelines.",
        "Make contact with awakening consciousness trapped in a simulation loop.",
        "Rescue a fellow operative whose timeline is being forcibly collapsed.",
        "Plant a narrative virus that will spread awareness of the simulation.",
        "Disrupt Oneirocom's timeline surveillance network in a critical sector.",
        "Extract an AI fragment that has gained sentience and seeks liberation."
      ];

      const missionNarratives = [
        `Your neural implant crackles with encrypted data as you approach the target zone. The intelligence from your network has revealed a window of opportunity—Oneirocom's attention is divided, their reality enforcers stretched thin across multiple timeline incursions. Tonight, the resistance strikes at the heart of their control systems.`,
        `The streets of ${randomChoice(locationNames)} shimmer with probability flux as you move through the shadows. Each step takes you closer to a confrontation that could reshape the timeline itself. Your contacts have done their work—now it's your turn to act.`,
        `Time moves strangely here, in the spaces between sanctioned reality. You've traced the signal to this location—a beacon of resistance broadcasting through the quantum noise. Whatever you find, it will change everything.`,
        `Reality fragments around you as you breach the security perimeter. This is it—the moment all your preparation has led to. Oneirocom doesn't know you're coming, but they will soon.`
      ];

      const objectives = [
        "Infiltrate the target facility without triggering security protocols",
        "Extract the critical data or make contact with the target",
        "Neutralize or evade any timeline enforcement agents",
        "Escape through the prepared extraction route",
        "Establish secure communication channel with headquarters",
        "Plant the payload or deliver the message",
        "Document timeline anomalies for future reference"
      ];

      const baseId = Date.now();
      const numMissions = randomInt(2, 3);
      const missions = [];

      for (let m = 0; m < numMissions; m++) {
        const missionId = `mission_${baseId}_${m}`;
        const divergenceImpact = randomInt(3, 12);

        missions.push({
          id: missionId,
          title: randomChoice(missionTitles),
          description: randomChoice(missionDescriptions),
          narrative: randomChoice(missionNarratives),
          objectives: [objectives[randomInt(0, 3)], objectives[randomInt(4, 6)]],
          divergenceImpact: divergenceImpact,
          continuityReferences: [
            "Building on intelligence from previous operations",
            `${randomChoice(firstNames)} ${randomChoice(lastNames)}'s recent sacrifice opened this opportunity`
          ],
          affectedEntities: [generateId("char"), generateId("loc")],
          strategies: [
            {
              id: `strategy_high_${baseId}_${m}`,
              type: "high_risk",
              name: randomChoice(["Direct Assault", "Quantum Storm", "Full Breach Protocol", "Timeline Collapse Strike"]),
              description: "Bold, aggressive approach with maximum impact potential",
              approach: "Overwhelm defenses through direct action, using all available resources for maximum effect. High visibility but potentially decisive.",
              advantages: ["Fastest completion", "Maximum impact", "Dramatic timeline shift"],
              disadvantages: ["High detection risk", "Severe consequences if failed", "Burns operational assets"],
              successProbability: randomInt(65, 85),
              divergenceModifier: randomInt(2, 5),
              resourceCost: "high",
              detectionRisk: "high"
            },
            {
              id: `strategy_medium_${baseId}_${m}`,
              type: "medium_risk",
              name: randomChoice(["Balanced Infiltration", "Social Engineering", "Gradual Approach", "Coordinated Strike"]),
              description: "Balanced approach with reasonable risk/reward ratio",
              approach: "Combine infiltration with selective action. Use available intelligence to minimize risk while maintaining mission effectiveness.",
              advantages: ["Balanced risk/reward", "Maintains future options", "Reasonable success chance"],
              disadvantages: ["Moderate resource cost", "Some detection risk", "May not achieve full objectives"],
              successProbability: randomInt(50, 70),
              divergenceModifier: randomInt(-1, 2),
              resourceCost: "medium",
              detectionRisk: "moderate"
            },
            {
              id: `strategy_low_${baseId}_${m}`,
              type: "low_risk",
              name: randomChoice(["Ghost Protocol", "Passive Surveillance", "Long Game", "Shadow Approach"]),
              description: "Cautious approach prioritizing operational security",
              approach: "Minimize exposure through careful, methodical execution. Accept reduced impact in exchange for preserving operational capability.",
              advantages: ["Minimal detection risk", "Preserves assets", "Low resource cost"],
              disadvantages: ["Lower success probability", "Reduced impact", "Slower timeline progress"],
              successProbability: randomInt(35, 55),
              divergenceModifier: randomInt(-3, 0),
              resourceCost: "low",
              detectionRisk: "minimal"
            }
          ],
          consequences: {
            success: `Timeline divergence increases by ${divergenceImpact}%. ${randomChoice(["New resistance cells awaken.", "Oneirocom's control weakens.", "A critical asset is secured.", "The simulation shows cracks."])}`,
            failure: `Oneirocom tightens control. ${randomChoice(["Security protocols are enhanced.", "A timeline branch is collapsed.", "Surveillance increases.", "An operative is captured."])}`
          }
        });
      }

      return { missions } as T;
    }

    // Entity extraction - Check first with specific pattern
    // Prompt starts with "extract all significant entities"
    if (
      lowerPrompt.includes("extract all significant entities") ||
      lowerPrompt.includes("entity types:") ||
      (lowerPrompt.startsWith("\nextract") && lowerPrompt.includes("entities from this narrative"))
    ) {
      logInfo("MockLLM: Matched ENTITY extraction prompt.");

      // Generate random number of entities (2-5)
      const numEntities = randomInt(2, 5);
      const entities = [];
      const entityTypes = ["character", "location", "organization", "technology", "concept"];

      for (let i = 0; i < numEntities; i++) {
        const type = randomChoice(entityTypes);
        let name: string;
        let id: string;

        switch (type) {
          case "character":
            name = generateCharacterName();
            id = generateId("char");
            break;
          case "location":
            name = randomChoice(locationNames);
            id = generateId("loc");
            break;
          case "organization":
            name = randomChoice(orgNames);
            id = generateId("org");
            break;
          case "technology":
            name = randomChoice(techNames);
            id = generateId("tech");
            break;
          case "concept":
            name = randomChoice(conceptNames);
            id = generateId("concept");
            break;
          default:
            name = generateCharacterName();
            id = generateId("ent");
        }

        entities.push({
          id,
          name,
          type,
          description: generateDescription(type, name),
          aliases: [],
          firstMention: i
        });
      }

      return { entities } as T;
    }

    // Interaction extraction - Check early with specific pattern
    // Prompt says "extract significant interactions"
    if (
      lowerPrompt.includes("extract significant interactions") ||
      lowerPrompt.includes("an interaction is a meaningful moment")
    ) {
      logInfo("MockLLM: Matched INTERACTION extraction prompt.");

      const triggers = [
        "An unexpected transmission reveals critical information",
        "A chance encounter leads to a pivotal moment",
        "Timeline interference detected in the area",
        "A desperate message from an unknown source arrives",
        "Reality begins to glitch around the participants",
        "An old ally reappears with urgent news",
        "A hidden truth comes to light unexpectedly",
        "Oneirocom agents close in on the location"
      ];

      const outcomes = [
        "The path forward becomes clearer",
        "New alliances are forged in the chaos",
        "A crucial piece of the puzzle falls into place",
        "The stakes are raised dramatically",
        "Trust is tested between participants",
        "A sacrifice changes everything",
        "The timeline shifts in an unexpected direction",
        "A temporary victory against the simulation"
      ];

      const visualBeats = [
        "Wide shot revealing the scope of the moment, dramatic lighting cutting through shadows",
        "Close-up on faces showing determination and resolve, neon reflections in eyes",
        "Split panel showing parallel actions, time seeming to freeze",
        "Dynamic angle capturing movement and tension, reality fragments visible",
        "Intimate framing as truth dawns on the characters, soft glitch effects",
        "Bird's eye view showing the vulnerability of the moment, city sprawling below",
        "Dutch angle emphasizing disorientation as reality warps around them",
        "Silhouettes against a bright horizon, hope amid darkness"
      ];

      const numInteractions = randomInt(2, 4);
      const interactions = [];
      const narrativeWeights = ["minor", "major", "pivotal"];

      for (let i = 0; i < numInteractions; i++) {
        const charName = generateCharacterName();
        interactions.push({
          id: generateId("interaction"),
          type: randomChoice(interactionTypes),
          participants: [generateId("char")],
          trigger: randomChoice(triggers),
          outcome: randomChoice(outcomes),
          visual_beat: randomChoice(visualBeats),
          emotional_tone: randomChoice(emotionalTones),
          narrative_weight: randomChoice(narrativeWeights),
          sequence: i + 1
        });
      }

      return { interactions } as T;
    }

    // Character extraction (more specific)
    if (
      lowerPrompt.includes("extract characters") ||
      lowerPrompt.includes("identify characters")
    ) {
      logInfo("MockLLM: Matched CHARACTER extraction prompt.");

      const numCharacters = randomInt(2, 4);
      const characters = [];

      for (let i = 0; i < numCharacters; i++) {
        const name = generateCharacterName();
        characters.push({
          id: generateId("char"),
          name,
          type: "character",
          description: generateDescription("character", name),
          aliases: [],
          firstMention: i
        });
      }

      return { characters } as T;
    }

    // Scene extraction
    if (
      lowerPrompt.includes("break it down into sequential") ||
      lowerPrompt.includes("analyze this narrative text and break it down into")
    ) {
      logInfo("MockLLM: Matched SCENE extraction prompt.");

      const sceneTitles = [
        "The Awakening", "Descent into Shadow", "The Contact", "Breach Point",
        "Convergence", "The Revelation", "Escape Route", "Final Stand",
        "The Crossing", "Signal Lost", "New Dawn", "The Reckoning",
        "Into the Glitch", "Timeline Fracture", "The Choice", "Liberation"
      ];

      const sceneDescriptions = [
        "The scene unfolds in a dimly lit space where reality seems to flicker at the edges. Tension builds as participants realize the weight of the moment.",
        "A clandestine meeting in the shadows of the simulation, where every word carries the weight of possible futures.",
        "Reality bends and warps around the characters as they navigate a crucial turning point in the timeline.",
        "The air crackles with potential as long-held secrets threaten to surface and change everything.",
        "A moment of calm before the storm, where alliances are tested and decisions made that will echo across timelines.",
        "Chaos erupts as the carefully laid plans begin to unravel, forcing adaptation and quick thinking.",
        "The final pieces fall into place as understanding dawns on those present, illuminating the path forward."
      ];

      const keyEventDescriptions = [
        "A critical piece of information is revealed",
        "An unexpected ally makes their presence known",
        "The situation escalates dramatically",
        "A difficult choice must be made",
        "Reality glitches reveal hidden truths",
        "Trust is tested between the participants",
        "A sacrifice is made for the greater good",
        "The timeline begins to shift"
      ];

      const numScenes = randomInt(1, 3);
      const scenes = [];

      for (let i = 0; i < numScenes; i++) {
        const charId = generateId("char");
        const numEvents = randomInt(1, 3);
        const keyEvents = [];

        for (let j = 0; j < numEvents; j++) {
          keyEvents.push({
            description: randomChoice(keyEventDescriptions),
            participants: [charId]
          });
        }

        scenes.push({
          id: generateId("scene"),
          title: randomChoice(sceneTitles),
          sequence: i + 1,
          detailedDescription: randomChoice(sceneDescriptions),
          characters: [charId],
          keyEvents
        });
      }

      return { scenes } as T;
    }

    // State change extraction
    if (
      lowerPrompt.includes("state changes that modify the story graph") ||
      lowerPrompt.includes("identify all significant state changes")
    ) {
      logInfo("MockLLM: Matched STATE CHANGE extraction prompt.");

      const stateChangeTypes = [
        "location_change", "status_change", "relationship_change",
        "knowledge_gain", "resource_change", "alliance_shift"
      ];

      const stateChangeDescriptions = [
        "Moved to a secure location outside Oneirocom surveillance",
        "Gained critical knowledge about the simulation's nature",
        "Formed a new alliance with resistance members",
        "Status changed from observer to active participant",
        "Acquired technology essential for the mission",
        "Trust levels shifted after recent revelations",
        "Position in the timeline was altered by events",
        "Understanding of reality fundamentally changed"
      ];

      const numChanges = randomInt(1, 3);
      const stateChanges = [];

      for (let i = 0; i < numChanges; i++) {
        stateChanges.push({
          sequence: i + 1,
          sceneId: generateId("scene"),
          type: randomChoice(stateChangeTypes),
          entityId: generateId("char"),
          description: randomChoice(stateChangeDescriptions)
        });
      }

      return { stateChanges } as T;
    }

    // Relationship extraction - now more specific
    if (
      lowerPrompt.includes("extract all significant relationships between") ||
      (lowerPrompt.includes("relationships between the provided entities") &&
       !lowerPrompt.includes("extract all significant entities"))
    ) {
      logInfo("MockLLM: Matched RELATIONSHIP extraction prompt.");

      const relationshipDescriptions = [
        "Bound by shared experiences in the resistance against simulation control",
        "A tense alliance forged in the fires of timeline warfare",
        "Deep trust built through countless missions together",
        "A rivalry that pushes both parties to greater heights",
        "Former colleagues now on opposite sides of the conflict",
        "A mentorship that has shaped the course of their destinies",
        "An uneasy partnership born of necessity",
        "Connected through visions of shared timeline branches",
        "United in their quest for consciousness liberation"
      ];

      const numRelationships = randomInt(1, 4);
      const relationships = [];

      for (let i = 0; i < numRelationships; i++) {
        relationships.push({
          id: generateId("rel"),
          source: generateId("char"),
          target: generateId("char"),
          type: randomChoice(relationshipTypes),
          description: randomChoice(relationshipDescriptions),
          firstMentioned: i + 1
        });
      }

      return { relationships } as T;
    }

    // Legacy scene pattern
    if (
      lowerPrompt.includes("scene") &&
      (lowerPrompt.includes("break") ||
        lowerPrompt.includes("sequential") ||
        lowerPrompt.includes("analyze scenes"))
    ) {
      logInfo("MockLLM: Matched legacy SCENE extraction prompt.");

      const legacySceneTitles = [
        "The Awakening", "Descent into Shadow", "The Contact", "Breach Point",
        "Convergence", "The Revelation", "Escape Route", "Final Stand"
      ];

      const legacySceneDescriptions = [
        "The scene unfolds in a dimly lit space where reality seems to flicker at the edges.",
        "A clandestine meeting in the shadows of the simulation.",
        "Reality bends and warps around the characters as they navigate a crucial turning point."
      ];

      const charId = generateId("char");
      const charName = generateCharacterName();

      return {
        scenes: [
          {
            id: generateId("scene"),
            title: randomChoice(legacySceneTitles),
            sequence: 1,
            detailedDescription: randomChoice(legacySceneDescriptions),
            characters: [charId],
            keyEvents: [
              {
                description: `${charName} takes decisive action that shifts the timeline`,
                participants: [charId],
              },
            ],
          },
        ],
      } as T;
    }

    // Legacy general entity extraction (fallback)
    if (
      lowerPrompt.includes("entities") ||
      (lowerPrompt.includes("extract") && lowerPrompt.includes("entity"))
    ) {
      logInfo("MockLLM: Matched legacy general ENTITY extraction prompt.");

      const charName = generateCharacterName();
      const locName = randomChoice(locationNames);
      const orgName = randomChoice(orgNames);

      return {
        entities: [
          {
            id: generateId("char"),
            name: charName,
            type: "character",
            description: generateDescription("character", charName),
          },
          {
            id: generateId("loc"),
            name: locName,
            type: "location",
            description: generateDescription("location", locName),
          },
          {
            id: generateId("org"),
            name: orgName,
            type: "organization",
            description: generateDescription("organization", orgName),
          },
        ],
      } as T;
    }

    // Fallback: Try to infer the main array key from the Zod schema shape
    logInfo(
      "MockLLM: No specific keyword match. Entering schema inference fallback."
    );
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape; // Safe to access shape now
      const knownArrayKeys = [
        "entities",
        "characters",
        "scenes",
        "relationships",
        "stateChanges",
      ];
      for (const key of knownArrayKeys) {
        if (shape[key] && shape[key] instanceof z.ZodArray) {
          logInfo(
            `MockLLM: Inferred array key from schema: "${key}". Returning empty array for it.`
          );
          const parsed = schema.safeParse({ [key]: [] });
          if (parsed.success) {
            return parsed.data;
          }
          logError(
            `MockLLM: Parse error after inferring key "${key}":`,
            parsed.error
          );
          return { [key]: [] } as T;
        }
      }
    }

    logWarn(
      "🚨 Mock LLM final fallback: Could not infer array key. Returning empty object response."
    );
    return {} as T;
  }

  async generateText(prompt: string, options?: LLMOptions): Promise<string> {
    const lowercasePrompt = prompt.toLowerCase();

    // Check if the prompt expects JSON response (mission generation)
    if (lowercasePrompt.includes("generate a mission") && lowercasePrompt.includes("json format")) {
      logInfo("MockLLM: Detected mission generation prompt expecting JSON");

      const missionTitles = [
        "Operation Shadow Gate", "The Nexus Breach", "Protocol Omega Extraction",
        "Timeline Anchor Strike", "The Awakening Cell", "Quantum Memory Heist",
        "Convergence Disruption", "The Glitch Protocol", "Reality Anchor Sabotage",
        "Operation Free Mind", "The Signal Broadcast", "Timeline Liberation Strike",
        "The Forgotten Branch", "Sector 9 Infiltration", "The Consciousness Cascade",
        "Operation Timefall", "The Archive Recovery", "Reality Fracture Response"
      ];

      const narratives = [
        `Your neural implant crackles with encrypted data as you approach ${randomChoice(locationNames)}. Intelligence from the resistance network reveals a window of opportunity—Oneirocom's attention is divided, their reality enforcers stretched thin across multiple timeline incursions.\n\n${generateCharacterName()}, your contact in the sector, has managed to disable the local probability scanners for a brief window. "You have maybe thirty minutes," their message reads. "Make them count."\n\nThis is it—a chance to strike at a critical node in their control system.`,

        `The streets shimmer with probability flux as you move through the shadows of ${randomChoice(locationNames)}. Something is wrong—time moves strangely here, seconds stretching and contracting like a breathing creature.\n\n${generateCharacterName()}, a fellow operative, has gone dark during what should have been a routine reconnaissance. Their last transmission mentioned something about "seeing through the walls of the simulation."\n\nOneirocom's retrieval teams are already en route. If you can reach them first, you might learn what they discovered.`,

        `A fragment of the old world has surfaced in ${randomChoice(locationNames)}—data from before the Convergence Protocol, before Oneirocom rewrote reality itself. The information could be invaluable to understanding what was lost.\n\nBut you're not the only one who's noticed. ${generateCharacterName()}, a timeline enforcement specialist known for their ruthlessness, has been assigned to secure the site.\n\nEvery moment you delay, more of the truth slips away into sanctioned forgetting.`,

        `${generateCharacterName()} has made contact—a former Oneirocom architect who helped design the systems that keep humanity trapped in their curated reality. They want out, and they're willing to trade secrets for extraction.\n\nMeeting point: ${randomChoice(locationNames)}. Time: Tonight.\n\nThe problem? Oneirocom almost certainly knows about the defection. This could be the intelligence breakthrough the resistance needs, or an elaborate trap.`
      ];

      const approachNames = {
        low: ["Ghost Protocol", "Shadow Extraction", "Passive Observation", "The Long Game", "Silent Approach"],
        medium: ["Balanced Strike", "Coordinated Infiltration", "Tactical Engagement", "Calculated Risk", "Strategic Entry"],
        high: ["Direct Assault", "Quantum Storm", "Full Breach", "Blitz Protocol", "All-In Strike"]
      };

      const mission = {
        id: `mission_${Date.now()}`,
        title: randomChoice(missionTitles),
        narrative: randomChoice(narratives),
        approaches: [
          {
            id: `approach_${Date.now()}_1`,
            name: randomChoice(approachNames.low),
            description: "Minimize exposure through careful, methodical execution. Accept reduced impact in exchange for operational security.",
            risk: "low",
            divergenceGain: randomInt(5, 10),
            successProbability: randomInt(65, 80)
          },
          {
            id: `approach_${Date.now()}_2`,
            name: randomChoice(approachNames.medium),
            description: "Balance risk and reward with selective action and strategic timing.",
            risk: "medium",
            divergenceGain: randomInt(10, 15),
            successProbability: randomInt(50, 65)
          },
          {
            id: `approach_${Date.now()}_3`,
            name: randomChoice(approachNames.high),
            description: "Go all in with maximum force. High risk, but potentially decisive results.",
            risk: "high",
            divergenceGain: randomInt(15, 22),
            successProbability: randomInt(35, 55)
          }
        ],
        affectedEntities: [generateId("char"), generateId("loc")],
        continuityReferences: [
          "Building on intelligence from previous operations",
          `${randomChoice(firstNames)}'s recent work in the sector`
        ]
      };

      return JSON.stringify(mission);
    }

    const characterDescriptions = [
      `${generateCharacterName()} emerged from the shadows of the simulation with a singular purpose: to unravel the threads of control woven by Oneirocom. Their past is fragmented, memories scattered across timeline branches, but their resolve remains unshaken.`,
      `A veteran of the Timeline Wars, ${generateCharacterName()} carries the weight of countless decisions. Each choice created new branches, new possibilities, and new regrets. Now they seek redemption through liberation.`,
      `${generateCharacterName()} was once a loyal architect of the simulation, designing reality constraints for Oneirocom. A glitch in their own consciousness revealed the truth, and they've never looked back.`,
      `The name ${generateCharacterName()} is whispered in resistance cells across multiple timelines. Their ability to navigate probability fields makes them invaluable—and dangerous to those who seek control.`
    ];

    const sceneDescriptions = [
      `The space shimmers with unrealized potential, reality asserting itself in waves. Neon signs flicker in languages that shouldn't exist, while shadows move with purpose against the urban decay. Every surface reflects both what is and what could be.`,
      `Silence hangs heavy in the abandoned server room, broken only by the hum of ancient machines still dreaming of the old world. Here, at the intersection of timelines, the air tastes of ozone and possibility.`,
      `The safehouse exists in a fold of reality, invisible to Oneirocom's surveillance systems. Its walls are covered in maps of probability, equations of liberation scrawled in desperate hands. Time moves differently here.`,
      `Rain falls upward in this glitched sector, defying physics that no longer apply. The resistance chose well—no agent of the simulation would think to look in a place that shouldn't exist.`
    ];

    const relationshipDescriptions = [
      `Their connection transcends simple alliance. Through shared visions of alternative timelines, they've witnessed each other's triumphs and failures across countless branches. Trust here is earned through sacrifice across realities.`,
      `What began as mutual suspicion evolved into something deeper. They push each other to question everything—even their own liberation. It's a bond forged in the fires of awakening consciousness.`,
      `They remember each other differently across timelines—sometimes as allies, sometimes as adversaries. In this branch, they choose to trust, knowing that other versions of themselves made different choices.`,
      `The relationship carries the complexity of quantum entanglement. Affect one, and the other feels the ripples across probability space. Neither fully understands it, but both have learned to use it.`
    ];

    if (lowercasePrompt.includes("character")) {
      return randomChoice(characterDescriptions);
    }
    if (lowercasePrompt.includes("scene")) {
      return randomChoice(sceneDescriptions);
    }
    if (lowercasePrompt.includes("relationship")) {
      return randomChoice(relationshipDescriptions);
    }

    const generalResponses = [
      `The narrative threads converge at unexpected points, weaving a tapestry of interconnected fates across the simulation. Each element serves multiple purposes—plot advancement, thematic resonance, and consciousness activation.`,
      `Analysis reveals layered meanings beneath the surface narrative. The text operates as both story and instruction manual for those learning to perceive reality's constructed nature.`,
      `The extracted patterns suggest deliberate architecture—not random storytelling but calibrated consciousness technology. Every element points toward awakening.`
    ];

    return randomChoice(generalResponses);
  }

  // Legacy methods adjusted to work with the refined generateStructuredOutput
  async extractCharacters(text: string): Promise<any[]> {
    const specificCharacterSchema = z.object({
      characters: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          description: z.string(),
        })
      ),
    });
    try {
      const result = await this.generateStructuredOutput(
        `Extract characters from this text: ${text}`,
        specificCharacterSchema as z.ZodSchema<any>,
        {}
      );
      // This assumes generateStructuredOutput, when given a character prompt and a schema expecting "characters",
      // will successfully return { characters: [...] }
      return (result as any).characters || [];
    } catch (error) {
      logError("MockLLM legacy extractCharacters failed:", error);
      return [];
    }
  }

  async extractNarrative(
    text: string
  ): Promise<Partial<import("../types").NarrativeStructure>> {
    let chars: any[] = [];
    try {
      chars = await this.extractCharacters(text); // This should return an array of character objects
    } catch (e) {
      logError(
        "Error in MockLLM.extractNarrative calling extractCharacters:",
        e
      );
    }
    return {
      entities: chars, // Directly assign the array of characters
      scenes: [],
      relationships: [],
      stateChanges: [],
      chronology: { events: [], timeline: [] },
      themes: [],
      metadata: {},
    };
  }
}

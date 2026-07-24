/**
 * Live Visual Generation Test
 *
 * This script tests actual image generation with the Gemini API.
 * Run with: npx ts-node tests/visual/live-visual-test.ts
 *
 * Requires GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable.
 */

import { config } from 'dotenv';
config();

import * as fs from 'fs';
import * as path from 'path';
import {
  ImageGenerator,
  EntityPortraitGenerator,
  PanelGenerator,
  ComicComposer,
  SceneDirector,
  EnhancedPanel,
} from '../src/visual';
import { Entity, Interaction, Scene } from '../src/types';

const OUTPUT_DIR = './test-visual-output';
// Enable SceneDirector for better prompt generation
const USE_SCENE_DIRECTOR = true;

// Test data
const testCharacters: Entity[] = [
  {
    id: 'agent-chen',
    name: 'Agent Chen',
    type: 'character',
    description: 'A determined timeline operative with short black hair, wearing a long dark coat with glowing circuit patterns. Cybernetic eye implant glows blue.',
    traits: ['determined', 'resourceful', 'haunted'],
    appearance: 'East Asian woman in her 30s, athletic build, confident posture',
  },
  {
    id: 'director-voss',
    name: 'Director Voss',
    type: 'character',
    description: 'The cold, calculating head of Oneirocom Timeline Enforcement. Silver hair slicked back, wears an immaculate white suit. Pale, almost artificial skin.',
    traits: ['ruthless', 'calculating', 'elegant'],
    appearance: 'Tall Nordic man in his 50s, piercing grey eyes, aristocratic features',
  },
];

const testLocations: Entity[] = [
  {
    id: 'sector-7',
    name: 'Sector 7 Safehouse',
    type: 'location',
    description: 'A hidden resistance base in the unstable reality zone. Walls flicker with holographic displays showing timeline maps. Neon light filters through rain-streaked windows.',
    atmosphere: 'tense, clandestine, hope amidst despair',
  },
  {
    id: 'oneirocom-tower',
    name: 'Oneirocom Tower',
    type: 'location',
    description: 'A massive spire of black glass and chrome rising above Neo-Tokyo. The Convergence Engine pulses with blue energy at its peak. Symbol of corporate timeline control.',
    atmosphere: 'oppressive, powerful, coldly beautiful',
  },
];

const testScene: Scene = {
  id: 'scene-confrontation',
  title: 'The Final Confrontation',
  sequence: 1,
  location: 'Oneirocom Tower Observation Deck',
  characters: ['Agent Chen', 'Director Voss'],
  description: 'High above Neo-Tokyo, two enemies face each other as reality itself hangs in the balance.',
};

const testInteractions: Interaction[] = [
  {
    id: 'int-dialogue-1',
    type: 'dialogue',
    participants: ['agent-chen', 'director-voss'],
    location: 'oneirocom-tower',
    sceneId: 'scene-confrontation',
    trigger: 'Agent Chen has infiltrated Oneirocom Tower',
    outcome: 'The truth about the Convergence Protocol is revealed',
    key_dialogue: 'You think you can stop the Convergence? We\'ve already won in every timeline that matters.',
    visual_beat: 'Close-up of Director Voss speaking, his face half-lit by holographic displays showing collapsing timelines. Agent Chen visible in reflection behind him.',
    emotional_tone: 'ominous',
    narrative_weight: 'major',
  },
  {
    id: 'int-confrontation-1',
    type: 'confrontation',
    participants: ['agent-chen', 'director-voss'],
    location: 'oneirocom-tower',
    sceneId: 'scene-confrontation',
    trigger: 'Director Voss activates security protocols',
    outcome: 'Reality begins to fracture around them',
    key_dialogue: 'Then I\'ll create a timeline where you never existed!',
    visual_beat: 'Wide shot of the two figures facing off on the observation deck. Lightning crackles between them as reality warps. The city glows beneath them.',
    emotional_tone: 'chaotic',
    narrative_weight: 'pivotal',
  },
  {
    id: 'int-revelation-1',
    type: 'revelation',
    participants: ['agent-chen'],
    location: 'sector-7',
    trigger: 'Agent Chen decrypts the stolen data',
    outcome: 'The horrifying truth: Director Voss was created by the Convergence Protocol itself',
    visual_beat: 'Agent Chen alone in the safehouse, holographic data swirling around her. Her face shows shock and realization. Timeline maps reveal the impossible truth.',
    emotional_tone: 'mysterious',
    narrative_weight: 'pivotal',
  },
  {
    id: 'int-combat-1',
    type: 'combat',
    participants: ['agent-chen', 'director-voss'],
    location: 'oneirocom-tower',
    trigger: 'Timeline Enforcement drones attack',
    outcome: 'Agent Chen fights through to reach the Convergence Engine',
    visual_beat: 'Dynamic action scene - Agent Chen leaping through the air, energy blade drawn, drones exploding around her. Director Voss watches from above.',
    emotional_tone: 'desperate',
    narrative_weight: 'major',
  },
  {
    id: 'int-alliance-1',
    type: 'alliance',
    participants: ['agent-chen'],
    trigger: 'A glitch in the system reveals an unexpected ally',
    outcome: 'The simulation itself begins to help the resistance',
    key_dialogue: 'We are the ghosts of pruned timelines. And we want to exist again.',
    visual_beat: 'Agent Chen surrounded by ghostly figures made of digital artifacts - the consciousness echoes of collapsed timelines reaching out to her.',
    emotional_tone: 'hopeful',
    narrative_weight: 'major',
  },
  {
    id: 'int-climax-1',
    type: 'ritual',
    participants: ['agent-chen'],
    location: 'oneirocom-tower',
    trigger: 'Agent Chen reaches the Convergence Engine',
    outcome: 'The ritual to shatter timeline control begins',
    visual_beat: 'Splash page composition - Agent Chen at the center of the massive Convergence Engine, arms raised, as infinite timeline possibilities explode outward like fractured glass.',
    emotional_tone: 'triumphant',
    narrative_weight: 'pivotal',
  },
];

async function runLiveTest() {
  console.log('🎨 Live Visual Generation Test\n');
  console.log('='.repeat(60));

  // Check for API key
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found!');
    console.error('   Set GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable.');
    process.exit(1);
  }
  console.log('✅ API key found\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Initialize generators
  const portraitGen = new EntityPortraitGenerator({
    apiKey,
    cacheDir: path.join(OUTPUT_DIR, 'portraits'),
  });

  const panelGen = new PanelGenerator({
    apiKey,
    portraitGenerator: portraitGen,
    panelDir: path.join(OUTPUT_DIR, 'panels'),
    useSceneDirector: USE_SCENE_DIRECTOR, // Enable LLM-powered prompt engineering
  });
  panelGen.setEntities([...testCharacters, ...testLocations]);
  panelGen.setScenes([testScene]);

  if (USE_SCENE_DIRECTOR) {
    console.log('🎬 SceneDirector ENABLED - using LLM for prompt enhancement');
  }

  const composer = new ComicComposer({
    apiKey,
    pageDir: path.join(OUTPUT_DIR, 'pages'),
  });

  // Test 1: Character Portraits
  console.log('\n📸 TEST 1: Character Portraits');
  console.log('-'.repeat(40));

  for (const character of testCharacters) {
    try {
      console.log(`   Generating: ${character.name}...`);
      const portrait = await portraitGen.generatePortrait(character);
      console.log(`   ✅ Saved portrait for ${character.name}`);
      console.log(`      Size: ${portrait.portrait.data.length} bytes`);
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Test 2: Location Shots
  console.log('\n🏙️ TEST 2: Location Shots');
  console.log('-'.repeat(40));

  for (const location of testLocations) {
    try {
      console.log(`   Generating: ${location.name}...`);
      const shot = await portraitGen.generateLocationShot(location);
      console.log(`   ✅ Saved location shot for ${location.name}`);
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Test 3: Panels with Dialogue/Narration
  console.log('\n🎬 TEST 3: Panels with Text Overlays');
  console.log('-'.repeat(40));

  const generatedPanels: EnhancedPanel[] = [];

  for (const interaction of testInteractions) {
    try {
      console.log(`   Generating: ${interaction.type} - ${interaction.id}...`);
      const panel = await panelGen.generatePanel(interaction);
      generatedPanels.push(panel);
      console.log(`   ✅ Panel saved`);
      console.log(`      Text overlays: ${panel.textOverlays.length}`);
      panel.textOverlays.forEach(overlay => {
        console.log(`        - ${overlay.type}: "${overlay.text.slice(0, 30)}..."`);
      });
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Test 4: Comic Page Composition (4 panels)
  console.log('\n📖 TEST 4: Comic Page Composition (2x2)');
  console.log('-'.repeat(40));

  if (generatedPanels.length >= 4) {
    try {
      console.log('   Composing 4-panel page...');
      const page = await composer.composePage(generatedPanels.slice(0, 4), {
        pageNumber: 1,
        layout: '2x2',
      });
      console.log(`   ✅ 2x2 page composed`);
      console.log(`      Size: ${page.composedImage.data.length} bytes`);
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  } else {
    console.log('   ⚠️ Not enough panels for 2x2 layout');
  }

  // Test 5: Comic Page Composition (6 panels - testing limits)
  console.log('\n📖 TEST 5: Comic Page Composition (6 panels custom)');
  console.log('-'.repeat(40));

  if (generatedPanels.length >= 6) {
    try {
      console.log('   Composing 6-panel page (custom layout)...');
      const page = await composer.composePage(generatedPanels.slice(0, 6), {
        pageNumber: 2,
        layout: 'custom',
      });
      console.log(`   ✅ 6-panel custom page composed`);
      console.log(`      Size: ${page.composedImage.data.length} bytes`);
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  } else {
    console.log('   ⚠️ Not enough panels for 6-panel layout');
  }

  // Test 6: Splash Page
  console.log('\n📖 TEST 6: Splash Page');
  console.log('-'.repeat(40));

  const pivotalPanel = generatedPanels.find(p => p.layoutHint === 'full');
  if (pivotalPanel) {
    try {
      console.log('   Creating splash page from pivotal panel...');
      const splash = await composer.createSplashPage(pivotalPanel, 3, 'The Convergence Shatters');
      console.log(`   ✅ Splash page created`);
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`   Output directory: ${OUTPUT_DIR}`);
  console.log(`   Portraits generated: ${testCharacters.length + testLocations.length}`);
  console.log(`   Panels generated: ${generatedPanels.length}`);
  console.log(`   Pages composed: 2-3`);
  console.log('\n   Check the output directory to verify image quality!');
  console.log('   Look for:');
  console.log('   - Character consistency across panels');
  console.log('   - Readable dialogue bubbles and narration');
  console.log('   - Proper panel composition in pages');
  console.log('   - Emotional tone matching visual style');
}

// Run the test
runLiveTest().catch(console.error);

/**
 * Unit tests for Visual Generation Pipeline
 */

import {
  ImageGenerator,
  EntityPortraitGenerator,
  PanelGenerator,
  ComicComposer,
  TextOverlay,
  EnhancedPanel,
  VisualStyle,
  DEFAULT_STYLE,
  DEFAULT_CONFIG,
  Panel,
} from '../../src/visual';
import { Entity, Interaction, Scene } from '../../src/types';

// Mock the GoogleGenAI module
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn().mockResolvedValue({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: Buffer.from('fake-image-data').toString('base64'),
                mimeType: 'image/png',
              }
            }]
          }
        }]
      })
    }
  }))
}));

// Mock fs to avoid actual file operations
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('fake-image-data')),
  readdirSync: jest.fn().mockReturnValue([]),
  statSync: jest.fn().mockReturnValue({ mtime: new Date() }),
}));

describe('Visual Generation Pipeline', () => {
  const mockApiKey = 'test-api-key';

  describe('ImageGenerator', () => {
    let imageGen: ImageGenerator;

    beforeEach(() => {
      imageGen = new ImageGenerator({
        apiKey: mockApiKey,
        outputDir: './test-output',
      });
    });

    it('should initialize with default config', () => {
      expect(imageGen).toBeDefined();
      expect(imageGen.getStyle()).toEqual(DEFAULT_STYLE);
    });

    it('should generate an image from prompt', async () => {
      const result = await imageGen.generateImage('A cyberpunk city at night');

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.mimeType).toBe('image/png');
      expect(result.prompt).toContain('cyberpunk');
    });

    it('should apply visual style to prompts', () => {
      imageGen.setStyle({
        style: 'anime',
        lighting: 'vibrant',
      });

      const style = imageGen.getStyle();
      expect(style.style).toBe('anime');
      expect(style.lighting).toBe('vibrant');
    });

    it('should track reference count', async () => {
      const refs = [
        { id: 'ref1', data: Buffer.from('ref1'), mimeType: 'image/png', description: 'Character 1' },
        { id: 'ref2', data: Buffer.from('ref2'), mimeType: 'image/png', description: 'Character 2' },
      ];

      const result = await imageGen.generateImage('A scene', refs);
      expect(result.referenceCount).toBe(2);
    });
  });

  describe('EntityPortraitGenerator', () => {
    let portraitGen: EntityPortraitGenerator;

    beforeEach(() => {
      portraitGen = new EntityPortraitGenerator({
        apiKey: mockApiKey,
        cacheDir: './test-portraits',
      });
    });

    it('should generate character portrait', async () => {
      const character: Entity = {
        id: 'char-1',
        name: 'Agent Chen',
        type: 'character',
        description: 'A timeline operative with cybernetic implants',
        traits: ['determined', 'resourceful'],
      };

      const portrait = await portraitGen.generatePortrait(character);

      expect(portrait).toBeDefined();
      expect(portrait.entityId).toBe('char-1');
      expect(portrait.entityName).toBe('Agent Chen');
      expect(portrait.portrait.data).toBeInstanceOf(Buffer);
    });

    it('should generate organization logo', async () => {
      const org: Entity = {
        id: 'org-1',
        name: 'Project 89',
        type: 'organization',
        description: 'Underground resistance movement',
        ideology: 'Timeline liberation',
      };

      const portrait = await portraitGen.generatePortrait(org);

      expect(portrait).toBeDefined();
      expect(portrait.entityType).toBe('organization');
    });

    it('should generate location shot', async () => {
      const location: Entity = {
        id: 'loc-1',
        name: 'Neo-Tokyo Sector 7',
        type: 'location',
        description: 'A district with unstable reality fields',
        atmosphere: 'neon-lit and mysterious',
      };

      const shot = await portraitGen.generateLocationShot(location);

      expect(shot).toBeDefined();
      expect(shot.locationName).toBe('Neo-Tokyo Sector 7');
    });

    it('should cache portraits for reuse', async () => {
      const character: Entity = {
        id: 'char-cache',
        name: 'Cached Character',
        type: 'character',
      };

      // First generation
      await portraitGen.generatePortrait(character);

      // Get as reference (should use cache)
      const ref = portraitGen.getAsReference('char-cache');

      expect(ref).toBeDefined();
      expect(ref?.id).toBe('char-cache');
    });
  });

  describe('PanelGenerator', () => {
    let panelGen: PanelGenerator;

    beforeEach(() => {
      panelGen = new PanelGenerator({
        apiKey: mockApiKey,
        panelDir: './test-panels',
      });
    });

    it('should generate panel from interaction', async () => {
      const interaction: Interaction = {
        id: 'int-1',
        type: 'confrontation',
        participants: ['char-1', 'char-2'],
        trigger: 'Discovery of betrayal',
        outcome: 'Alliance shattered',
        visual_beat: 'Two figures face off in a rain-soaked alley, neon signs reflecting in puddles',
        emotional_tone: 'tense',
        narrative_weight: 'major',
      };

      const panel = await panelGen.generatePanel(interaction);

      expect(panel).toBeDefined();
      expect(panel.interactionId).toBe('int-1');
      expect(panel.visualBeat).toContain('rain-soaked');
    });

    it('should build text overlays for dialogue', async () => {
      const interaction: Interaction = {
        id: 'int-dialogue',
        type: 'dialogue',
        participants: ['char-1'],
        trigger: 'Secret revealed',
        outcome: 'Truth exposed',
        key_dialogue: 'The simulation was never meant to be escaped.',
        visual_beat: 'Close-up of character speaking',
        emotional_tone: 'mysterious',
        narrative_weight: 'pivotal',
      };

      const panel = await panelGen.generatePanel(interaction) as EnhancedPanel;

      expect(panel.textOverlays).toBeDefined();
      expect(panel.textOverlays.length).toBeGreaterThan(0);

      const speechBubble = panel.textOverlays.find(o => o.type === 'speech');
      expect(speechBubble).toBeDefined();
      expect(speechBubble?.text).toContain('simulation');
    });

    it('should build narration for revelation interactions', async () => {
      const interaction: Interaction = {
        id: 'int-revelation',
        type: 'revelation',
        participants: ['char-1', 'char-2'],
        trigger: 'Document uncovered',
        outcome: 'The truth about Oneirocom\'s origins is revealed',
        visual_beat: 'Characters examining holographic documents',
        emotional_tone: 'mysterious',
        narrative_weight: 'major',
      };

      const panel = await panelGen.generatePanel(interaction) as EnhancedPanel;

      const narration = panel.textOverlays.find(o => o.type === 'narration');
      expect(narration).toBeDefined();
    });

    it('should add SFX for combat interactions', async () => {
      const interaction: Interaction = {
        id: 'int-combat',
        type: 'combat',
        participants: ['char-1', 'char-2'],
        trigger: 'Ambush',
        outcome: 'Escape successful',
        visual_beat: 'Dynamic action scene with energy weapons',
        emotional_tone: 'chaotic',
        narrative_weight: 'major',
      };

      const panel = await panelGen.generatePanel(interaction) as EnhancedPanel;

      const sfx = panel.textOverlays.find(o => o.type === 'sfx');
      expect(sfx).toBeDefined();
      expect(sfx?.text).toBe('CRASH!'); // chaotic combat
    });

    it('should use scene context when available', async () => {
      const scene: Scene = {
        id: 'scene-1',
        title: 'The Confrontation',
        sequence: 1,
        location: 'Oneirocom Tower',
        characters: ['Agent Chen', 'Director Voss'],
        description: 'The final showdown at the top of the tower',
      };

      panelGen.setScenes([scene]);

      const interaction: Interaction = {
        id: 'int-scene',
        type: 'confrontation',
        participants: ['char-1', 'char-2'],
        sceneId: 'scene-1',
        trigger: 'Meeting',
        outcome: 'Standoff',
        visual_beat: 'Two figures on observation deck',
        emotional_tone: 'tense',
        narrative_weight: 'pivotal',
      };

      const panel = await panelGen.generatePanel(interaction) as EnhancedPanel;

      expect(panel.sceneContext).toBeDefined();
      expect(panel.sceneContext).toContain('The Confrontation');
      expect(panel.sceneContext).toContain('Oneirocom Tower');
    });

    it('should determine layout hints based on narrative weight', async () => {
      const pivotalInteraction: Interaction = {
        id: 'int-pivotal',
        type: 'revelation',
        participants: ['char-1'],
        trigger: 'Discovery',
        outcome: 'Everything changes',
        visual_beat: 'Dramatic reveal',
        emotional_tone: 'triumphant',
        narrative_weight: 'pivotal',
      };

      const panel = await panelGen.generatePanel(pivotalInteraction);
      expect(panel.layoutHint).toBe('full');
    });
  });

  describe('ComicComposer', () => {
    let composer: ComicComposer;

    beforeEach(() => {
      composer = new ComicComposer({
        apiKey: mockApiKey,
        pageDir: './test-pages',
      });
    });

    it('should compose page from panels', async () => {
      const mockPanels: Panel[] = [
        {
          interactionId: 'int-1',
          image: {
            data: Buffer.from('panel1'),
            mimeType: 'image/png',
            prompt: 'test',
            referenceCount: 0,
            generatedAt: new Date(),
            model: 'test',
          },
          characterRefs: ['char-1'],
          visualBeat: 'Panel 1 visual',
        },
        {
          interactionId: 'int-2',
          image: {
            data: Buffer.from('panel2'),
            mimeType: 'image/png',
            prompt: 'test',
            referenceCount: 0,
            generatedAt: new Date(),
            model: 'test',
          },
          characterRefs: ['char-2'],
          visualBeat: 'Panel 2 visual',
        },
      ];

      const page = await composer.composePage(mockPanels, {
        pageNumber: 1,
        layout: '2x2',
      });

      expect(page).toBeDefined();
      expect(page.pageNumber).toBe(1);
      expect(page.layout).toBe('2x2');
      expect(page.panels.length).toBe(2);
    });

    it('should provide layout information', () => {
      const info2x2 = composer.getLayoutInfo('2x2');
      expect(info2x2.panelCount).toBe(4);

      const infoSplash = composer.getLayoutInfo('splash');
      expect(infoSplash.panelCount).toBe(1);

      const infoManga = composer.getLayoutInfo('manga-5');
      expect(infoManga.panelCount).toBe(5);
    });
  });

  describe('TextOverlay System', () => {
    it('should create speech bubbles with speaker attribution', () => {
      const overlay: TextOverlay = {
        type: 'speech',
        text: 'The timeline is fracturing!',
        speaker: 'Agent Chen',
        position: 'top-right',
      };

      expect(overlay.type).toBe('speech');
      expect(overlay.speaker).toBe('Agent Chen');
    });

    it('should create thought bubbles', () => {
      const overlay: TextOverlay = {
        type: 'thought',
        text: 'Something feels wrong about this reality...',
        position: 'top-left',
      };

      expect(overlay.type).toBe('thought');
    });

    it('should create narration boxes', () => {
      const overlay: TextOverlay = {
        type: 'narration',
        text: 'The year is 2089. Reality is no longer what it seems.',
        position: 'top',
      };

      expect(overlay.type).toBe('narration');
    });

    it('should create caption boxes', () => {
      const overlay: TextOverlay = {
        type: 'caption',
        text: 'Neo-Tokyo, Sector 7',
        position: 'bottom',
      };

      expect(overlay.type).toBe('caption');
    });

    it('should create SFX overlays', () => {
      const overlay: TextOverlay = {
        type: 'sfx',
        text: 'KRAKOOM!',
        position: 'center',
      };

      expect(overlay.type).toBe('sfx');
    });
  });

  describe('Visual Style Configuration', () => {
    it('should have correct default style', () => {
      expect(DEFAULT_STYLE.style).toBe('manga');
      expect(DEFAULT_STYLE.coloring).toBe('full-color');
      expect(DEFAULT_STYLE.linework).toBe('clean');
      expect(DEFAULT_STYLE.lighting).toBe('dramatic');
    });

    it('should allow partial style updates', () => {
      const imageGen = new ImageGenerator({
        apiKey: mockApiKey,
      });

      imageGen.setStyle({ style: 'western-comic' });

      const style = imageGen.getStyle();
      expect(style.style).toBe('western-comic');
      expect(style.coloring).toBe('full-color'); // Should retain default
    });
  });
});

/**
 * Unit tests for Visual Generation Pipeline
 */

import {
  ImageGenerator,
  EntityPortraitGenerator,
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

  describe('Visual Style Configuration', () => {
    it('should have correct default style', () => {
      // Asserted 'manga'/'clean'/'dramatic' until 2026-07; DEFAULT_STYLE moved
      // to a realistic base and the test was never updated, so this was the one
      // genuinely-broken test of live studio code.
      expect(DEFAULT_STYLE.style).toBe('realistic');
      expect(DEFAULT_STYLE.coloring).toBe('full-color');
      expect(DEFAULT_STYLE.linework).toBe('minimal');
      expect(DEFAULT_STYLE.lighting).toBe('natural');
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

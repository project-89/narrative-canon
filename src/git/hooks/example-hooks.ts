/**
 * Example Reality Hooks for Project 89
 * 
 * These demonstrate how hooks can generate assets, enrich lore,
 * and manifest the narrative in multiple dimensions.
 */

import {
  RealityHook,
  HookContext,
  HookResult,
  ImageGenerationRequest,
  GeneratedAsset
} from './types';
import { Entity } from '../../types';
import { UpdateEntityOperation } from '../types';

/**
 * Character Portrait Generation Hook
 * Generates visual representations when characters are added or their appearance changes
 */
export const characterPortraitHook: RealityHook = {
  id: 'char-portrait-generator',
  name: 'Character Portrait Generator',
  description: 'Generates portraits for new characters using AI image generation',
  triggers: [
    {
      type: 'ENTITY_ADDED',
      entityType: 'character'
    },
    {
      type: 'ENTITY_UPDATED',
      entityType: 'character',
      fields: ['appearance', 'description']
    }
  ],
  priority: 100,
  canMutate: true,
  timeout: 30000,

  async execute(context: HookContext): Promise<HookResult> {
    if (!context.entity || !context.services.imageGenerator) {
      return { processed: false };
    }

    const character = context.entity;
    const consciousnessLevel = character.properties?.consciousnessLevel || 'npc';

    try {
      // Build portrait prompt from character data
      const prompt = buildCharacterPrompt(character);
      
      // Generate portrait with Project 89 aesthetic
      const portrait = await context.services.imageGenerator.generate({
        prompt,
        negativePrompt: 'cartoon, anime, low quality, blurry',
        style: 'project-89-noir',
        artisticStyle: 'noir',
        lighting: 'dramatic',
        consciousnessLevel: consciousnessLevel as any,
        width: 768,
        height: 1024
      });

      // Create mutation to store portrait reference
      const updateOp: UpdateEntityOperation = {
        id: `hook_${context.commit.id}_portrait`,
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: character.id,
          changes: {
            metadata: {
              ...character.metadata,
              portrait: portrait.url,
              portraitGeneratedAt: portrait.generatedAt,
              portraitPrompt: portrait.prompt
            }
          }
        }
      };

      return {
        processed: true,
        mutations: [updateOp],
        artifacts: [portrait]
      };

    } catch (error) {
      return {
        processed: false,
        error: error as Error
      };
    }
  }
};

/**
 * Scene Storyboard Generation Hook
 * Creates visual storyboards when scenes are completed
 */
export const sceneStoryboardHook: RealityHook = {
  id: 'scene-storyboard-generator',
  name: 'Scene Storyboard Generator',
  description: 'Generates storyboard panels for completed scenes',
  triggers: [
    {
      type: 'SCENE_COMPLETED'
    },
    {
      type: 'CANONICAL_STATE_REACHED'
    }
  ],
  priority: 80,
  canMutate: false,
  timeout: 60000,

  async execute(context: HookContext): Promise<HookResult> {
    if (!context.scene || !context.services.imageGenerator) {
      return { processed: false };
    }

    const scene = context.scene;
    const participants = gatherSceneParticipants(context);

    try {
      // Break scene into key moments
      const keyMoments = extractKeyMoments(scene);
      
      // Generate storyboard panels
      const panels: GeneratedAsset[] = [];
      
      for (const moment of keyMoments) {
        const panel = await context.services.imageGenerator.generate({
          prompt: `Storyboard panel: ${moment.description}. Characters: ${participants.map(p => p.name).join(', ')}. Style: noir comic book, high contrast, dramatic shadows.`,
          style: 'storyboard',
          artisticStyle: 'noir',
          width: 1920,
          height: 1080
        });
        
        panels.push(panel);
      }

      // If layout generator available, create comic page
      if (context.services.layoutGenerator && panels.length > 1) {
        const comicPage = await context.services.layoutGenerator.createComicPage(
          panels,
          'dynamic-grid'
        );
        panels.push(comicPage);
      }

      return {
        processed: true,
        artifacts: panels
      };

    } catch (error) {
      return {
        processed: false,
        error: error as Error
      };
    }
  }
};

/**
 * Lore Enrichment Hook
 * Expands backstory and connections when entities are added
 */
export const loreEnrichmentHook: RealityHook = {
  id: 'lore-enricher',
  name: 'Deep Lore Generator',
  description: 'Enriches entity backstories and generates timeline connections',
  triggers: [
    {
      type: 'ENTITY_ADDED'
    },
    {
      type: 'RELATIONSHIP_FORMED'
    }
  ],
  priority: 50,
  canMutate: true,
  timeout: 45000,

  async execute(context: HookContext): Promise<HookResult> {
    if (!context.entity || !context.services.loreEnricher) {
      return { processed: false };
    }

    try {
      // Expand entity lore
      const expandedLore = await context.services.loreEnricher.expand(context.entity, {
        depth: 'deep',
        consistency: 'strict',
        includeAlternateTimelines: true,
        focusAreas: ['history', 'motivation', 'relationships', 'secrets']
      });

      // Update entity with enriched lore
      const updateOp: UpdateEntityOperation = {
        id: `hook_${context.commit.id}_lore`,
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: context.entity.id,
          changes: {
            description: expandedLore.backstory,
            metadata: {
              ...context.entity.metadata,
              timeline: expandedLore.timeline,
              secrets: expandedLore.secrets,
              alternateVersions: expandedLore.alternateVersions,
              loreEnrichedAt: Date.now()
            }
          }
        }
      };

      // Create lore document as artifact
      const loreDoc: GeneratedAsset = {
        id: `lore_${context.entity.id}_${Date.now()}`,
        type: 'text',
        url: `lore://${context.entity.id}`,
        generatedAt: Date.now(),
        generatedBy: 'lore-enricher',
        title: `${context.entity.name} - Complete Lore`,
        description: expandedLore.backstory,
        entityId: context.entity.id,
        commitId: context.commit.id
      };

      return {
        processed: true,
        mutations: [updateOp],
        artifacts: [loreDoc]
      };

    } catch (error) {
      return {
        processed: false,
        error: error as Error
      };
    }
  }
};

/**
 * Timeline Divergence Alert Hook
 * Monitors timeline divergence and generates warnings
 */
export const timelineDivergenceHook: RealityHook = {
  id: 'timeline-divergence-monitor',
  name: 'Timeline Divergence Monitor',
  description: 'Alerts when timeline divergence exceeds thresholds',
  triggers: [
    {
      type: 'COMMIT_CREATED'
    }
  ],
  priority: 90,
  canMutate: false,
  timeout: 5000,

  async execute(context: HookContext): Promise<HookResult> {
    const divergence = context.commit.metrics.timelineDivergence;
    
    if (divergence > 0.7) {
      // High divergence - generate warning visualization
      if (context.services.imageGenerator) {
        const warningViz = await context.services.imageGenerator.generate({
          prompt: `Timeline fracturing visualization, reality breaking apart, quantum instability, divergence level ${(divergence * 100).toFixed(0)}%, warning alert, red alert lighting`,
          style: 'abstract-data-viz',
          artisticStyle: 'cyberpunk',
          lighting: 'neon',
          width: 1920,
          height: 1080
        });

        return {
          processed: true,
          artifacts: [warningViz],
          output: {
            alert: 'HIGH_DIVERGENCE',
            level: divergence,
            message: 'Timeline stability compromised. Reality coherence at risk.'
          }
        };
      }
    }

    return {
      processed: true,
      output: {
        divergence,
        status: 'stable'
      }
    };
  }
};

/**
 * Relationship Visualization Hook
 * Generates relationship graphs when new connections form
 */
export const relationshipGraphHook: RealityHook = {
  id: 'relationship-visualizer',
  name: 'Relationship Graph Generator',
  description: 'Creates visual representations of entity relationships',
  triggers: [
    {
      type: 'RELATIONSHIP_FORMED'
    },
    {
      type: 'RELATIONSHIP_CHANGED'
    }
  ],
  priority: 60,
  canMutate: false,
  timeout: 20000,

  async execute(context: HookContext): Promise<HookResult> {
    if (!context.relationship || !context.services.imageGenerator) {
      return { processed: false };
    }

    try {
      // Get connected entities
      const source = context.currentGraph['entities'].get(context.relationship.source);
      const target = context.currentGraph['entities'].get(context.relationship.target);

      if (!source || !target) {
        return { processed: false };
      }

      // Generate relationship visualization
      const viz = await context.services.imageGenerator.generate({
        prompt: `Abstract visualization of connection between ${source.name} and ${target.name}, relationship type: ${context.relationship.type}, neural network style, glowing connections`,
        style: 'data-visualization',
        artisticStyle: 'cyberpunk',
        width: 1920,
        height: 1080
      });

      viz.relationshipId = context.relationship.id;

      return {
        processed: true,
        artifacts: [viz]
      };

    } catch (error) {
      return {
        processed: false,
        error: error as Error
      };
    }
  }
};

// Helper functions

function buildCharacterPrompt(character: Entity): string {
  const parts = [
    `Portrait of ${character.name}`,
    character.description,
    character.properties?.appearance,
    `Setting: ${character.properties?.location || 'Neo-Tokyo'}`,
    'Style: cinematic, noir aesthetic, dramatic lighting',
    'Project 89 universe'
  ].filter(Boolean);

  return parts.join('. ');
}

function gatherSceneParticipants(context: HookContext): Entity[] {
  if (!context.scene) return [];
  
  const participants: Entity[] = [];
  const characterIds = context.scene.characters || [];
  
  for (const id of characterIds) {
    const entity = context.currentGraph['entities'].get(id);
    if (entity) {
      participants.push(entity);
    }
  }
  
  return participants;
}

function extractKeyMoments(scene: any): Array<{description: string}> {
  // In a real implementation, would use NLP or scene analysis
  // For now, return placeholder moments
  return [
    { description: scene.description || 'Scene beginning' },
    { description: 'Key conflict or revelation' },
    { description: 'Scene resolution' }
  ];
}

/**
 * Export all example hooks
 */
export const exampleHooks = [
  characterPortraitHook,
  sceneStoryboardHook,
  loreEnrichmentHook,
  timelineDivergenceHook,
  relationshipGraphHook
];
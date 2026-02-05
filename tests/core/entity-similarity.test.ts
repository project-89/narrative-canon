import { describe, it, expect, beforeEach } from '@jest/globals';
import { EntitySimilarityDetector } from '../../src/core/entity-similarity';

describe('EntitySimilarityDetector', () => {
  let detector: EntitySimilarityDetector;

  beforeEach(() => {
    detector = new EntitySimilarityDetector();
  });

  describe('calculateNameSimilarity', () => {
    it('should return 1.0 for exact matches', () => {
      expect(detector.calculateNameSimilarity('Agent Kira', 'Agent Kira')).toBe(1.0);
      expect(detector.calculateNameSimilarity('Project 89', 'project 89')).toBe(1.0); // case insensitive
    });

    it('should detect high similarity for substring matches', () => {
      const score = detector.calculateNameSimilarity('Oneirocom', 'Oneirocom Corporation');
      expect(score).toBeGreaterThan(0.9);
      expect(score).toBeLessThan(1.0);
    });

    it('should handle variations appropriately', () => {
      const score1 = detector.calculateNameSimilarity('Agent Kira', 'Agent Kira Chen');
      const score2 = detector.calculateNameSimilarity('Dr Marcus', 'Dr. Marcus Wei');
      const score3 = detector.calculateNameSimilarity('Project 89', 'Project89');
      
      expect(score1).toBeGreaterThan(0.85);
      expect(score2).toBeGreaterThan(0.85);
      expect(score3).toBeGreaterThan(0.6);
    });

    it('should return low scores for unrelated names', () => {
      expect(detector.calculateNameSimilarity('Agent Kira', 'Dr Marcus')).toBeLessThan(0.4);
      expect(detector.calculateNameSimilarity('Oneirocom', 'Project 89')).toBeLessThan(0.3);
    });
  });

  describe('clusterSimilarEntities', () => {
    it('should preserve all unique entities in singleton clusters', () => {
      const entities = [
        { entityId: 'e1', name: 'Agent Kira', aliases: [], type: 'character' },
        { entityId: 'e2', name: 'Dr Marcus', aliases: [], type: 'character' },
        { entityId: 'e3', name: 'Project 89', aliases: [], type: 'organization' }
      ];

      const clusters = detector.clusterSimilarEntities(entities);
      
      expect(clusters).toHaveLength(3);
      expect(clusters.every(c => c.entities.length === 1)).toBe(true);
      
      const totalEntities = clusters.reduce((sum, c) => sum + c.entities.length, 0);
      expect(totalEntities).toBe(entities.length);
    });

    it('should group similar entities into clusters', () => {
      const entities = [
        { entityId: 'e1', name: 'Oneirocom', aliases: [], type: 'organization' },
        { entityId: 'e2', name: 'Oneirocom Corporation', aliases: [], type: 'organization' },
        { entityId: 'e3', name: 'Agent Zero', aliases: [], type: 'character' }
      ];

      const clusters = detector.clusterSimilarEntities(entities);
      
      expect(clusters).toHaveLength(2);
      
      // Find the Oneirocom cluster
      const oneirocomCluster = clusters.find(c => c.canonicalName.includes('Oneirocom'));
      expect(oneirocomCluster).toBeDefined();
      expect(oneirocomCluster!.entities).toHaveLength(2);
      expect(oneirocomCluster!.canonicalName).toBe('Oneirocom Corporation'); // longer name
      
      // Find Agent Zero cluster
      const agentZeroCluster = clusters.find(c => c.canonicalName === 'Agent Zero');
      expect(agentZeroCluster).toBeDefined();
      expect(agentZeroCluster!.entities).toHaveLength(1);
    });

    it('should not cluster entities of different types', () => {
      const entities = [
        { entityId: 'e1', name: 'Kira', aliases: [], type: 'character' },
        { entityId: 'e2', name: 'Kira', aliases: [], type: 'location' }, // same name, different type
        { entityId: 'e3', name: 'Kira Corporation', aliases: [], type: 'organization' }
      ];

      const clusters = detector.clusterSimilarEntities(entities);
      
      // All should be in separate clusters because of different types
      expect(clusters).toHaveLength(3);
      expect(clusters.every(c => c.entities.length === 1)).toBe(true);
    });

    it('should handle aliases when detecting similarity', () => {
      const entities = [
        { entityId: 'e1', name: 'Agent Kira Chen', aliases: ['Kira', 'Agent Chen'], type: 'character' },
        { entityId: 'e2', name: 'Kira', aliases: [], type: 'character' },
        { entityId: 'e3', name: 'Dr Marcus', aliases: [], type: 'character' }
      ];

      const clusters = detector.clusterSimilarEntities(entities);
      
      // Kira and Agent Kira Chen should be clustered due to alias match
      const kiraCluster = clusters.find(c => c.entities.length > 1);
      expect(kiraCluster).toBeDefined();
      expect(kiraCluster!.entities).toHaveLength(2);
    });

    it('should handle empty entity list', () => {
      const clusters = detector.clusterSimilarEntities([]);
      expect(clusters).toHaveLength(0);
    });

    it('should set appropriate merge strategies', () => {
      const entities = [
        { entityId: 'e1', name: 'Oneirocom', aliases: ['OC'], type: 'organization' },
        { entityId: 'e2', name: 'Oneirocom Corporation', aliases: [], type: 'organization' },
        { entityId: 'e3', name: 'Totally Different Corp', aliases: [], type: 'organization' }
      ];

      const clusters = detector.clusterSimilarEntities(entities);
      
      const oneirocomCluster = clusters.find(c => c.entities.length > 1);
      expect(oneirocomCluster).toBeDefined();
      expect(oneirocomCluster!.mergeStrategy).toBe('combine_properties'); // high similarity
      
      const singletonCluster = clusters.find(c => c.canonicalName === 'Totally Different Corp');
      expect(singletonCluster).toBeDefined();
      expect(singletonCluster!.mergeStrategy).toBe('primary_wins'); // singleton
    });
  });

  describe('detectSimilarEntities', () => {
    it('should find similar entity pairs through aliases', () => {
      const entities = [
        { entityId: 'e1', name: 'Agent Kira', aliases: ['Kira'], type: 'character' },
        { entityId: 'e2', name: 'Kira', aliases: [], type: 'character' },
        { entityId: 'e3', name: 'Dr. Sarah Chen', aliases: ['Sarah', 'Dr. Chen'], type: 'character' },
        { entityId: 'e4', name: 'Sarah Chen', aliases: [], type: 'character' }
      ];

      const matches = detector.detectSimilarEntities(entities);
      
      // Should find exact match through alias
      const kiraMatch = matches.find(m => 
        (m.entity1 === 'e1' && m.entity2 === 'e2') ||
        (m.entity1 === 'e2' && m.entity2 === 'e1')
      );
      expect(kiraMatch).toBeDefined();
      expect(kiraMatch!.score).toBeGreaterThan(0.8); // High score for alias match
      
      // Should find high similarity for Sarah Chen variations
      const sarahMatch = matches.find(m => 
        (m.entity1 === 'e3' && m.entity2 === 'e4') ||
        (m.entity1 === 'e4' && m.entity2 === 'e3')
      );
      expect(sarahMatch).toBeDefined();
      expect(sarahMatch!.score).toBeGreaterThan(0.7);
    });

    it('should suggest appropriate actions based on similarity scores', () => {
      const entities = [
        { entityId: 'e1', name: 'Oneirocom', aliases: [], type: 'organization' },
        { entityId: 'e2', name: 'Oneirocom', aliases: [], type: 'organization' }, // exact duplicate
        { entityId: 'e3', name: 'Oneirocom Corporation', aliases: [], type: 'organization' } // variation
      ];

      const matches = detector.detectSimilarEntities(entities);
      
      // Exact match should suggest merge
      const exactMatch = matches.find(m => m.score > 0.95);
      expect(exactMatch).toBeDefined();
      expect(exactMatch!.suggestedAction).toBe('merge');
      
      // High similarity should suggest alias
      const similarMatch = matches.find(m => m.score > 0.8 && m.score <= 0.95);
      expect(similarMatch).toBeDefined();
      expect(similarMatch!.suggestedAction).toBe('alias');
    });
  });
});

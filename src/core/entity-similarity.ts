/**
 * Advanced entity similarity detection and merging system
 * Handles cases like "Oneirocom" vs "Oneirocom Corporation"
 */

export interface SimilarityMatch {
  entity1: string;
  entity2: string;
  score: number;
  reasons: string[];
  suggestedAction: 'merge' | 'alias' | 'review' | 'separate';
}

export interface EntityCluster {
  canonicalName: string;
  entities: Array<{
    entityId: string;
    name: string;
    confidence: number;
  }>;
  mergeStrategy: 'primary_wins' | 'combine_properties' | 'manual_review';
}

export class EntitySimilarityDetector {
  
  /**
   * Calculate similarity between two entity names
   */
  calculateNameSimilarity(name1: string, name2: string): number {
    const n1 = this.normalize(name1);
    const n2 = this.normalize(name2);
    
    // Handle edge cases
    if (n1.length === 0 && n2.length === 0) return 1.0;
    if (n1.length === 0 || n2.length === 0) return 0;
    
    // Exact match
    if (n1 === n2) return 1.0;
    
    // Check for one being substring of other (e.g., "Oneirocom" in "Oneirocom Corporation")
    if (n1.includes(n2) || n2.includes(n1)) {
      const longer = n1.length > n2.length ? n1 : n2;
      const shorter = n1.length <= n2.length ? n1 : n2;
      return 0.85 + (shorter.length / longer.length) * 0.15;
    }
    
    // Levenshtein distance
    const levScore = 1 - (this.levenshteinDistance(n1, n2) / Math.max(n1.length, n2.length));
    
    // Jaro-Winkler for better handling of prefixes
    const jwScore = this.jaroWinkler(n1, n2);
    
    // Token-based similarity for multi-word names
    const tokenScore = this.tokenSimilarity(n1, n2);
    
    // Weighted combination
    return (levScore * 0.3) + (jwScore * 0.4) + (tokenScore * 0.3);
  }
  
  /**
   * Detect potentially similar entities across the entire dataset
   */
  detectSimilarEntities(entities: Array<{entityId: string, name: string, aliases: string[], type: string}>): SimilarityMatch[] {
    const matches: SimilarityMatch[] = [];
    
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];
        
        // Only compare entities of same type
        if (entity1.type !== entity2.type) continue;
        
        const match = this.compareEntities(entity1, entity2);
        if (match.score > 0.6) { // Threshold for potential similarity
          matches.push(match);
        }
      }
    }
    
    return matches.sort((a, b) => b.score - a.score);
  }
  
  /**
   * Group similar entities into clusters for merging
   */
  clusterSimilarEntities(entities: Array<{entityId: string, name: string, aliases: string[], type: string}>): EntityCluster[] {
    const matches = this.detectSimilarEntities(entities);
    const clusters: EntityCluster[] = [];
    const processed = new Set<string>();
    
    // First, create clusters for entities with matches
    for (const match of matches) {
      if (processed.has(match.entity1) || processed.has(match.entity2)) continue;
      
      // Find all entities similar to this pair
      const clusterEntities = [match.entity1, match.entity2];
      const clusterMembers = entities.filter(e => clusterEntities.includes(e.entityId));
      
      // Determine canonical name (usually the longest or most complete)
      const canonicalName = this.selectCanonicalName(clusterMembers.map(e => e.name));
      
      clusters.push({
        canonicalName,
        entities: clusterMembers.map(e => ({
          entityId: e.entityId,
          name: e.name,
          confidence: match.score
        })),
        mergeStrategy: match.score > 0.9 ? 'combine_properties' : 'manual_review'
      });
      
      clusterEntities.forEach(id => processed.add(id));
    }
    
    // CRITICAL: Add singleton clusters for entities without matches
    for (const entity of entities) {
      if (!processed.has(entity.entityId)) {
        clusters.push({
          canonicalName: entity.name,
          entities: [{
            entityId: entity.entityId,
            name: entity.name,
            confidence: 1.0
          }],
          mergeStrategy: 'primary_wins'
        });
      }
    }
    
    return clusters;
  }
  
  private compareEntities(
    entity1: {entityId: string, name: string, aliases: string[]}, 
    entity2: {entityId: string, name: string, aliases: string[]}
  ): SimilarityMatch {
    const reasons: string[] = [];
    let score = 0;
    
    // Name similarity
    const nameScore = this.calculateNameSimilarity(entity1.name, entity2.name);
    score += nameScore * 0.6;
    
    if (nameScore > 0.8) {
      reasons.push(`High name similarity (${(nameScore * 100).toFixed(1)}%)`);
    }
    
    // Check aliases
    const aliasScore = this.checkAliasOverlap(entity1, entity2);
    score += aliasScore * 0.4;
    
    if (aliasScore > 0.5) {
      reasons.push(`Shared aliases or alias-name matches`);
    }
    
    let suggestedAction: 'merge' | 'alias' | 'review' | 'separate';
    if (score > 0.95) suggestedAction = 'merge';
    else if (score > 0.8) suggestedAction = 'alias';
    else if (score > 0.7) suggestedAction = 'review';
    else suggestedAction = 'separate';
    
    return {
      entity1: entity1.entityId,
      entity2: entity2.entityId,
      score,
      reasons,
      suggestedAction
    };
  }
  
  private checkAliasOverlap(entity1: {name: string, aliases: string[]}, entity2: {name: string, aliases: string[]}): number {
    const allNames1 = [entity1.name, ...entity1.aliases].map(n => this.normalize(n));
    const allNames2 = [entity2.name, ...entity2.aliases].map(n => this.normalize(n));
    
    let matches = 0;
    let total = 0;
    
    for (const name1 of allNames1) {
      for (const name2 of allNames2) {
        total++;
        const similarity = this.calculateNameSimilarity(name1, name2);
        if (similarity === 1.0 || similarity > 0.7) {
          matches++;
        }
      }
    }
    
    return total > 0 ? matches / total : 0;
  }
  
  private selectCanonicalName(names: string[]): string {
    // Prefer longer, more descriptive names
    return names.reduce((canonical, current) => {
      if (current.length > canonical.length) return current;
      if (current.length === canonical.length && current.toLowerCase() < canonical.toLowerCase()) {
        return current;
      }
      return canonical;
    });
  }
  
  private normalize(text: string): string {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  private jaroWinkler(str1: string, str2: string): number {
    const jaro = this.jaro(str1, str2);
    if (jaro < 0.7) return jaro;
    
    // Calculate common prefix length (up to 4 characters)
    let prefix = 0;
    for (let i = 0; i < Math.min(str1.length, str2.length, 4); i++) {
      if (str1[i] === str2[i]) prefix++;
      else break;
    }
    
    return jaro + (0.1 * prefix * (1 - jaro));
  }
  
  private jaro(str1: string, str2: string): number {
    if (str1.length === 0 && str2.length === 0) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
    const str1Matches = new Array(str1.length).fill(false);
    const str2Matches = new Array(str2.length).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < str1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, str2.length);
      
      for (let j = start; j < end; j++) {
        if (str2Matches[j] || str1[i] !== str2[j]) continue;
        str1Matches[i] = true;
        str2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0;
    
    // Count transpositions
    let k = 0;
    for (let i = 0; i < str1.length; i++) {
      if (!str1Matches[i]) continue;
      while (!str2Matches[k]) k++;
      if (str1[i] !== str2[k]) transpositions++;
      k++;
    }
    
    return (matches / str1.length + matches / str2.length + (matches - transpositions / 2) / matches) / 3;
  }
  
  private tokenSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.split(/\s+/));
    const tokens2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }
}
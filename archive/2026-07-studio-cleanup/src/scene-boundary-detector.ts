import { Entity, Relationship } from './types';

export interface SceneBoundary {
  position: number; // Character position in text
  type: SceneBoundaryType;
  description: string;
  significance: number; // 0-1, how major the turning point is
}

export enum SceneBoundaryType {
  LOCATION_CHANGE = 'location_change',
  CHARACTER_ARRIVAL = 'character_arrival', 
  CHARACTER_DEPARTURE = 'character_departure',
  MAJOR_REVELATION = 'major_revelation',
  CONFLICT_START = 'conflict_start',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  DECISION_POINT = 'decision_point',
  TIME_JUMP = 'time_jump',
  EMOTIONAL_SHIFT = 'emotional_shift',
  POWER_DYNAMIC_CHANGE = 'power_dynamic_change'
}

export interface SceneBoundaryPattern {
  type: SceneBoundaryType;
  keywords: string[];
  patterns: RegExp[];
  significance: number;
}

export const SCENE_BOUNDARY_PATTERNS: SceneBoundaryPattern[] = [
  {
    type: SceneBoundaryType.LOCATION_CHANGE,
    keywords: ['went to', 'arrived at', 'entered', 'left', 'walked to', 'traveled', 'moved to', 'returned to'],
    patterns: [
      /\b(went|walked|traveled|moved|journeyed)\s+(to|into|through)\b/gi,
      /\b(arrived|entered|reached|approached)\s+(at|in|the)\b/gi,
      /\b(left|departed|exited|fled)\s+(the|from)\b/gi
    ],
    significance: 0.7
  },
  {
    type: SceneBoundaryType.CHARACTER_ARRIVAL,
    keywords: ['arrived', 'appeared', 'came', 'entered', 'joined', 'showed up'],
    patterns: [
      /\b\w+\s+(arrived|appeared|came|entered|joined|showed up)\b/gi,
      /\bsuddenly\s+\w+\s+(was there|appeared|arrived)/gi
    ],
    significance: 0.8
  },
  {
    type: SceneBoundaryType.CHARACTER_DEPARTURE,
    keywords: ['left', 'departed', 'went away', 'vanished', 'disappeared'],
    patterns: [
      /\b\w+\s+(left|departed|vanished|disappeared)\b/gi,
      /\b\w+\s+went\s+away\b/gi
    ],
    significance: 0.8
  },
  {
    type: SceneBoundaryType.MAJOR_REVELATION,
    keywords: ['discovered', 'realized', 'revealed', 'learned', 'found out', 'uncovered'],
    patterns: [
      /\b(discovered|realized|revealed|learned|found out|uncovered)\s+that\b/gi,
      /\bsuddenly\s+(understood|knew|realized)\b/gi
    ],
    significance: 0.9
  },
  {
    type: SceneBoundaryType.CONFLICT_START,
    keywords: ['attacked', 'fought', 'argued', 'confronted', 'challenged'],
    patterns: [
      /\b(attacked|fought|argued|confronted|challenged)\b/gi,
      /\b(battle|fight|conflict|war)\s+(began|started|erupted)\b/gi
    ],
    significance: 0.9
  },
  {
    type: SceneBoundaryType.TIME_JUMP,
    keywords: ['later', 'meanwhile', 'the next day', 'hours passed', 'years later'],
    patterns: [
      /\b(later|meanwhile|afterwards|subsequently)\b/gi,
      /\b(the next|several|many)\s+(day|week|month|year)s?\b/gi,
      /\b(hours|days|weeks|months|years)\s+(passed|later)\b/gi
    ],
    significance: 0.6
  },
  {
    type: SceneBoundaryType.DECISION_POINT,
    keywords: ['decided', 'chose', 'determined', 'resolved'],
    patterns: [
      /\b(decided|chose|determined|resolved)\s+to\b/gi,
      /\bmade\s+(a|the)\s+(decision|choice)\b/gi
    ],
    significance: 0.7
  }
];

export class SceneBoundaryDetector {
  
  detectBoundaries(text: string): SceneBoundary[] {
    const boundaries: SceneBoundary[] = [];
    
    for (const pattern of SCENE_BOUNDARY_PATTERNS) {
      // Check keywords
      for (const keyword of pattern.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          boundaries.push({
            position: match.index,
            type: pattern.type,
            description: `Found keyword: ${keyword}`,
            significance: pattern.significance
          });
        }
      }
      
      // Check regex patterns  
      for (const regex of pattern.patterns) {
        let match;
        while ((match = regex.exec(text)) !== null) {
          boundaries.push({
            position: match.index,
            type: pattern.type,
            description: `Pattern match: ${match[0]}`,
            significance: pattern.significance
          });
        }
      }
    }
    
    // Sort by position and deduplicate nearby boundaries
    boundaries.sort((a, b) => a.position - b.position);
    return this.deduplicateBoundaries(boundaries, text);
  }
  
  private deduplicateBoundaries(boundaries: SceneBoundary[], text: string): SceneBoundary[] {
    const deduplicated: SceneBoundary[] = [];
    const minDistance = 50; // Minimum characters between boundaries
    
    for (const boundary of boundaries) {
      const nearby = deduplicated.find(existing => 
        Math.abs(existing.position - boundary.position) < minDistance
      );
      
      if (!nearby) {
        deduplicated.push(boundary);
      } else if (boundary.significance > nearby.significance) {
        // Replace with higher significance boundary
        const index = deduplicated.indexOf(nearby);
        deduplicated[index] = boundary;
      }
    }
    
    return deduplicated;
  }
  
  segmentIntoScenes(text: string): SceneSegment[] {
    const boundaries = this.detectBoundaries(text);
    const sceneBreaks = this.identifySceneBreaks(boundaries, text);
    const segments: SceneSegment[] = [];
    
    let startPos = 0;
    for (const breakPoint of sceneBreaks) {
      const content = text.slice(startPos, breakPoint.position).trim();
      if (content) {
        segments.push({
          id: `scene_${segments.length + 1}`,
          content,
          startPosition: startPos,
          endPosition: breakPoint.position,
          boundaryType: breakPoint.type,
          significance: breakPoint.significance
        });
      }
      startPos = breakPoint.position;
    }
    
    // Add final segment
    const finalContent = text.slice(startPos).trim();
    if (finalContent) {
      segments.push({
        id: `scene_${segments.length + 1}`,
        content: finalContent,
        startPosition: startPos,
        endPosition: text.length,
        boundaryType: undefined,
        significance: 0.5
      });
    }
    
    return segments;
  }

  private identifySceneBreaks(boundaries: SceneBoundary[], text: string): SceneBoundary[] {
    const sceneBreaks: SceneBoundary[] = [];
    const minSceneLength = 80; // Minimum characters for a scene (more flexible)
    const clusterWindow = 50; // Characters within which to cluster boundaries (tighter clustering)
    
    // Group boundaries that are close together
    const clusters: SceneBoundary[][] = [];
    let currentCluster: SceneBoundary[] = [];
    
    for (const boundary of boundaries) {
      if (boundary.significance < 0.7) continue; // Only consider significant boundaries
      
      if (currentCluster.length === 0) {
        currentCluster.push(boundary);
      } else {
        const lastBoundary = currentCluster[currentCluster.length - 1];
        if (boundary.position - lastBoundary.position <= clusterWindow) {
          currentCluster.push(boundary);
        } else {
          clusters.push([...currentCluster]);
          currentCluster = [boundary];
        }
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }
    
    // For each cluster, choose the most significant boundary as the scene break
    let lastBreakPos = 0;
    for (const cluster of clusters) {
      const mostSignificant = cluster.reduce((max, current) => 
        current.significance > max.significance ? current : max
      );
      
      // Only create scene break if it would result in a reasonably sized scene
      if (mostSignificant.position - lastBreakPos >= minSceneLength) {
        sceneBreaks.push(mostSignificant);
        lastBreakPos = mostSignificant.position;
      }
    }
    
    return sceneBreaks;
  }
}

export interface SceneSegment {
  id: string;
  content: string;
  startPosition: number;
  endPosition: number;
  boundaryType?: SceneBoundaryType;
  significance: number;
}
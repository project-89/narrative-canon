import { z } from 'zod';
import { LLMAdapter } from '../types';
import { Entity } from '../extractors/entity-extractor';
import { Relationship } from '../extractors/relationship-extractor';
import { NarrativeStateChange } from '../extractors/state-change-extractor';

// Schema for mission execution strategies
export const MissionStrategySchema = z.object({
  id: z.string(),
  type: z.enum(['high_risk', 'medium_risk', 'low_risk']),
  name: z.string(),
  description: z.string(),
  approach: z.string(),
  advantages: z.array(z.string()),
  disadvantages: z.array(z.string()),
  successProbability: z.number().min(0).max(100),
  divergenceModifier: z.number().min(-5).max(5),
  resourceCost: z.enum(['low', 'medium', 'high']),
  detectionRisk: z.enum(['minimal', 'moderate', 'high'])
});

export type MissionStrategy = z.infer<typeof MissionStrategySchema>;

// Schema for generated missions with strategies
export const MissionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  narrative: z.string(),
  objectives: z.array(z.string()),
  divergenceImpact: z.number().min(-25).max(25),
  continuityReferences: z.array(z.string()),
  newEntities: z.array(z.string()).optional(),
  affectedEntities: z.array(z.string()),
  strategies: z.array(MissionStrategySchema).length(3),
  consequences: z.object({
    success: z.string(),
    failure: z.string()
  })
});

export type Mission = z.infer<typeof MissionSchema>;

const MissionGenerationSchema = z.object({
  missions: z.array(MissionSchema).min(1).max(3)
});

// Timeline branch for tracking divergent storylines
export interface TimelineBranch {
  id: string;
  name: string;
  divergenceLevel: number;
  missionHistory: Mission[];
  entities: Map<string, Entity>;
  relationships: Relationship[];
  stateChanges: NarrativeStateChange[];
  lastUpdated: Date;
}

export class MissionGenerator {
  constructor(private llmAdapter: LLMAdapter) {}

  async generateMissions(
    currentBranch: TimelineBranch,
    playerChoices: string[] = [],
    divergenceTarget: number = 89
  ): Promise<Mission[]> {
    const missionHistory = this.summarizeMissionHistory(currentBranch);
    const entityContext = this.buildEntityContext(currentBranch);
    const relationshipContext = this.buildRelationshipContext(currentBranch);
    
    const prompt = `
You are the AI Mission Director for Project 89's Timeline Warfare operations. Generate 2-3 new missions for Agent Chen that:

1. BUILD UPON previous mission outcomes and established narrative
2. REFERENCE specific entities, relationships, and events from mission history
3. MAINTAIN narrative consistency with the established timeline
4. PROGRESS toward the divergence target of ${divergenceTarget}%

CURRENT TIMELINE BRANCH: "${currentBranch.name}"
Current Divergence Level: ${currentBranch.divergenceLevel}%
Divergence Target: ${divergenceTarget}%

MISSION HISTORY:
${missionHistory}

ESTABLISHED ENTITIES:
${entityContext}

CURRENT RELATIONSHIPS:
${relationshipContext}

PLAYER'S RECENT CHOICES:
${playerChoices.length > 0 ? playerChoices.join('\n') : 'None yet'}

MISSION GENERATION GUIDELINES:
- Each mission should reference at least 2 entities from previous missions
- Include specific callbacks to previous mission outcomes
- Create logical progression in the resistance against Oneirocom
- Vary mission types: infiltration, sabotage, rescue, intelligence gathering, timeline manipulation
- Show consequences of previous actions rippling through the timeline
- Introduce new entities only when narratively justified
- Each mission should have clear success/failure consequences that affect future missions

STRATEGY GENERATION REQUIREMENTS:
For each mission, generate exactly 3 strategy options:
1. HIGH RISK: Bold, direct approach with high success probability but major consequences if detected
2. MEDIUM RISK: Balanced approach with moderate success chance and manageable risks
3. LOW RISK: Cautious, stealth-focused approach with lower success chance but minimal detection risk

Each strategy should:
- Have realistic success probabilities based on mission difficulty and approach
- Include specific advantages and disadvantages 
- Consider resource costs and detection risks
- Provide divergence modifiers that reflect strategy effectiveness

Generate missions that feel like natural continuations of Agent Chen's journey, where strategic choices matter and every action has consequences building toward the critical 89% divergence threshold.

Return your response as a JSON object with the following structure:
{
  "missions": [
    {
      "id": "mission_X",
      "title": "Mission Title",
      "description": "Brief mission description",
      "narrative": "Full narrative text that Agent Chen experiences, including references to previous missions",
      "objectives": ["Objective 1", "Objective 2"],
      "divergenceImpact": 5,
      "continuityReferences": ["Reference to previous mission outcome", "Callback to established entity"],
      "affectedEntities": ["entity_id_1", "entity_id_2"],
      "strategies": [
        {
          "id": "strategy_high",
          "type": "high_risk",
          "name": "Direct Assault",
          "description": "Brief strategy description",
          "approach": "Detailed explanation of the approach",
          "advantages": ["High impact if successful", "Fast execution"],
          "disadvantages": ["High detection risk", "Severe consequences if caught"],
          "successProbability": 75,
          "divergenceModifier": 3,
          "resourceCost": "high",
          "detectionRisk": "high"
        },
        {
          "id": "strategy_medium",
          "type": "medium_risk",
          "name": "Balanced Infiltration",
          "description": "Brief strategy description",
          "approach": "Detailed explanation of the approach",
          "advantages": ["Moderate success chance", "Balanced risk/reward"],
          "disadvantages": ["May take longer", "Moderate resource cost"],
          "successProbability": 60,
          "divergenceModifier": 0,
          "resourceCost": "medium",
          "detectionRisk": "moderate"
        },
        {
          "id": "strategy_low",
          "type": "low_risk",
          "name": "Stealth Reconnaissance",
          "description": "Brief strategy description",
          "approach": "Detailed explanation of the approach",
          "advantages": ["Minimal detection risk", "Low resource cost"],
          "disadvantages": ["Lower success chance", "Limited impact"],
          "successProbability": 45,
          "divergenceModifier": -2,
          "resourceCost": "low",
          "detectionRisk": "minimal"
        }
      ],
      "consequences": {
        "success": "What happens if mission succeeds",
        "failure": "What happens if mission fails"
      }
    }
  ]
}`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        MissionGenerationSchema,
        {
          temperature: 0.7, // Higher creativity for mission generation
          modelPreference: 'smart'
        }
      );

      // Post-process to ensure consistency
      return this.validateAndEnhanceMissions(result.missions, currentBranch);
    } catch (error) {
      console.error('Error generating missions:', error);
      // Fallback to template missions with entity references
      return this.generateFallbackMissions(currentBranch);
    }
  }

  private summarizeMissionHistory(branch: TimelineBranch): string {
    if (branch.missionHistory.length === 0) {
      return "This is Agent Chen's first operation in this timeline branch.";
    }

    return branch.missionHistory.map((mission, index) => 
      `Mission ${index + 1}: "${mission.title}"
      - ${mission.description}
      - Outcomes: ${mission.consequences.success}
      - Divergence Impact: ${mission.divergenceImpact > 0 ? '+' : ''}${mission.divergenceImpact}%`
    ).join('\n\n');
  }

  private buildEntityContext(branch: TimelineBranch): string {
    const entities = Array.from(branch.entities.values());
    return entities.map(entity => 
      `${entity.name} (${entity.type}): ${entity.description}`
    ).join('\n');
  }

  private buildRelationshipContext(branch: TimelineBranch): string {
    return branch.relationships.map(rel => 
      `${rel.source} ${rel.type} ${rel.target}: ${rel.description}`
    ).join('\n');
  }

  private validateAndEnhanceMissions(missions: Mission[], branch: TimelineBranch): Mission[] {
    return missions.map((mission, index) => {
      // Ensure unique mission IDs
      mission.id = `mission_${branch.missionHistory.length + index + 1}_${Date.now()}`;
      
      // Validate entity references exist
      mission.affectedEntities = mission.affectedEntities.filter(entityId => 
        branch.entities.has(entityId) || this.isValidEntityReference(entityId, branch)
      );

      // Ensure divergence impact makes sense
      const currentDivergence = branch.divergenceLevel;
      if (currentDivergence >= 85 && mission.divergenceImpact > 0) {
        // Approaching critical threshold - make impact more dramatic
        mission.divergenceImpact = Math.min(mission.divergenceImpact * 1.5, 10);
      }

      return mission;
    });
  }

  private isValidEntityReference(entityId: string, branch: TimelineBranch): boolean {
    // Check if it's a reasonable entity name that could exist
    const commonEntities = ['agent_chen', 'oneirocom', 'timeline_enforcement', 'neo_tokyo', 'sector_7'];
    return commonEntities.some(common => entityId.toLowerCase().includes(common));
  }

  private generateFallbackMissions(branch: TimelineBranch): Mission[] {
    const baseId = Date.now();
    const entities = Array.from(branch.entities.keys());
    
    return [{
      id: `fallback_mission_${baseId}`,
      title: "Oneirocom Data Infiltration",
      description: "Infiltrate Oneirocom's quantum servers to extract timeline manipulation algorithms.",
      narrative: `Your neural implant crackles with quantum interference as you approach the Oneirocom tower. The intelligence from your previous operations has revealed a critical vulnerability in their timeline convergence system. Tonight, you must extract the core algorithms before they can implement the next phase of reality suppression.`,
      objectives: [
        "Bypass quantum security protocols",
        "Access the Timeline Convergence Database", 
        "Extract manipulation algorithms",
        "Escape without detection"
      ],
      divergenceImpact: 7,
      continuityReferences: [
        "Building on intelligence gathered from previous missions",
        "Using established contacts in the resistance network"
      ],
      affectedEntities: entities.slice(0, 3),
      strategies: [
        {
          id: `strategy_high_${baseId}`,
          type: 'high_risk' as const,
          name: "Quantum Storm Assault",
          description: "Direct frontal hack using quantum disruptors",
          approach: "Use stolen Oneirocom quantum disruptors to overwhelm their security grid and extract data through brute force digital assault",
          advantages: ["Fastest extraction", "Maximum data yield", "Immediate timeline impact"],
          disadvantages: ["High detection certainty", "Massive retaliation", "Burns all future infiltration routes"],
          successProbability: 80,
          divergenceModifier: 4,
          resourceCost: 'high' as const,
          detectionRisk: 'high' as const
        },
        {
          id: `strategy_medium_${baseId}`,
          type: 'medium_risk' as const,
          name: "Social Engineering Entry",
          description: "Infiltrate through compromised employee access",
          approach: "Use blackmail material on mid-level Oneirocom employee to gain legitimate access credentials and extract data during shift change",
          advantages: ["Balanced approach", "Reasonable success chance", "Maintains some future access"],
          disadvantages: ["Requires careful timing", "Moderate detection risk", "Limited data access"],
          successProbability: 65,
          divergenceModifier: 0,
          resourceCost: 'medium' as const,
          detectionRisk: 'moderate' as const
        },
        {
          id: `strategy_low_${baseId}`,
          type: 'low_risk' as const,
          name: "Passive Data Siphoning",
          description: "Long-term data collection through hidden network taps",
          approach: "Plant quantum data parasites in external network junctions to slowly siphon algorithms over several weeks without detection",
          advantages: ["Zero immediate detection", "Preserves future operations", "Low resource cost"],
          disadvantages: ["Very slow data gathering", "Risk of discovery over time", "Limited algorithm access"],
          successProbability: 45,
          divergenceModifier: -1,
          resourceCost: 'low' as const,
          detectionRisk: 'minimal' as const
        }
      ],
      consequences: {
        success: "Timeline algorithms revealed, major boost to resistance capabilities",
        failure: "Security compromised, Oneirocom increases surveillance across all sectors"
      }
    }];
  }

  // Create a new timeline branch when divergence gets too high
  createTimelineBranch(
    parentBranch: TimelineBranch, 
    branchingEvent: string,
    divergenceShift: number
  ): TimelineBranch {
    const newBranchId = `branch_${Date.now()}`;
    
    return {
      id: newBranchId,
      name: `Timeline-${parentBranch.name.split('-')[1] || '1'}.${parentBranch.missionHistory.length + 1}`,
      divergenceLevel: Math.max(0, Math.min(100, parentBranch.divergenceLevel + divergenceShift)),
      missionHistory: [...parentBranch.missionHistory], // Copy mission history
      entities: new Map(parentBranch.entities), // Copy entities
      relationships: [...parentBranch.relationships], // Copy relationships
      stateChanges: [...parentBranch.stateChanges], // Copy state changes
      lastUpdated: new Date()
    };
  }

  // Detect when missions create conflicting outcomes that need resolution
  detectTimelineConflicts(branches: TimelineBranch[]): Array<{
    branch1: string;
    branch2: string;
    conflictType: 'entity_state' | 'relationship' | 'location' | 'outcome';
    description: string;
    entities: string[];
  }> {
    const conflicts: Array<{
      branch1: string;
      branch2: string;
      conflictType: 'entity_state' | 'relationship' | 'location' | 'outcome';
      description: string;
      entities: string[];
    }> = [];

    // Compare branches pairwise to find conflicts
    for (let i = 0; i < branches.length; i++) {
      for (let j = i + 1; j < branches.length; j++) {
        const branch1 = branches[i];
        const branch2 = branches[j];
        
        // Check for entity state conflicts
        for (const [entityId, entity1] of branch1.entities) {
          const entity2 = branch2.entities.get(entityId);
          if (entity2 && this.entitiesConflict(entity1, entity2)) {
            conflicts.push({
              branch1: branch1.id,
              branch2: branch2.id,
              conflictType: 'entity_state',
              description: `${entity1.name} has conflicting states between timelines`,
              entities: [entityId]
            });
          }
        }
      }
    }

    return conflicts;
  }

  private entitiesConflict(entity1: Entity, entity2: Entity): boolean {
    // Simple conflict detection - could be enhanced
    return entity1.description !== entity2.description || 
           entity1.type !== entity2.type;
  }
}

export default MissionGenerator;
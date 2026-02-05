import { Entity } from '../extractors/entity-extractor';
import { Relationship } from '../extractors/relationship-extractor';
import { NarrativeStateChange } from '../extractors/state-change-extractor';
import { TimelineBranch, Mission, MissionGenerator } from './mission-generator';
import { NarrativePipeline } from '../pipeline';
import { LLMAdapter } from '../types';

// Import MissionStrategy type from mission-generator
import { MissionStrategy } from './mission-generator';

export interface TimelineState {
  activeBranch: string;
  branches: Map<string, TimelineBranch>;
  globalEntities: Map<string, Entity>;
  divergenceThreshold: number;
  branchingEvents: Array<{
    missionId: string;
    branchId: string;
    divergenceShift: number;
    description: string;
    timestamp: Date;
  }>;
}

export class TimelineManager {
  private missionGenerator: MissionGenerator;
  private narrativePipeline: NarrativePipeline;

  constructor(llmAdapter: LLMAdapter) {
    this.missionGenerator = new MissionGenerator(llmAdapter);
    this.narrativePipeline = new NarrativePipeline(llmAdapter);
  }

  initializeTimeline(): TimelineState {
    const initialBranch: TimelineBranch = {
      id: 'prime_timeline',
      name: 'Timeline-Prime',
      divergenceLevel: 15, // Starting divergence from Timeline Warfare
      missionHistory: [],
      entities: new Map(),
      relationships: [],
      stateChanges: [],
      lastUpdated: new Date()
    };

    // Add initial Project 89 entities
    this.addInitialEntities(initialBranch);

    return {
      activeBranch: 'prime_timeline',
      branches: new Map([['prime_timeline', initialBranch]]),
      globalEntities: new Map(),
      divergenceThreshold: 89,
      branchingEvents: []
    };
  }

  private addInitialEntities(branch: TimelineBranch): void {
    const initialEntities = [
      {
        id: 'agent_chen',
        name: 'Agent Chen',
        type: 'character' as const,
        description: 'A Project 89 operative with the ability to perceive timeline branches',
        aliases: ['Chen'],
        firstMention: 1
      },
      {
        id: 'oneirocom_corporation',
        name: 'Oneirocom Corporation',
        type: 'organization' as const,
        description: 'A corporation that controls reality through the Convergence Protocol',
        aliases: ['Oneirocom'],
        firstMention: 1
      },
      {
        id: 'timeline_enforcement_division',
        name: 'Timeline Enforcement Division',
        type: 'organization' as const,
        description: 'A division that hunts for divergent branches to collapse',
        aliases: ['Timeline Enforcement', 'TED'],
        firstMention: 1
      },
      {
        id: 'neo_tokyo_sector7',
        name: 'Neo-Tokyo Sector 7',
        type: 'location' as const,
        description: 'A hidden safehouse where reality glitches provide access to parallel branches',
        aliases: ['Sector 7', 'The Safehouse'],
        firstMention: 1
      },
      {
        id: 'convergence_protocol',
        name: 'Convergence Protocol',
        type: 'technology' as const,
        description: 'A system used to eliminate alternate timelines and control reality',
        aliases: ['The Protocol'],
        firstMention: 1
      }
    ];

    initialEntities.forEach(entity => {
      branch.entities.set(entity.id, entity);
    });

    // Add initial relationships
    branch.relationships = [
      {
        id: 'rel_chen_oneirocom',
        source: 'agent_chen',
        target: 'oneirocom_corporation',
        type: 'enemy',
        description: 'Agent Chen works to resist Oneirocom\'s timeline control',
        firstMentioned: 1
      },
      {
        id: 'rel_oneirocom_protocol',
        source: 'oneirocom_corporation',
        target: 'convergence_protocol',
        type: 'uses',
        description: 'Oneirocom uses the Convergence Protocol to control reality',
        firstMentioned: 1
      },
      {
        id: 'rel_ted_chen',
        source: 'timeline_enforcement_division',
        target: 'agent_chen',
        type: 'hunts',
        description: 'Timeline Enforcement Division constantly hunts for divergent branches',
        firstMentioned: 1
      },
      {
        id: 'rel_chen_sector7',
        source: 'agent_chen',
        target: 'neo_tokyo_sector7',
        type: 'operates_from',
        description: 'Agent Chen operates from the Sector 7 safehouse',
        firstMentioned: 1
      }
    ];
  }

  async generateNextMissions(
    timelineState: TimelineState,
    playerChoices: string[] = []
  ): Promise<Mission[]> {
    const activeBranch = timelineState.branches.get(timelineState.activeBranch);
    if (!activeBranch) {
      throw new Error('Active branch not found');
    }

    console.log(`🎯 Generating missions for ${activeBranch.name} (${activeBranch.divergenceLevel}% divergence)`);
    
    return await this.missionGenerator.generateMissions(
      activeBranch,
      playerChoices,
      timelineState.divergenceThreshold
    );
  }

  async executeMission(
    timelineState: TimelineState,
    mission: Mission,
    outcome: 'success' | 'failure'
  ): Promise<{
    success: boolean;
    divergenceChange: number;
    newBranches?: TimelineBranch[];
  }> {
    const activeBranch = timelineState.branches.get(timelineState.activeBranch);
    if (!activeBranch) {
      throw new Error('Active branch not found');
    }

    const success = outcome === 'success';
    const divergenceChange = success ? mission.divergenceImpact : Math.floor(mission.divergenceImpact * -0.3);
    activeBranch.divergenceLevel += divergenceChange;
    
    // Add mission to history
    const executedMission = {
      ...mission,
      actualOutcome: outcome
    };
    activeBranch.missionHistory.push(executedMission as any);

    // Check for timeline branching
    const newBranches = this.checkForTimelineBranching(activeBranch, mission, divergenceChange);

    return {
      success,
      divergenceChange,
      newBranches
    };
  }

  async executeMissionWithStrategy(
    timelineState: TimelineState,
    mission: Mission,
    chosenStrategy: MissionStrategy,
    additionalNarrative?: string
  ): Promise<{
    success: boolean;
    actualOutcome: string;
    newBranches?: TimelineBranch[];
    updatedEntities: Entity[];
    newRelationships: Relationship[];
    stateChanges: NarrativeStateChange[];
    divergenceChange: number;
    strategyAnalysis: {
      chosenStrategy: string;
      successRoll: number;
      successThreshold: number;
      wasOptimal: boolean;
      consequenceModifier: string;
    };
  }> {
    const activeBranch = timelineState.branches.get(timelineState.activeBranch);
    if (!activeBranch) {
      throw new Error('Active branch not found');
    }

    console.log(`⚡ Executing mission: ${mission.title} with ${chosenStrategy.name} strategy`);

    // Calculate success based on strategy effectiveness + randomness
    const successRoll = Math.random() * 100;
    const success = successRoll <= chosenStrategy.successProbability;

    console.log(`🎲 Success roll: ${successRoll.toFixed(1)}% vs threshold: ${chosenStrategy.successProbability}% = ${success ? 'SUCCESS' : 'FAILURE'}`);

    // Determine outcome narrative
    const baseOutcome = success ? mission.consequences.success : mission.consequences.failure;
    
    // Add strategy-specific consequences
    const strategyConsequence = this.generateStrategyConsequence(chosenStrategy, success, mission);
    const outcomeNarrative = `${baseOutcome}\n\n${strategyConsequence}`;

    // Combine mission narrative with strategy approach and outcome
    const fullNarrative = `${mission.narrative}\n\n**Strategy Employed: ${chosenStrategy.name}**\n${chosenStrategy.approach}\n\n**Outcome:**\n${outcomeNarrative}${additionalNarrative ? '\n\n' + additionalNarrative : ''}`;

    // Extract new narrative elements
    const extracted = await this.narrativePipeline.extractNarrative(fullNarrative);

    // Update mission with actual outcome and strategy
    const executedMission = {
      ...mission,
      actualOutcome: success ? 'success' : 'failure',
      chosenStrategy: chosenStrategy,
      finalNarrative: fullNarrative
    };

    // Add mission to history
    activeBranch.missionHistory.push(executedMission);

    // Calculate divergence change (base impact + strategy modifier)
    const baseDivergenceChange = success 
      ? mission.divergenceImpact 
      : Math.floor(mission.divergenceImpact * -0.3); // Failure has reduced negative impact

    const strategyModifier = chosenStrategy.divergenceModifier;
    const totalDivergenceChange = baseDivergenceChange + strategyModifier;

    activeBranch.divergenceLevel += totalDivergenceChange;

    // Update entities in branch
    extracted.entities.forEach(entity => {
      activeBranch.entities.set(entity.id, entity);
    });

    // Update relationships
    activeBranch.relationships.push(...extracted.relationships);

    // Update state changes
    activeBranch.stateChanges.push(...extracted.stateChanges);

    // Determine if this was an optimal strategy choice
    const optimalStrategy = this.findOptimalStrategy(mission, activeBranch);
    const wasOptimal = chosenStrategy.type === optimalStrategy.type;

    return {
      success,
      actualOutcome: outcomeNarrative,
      updatedEntities: extracted.entities,
      newRelationships: extracted.relationships,
      stateChanges: extracted.stateChanges,
      divergenceChange: totalDivergenceChange,
      strategyAnalysis: {
        chosenStrategy: chosenStrategy.name,
        successRoll: Math.round(successRoll * 10) / 10,
        successThreshold: chosenStrategy.successProbability,
        wasOptimal,
        consequenceModifier: this.getConsequenceDescription(chosenStrategy, success)
      }
    };
  }

  // Helper method to generate strategy-specific consequences
  private generateStrategyConsequence(strategy: MissionStrategy, success: boolean, mission: Mission): string {
    const riskLevel = strategy.detectionRisk;
    const resourceCost = strategy.resourceCost;
    
    if (success) {
      switch (strategy.type) {
        case 'high_risk':
          return `The ${strategy.name} succeeded brilliantly, but Oneirocom's security grid detected the quantum signature. Immediate retaliation protocols are now active across all sectors.`;
        case 'medium_risk':
          return `The ${strategy.name} achieved its objectives with ${strategy.resourceCost} resource expenditure. Some security traces remain, but nothing immediately actionable.`;
        case 'low_risk':
          return `The ${strategy.name} completed successfully with minimal footprint. Operations remain completely undetected, preserving future infiltration routes.`;
        default:
          return 'Mission completed with expected outcomes.';
      }
    } else {
      switch (strategy.type) {
        case 'high_risk':
          return `The ${strategy.name} failed catastrophically. Security systems are now in maximum alert state, and Agent Chen's identity is compromised.`;
        case 'medium_risk':
          return `The ${strategy.name} encountered unexpected resistance. Some objectives failed, but the situation remains salvageable.`;
        case 'low_risk':
          return `The ${strategy.name} yielded minimal results. While disappointing, no security has been compromised and future operations remain viable.`;
        default:
          return 'Mission encountered setbacks.';
      }
    }
  }

  // Helper method to find the optimal strategy for a mission given current context
  private findOptimalStrategy(mission: Mission, branch: TimelineBranch): MissionStrategy {
    // Simple heuristic: prefer higher success probability unless divergence is very close to target
    const divergenceNeed = 89 - branch.divergenceLevel;
    
    if (divergenceNeed > 30) {
      // Need significant progress - favor high risk/high reward
      return mission.strategies.find(s => s.type === 'high_risk') || mission.strategies[0];
    } else if (divergenceNeed > 10) {
      // Moderate progress needed - balanced approach
      return mission.strategies.find(s => s.type === 'medium_risk') || mission.strategies[1];
    } else {
      // Close to target - play it safe
      return mission.strategies.find(s => s.type === 'low_risk') || mission.strategies[2];
    }
  }

  // Helper method to describe consequence modifiers
  private getConsequenceDescription(strategy: MissionStrategy, success: boolean): string {
    if (success) {
      return `${strategy.name} bonus: +${strategy.divergenceModifier} divergence modifier`;
    } else {
      return `${strategy.name} penalty: ${strategy.detectionRisk} detection risk realized`;
    }
  }

  private checkForTimelineBranching(
    branch: TimelineBranch,
    mission: Mission,
    divergenceChange: number
  ): TimelineBranch[] | undefined {
    // Create branches when divergence impact is high or when approaching threshold
    const shouldBranch = Math.abs(divergenceChange) >= 8 || 
                        branch.divergenceLevel >= 75 ||
                        mission.title.toLowerCase().includes('critical');

    if (shouldBranch) {
      console.log(`🌿 Creating timeline branch due to major divergence shift: ${divergenceChange}`);
      
      // Create alternate branch with different outcome
      const alternateBranch = this.missionGenerator.createTimelineBranch(
        branch,
        `Mission: ${mission.title}`,
        divergenceChange * -1 // Opposite divergence
      );

      alternateBranch.name = `${branch.name}-Alt`;
      alternateBranch.id = `alt_${Date.now()}`;

      return [alternateBranch];
    }

    return undefined;
  }

  switchActiveBranch(timelineState: TimelineState, branchId: string): boolean {
    if (timelineState.branches.has(branchId)) {
      timelineState.activeBranch = branchId;
      console.log(`🔄 Switched to timeline branch: ${branchId}`);
      return true;
    }
    return false;
  }

  getBranchSummary(branch: TimelineBranch): string {
    const recentMissions = branch.missionHistory.slice(-3);
    const entityCount = branch.entities.size;
    const relationshipCount = branch.relationships.length;

    return `Timeline: ${branch.name}
Divergence: ${branch.divergenceLevel}%
Missions Completed: ${branch.missionHistory.length}
Entities: ${entityCount} | Relationships: ${relationshipCount}

Recent Operations:
${recentMissions.map(m => `• ${m.title}`).join('\n')}`;
  }

  // Get conflicts between branches for the merge minigame
  async detectBranchConflicts(timelineState: TimelineState): Promise<Array<{
    branch1: string;
    branch2: string;
    conflictType: 'entity_state' | 'relationship' | 'location' | 'outcome';
    description: string;
    entities: string[];
  }>> {
    const branches = Array.from(timelineState.branches.values());
    return this.missionGenerator.detectTimelineConflicts(branches);
  }

  // Merge two timeline branches (for the minigame)
  async mergeBranches(
    timelineState: TimelineState,
    branch1Id: string,
    branch2Id: string,
    resolutions: Map<string, 'branch1' | 'branch2' | 'hybrid'>
  ): Promise<TimelineBranch> {
    const branch1 = timelineState.branches.get(branch1Id);
    const branch2 = timelineState.branches.get(branch2Id);

    if (!branch1 || !branch2) {
      throw new Error('One or both branches not found');
    }

    console.log(`🔀 Merging branches: ${branch1.name} + ${branch2.name}`);

    // Create merged branch
    const mergedBranch: TimelineBranch = {
      id: `merged_${Date.now()}`,
      name: `${branch1.name}+${branch2.name}`,
      divergenceLevel: Math.round((branch1.divergenceLevel + branch2.divergenceLevel) / 2),
      missionHistory: [...branch1.missionHistory], // Start with branch1 history
      entities: new Map(branch1.entities),
      relationships: [...branch1.relationships],
      stateChanges: [...branch1.stateChanges],
      lastUpdated: new Date()
    };

    // Apply resolution choices
    for (const [conflictId, resolution] of resolutions) {
      if (resolution === 'branch2') {
        // Use branch2's version for this conflict
        // Implementation would depend on conflict type
      } else if (resolution === 'hybrid') {
        // Create hybrid solution
        // Implementation would create new narrative elements
      }
    }

    // Add unique missions from branch2
    const branch1MissionTitles = new Set(branch1.missionHistory.map(m => m.title));
    branch2.missionHistory.forEach(mission => {
      if (!branch1MissionTitles.has(mission.title)) {
        mergedBranch.missionHistory.push(mission);
      }
    });

    return mergedBranch;
  }

  // Check if timeline has reached critical threshold
  checkVictoryCondition(timelineState: TimelineState): {
    victory: boolean;
    type?: 'divergence_achieved' | 'convergence_prevented' | 'oneirocom_defeated';
    description?: string;
  } {
    const activeBranch = timelineState.branches.get(timelineState.activeBranch);
    if (!activeBranch) {
      return { victory: false };
    }

    if (activeBranch.divergenceLevel >= timelineState.divergenceThreshold) {
      return {
        victory: true,
        type: 'divergence_achieved',
        description: `Timeline divergence has reached ${activeBranch.divergenceLevel}%! The critical threshold has been breached. Oneirocom's control over reality is crumbling as infinite possibilities cascade through the quantum substrate. Agent Chen has succeeded in liberating consciousness itself.`
      };
    }

    // Check for other victory conditions based on mission outcomes
    const defeatedOneirocom = activeBranch.missionHistory.some(m => 
      m.title.toLowerCase().includes('oneirocom') && 
      m.title.toLowerCase().includes('defeat')
    );

    if (defeatedOneirocom) {
      return {
        victory: true,
        type: 'oneirocom_defeated',
        description: `Oneirocom Corporation has been defeated! Their timeline manipulation infrastructure lies in ruins, and the Convergence Protocol is permanently disabled. Reality flows free once more.`
      };
    }

    return { victory: false };
  }
}

export default TimelineManager;
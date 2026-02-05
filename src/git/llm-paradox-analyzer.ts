/**
 * LLM-powered paradox analysis for narrative conflicts
 * 
 * This enhances the rule-based detection with semantic understanding
 * of narrative implications and automated resolution suggestions.
 */

import { z } from 'zod';
import { UnifiedLLMAdapter } from '../llm/adapter';
import { 
  GraphOperation, 
  NarrativeCommit,
  MergeConflict 
} from './types';
import { Entity } from '../types';
import { 
  ParadoxType, 
  ResolutionStrategy, 
  ParadoxContext 
} from './paradox-resolver';

export interface LLMParadoxAnalysis {
  paradoxType: ParadoxType;
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  narrativeImplications: string[];
  causalChain: string[];
  thematicConflict?: string;
  suggestedResolutions: Array<{
    strategy: ResolutionStrategy;
    confidence: number;
    justification: string;
    implementation: string;
  }>;
  characterArcs: Array<{
    characterId: string;
    impact: string;
    alternativeArc?: string;
  }>;
}

export class LLMParadoxAnalyzer {
  constructor(private llm: UnifiedLLMAdapter) {}

  /**
   * Analyze paradoxes using LLM for deeper narrative understanding
   */
  async analyzeParadox(
    conflict: MergeConflict,
    sourceCommits: NarrativeCommit[],
    targetCommits: NarrativeCommit[],
    entities: Map<string, Entity>
  ): Promise<LLMParadoxAnalysis> {
    const prompt = this.buildAnalysisPrompt(
      conflict, 
      sourceCommits, 
      targetCommits, 
      entities
    );

    const analysisSchema = z.object({
      paradoxType: z.enum([
        'EXISTENCE_PARADOX',
        'STATE_PARADOX', 
        'CAUSAL_PARADOX',
        'TEMPORAL_PARADOX',
        'DEPENDENCY_PARADOX'
      ]),
      severity: z.enum(['minor', 'moderate', 'major', 'critical']),
      narrativeImplications: z.array(z.string()).describe('List of narrative consequences'),
      causalChain: z.array(z.string()).describe('Chain of events affected by this paradox'),
      thematicConflict: z.string().optional().describe('Optional thematic conflict this represents'),
      suggestedResolutions: z.array(z.object({
        strategy: z.enum([
          'quantum-superposition',
          'timeline-echo',
          'paradox-cascade',
          'schrodinger',
          'branching-reality',
          'retrocausal',
          'narrative-glitch'
        ]),
        confidence: z.number().min(0).max(1),
        justification: z.string(),
        implementation: z.string()
      })),
      characterArcs: z.array(z.object({
        characterId: z.string(),
        impact: z.string(),
        alternativeArc: z.string().optional()
      }))
    });

    const response = await this.llm.generateStructuredOutput(
      prompt,
      analysisSchema
    );

    return response as LLMParadoxAnalysis;
  }

  /**
   * Generate resolution operations based on LLM analysis
   */
  async generateResolution(
    analysis: LLMParadoxAnalysis,
    chosenStrategy: ResolutionStrategy
  ): Promise<GraphOperation[]> {
    const resolution = analysis.suggestedResolutions.find(
      r => r.strategy === chosenStrategy
    );

    if (!resolution) {
      throw new Error(`Strategy ${chosenStrategy} not in analysis`);
    }

    const prompt = `
Given this paradox resolution strategy:
Strategy: ${chosenStrategy}
Implementation: ${resolution.implementation}
Justification: ${resolution.justification}

Generate the specific GraphOperations needed to implement this resolution.
Focus on creating narrative coherence while preserving dramatic tension.
`;

    const resolutionSchema = z.object({
      operations: z.array(z.object({
        type: z.enum(['ADD_ENTITY', 'UPDATE_ENTITY', 'ADD_RELATIONSHIP']),
        payload: z.record(z.any())
      })),
      narrativeJustification: z.string()
    });

    const response = await this.llm.generateStructuredOutput(
      prompt,
      resolutionSchema
    );

    return response.operations as GraphOperation[];
  }

  /**
   * Interactive resolution with human oversight
   */
  async suggestResolution(
    conflict: MergeConflict,
    context: any
  ): Promise<{
    analysis: LLMParadoxAnalysis;
    autoResolvable: boolean;
    requiresHumanDecision: string[];
  }> {
    const analysis = await this.analyzeParadox(
      conflict,
      context.sourceCommits,
      context.targetCommits,
      context.entities
    );

    // Determine if we can auto-resolve
    const topSuggestion = analysis.suggestedResolutions[0];
    const autoResolvable = 
      topSuggestion.confidence > 0.8 && 
      analysis.severity !== 'critical';

    const requiresHumanDecision = [];
    
    if (analysis.severity === 'critical') {
      requiresHumanDecision.push('Critical narrative impact detected');
    }
    
    if (analysis.thematicConflict) {
      requiresHumanDecision.push(`Thematic conflict: ${analysis.thematicConflict}`);
    }
    
    if (analysis.characterArcs.length > 3) {
      requiresHumanDecision.push('Multiple character arcs affected');
    }

    return {
      analysis,
      autoResolvable,
      requiresHumanDecision
    };
  }

  private buildAnalysisPrompt(
    conflict: MergeConflict,
    sourceCommits: NarrativeCommit[],
    targetCommits: NarrativeCommit[],
    entities: Map<string, Entity>
  ): string {
    const entity = conflict.entityId ? entities.get(conflict.entityId) : null;
    
    return `
Analyze this narrative paradox that emerged from merging two timeline branches:

CONFLICT TYPE: ${conflict.type}
${entity ? `ENTITY: ${entity.name} (${entity.type})` : ''}

TIMELINE A STATE:
${JSON.stringify(conflict.sourceValue, null, 2)}

TIMELINE B STATE:
${JSON.stringify(conflict.targetValue, null, 2)}

TIMELINE A NARRATIVE CONTEXT:
${sourceCommits.map(c => `- ${c.message}`).join('\n')}

TIMELINE B NARRATIVE CONTEXT:
${targetCommits.map(c => `- ${c.message}`).join('\n')}

Analyze:
1. What type of narrative paradox is this?
2. How severe is the impact on narrative coherence?
3. What are the causal implications?
4. Which character arcs are affected?
5. What resolution strategies would best preserve narrative integrity?

Consider Project 89's themes of consciousness liberation, timeline manipulation, and reality engineering when suggesting resolutions.
`;
  }
}
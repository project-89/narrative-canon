import { z } from 'zod';
import { LLMAdapter } from '../types';
import { RelationshipType } from '../narrative-taxonomy';

// Comprehensive relationship types that cover all LLM outputs
const RELATIONSHIP_TYPES = [
  // Social relationships
  'family', 'friendship', 'romantic', 'professional', 'enemy', 'mentor',
  'alliance', 'allies', 'partnership', 'rivalry', 'conflict',
  
  // Possession/spatial
  'owns', 'carries', 'contains', 'lives_in', 'visits', 'belongs_to',
  'located_in', 'part_of', 'includes',
  
  // Power/influence
  'serves', 'leads', 'follows', 'commands', 'reports_to', 'governs',
  'controls', 'influences', 'fears', 'trusts', 'betrays', 'protects',
  
  // Action/interaction
  'uses', 'utilizes', 'operates', 'interacts_with', 'communicates_with',
  'works_with', 'collaborates', 'cooperates', 'opposes', 'fights',
  
  // Creation/transformation
  'creates', 'builds', 'makes', 'produces', 'generates', 'destroys',
  'transforms', 'modifies', 'repairs', 'damages',
  
  // Information/knowledge
  'knows_about', 'learns_from', 'teaches', 'informs', 'discovers',
  'reveals', 'hides', 'transfers_to', 'shares_with',
  
  // Support/opposition
  'supports', 'helps', 'assists', 'enables', 'prevents', 'blocks',
  'opposes', 'resists', 'challenges',
  
  // Temporal/causal
  'causes', 'results_in', 'leads_to', 'prevents', 'enables',
  'precedes', 'follows', 'occurs_with',
  
  // Emotional/psychological
  'loves', 'hates', 'admires', 'respects', 'despises', 'acknowledges',
  'appreciates', 'values', 'dismisses'
] as const;

export const RelationshipSchema = z.object({
  id: z.string().optional(),
  source: z.string(),
  target: z.string(),
  type: z.enum(RELATIONSHIP_TYPES),
  description: z.string().optional(),
  strength: z.number().min(0).max(1).optional(),
  directionality: z.enum(['unidirectional', 'bidirectional']).optional(),
  temporality: z.enum(['permanent', 'temporary', 'evolving']).optional(),
  
  // Flexible evidence handling
  evidence: z.union([z.string(), z.array(z.string())]).optional(),
  
  // Flexible emotional context - can be nested object or flat fields
  emotional_context: z.object({
    source: z.string().optional(),
    target: z.string().optional(),
    overall_tone: z.enum(['positive', 'negative', 'neutral', 'complex']).optional()
  }).optional(),
  source_emotion: z.string().optional(),
  target_emotion: z.string().optional(),
  overall_tone: z.enum(['positive', 'negative', 'neutral', 'complex']).optional(),
  
  first_mentioned: z.number().optional(),
  scene_context: z.string().optional()
});

export type RelationshipData = z.infer<typeof RelationshipSchema>;

export function normalizeRelationship(data: RelationshipData): RelationshipData & { id: string } {
  const emotionalContext = data.emotional_context || {};
  
  return {
    id: data.id || `${data.source}_${data.target}_${data.type}`,
    source: data.source,
    target: data.target,
    type: data.type,
    description: data.description || `${data.source} ${data.type} ${data.target}`,
    strength: data.strength || 0.5,
    directionality: data.directionality || 'unidirectional',
    temporality: data.temporality || 'evolving',
    evidence: Array.isArray(data.evidence) ? data.evidence : data.evidence ? [data.evidence] : [],
    source_emotion: data.source_emotion || emotionalContext.source,
    target_emotion: data.target_emotion || emotionalContext.target,
    overall_tone: data.overall_tone || emotionalContext.overall_tone || 'neutral',
    first_mentioned: data.first_mentioned || 0,
    scene_context: data.scene_context,
    emotional_context: data.emotional_context
  };
}

export const RelationshipExtractionResponse = z.object({
  relationships: z.array(RelationshipSchema)
});

export class RelationshipLLMExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractRelationships(
    text: string,
    knownEntities: any[] = [],
    existingRelationships: any[] = [],
    sceneContext?: {sceneNumber: number, entities: string[]}
  ): Promise<(RelationshipData & { id: string })[]> {
    
    const entityNames = knownEntities.map(e => e.name).join(', ');
    const existingRels = existingRelationships
      .map(r => `${r.source}-[${r.type}]->${r.target}`)
      .join(', ');

    const prompt = `
You are extracting RELATIONSHIPS from a narrative scene for a story graph that tracks character dynamics and plot evolution.

RELATIONSHIP EXTRACTION GUIDELINES:

1. RELATIONSHIP TYPES TO IDENTIFY:

   SOCIAL RELATIONSHIPS:
   - family: Blood relations, adoptive family, marriage
   - friendship: Positive social bonds, allies, companions  
   - romantic: Love interests, marriages, intimate relationships
   - professional: Work relationships, hierarchies, partnerships
   - enemy: Antagonistic relationships, conflicts, rivalries
   - mentor: Teaching/learning relationships, guidance

   POSSESSION/SPATIAL:
   - owns: Legal or effective ownership
   - carries: Physical possession/transport
   - lives_in: Residential relationships
   - visits: Temporary spatial relationships
   - belongs_to: Membership or association
   - contains: Spatial containment

   POWER/INFLUENCE:
   - serves: Service relationships, loyalty
   - leads: Authority, command, direction
   - follows: Subordination, discipleship
   - fears: Fear-based relationships
   - trusts: Trust and confidence
   - betrays: Broken trust, treachery
   - protects: Protective relationships

   CONCEPTUAL:
   - supports: Ideological or practical support
   - opposes: Opposition to ideas/goals
   - creates: Creative or causal relationships
   - destroys: Destructive relationships

2. RELATIONSHIP ANALYSIS:

   STRENGTH (0.0-1.0):
   - 0.9-1.0: Central to character identity (parent/child, sworn enemies)
   - 0.7-0.8: Major relationship (close friends, romantic partners)
   - 0.5-0.6: Moderate connection (colleagues, acquaintances)
   - 0.3-0.4: Weak connection (distant relations, brief interactions)
   - 0.1-0.2: Minimal connection (mentioned in passing)

   DIRECTIONALITY:
   - unidirectional: One-way relationship (A loves B, but B doesn't love A)
   - bidirectional: Mutual relationship (mutual friendship, mutual hatred)

   TEMPORALITY:
   - permanent: Unlikely to change (family, sworn oaths)
   - temporary: Expected to end (business partnerships, temporary alliances)
   - evolving: Actively changing (friendship turning to romance)

   EMOTIONAL CONTEXT:
   - Identify emotions of each party in the relationship
   - Determine overall tone (positive/negative/neutral/complex)

3. EVIDENCE REQUIREMENTS:
   - Provide specific text evidence for each relationship
   - Quote or paraphrase supporting passages
   - Ensure relationships are actually demonstrated, not assumed

4. CONTEXTUAL CONSIDERATIONS:
   - Focus on relationships active or referenced in this scene
   - Note how relationships are revealed or developed
   - Consider both explicit statements and implicit evidence

KNOWN ENTITIES:
${entityNames || 'None yet'}

EXISTING RELATIONSHIPS TO AVOID DUPLICATING:
${existingRels || 'None yet'}

${sceneContext ? `
SCENE CONTEXT:
Scene #${sceneContext.sceneNumber} featuring: ${sceneContext.entities.join(', ')}
Focus on relationships involving these entities or revealed in this scene.
` : ''}

TEXT TO ANALYZE:
"""
${text}
"""

Extract ALL relationships that can be evidenced from this text. Be precise about relationship types and provide strong textual evidence.`;

    const response = await this.llmAdapter.generateStructuredOutput(
      prompt,
      RelationshipExtractionResponse
    );

    return response.relationships.map(rel => normalizeRelationship(rel));
  }
}
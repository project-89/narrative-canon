/**
 * Paradox Resolution System for Timeline Merges
 * 
 * Handles complex narrative conflicts that arise when merging divergent timelines,
 * especially those involving fundamental contradictions like life/death states.
 */

import { 
  GraphOperation, 
  MergeConflict,
  UpdateEntityOperation,
  AddEntityOperation,
  RemoveEntityOperation 
} from './types';
import { Entity } from '../types';

export type ParadoxType = 
  | 'EXISTENCE_PARADOX'     // Entity exists in one timeline but not another
  | 'STATE_PARADOX'         // Same entity has contradictory states
  | 'CAUSAL_PARADOX'        // Event depends on something that didn't happen
  | 'TEMPORAL_PARADOX'      // Events occur in impossible order
  | 'DEPENDENCY_PARADOX';   // Later events depend on contradicted earlier events

export type ResolutionStrategy =
  | 'quantum-superposition'  // Entity exists in multiple states simultaneously
  | 'timeline-echo'         // Dead but influence persists as "echo"
  | 'paradox-cascade'       // Conflict creates new narrative phenomenon
  | 'schrodinger'          // State depends on observer
  | 'branching-reality'    // Reality splits, both versions true
  | 'retrocausal'          // Future events alter past
  | 'narrative-glitch';    // Paradox becomes plot device

export interface ParadoxContext {
  type: ParadoxType;
  entityId: string;
  conflictingStates: {
    timeline1: any;
    timeline2: any;
  };
  dependencies: string[]; // Other entities/events affected
  narrativeImpact: 'minor' | 'moderate' | 'major' | 'critical';
}

export interface ResolutionResult {
  strategy: ResolutionStrategy;
  operations: GraphOperation[];
  sideEffects: Array<{
    description: string;
    entityId?: string;
    operation: GraphOperation;
  }>;
  narrativeJustification: string;
}

export class ParadoxResolver {
  /**
   * Analyze operations to detect paradoxes
   */
  static detectParadoxes(
    sourceOps: GraphOperation[],
    targetOps: GraphOperation[],
    currentState: Map<string, Entity>
  ): ParadoxContext[] {
    const paradoxes: ParadoxContext[] = [];
    
    // Build operation maps by entity
    const sourceByEntity = this.groupOperationsByEntity(sourceOps);
    const targetByEntity = this.groupOperationsByEntity(targetOps);
    
    // Check each entity that appears in both timelines
    const allEntityIds = new Set([
      ...sourceByEntity.keys(),
      ...targetByEntity.keys()
    ]);
    
    for (const entityId of allEntityIds) {
      const sourceOps = sourceByEntity.get(entityId) || [];
      const targetOps = targetByEntity.get(entityId) || [];
      
      // Check for existence paradox
      const sourceRemoved = sourceOps.some(op => op.type === 'REMOVE_ENTITY');
      const targetExists = !targetOps.some(op => op.type === 'REMOVE_ENTITY');
      
      if (sourceRemoved && targetExists) {
        // Entity is dead in source but alive in target
        const dependencies = this.findDependentEntities(entityId, targetOps);
        
        paradoxes.push({
          type: 'EXISTENCE_PARADOX',
          entityId,
          conflictingStates: {
            timeline1: 'dead',
            timeline2: 'alive'
          },
          dependencies,
          narrativeImpact: dependencies.length > 5 ? 'critical' : 
                          dependencies.length > 2 ? 'major' : 'moderate'
        });
      }
      
      // Check for state paradoxes
      const sourceState = this.computeEntityState(entityId, sourceOps);
      const targetState = this.computeEntityState(entityId, targetOps);
      
      if (sourceState && targetState && this.hasConflictingStates(sourceState, targetState)) {
        paradoxes.push({
          type: 'STATE_PARADOX',
          entityId,
          conflictingStates: {
            timeline1: sourceState,
            timeline2: targetState
          },
          dependencies: [],
          narrativeImpact: 'moderate'
        });
      }
    }
    
    return paradoxes;
  }
  
  /**
   * Resolve a specific paradox with chosen strategy
   */
  static resolveParadox(
    paradox: ParadoxContext,
    strategy: ResolutionStrategy,
    context: {
      sourceOps: GraphOperation[],
      targetOps: GraphOperation[],
      currentState: Map<string, Entity>
    }
  ): ResolutionResult {
    switch (strategy) {
      case 'quantum-superposition':
        return this.resolveQuantumSuperposition(paradox, context);
        
      case 'timeline-echo':
        return this.resolveTimelineEcho(paradox, context);
        
      case 'paradox-cascade':
        return this.resolveParadoxCascade(paradox, context);
        
      case 'schrodinger':
        return this.resolveSchrodinger(paradox, context);
        
      case 'branching-reality':
        return this.resolveBranchingReality(paradox, context);
        
      case 'retrocausal':
        return this.resolveRetrocausal(paradox, context);
        
      case 'narrative-glitch':
        return this.resolveNarrativeGlitch(paradox, context);
        
      default:
        throw new Error(`Unknown resolution strategy: ${strategy}`);
    }
  }
  
  /**
   * Quantum Superposition Resolution
   * Entity exists in multiple states simultaneously
   */
  private static resolveQuantumSuperposition(
    paradox: ParadoxContext,
    context: any
  ): ResolutionResult {
    const operations: GraphOperation[] = [];
    const sideEffects: any[] = [];
    
    // Create quantum entity that exists in superposition
    const quantumEntity: UpdateEntityOperation = {
      id: `quantum_${paradox.entityId}_${Date.now()}`,
      type: 'UPDATE_ENTITY',
      timestamp: Date.now(),
      payload: {
        entityId: paradox.entityId,
        changes: {
          properties: {
            quantumState: 'superposed',
            states: {
              collapsed: paradox.conflictingStates.timeline1,
              potential: paradox.conflictingStates.timeline2
            },
            observerDependent: true,
            schrodingerField: true
          },
          description: `Exists in quantum superposition between ${JSON.stringify(paradox.conflictingStates.timeline1)} and ${JSON.stringify(paradox.conflictingStates.timeline2)}`
        }
      },
      metadata: {
        reason: 'Quantum superposition resolution',
        impact: 'major'
      }
    };
    
    operations.push(quantumEntity);
    
    // Create observation mechanics for dependent entities
    for (const depId of paradox.dependencies) {
      const observerMechanic: UpdateEntityOperation = {
        id: `observer_${depId}_${Date.now()}`,
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: depId,
          changes: {
            properties: {
              quantumAware: true,
              canObserve: [paradox.entityId],
              observationInfluence: 'collapse-on-interaction'
            }
          }
        }
      };
      
      operations.push(observerMechanic);
      sideEffects.push({
        description: `Entity ${depId} gains quantum observation ability`,
        entityId: depId,
        operation: observerMechanic
      });
    }
    
    return {
      strategy: 'quantum-superposition',
      operations,
      sideEffects,
      narrativeJustification: `The conflicting states of ${paradox.entityId} create a quantum superposition where the entity exists in multiple states simultaneously. Observation by other characters determines which state manifests in their reality.`
    };
  }
  
  /**
   * Timeline Echo Resolution
   * Entity is gone but their influence persists as an "echo"
   */
  private static resolveTimelineEcho(
    paradox: ParadoxContext,
    context: any
  ): ResolutionResult {
    const operations: GraphOperation[] = [];
    const sideEffects: any[] = [];
    
    // Create echo entity
    const echoEntity: AddEntityOperation = {
      id: `echo_${paradox.entityId}_${Date.now()}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: `${paradox.entityId}_echo`,
        type: 'echo',
        name: `Echo of ${paradox.entityId}`,
        description: 'A temporal echo from an alternate timeline',
        properties: {
          originalEntity: paradox.entityId,
          echoStrength: this.calculateEchoStrength(paradox),
          manifestation: 'memories-and-influence',
          alternateTimelineState: paradox.conflictingStates.timeline2
        }
      }
    };
    
    operations.push(echoEntity);
    
    // Update dependent entities to interact with echo
    for (const depId of paradox.dependencies) {
      const echoInteraction: UpdateEntityOperation = {
        id: `echo_interaction_${depId}_${Date.now()}`,
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: depId,
          changes: {
            properties: {
              echoSensitive: true,
              perceivesEcho: `${paradox.entityId}_echo`,
              echoInfluence: 'guidance-through-memory'
            }
          }
        }
      };
      
      operations.push(echoInteraction);
      sideEffects.push({
        description: `${depId} can perceive and interact with the echo`,
        entityId: depId,
        operation: echoInteraction
      });
    }
    
    return {
      strategy: 'timeline-echo',
      operations,
      sideEffects,
      narrativeJustification: `Though ${paradox.entityId} ceased to exist in one timeline, their influence persists as a temporal echo. This echo carries knowledge and guidance from the alternate timeline where they survived.`
    };
  }
  
  /**
   * Paradox Cascade Resolution
   * The paradox itself becomes a narrative phenomenon
   */
  private static resolveParadoxCascade(
    paradox: ParadoxContext,
    context: any
  ): ResolutionResult {
    const operations: GraphOperation[] = [];
    const sideEffects: any[] = [];
    
    // Create paradox entity as a narrative element
    const paradoxEntity: AddEntityOperation = {
      id: `paradox_${Date.now()}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: `paradox_${paradox.entityId}`,
        type: 'phenomenon',
        name: `${paradox.entityId} Paradox`,
        description: 'A reality-warping paradox creating narrative instability',
        properties: {
          paradoxType: paradox.type,
          affectedEntity: paradox.entityId,
          instabilityLevel: paradox.narrativeImpact,
          manifestations: [
            'reality-glitches',
            'temporal-loops',
            'memory-conflicts',
            'causality-violations'
          ],
          resolution: 'requires-narrative-action'
        }
      }
    };
    
    operations.push(paradoxEntity);
    
    // Create glitch zones around dependent entities
    for (const depId of paradox.dependencies) {
      const glitchZone: AddEntityOperation = {
        id: `glitch_${depId}_${Date.now()}`,
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: `glitch_zone_${depId}`,
          type: 'location',
          name: `Reality Glitch near ${depId}`,
          description: 'A zone where paradox effects manifest',
          properties: {
            glitchType: 'paradox-cascade',
            severity: paradox.narrativeImpact,
            effects: [
              'temporal-instability',
              'memory-fragmentation',
              'reality-bleed'
            ]
          }
        }
      };
      
      operations.push(glitchZone);
      sideEffects.push({
        description: `Reality glitch zone created near ${depId}`,
        entityId: depId,
        operation: glitchZone
      });
    }
    
    return {
      strategy: 'paradox-cascade',
      operations,
      sideEffects,
      narrativeJustification: `The irreconcilable paradox of ${paradox.entityId} creates a cascade effect that manifests as reality glitches throughout the narrative. These glitches become plot devices that characters must navigate and potentially resolve.`
    };
  }
  
  /**
   * Schrödinger Resolution
   * Entity state depends on observer
   */
  private static resolveSchrodinger(
    paradox: ParadoxContext,
    context: any
  ): ResolutionResult {
    const operations: GraphOperation[] = [];
    const sideEffects: any[] = [];
    
    // Update entity to Schrödinger state
    const schrodingerEntity: UpdateEntityOperation = {
      id: `schrodinger_${paradox.entityId}_${Date.now()}`,
      type: 'UPDATE_ENTITY',
      timestamp: Date.now(),
      payload: {
        entityId: paradox.entityId,
        changes: {
          properties: {
            schrodingerState: true,
            observerStates: {
              default: paradox.conflictingStates.timeline1,
              awakened: paradox.conflictingStates.timeline2
            },
            collapseRules: {
              trigger: 'direct-observation',
              persistence: 'observer-dependent',
              consensus: 'majority-collapse'
            }
          }
        }
      }
    };
    
    operations.push(schrodingerEntity);
    
    // Create observation framework
    const observationFramework: AddEntityOperation = {
      id: `obs_framework_${Date.now()}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: 'schrodinger_observation_framework',
        type: 'system',
        name: 'Schrödinger Observation Framework',
        description: 'Determines how reality collapses based on observation',
        properties: {
          rules: [
            'Awakened beings see alternate states',
            'Consensus reality follows majority observation',
            'Direct interaction forces collapse'
          ]
        }
      }
    };
    
    operations.push(observationFramework);
    
    return {
      strategy: 'schrodinger',
      operations,
      sideEffects,
      narrativeJustification: `${paradox.entityId} exists in a Schrödinger state where their condition depends on the observer. Different characters literally experience different realities based on their level of awakening.`
    };
  }
  
  /**
   * Branching Reality Resolution
   * Reality splits, maintaining both versions
   */
  private static resolveBranchingReality(
    paradox: ParadoxContext,
    context: any
  ): ResolutionResult {
    const operations: GraphOperation[] = [];
    const sideEffects: any[] = [];
    
    // Create split reality marker
    const realitySplit: AddEntityOperation = {
      id: `split_${Date.now()}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: `reality_split_${paradox.entityId}`,
        type: 'phenomenon',
        name: 'Reality Bifurcation Point',
        description: 'Point where reality splits into parallel tracks',
        properties: {
          splitCause: paradox.entityId,
          branch1: {
            state: paradox.conflictingStates.timeline1,
            probability: 0.5
          },
          branch2: {
            state: paradox.conflictingStates.timeline2,
            probability: 0.5
          },
          navigationMethod: 'consciousness-shift'
        }
      }
    };
    
    operations.push(realitySplit);
    
    // Create parallel versions of dependent entities
    for (const depId of paradox.dependencies) {
      const parallelAwareness: UpdateEntityOperation = {
        id: `parallel_${depId}_${Date.now()}`,
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: depId,
          changes: {
            properties: {
              parallelAware: true,
              canNavigateBranches: true,
              currentBranch: 'undetermined'
            }
          }
        }
      };
      
      operations.push(parallelAwareness);
    }
    
    return {
      strategy: 'branching-reality',
      operations,
      sideEffects,
      narrativeJustification: `Reality itself splits at the paradox point, creating parallel narrative tracks. Both versions of ${paradox.entityId} exist in separate but occasionally intersecting realities.`
    };
  }
  
  /**
   * Retrocausal Resolution
   * Future events alter the past
   */
  private static resolveRetrocausal(
    paradox: ParadoxContext,
    context: any
  ): ResolutionResult {
    const operations: GraphOperation[] = [];
    const sideEffects: any[] = [];
    
    // Create retrocausal event
    const retrocausalEvent: AddEntityOperation = {
      id: `retro_${Date.now()}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: `retrocausal_${paradox.entityId}`,
        type: 'event',
        name: 'Retrocausal Intervention',
        description: 'Future knowledge alters past events',
        properties: {
          targetEntity: paradox.entityId,
          causalDirection: 'future-to-past',
          mechanism: 'information-backflow',
          result: 'paradox-prevention'
        }
      }
    };
    
    operations.push(retrocausalEvent);
    
    // Update entity with retrocausal influence
    const retrocausalUpdate: UpdateEntityOperation = {
      id: `retro_update_${Date.now()}`,
      type: 'UPDATE_ENTITY',
      timestamp: Date.now(),
      payload: {
        entityId: paradox.entityId,
        changes: {
          properties: {
            retrocausallyModified: true,
            timelineConvergence: 'prevented-divergence',
            futureKnowledge: 'integrated'
          }
        }
      }
    };
    
    operations.push(retrocausalUpdate);
    
    return {
      strategy: 'retrocausal',
      operations,
      sideEffects,
      narrativeJustification: `Information from the future flows backward to prevent the paradox. ${paradox.entityId} receives knowledge that allows them to avoid the timeline split entirely.`
    };
  }
  
  /**
   * Narrative Glitch Resolution
   * Paradox becomes a plot device/mystery
   */
  private static resolveNarrativeGlitch(
    paradox: ParadoxContext,
    context: any
  ): ResolutionResult {
    const operations: GraphOperation[] = [];
    const sideEffects: any[] = [];
    
    // Create glitch entity
    const glitchEntity: AddEntityOperation = {
      id: `glitch_${Date.now()}`,
      type: 'ADD_ENTITY',
      timestamp: Date.now(),
      payload: {
        id: `narrative_glitch_${paradox.entityId}`,
        type: 'mystery',
        name: 'The Glitch',
        description: 'An unexplained narrative anomaly requiring investigation',
        properties: {
          manifestation: 'inconsistent-memories',
          affectedEntity: paradox.entityId,
          clues: [
            'Conflicting records',
            'Witness contradictions',
            'Temporal anomalies',
            'Reality fragments'
          ],
          resolution: 'requires-investigation'
        }
      }
    };
    
    operations.push(glitchEntity);
    
    // Make entity status uncertain
    const uncertainStatus: UpdateEntityOperation = {
      id: `uncertain_${Date.now()}`,
      type: 'UPDATE_ENTITY',
      timestamp: Date.now(),
      payload: {
        entityId: paradox.entityId,
        changes: {
          properties: {
            status: 'uncertain',
            glitched: true,
            requiresInvestigation: true,
            possibleStates: [
              paradox.conflictingStates.timeline1,
              paradox.conflictingStates.timeline2
            ]
          }
        }
      }
    };
    
    operations.push(uncertainStatus);
    
    return {
      strategy: 'narrative-glitch',
      operations,
      sideEffects,
      narrativeJustification: `The paradox manifests as a narrative glitch - characters encounter conflicting evidence about ${paradox.entityId}. This mystery becomes a driving force in the plot as characters investigate the truth.`
    };
  }
  
  // Helper methods
  
  private static groupOperationsByEntity(ops: GraphOperation[]): Map<string, GraphOperation[]> {
    const grouped = new Map<string, GraphOperation[]>();
    
    for (const op of ops) {
      let entityId: string | undefined;
      
      switch (op.type) {
        case 'ADD_ENTITY':
          entityId = (op as AddEntityOperation).payload.id;
          break;
        case 'UPDATE_ENTITY':
          entityId = (op as UpdateEntityOperation).payload.entityId;
          break;
        case 'REMOVE_ENTITY':
          entityId = (op as RemoveEntityOperation).payload.entityId;
          break;
      }
      
      if (entityId) {
        const existing = grouped.get(entityId) || [];
        existing.push(op);
        grouped.set(entityId, existing);
      }
    }
    
    return grouped;
  }
  
  private static findDependentEntities(entityId: string, operations: GraphOperation[]): string[] {
    const dependents = new Set<string>();
    
    for (const op of operations) {
      if (op.type === 'ADD_RELATIONSHIP' || op.type === 'UPDATE_RELATIONSHIP') {
        const rel = (op as any).payload;
        if (rel.source === entityId || rel.target === entityId) {
          dependents.add(rel.source === entityId ? rel.target : rel.source);
        }
      }
    }
    
    return Array.from(dependents);
  }
  
  private static computeEntityState(entityId: string, operations: GraphOperation[]): any {
    let state: any = null;
    
    for (const op of operations) {
      if (op.type === 'ADD_ENTITY' && (op as AddEntityOperation).payload.id === entityId) {
        state = (op as AddEntityOperation).payload;
      } else if (op.type === 'UPDATE_ENTITY' && (op as UpdateEntityOperation).payload.entityId === entityId) {
        if (state) {
          state = { ...state, ...(op as UpdateEntityOperation).payload.changes };
        }
      } else if (op.type === 'REMOVE_ENTITY' && (op as RemoveEntityOperation).payload.entityId === entityId) {
        state = { status: 'removed', ...state };
      }
    }
    
    return state;
  }
  
  private static hasConflictingStates(state1: any, state2: any): boolean {
    // Check for direct conflicts in critical properties
    const criticalProps = ['status', 'alive', 'dead', 'exists'];
    
    for (const prop of criticalProps) {
      if (state1[prop] !== undefined && state2[prop] !== undefined && 
          state1[prop] !== state2[prop]) {
        return true;
      }
    }
    
    return false;
  }
  
  private static calculateEchoStrength(paradox: ParadoxContext): number {
    // Echo strength based on narrative impact and dependencies
    const base = paradox.narrativeImpact === 'critical' ? 0.8 :
                 paradox.narrativeImpact === 'major' ? 0.6 :
                 paradox.narrativeImpact === 'moderate' ? 0.4 : 0.2;
    
    // Increase based on number of dependencies
    const depBonus = Math.min(paradox.dependencies.length * 0.05, 0.2);
    
    return Math.min(base + depBonus, 1.0);
  }
}
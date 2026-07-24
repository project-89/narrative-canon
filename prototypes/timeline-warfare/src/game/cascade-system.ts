/**
 * Cascade System for Timeline Warfare
 * 
 * Models how changes in the timeline propagate forward,
 * creating butterfly effects that alter future events.
 */

export interface TimelineEvent {
  id: string;
  date: Date;
  description: string;
  type: 'political' | 'technological' | 'social' | 'economic' | 'environmental';
  magnitude: number; // 0-1, how significant the change is
  entities: string[];
  location?: string;
}

export interface CascadeEffect {
  sourceEventId: string;
  date: Date;
  description: string;
  probability: number; // 0-1, likelihood of occurring
  magnitude: number; // 0-1, impact strength
  type: TimelineEvent['type'];
  requiredConditions?: string[]; // Other events that must exist
}

export class CascadeSystem {
  private cascadeRules: Map<string, CascadeRule[]> = new Map();
  
  constructor() {
    this.initializeRules();
  }
  
  private initializeRules() {
    // Political cascade rules
    this.cascadeRules.set('political', [
      {
        trigger: /election.*upset|opposition.*wins/i,
        effects: [
          {
            delay: { years: 0, months: 6 },
            template: 'New administration begins investigating Oneirocom contracts',
            magnitude: 0.6,
            probability: 0.9
          },
          {
            delay: { years: 2 },
            template: 'Regulatory framework shifts against corporate surveillance',
            magnitude: 0.8,
            probability: 0.7
          },
          {
            delay: { years: 5 },
            template: 'Oneirocom loses monopoly status in {location}',
            magnitude: 0.9,
            probability: 0.5
          }
        ]
      }
    ]);
    
    // Technological cascade rules
    this.cascadeRules.set('technological', [
      {
        trigger: /hack.*mainframe|breach.*security|leak.*data/i,
        effects: [
          {
            delay: { months: 3 },
            template: 'Whistleblowers emboldened by breach come forward',
            magnitude: 0.5,
            probability: 0.8
          },
          {
            delay: { years: 1 },
            template: 'Open-source alternatives to Oneirocom tech proliferate',
            magnitude: 0.7,
            probability: 0.6
          },
          {
            delay: { years: 2 },
            template: 'Decentralized networks reduce Oneirocom\'s data collection by 40%',
            magnitude: 0.8,
            probability: 0.5
          }
        ]
      }
    ]);
    
    // Social cascade rules
    this.cascadeRules.set('social', [
      {
        trigger: /protest|uprising|resistance.*grows|awareness.*spreads/i,
        effects: [
          {
            delay: { months: 1 },
            template: 'Solidarity movements emerge in neighboring regions',
            magnitude: 0.4,
            probability: 0.7
          },
          {
            delay: { months: 6 },
            template: 'Cultural shift toward privacy and autonomy accelerates',
            magnitude: 0.6,
            probability: 0.8
          },
          {
            delay: { years: 1 },
            template: 'New generation rejects Oneirocom\'s virtual reality escapism',
            magnitude: 0.7,
            probability: 0.6
          }
        ]
      }
    ]);
  }
  
  /**
   * Calculate cascade effects from a timeline event
   */
  calculateCascades(event: TimelineEvent, worldState: WorldState): CascadeEffect[] {
    const cascades: CascadeEffect[] = [];
    const rules = this.cascadeRules.get(event.type) || [];
    
    for (const rule of rules) {
      if (rule.trigger.test(event.description)) {
        for (const effect of rule.effects) {
          // Calculate cascade date
          const cascadeDate = new Date(event.date);
          if (effect.delay.years) {
            cascadeDate.setFullYear(cascadeDate.getFullYear() + effect.delay.years);
          }
          if (effect.delay.months) {
            cascadeDate.setMonth(cascadeDate.getMonth() + effect.delay.months);
          }
          
          // Apply world state modifiers
          const probability = this.adjustProbability(effect.probability, event, worldState);
          const magnitude = this.adjustMagnitude(effect.magnitude, event, worldState);
          
          // Generate description
          const description = this.expandTemplate(effect.template, event, worldState);
          
          cascades.push({
            sourceEventId: event.id,
            date: cascadeDate,
            description,
            probability,
            magnitude,
            type: event.type,
            requiredConditions: effect.requiredConditions
          });
        }
      }
    }
    
    // Check for compound cascades (multiple events creating new effects)
    const compoundCascades = this.checkCompoundEffects(event, worldState);
    cascades.push(...compoundCascades);
    
    return cascades;
  }
  
  /**
   * Adjust probability based on world state
   */
  private adjustProbability(
    baseProbability: number, 
    event: TimelineEvent, 
    worldState: WorldState
  ): number {
    let probability = baseProbability;
    
    // Resistance strength increases cascade probability
    probability *= (1 + worldState.resistanceStrength * 0.5);
    
    // Oneirocom control decreases it
    probability *= (1 - worldState.oneirocomControl * 0.3);
    
    // Multiple similar events increase probability (momentum)
    const similarEvents = worldState.recentEvents.filter(
      e => e.type === event.type && e.magnitude > 0.5
    );
    probability *= (1 + similarEvents.length * 0.1);
    
    return Math.min(1, Math.max(0, probability));
  }
  
  /**
   * Adjust magnitude based on world state and event power
   */
  private adjustMagnitude(
    baseMagnitude: number,
    event: TimelineEvent,
    worldState: WorldState
  ): number {
    let magnitude = baseMagnitude;
    
    // Event magnitude influences cascade magnitude
    magnitude *= (0.5 + event.magnitude * 0.5);
    
    // Timeline divergence amplifies effects
    magnitude *= (1 + worldState.timelineDivergence * 0.3);
    
    // Compound with other active cascades
    const activeCascades = worldState.activeCascades.filter(
      c => c.type === event.type
    );
    magnitude *= (1 + activeCascades.length * 0.15);
    
    return Math.min(1, Math.max(0, magnitude));
  }
  
  /**
   * Check for compound effects from multiple events
   */
  private checkCompoundEffects(
    event: TimelineEvent,
    worldState: WorldState
  ): CascadeEffect[] {
    const compounds: CascadeEffect[] = [];
    
    // Political + Tech = Accelerated change
    if (event.type === 'political') {
      const recentTech = worldState.recentEvents.find(
        e => e.type === 'technological' && 
        this.monthsBetween(e.date, event.date) < 12
      );
      
      if (recentTech) {
        compounds.push({
          sourceEventId: event.id,
          date: this.addMonths(event.date, 6),
          description: 'Political will combined with tech alternatives creates rapid systemic change',
          probability: 0.8,
          magnitude: 0.9,
          type: 'political',
          requiredConditions: [recentTech.id]
        });
      }
    }
    
    // Social + Economic = Revolution potential
    if (event.type === 'social') {
      const economicCrisis = worldState.recentEvents.find(
        e => e.type === 'economic' && e.magnitude > 0.7
      );
      
      if (economicCrisis) {
        compounds.push({
          sourceEventId: event.id,
          date: this.addMonths(event.date, 3),
          description: 'Economic hardship fuels social uprising into full revolution',
          probability: 0.6,
          magnitude: 1.0,
          type: 'social',
          requiredConditions: [economicCrisis.id]
        });
      }
    }
    
    return compounds;
  }
  
  /**
   * Expand template strings with context
   */
  private expandTemplate(
    template: string,
    event: TimelineEvent,
    worldState: WorldState
  ): string {
    return template
      .replace('{location}', event.location || worldState.primaryLocation)
      .replace('{year}', event.date.getFullYear().toString())
      .replace('{entities}', event.entities.join(', '));
  }
  
  // Utility functions
  private monthsBetween(date1: Date, date2: Date): number {
    const months = (date2.getFullYear() - date1.getFullYear()) * 12;
    return months + date2.getMonth() - date1.getMonth();
  }
  
  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }
}

// Supporting types
interface CascadeRule {
  trigger: RegExp;
  effects: CascadeEffectTemplate[];
}

interface CascadeEffectTemplate {
  delay: { years?: number; months?: number };
  template: string;
  magnitude: number;
  probability: number;
  requiredConditions?: string[];
}

export interface WorldState {
  resistanceStrength: number; // 0-1
  oneirocomControl: number; // 0-1
  timelineDivergence: number; // 0-1
  primaryLocation: string;
  recentEvents: TimelineEvent[];
  activeCascades: CascadeEffect[];
}

/**
 * Oneirocom's counter-cascade system
 */
export class OneirocomCounterCascade {
  /**
   * Generate counter-narratives to prevent cascades
   */
  generateCounterMeasures(
    cascades: CascadeEffect[],
    worldState: WorldState
  ): TimelineEvent[] {
    const counters: TimelineEvent[] = [];
    
    // Group cascades by impact
    const highImpact = cascades.filter(c => c.magnitude * c.probability > 0.6);
    
    for (const cascade of highImpact) {
      const counter = this.createCounterEvent(cascade, worldState);
      if (counter) {
        counters.push(counter);
      }
    }
    
    return counters;
  }
  
  private createCounterEvent(
    cascade: CascadeEffect,
    worldState: WorldState
  ): TimelineEvent | null {
    // Counter strategies by type
    const strategies = {
      political: [
        'Oneirocom orchestrates false flag operation to discredit opposition',
        'Oneirocom-backed candidate wins emergency election through data manipulation',
        'Oneirocom triggers constitutional crisis to maintain status quo'
      ],
      technological: [
        'Oneirocom releases "security update" that patches vulnerabilities and increases surveillance',
        'Oneirocom launches cyber attack blamed on resistance hackers',
        'Oneirocom introduces addictive new VR technology to distract population'
      ],
      social: [
        'Oneirocom deploys memetic warfare to divide resistance movement',
        'Oneirocom stages terrorist attack to justify crackdown',
        'Oneirocom floods media with disinformation about resistance'
      ],
      economic: [
        'Oneirocom manipulates markets to create artificial scarcity',
        'Oneirocom offers universal basic income tied to compliance scores',
        'Oneirocom crashes cryptocurrency to eliminate financial autonomy'
      ],
      environmental: [
        'Oneirocom uses weather modification to create crisis',
        'Oneirocom "solves" environmental disaster it secretly caused',
        'Oneirocom monopolizes clean resources through artificial scarcity'
      ]
    };
    
    const typeStrategies = strategies[cascade.type] || [];
    if (typeStrategies.length === 0) return null;
    
    // Select strategy based on world state
    const strategyIndex = Math.floor(worldState.oneirocomControl * typeStrategies.length);
    const description = typeStrategies[Math.min(strategyIndex, typeStrategies.length - 1)];
    
    // Place counter 1-3 months before cascade
    const counterDate = new Date(cascade.date);
    counterDate.setMonth(counterDate.getMonth() - Math.floor(Math.random() * 3 + 1));
    
    return {
      id: `counter-${cascade.sourceEventId}`,
      date: counterDate,
      description,
      type: cascade.type,
      magnitude: Math.min(1, cascade.magnitude * 1.2), // Oneirocom responds strongly
      entities: ['Oneirocom'],
      location: worldState.primaryLocation
    };
  }
}

// Example usage function
export function demonstrateCascadeSystem() {
  const cascadeSystem = new CascadeSystem();
  const oneirocomCounter = new OneirocomCounterCascade();
  
  // Initial event: Election upset
  const triggerEvent: TimelineEvent = {
    id: 'event-001',
    date: new Date('2030-11-15'),
    description: 'Opposition party wins unexpected election upset against Oneirocom-backed candidate',
    type: 'political',
    magnitude: 0.8,
    entities: ['Opposition Party', 'Oneirocom'],
    location: 'Neo Tokyo'
  };
  
  // Current world state
  const worldState: WorldState = {
    resistanceStrength: 0.4,
    oneirocomControl: 0.7,
    timelineDivergence: 0.3,
    primaryLocation: 'Neo Tokyo',
    recentEvents: [],
    activeCascades: []
  };
  
  // Calculate cascades
  const cascades = cascadeSystem.calculateCascades(triggerEvent, worldState);
  console.log('Cascade Effects:', cascades);
  
  // Oneirocom responds
  const counters = oneirocomCounter.generateCounterMeasures(cascades, worldState);
  console.log('Oneirocom Counters:', counters);
  
  return { cascades, counters };
}
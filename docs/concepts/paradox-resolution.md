# Paradox Resolution in Narrative Canon

## Understanding Narrative Paradoxes

When merging divergent timelines, paradoxes occur when the same entity has contradictory states. Unlike code conflicts which are syntactic, narrative paradoxes are semantic - they represent logical impossibilities in the story world.

## Types of Paradoxes

### 1. Existence Paradox
An entity exists in one timeline but not another.

```javascript
// Timeline A: Character dies
{ entityId: 'sarah', status: 'dead' }

// Timeline B: Character lives and acts
{ entityId: 'sarah', status: 'alive', role: 'leader' }
```

### 2. State Paradox
Same entity has incompatible properties.

```javascript
// Timeline A: Character is villain
{ entityId: 'alex', alignment: 'evil', faction: 'oneirocom' }

// Timeline B: Character is hero
{ entityId: 'alex', alignment: 'good', faction: 'resistance' }
```

### 3. Causal Paradox
Events depend on contradicted prerequisites.

```javascript
// Timeline A: Technology never invented
// Timeline B: Society built on that technology
```

### 4. Temporal Paradox
Events occur in impossible order.

```javascript
// Timeline A: Child born in 2090
// Timeline B: Parent dies in 2089
```

### 5. Dependency Paradox
Later events depend on entities that don't exist.

```javascript
// Timeline A: Mentor never existed
// Timeline B: Student's entire arc depends on mentor's teachings
```

## Resolution Strategies

### 1. Quantum Superposition

Entity exists in multiple states simultaneously.

```javascript
const resolution = {
  strategy: 'quantum-superposition',
  result: {
    entityId: 'sarah',
    quantumState: 'superposed',
    states: {
      observed_by_enemies: 'dead',
      observed_by_allies: 'alive',
      physical_form: 'conditional'
    }
  }
};
```

**Use When**: 
- Story explores perception and reality
- Multiple POV characters
- Unreliable narrator themes

**Example**: Schrödinger's mentor - dead to those who betrayed them, alive to those who remained loyal.

### 2. Timeline Echo

Entity is gone but influence persists.

```javascript
const resolution = {
  strategy: 'timeline-echo',
  result: {
    originalEntity: 'removed',
    echoEntity: {
      id: 'sarah_echo',
      type: 'phenomenon',
      properties: {
        source: 'sarah',
        manifestation: ['memories', 'teachings', 'artifacts'],
        strength: 0.7
      }
    }
  }
};
```

**Use When**:
- Character's legacy is important
- Death adds emotional weight
- Ghost/memory mechanics fit genre

**Example**: Mentor dies but their teachings manifest through discovered journals, AI imprints, or disciples.

### 3. Paradox Cascade

The conflict itself becomes a narrative element.

```javascript
const resolution = {
  strategy: 'paradox-cascade',
  result: {
    type: 'reality-fracture',
    effects: [
      'Timeline instability at divergence point',
      'Characters experience timeline bleed',
      'Reality glitches become plot devices'
    ]
  }
};
```

**Use When**:
- Meta-narrative themes
- Reality-bending genres
- Want to acknowledge the paradox

**Example**: The point where timelines diverged becomes unstable, creating a zone where both realities bleed through.

### 4. Schrödinger Resolution

State depends on observer.

```javascript
const resolution = {
  strategy: 'schrodinger',
  result: {
    observerRules: {
      'corporate-aligned': { sees: 'dead' },
      'resistance-aligned': { sees: 'alive' },
      'neutral': { sees: 'uncertain' }
    }
  }
};
```

**Use When**:
- Faction-based narratives
- Exploring subjective reality
- Mystery/investigation themes

**Example**: Different groups literally experience different realities based on their beliefs or allegiances.

### 5. Branching Reality

Both timelines remain separate but aware.

```javascript
const resolution = {
  strategy: 'branching-reality',
  result: {
    realities: ['timeline-a', 'timeline-b'],
    interaction: 'limited-crossover',
    navigation: 'consciousness-based'
  }
};
```

**Use When**:
- Multiverse stories
- Want to preserve both versions
- Setting up future crossovers

**Example**: Characters can shift between realities or glimpse alternate selves.

### 6. Retrocausal Resolution

Future information prevents the paradox.

```javascript
const resolution = {
  strategy: 'retrocausal',
  result: {
    mechanism: 'information-backflow',
    change: 'Sarah receives warning about assassination',
    outcome: 'Paradox never occurs'
  }
};
```

**Use When**:
- Time travel elements
- Closed loop narratives
- Predetermined fate themes

**Example**: Knowledge from the timeline where character survives flows back to prevent their death.

### 7. Narrative Glitch

Paradox becomes a mystery to solve.

```javascript
const resolution = {
  strategy: 'narrative-glitch',
  result: {
    mystery: 'Conflicting records about Sarah',
    clues: ['Two death certificates', 'Simultaneous sightings'],
    resolution: 'requires-investigation'
  }
};
```

**Use When**:
- Mystery genres
- Want player/reader engagement
- Unreliable narrative device

**Example**: Characters find conflicting evidence and must investigate what really happened.

## Implementation Example

```javascript
// Detect paradoxes
const paradoxes = ParadoxResolver.detectParadoxes(
  sourceOperations,
  targetOperations,
  currentState
);

// Choose resolution based on narrative needs
for (const paradox of paradoxes) {
  let strategy;
  
  if (paradox.narrativeImpact === 'critical') {
    // Major character - use dramatic resolution
    strategy = 'quantum-superposition';
  } else if (genre === 'mystery') {
    // Mystery genre - use glitch
    strategy = 'narrative-glitch';
  } else {
    // Default to echo for emotional weight
    strategy = 'timeline-echo';
  }
  
  const resolution = ParadoxResolver.resolveParadox(
    paradox,
    strategy,
    context
  );
  
  // Apply resolution operations
  for (const op of resolution.operations) {
    git.add(op);
  }
}

await git.commit('Resolved timeline paradoxes');
```

## Choosing the Right Strategy

Consider these factors:

1. **Genre Compatibility**
   - Sci-fi → Quantum/Branching
   - Fantasy → Echo/Cascade
   - Mystery → Glitch/Schrödinger
   - Drama → Echo/Selective

2. **Narrative Impact**
   - High → Quantum/Cascade
   - Medium → Echo/Schrödinger
   - Low → Selective/Retrocausal

3. **Player/Reader Agency**
   - High → Glitch/Branching
   - Medium → Schrödinger/Cascade
   - Low → Echo/Retrocausal

4. **Complexity Tolerance**
   - High → Quantum/Branching
   - Medium → Cascade/Schrödinger
   - Low → Echo/Selective

## Best Practices

1. **Consistency**: Use similar strategies for similar conflicts
2. **Foreshadowing**: Hint at the possibility before it happens
3. **Explanation**: Make the resolution rules clear to audience
4. **Emotional Truth**: Preserve character arcs even if facts change
5. **Simplicity**: Don't over-complicate unless it serves the story

## Advanced Techniques

### Cascading Resolutions
Chain multiple strategies:
```javascript
// First: Echo for immediate impact
// Then: Glitch for ongoing mystery
// Finally: Quantum for ultimate revelation
```

### Conditional Resolutions
Different strategies based on player choices:
```javascript
if (playerInvestigatedClues) {
  strategy = 'narrative-glitch';
} else {
  strategy = 'timeline-echo';
}
```

### Meta-Resolutions
Make the resolution process itself part of the story:
```javascript
// Characters aware they're in conflicting timelines
// Must actively choose which reality to manifest
```

## Next Steps

- Explore [Timeline Branching](./timeline-branching.md)
- Learn about [Reality Hooks](./reality-hooks.md)
- Try the [Merging Timelines Tutorial](../tutorials/merging-timelines.md)
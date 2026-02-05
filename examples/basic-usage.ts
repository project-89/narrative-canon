import { 
  NarrativePipeline, 
  GeminiAdapter, 
  MockLLM,
  CanonTimelineManager,
  NarrativeQueryEngine,
  ConsistencyEngine 
} from '../src';

async function main() {
  // Example narrative text
  const storyText = `
    In the ancient library of Alexandria, Scholar Amara discovered a mysterious codex 
    that glowed with ethereal light. The codex contained prophecies about a coming darkness.
    
    Amara sought out Knight Marcus at the city gates. "We must warn the Council," she said,
    showing him the glowing pages. Marcus, initially skeptical, was convinced by the 
    otherworldly nature of the artifact.
    
    Together, they traveled to the Council chambers in the heart of the city. The Council
    of Five listened to their tale with growing concern. Elder Theron declared, "If these
    prophecies are true, we must prepare our defenses immediately."
    
    The codex was placed in the Sacred Vault for protection, while Amara and Marcus were
    tasked with gathering allies from neighboring kingdoms. The fate of Alexandria now
    rested on their success.
  `;

  // Initialize with LLM (use MockLLM for testing without API key)
  const llmAdapter = process.env.GEMINI_API_KEY 
    ? new GeminiAdapter(process.env.GEMINI_API_KEY)
    : new MockLLM();

  // Create pipeline
  const pipeline = new NarrativePipeline(llmAdapter);

  // Extract narrative structure
  console.log('📖 Extracting narrative...');
  const narrative = await pipeline.extractNarrative(storyText);

  console.log('\n📊 Narrative Structure:');
  console.log(`- Characters: ${narrative.entities.characters.length}`);
  console.log(`- Locations: ${narrative.entities.locations.length}`);
  console.log(`- Objects: ${narrative.entities.objects.length}`);
  console.log(`- Scenes: ${narrative.scenes.length}`);
  console.log(`- Relationships: ${narrative.relationships.length}`);
  console.log(`- State Changes: ${narrative.stateChanges.length}`);

  // Build temporal graph
  const temporalGraph = pipeline.buildTemporalGraph(narrative);
  console.log(`\n⏱️ Temporal Graph: ${temporalGraph.states.length} states`);

  // Initialize query engine
  const queryEngine = new NarrativeQueryEngine(narrative, temporalGraph);

  // Ask questions about the narrative
  console.log('\n❓ Querying the narrative:');
  
  const queries = [
    "Where is the codex at the end?",
    "What is the relationship between Amara and Marcus?",
    "What happened in the Council chambers?"
  ];

  for (const question of queries) {
    const result = queryEngine.query(question, narrative.scenes.length);
    console.log(`\nQ: ${question}`);
    console.log(`A: ${result.answer}`);
    console.log(`Confidence: ${result.confidence}`);
  }

  // Check consistency
  const consistencyEngine = new ConsistencyEngine();
  const violations = consistencyEngine.checkConsistency(narrative, temporalGraph);
  
  console.log(`\n✅ Consistency Check: ${violations.length} violations found`);
  if (violations.length > 0) {
    violations.forEach(v => console.log(`- ${v.type}: ${v.description}`));
  }

  // Canon timeline management example
  console.log('\n🎯 Canon Timeline Management:');
  const timelineManager = new CanonTimelineManager();
  
  // Add a canon event
  timelineManager.addCanonEvent({
    id: 'darkness_arrives',
    name: 'The Darkness Arrives',
    description: 'The prophesied darkness must arrive',
    triggerConditions: {
      afterSequence: 100,
      requiredEntities: ['codex']
    },
    consequences: {
      worldState: 'darkness_present',
      requiredActions: ['defend_city']
    },
    importance: 'critical'
  });

  // Simulate a player action
  const playerAction = {
    type: 'entity_destruction',
    targetId: 'codex',
    description: 'Player destroys the codex'
  };

  const validation = timelineManager.validatePlayerAction(
    'player1',
    playerAction,
    50 // Current sequence
  );

  console.log(`\nPlayer action "${playerAction.description}"`);
  console.log(`Valid: ${validation.valid}`);
  if (!validation.valid) {
    console.log('Violations:', validation.violations);
    console.log('Suggestions:', validation.suggestions);
  }
}

// Run the example
main().catch(console.error);
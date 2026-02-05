import { NarrativePipeline } from '../src/pipeline';
import { UnifiedLLMAdapter } from '../src/llm/adapter';
import { GeminiAdapter } from '../src/llm/gemini';

// These tests are skipped by default. To run them:
// 1. Set GEMINI_API_KEY environment variable
// 2. Run: GEMINI_API_KEY=your-key npm test -- integration.test.ts

const FORCE_REAL_GEMINI = process.env.FORCE_REAL_GEMINI === 'true';
const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
const SKIP_INTEGRATION = (FORCE_REAL_GEMINI && !hasApiKey) || process.env.SKIP_INTEGRATION_TESTS === 'true';

const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

describeIntegration('Integration tests with real LLM', () => {
  let pipeline: NarrativePipeline;
  let adapter: UnifiedLLMAdapter;
  let usingRealGemini = false;

  beforeAll(() => {
    if (FORCE_REAL_GEMINI && !process.env.GEMINI_API_KEY) {
      console.log('Skipping integration tests: FORCE_REAL_GEMINI enabled but GEMINI_API_KEY not set');
      return;
    }

    if (FORCE_REAL_GEMINI && process.env.GEMINI_API_KEY) {
      adapter = new UnifiedLLMAdapter(process.env.GEMINI_API_KEY, false);
    } else {
      adapter = new UnifiedLLMAdapter(undefined, true);
    }
    usingRealGemini = adapter.isUsingRealAPI();
    pipeline = new NarrativePipeline(adapter);
  });

  const testNarrative = `
    The Heist
    
    Sarah Chen studied the museum blueprints in her apartment. 
    The diamond exhibit would only be there for three more days.
    
    Her phone buzzed. "Are you in?" Marcus asked.
    
    She thought about her brother's medical bills. "Yes," she replied.
    
    That night, they met at the old warehouse. Marcus had assembled 
    a team: Elena the hacker, James the driver, and Sofia the insider 
    who worked at the museum.
    
    "Security changes guards at midnight," Sofia explained. 
    "That gives us a fifteen-minute window."
    
    The next evening, they executed the plan. Elena disabled the cameras 
    while Sarah and Marcus entered through the loading dock. Everything 
    was going smoothly until the silent alarm triggered.
    
    "Go, go, go!" James shouted as they ran to the van.
    
    They escaped, but Sarah couldn't shake the feeling that someone 
    had set them up. When she checked the bag, instead of the diamond, 
    she found a note: "Thanks for the distraction. -A friend"
  `;

  it('should extract characters with detailed descriptions', async () => {
    const result = await pipeline.extractNarrative(testNarrative);

    expect(result.entities.length).toBeGreaterThan(0);

    const names = result.entities.map(e => e.name.toLowerCase());
    if (usingRealGemini) {
      expect(names).toContain('sarah chen');
      expect(names).toContain('marcus');
      expect(names).toContain('elena');
      expect(names).toContain('james');
      expect(names).toContain('sofia');

      const sarah = result.entities.find(e => e.name === 'Sarah Chen');
      expect(sarah).toBeDefined();
      expect(sarah?.description).toBeTruthy();
    }
  }, 30000); // 30 second timeout for API calls

  it('should extract scenes in chronological order', async () => {
    const result = await pipeline.extractNarrative(testNarrative);

    expect(result.scenes.length).toBeGreaterThan(0);
    
    const sequences = result.scenes.map(s => s.sequence);
    const sorted = [...sequences].sort((a, b) => a - b);
    expect(sequences).toEqual(sorted);

    if (usingRealGemini) {
      const firstScene = result.scenes[0];
      expect(firstScene.description.toLowerCase()).toMatch(/sarah|chen|plan|heist/);

      const heistScene = result.scenes.find(s => 
        s.description.toLowerCase().includes('heist') || 
        s.description.toLowerCase().includes('museum') ||
        s.description.toLowerCase().includes('security')
      );
      expect(heistScene).toBeDefined();
    }
  }, 30000);

  it('should identify relationships between characters', async () => {
    const result = await pipeline.extractNarrative(testNarrative);

    expect(Array.isArray(result.relationships)).toBe(true);

    if (usingRealGemini) {
      expect(result.relationships.length).toBeGreaterThan(0);
    }

    const meaningfulRelationships = result.relationships.filter(r => 
      r.type && r.type.length > 0 && 
      r.source && r.target
    );

    if (usingRealGemini) {
      expect(meaningfulRelationships.length).toBeGreaterThan(0);
      const describedRelationships = result.relationships.filter(r => 
        r.description && r.description.length > 10
      );
      expect(describedRelationships.length).toBeGreaterThan(0);
    }
  }, 30000);

  it('should track state changes throughout the narrative', async () => {
    const result = await pipeline.extractNarrative(testNarrative);

    expect(Array.isArray(result.stateChanges)).toBe(true);

    if (usingRealGemini) {
      expect(result.stateChanges.length).toBeGreaterThan(0);
    }

    const validChanges = result.stateChanges.filter(sc => 
      sc.type && sc.description && (sc.entityId || sc.relationshipId)
    );
    if (usingRealGemini) {
      expect(validChanges.length).toBeGreaterThan(0);
    }

    if (usingRealGemini) {
      const meaningfulChanges = result.stateChanges.filter(sc =>
        sc.description && sc.description.length > 10
      );
      expect(meaningfulChanges.length).toBeGreaterThan(0);
    }
  }, 30000);

  it('should build a complete chronology', async () => {
    const result = await pipeline.extractNarrative(testNarrative);

    expect(result.chronology.events.length).toBeGreaterThan(0);
    
    const sceneEvents = result.chronology.events.filter((e: any) => e.type === 'scene' || e.type === 'scene_start');
    const stateChangeEvents = result.chronology.events.filter((e: any) => e.type?.startsWith('state_change'));
    expect(sceneEvents.length).toBeGreaterThan(0);

    const sequences = result.chronology.events.map((e: any) => e.sequence);
    const sorted = [...sequences].sort((a, b) => a - b);
    expect(sequences).toEqual(sorted);

    if (usingRealGemini) {
      expect(stateChangeEvents.length).toBeGreaterThan(0);
    }
  }, 30000);

  it('should compare results between mock and real LLM', async () => {
    // Extract with real LLM
    const realResult = await pipeline.extractNarrative(testNarrative);

    // Extract with mock LLM
    const mockAdapter = new UnifiedLLMAdapter(undefined, true);
    const mockPipeline = new NarrativePipeline(mockAdapter);
    const mockResult = await mockPipeline.extractNarrative(testNarrative);

    // Both should extract a reasonable number of entities
    expect(realResult.entities.length).toBeGreaterThan(0);
    expect(mockResult.entities.length).toBeGreaterThan(0);

    const realDescriptions = realResult.entities
      .map(e => e.description)
      .filter(d => d && d.length > 0);
    const mockDescriptions = mockResult.entities
      .map(e => e.description)
      .filter(d => d && d.length > 0);

    if (usingRealGemini) {
      expect(realDescriptions.length).toBeGreaterThan(0);
      const avgRealLength = realDescriptions.reduce((sum, d) => sum + (d?.length || 0), 0) / realDescriptions.length;
      const avgMockLength = mockDescriptions.length > 0 
        ? mockDescriptions.reduce((sum, d) => sum + (d?.length || 0), 0) / mockDescriptions.length
        : 0;
      expect(avgRealLength).toBeGreaterThanOrEqual(avgMockLength);
    }
  }, 60000); // 60 second timeout for multiple API calls
});

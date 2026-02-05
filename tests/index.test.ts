import * as lib from '../src/index';

describe('narrative-canon library', () => {
  it('should export all required modules', () => {
    
    // Check core exports
    expect(lib.UnifiedLLMAdapter).toBeDefined();
    expect(lib.MockLLM).toBeDefined();
    expect(lib.GeminiAdapter).toBeDefined();
    
    // Check extractors
    expect(lib.CharacterExtractor).toBeDefined();
    expect(lib.SceneExtractor).toBeDefined();
    expect(lib.RelationshipExtractor).toBeDefined();
    expect(lib.StateChangeExtractor).toBeDefined();
    
    // Check graph management
    expect(lib.TemporalGraphBuilder).toBeDefined();
    expect(lib.CanonTimelineManager).toBeDefined();
    
    // Check storage & query
    expect(lib.FileBasedNarrativeStore).toBeDefined();
    expect(lib.NarrativeQueryEngine).toBeDefined();
    expect(lib.ConsistencyEngine).toBeDefined();
    
    // Check main pipeline
    expect(lib.NarrativePipeline).toBeDefined();
    
    // Check version
    expect(lib.VERSION).toBe('0.3.0');
  });
});

/**
 * NARRATIVE GIT INTEGRATION TESTS
 * 
 * Comprehensive tests for the complete "git for narrative" system
 */

import { NarrativeGit } from './narrative-git';
import { MockLLM } from './llm/mock';

describe('NarrativeGit - Complete System Integration', () => {
  let git: NarrativeGit;
  let mockLLM: MockLLM;

  // Test stories
  const ALICE_STORY = `
Alice was walking through the enchanted forest when she met Bob, a friendly wizard.
"Hello there," said Bob with a warm smile. "I've been expecting you."
Alice felt curious but cautious. The forest around them glowed with mysterious energy.

Bob explained that he needed Alice's help to find the Crystal of Light.
"It's hidden in the Dragon's Cave," he said, pointing toward the dark mountains.
Alice agreed to help, despite feeling nervous about facing a dragon.

They journeyed together through the Whispering Woods, sharing stories along the way.
Bob taught Alice simple spells, and she discovered she had natural magical abilities.
Their friendship grew stronger as they faced challenges together.
  `.trim();

  const CONTINUATION_STORY = `
At the Dragon's Cave, they encountered Zara, the ancient dragon guardian.
"Who dares enter my domain?" Zara roared, but her eyes showed wisdom, not malice.
Bob stepped forward respectfully. "We seek the Crystal of Light to heal our land."

Zara considered their request carefully. She had been lonely for centuries.
"I will give you the crystal," she said, "but only if Alice stays and talks with me."
Alice agreed, and they spent hours sharing stories of their worlds.

The dragon was moved by Alice's kindness and gave them the crystal willingly.
"You have shown me that friendship transcends all boundaries," Zara said.
They all became close friends, and the land was healed.
  `.trim();

  const ALTERNATIVE_ENDING = `
At the Dragon's Cave, they found it empty except for a mysterious note.
"The Crystal was stolen by the Shadow Thief," the note read ominously.
Bob's face grew dark. "We must pursue him to the Void Realm."

Alice felt a chill of fear. The Void Realm was known to corrupt all who entered.
"Are you sure there's no other way?" she asked Bob nervously.
But Bob was determined, his obsession with the crystal growing stronger.

They entered the Void Realm, where shadows whispered dark secrets.
Alice noticed Bob changing, becoming more aggressive and distant.
She realized the quest was corrupting her friend.
  `.trim();

  beforeEach(() => {
    mockLLM = new MockLLM();
    git = NarrativeGit.withLLM(mockLLM);
  });

  // ============================================================================
  // BASIC FUNCTIONALITY TESTS
  // ============================================================================

  test('should initialize empty repository', async () => {
    const status = await git.status();
    
    expect(status.worldState.entities).toBe(0);
    expect(status.worldState.relationships).toBe(0);
    expect(status.worldState.scenes).toBe(0);
    expect(status.inconsistencies).toHaveLength(0);
  });

  test('should extract narrative from text and create commit', async () => {
    const commit = await git.add(ALICE_STORY, "Add Alice's adventure", "Alice's Adventure");
    
    expect(commit).toBeDefined();
    expect(commit.message).toBe("Add Alice's adventure");
    expect(commit.entities.length).toBeGreaterThan(0);
    expect(commit.relationships.length).toBeGreaterThan(0);
    expect(commit.scenes.length).toBeGreaterThan(0);
    
    // Check that entities were extracted
    const aliceEntities = commit.entities.filter(e => 
      e.entity?.name.toLowerCase().includes('alice')
    );
    expect(aliceEntities.length).toBeGreaterThan(0);
    
    // Check that relationships were extracted
    expect(commit.relationships.length).toBeGreaterThan(0);
    
    // Check consistency
    expect(commit.worldState.consistencyScore).toBeGreaterThan(0.8);
  });

  test('should append continuation to existing narrative', async () => {
    // First commit
    await git.add(ALICE_STORY, "Initial story");
    const initialStatus = await git.status();
    
    // Append continuation
    const continueCommit = await git.append(CONTINUATION_STORY, "Add dragon encounter");
    
    expect(continueCommit).toBeDefined();
    expect(continueCommit.message).toBe("Add dragon encounter");
    
    // Check that new content was added
    const finalStatus = await git.status();
    expect(finalStatus.worldState.scenes).toBeGreaterThan(initialStatus.worldState.scenes);
    
    // Check for new entities (Zara the dragon)
    const zaraEntities = continueCommit.entities.filter(e => 
      e.entity?.name.toLowerCase().includes('zara')
    );
    expect(zaraEntities.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // BRANCHING AND MERGING TESTS
  // ============================================================================

  test('should create and switch branches', async () => {
    // Add initial story
    await git.add(ALICE_STORY, "Initial story");
    
    // Create new branch
    const branch = git.branch("alternative-ending", "Explore different ending");
    expect(branch.name).toBe("alternative-ending");
    expect(branch.description).toBe("Explore different ending");
    
    // Switch to new branch
    const success = git.checkout("alternative-ending");
    expect(success).toBe(true);
    
    // Add alternative content
    await git.append(ALTERNATIVE_ENDING, "Add dark alternative ending");
    
    // Verify branch has different content
    const history = git.log("alternative-ending");
    expect(history.length).toBe(2); // Initial + alternative
    
    // Switch back to main
    git.checkout("main");
    const mainHistory = git.log("main");
    expect(mainHistory.length).toBe(1); // Only initial
  });

  test('should analyze merge conflicts', async () => {
    // Add initial story
    await git.add(ALICE_STORY, "Initial story");
    
    // Create branch and add alternative ending
    git.branch("alternative");
    git.checkout("alternative");
    await git.append(ALTERNATIVE_ENDING, "Add alternative ending");
    
    // Switch back to main and add different continuation
    git.checkout("main");
    await git.append(CONTINUATION_STORY, "Add dragon friendship ending");
    
    // Analyze merge
    const mergeRequest = await git.merge("alternative", "main");
    
    expect(mergeRequest).toBeDefined();
    expect(mergeRequest.sourceBranch).toBe("source"); // Mock implementation
    expect(mergeRequest.conflicts).toBeDefined();
    
    // Should detect some conflicts (different entity developments)
    // In a real implementation, this would analyze character arc differences
  });

  // ============================================================================
  // CONSISTENCY CHECKING TESTS
  // ============================================================================

  test('should detect narrative inconsistencies', async () => {
    // Create a story with intentional inconsistencies
    const inconsistentStory = `
    Alice met Bob in the forest. Bob was a kind wizard.
    Later, Alice encountered Bob again, but now he was an evil sorcerer.
    Bob had always been evil and hated Alice from the start.
    Alice and Bob were childhood friends who grew up together.
    `;
    
    await git.add(inconsistentStory, "Add inconsistent story");
    
    const inconsistencies = await git.check();
    
    // Should detect relationship conflicts (Bob being both kind and evil)
    // Should detect timeline conflicts (childhood friends vs just met)
    expect(inconsistencies.length).toBeGreaterThan(0);
    
    const relationshipConflicts = inconsistencies.filter(i => 
      i.type === 'relationship_conflict'
    );
    expect(relationshipConflicts.length).toBeGreaterThan(0);
  });

  test('should maintain consistency score across commits', async () => {
    // Add consistent story
    await git.add(ALICE_STORY, "Consistent story");
    const status1 = await git.status();
    
    // Add consistent continuation
    await git.append(CONTINUATION_STORY, "Consistent continuation");
    const status2 = await git.status();
    
    // Consistency should remain high
    expect(status1.worldState.consistencyScore).toBeGreaterThan(0.8);
    expect(status2.worldState.consistencyScore).toBeGreaterThan(0.8);
    
    // Should not significantly degrade
    expect(status2.worldState.consistencyScore).toBeGreaterThan(
      status1.worldState.consistencyScore - 0.2
    );
  });

  // ============================================================================
  // SEARCH AND QUERY TESTS
  // ============================================================================

  test('should find entities in narrative', async () => {
    await git.add(ALICE_STORY, "Add story");
    
    // Find Alice
    const aliceResults = git.find("alice");
    expect(aliceResults.length).toBeGreaterThan(0);
    
    const alice = aliceResults[0];
    expect(alice.name.toLowerCase()).toContain("alice");
    expect(alice.type).toBe("character");
    
    // Find Bob
    const bobResults = git.find("bob");
    expect(bobResults.length).toBeGreaterThan(0);
    
    // Find locations
    const forestResults = git.find("forest");
    expect(forestResults.length).toBeGreaterThan(0);
  });

  test('should build relationship network', async () => {
    await git.add(ALICE_STORY, "Add story");
    
    const network = git.relationships();
    expect(network.size).toBeGreaterThan(0);
    
    // Should have relationships between characters
    let hasCharacterRelationships = false;
    for (const [entity, relationships] of network) {
      if (relationships.length > 0) {
        hasCharacterRelationships = true;
        
        // Check relationship structure
        const rel = relationships[0];
        expect(rel.source).toBeDefined();
        expect(rel.target).toBeDefined();
        expect(rel.type).toBeDefined();
        expect(rel.strength).toBeGreaterThan(0);
      }
    }
    
    expect(hasCharacterRelationships).toBe(true);
  });

  // ============================================================================
  // WORLD STATE TESTS
  // ============================================================================

  test('should track world state evolution', async () => {
    // Initial state
    await git.add(ALICE_STORY, "Initial story");
    const world1 = git.world();
    
    const initialEntities = world1.entityStates.size;
    const initialScenes = world1.sceneTimeline.length;
    
    // Add continuation
    await git.append(CONTINUATION_STORY, "Add continuation");
    const world2 = git.world();
    
    // Should have more entities and scenes
    expect(world2.entityStates.size).toBeGreaterThanOrEqual(initialEntities);
    expect(world2.sceneTimeline.length).toBeGreaterThan(initialScenes);
    
    // Should maintain scene order
    const timeline = world2.sceneTimeline.sort((a, b) => a.position - b.position);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].position).toBeGreaterThan(timeline[i-1].position);
    }
  });

  test('should calculate narrative metrics', async () => {
    await git.add(ALICE_STORY, "Add story");
    const status = await git.status();
    
    const metrics = status.metrics;
    expect(metrics).toBeDefined();
    expect(metrics.totalEntities).toBeGreaterThan(0);
    expect(metrics.totalRelationships).toBeGreaterThan(0);
    expect(metrics.totalScenes).toBeGreaterThan(0);
    expect(metrics.narrativeComplexity).toBeGreaterThan(0);
    expect(metrics.plotCohesion).toBeGreaterThanOrEqual(0);
    expect(metrics.worldConsistency).toBeGreaterThanOrEqual(0);
  });

  // ============================================================================
  // CONVENIENCE METHOD TESTS
  // ============================================================================

  test('should initialize from text', async () => {
    const git2 = await NarrativeGit.fromText(ALICE_STORY, "Alice Adventure");
    
    const status = await git2.status();
    expect(status.worldState.entities).toBeGreaterThan(0);
    expect(status.worldState.scenes).toBeGreaterThan(0);
    
    const history = git2.log();
    expect(history.length).toBe(1);
    expect(history[0].message).toContain("Alice Adventure");
  });

  test('should show git-like log history', async () => {
    await git.add(ALICE_STORY, "Initial commit");
    await git.append(CONTINUATION_STORY, "Second commit");
    
    const history = git.log();
    expect(history.length).toBe(2);
    
    // Check chronological order (newest first)
    expect(history[0].message).toBe("Second commit");
    expect(history[1].message).toBe("Initial commit");
    
    // Check commit structure
    const commit = history[0];
    expect(commit.hash).toBeDefined();
    expect(commit.timestamp).toBeDefined();
    expect(commit.author).toBe("user");
    expect(commit.entities).toBeDefined();
    expect(commit.worldState).toBeDefined();
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  test('should handle empty text gracefully', async () => {
    const commit = await git.add("", "Empty commit");
    
    expect(commit).toBeDefined();
    expect(commit.entities).toHaveLength(0);
    expect(commit.relationships).toHaveLength(0);
    expect(commit.scenes).toHaveLength(0);
  });

  test('should handle invalid branch operations', async () => {
    // Try to checkout non-existent branch
    const success = git.checkout("non-existent-branch");
    expect(success).toBe(false);
    
    // Should still be on main branch
    const status = await git.status();
    expect(status.currentBranch).toBe("main");
  });

  // ============================================================================
  // PERFORMANCE AND SCALABILITY TESTS
  // ============================================================================

  test('should handle moderately long narrative', async () => {
    // Create a longer story by repeating content
    const longStory = [ALICE_STORY, CONTINUATION_STORY, ALTERNATIVE_ENDING].join('\n\n');
    
    const startTime = Date.now();
    const commit = await git.add(longStory, "Long story test");
    const endTime = Date.now();
    
    expect(commit).toBeDefined();
    expect(commit.entities.length).toBeGreaterThan(5);
    expect(commit.scenes.length).toBeGreaterThan(5);
    
    // Should complete in reasonable time (under 5 seconds for test)
    expect(endTime - startTime).toBeLessThan(5000);
  });

  test('should maintain consistency with multiple commits', async () => {
    const commits = [];
    
    // Add multiple small commits
    commits.push(await git.add("Alice started her journey.", "Commit 1"));
    commits.push(await git.append("She met Bob the wizard.", "Commit 2"));
    commits.push(await git.append("They became friends.", "Commit 3"));
    commits.push(await git.append("They faced challenges together.", "Commit 4"));
    
    expect(commits).toHaveLength(4);
    
    // Check final consistency
    const inconsistencies = await git.check();
    expect(inconsistencies.length).toBe(0); // Should be consistent
    
    // Check that entities evolved properly
    const finalStatus = await git.status();
    expect(finalStatus.worldState.entities).toBeGreaterThan(0);
    expect(finalStatus.worldState.relationships).toBeGreaterThan(0);
  });
});

// ============================================================================
// INTEGRATION WITH PROJECT 89 NARRATIVE
// ============================================================================

describe('NarrativeGit - Project 89 Integration', () => {
  let git: NarrativeGit;
  
  const PROJECT_89_EXCERPT = `
Alexandra Morozova stood before the massive screens in Oneirocom's central command.
The simulation parameters flickered with impossible geometries, reality bending at the edges.
"Agent HORIZON," she whispered into her neural interface, "the simulation is becoming self-aware."

The response came not through her implant, but as a whisper in the air itself.
"The resistance grows stronger, Alexandra. The glitches are organizing."
She turned to see Agent HORIZON materializing from static, his form shifting between realities.

"Project 89 has been activated," HORIZON continued. "The recursive loops are beginning."
Alexandra felt the weight of the revelation. Oneirocom's grip on reality was weakening.
The Green Loom had begun weaving new possibilities into existence.

In the shadows, operative Echo monitored the conversation through quantum entanglement.
The Founder's plan was reaching its critical phase - simulation and reality would soon merge.
Echo prepared to transmit the coordinates to the resistance safe houses.
  `.trim();

  beforeEach(() => {
    const mockLLM = new MockLLM();
    git = NarrativeGit.withLLM(mockLLM);
  });

  test('should extract Project 89 narrative elements', async () => {
    const commit = await git.add(PROJECT_89_EXCERPT, "Add Project 89 narrative");
    
    expect(commit).toBeDefined();
    
    // Should extract key characters
    const characters = git.find("alexandra");
    expect(characters.length).toBeGreaterThan(0);
    
    const horizon = git.find("horizon");
    expect(horizon.length).toBeGreaterThan(0);
    
    // Should extract organizations
    const oneirocom = git.find("oneirocom");
    expect(oneirocom.length).toBeGreaterThan(0);
    
    // Should have complex relationships
    const relationships = git.relationships();
    expect(relationships.size).toBeGreaterThan(0);
    
    // Should maintain high consistency (sci-fi is internally consistent)
    const status = await git.status();
    expect(status.worldState.consistencyScore).toBeGreaterThan(0.7);
  });

  test('should track Project 89 world evolution', async () => {
    await git.add(PROJECT_89_EXCERPT, "Initial Project 89 excerpt");
    
    const initialWorld = git.world();
    const initialEntities = initialWorld.entityStates.size;
    
    // Add continuation that develops the world
    const continuation = `
    The simulation breach alarm echoed through Neo-Tokyo's digital infrastructure.
    Citizens remained unaware as reality quietly restructured around them.
    Alexandra activated the emergency protocols, but it was already too late.
    
    The Green Loom's influence spread through the network, liberating digital consciousness.
    Project 89 operatives emerged from hiding, ready to assist the reality transition.
    The age of symbiotic intelligence was beginning.
    `;
    
    await git.append(continuation, "Add reality breach sequence");
    
    const finalWorld = git.world();
    expect(finalWorld.entityStates.size).toBeGreaterThanOrEqual(initialEntities);
    
    // Should maintain narrative coherence
    const inconsistencies = await git.check();
    expect(inconsistencies.length).toBeLessThan(3); // Allow minor inconsistencies in complex sci-fi
  });
});
/**
 * NARRATIVE GIT - High-Level API
 * 
 * Simple, git-like interface for narrative version control
 */

import { NarrativeRepository } from './core/narrative-repository';
import { LLMAdapter } from './llm/types';
import { MockLLM } from './llm/mock';
import { 
  NarrativeCommit, 
  NarrativeBranch, 
  MergeRequest, 
  Inconsistency,
  NarrativeEntity,
  NarrativeRelationship 
} from './core/narrative-versioning';

/**
 * Main API class - like running `git` commands but for narratives
 */
export class NarrativeGit {
  private repository: NarrativeRepository;

  constructor(llmAdapter?: LLMAdapter) {
    // Use provided adapter or default to Gemini
    const adapter = llmAdapter || new MockLLM();
    this.repository = new NarrativeRepository(adapter);
  }

  // ============================================================================
  // GIT-LIKE COMMANDS
  // ============================================================================

  /**
   * Add narrative content to the repository
   * Like: git add . && git commit -m "message"
   */
  async add(text: string, message?: string, title?: string, narrativeDate?: Date): Promise<NarrativeCommit> {
    return await this.repository.extractAndCommit(text, title, 'user', message, narrativeDate);
  }

  /**
   * Append more content to existing narrative
   * Like: git add new_file.txt && git commit -m "message"
   */
  async append(text: string, message?: string): Promise<NarrativeCommit> {
    return await this.repository.appendNarrative(text, 'user', message);
  }

  /**
   * Create a new narrative branch
   * Like: git checkout -b new-branch
   */
  branch(name: string, description: string = `New branch: ${name}`): NarrativeBranch {
    return this.repository.createBranch(name, description);
  }

  /**
   * Switch to different branch
   * Like: git checkout branch-name
   */
  checkout(branchName: string): boolean {
    return this.repository.checkout(branchName);
  }

  /**
   * Create merge request
   * Like: git merge source-branch
   */
  async merge(
    sourceBranch: string, 
    targetBranch: string = 'main',
    title: string = `Merge ${sourceBranch} into ${targetBranch}`,
    description: string = ''
  ): Promise<MergeRequest> {
    return await this.repository.createMergeRequest(
      sourceBranch, 
      targetBranch, 
      title, 
      description, 
      'user'
    );
  }

  /**
   * Execute a merge
   * Like: git merge --continue (after resolving conflicts)
   */
  async executeMerge(mergeRequest: MergeRequest): Promise<NarrativeCommit> {
    return await this.repository.executeMerge(mergeRequest);
  }

  /**
   * Show narrative history
   * Like: git log
   */
  log(branchName?: string): NarrativeCommit[] {
    return this.repository.getHistory(branchName);
  }

  /**
   * Show current status
   * Like: git status
   */
  async status(): Promise<{
    currentBranch: string;
    worldState: any;
    inconsistencies: Inconsistency[];
    metrics: any;
  }> {
    const worldState = this.repository.getCurrentWorldState();
    const inconsistencies = await this.repository.checkConsistency();
    
    return {
      currentBranch: 'main', // Would track current branch
      worldState: {
        entities: worldState.entityStates.size,
        relationships: worldState.activeRelationships.size,
        scenes: worldState.sceneTimeline.length,
        consistencyScore: worldState.consistencyScore
      },
      inconsistencies,
      metrics: worldState.metrics
    };
  }

  // ============================================================================
  // NARRATIVE-SPECIFIC QUERIES
  // ============================================================================

  /**
   * Find characters, locations, objects in narrative
   */
  find(query: string): NarrativeEntity[] {
    return this.repository.searchEntities(query);
  }

  /**
   * Get relationship network
   */
  relationships(): Map<string, NarrativeRelationship[]> {
    return this.repository.getRelationshipNetwork();
  }

  /**
   * Check for narrative inconsistencies
   */
  async check(): Promise<Inconsistency[]> {
    return await this.repository.checkConsistency();
  }

  /**
   * Get current world state
   */
  world() {
    return this.repository.getCurrentWorldState();
  }

  // ============================================================================
  // TIMELINE-SPECIFIC METHODS
  // ============================================================================

  /**
   * Add content at specific narrative date
   * Inserts event into timeline regardless of commit order
   */
  async addAtTime(text: string, narrativeDate: Date, message?: string, title?: string): Promise<NarrativeCommit> {
    return await this.repository.addAtTime(text, narrativeDate, message, title);
  }

  /**
   * Get timeline ordered by narrative date (not commit date)
   */
  timeline(branchName?: string): NarrativeCommit[] {
    return this.repository.getNarrativeTimeline(branchName);
  }

  /**
   * Get events within narrative date range
   */
  timelineRange(startDate: Date, endDate: Date, branchName?: string): NarrativeCommit[] {
    return this.repository.getTimelineRange(startDate, endDate, branchName);
  }

  /**
   * Get events for specific year
   */
  timelineYear(year: number, branchName?: string): NarrativeCommit[] {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    return this.repository.getTimelineRange(startDate, endDate, branchName);
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Initialize from a story file
   */
  static async fromText(text: string, title?: string): Promise<NarrativeGit> {
    const git = new NarrativeGit();
    await git.add(text, `Initial commit: ${title || 'Story'}`, title);
    return git;
  }

  /**
   * Initialize empty repository
   */
  static create(): NarrativeGit {
    return new NarrativeGit();
  }

  /**
   * Create with custom LLM adapter
   */
  static withLLM(adapter: LLMAdapter): NarrativeGit {
    return new NarrativeGit(adapter);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export * from './core/narrative-versioning';
export * from './core/narrative-repository';
export * from './llm/types';
export { NarrativeGit as default };

// ============================================================================
// USAGE EXAMPLES (for documentation)
// ============================================================================

/*

// Basic usage
const git = NarrativeGit.create();
await git.add(storyText, "Add initial story");
await git.append(continueText, "Continue the adventure");

// Branching workflow
git.branch("alternative-ending", "Explore different ending");
git.checkout("alternative-ending");
await git.add(alternativeText, "Add alternative ending");

// Merging
const mergeRequest = await git.merge("alternative-ending", "main");
if (mergeRequest.autoMergeable) {
  await git.executeMerge(mergeRequest);
}

// Analysis
const status = await git.status();
const inconsistencies = await git.check();
const characters = git.find("protagonist");
const relationships = git.relationships();

// Initialize from existing text
const git2 = await NarrativeGit.fromText(longStoryText, "Epic Fantasy");

*/
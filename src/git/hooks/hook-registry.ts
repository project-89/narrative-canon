/**
 * Hook Registry - Manages and executes reality manifestation hooks
 *
 * This is the consciousness coordination system that triggers asset generation,
 * lore expansion, and other reality manifestations when the narrative changes.
 */

import {
  RealityHook,
  HookContext,
  HookResult,
  HookServices,
  HookRegistryConfig,
  HookTrigger,
  HookTriggerType,
  GeneratedAsset,
} from "./types";
import {
  GraphOperation,
  NarrativeCommit,
  AddEntityOperation,
  UpdateEntityOperation,
  AddRelationshipOperation,
  RemoveRelationshipOperation,
} from "../types";
import { NarrativeCanonGraph } from "../narrative-canon-graph";

export class HookRegistry {
  private hooks: Map<string, RealityHook> = new Map();
  private config: Required<HookRegistryConfig>;
  private services: HookServices;
  private executionHistory: Map<string, HookExecutionRecord[]> = new Map();

  constructor(services: HookServices = {}, config: HookRegistryConfig = {}) {
    this.services = services;
    this.config = {
      maxHooksPerCommit: config.maxHooksPerCommit || 50,
      globalTimeout: config.globalTimeout || 30000, // 30 seconds
      executionMode: config.executionMode || "parallel",
      errorStrategy: config.errorStrategy || "continue-on-error",
      logging: {
        level: config.logging?.level || "info",
        logExecutionTime: config.logging?.logExecutionTime ?? true,
        logTriggers: config.logging?.logTriggers ?? false,
      },
    };
  }

  /**
   * Register a new hook
   */
  register(hook: RealityHook): void {
    if (this.hooks.has(hook.id)) {
      throw new Error(`Hook with id '${hook.id}' already registered`);
    }

    this.hooks.set(hook.id, hook);
    this.log("info", `Registered hook: ${hook.name} (${hook.id})`);
  }

  /**
   * Unregister a hook
   */
  unregister(hookId: string): boolean {
    const removed = this.hooks.delete(hookId);
    if (removed) {
      this.log("info", `Unregistered hook: ${hookId}`);
    }
    return removed;
  }

  /**
   * Get all registered hooks
   */
  getHooks(): RealityHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Execute hooks for a commit
   */
  async executeHooksForCommit(
    commit: NarrativeCommit,
    previousGraph: NarrativeCanonGraph,
    currentGraph: NarrativeCanonGraph
  ): Promise<HookResult[]> {
    const results: HookResult[] = [];

    // Process each operation in the commit
    for (const operation of commit.operations) {
      const operationResults = await this.executeHooksForOperation(
        operation,
        commit,
        previousGraph,
        currentGraph
      );
      results.push(...operationResults);
    }

    // Check for commit-level triggers
    const commitResults = await this.executeCommitHooks(
      commit,
      previousGraph,
      currentGraph
    );
    results.push(...commitResults);

    // Record execution history
    this.recordExecutionHistory(commit.id, results);

    return results;
  }

  /**
   * Execute hooks for a specific operation
   */
  private async executeHooksForOperation(
    operation: GraphOperation,
    commit: NarrativeCommit,
    previousGraph: NarrativeCanonGraph,
    currentGraph: NarrativeCanonGraph
  ): Promise<HookResult[]> {
    // Find triggered hooks
    const triggeredHooks = this.findTriggeredHooks(operation, commit);

    if (triggeredHooks.length === 0) {
      return [];
    }

    // Sort by priority
    triggeredHooks.sort((a, b) => b.priority - a.priority);

    // Limit number of hooks
    const hooksToExecute = triggeredHooks.slice(
      0,
      this.config.maxHooksPerCommit
    );

    // Build context
    const context = this.buildContext(
      operation,
      commit,
      previousGraph,
      currentGraph
    );

    // Execute hooks based on mode
    if (this.config.executionMode === "parallel") {
      return this.executeHooksParallel(hooksToExecute, context);
    } else {
      return this.executeHooksSequential(hooksToExecute, context);
    }
  }

  /**
   * Execute commit-level hooks
   */
  private async executeCommitHooks(
    commit: NarrativeCommit,
    previousGraph: NarrativeCanonGraph,
    currentGraph: NarrativeCanonGraph
  ): Promise<HookResult[]> {
    const commitHooks = Array.from(this.hooks.values()).filter((hook) =>
      hook.triggers.some(
        (trigger) =>
          trigger.type === "COMMIT_CREATED" ||
          (trigger.type === "CANONICAL_STATE_REACHED" &&
            commit.canonicalEvent?.id === trigger.canonicalStateId)
      )
    );

    if (commitHooks.length === 0) {
      return [];
    }

    const context: HookContext = {
      commit,
      previousGraph,
      currentGraph,
      canonicalEvent: commit.canonicalEvent,
      services: this.services,
    };

    if (this.config.executionMode === "parallel") {
      return this.executeHooksParallel(commitHooks, context);
    } else {
      return this.executeHooksSequential(commitHooks, context);
    }
  }

  /**
   * Find hooks triggered by an operation
   */
  private findTriggeredHooks(
    operation: GraphOperation,
    commit: NarrativeCommit
  ): RealityHook[] {
    return Array.from(this.hooks.values()).filter((hook) => {
      return hook.triggers.some((trigger) =>
        this.isTriggerMatched(trigger, operation, commit)
      );
    });
  }

  /**
   * Check if a trigger matches an operation
   */
  private isTriggerMatched(
    trigger: HookTrigger,
    operation: GraphOperation,
    commit: NarrativeCommit
  ): boolean {
    // Map operation types to trigger types
    const triggerType = this.getOperationTriggerType(operation);
    if (!triggerType || trigger.type !== triggerType) {
      return false;
    }

    // Check type-specific filters
    switch (operation.type) {
      case "ADD_ENTITY":
      case "UPDATE_ENTITY":
        const entityOp = operation as
          | AddEntityOperation
          | UpdateEntityOperation;
        const entity = "payload" in entityOp ? entityOp.payload : null;

        if (
          trigger.entityType &&
          entity &&
          "type" in entity &&
          entity.type !== trigger.entityType
        ) {
          return false;
        }

        if (
          trigger.entityId &&
          entity &&
          (("id" in entity && entity.id !== trigger.entityId) ||
            ("entityId" in entity && entity.entityId !== trigger.entityId))
        ) {
          return false;
        }

        if (trigger.fields && operation.type === "UPDATE_ENTITY") {
          const updateOp = operation as UpdateEntityOperation;
          const changedFields = Object.keys(updateOp.payload.changes);
          const hasMatchingField = trigger.fields.some((field) =>
            changedFields.includes(field)
          );
          if (!hasMatchingField) {
            return false;
          }
        }
        break;

      case "ADD_RELATIONSHIP":
      case "UPDATE_RELATIONSHIP":
        const relOp = operation as AddRelationshipOperation;
        if (
          trigger.relationshipType &&
          relOp.payload.type !== trigger.relationshipType
        ) {
          return false;
        }
        break;
    }

    if (this.config.logging?.logTriggers) {
      this.log(
        "debug",
        `Trigger matched: ${trigger.type} for operation ${operation.type}`
      );
    }

    return true;
  }

  /**
   * Get trigger type for an operation
   */
  private getOperationTriggerType(
    operation: GraphOperation
  ): HookTriggerType | null {
    switch (operation.type) {
      case "ADD_ENTITY":
        return "ENTITY_ADDED";
      case "UPDATE_ENTITY":
        return "ENTITY_UPDATED";
      case "REMOVE_ENTITY":
        return "ENTITY_REMOVED";
      case "ADD_RELATIONSHIP":
        return "RELATIONSHIP_FORMED";
      case "UPDATE_RELATIONSHIP":
        return "RELATIONSHIP_CHANGED";
      case "REMOVE_RELATIONSHIP":
        return "RELATIONSHIP_BROKEN";
      default:
        return null;
    }
  }

  /**
   * Build execution context
   */
  private buildContext(
    operation: GraphOperation,
    commit: NarrativeCommit,
    previousGraph: NarrativeCanonGraph,
    currentGraph: NarrativeCanonGraph
  ): HookContext {
    const context: HookContext = {
      operation,
      commit,
      previousGraph,
      currentGraph,
      services: this.services,
    };

    // Add entity/relationship based on operation type
    switch (operation.type) {
      case "ADD_ENTITY":
        const addOp = operation as AddEntityOperation;
        context.entity = addOp.payload;
        break;
      case "UPDATE_ENTITY":
        const updateOp = operation as UpdateEntityOperation;
        context.entity = currentGraph["entities"].get(
          updateOp.payload.entityId
        );
        break;
      case "ADD_RELATIONSHIP":
        const addRelOp = operation as AddRelationshipOperation;
        context.relationship = addRelOp.payload;
        break;
      // ... other cases
    }

    return context;
  }

  /**
   * Execute hooks in parallel
   */
  private async executeHooksParallel(
    hooks: RealityHook[],
    context: HookContext
  ): Promise<HookResult[]> {
    const promises = hooks.map((hook) => this.executeSingleHook(hook, context));
    return Promise.all(promises);
  }

  /**
   * Execute hooks sequentially
   */
  private async executeHooksSequential(
    hooks: RealityHook[],
    context: HookContext
  ): Promise<HookResult[]> {
    const results: HookResult[] = [];

    for (const hook of hooks) {
      const result = await this.executeSingleHook(hook, context);
      results.push(result);

      // Apply mutations before next hook
      if (result.mutations && hook.canMutate) {
        // In a real implementation, would apply mutations to context.currentGraph
        this.log(
          "debug",
          `Applied ${result.mutations.length} mutations from hook ${hook.id}`
        );
      }

      // Stop on error if configured
      if (result.error && this.config.errorStrategy === "stop-on-error") {
        break;
      }
    }

    return results;
  }

  /**
   * Execute a single hook with error handling and timeout
   */
  private async executeSingleHook(
    hook: RealityHook,
    context: HookContext
  ): Promise<HookResult> {
    const startTime = Date.now();
    const timeout = hook.timeout || this.config.globalTimeout;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<HookResult>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Hook timeout after ${timeout}ms`)),
          timeout
        );
      });

      // Execute hook with timeout
      const result = await Promise.race([
        hook.execute(context),
        timeoutPromise,
      ]);

      const executionTime = Date.now() - startTime;
      result.executionTime = executionTime;

      if (this.config.logging?.logExecutionTime) {
        this.log("debug", `Hook ${hook.id} executed in ${executionTime}ms`);
      }

      // Call success handler if provided
      if (hook.onSuccess) {
        hook.onSuccess(result, context);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const result: HookResult = {
        processed: false,
        error: error as Error,
        executionTime,
      };

      this.log("error", `Hook ${hook.id} failed: ${(error as Error).message}`);

      // Call error handler if provided
      if (hook.onError) {
        hook.onError(error as Error, context);
      }

      // Decide whether to continue based on error strategy
      if (this.config.errorStrategy === "rollback-on-error") {
        // In real implementation, would trigger rollback
        this.log("warn", "Rollback triggered due to hook error");
      }

      return result;
    }
  }

  /**
   * Record execution history for debugging and analytics
   */
  private recordExecutionHistory(
    commitId: string,
    results: HookResult[]
  ): void {
    const records: HookExecutionRecord[] = results.map((result, index) => ({
      hookId: this.getHooks()[index]?.id || "unknown",
      timestamp: Date.now(),
      success: result.processed,
      executionTime: result.executionTime || 0,
      artifactsGenerated: result.artifacts?.length || 0,
      mutationsApplied: result.mutations?.length || 0,
      error: result.error?.message,
    }));

    this.executionHistory.set(commitId, records);

    // Limit history size
    if (this.executionHistory.size > 1000) {
      const oldestKey = this.executionHistory.keys().next().value;
      if (oldestKey) {
        this.executionHistory.delete(oldestKey);
      }
    }
  }

  /**
   * Get execution history for a commit
   */
  getExecutionHistory(commitId: string): HookExecutionRecord[] | undefined {
    return this.executionHistory.get(commitId);
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory.clear();
  }

  /**
   * Update services available to hooks
   */
  updateServices(services: Partial<HookServices>): void {
    this.services = { ...this.services, ...services };
  }

  /**
   * Logging helper
   */
  private log(
    level: "none" | "error" | "warn" | "info" | "debug",
    message: string
  ): void {
    const configLevel = this.config.logging.level;
    const levels = ["none", "error", "warn", "info", "debug"];

    if (levels.indexOf(level) <= levels.indexOf(configLevel)) {
      const timestamp = new Date().toISOString();
      console.log(
        `[${timestamp}] [HookRegistry] [${level.toUpperCase()}] ${message}`
      );
    }
  }
}

/**
 * Execution history record
 */
interface HookExecutionRecord {
  hookId: string;
  timestamp: number;
  success: boolean;
  executionTime: number;
  artifactsGenerated: number;
  mutationsApplied: number;
  error?: string;
}

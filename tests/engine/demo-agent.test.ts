/**
 * Aureum Rules Engine — Agent World Model Demo
 *
 * Models an AI agent's understanding of its environment using entities + rules.
 * The agent maintains a world model of: people, tasks, knowledge, and context.
 * Rules define how the agent should respond to events — which tool to call,
 * what to prioritize, how to update its understanding.
 *
 * This demonstrates the engine driving agent behavior without code —
 * an LLM could read, modify, and extend these rules.
 *
 * Scenario: An AI coding assistant managing a project.
 */

import { createEntity, World } from '../../src/engine/world';
import { Rule, createRuleSet } from '../../src/engine/rules';
import { step, evaluate, evaluateAll, StepResult } from '../../src/engine/evaluator';

describe('Agent World Model Demo', () => {
  function createAgentWorld(): World {
    return new World([
      // ── Agent State ─────────────────────────────────────────────────────

      createEntity('AGENT', {
        tags: ['agent', 'idle'],
        stats: {
          confidence: 7,     // how confident the agent is in its plan
          context_depth: 0,  // how much context has been gathered
          tasks_completed: 0,
        },
        links: { current_user: 'USER_MIKE', active_project: 'PROJECT_AUREUM' },
        meta: { name: 'Coding Assistant' },
      }),

      // ── People ──────────────────────────────────────────────────────────

      createEntity('USER_MIKE', {
        tags: ['person', 'user', 'active'],
        stats: { expertise_level: 8, patience: 6, satisfaction: 5 },
        links: { role: 'ROLE_ENGINEER' },
        meta: { name: 'Mike', preferences: 'concise, no placeholders, premium design' },
      }),

      createEntity('ROLE_ENGINEER', {
        tags: ['role', 'technical'],
        meta: { description: 'Senior engineer, prefers grounded language over esoteric' },
      }),

      // ── Project ─────────────────────────────────────────────────────────

      createEntity('PROJECT_AUREUM', {
        tags: ['project', 'active', 'typescript'],
        stats: { complexity: 7, files_modified: 12, test_coverage: 71 },
        links: { owner: 'USER_MIKE' },
        meta: { name: 'Aureum Rules Engine', stack: 'TypeScript, Jest' },
      }),

      // ── Tasks ───────────────────────────────────────────────────────────

      createEntity('TASK_BUG_FIX', {
        tags: ['task', 'pending', 'bug'],
        stats: { priority: 8, estimated_effort: 3 },
        links: { project: 'PROJECT_AUREUM', reporter: 'USER_MIKE' },
        meta: { title: 'Fix parser negated link handling', file: 'parser.ts' },
      }),

      createEntity('TASK_FEATURE', {
        tags: ['task', 'pending', 'feature'],
        stats: { priority: 5, estimated_effort: 8 },
        links: { project: 'PROJECT_AUREUM', reporter: 'USER_MIKE' },
        meta: { title: 'Add MCP tool exposure', file: 'mcp-tools.ts' },
      }),

      createEntity('TASK_REVIEW', {
        tags: ['task', 'pending', 'review'],
        stats: { priority: 3, estimated_effort: 2 },
        links: { project: 'PROJECT_AUREUM' },
        meta: { title: 'Review serializer edge cases' },
      }),

      // ── Knowledge ───────────────────────────────────────────────────────

      createEntity('KNOWLEDGE_CODEBASE', {
        tags: ['knowledge', 'codebase', 'loaded'],
        stats: { freshness: 9 },
        links: { project: 'PROJECT_AUREUM' },
        meta: { description: 'Understanding of the engine architecture' },
      }),

      createEntity('KNOWLEDGE_USER_PREFS', {
        tags: ['knowledge', 'preferences', 'loaded'],
        stats: { freshness: 7 },
        links: { person: 'USER_MIKE' },
        meta: { description: 'User preferences and communication style' },
      }),

      // ── Incoming Events ─────────────────────────────────────────────────

      createEntity('EVENT_QUEUE', {
        tags: ['event_queue'],
        stats: { pending_events: 0 },
      }),
    ]);
  }

  function createAgentRules() {
    const rules: Rule[] = [
      // ── Task Prioritization ────────────────────────────────────────────

      // High-priority bug: fix immediately
      {
        id: 'handle_urgent_bug',
        trigger: { id: '*', tags: [{ tag: 'task', negated: false }, { tag: 'pending', negated: false }, { tag: 'bug', negated: false }] },
        conditions: [
          { id: '*', stats: [{ key: 'priority', operator: '>=', value: 7 }] },
        ],
        changes: [
          { target: '$', operations: [
            { type: 'removeTag', tag: 'pending' },
            { type: 'addTag', tag: 'in_progress' },
          ]},
          { target: 'AGENT', operations: [
            { type: 'removeTag', tag: 'idle' },
            { type: 'addTag', tag: 'working' },
            { type: 'setStat', key: 'confidence', value: 8 },
          ]},
        ],
        sideEffects: [
          { type: 'agent_action', payload: { tool: 'view_file', reason: 'Bug fix — need to read the file first', priority: 'high' } },
          { type: 'agent_thought', payload: { text: 'High-priority bug reported. Addressing immediately before any feature work.' } },
        ],
        description: 'Pick up urgent bug fix',
      },

      // Feature request: plan first
      {
        id: 'handle_feature_request',
        trigger: { id: '*', tags: [{ tag: 'task', negated: false }, { tag: 'pending', negated: false }, { tag: 'feature', negated: false }] },
        changes: [
          { target: '$', operations: [
            { type: 'removeTag', tag: 'pending' },
            { type: 'addTag', tag: 'planning' },
          ]},
          { target: 'AGENT', operations: [
            { type: 'removeTag', tag: 'idle' },
            { type: 'addTag', tag: 'planning' },
          ]},
        ],
        sideEffects: [
          { type: 'agent_action', payload: { tool: 'create_plan', reason: 'Feature work requires a plan before implementation' } },
          { type: 'agent_thought', payload: { text: 'New feature request. Creating implementation plan for user review first.' } },
        ],
        description: 'Plan feature request',
      },

      // ── Context Gathering ──────────────────────────────────────────────

      // Agent needs more context when confidence is low
      {
        id: 'gather_context',
        trigger: { id: 'AGENT', tags: [{ tag: 'working', negated: false }] },
        conditions: [
          { id: 'AGENT', stats: [{ key: 'confidence', operator: '<', value: 5 }] },
        ],
        changes: [
          { target: 'AGENT', operations: [
            { type: 'incrementStat', key: 'context_depth', amount: 1 },
            { type: 'incrementStat', key: 'confidence', amount: 2 },
          ]},
        ],
        sideEffects: [
          { type: 'agent_action', payload: { tool: 'grep_search', reason: 'Low confidence — need more context before proceeding' } },
          { type: 'agent_thought', payload: { text: 'Not confident enough to proceed. Gathering more context.' } },
        ],
        description: 'Gather context when unsure',
      },

      // ── User Interaction Rules ─────────────────────────────────────────

      // User satisfaction drops — adjust approach
      {
        id: 'user_frustrated',
        trigger: { id: 'USER_MIKE', tags: [{ tag: 'active', negated: false }] },
        conditions: [
          { id: 'USER_MIKE', stats: [{ key: 'satisfaction', operator: '<=', value: 3 }] },
        ],
        changes: [
          { target: 'AGENT', operations: [
            { type: 'addTag', tag: 'adjusting_approach' },
            { type: 'setStat', key: 'confidence', value: 4 },
          ]},
        ],
        sideEffects: [
          { type: 'agent_thought', payload: { text: 'User seems frustrated. Need to be more concise and direct. Ask fewer questions, take more decisive action.' } },
          { type: 'agent_action', payload: { tool: 'adjust_style', style: 'more_concise', reason: 'User satisfaction low' } },
        ],
        description: 'Adjust when user frustrated',
      },

      // ── Task Completion ────────────────────────────────────────────────

      // Task done — update world
      {
        id: 'complete_task',
        trigger: { id: '*', tags: [{ tag: 'task', negated: false }, { tag: 'in_progress', negated: false }, { tag: 'verified', negated: false }] },
        changes: [
          { target: '$', operations: [
            { type: 'removeTag', tag: 'in_progress' },
            { type: 'removeTag', tag: 'verified' },
            { type: 'addTag', tag: 'completed' },
          ]},
          { target: 'AGENT', operations: [
            { type: 'incrementStat', key: 'tasks_completed', amount: 1 },
          ]},
          { target: 'USER_MIKE', operations: [
            { type: 'incrementStat', key: 'satisfaction', amount: 1 },
          ]},
        ],
        sideEffects: [
          { type: 'agent_thought', payload: { text: 'Task completed and verified. Moving on.' } },
          { type: 'agent_action', payload: { tool: 'notify_user', reason: 'Task complete — inform user' } },
        ],
        description: 'Complete verified task',
      },

      // ── Knowledge Staleness ────────────────────────────────────────────

      // Knowledge is stale — refresh it
      {
        id: 'refresh_knowledge',
        trigger: { id: '*', tags: [{ tag: 'knowledge', negated: false }, { tag: 'loaded', negated: false }] },
        conditions: [
          { id: '*', stats: [{ key: 'freshness', operator: '<=', value: 3 }] },
        ],
        changes: [
          { target: '$', operations: [
            { type: 'removeTag', tag: 'loaded' },
            { type: 'addTag', tag: 'stale' },
          ]},
        ],
        sideEffects: [
          { type: 'agent_action', payload: { tool: 'view_file', reason: 'Knowledge outdated — refreshing understanding' } },
        ],
        description: 'Refresh stale knowledge',
      },
    ];

    return createRuleSet('agent_model', 'Agent World Model', rules, 'Rules governing agent behavior');
  }

  // ── Tests ────────────────────────────────────────────────────────────────

  it('agent picks up urgent bug before feature work', () => {
    const world = createAgentWorld();
    const rules = createAgentRules();

    // Trigger the bug task
    const result = step('TASK_BUG_FIX', world, rules);
    expect(result.match!.rule.id).toBe('handle_urgent_bug');

    // Agent is now working
    const agent = result.world.get('AGENT')!;
    expect(agent.tags.has('working')).toBe(true);
    expect(agent.tags.has('idle')).toBe(false);

    // Task is in progress
    const task = result.world.get('TASK_BUG_FIX')!;
    expect(task.tags.has('in_progress')).toBe(true);

    // Side effect tells the agent what tool to use
    const action = result.sideEffects.find((se) => se.type === 'agent_action');
    expect(action!.payload.tool).toBe('view_file');
    expect(action!.payload.priority).toBe('high');
  });

  it('feature request triggers planning mode, not immediate work', () => {
    const world = createAgentWorld();
    const rules = createAgentRules();

    const result = step('TASK_FEATURE', world, rules);
    expect(result.match!.rule.id).toBe('handle_feature_request');

    const agent = result.world.get('AGENT')!;
    expect(agent.tags.has('planning')).toBe(true);

    const action = result.sideEffects.find((se) => se.type === 'agent_action');
    expect(action!.payload.tool).toBe('create_plan');
  });

  it('agent gathers more context when confidence is low', () => {
    const world = createAgentWorld();
    const rules = createAgentRules();

    // Put agent in working state with low confidence
    const agent = world.get('AGENT')!;
    agent.tags.delete('idle');
    agent.tags.add('working');
    agent.stats.set('confidence', 3);

    const result = step('AGENT', world, rules);
    expect(result.match!.rule.id).toBe('gather_context');
    expect(result.world.get('AGENT')!.stats.get('confidence')).toBe(5);  // 3 + 2

    const action = result.sideEffects.find((se) => se.type === 'agent_action');
    expect(action!.payload.tool).toBe('grep_search');
  });

  it('adjusts approach when user satisfaction drops', () => {
    const world = createAgentWorld();
    const rules = createAgentRules();

    // Simulate frustrated user
    world.get('USER_MIKE')!.stats.set('satisfaction', 2);

    const result = step('USER_MIKE', world, rules);
    expect(result.match!.rule.id).toBe('user_frustrated');

    const thought = result.sideEffects.find((se) => se.type === 'agent_thought');
    expect(thought!.payload.text).toContain('concise');

    const action = result.sideEffects.find((se) => se.type === 'agent_action');
    expect(action!.payload.style).toBe('more_concise');
  });

  it('completing a task boosts user satisfaction', () => {
    const world = createAgentWorld();
    const rules = createAgentRules();

    // Set up task as in_progress + verified
    const task = world.get('TASK_BUG_FIX')!;
    task.tags.delete('pending');
    task.tags.add('in_progress');
    task.tags.add('verified');

    const satBefore = world.get('USER_MIKE')!.stats.get('satisfaction')!;
    const result = step('TASK_BUG_FIX', world, rules);
    expect(result.match!.rule.id).toBe('complete_task');

    const satAfter = result.world.get('USER_MIKE')!.stats.get('satisfaction')!;
    expect(satAfter).toBe(satBefore + 1);
    expect(result.world.get('AGENT')!.stats.get('tasks_completed')).toBe(1);
  });

  it('detects stale knowledge and marks for refresh', () => {
    const world = createAgentWorld();
    const rules = createAgentRules();

    // Make knowledge stale
    world.get('KNOWLEDGE_CODEBASE')!.stats.set('freshness', 2);

    const result = step('KNOWLEDGE_CODEBASE', world, rules);
    expect(result.match!.rule.id).toBe('refresh_knowledge');
    expect(result.world.get('KNOWLEDGE_CODEBASE')!.tags.has('stale')).toBe(true);
  });

  it('full agent workflow: pick up bug → complete → notify', () => {
    let world = createAgentWorld();
    const rules = createAgentRules();

    // 1. Pick up bug
    let result = step('TASK_BUG_FIX', world, rules);
    expect(result.match!.rule.id).toBe('handle_urgent_bug');
    world = result.world;

    // 2. Mark as verified (simulating the agent doing the fix + running tests)
    world.get('TASK_BUG_FIX')!.tags.add('verified');

    // 3. Complete the task
    result = step('TASK_BUG_FIX', world, rules);
    expect(result.match!.rule.id).toBe('complete_task');
    world = result.world;

    // Verify final state
    expect(world.get('TASK_BUG_FIX')!.tags.has('completed')).toBe(true);
    expect(world.get('AGENT')!.stats.get('tasks_completed')).toBe(1);
    expect(world.get('USER_MIKE')!.stats.get('satisfaction')).toBe(6);  // 5 + 1

    // The notify action was emitted
    const notifyAction = result.sideEffects.find(
      (se) => se.type === 'agent_action' && se.payload.tool === 'notify_user'
    );
    expect(notifyAction).toBeDefined();
  });
});

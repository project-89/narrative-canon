/**
 * Aureum Rules Engine — MCP Tool Definitions
 *
 * Exposes the Aureum engine as MCP tools that any LLM can call to
 * create, inspect, and manipulate game worlds and rulesets.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const aureumTools: Tool[] = [
  // ── World Management ────────────────────────────────────────────────────

  {
    name: 'aureum_create_world',
    description: 'Create a new empty game world, replacing any existing one.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'aureum_add_entity',
    description: 'Add an entity to the world. Entities are the building blocks — cards, players, locations, game state, objectives, enemies.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique entity ID, e.g. "PLAYER", "CARD_FIREBALL", "LOCATION_DUNGEON"',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags categorizing this entity, e.g. ["card", "action", "fire", "in_hand"]',
        },
        stats: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Numeric properties, e.g. { "damage": 3, "se_cost": 2, "hp": 10 }',
        },
        links: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'References to other entities, e.g. { "location": "DUNGEON", "owner": "PLAYER" }',
        },
        meta: {
          type: 'object',
          additionalProperties: {},
          description: 'Display metadata, e.g. { "name": "Fireball", "flavor": "...", "effect": "..." }',
        },
      },
      required: ['id'],
    },
  },

  {
    name: 'aureum_update_entity',
    description: 'Update an existing entity. Merge tags/stats/links/meta with existing values.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID to update' },
        addTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to add',
        },
        removeTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to remove',
        },
        setStats: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Stats to set or overwrite',
        },
        setLinks: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Links to set or overwrite',
        },
        setMeta: {
          type: 'object',
          additionalProperties: {},
          description: 'Meta to set or overwrite',
        },
      },
      required: ['id'],
    },
  },

  {
    name: 'aureum_remove_entity',
    description: 'Remove an entity from the world.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID to remove' },
      },
      required: ['id'],
    },
  },

  {
    name: 'aureum_list_entities',
    description: 'List all entities in the world. Optionally filter by tag.',
    inputSchema: {
      type: 'object',
      properties: {
        filterTag: {
          type: 'string',
          description: 'Only show entities with this tag',
        },
      },
    },
  },

  {
    name: 'aureum_get_entity',
    description: 'Get full details of a specific entity.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID' },
      },
      required: ['id'],
    },
  },

  // ── Rule Management ─────────────────────────────────────────────────────

  {
    name: 'aureum_add_rule',
    description: 'Add a rule to the active ruleset. Rules have: trigger (which entity/pattern to match), conditions (additional world state checks), changes (what happens), sideEffects (narrative/events), priority (optional), oneShot (optional).',
    inputSchema: {
      type: 'object',
      properties: {
        rule: {
          type: 'object',
          description: 'Full rule object. See schema reference for structure.',
          properties: {
            id: { type: 'string', description: 'Unique rule ID' },
            trigger: {
              type: 'object',
              description: 'Entity matcher: { id, tags: [{tag, negated}], stats: [{key, operator, value}], links: [{key, targetId, negated}] }',
            },
            conditions: {
              type: 'array',
              description: 'Additional entity matchers that must also match',
            },
            changes: {
              type: 'array',
              description: 'World changes: [{ target, operations: [{ type, ... }] }]',
            },
            sideEffects: {
              type: 'array',
              description: 'Side effects: [{ type, payload }]',
            },
            priority: { type: 'number', description: 'Higher = fires first. Default 0.' },
            oneShot: { type: 'boolean', description: 'If true, rule fires only once.' },
            description: { type: 'string' },
          },
          required: ['id', 'trigger'],
        },
      },
      required: ['rule'],
    },
  },

  {
    name: 'aureum_remove_rule',
    description: 'Remove a rule from the active ruleset.',
    inputSchema: {
      type: 'object',
      properties: {
        ruleId: { type: 'string', description: 'Rule ID to remove' },
      },
      required: ['ruleId'],
    },
  },

  {
    name: 'aureum_list_rules',
    description: 'List all rules in the active ruleset.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ── Session Tools ───────────────────────────────────────────────────────

  {
    name: 'aureum_step',
    description: 'Trigger a step: evaluate all rules against the given entity ID (or "*" for any entity with auto_trigger tag) and apply the highest-priority match.',
    inputSchema: {
      type: 'object',
      properties: {
        triggerId: {
          type: 'string',
          description: 'Entity ID to trigger rules against, e.g. "GAME" or "CARD_FIREBALL"',
        },
      },
      required: ['triggerId'],
    },
  },

  {
    name: 'aureum_get_state',
    description: 'Get the full serialized game state (world + rules) as JSON.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'aureum_load_state',
    description: 'Load a complete game state from JSON (replaces current world and rules).',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'object',
          description: 'Serialized engine state (from aureum_get_state)',
        },
      },
      required: ['state'],
    },
  },

  // ── Meta Tools ──────────────────────────────────────────────────────────

  {
    name: 'aureum_generate_game',
    description: 'Generate a complete card game from a text description. Uses an LLM to create entities (cards, players, locations, enemies, objectives) and rules (card plays, turn phases, win/loss conditions, enemy AI). Returns the generated game as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the card game to generate',
        },
        style: {
          type: 'string',
          enum: ['simple', 'standard', 'complex'],
          description: 'Complexity level. simple: 4-6 cards, 3-4 rules. standard: 8-12 cards, 6-10 rules. complex: 15+ cards, 12+ rules.',
        },
      },
      required: ['prompt'],
    },
  },
];

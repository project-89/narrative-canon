/**
 * Aureum Rules Engine — Parser
 *
 * Parses the ArgOS/ENE-style DSL syntax into Entity, Rule, and World objects.
 *
 * Entity syntax:
 *   ENTITY_ID.tag1.tag2.stat_key=number.link_key=TARGET_ID
 *   e.g. GOBLIN.character.sleeping.strength=3.location=CAVE
 *
 * Matcher syntax:
 *   *.tag.stat_key>5.link_key=TARGET_ID     (wildcard)
 *   ENTITY_ID.tag.!negated_tag              (specific + negated tag)
 *
 * Rule syntax:
 *   trigger: MATCHER
 *   conditions: MATCHER (one per line, or comma-separated)
 *   changes: ENTITY.operation | ENTITY.operation (pipe-separated)
 *   narrative: text
 *   description: text
 *
 * Change syntax:
 *   ENTITY.tag            → addTag
 *   ENTITY.-tag           → removeTag
 *   ENTITY.stat=value     → setStat
 *   ENTITY.stat+amount    → incrementStat
 *   ENTITY.stat-amount    → incrementStat (negative)
 *   ENTITY.link=TARGET    → setLink
 *   $.link=TARGET         → setLink on trigger entity
 */

import { Entity, createEntity, EntityMatcher, TagCondition, StatCondition, LinkCondition, StatOperator } from './world';
import { Rule, WorldChange, ChangeOperation, SideEffect } from './rules';

// ─── Entity Parsing ──────────────────────────────────────────────────────────

/**
 * Parse a single entity definition line into an Entity.
 *
 * Format: ID.tag1.tag2.stat=N.link=TARGET_ID
 * Multi-line format: ID\n.tag1\n.stat=N (lines starting with . continue the definition)
 */
export function parseEntity(input: string): Entity {
  const lines = input.trim().split('\n');
  // Concatenate continuation lines (lines starting with .)
  let combined = lines[0].trim();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('.')) {
      combined += line;
    }
  }

  const parts = splitDotSegments(combined);
  if (parts.length === 0) {
    throw new Error(`Invalid entity definition: "${input}"`);
  }

  const id = parts[0];
  const tags: string[] = [];
  const stats: Record<string, number> = {};
  const links: Record<string, string> = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const parsed = parsePropertySegment(part);

    if (parsed.type === 'tag') {
      tags.push(parsed.tag);
    } else if (parsed.type === 'stat') {
      stats[parsed.key] = parsed.value;
    } else if (parsed.type === 'link') {
      links[parsed.key] = parsed.targetId;
    }
  }

  return createEntity(id, { tags, stats, links });
}

/**
 * Parse multiple entity definitions (separated by blank lines or one per line).
 */
export function parseEntities(input: string): Entity[] {
  const entities: Entity[] = [];
  const blocks = splitBlocks(input);

  for (const block of blocks) {
    if (block.trim()) {
      entities.push(parseEntity(block.trim()));
    }
  }

  return entities;
}

// ─── Matcher Parsing ─────────────────────────────────────────────────────────

/**
 * Parse a matcher expression.
 *
 * Format: [ID_OR_WILDCARD][.tag][.!negated_tag][.stat>N][.link=TARGET]
 */
export function parseMatcher(input: string): EntityMatcher {
  const trimmed = input.trim();
  const parts = splitDotSegments(trimmed);
  if (parts.length === 0) {
    throw new Error(`Invalid matcher: "${input}"`);
  }

  const id = parts[0];
  const tags: TagCondition[] = [];
  const stats: StatCondition[] = [];
  const links: LinkCondition[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const parsed = parseMatcherSegment(part);

    if (parsed.type === 'tagCondition') {
      tags.push(parsed.condition);
    } else if (parsed.type === 'statCondition') {
      stats.push(parsed.condition);
    } else if (parsed.type === 'linkCondition') {
      links.push(parsed.condition);
    }
  }

  return {
    id: id === '*' ? '*' : id,
    ...(tags.length > 0 ? { tags } : {}),
    ...(stats.length > 0 ? { stats } : {}),
    ...(links.length > 0 ? { links } : {}),
  };
}

// ─── Rule Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a rule definition block.
 *
 * Format:
 *   // optional comment/description
 *   trigger: MATCHER
 *   conditions: MATCHER\nMATCHER (or comma-separated)
 *   changes: CHANGE | CHANGE (pipe-separated or newline-separated)
 *   narrative: text
 */
export function parseRule(input: string, ruleId?: string): Rule {
  const lines = input.trim().split('\n');
  let trigger: EntityMatcher | null = null;
  const conditions: EntityMatcher[] = [];
  const changes: WorldChange[] = [];
  const sideEffects: SideEffect[] = [];
  let description: string | undefined;
  let currentSection: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines
    if (!line) continue;

    // Comments become description
    if (line.startsWith('//')) {
      description = line.slice(2).trim();
      continue;
    }

    // Section headers
    if (line.startsWith('trigger:')) {
      trigger = parseMatcher(line.slice('trigger:'.length).trim());
      currentSection = 'trigger';
      continue;
    }

    if (line.startsWith('conditions:')) {
      const condText = line.slice('conditions:'.length).trim();
      if (condText) {
        // Comma-separated or single
        const parts = condText.split(',').map((s) => s.trim()).filter(Boolean);
        for (const part of parts) {
          conditions.push(parseMatcher(part));
        }
      }
      currentSection = 'conditions';
      continue;
    }

    if (line.startsWith('changes:')) {
      const changeText = line.slice('changes:'.length).trim();
      if (changeText) {
        parseChangeLine(changeText, changes);
      }
      currentSection = 'changes';
      continue;
    }

    if (line.startsWith('narrative:')) {
      const text = line.slice('narrative:'.length).trim();
      if (text) {
        sideEffects.push({ type: 'narrative', payload: { text } });
      }
      currentSection = 'narrative';
      continue;
    }

    // Continuation lines (no section header — belongs to current section)
    if (currentSection === 'conditions') {
      const parts = line.split(',').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        conditions.push(parseMatcher(part));
      }
    } else if (currentSection === 'changes') {
      parseChangeLine(line, changes);
    } else if (currentSection === 'narrative') {
      // Append to existing narrative
      const existing = sideEffects.find((se) => se.type === 'narrative');
      if (existing) {
        existing.payload.text = `${existing.payload.text} ${line}`;
      }
    }
  }

  if (!trigger) {
    throw new Error(`Rule is missing a trigger: "${input}"`);
  }

  return {
    id: ruleId ?? `rule_${hashString(input)}`,
    trigger,
    ...(conditions.length > 0 ? { conditions } : {}),
    ...(changes.length > 0 ? { changes } : {}),
    ...(sideEffects.length > 0 ? { sideEffects } : {}),
    ...(description ? { description } : {}),
  };
}

/**
 * Parse multiple rule blocks separated by blank lines.
 */
export function parseRules(input: string): Rule[] {
  const blocks = input.trim().split(/\n\s*\n/);
  return blocks
    .filter((block) => block.trim())
    .map((block, i) => parseRule(block, `rule_${i}`));
}

// ─── Change Parsing ──────────────────────────────────────────────────────────

/**
 * Parse a change line (pipe-separated changes for potentially multiple targets).
 *
 * Format: TARGET.operation | TARGET.operation
 * Operations:
 *   .tag          → addTag
 *   .-tag         → removeTag
 *   .stat=N       → setStat
 *   .stat+N       → incrementStat (positive)
 *   .stat-N       → incrementStat (negative)
 *   .link=TARGET  → setLink
 */
function parseChangeLine(line: string, changes: WorldChange[]): void {
  const segments = line.split('|').map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const parts = splitDotSegments(segment);
    if (parts.length < 2) continue;

    const target = parts[0]; // Entity id or $
    const operations: ChangeOperation[] = [];

    for (let i = 1; i < parts.length; i++) {
      const op = parseChangeOperation(parts[i]);
      if (op) operations.push(op);
    }

    if (operations.length > 0) {
      // Find existing change for same target and merge, or create new
      const existing = changes.find((c) => c.target === target);
      if (existing) {
        existing.operations.push(...operations);
      } else {
        changes.push({ target, operations });
      }
    }
  }
}

function parseChangeOperation(part: string): ChangeOperation | null {
  // Remove tag: -tag
  if (part.startsWith('-')) {
    return { type: 'removeTag', tag: part.slice(1) };
  }

  // Increment stat: stat+N or stat-N (for decrement)
  const incrMatch = part.match(/^(\w+)\+(-?\d+(?:\.\d+)?)$/);
  if (incrMatch) {
    return { type: 'incrementStat', key: incrMatch[1], amount: Number(incrMatch[2]) };
  }

  const decrMatch = part.match(/^(\w+)-(\d+(?:\.\d+)?)$/);
  if (decrMatch) {
    return { type: 'incrementStat', key: decrMatch[1], amount: -Number(decrMatch[2]) };
  }

  // Set stat or link: key=value
  const eqMatch = part.match(/^(\w+)=(.+)$/);
  if (eqMatch) {
    const key = eqMatch[1];
    const value = eqMatch[2];
    // If value is a number, it's a stat. Otherwise it's a link.
    const numValue = Number(value);
    if (!isNaN(numValue) && value.trim() !== '') {
      return { type: 'setStat', key, value: numValue };
    }
    return { type: 'setLink', key, targetId: value };
  }

  // Simple tag: just a word
  if (/^\w+$/.test(part)) {
    return { type: 'addTag', tag: part };
  }

  return null;
}

// ─── Internal Parsing Helpers ────────────────────────────────────────────────

type PropertySegment =
  | { type: 'tag'; tag: string }
  | { type: 'stat'; key: string; value: number }
  | { type: 'link'; key: string; targetId: string };

function parsePropertySegment(part: string): PropertySegment {
  // Check for key=value (stat or link)
  const eqMatch = part.match(/^(\w+)=(.+)$/);
  if (eqMatch) {
    const key = eqMatch[1];
    const value = eqMatch[2];
    const numValue = Number(value);
    if (!isNaN(numValue) && value.trim() !== '') {
      return { type: 'stat', key, value: numValue };
    }
    return { type: 'link', key, targetId: value };
  }

  // Otherwise it's a tag
  return { type: 'tag', tag: part };
}

type MatcherSegment =
  | { type: 'tagCondition'; condition: TagCondition }
  | { type: 'statCondition'; condition: StatCondition }
  | { type: 'linkCondition'; condition: LinkCondition };

function parseMatcherSegment(part: string): MatcherSegment {
  // Negated link: !key=TARGET (must check BEFORE negated tag)
  if (part.startsWith('!')) {
    const negLinkMatch = part.match(/^!(\w+)=([A-Za-z_]\w*)$/);
    if (negLinkMatch) {
      return {
        type: 'linkCondition',
        condition: { key: negLinkMatch[1], targetId: negLinkMatch[2], negated: true },
      };
    }
    // Negated tag: !tag
    return {
      type: 'tagCondition',
      condition: { tag: part.slice(1), negated: true },
    };
  }

  // Stat comparison: key>N, key<N, key>=N, key<=N, key!=N, key=N (when N is numeric)
  const statMatch = part.match(/^(\w+)(>=|<=|!=|>|<|=)(-?\d+(?:\.\d+)?)$/);
  if (statMatch) {
    return {
      type: 'statCondition',
      condition: {
        key: statMatch[1],
        operator: statMatch[2] as StatOperator,
        value: Number(statMatch[3]),
      },
    };
  }

  // Link condition: key=TARGET (non-numeric value)
  const linkMatch = part.match(/^(\w+)=([A-Za-z_]\w*)$/);
  if (linkMatch) {
    return {
      type: 'linkCondition',
      condition: { key: linkMatch[1], targetId: linkMatch[2], negated: false },
    };
  }

  // Simple tag
  return {
    type: 'tagCondition',
    condition: { tag: part, negated: false },
  };
}

/**
 * Split a string on dots, but respect = signs within segments.
 * "PLAYER.location=CAVE.fear+2" → ["PLAYER", "location=CAVE", "fear+2"]
 */
function splitDotSegments(input: string): string[] {
  const segments: string[] = [];
  let current = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '.') {
      if (current) {
        segments.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

/**
 * Split input into blocks. Handles multi-line entity definitions
 * (continuation lines starting with .) and blank-line-separated blocks.
 */
function splitBlocks(input: string): string[] {
  const lines = input.split('\n');
  const blocks: string[] = [];
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      if (current) {
        blocks.push(current);
        current = '';
      }
      continue;
    }

    // Continuation line (starts with .) — append to current
    if (trimmed.startsWith('.') && current) {
      current += '\n' + line;
    } else {
      // New block or new entity
      if (current && !trimmed.startsWith('.')) {
        blocks.push(current);
      }
      current = line;
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

/**
 * Simple string hash for generating rule ids from content.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

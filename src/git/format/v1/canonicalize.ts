/**
 * Canonical JSON serialisation for content-addressable hashing.
 *
 * Every tool that hashes a Nit commit, narrative, or working tree MUST
 * produce identical bytes for identical content. We achieve that by:
 *  - Sorting object keys alphabetically (deep)
 *  - Using JSON.stringify with no whitespace
 *  - Stripping non-deterministic runtime fields (extensions.studio.*, cachedUri)
 *
 * Tools MUST NOT use plain JSON.stringify for hashing — key order is undefined.
 */

import { createHash } from 'crypto';

/**
 * Recursively sort object keys. Arrays preserve order. Primitives are returned
 * as-is. Returns a new object; does not mutate the input.
 */
export function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const sortedKeys = Object.keys(value as object).sort();
    const out: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Strip fields that are deliberately excluded from content hashing because
 * they are runtime hints, not authored data. See spec §3.3.
 *
 * Returns a deep clone with the excluded fields removed.
 */
export function stripRuntimeFields<T>(value: T): T {
  return stripRuntimeFieldsImpl(value, false) as T;
}

function stripRuntimeFieldsImpl(value: unknown, isExtensions: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripRuntimeFieldsImpl(v, false));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Strip the studio runtime namespace inside any extensions object
      if (isExtensions && k === 'studio') continue;
      // Strip cachedUri on AssetRefs (local serving hints)
      if (k === 'cachedUri') continue;
      // Recurse; mark the next level as "extensions" if we just stepped into one
      out[k] = stripRuntimeFieldsImpl(v, k === 'extensions');
    }
    return out;
  }
  return value;
}

/**
 * Produce the canonical JSON byte sequence for a value.
 * Deterministic: same content in → same bytes out.
 */
export function canonicalize(value: unknown): string {
  const stripped = stripRuntimeFields(value);
  const sorted = sortKeysDeep(stripped);
  return JSON.stringify(sorted);
}

/**
 * SHA-256 of the canonical JSON encoding, hex-lowercase.
 */
export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

/**
 * Hash a commit's content (everything except the hash field itself and the
 * derived workingTreeHash, since those are derived FROM the content).
 */
export function commitContentHash(commit: {
  parentHashes: string[];
  author: unknown;
  timestamp: number;
  message: string;
  branch: string;
  operations: unknown[];
  tags?: string[];
}): string {
  const payload = {
    parentHashes: commit.parentHashes,
    author: commit.author,
    timestamp: commit.timestamp,
    message: commit.message,
    branch: commit.branch,
    operations: commit.operations,
    ...(commit.tags ? { tags: commit.tags } : {}),
  };
  return canonicalHash(payload);
}

/**
 * Hash the working narrative (a Narrative document). Used for
 * Commit.workingTreeHash and for fast equality checks across tools.
 */
export function workingTreeHash(narrative: unknown): string {
  return canonicalHash(narrative);
}

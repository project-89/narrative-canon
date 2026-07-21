/**
 * Centralized id minting (T0-SAFETY).
 *
 * The codebase grew ~40 ad-hoc id templates around `Date.now()`, several with
 * NO random salt (`commit_${Date.now()}`, `project_${Date.now()}`,
 * `frame_${sceneId}_${Date.now()}_sb`) — two creations in the same
 * millisecond collide, and batch inserts made that real (the insert_frame
 * collision shipped a film with a duplicated shot before it was salted).
 *
 * mintId keeps the sortable timestamp (ids double as rough creation order all
 * over the UI) and appends a UUID-derived salt that makes collisions
 * practically impossible, same-ms or not.
 */

import { randomUUID } from 'crypto';

/** `prefix_<ms>_<8-hex-salt>` — e.g. `scene_1784790000000_a1b2c3d4`. */
export function mintId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/** Unique filename-safe suffix for generated media files (same collision class). */
export function mintFileSuffix(): string {
  return `${Date.now()}_${randomUUID().slice(0, 8)}`;
}

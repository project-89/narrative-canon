/**
 * Atomic JSON persistence (T0-SAFETY).
 *
 * The studio's worlds are single JSON blobs (some >50MB). A plain
 * fs.writeFileSync can be interrupted mid-write (crash, SIGKILL, disk full),
 * leaving a truncated file and destroying the previous good copy in the same
 * moment. Every JSON write goes through here instead:
 *
 *   1. serialize → write to `<file>.tmp-<pid>` in the SAME directory
 *   2. refresh `<file>.bak` from the current good copy (throttled)
 *   3. fs.renameSync(tmp, file)  — atomic on POSIX within one filesystem
 *
 * A PROCESS crash at any step leaves either the old file intact or the new
 * file complete — never a torn write. The tmp fd is fsync'd before the
 * rename, which also covers most power-loss windows (the directory entry is
 * not separately fsync'd, so a hard power cut can in rare cases surface the
 * old file — never a torn one). `.bak` additionally survives logical
 * corruption (a bug writing valid-but-wrong JSON) up to the throttle window.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Refresh a file's .bak at most this often (per path). */
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

const lastBackupAt = new Map<string, number>();

export interface AtomicWriteOptions {
  /** Pretty-print indent passed to JSON.stringify (default 2, matching prior writes). */
  indent?: number;
  /** Skip the .bak refresh entirely (for scratch files). */
  backup?: boolean;
}

/**
 * Atomically write `data` as JSON to `filePath`. Throws on serialization or
 * IO failure (after cleaning up the temp file) — callers keep their existing
 * try/catch behavior.
 */
export function atomicWriteJsonSync(filePath: string, data: unknown, options: AtomicWriteOptions = {}): void {
  const { indent = 2, backup = true } = options;
  const json = JSON.stringify(data, null, indent);
  writeRawAtomicSync(filePath, json, backup);
}

/** Atomic write for pre-serialized content (same tmp+rename+bak discipline). */
export function writeRawAtomicSync(filePath: string, content: string | Buffer, backup: boolean = true): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Unique-enough temp name: pid guards cross-process, counter guards re-entry.
  const tmpPath = `${filePath}.tmp-${process.pid}-${nextTmpSeq++}`;

  try {
    // fd-based write so the data can be fsync'd before the rename publishes it.
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeFileSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    if (backup) refreshBackup(filePath);

    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Never leave temp litter behind on failure.
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}

let nextTmpSeq = 1;

/** Test hook: clear the per-path backup throttle state. */
export function resetBackupThrottleForTests(): void {
  lastBackupAt.clear();
}

function refreshBackup(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return; // nothing to back up yet
    const now = Date.now();
    const last = lastBackupAt.get(filePath) || 0;
    if (now - last < BACKUP_INTERVAL_MS) return;
    fs.copyFileSync(filePath, `${filePath}.bak`);
    lastBackupAt.set(filePath, now);
  } catch (err) {
    // A failed backup must never block the primary write.
    console.error(`atomic-write: .bak refresh failed for ${filePath}:`, err);
  }
}

/**
 * Serialize async storage writes per key (T0-SAFETY): fire-and-forget adapter
 * saves could land out of order (older payload overwriting newer in Mongo or
 * the adapter's own file write). Chaining per key guarantees write order
 * without blocking callers. Errors are contained per link so one failure
 * doesn't poison the chain.
 */
const writeChains = new Map<string, Promise<void>>();

export function enqueueSerializedWrite(key: string, write: () => Promise<void>, onError?: (err: unknown) => void): Promise<void> {
  const prev = writeChains.get(key) || Promise.resolve();
  const next = prev
    .then(write)
    .catch(err => {
      if (onError) onError(err);
      else console.error(`serialized write failed for ${key}:`, err);
    });
  writeChains.set(key, next);
  // Prevent unbounded map growth for one-off keys: clear when the chain drains.
  next.finally(() => {
    if (writeChains.get(key) === next) writeChains.delete(key);
  });
  return next;
}

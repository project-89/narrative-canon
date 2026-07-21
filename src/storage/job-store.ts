/**
 * Durable job store (T0-SAFETY).
 *
 * The server ran five async-job registries as plain in-memory Maps
 * (extraction, video, production, export, dream-film). Every tsx-watch
 * reload or crash vaporized them: pollers 404'd, "running" jobs became
 * ghosts, and one lore import died exactly this way with no trace.
 *
 * JobStore is a drop-in Map replacement (it EXTENDS Map, so every call site
 * keeps working) that:
 *   - persists to `<dir>/<name>.json` atomically on set/delete (debounced),
 *     plus a periodic sweep that catches in-place mutations
 *     (`job.progress = …` without a re-set — the dominant pattern here);
 *   - reloads on boot;
 *   - marks jobs that were mid-flight at shutdown with the store's FAILURE
 *     value + an "interrupted" message, using each job type's EXISTING error
 *     vocabulary so pollers/UI render them without new states.
 *
 * Jobs are metadata (ids, statuses, urls) — small next to the world blobs —
 * so whole-file persistence per store is fine at this scale.
 */

import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteJsonSync } from './atomic-write';

export interface JobStoreConfig<T> {
  /** Directory for the store files (created if missing). */
  dir: string;
  /** Field that carries job state (default 'status'; dream-film uses 'stage'). */
  statusField?: keyof T & string;
  /** States that mean the job is finished (anything else at boot = interrupted). */
  terminalStates: string[];
  /** The store's existing failure value to stamp on interrupted jobs (e.g. 'error', 'failed'). */
  failureState: string;
  /** Field for the human-readable error message (default 'error'). */
  errorField?: keyof T & string;
}

const FLUSH_DEBOUNCE_MS = 250;
const SWEEP_INTERVAL_MS = 5_000;

const allStores: JobStore<any>[] = [];
let sweepTimer: NodeJS.Timeout | null = null;
let exitHooked = false;

export class JobStore<T extends Record<string, any>> extends Map<string, T> {
  private file: string;
  private cfg: Required<Pick<JobStoreConfig<T>, 'statusField' | 'errorField'>> & JobStoreConfig<T>;
  private flushTimer: NodeJS.Timeout | null = null;
  private lastWritten = '';

  constructor(name: string, cfg: JobStoreConfig<T>) {
    super();
    this.cfg = { statusField: 'status' as keyof T & string, errorField: 'error' as keyof T & string, ...cfg };
    this.file = path.join(cfg.dir, `${name}.json`);
    this.loadFromDisk();
    allStores.push(this);
    ensureSweeper();
  }

  override set(key: string, value: T): this {
    super.set(key, value);
    this.scheduleFlush();
    return this;
  }

  override delete(key: string): boolean {
    const existed = super.delete(key);
    if (existed) this.scheduleFlush();
    return existed;
  }

  /** Persist now if contents changed since the last write. */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      const serialized = JSON.stringify(Object.fromEntries(this), null, 2);
      if (serialized === this.lastWritten) return;
      // Pre-serialized to compare; re-parse cost avoided by raw write.
      atomicWriteJsonSync(this.file, JSON.parse(serialized));
      this.lastWritten = serialized;
    } catch (err) {
      console.error(`JobStore(${path.basename(this.file)}): flush failed:`, err);
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
    // Don't hold the process open for a pending debounce.
    this.flushTimer.unref?.();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.file)) return;
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Record<string, T>;
      let interrupted = 0;
      for (const [id, job] of Object.entries(parsed)) {
        const state = String(job[this.cfg.statusField] ?? '');
        if (!this.cfg.terminalStates.includes(state)) {
          (job as any)[this.cfg.statusField] = this.cfg.failureState;
          (job as any)[this.cfg.errorField] = (job as any)[this.cfg.errorField]
            || 'Interrupted by server restart';
          (job as any).interruptedAt = Date.now();
          interrupted++;
        }
        super.set(id, job);
      }
      if (interrupted > 0) {
        console.log(`🧷 JobStore(${path.basename(this.file)}): recovered ${this.size} job(s), marked ${interrupted} interrupted`);
      }
      // Persist the interruption marks immediately so a second restart agrees.
      if (interrupted > 0) this.flush();
    } catch (err) {
      console.error(`JobStore(${path.basename(this.file)}): load failed (starting empty):`, err);
    }
  }
}

/** Sweep all stores periodically — catches in-place `job.x = y` mutations. */
function ensureSweeper(): void {
  if (!sweepTimer) {
    sweepTimer = setInterval(() => {
      for (const store of allStores) store.flush();
    }, SWEEP_INTERVAL_MS);
    sweepTimer.unref?.();
  }
  if (!exitHooked) {
    exitHooked = true;
    const flushAll = () => {
      for (const store of allStores) store.flush();
    };
    process.on('beforeExit', flushAll);
    // Flush-only: server.ts owns graceful shutdown (its own SIGINT/SIGTERM
    // handlers call closeStorage and exit). Calling process.exit here would
    // preempt them.
    process.on('SIGINT', flushAll);
    process.on('SIGTERM', flushAll);
  }
}

export function createJobStore<T extends Record<string, any>>(name: string, cfg: JobStoreConfig<T>): JobStore<T> {
  return new JobStore<T>(name, cfg);
}

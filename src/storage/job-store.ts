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
import { writeRawAtomicSync } from './atomic-write';

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
  /** Evict TERMINAL jobs older than this (default 7 days). Non-terminal jobs are never evicted. */
  terminalTtlMs?: number;
  /** Keep at most this many terminal jobs (newest by updatedAt/startedAt; default 100). */
  maxTerminalJobs?: number;
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
      this.evictTerminal();
      const serialized = JSON.stringify(Object.fromEntries(this), null, 2);
      if (serialized === this.lastWritten) return;
      // One serialization: the compare string IS the write payload.
      writeRawAtomicSync(this.file, serialized);
      this.lastWritten = serialized;
    } catch (err) {
      console.error(`JobStore(${path.basename(this.file)}): flush failed:`, err);
    }
  }

  /**
   * Nothing ever deleted jobs before this store existed (the old Maps
   * self-cleared on restart) — without eviction the files and boot memory
   * grow forever, and every sweep rewrites all history. Terminal jobs age
   * out by TTL and count; in-flight jobs are never touched.
   */
  private evictTerminal(): void {
    const ttl = this.cfg.terminalTtlMs ?? 7 * 24 * 60 * 60 * 1000;
    const cap = this.cfg.maxTerminalJobs ?? 100;
    const now = Date.now();
    const terminal: Array<{ id: string; ts: number }> = [];
    for (const [id, job] of this) {
      const state = String(job[this.cfg.statusField] ?? '');
      if (!this.cfg.terminalStates.includes(state)) continue;
      const ts = Number(job.updatedAt || job.completedAt || job.startedAt || 0);
      if (ts && now - ts > ttl) {
        super.delete(id);
        continue;
      }
      terminal.push({ id, ts });
    }
    if (terminal.length > cap) {
      terminal.sort((a, b) => b.ts - a.ts); // newest first
      for (const { id } of terminal.slice(cap)) super.delete(id);
    }
  }

  /** Unregister from the sweeper and drop pending timers (tests/teardown). */
  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const i = allStores.indexOf(this);
    if (i >= 0) allStores.splice(i, 1);
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
          const now = Date.now();
          (job as any)[this.cfg.statusField] = this.cfg.failureState;
          (job as any)[this.cfg.errorField] = (job as any)[this.cfg.errorField]
            || 'Interrupted by server restart';
          (job as any).interruptedAt = now;
          // Terminal timing must be stable: pollers derive duration from
          // completedAt and fall back to a live Date.now() clock without it.
          if (!(job as any).completedAt) (job as any).completedAt = now;
          (job as any).updatedAt = now;
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

/**
 * Flush every registered store NOW. Call after a job crosses into a terminal
 * state (done/error/completed/failed): in-place mutations are otherwise only
 * caught by the 5s sweep, and a crash inside that window would resurrect a
 * finished job as "interrupted" with its result payload lost.
 */
export function flushAllJobStores(): void {
  for (const store of allStores) store.flush();
}

/**
 * T0-SAFETY unit tests: atomic writes, serialized write chains, durable
 * job stores, and id minting.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  atomicWriteJsonSync,
  enqueueSerializedWrite,
  resetBackupThrottleForTests,
  waitForSerializedWrites,
} from '../../src/storage/atomic-write';
import { createJobStore, JobStore } from '../../src/storage/job-store';
import { FileStorageAdapter } from '../../src/storage/file-adapter';
import { mintId, mintFileSuffix } from '../../src/utils/ids';

describe('atomicWriteJsonSync', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 't0-atomic-'));
    resetBackupThrottleForTests();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes readable JSON and leaves no temp litter', () => {
    const file = path.join(dir, 'data.json');
    atomicWriteJsonSync(file, { a: 1 });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ a: 1 });
    expect(fs.readdirSync(dir).filter(f => f.includes('.tmp-'))).toHaveLength(0);
  });

  it('creates a .bak of the previous good copy on rewrite', () => {
    const file = path.join(dir, 'data.json');
    atomicWriteJsonSync(file, { version: 1 });
    atomicWriteJsonSync(file, { version: 2 });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ version: 2 });
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf-8'))).toEqual({ version: 1 });
  });

  it('throttles .bak refresh: rapid writes keep the earliest protected copy', () => {
    const file = path.join(dir, 'data.json');
    atomicWriteJsonSync(file, { version: 1 });
    atomicWriteJsonSync(file, { version: 2 }); // creates .bak from v1
    atomicWriteJsonSync(file, { version: 3 }); // within throttle window: .bak stays v1
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ version: 3 });
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf-8'))).toEqual({ version: 1 });
  });

  it('keeps the old file intact when serialization fails', () => {
    const file = path.join(dir, 'data.json');
    atomicWriteJsonSync(file, { good: true });
    const circular: any = {};
    circular.self = circular;
    expect(() => atomicWriteJsonSync(file, circular)).toThrow();
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ good: true });
    expect(fs.readdirSync(dir).filter(f => f.includes('.tmp-'))).toHaveLength(0);
  });
});

describe('enqueueSerializedWrite', () => {
  it('executes writes for one key strictly in order', async () => {
    const order: number[] = [];
    const slow = () => new Promise<void>(r => setTimeout(() => { order.push(1); r(); }, 30));
    const fast = () => new Promise<void>(r => setTimeout(() => { order.push(2); r(); }, 1));
    const p1 = enqueueSerializedWrite('k', slow);
    const p2 = enqueueSerializedWrite('k', fast);
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it('continues the chain after a failed link', async () => {
    const seen: string[] = [];
    const errors: unknown[] = [];
    await enqueueSerializedWrite('k2', () => Promise.reject(new Error('boom')), e => errors.push(e));
    await enqueueSerializedWrite('k2', async () => { seen.push('after'); });
    expect(errors).toHaveLength(1);
    expect(seen).toEqual(['after']);
  });

  it('waits through a chain extension that arrives while draining', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    enqueueSerializedWrite('drain', () => new Promise<void>(resolve => {
      releaseFirst = () => { order.push('first'); resolve(); };
    }));

    const drained = waitForSerializedWrites('drain');
    enqueueSerializedWrite('drain', async () => { order.push('second'); });
    await Promise.resolve();
    releaseFirst();
    await drained;

    expect(order).toEqual(['first', 'second']);
  });
});

describe('JobStore', () => {
  let dir: string;
  const stores: JobStore<any>[] = [];
  const track = <T extends Record<string, any>>(s: JobStore<T>): JobStore<T> => {
    stores.push(s);
    return s;
  };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 't0-jobs-'));
  });
  afterEach(() => {
    // Unregister from the module sweeper before the dir vanishes, or the 5s
    // sweep recreates deleted temp dirs forever.
    for (const s of stores.splice(0)) s.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  type FakeJob = { id: string; status: string; error?: string; startedAt?: number; updatedAt?: number; completedAt?: number };

  it('persists set jobs and reloads them', async () => {
    const store = track(createJobStore<FakeJob>('fake', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    }));
    store.set('j1', { id: 'j1', status: 'done' });
    store.flush();
    const reloaded = track(createJobStore<FakeJob>('fake', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    }));
    expect(reloaded.get('j1')).toEqual({ id: 'j1', status: 'done' });
  });

  it('marks non-terminal jobs interrupted on reload, using the configured fields', () => {
    const store = track(createJobStore<FakeJob>('fake2', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    }));
    store.set('running', { id: 'running', status: 'pending' });
    store.set('finished', { id: 'finished', status: 'done' });
    store.flush();
    const reloaded = track(createJobStore<FakeJob>('fake2', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    }));
    expect(reloaded.get('running')!.status).toBe('error');
    expect(reloaded.get('running')!.error).toBe('Interrupted by server restart');
    expect(reloaded.get('finished')!.status).toBe('done');
    expect(reloaded.get('finished')!.error).toBeUndefined();
  });

  it('supports a custom status field (dream-film uses stage)', () => {
    type StagedJob = { id: string; stage: string; error?: string };
    const store = track(createJobStore<StagedJob>('staged', {
      dir, statusField: 'stage', terminalStates: ['done', 'error'], failureState: 'error',
    }));
    store.set('mid', { id: 'mid', stage: 'produce' });
    store.flush();
    const reloaded = track(createJobStore<StagedJob>('staged', {
      dir, statusField: 'stage', terminalStates: ['done', 'error'], failureState: 'error',
    }));
    expect(reloaded.get('mid')!.stage).toBe('error');
    expect(reloaded.get('mid')!.error).toBe('Interrupted by server restart');
  });

  it('stamps interrupted jobs with completedAt/updatedAt so duration is stable', () => {
    const store = track(createJobStore<FakeJob>('fake4', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    }));
    store.set('r', { id: 'r', status: 'pending', startedAt: 100 });
    store.flush();
    const reloaded = track(createJobStore<FakeJob>('fake4', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    }));
    const j = reloaded.get('r')!;
    expect(j.completedAt).toBeGreaterThan(0);
    expect(j.updatedAt).toBe(j.completedAt);
  });

  it('evicts old terminal jobs by TTL and caps the rest; never evicts in-flight jobs', () => {
    const store = track(createJobStore<FakeJob>('fake5', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
      terminalTtlMs: 1000, maxTerminalJobs: 2,
    }));
    const now = Date.now();
    store.set('ancient', { id: 'ancient', status: 'done', updatedAt: now - 10_000 }); // past TTL
    store.set('old1', { id: 'old1', status: 'done', updatedAt: now - 300 });
    store.set('old2', { id: 'old2', status: 'done', updatedAt: now - 200 });
    store.set('new1', { id: 'new1', status: 'done', updatedAt: now - 100 });
    store.set('inflight', { id: 'inflight', status: 'pending', updatedAt: now - 50_000 });
    store.flush();
    expect(store.has('ancient')).toBe(false); // TTL
    expect(store.has('old1')).toBe(false);    // over cap (oldest terminal)
    expect(store.has('old2')).toBe(true);
    expect(store.has('new1')).toBe(true);
    expect(store.has('inflight')).toBe(true); // in-flight is sacred
  });

  it('flush() persists in-place mutations (the job.x = y pattern)', () => {
    const store = track(createJobStore<FakeJob>('fake3', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    }));
    store.set('j', { id: 'j', status: 'pending' });
    store.flush();
    store.get('j')!.status = 'done'; // in-place, no re-set
    store.flush();
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'fake3.json'), 'utf-8'));
    expect(onDisk.j.status).toBe('done');
  });
});

describe('FileStorageAdapter.loadProjectData (whitelist regression guard)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 't0-adapter-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips every top-level field, known and unknown', async () => {
    const onDisk = {
      entities: [{ id: 'e1' }],
      relationships: [],
      commits: [],
      branches: [{ name: 'main' }],
      interactions: [{ id: 's1', title: 'Scene' }],
      documents: [],
      // The fields the old whitelist silently DROPPED:
      acts: [{ id: 'a1', title: 'Act I' }],
      timeline: { tracks: [{ id: 't1' }], items: [] },
      script: { logline: 'A story.' },
      assets: [{ id: 'as1' }],
      artifacts: [{ id: 'ar1' }],
      generatedImages: [{ id: 'g1' }],
      // A field that does not exist anywhere yet — future-proofing:
      someFutureField: { must: 'survive' },
    };
    fs.writeFileSync(path.join(dir, 'project_p1.json'), JSON.stringify(onDisk));
    const adapter = new FileStorageAdapter(dir);
    const loaded: any = await adapter.loadProjectData('p1');
    expect(loaded.acts).toEqual(onDisk.acts);
    expect(loaded.timeline).toEqual(onDisk.timeline);
    expect(loaded.script).toEqual(onDisk.script);
    expect(loaded.assets).toEqual(onDisk.assets);
    expect(loaded.artifacts).toEqual(onDisk.artifacts);
    expect(loaded.generatedImages).toEqual(onDisk.generatedImages);
    expect(loaded.someFutureField).toEqual({ must: 'survive' });
    expect(loaded.entities).toEqual(onDisk.entities);
  });
});

describe('mintId / mintFileSuffix', () => {
  it('never collides across a burst of same-millisecond mints', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(mintId('x'));
    expect(ids.size).toBe(5000);
  });

  it('keeps the sortable prefix_timestamp shape', () => {
    expect(mintId('scene')).toMatch(/^scene_\d{13}_[0-9a-f-]{8}$/);
    expect(mintFileSuffix()).toMatch(/^\d{13}_[0-9a-f-]{8}$/);
  });
});

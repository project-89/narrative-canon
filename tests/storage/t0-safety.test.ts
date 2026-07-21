/**
 * T0-SAFETY unit tests: atomic writes, serialized write chains, durable
 * job stores, and id minting.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicWriteJsonSync, enqueueSerializedWrite } from '../../src/storage/atomic-write';
import { createJobStore } from '../../src/storage/job-store';
import { mintId, mintFileSuffix } from '../../src/utils/ids';

describe('atomicWriteJsonSync', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 't0-atomic-'));
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
});

describe('JobStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 't0-jobs-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  type FakeJob = { id: string; status: string; error?: string };

  it('persists set jobs and reloads them', async () => {
    const store = createJobStore<FakeJob>('fake', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    });
    store.set('j1', { id: 'j1', status: 'done' });
    store.flush();
    const reloaded = createJobStore<FakeJob>('fake', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    });
    expect(reloaded.get('j1')).toEqual({ id: 'j1', status: 'done' });
  });

  it('marks non-terminal jobs interrupted on reload, using the configured fields', () => {
    const store = createJobStore<FakeJob>('fake2', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    });
    store.set('running', { id: 'running', status: 'pending' });
    store.set('finished', { id: 'finished', status: 'done' });
    store.flush();
    const reloaded = createJobStore<FakeJob>('fake2', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    });
    expect(reloaded.get('running')!.status).toBe('error');
    expect(reloaded.get('running')!.error).toBe('Interrupted by server restart');
    expect(reloaded.get('finished')!.status).toBe('done');
    expect(reloaded.get('finished')!.error).toBeUndefined();
  });

  it('supports a custom status field (dream-film uses stage)', () => {
    type StagedJob = { id: string; stage: string; error?: string };
    const store = createJobStore<StagedJob>('staged', {
      dir, statusField: 'stage', terminalStates: ['done', 'error'], failureState: 'error',
    });
    store.set('mid', { id: 'mid', stage: 'produce' });
    store.flush();
    const reloaded = createJobStore<StagedJob>('staged', {
      dir, statusField: 'stage', terminalStates: ['done', 'error'], failureState: 'error',
    });
    expect(reloaded.get('mid')!.stage).toBe('error');
    expect(reloaded.get('mid')!.error).toBe('Interrupted by server restart');
  });

  it('flush() persists in-place mutations (the job.x = y pattern)', () => {
    const store = createJobStore<FakeJob>('fake3', {
      dir, terminalStates: ['done', 'error'], failureState: 'error',
    });
    store.set('j', { id: 'j', status: 'pending' });
    store.flush();
    store.get('j')!.status = 'done'; // in-place, no re-set
    store.flush();
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'fake3.json'), 'utf-8'));
    expect(onDisk.j.status).toBe('done');
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

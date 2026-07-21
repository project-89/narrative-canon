/**
 * T0b-COMMIT — the diff-deriver (TRANSMEDIA_INTEGRATION_REVIEW §9.1).
 *
 * Ops are DERIVED, never emitted: at the commit boundary the system snapshots
 * the canon-graph subset (a v1 Narrative) and computes typed GraphOperations
 * by structurally diffing against the parent snapshot. The blob stays
 * authoritative; ops are a pure function of committed snapshots, so they can
 * never diverge from it.
 *
 * CONTRACT (enforced by the round-trip test in CI):
 *   workingTreeHash(applyOperations(prev, deriveOperations(prev, next)))
 *     === workingTreeHash(next)
 *
 * Change DETECTION is canonical-only: fields the hash ignores
 * (extensions.studio at any depth, cachedUri) never trigger an op — the op
 * stream speaks only for canon-visible change. Op PAYLOADS carry the full v1
 * objects as-is.
 */

import {
  Narrative,
  GraphOperation,
  Entity,
  Relationship,
  Scene,
  Frame,
  ScratchpadDocument,
} from './schemas';
import { canonicalize, workingTreeHash } from './canonicalize';

/**
 * NORMALIZED ORDER — array order is significant to workingTreeHash, but the
 * studio's arrays carry no meaning in entity/relationship/doc order. The
 * deriver's contract is therefore over NORMALIZED narratives: entities,
 * relationships, and scratchpad docs sorted by id; scenes sorted by
 * (position, id); frames within each scene sorted by (position, id).
 * Both derive and apply normalize, and the server stores normalized
 * snapshots, so hashes line up end-to-end.
 */
export function normalizeNarrativeOrder(narrative: Narrative): Narrative {
  const n: Narrative = JSON.parse(JSON.stringify(narrative));
  n.entities = (n.entities || []).slice().sort((a, b) => a.id.localeCompare(b.id));
  n.relationships = (n.relationships || []).slice().sort((a, b) => a.id.localeCompare(b.id));
  n.scenes = (n.scenes || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
  for (const scene of n.scenes) {
    if (scene.frames) {
      scene.frames = scene.frames.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
    }
  }
  if (n.scratchpad?.documents) {
    n.scratchpad = { documents: n.scratchpad.documents.slice().sort((a, b) => a.id.localeCompare(b.id)) };
  }
  return n;
}

/**
 * TIMESTAMP STABILIZATION — the migrator defaults missing createdAt/updatedAt
 * to `now`, fresh on every call, so a studio object that never carried
 * timestamps would emit a phantom UPDATE op on every commit. For each object
 * in `next` whose prev twin is canonically identical EXCEPT timestamps, pin
 * the timestamps to prev's. Real content changes keep their new timestamps
 * (they ride the UPDATE anyway). Call BEFORE deriveOperations when `next`
 * came fresh out of the migrator.
 */
export function stabilizeTimestamps(prev: Narrative, nextRaw: Narrative): Narrative {
  const next: Narrative = JSON.parse(JSON.stringify(nextRaw));
  const TS = ['createdAt', 'updatedAt'];
  const stripTs = (o: any) => {
    const c = { ...o };
    for (const k of TS) delete c[k];
    return c;
  };
  const pin = (prevItems: any[] | undefined, nextItems: any[] | undefined) => {
    const prevById = byId(prevItems as any[] | undefined);
    for (const item of nextItems || []) {
      const before: any = prevById.get(item.id);
      if (!before) continue;
      if (canonEqual(stripTs(before), stripTs(item))) {
        for (const k of TS) {
          if (before[k] !== undefined) item[k] = before[k];
          else delete item[k];
        }
      }
    }
  };
  pin(prev.entities, next.entities);
  pin(prev.relationships, next.relationships);
  pin(prev.scratchpad?.documents, next.scratchpad?.documents);
  // Scenes: pin scene-level timestamps when everything EXCEPT frames+ts
  // matches, and pin frames independently (frames carry no timestamps in v1,
  // but keep the walk future-proof).
  const prevScenes = byId(prev.scenes as any[]);
  for (const scene of next.scenes || []) {
    const before: any = prevScenes.get(scene.id);
    if (!before) continue;
    const stripFramesTs = (s: any) => {
      const c = stripTs(s);
      delete c.frames;
      return c;
    };
    if (canonEqual(stripFramesTs(before), stripFramesTs(scene))) {
      for (const k of TS) {
        if (before[k] !== undefined) (scene as any)[k] = before[k];
        else delete (scene as any)[k];
      }
    }
    pin(before.frames, scene.frames);
  }
  return next;
}

/** Canonical string for change detection — hash-invisible fields excluded. */
function canon(value: unknown): string {
  if (value === undefined) return '__undefined__';
  return canonicalize(value);
}

function canonEqual(a: unknown, b: unknown): boolean {
  return canon(a) === canon(b);
}

function byId<T extends { id: string }>(items: readonly T[] | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of items || []) m.set(item.id, item);
  return m;
}

/** Shallow changed-field set between two records (canonical compare per key).
 *  Keys present on prev but absent on next are INCLUDED (as undefined) only
 *  when `undefined` survives JSON — it does not — so removals of optional
 *  fields are handled by whole-replace semantics at the caller when needed. */
function shallowChanges<T extends Record<string, any>>(prev: T, next: T, skipKeys: ReadonlyArray<string> = []): Partial<T> | null {
  const changes: Record<string, any> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (skipKeys.includes(key)) continue;
    // Compare WRAPPED under the key: canonicalize's runtime-field stripping
    // is parent-key-aware (extensions.studio only strips when the value sits
    // under an `extensions` key), so bare-value comparison would see
    // hash-invisible noise as change.
    if (!canonEqual({ [key]: prev[key] }, { [key]: next[key] })) {
      // JSON round-trips drop undefined: a field DELETED on next cannot ride
      // a partial update. Signal the caller to whole-replace instead.
      if (next[key] === undefined) return null;
      changes[key] = next[key];
    }
  }
  return Object.keys(changes).length > 0 ? (changes as Partial<T>) : ({} as Partial<T>);
}

function orderedIds(scenes: readonly Scene[] | undefined): string[] {
  return (scenes || [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id))
    .map(s => s.id);
}

/**
 * Derive the typed operation stream that transforms `prev` into `next`
 * (canonically). Deterministic: stable op ordering (removes → adds → updates
 * → frame ops → reorder → style → scratchpad).
 */
export function deriveOperations(prevRaw: Narrative, nextRaw: Narrative): GraphOperation[] {
  const prev = normalizeNarrativeOrder(prevRaw);
  const next = normalizeNarrativeOrder(nextRaw);
  const ops: GraphOperation[] = [];

  // ---- Entities -----------------------------------------------------------
  const prevEntities = byId<Entity>(prev.entities);
  const nextEntities = byId<Entity>(next.entities);
  for (const [id] of prevEntities) {
    if (!nextEntities.has(id)) ops.push({ type: 'REMOVE_ENTITY', payload: { entityId: id } });
  }
  for (const [id, entity] of nextEntities) {
    const before = prevEntities.get(id);
    if (!before) {
      ops.push({ type: 'ADD_ENTITY', payload: entity });
    } else if (!canonEqual(before, entity)) {
      const changes = shallowChanges(before, entity);
      if (changes === null) {
        // A field was deleted — partials can't express that; replace whole.
        ops.push({ type: 'REMOVE_ENTITY', payload: { entityId: id, reason: 'replaced (field removal)' } });
        ops.push({ type: 'ADD_ENTITY', payload: entity });
      } else {
        ops.push({ type: 'UPDATE_ENTITY', payload: { entityId: id, changes } });
      }
    }
  }

  // ---- Relationships ------------------------------------------------------
  const prevRels = byId<Relationship>(prev.relationships);
  const nextRels = byId<Relationship>(next.relationships);
  for (const [id] of prevRels) {
    if (!nextRels.has(id)) ops.push({ type: 'REMOVE_RELATIONSHIP', payload: { relationshipId: id } });
  }
  for (const [id, rel] of nextRels) {
    const before = prevRels.get(id);
    if (!before) {
      ops.push({ type: 'ADD_RELATIONSHIP', payload: rel });
    } else if (!canonEqual(before, rel)) {
      const changes = shallowChanges(before, rel);
      if (changes === null) {
        ops.push({ type: 'REMOVE_RELATIONSHIP', payload: { relationshipId: id, reason: 'replaced (field removal)' } });
        ops.push({ type: 'ADD_RELATIONSHIP', payload: rel });
      } else {
        ops.push({ type: 'UPDATE_RELATIONSHIP', payload: { relationshipId: id, changes } });
      }
    }
  }

  // ---- Scenes (frame-level granularity) -----------------------------------
  const prevScenes = byId<Scene>(prev.scenes);
  const nextScenes = byId<Scene>(next.scenes);
  for (const [id] of prevScenes) {
    if (!nextScenes.has(id)) ops.push({ type: 'REMOVE_SCENE', payload: { sceneId: id } });
  }
  for (const [id, scene] of nextScenes) {
    const before = prevScenes.get(id);
    if (!before) {
      ops.push({ type: 'ADD_SCENE', payload: scene });
      continue;
    }
    if (canonEqual(before, scene)) continue;

    // Scene-level scalar changes (frames diffed separately; position rides
    // REORDER_SCENES when the overall order changed, but a lone position
    // change with unchanged order still needs the field — keep it in changes).
    const changes = shallowChanges(before, scene, ['frames']);
    if (changes === null) {
      ops.push({ type: 'REMOVE_SCENE', payload: { sceneId: id, reason: 'replaced (field removal)' } });
      ops.push({ type: 'ADD_SCENE', payload: scene });
      continue;
    }
    if (Object.keys(changes).length > 0) {
      ops.push({ type: 'UPDATE_SCENE', payload: { sceneId: id, changes } });
    }

    // Frames within the surviving scene.
    const prevFrames = byId<Frame>(before.frames);
    const nextFrames = byId<Frame>(scene.frames);
    for (const [frameId] of prevFrames) {
      if (!nextFrames.has(frameId)) ops.push({ type: 'REMOVE_FRAME', payload: { sceneId: id, frameId } });
    }
    let framePosition = 0;
    for (const frame of scene.frames || []) {
      const beforeFrame = prevFrames.get(frame.id);
      if (!beforeFrame) {
        ops.push({ type: 'ADD_FRAME', payload: { sceneId: id, frame, position: framePosition } });
      } else if (!canonEqual(beforeFrame, frame)) {
        const frameChanges = shallowChanges(beforeFrame, frame);
        if (frameChanges === null) {
          ops.push({ type: 'REMOVE_FRAME', payload: { sceneId: id, frameId: frame.id } });
          ops.push({ type: 'ADD_FRAME', payload: { sceneId: id, frame, position: framePosition } });
        } else {
          ops.push({ type: 'UPDATE_FRAME', payload: { sceneId: id, frameId: frame.id, changes: frameChanges } });
        }
      }
      framePosition++;
    }
  }

  // ---- Scene order --------------------------------------------------------
  const prevOrder = orderedIds(prev.scenes).filter(id => nextScenes.has(id));
  const nextOrder = orderedIds(next.scenes);
  const survivingNextOrder = nextOrder.filter(id => prevScenes.has(id));
  if (prevOrder.join(' ') !== survivingNextOrder.join(' ')) {
    ops.push({ type: 'REORDER_SCENES', payload: { orderedSceneIds: nextOrder } });
  }

  // ---- Style profile ------------------------------------------------------
  if (!canonEqual(prev.styleProfile, next.styleProfile)) {
    // No REMOVE op exists — removal is SET to empty profile.
    ops.push({ type: 'SET_STYLE_PROFILE', payload: next.styleProfile || {} });
  }

  // ---- Scratchpad ---------------------------------------------------------
  const prevDocs = byId<ScratchpadDocument>(prev.scratchpad?.documents);
  const nextDocs = byId<ScratchpadDocument>(next.scratchpad?.documents);
  for (const [id] of prevDocs) {
    if (!nextDocs.has(id)) ops.push({ type: 'REMOVE_SCRATCHPAD', payload: { documentId: id } });
  }
  for (const [id, doc] of nextDocs) {
    const before = prevDocs.get(id);
    if (!before || !canonEqual(before, doc)) {
      ops.push({ type: 'WRITE_SCRATCHPAD', payload: doc }); // add-or-update
    }
  }

  return ops;
}

/**
 * Apply a derived op stream to a base narrative, producing the successor.
 * Pure — the base is never mutated. Used by the round-trip gate and, later,
 * by replay/materialization. Throws on ops that reference missing targets
 * (a derived stream never does; a hand-written one might).
 */
export function applyOperations(base: Narrative, ops: readonly GraphOperation[]): Narrative {
  const next: Narrative = normalizeNarrativeOrder(base);
  next.entities = next.entities || [];
  next.relationships = next.relationships || [];
  next.scenes = next.scenes || [];

  const findScene = (sceneId: string): Scene => {
    const scene = next.scenes.find(s => s.id === sceneId);
    if (!scene) throw new Error(`applyOperations: scene not found: ${sceneId}`);
    return scene;
  };

  const touchedFrameScenes = new Set<string>();
  for (const op of ops) {
    switch (op.type) {
      case 'ADD_ENTITY':
        next.entities = next.entities.filter(e => e.id !== op.payload.id);
        next.entities.push(JSON.parse(JSON.stringify(op.payload)));
        break;
      case 'UPDATE_ENTITY': {
        const idx = next.entities.findIndex(e => e.id === op.payload.entityId);
        if (idx < 0) throw new Error(`applyOperations: entity not found: ${op.payload.entityId}`);
        next.entities[idx] = { ...next.entities[idx], ...JSON.parse(JSON.stringify(op.payload.changes)) };
        break;
      }
      case 'REMOVE_ENTITY':
        next.entities = next.entities.filter(e => e.id !== op.payload.entityId);
        break;
      case 'ADD_RELATIONSHIP':
        next.relationships = next.relationships.filter(r => r.id !== op.payload.id);
        next.relationships.push(JSON.parse(JSON.stringify(op.payload)));
        break;
      case 'UPDATE_RELATIONSHIP': {
        const idx = next.relationships.findIndex(r => r.id === op.payload.relationshipId);
        if (idx < 0) throw new Error(`applyOperations: relationship not found: ${op.payload.relationshipId}`);
        next.relationships[idx] = { ...next.relationships[idx], ...JSON.parse(JSON.stringify(op.payload.changes)) };
        break;
      }
      case 'REMOVE_RELATIONSHIP':
        next.relationships = next.relationships.filter(r => r.id !== op.payload.relationshipId);
        break;
      case 'ADD_SCENE':
        next.scenes = next.scenes.filter(s => s.id !== op.payload.id);
        next.scenes.push(JSON.parse(JSON.stringify(op.payload)));
        break;
      case 'UPDATE_SCENE': {
        const idx = next.scenes.findIndex(s => s.id === op.payload.sceneId);
        if (idx < 0) throw new Error(`applyOperations: scene not found: ${op.payload.sceneId}`);
        next.scenes[idx] = { ...next.scenes[idx], ...JSON.parse(JSON.stringify(op.payload.changes)) };
        break;
      }
      case 'REMOVE_SCENE':
        next.scenes = next.scenes.filter(s => s.id !== op.payload.sceneId);
        break;
      case 'REORDER_SCENES': {
        const order = new Map(op.payload.orderedSceneIds.map((id, i) => [id, i]));
        for (const scene of next.scenes) {
          const pos = order.get(scene.id);
          if (pos !== undefined) scene.position = pos;
        }
        next.scenes.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
        break;
      }
      case 'ADD_FRAME': {
        const scene = findScene(op.payload.sceneId);
        touchedFrameScenes.add(op.payload.sceneId);
        scene.frames = (scene.frames || []).filter(f => f.id !== op.payload.frame.id);
        scene.frames.splice(Math.min(op.payload.position, scene.frames.length), 0, JSON.parse(JSON.stringify(op.payload.frame)));
        break;
      }
      case 'UPDATE_FRAME': {
        const scene = findScene(op.payload.sceneId);
        touchedFrameScenes.add(op.payload.sceneId);
        const idx = (scene.frames || []).findIndex(f => f.id === op.payload.frameId);
        if (idx < 0) throw new Error(`applyOperations: frame not found: ${op.payload.sceneId}/${op.payload.frameId}`);
        scene.frames![idx] = { ...scene.frames![idx], ...JSON.parse(JSON.stringify(op.payload.changes)) };
        break;
      }
      case 'REMOVE_FRAME': {
        const scene = findScene(op.payload.sceneId);
        scene.frames = (scene.frames || []).filter(f => f.id !== op.payload.frameId);
        break;
      }
      case 'SET_STYLE_PROFILE':
        next.styleProfile = Object.keys(op.payload).length > 0 ? JSON.parse(JSON.stringify(op.payload)) : undefined;
        break;
      case 'WRITE_SCRATCHPAD': {
        const docs = next.scratchpad?.documents || [];
        const filtered = docs.filter(d => d.id !== op.payload.id);
        filtered.push(JSON.parse(JSON.stringify(op.payload)));
        next.scratchpad = { documents: filtered };
        break;
      }
      case 'REMOVE_SCRATCHPAD': {
        const docs = (next.scratchpad?.documents || []).filter(d => d.id !== op.payload.documentId);
        next.scratchpad = docs.length > 0 ? { documents: docs } : undefined;
        break;
      }
    }
  }

  // Re-normalize the pieces ops may have disordered: frame position updates
  // and pushes must land in canonical (position, id) order.
  for (const sceneId of touchedFrameScenes) {
    const scene = next.scenes.find(s => s.id === sceneId);
    if (scene?.frames) {
      scene.frames = scene.frames.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
    }
  }
  return normalizeNarrativeOrder(next);
}

/** The round-trip check itself, exported so the server can assert it cheaply
 *  at commit time in dev (and the test suite always). */
export function roundTripPreservesHash(prev: Narrative, next: Narrative, ops: readonly GraphOperation[]): boolean {
  // METADATA CARVE-OUT: no op type exists for narrative metadata (title,
  // timestamps) — the deriver's domain is CONTENT. Metadata is pinned to
  // `next`'s on both sides so the comparison speaks only for what ops can
  // express. The server freezes snapshot metadata at genesis for the same
  // reason (deriveAndAppendNitCommit).
  const applied = { ...applyOperations(prev, ops), metadata: next.metadata };
  return workingTreeHash(applied) === workingTreeHash(normalizeNarrativeOrder(next));
}

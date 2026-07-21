/**
 * T0b diff-deriver round-trip gate (REVIEW §9.1).
 *
 * THE contract: workingTreeHash(apply(prev, derive(prev, next))) ===
 * workingTreeHash(next), and hash-invisible fields (extensions.studio,
 * cachedUri) never trigger ops. This suite is the hard CI gate the
 * architecture requires before any consumer (hooks, Canon rail, merge)
 * trusts the op stream.
 */

import { deriveOperations, applyOperations, roundTripPreservesHash, stabilizeTimestamps } from '../../src/git/format/v1/derive';
import { workingTreeHash } from '../../src/git/format/v1/canonicalize';
import { migrateStudioProjectToV1 } from '../../src/git/format/v1/migrate-from-studio';
import type { Narrative } from '../../src/git/format/v1/schemas';

const ISO = '2026-07-21T00:00:00.000Z';

function baseNarrative(): Narrative {
  return {
    formatVersion: '1.0.0',
    metadata: { id: 'n1', title: 'Test world', createdAt: ISO, updatedAt: ISO },
    entities: [
      { id: 'e1', name: 'Aria', type: 'character', description: 'Pattern-seer', traits: ['curious'], createdAt: ISO, updatedAt: ISO },
      { id: 'e2', name: 'The Loom', type: 'concept', createdAt: ISO, updatedAt: ISO },
    ],
    relationships: [
      { id: 'r1', sourceId: 'e1', targetId: 'e2', type: 'discovers', createdAt: ISO, updatedAt: ISO },
    ],
    scenes: [
      {
        id: 's1', position: 0, title: 'The first thread', participantIds: ['e1'], status: 'draft',
        frames: [
          { id: 'f1', position: 0, description: 'Aria at the terminal', dialogue: ['What is this?'] },
          { id: 'f2', position: 1, description: 'The glyph appears' },
        ],
        createdAt: ISO, updatedAt: ISO,
      },
      { id: 's2', position: 1, title: 'The answer', participantIds: ['e1', 'e2'], status: 'canon', createdAt: ISO, updatedAt: ISO },
    ],
    styleProfile: { visual: { presetId: 'cel-shaded' } },
    scratchpad: { documents: [{ id: 'd1', title: 'Lore', category: 'world_bible', content: 'The Loom weaves.', isPinned: true, createdAt: ISO, updatedAt: ISO }] },
  } as Narrative;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function assertRoundTrip(prev: Narrative, next: Narrative) {
  const ops = deriveOperations(prev, next);
  expect(roundTripPreservesHash(prev, next, ops)).toBe(true);
  return ops;
}

describe('deriveOperations round-trip', () => {
  it('identical narratives derive zero ops', () => {
    const ops = deriveOperations(baseNarrative(), baseNarrative());
    expect(ops).toHaveLength(0);
  });

  it('genesis from empty: everything appears as ADD_*/WRITE/SET ops', () => {
    const empty = { formatVersion: '1.0.0', metadata: baseNarrative().metadata, entities: [], relationships: [], scenes: [] } as Narrative;
    const ops = assertRoundTrip(empty, baseNarrative());
    const types = ops.map(o => o.type);
    expect(types).toContain('ADD_ENTITY');
    expect(types).toContain('ADD_RELATIONSHIP');
    expect(types).toContain('ADD_SCENE');
    expect(types).toContain('SET_STYLE_PROFILE');
    expect(types).toContain('WRITE_SCRATCHPAD');
  });

  it('entity add / update / remove', () => {
    const next = clone(baseNarrative());
    next.entities.push({ id: 'e3', name: 'James', type: 'character', createdAt: ISO, updatedAt: ISO } as any);
    next.entities[0] = { ...next.entities[0], description: 'Pattern-seer, marked' };
    next.entities = next.entities.filter(e => e.id !== 'e2');
    const ops = assertRoundTrip(baseNarrative(), next);
    expect(ops.filter(o => o.type === 'ADD_ENTITY')).toHaveLength(1);
    const update = ops.find(o => o.type === 'UPDATE_ENTITY') as any;
    expect(update.payload.changes).toEqual({ description: 'Pattern-seer, marked' });
    expect(ops.filter(o => o.type === 'REMOVE_ENTITY')).toHaveLength(1);
  });

  it('optional-field DELETION falls back to whole-replace and still round-trips', () => {
    const next = clone(baseNarrative());
    delete (next.entities[0] as any).traits; // partial can't express removal
    const ops = assertRoundTrip(baseNarrative(), next);
    const types = ops.map(o => o.type);
    expect(types).toEqual(expect.arrayContaining(['REMOVE_ENTITY', 'ADD_ENTITY']));
  });

  it('frame add / update / remove inside a surviving scene', () => {
    const next = clone(baseNarrative());
    const s1 = next.scenes.find(s => s.id === 's1')!;
    s1.frames = s1.frames!.filter(f => f.id !== 'f2');
    s1.frames[0] = { ...s1.frames[0], dialogue: ['What is this?', 'It sees me.'] };
    s1.frames.push({ id: 'f3', position: 1, description: 'Aria recoils' } as any);
    const ops = assertRoundTrip(baseNarrative(), next);
    const types = ops.map(o => o.type);
    expect(types).toContain('REMOVE_FRAME');
    expect(types).toContain('UPDATE_FRAME');
    expect(types).toContain('ADD_FRAME');
    expect(types).not.toContain('REMOVE_SCENE');
  });

  it('scene reorder emits REORDER_SCENES and round-trips positions', () => {
    const next = clone(baseNarrative());
    next.scenes[0].position = 1;
    next.scenes[1].position = 0;
    const ops = assertRoundTrip(baseNarrative(), next);
    expect(ops.some(o => o.type === 'REORDER_SCENES')).toBe(true);
  });

  it('style change + style removal (SET to empty)', () => {
    const changed = clone(baseNarrative());
    changed.styleProfile = { visual: { presetId: 'noir' } };
    assertRoundTrip(baseNarrative(), changed);

    const removed = clone(baseNarrative());
    delete (removed as any).styleProfile;
    const ops = assertRoundTrip(baseNarrative(), removed);
    expect(ops.some(o => o.type === 'SET_STYLE_PROFILE')).toBe(true);
  });

  it('scratchpad write + remove', () => {
    const next = clone(baseNarrative());
    next.scratchpad!.documents[0].content = 'The Loom weaves both ways.';
    next.scratchpad!.documents.push({ id: 'd2', title: 'Glitches', category: 'other', content: '', isPinned: false, createdAt: ISO, updatedAt: ISO } as any);
    const ops = assertRoundTrip(baseNarrative(), next);
    expect(ops.filter(o => o.type === 'WRITE_SCRATCHPAD')).toHaveLength(2);

    const gone = clone(baseNarrative());
    gone.scratchpad = undefined;
    const ops2 = assertRoundTrip(baseNarrative(), gone);
    expect(ops2.some(o => o.type === 'REMOVE_SCRATCHPAD')).toBe(true);
  });

  it('HASH-INVISIBLE changes derive ZERO ops (extensions.studio content, cachedUri)', () => {
    // NOTE: canonicalize strips the CONTENTS of extensions.studio but keeps
    // the (emptied) extensions key — so both sides carry the bag, contents
    // differ. This mirrors migrator output, which always emits the bag when
    // studio fields exist.
    const prev = clone(baseNarrative());
    (prev.entities[0] as any).extensions = { studio: { renderCount: 1 } };
    const next = clone(baseNarrative());
    (next.entities[0] as any).extensions = { studio: { renderCount: 42, visualDirty: true } };
    expect(deriveOperations(prev, next)).toHaveLength(0);

    // cachedUri-only change on an asset ref: also invisible.
    const prevRef = clone(baseNarrative());
    (prevRef.entities[0] as any).references = [{ sha256: 'a'.repeat(64), mimeType: 'image/png', cachedUri: 'urn:x:1' }];
    const nextRef = clone(prevRef);
    (nextRef.entities[0] as any).references[0].cachedUri = 'urn:x:2';
    expect(deriveOperations(prevRef, nextRef)).toHaveLength(0);
  });

  it('ops validate against the schema union shape (spot check payload keys)', () => {
    const next = clone(baseNarrative());
    next.entities[0] = { ...next.entities[0], status: 'marked' };
    const ops = deriveOperations(baseNarrative(), next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ type: 'UPDATE_ENTITY', payload: { entityId: 'e1', changes: { status: 'marked' } } });
  });
});

describe('studio → migrator → derive round-trip (the REAL gate)', () => {
  function studioProject(): any {
    return {
      entities: [
        { id: 'e1', name: 'Aria', type: 'Character', description: 'seer', referenceImage: 'http://x/aria.png', imageGallery: [{ url: 'a' }], createdAt: ISO },
      ],
      relationships: [{ id: 'r1', source: 'e1', target: 'e1', type: 'self' }],
      commits: [], branches: [], documents: [
        { id: 'd1', title: 'Note', category: 'other', content: 'hi', isPinned: false, createdAt: ISO, updatedAt: ISO },
      ],
      interactions: [
        {
          id: 's1', title: 'Opening', position: 0, participantIds: ['e1'], status: 'draft',
          productionId: 'prod_default', visualDirty: true, // studio runtime fields
          frames: [{ id: 'f1', position: 0, visual_beat: 'wide shot', imageUrl: 'http://x/f1.png' }],
          createdAt: ISO, updatedAt: ISO,
        },
      ],
    };
  }

  it('migrated snapshots diff and round-trip; studio runtime fields are hash-invisible', () => {
    const before = migrateStudioProjectToV1(studioProject(), { projectMeta: { id: 'p1', name: 'W' } });

    const mutated = studioProject();
    mutated.entities[0].description = 'seer of patterns';
    mutated.interactions[0].frames.push({ id: 'f2', position: 1, visual_beat: 'close-up' });
    mutated.interactions[0].visualDirty = false; // runtime-only change: must NOT op
    // Same path the server takes: pin metadata + stabilize migrator-default
    // timestamps before deriving.
    const after = stabilizeTimestamps(before, { ...migrateStudioProjectToV1(mutated, { projectMeta: { id: 'p1', name: 'W' } }), metadata: before.metadata });

    const ops = deriveOperations(before, after);
    expect(roundTripPreservesHash(before, after, ops)).toBe(true);
    const types = ops.map(o => o.type).sort();
    expect(types).toContain('UPDATE_ENTITY');
    expect(types).toContain('ADD_FRAME');
    // visualDirty rides extensions.studio → canonically invisible → no scene op
    expect(types).not.toContain('UPDATE_SCENE');
  });

  it('a runtime-only studio change derives ZERO ops end-to-end', () => {
    const before = migrateStudioProjectToV1(studioProject(), { projectMeta: { id: 'p1', name: 'W' } });
    const mutated = studioProject();
    mutated.interactions[0].visualDirty = false;
    mutated.interactions[0].lastImagePrompt = 'something new';
    const after = stabilizeTimestamps(before, { ...migrateStudioProjectToV1(mutated, { projectMeta: { id: 'p1', name: 'W' } }), metadata: before.metadata });
    expect(deriveOperations(before, after)).toHaveLength(0);
    expect(workingTreeHash(before)).toBe(workingTreeHash(after));
  });
});

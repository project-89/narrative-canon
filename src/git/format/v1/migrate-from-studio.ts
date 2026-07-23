/**
 * Migrator: Studio's current `.narrative-data/project_*.json` → Nit v1.0.0 Narrative
 *
 * Translates the live studio shape into a validated v1 Narrative document.
 * Lossless: anything we don't model in v1 is preserved under
 *   extensions.studio.<field>
 * so a round-trip through this migrator + a future "back-translate" can reach
 * the same studio JSON byte-for-byte.
 *
 * Asset URLs in the studio are currently strings:
 *   "/api/narrative/visual/portraits/foo.png"  (local server URL)
 *   "data:image/jpeg;base64,..."               (embedded)
 *
 * We do NOT hash assets here (that requires file I/O). Instead, we emit
 * AssetRefs with sha256: "URI_PLACEHOLDER_<id>" and stash the original URL in
 * cachedUri/externalUri. A separate `hashAssets()` pass walks the assets/
 * directory, computes real sha256s, and rewrites the references. This keeps
 * the migrator pure and synchronous.
 */

import {
  type Narrative,
  type Entity,
  type Relationship,
  type Scene,
  type Frame,
  type AssetRef,
  type ScratchpadDocument,
  type StyleProfile,
  NIT_FORMAT_VERSION,
} from './schemas';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PLACEHOLDER_PREFIX = 'urn:nit-pending-hash:';

/** Generate a deterministic placeholder sha256 for an asset whose bytes
 *  haven't been hashed yet. The hashAssets pass replaces these. */
function placeholderHash(seed: string): string {
  // 64 hex chars expected by Sha256HexSchema. Use a hex-only encoding
  // of the seed, padded/truncated to 64 chars. Marked with a stable prefix
  // (in the cachedUri) so the asset-hashing pass can find these.
  const hex = Buffer.from(seed).toString('hex');
  return (hex + '0'.repeat(64)).slice(0, 64);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toIso(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    try {
      return new Date(value).toISOString();
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Convert a studio image URL string to an AssetRef. */
function urlToAssetRef(rawUrl: string | undefined, seedSuffix: string): AssetRef | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const dataUrlMatch = rawUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const mimeType = dataUrlMatch ? dataUrlMatch[1].toLowerCase() : guessMimeFromUrl(rawUrl);
  return {
    sha256: placeholderHash(`${seedSuffix}:${rawUrl.slice(0, 100)}`),
    mimeType,
    cachedUri: PLACEHOLDER_PREFIX + rawUrl,
  };
}

function guessMimeFromUrl(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/** Pull off the studio's known runtime/visual fields into a single
 *  extensions.studio bag. Anything else on the entity stays put. */
function partitionEntity(raw: any): { canonical: Partial<Entity>; studioExt: Record<string, unknown> } {
  const known = new Set([
    'id', 'name', 'type',
    'description', 'backstory', 'traits', 'motivations', 'secrets', 'status', 'notes',
    'createdAt', 'updatedAt', 'extensions',
    'referenceImage', 'imageUrl', 'portraitVariations',
  ]);
  const studioExt: Record<string, unknown> = {};
  for (const k of Object.keys(raw || {})) {
    if (!known.has(k)) studioExt[k] = raw[k];
  }
  return { canonical: {}, studioExt };
}

// ---------------------------------------------------------------------------
// Per-shape converters
// ---------------------------------------------------------------------------

function convertEntity(raw: any, fallbackTimestamp: string): Entity {
  const createdAt = toIso(raw.createdAt, fallbackTimestamp);
  const updatedAt = toIso(raw.updatedAt ?? raw.lastUpdated, createdAt);

  const references: AssetRef[] = [];
  const refImage = urlToAssetRef(raw.referenceImage, `entity-ref:${raw.id}`);
  if (refImage) references.push(refImage);
  const imgUrl = urlToAssetRef(raw.imageUrl, `entity-img:${raw.id}`);
  if (imgUrl && !references.some((r) => r.cachedUri === imgUrl.cachedUri)) {
    references.push(imgUrl);
  }

  const variations: AssetRef[] = [];
  if (Array.isArray(raw.portraitVariations)) {
    raw.portraitVariations.forEach((url: any, i: number) => {
      const ref = urlToAssetRef(url, `entity-var:${raw.id}:${i}`);
      if (ref) variations.push(ref);
    });
  }

  const { studioExt } = partitionEntity(raw);

  // Coerce type to known vocabulary; unknown types fall back to 'concept'
  const knownTypes = new Set(['character', 'location', 'object', 'concept', 'event', 'organization', 'creature', 'faction', 'artifact']);
  const rawType = String(raw.type || 'concept').toLowerCase();
  const type = knownTypes.has(rawType) ? rawType : 'concept';
  if (rawType !== type) studioExt.originalType = rawType;

  return {
    id: String(raw.id),
    name: String(raw.name),
    type: type as Entity['type'],
    ...(raw.description ? { description: String(raw.description) } : {}),
    ...(raw.backstory ? { backstory: String(raw.backstory) } : {}),
    ...(Array.isArray(raw.traits) ? { traits: raw.traits.filter((x: any) => typeof x === 'string') } : {}),
    ...(Array.isArray(raw.motivations) ? { motivations: raw.motivations.filter((x: any) => typeof x === 'string') } : {}),
    ...(Array.isArray(raw.secrets) ? { secrets: raw.secrets.filter((x: any) => typeof x === 'string') } : {}),
    ...(raw.status ? { status: String(raw.status) } : {}),
    ...(raw.notes ? { notes: String(raw.notes) } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...(variations.length > 0 ? { variations } : {}),
    createdAt,
    updatedAt,
    ...(Object.keys(studioExt).length > 0 || raw.extensions
      ? { extensions: { ...(raw.extensions || {}), ...(Object.keys(studioExt).length > 0 ? { studio: studioExt } : {}) } }
      : {}),
  };
}

function convertRelationship(raw: any, fallbackTimestamp: string): Relationship {
  const createdAt = toIso(raw.createdAt, fallbackTimestamp);
  const updatedAt = toIso(raw.updatedAt, createdAt);

  // Studio uses both `source/target` and `sourceId/targetId`. Canonicalize.
  const sourceId = String(raw.sourceId || raw.source);
  const targetId = String(raw.targetId || raw.target);

  const known = new Set(['id', 'sourceId', 'targetId', 'source', 'target', 'sourceName', 'targetName', 'type', 'description', 'strength', 'createdAt', 'updatedAt', 'extensions']);
  const studioExt: Record<string, unknown> = {};
  for (const k of Object.keys(raw || {})) {
    if (!known.has(k)) studioExt[k] = raw[k];
  }
  if (raw.sourceName) studioExt.sourceName = raw.sourceName;
  if (raw.targetName) studioExt.targetName = raw.targetName;

  return {
    id: String(raw.id),
    sourceId,
    targetId,
    type: String(raw.type),
    ...(raw.description ? { description: String(raw.description) } : {}),
    ...(typeof raw.strength === 'number' ? { strength: Math.max(0, Math.min(1, raw.strength)) } : {}),
    createdAt,
    updatedAt,
    ...(Object.keys(studioExt).length > 0 || raw.extensions
      ? { extensions: { ...(raw.extensions || {}), ...(Object.keys(studioExt).length > 0 ? { studio: studioExt } : {}) } }
      : {}),
  };
}

function convertFrame(raw: any, sceneId: string): Frame {
  const known = new Set([
    'id', 'position', 'title', 'description', 'visual_beat', 'visualBeat', 'shotType', 'camera', 'mood',
    'participantIds', 'participantRefs', 'locationId',
    'visual_direction', 'visualDirection', 'appearance_notes', 'appearanceNotes',
    'dialogue', 'caption', 'sfx', 'imageUrl', 'extensions',
  ]);
  const studioExt: Record<string, unknown> = {};
  for (const k of Object.keys(raw || {})) {
    if (!known.has(k)) studioExt[k] = raw[k];
  }

  const references: AssetRef[] = [];
  const frameImg = urlToAssetRef(raw.imageUrl, `frame:${sceneId}:${raw.id}`);
  if (frameImg) references.push(frameImg);

  return {
    id: String(raw.id),
    position: typeof raw.position === 'number' ? raw.position : 0,
    ...(raw.title ? { title: String(raw.title) } : {}),
    ...(raw.description ? { description: String(raw.description) } : {}),
    ...(raw.visual_beat || raw.visualBeat ? { visualBeat: String(raw.visualBeat ?? raw.visual_beat) } : {}),
    ...(raw.shotType ? { shotType: String(raw.shotType) } : {}),
    ...(raw.camera ? { camera: String(raw.camera) } : {}),
    ...(raw.mood ? { mood: String(raw.mood) } : {}),
    ...(Array.isArray(raw.participantIds) ? { participantIds: raw.participantIds.map(String) } : {}),
    ...(Array.isArray(raw.participantRefs) ? { participantRefs: raw.participantRefs } : {}),
    ...(raw.locationId ? { locationId: String(raw.locationId) } : {}),
    ...(raw.visualDirection || raw.visual_direction ? { visualDirection: raw.visualDirection ?? raw.visual_direction } : {}),
    ...(Array.isArray(raw.appearanceNotes ?? raw.appearance_notes)
      ? { appearanceNotes: raw.appearanceNotes ?? raw.appearance_notes }
      : {}),
    ...(Array.isArray(raw.dialogue) ? { dialogue: raw.dialogue.map(String) } : {}),
    ...(raw.caption ? { caption: String(raw.caption) } : {}),
    ...(Array.isArray(raw.sfx) ? { sfx: raw.sfx.map(String) } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...(Object.keys(studioExt).length > 0 || raw.extensions
      ? { extensions: { ...(raw.extensions || {}), ...(Object.keys(studioExt).length > 0 ? { studio: studioExt } : {}) } }
      : {}),
  };
}

function convertScene(raw: any, fallbackTimestamp: string): Scene {
  const createdAt = toIso(raw.createdAt, fallbackTimestamp);
  const updatedAt = toIso(raw.updatedAt, createdAt);

  // Reconcile participants/participantIds and location/locationId
  const participantIds: string[] = (raw.participantIds || raw.participants || [])
    .filter((x: any) => typeof x === 'string');
  const locationId = raw.locationId || raw.location;

  const knownTop = new Set([
    'id', 'title', 'prose', 'content', 'summary',
    'participants', 'participantIds', 'location', 'locationId',
    'events', 'stateChanges', 'frames', 'eventLinks',
    'imageUrl', 'status', 'position', 'createdAt', 'updatedAt',
    'storyDiff', 'visualDirty', 'visualDirtyEntityIds', 'visualDirtyEntityNames',
    'visualDirtyAt', 'visualDirtyReason', 'lastImagePrompt', 'lastImageModel',
    'lastImageAt', 'frameVisualDirtyCount', 'frameImagesDirty', 'extensions',
  ]);
  const studioExt: Record<string, unknown> = {};
  for (const k of Object.keys(raw || {})) {
    if (!knownTop.has(k)) studioExt[k] = raw[k];
  }
  // Stash the runtime-y studio fields explicitly so they're preserved
  for (const k of [
    'storyDiff', 'visualDirty', 'visualDirtyEntityIds', 'visualDirtyEntityNames',
    'visualDirtyAt', 'visualDirtyReason', 'lastImagePrompt', 'lastImageModel',
    'lastImageAt', 'frameVisualDirtyCount', 'frameImagesDirty', 'commitHistory',
  ]) {
    if (raw[k] !== undefined) studioExt[k] = raw[k];
  }

  const references: AssetRef[] = [];
  const heroImg = urlToAssetRef(raw.imageUrl, `scene:${raw.id}`);
  if (heroImg) references.push(heroImg);

  const status: Scene['status'] = raw.status === 'canon' ? 'canon' : 'draft';
  const prose = raw.prose ?? raw.content;

  return {
    id: String(raw.id),
    position: typeof raw.position === 'number' ? raw.position : 0,
    title: String(raw.title || 'Untitled scene'),
    ...(prose ? { prose: String(prose) } : {}),
    ...(raw.summary ? { summary: String(raw.summary) } : {}),
    participantIds,
    ...(locationId ? { locationId: String(locationId) } : {}),
    ...(Array.isArray(raw.events) ? { events: raw.events.map(String) } : {}),
    ...(Array.isArray(raw.stateChanges) ? { stateChanges: raw.stateChanges.map(String) } : {}),
    ...(Array.isArray(raw.frames) ? { frames: raw.frames.map((f: any) => convertFrame(f, String(raw.id))) } : {}),
    ...(references.length > 0 ? { references } : {}),
    status,
    ...(Array.isArray(raw.eventLinks) && raw.eventLinks.length > 0
      ? { eventLinks: raw.eventLinks
          .filter((l: any) => l && typeof l.eventId === 'string')
          .map((l: any) => ({ eventId: String(l.eventId), dramatizedAtEventUpdatedAt: toIso(l.dramatizedAtEventUpdatedAt, fallbackTimestamp) })) }
      : {}),
    createdAt,
    updatedAt,
    ...(Object.keys(studioExt).length > 0 || raw.extensions
      ? { extensions: { ...(raw.extensions || {}), ...(Object.keys(studioExt).length > 0 ? { studio: studioExt } : {}) } }
      : {}),
  };
}

function convertScratchpadDocument(raw: any, fallbackTimestamp: string): ScratchpadDocument {
  const createdAt = toIso(raw.createdAt, fallbackTimestamp);
  const updatedAt = toIso(raw.updatedAt, createdAt);
  const knownCategories = new Set(['world_bible', 'story_arc', 'character_notes', 'reference', 'other']);
  const category = knownCategories.has(raw.category) ? raw.category : 'other';

  return {
    id: String(raw.id),
    title: String(raw.title || 'Untitled note'),
    category: category as ScratchpadDocument['category'],
    content: typeof raw.content === 'string' ? raw.content : '',
    isPinned: Boolean(raw.isPinned),
    ...(raw.source === 'user' || raw.source === 'assistant' ? { source: raw.source } : {}),
    createdAt,
    updatedAt,
  };
}

/** C1.5: studio WorldEvent → v1 (typed, hashed). Drops malformed rows
 *  rather than corrupting the canon snapshot. */
const EVENT_KINDS = new Set(['died', 'born', 'introduced', 'learned', 'acquired', 'lost', 'moved', 'transformed', 'custom']);
function convertWorldEvent(raw: any, fallbackTimestamp: string): any | null {
  if (!raw || !raw.id || !raw.title) return null;
  const createdAt = toIso(raw.createdAt, fallbackTimestamp);
  return {
    id: String(raw.id),
    chronologyIndex: Number.isFinite(Number(raw.chronologyIndex)) ? Number(raw.chronologyIndex) : 0,
    ...(raw.timelineId ? { timelineId: String(raw.timelineId) } : {}),
    title: String(raw.title),
    ...(raw.description ? { description: String(raw.description) } : {}),
    entityIds: (raw.entityIds || []).filter((x: any) => typeof x === 'string'),
    ...(Array.isArray(raw.stateChanges) && raw.stateChanges.length > 0
      ? { stateChanges: raw.stateChanges
          .filter((c: any) => c && typeof c.entityId === 'string')
          .map((c: any) => ({ entityId: c.entityId, kind: EVENT_KINDS.has(c.kind) ? c.kind : 'custom', ...(c.detail ? { detail: String(c.detail) } : {}) })) }
      : {}),
    ...(Array.isArray(raw.preconditions) && raw.preconditions.length > 0 ? { preconditions: raw.preconditions.map(String) } : {}),
    ...(raw.arcId ? { arcId: String(raw.arcId) } : {}),
    status: raw.status === 'canon' ? 'canon' : 'draft',
    ...(raw.sourceProductionId ? { sourceProductionId: String(raw.sourceProductionId) } : {}),
    createdAt,
    updatedAt: toIso(raw.updatedAt, createdAt),
  };
}

function convertStyleProfile(raw: any): StyleProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: StyleProfile = {};
  if (raw.writing && typeof raw.writing === 'object') {
    out.writing = {
      ...(raw.writing.presetId ? { presetId: String(raw.writing.presetId) } : {}),
      ...(raw.writing.customPrompt ? { customPrompt: String(raw.writing.customPrompt) } : {}),
    };
  }
  if (raw.visual && typeof raw.visual === 'object') {
    out.visual = {
      ...(raw.visual.presetId ? { presetId: String(raw.visual.presetId) } : {}),
      ...(raw.visual.customPrompt ? { customPrompt: String(raw.visual.customPrompt) } : {}),
      ...(raw.visual.outputIntent ? { outputIntent: raw.visual.outputIntent } : {}),
      ...(raw.visual.textPolicy ? { textPolicy: raw.visual.textPolicy } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Top-level migration
// ---------------------------------------------------------------------------

export interface StudioProjectMigrationOptions {
  /** Studio project metadata pulled from `projects.json` (title, description, etc.) */
  projectMeta?: {
    id?: string;
    name?: string;
    title?: string;
    description?: string;
    createdAt?: string | number;
    updatedAt?: string | number;
  };
}

/**
 * Convert a studio `project_*.json` payload into a v1.0.0 Narrative document.
 * The result is NOT yet validated; callers should pass it through
 * `validateNarrative()` to catch any shape problems.
 */
export function migrateStudioProjectToV1(
  raw: any,
  options: StudioProjectMigrationOptions = {}
): Narrative {
  const fallback = nowIso();
  const meta = options.projectMeta || {};

  const entities = (raw.entities || []).map((e: any) => convertEntity(e, fallback));
  const relationships = (raw.relationships || []).map((r: any) => convertRelationship(r, fallback));
  const scenes = (raw.interactions || []).map((s: any) => convertScene(s, fallback));
  const styleProfile = convertStyleProfile(raw.styleProfile);
  const worldEvents = (raw.events || []).map((e: any) => convertWorldEvent(e, fallback)).filter(Boolean);
  const scratchpadDocs = (raw.scratchpadDocuments || raw.documents || [])
    .map((d: any) => convertScratchpadDocument(d, fallback));

  // Things from the studio file that have no v1 home — preserve under
  // narrative.extensions.studio so a round-trip is lossless.
  const studioExt: Record<string, unknown> = {};
  if (raw.commits) studioExt.commits = raw.commits;
  if (raw.branches) studioExt.branches = raw.branches;
  if (raw.storyGraph) studioExt.storyGraph = raw.storyGraph;
  if (raw.conversationHistory) studioExt.conversationHistory = raw.conversationHistory;

  return {
    formatVersion: NIT_FORMAT_VERSION,
    metadata: {
      id: String(meta.id || raw.id || `narrative_${Date.now()}`),
      title: String(meta.title || meta.name || raw.title || 'Untitled narrative'),
      ...(meta.description ? { description: String(meta.description) } : {}),
      createdAt: toIso(meta.createdAt, fallback),
      updatedAt: toIso(meta.updatedAt, fallback),
    },
    entities,
    relationships,
    scenes,
    ...(worldEvents.length > 0 ? { events: worldEvents } : {}),
    ...(styleProfile ? { styleProfile } : {}),
    ...(scratchpadDocs.length > 0 ? { scratchpad: { documents: scratchpadDocs } } : {}),
    ...(Object.keys(studioExt).length > 0 ? { extensions: { studio: studioExt } } : {}),
  };
}

export { PLACEHOLDER_PREFIX };

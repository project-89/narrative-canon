/**
 * Nit Narrative Format — v1.0.0 schemas
 *
 * The single source of truth for the Nit narrative format. Validators,
 * serialisers, and consumer apps all derive from these schemas.
 *
 * See docs/NIT_FORMAT_SPEC.md for the human-readable specification.
 *
 * NOTE: This file is additive. The running studio does not depend on it yet.
 * Wiring will land in a follow-up phase.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Format version
// ---------------------------------------------------------------------------

export const NIT_FORMAT_VERSION = '1.1.0' as const; // 1.1: WorldEvents on the chronology + eventLinks + EVENT ops (CHRONICLE_DESIGN C1.5)

// Every format version that has ever shipped, newest first. Recovery replay
// needs this: a commit's workingTreeHash was computed under the version live
// at commit time, and commits written before the per-commit formatVersion tag
// existed don't record which one — the replayer tries these until the stored
// hash reproduces. Append here on every NIT_FORMAT_VERSION bump.
export const KNOWN_NIT_FORMAT_VERSIONS: readonly string[] = ['1.1.0', '1.0.0'];

// Permissive semver-ish; we only enforce major-version compatibility at runtime.
const SemVerSchema = z.string().regex(
  /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/,
  'formatVersion must be semver (e.g. "1.0.0" or "1.0.0-draft")'
);

// ---------------------------------------------------------------------------
// Common primitives
// ---------------------------------------------------------------------------

const IsoDateSchema = z.string().min(1).describe('ISO-8601 timestamp');
const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/i, 'must be 64-char hex SHA-256');
const ExtensionsSchema = z
  .record(z.string(), z.unknown())
  .describe('Namespaced app-specific metadata. Tools MUST preserve unknown namespaces verbatim.')
  .optional();

// ---------------------------------------------------------------------------
// Asset references — content-addressable
// ---------------------------------------------------------------------------

export const AssetSourceSchema = z.object({
  generator: z.string().optional(),
  generatedAt: IsoDateSchema.optional(),
  prompt: z.string().optional(),
  references: z.array(Sha256HexSchema).optional(),
});

export const AssetRefSchema = z.object({
  sha256: Sha256HexSchema,
  mimeType: z.string().min(1),
  bytes: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  caption: z.string().optional(),
  source: AssetSourceSchema.optional(),
  /**
   * NON-AUTHORITATIVE local URL where a tool happens to serve this asset.
   * Other tools MUST resolve via sha256, not this hint.
   */
  cachedUri: z.string().optional(),
  /**
   * NON-AUTHORITATIVE remote URL the asset can be re-fetched from if missing.
   */
  externalUri: z.string().optional(),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;

// ---------------------------------------------------------------------------
// Authorship
// ---------------------------------------------------------------------------

export const AuthorRefSchema = z.object({
  kind: z.enum(['user', 'ai', 'system']),
  name: z.string().min(1),
  identifier: z.string().optional(),
});

export type AuthorRef = z.infer<typeof AuthorRefSchema>;

// ---------------------------------------------------------------------------
// Style profile
// ---------------------------------------------------------------------------

export const VisualOutputIntentSchema = z.enum([
  'cinematic',
  'comic',
  'illustration',
  'photoreal',
  'concept-art',
  'storyboard-sketch',
]);

export const VisualTextPolicySchema = z.enum([
  'no-text',
  'captions-only',
  'dialogue-bubbles',
  'open',
]);

export const StyleProfileSchema = z.object({
  writing: z
    .object({
      presetId: z.string().optional(),
      customPrompt: z.string().optional(),
    })
    .optional(),
  visual: z
    .object({
      presetId: z.string().optional(),
      customPrompt: z.string().optional(),
      outputIntent: VisualOutputIntentSchema.optional(),
      textPolicy: VisualTextPolicySchema.optional(),
    })
    .optional(),
});

export type StyleProfile = z.infer<typeof StyleProfileSchema>;

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export const EntityTypeSchema = z.enum([
  'character',
  'location',
  'object',
  'concept',
  'event',
  'organization',
  'creature',
  'faction',
  'artifact',
]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: EntityTypeSchema,
  description: z.string().optional(),
  backstory: z.string().optional(),
  traits: z.array(z.string()).optional(),
  motivations: z.array(z.string()).optional(),
  secrets: z.array(z.string()).optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  references: z.array(AssetRefSchema).optional(),
  variations: z.array(AssetRefSchema).optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  extensions: ExtensionsSchema,
});

export type Entity = z.infer<typeof EntitySchema>;

// ---------------------------------------------------------------------------
// Relationship
// ---------------------------------------------------------------------------

export const RelationshipSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  strength: z.number().min(0).max(1).optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  extensions: ExtensionsSchema,
});

export type Relationship = z.infer<typeof RelationshipSchema>;

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export const ParticipantBlockingSchema = z.object({
  entityId: z.string().optional(),
  name: z.string().min(1),
  action: z.string().optional(),
  pose: z.string().optional(),
  expression: z.string().optional(),
  placement: z.string().optional(),
  notes: z.string().optional(),
});

// Every field optional: legitimate authoring produces PARTIAL direction (a
// shot noting only lighting), and requiring fields here once wedged a real
// publication journal — the writer's round-trip gate doesn't schema-check,
// so a partial object reached canon and the stricter reader refused it
// forever. Canon must parse what canon contains.
export const VisualDirectionSchema = z.object({
  action: z.string().optional(),
  composition: z.string().optional(),
  lighting: z.string().optional(),
  atmosphere: z.string().optional(),
  environment: z.string().optional(),
});

export const AppearanceNoteSchema = z.object({
  name: z.string().min(1),
  details: z.string().min(1),
});

export const FrameSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().nonnegative(),
  title: z.string().optional(),
  description: z.string().optional(),
  visualBeat: z.string().optional(),
  shotType: z.string().optional(),
  camera: z.string().optional(),
  mood: z.string().optional(),
  participantIds: z.array(z.string()).optional(),
  participantRefs: z.array(ParticipantBlockingSchema).optional(),
  locationId: z.string().optional(),
  visualDirection: VisualDirectionSchema.optional(),
  appearanceNotes: z.array(AppearanceNoteSchema).optional(),
  dialogue: z.array(z.string()).optional(),
  caption: z.string().optional(),
  sfx: z.array(z.string()).optional(),
  references: z.array(AssetRefSchema).optional(),
  extensions: ExtensionsSchema,
});

export type Frame = z.infer<typeof FrameSchema>;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export const SceneStatusSchema = z.enum(['draft', 'canon']);

/** C1.5: a media-agnostic happening on the UNIVERSE chronology (valid
 *  time). Canon-tier and HASHED — hooks/merge/consistency read these. */
export const EventStateChangeSchema = z.object({
  entityId: z.string().min(1),
  kind: z.enum(['died', 'born', 'introduced', 'learned', 'acquired', 'lost', 'moved', 'transformed', 'custom']),
  detail: z.string().optional(),
});

export const WorldEventSchema = z.object({
  id: z.string().min(1),
  chronologyIndex: z.number(),
  timelineId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  entityIds: z.array(z.string()),
  stateChanges: z.array(EventStateChangeSchema).optional(),
  preconditions: z.array(z.string()).optional(),
  arcId: z.string().optional(),
  status: z.enum(['draft', 'canon']),
  sourceProductionId: z.string().optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  extensions: ExtensionsSchema,
});
export type WorldEvent = z.infer<typeof WorldEventSchema>;
export type EventStateChange = z.infer<typeof EventStateChangeSchema>;

/** C1.5: a scene's provenance link to the event it dramatizes. */
export const EventLinkSchema = z.object({
  eventId: z.string().min(1),
  dramatizedAtEventUpdatedAt: IsoDateSchema,
});
export type EventLink = z.infer<typeof EventLinkSchema>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().nonnegative(),
  title: z.string().min(1),
  prose: z.string().optional(),
  summary: z.string().optional(),
  participantIds: z.array(z.string()),
  locationId: z.string().optional(),
  events: z.array(z.string()).optional(),
  stateChanges: z.array(z.string()).optional(),
  frames: z.array(FrameSchema).optional(),
  references: z.array(AssetRefSchema).optional(),
  status: SceneStatusSchema,
  /** C1.5: which world events this scene DRAMATIZES (with provenance). */
  eventLinks: z.array(EventLinkSchema).optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  extensions: ExtensionsSchema,
});

export type Scene = z.infer<typeof SceneSchema>;

// ---------------------------------------------------------------------------
// Scratchpad
// ---------------------------------------------------------------------------

export const ScratchpadCategorySchema = z.enum([
  'world_bible',
  'story_arc',
  'character_notes',
  'reference',
  'other',
]);

export const ScratchpadDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: ScratchpadCategorySchema,
  content: z.string(),
  isPinned: z.boolean(),
  source: z.enum(['user', 'assistant']).optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  extensions: ExtensionsSchema,
});

export type ScratchpadDocument = z.infer<typeof ScratchpadDocumentSchema>;

// ---------------------------------------------------------------------------
// Continuity / story consistency
// ---------------------------------------------------------------------------

export const ContinuityIssueSchema = z.object({
  sceneId: z.string(),
  severity: z.enum(['error', 'warning']),
  code: z.string(),
  message: z.string(),
  entityIds: z.array(z.string()).optional(),
});

export const StoryConsistencyReportSchema = z.object({
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  isConsistent: z.boolean(),
  issues: z.array(ContinuityIssueSchema).optional(),
});

export type StoryConsistencyReport = z.infer<typeof StoryConsistencyReportSchema>;

// ---------------------------------------------------------------------------
// The Narrative Document — what consumer apps read
// ---------------------------------------------------------------------------

export const NarrativeMetadataSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  authors: z.array(AuthorRefSchema).optional(),
});

export const NarrativeSchema = z.object({
  formatVersion: SemVerSchema,
  metadata: NarrativeMetadataSchema,
  entities: z.array(EntitySchema),
  relationships: z.array(RelationshipSchema),
  scenes: z.array(SceneSchema),
  /** C1.5: the universe chronology — canon-tier, hashed. */
  events: z.array(WorldEventSchema).optional(),
  styleProfile: StyleProfileSchema.optional(),
  scratchpad: z
    .object({
      documents: z.array(ScratchpadDocumentSchema),
    })
    .optional(),
  extensions: ExtensionsSchema,
});

export type Narrative = z.infer<typeof NarrativeSchema>;

// ---------------------------------------------------------------------------
// Graph operations — how mutations are recorded
// ---------------------------------------------------------------------------

export const GraphOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ADD_ENTITY'), payload: EntitySchema }),
  z.object({
    type: z.literal('UPDATE_ENTITY'),
    payload: z.object({ entityId: z.string(), changes: EntitySchema.partial() }),
  }),
  z.object({
    type: z.literal('REMOVE_ENTITY'),
    payload: z.object({ entityId: z.string(), reason: z.string().optional() }),
  }),
  z.object({ type: z.literal('ADD_RELATIONSHIP'), payload: RelationshipSchema }),
  z.object({
    type: z.literal('UPDATE_RELATIONSHIP'),
    payload: z.object({ relationshipId: z.string(), changes: RelationshipSchema.partial() }),
  }),
  z.object({
    type: z.literal('REMOVE_RELATIONSHIP'),
    payload: z.object({ relationshipId: z.string(), reason: z.string().optional() }),
  }),
  z.object({ type: z.literal('ADD_SCENE'), payload: SceneSchema }),
  z.object({
    type: z.literal('UPDATE_SCENE'),
    payload: z.object({ sceneId: z.string(), changes: SceneSchema.partial() }),
  }),
  z.object({
    type: z.literal('REMOVE_SCENE'),
    payload: z.object({ sceneId: z.string(), reason: z.string().optional() }),
  }),
  z.object({
    type: z.literal('REORDER_SCENES'),
    payload: z.object({ orderedSceneIds: z.array(z.string()) }),
  }),
  z.object({
    type: z.literal('ADD_FRAME'),
    payload: z.object({ sceneId: z.string(), frame: FrameSchema, position: z.number().int().nonnegative() }),
  }),
  z.object({
    type: z.literal('UPDATE_FRAME'),
    payload: z.object({ sceneId: z.string(), frameId: z.string(), changes: FrameSchema.partial() }),
  }),
  z.object({
    type: z.literal('REMOVE_FRAME'),
    payload: z.object({ sceneId: z.string(), frameId: z.string() }),
  }),
  z.object({ type: z.literal('SET_STYLE_PROFILE'), payload: StyleProfileSchema }),
  z.object({ type: z.literal('WRITE_SCRATCHPAD'), payload: ScratchpadDocumentSchema }),
  z.object({
    type: z.literal('ADD_EVENT'),
    payload: WorldEventSchema,
  }),
  z.object({
    type: z.literal('UPDATE_EVENT'),
    payload: z.object({
      eventId: z.string().min(1),
      changes: WorldEventSchema.partial(),
    }),
  }),
  z.object({
    type: z.literal('REMOVE_EVENT'),
    payload: z.object({
      eventId: z.string().min(1),
      reason: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('REMOVE_SCRATCHPAD'),
    payload: z.object({ documentId: z.string() }),
  }),
]);

export type GraphOperation = z.infer<typeof GraphOperationSchema>;

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export const CommitSchema = z.object({
  hash: Sha256HexSchema,
  parentHashes: z.array(Sha256HexSchema),
  author: AuthorRefSchema,
  timestamp: z.number().int().nonnegative(),
  message: z.string(),
  branch: z.string().min(1),
  operations: z.array(GraphOperationSchema),
  storyConsistency: StoryConsistencyReportSchema.optional(),
  workingTreeHash: Sha256HexSchema.optional(),
  // The narrative formatVersion the working tree carried at commit time.
  // Hash-invisible (commitContentHash picks fields; this isn't one), but
  // self-verifying: replay under any other version fails the workingTreeHash
  // comparison. Absent on commits written before this field shipped.
  formatVersion: SemVerSchema.optional(),
  tags: z.array(z.string()).optional(),
  extensions: ExtensionsSchema,
});

export type Commit = z.infer<typeof CommitSchema>;

// ---------------------------------------------------------------------------
// Repository manifest
// ---------------------------------------------------------------------------

export const BranchSummarySchema = z.object({
  name: z.string().min(1),
  head: Sha256HexSchema,
  parentBranch: z.string().optional(),
  parentCommit: Sha256HexSchema.optional(),
  isCanon: z.boolean().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  merged: z
    .object({
      intoBranch: z.string(),
      mergeCommit: Sha256HexSchema,
      at: IsoDateSchema,
    })
    .optional(),
  extensions: ExtensionsSchema,
});

export type BranchSummary = z.infer<typeof BranchSummarySchema>;

export const AssetIndexEntrySchema = z.object({
  sha256: Sha256HexSchema,
  mimeType: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  externalUri: z.string().optional(),
});

export type AssetIndexEntry = z.infer<typeof AssetIndexEntrySchema>;

export const RepoManifestSchema = z.object({
  formatVersion: SemVerSchema,
  narrativeId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  branches: z.array(BranchSummarySchema),
  head: z
    .object({
      ref: z.string().optional(),
      commit: Sha256HexSchema.optional(),
    })
    .refine((h) => Boolean(h.ref) || Boolean(h.commit), {
      message: 'head must have either a ref (branch) or a commit (detached)',
    }),
  assetIndex: z.array(AssetIndexEntrySchema),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  extensions: ExtensionsSchema,
});

export type RepoManifest = z.infer<typeof RepoManifestSchema>;

// ---------------------------------------------------------------------------
// Re-exports of utility schemas for downstream tools
// ---------------------------------------------------------------------------

export {
  IsoDateSchema,
  Sha256HexSchema,
  SemVerSchema,
  ExtensionsSchema,
};

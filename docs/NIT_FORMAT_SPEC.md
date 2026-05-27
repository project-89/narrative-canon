# Nit Narrative Format Specification

**Version:** 1.0.0-draft
**Status:** Draft — implementation in progress
**Audience:** Implementers of authoring tools (studios), consumer apps (comic generators, microdrama, card games), and federated narrative repositories.

---

## What is Nit?

Nit is a portable, version-controlled format for collaborative narratives. A *Nit narrative* is a structured story-world — characters, locations, scenes, frames, relationships, prose, visual references — paired with a git-style history of how it evolved.

A *Nit repository* (`.nit/`) is the on-disk representation of one narrative. It is portable: a comic generator, a microdrama renderer, a card-game builder, and the Narrative Studio can all open the same `.nit/` directory and work with it. Writers can collaborate via `nit push` / `nit pull`. Consumers ignore history and read just the working state.

This spec defines:

1. **The Narrative Document** — the in-memory structure (entities, scenes, frames, etc.)
2. **The Repository Layout** — how a `.nit/` directory is organised
3. **Operations & Commits** — how changes are tracked
4. **Asset Handling** — content-addressable images, audio, etc.
5. **Extensibility** — how apps add their own metadata

---

## 1. The Narrative Document

The narrative document is a JSON object representing the **working state** of a narrative. It is what consumer apps read.

```jsonc
{
  "formatVersion": "1.0.0",
  "metadata": { /* title, description, timestamps */ },
  "entities": [ /* characters, locations, objects, etc. */ ],
  "relationships": [ /* typed edges between entities */ ],
  "scenes": [ /* ordered narrative beats, with frames */ ],
  "styleProfile": { /* writing + visual style */ },
  "scratchpad": { "documents": [ /* world-bible, notes */ ] },
  "extensions": { /* app-specific data, namespaced */ }
}
```

### 1.1 Metadata

```ts
metadata: {
  id: string             // stable narrative identifier (uuid recommended)
  title: string
  description?: string
  createdAt: string      // ISO-8601
  updatedAt: string      // ISO-8601
  authors?: AuthorRef[]  // contributors (informational)
}
```

### 1.2 Entity

The fundamental unit of the world graph. A character, location, object, organisation, concept, etc.

```ts
Entity {
  id: string                    // unique within the narrative
  name: string
  type: EntityType              // see vocabulary below
  description?: string          // short, evocative
  backstory?: string            // long-form history
  traits?: string[]             // defining characteristics
  motivations?: string[]        // what drives them
  secrets?: string[]            // hidden truths
  status?: string               // current state ("alive", "in hiding", ...)
  notes?: string                // author notes
  references?: AssetRef[]       // canonical reference image(s)
  variations?: AssetRef[]       // alternate portraits
  createdAt: string             // ISO-8601
  updatedAt: string             // ISO-8601
  extensions?: { [namespace: string]: unknown }
}
```

**EntityType vocabulary (recommended):**
`character`, `location`, `object`, `concept`, `event`, `organization`, `creature`, `faction`, `artifact`. Implementations MAY introduce additional types but SHOULD use these first.

### 1.3 Relationship

A typed, optionally-described edge between two entities.

```ts
Relationship {
  id: string
  sourceId: string              // entity id
  targetId: string              // entity id
  type: string                  // e.g. "knows", "hunts", "owns", "fears"
  description?: string          // story behind the connection
  strength?: number             // 0..1, semantic strength
  createdAt: string
  updatedAt: string
  extensions?: { [namespace: string]: unknown }
}
```

### 1.4 Scene

An ordered narrative beat. Scenes have prose, participants, an optional location, and zero-or-more **frames** (storyboard shots within the scene).

```ts
Scene {
  id: string
  position: number              // ordering within the narrative
  title: string
  prose?: string                // the actual narrative text
  summary?: string              // 1–2 sentence digest
  participantIds: string[]      // entity ids present in the scene
  locationId?: string           // entity id, must be type='location'
  events?: string[]             // key story beats
  stateChanges?: string[]       // how the world changes after this scene
  frames?: Frame[]              // storyboard shots (optional)
  references?: AssetRef[]       // hero image(s) for the scene
  status: 'draft' | 'canon'
  createdAt: string
  updatedAt: string
  extensions?: { [namespace: string]: unknown }
}
```

### 1.5 Frame

A single shot/panel within a scene. Frames are what comic and microdrama renderers iterate over.

```ts
Frame {
  id: string
  position: number              // ordering within the scene
  title?: string
  description?: string          // what happens in this frame
  visualBeat?: string           // visual focus / emotional beat
  shotType?: string             // "wide", "close-up", "medium", "OTS", ...
  camera?: string               // "low angle", "tracking left", ...
  mood?: string                 // emotional register
  participantIds?: string[]     // overrides scene.participantIds if set
  participantRefs?: ParticipantBlocking[]  // per-participant pose/action/expression
  locationId?: string           // overrides scene.locationId if set
  visualDirection?: VisualDirection         // structured composition guidance
  appearanceNotes?: AppearanceNote[]        // per-participant appearance pinning
  dialogue?: string[]
  caption?: string
  sfx?: string[]
  references?: AssetRef[]       // rendered frame image(s)
  extensions?: { [namespace: string]: unknown }
}
```

#### ParticipantBlocking

```ts
ParticipantBlocking {
  entityId?: string             // resolves to an entity if known
  name: string                  // human-readable name (always set)
  action?: string               // "drawing his sword"
  pose?: string                 // "leaning against the wall"
  expression?: string           // "weary smirk"
  placement?: string            // "foreground left"
  notes?: string                // anything else
}
```

#### VisualDirection

```ts
VisualDirection {
  action: string                // primary action of the frame
  composition: string           // "two-shot", "OTS over Mira", ...
  lighting: string              // "harsh midday", "neon underglow", ...
  atmosphere: string            // "tense", "wistful", ...
  environment?: string          // additional scenery notes
}
```

#### AppearanceNote

```ts
AppearanceNote {
  name: string                  // entity name (matches participant)
  details: string               // wardrobe, injury, age cues, etc.
}
```

### 1.6 StyleProfile

Project-level style applied to all generation by default.

```ts
StyleProfile {
  writing?: {
    presetId?: string           // e.g. "cinematic-realism"
    customPrompt?: string
  }
  visual?: {
    presetId?: string           // e.g. "noir-painterly"
    customPrompt?: string
    outputIntent?: VisualOutputIntent     // "cinematic" | "comic" | "illustration" | ...
    textPolicy?: VisualTextPolicy         // "no-text" | "captions-only" | ...
  }
}
```

### 1.7 Scratchpad

Non-canon working memory: world bible documents, character notes, story arcs, references. Pinned documents are surfaced into the AI's context but do not affect the world graph.

```ts
ScratchpadDocument {
  id: string
  title: string
  category: 'world_bible' | 'story_arc' | 'character_notes' | 'reference' | 'other'
  content: string               // markdown
  isPinned: boolean
  source?: 'user' | 'assistant'
  createdAt: string
  updatedAt: string
  extensions?: { [namespace: string]: unknown }
}
```

### 1.8 AssetRef — content-addressable references

**All visual / audio assets in a Nit narrative are referenced by content hash, not by URL.** This is what makes the narrative portable.

```ts
AssetRef {
  sha256: string                // hex-encoded SHA-256 of the asset bytes
  mimeType: string              // "image/png", "image/jpeg", "image/webp", "audio/mp3", ...
  bytes?: number                // size in bytes (informational)
  width?: number                // for images
  height?: number
  duration?: number             // for audio/video, in seconds
  caption?: string              // human-readable description
  source?: AssetSource          // provenance (informational)
  cachedUri?: string            // OPTIONAL hint: a local URL where the implementation
                                // currently happens to serve this asset. NEVER authoritative.
                                // Tools MUST resolve via sha256.
  externalUri?: string          // OPTIONAL: an external URL the asset can be re-fetched from
                                // (e.g. https://, ipfs://). NEVER authoritative.
}

AssetSource {
  generator?: string            // "gemini-3-pro-image-preview" / "user-upload" / ...
  generatedAt?: string          // ISO-8601
  prompt?: string               // generation prompt, if applicable
  references?: string[]         // sha256 hashes of reference images used in generation
}
```

**Resolution semantics:**

1. The `sha256` is the source of truth. Two AssetRefs with the same sha256 are the same asset.
2. `cachedUri` is a convenience hint — a tool may serve `assets/<sha256>.png` at `/api/.../foo.png` and stash that URL here for fast re-display. Other tools ignore it.
3. `externalUri` is for assets that can be re-fetched if missing locally (e.g. an S3 URL or IPFS CID).
4. Tools that do not have the bytes cached locally SHOULD fetch from `externalUri` if present, otherwise raise a "missing asset" error.

### 1.9 Extensions

Every top-level entity (Entity, Scene, Frame, Relationship, ScratchpadDocument) carries an optional `extensions: { [namespace]: unknown }` field. Apps add their own metadata under their own namespace:

```jsonc
"extensions": {
  "comic-generator": { "panelLayout": "splash", "lettering": "serif" },
  "card-game":       { "cardStats": { "hp": 12, "atk": 4 }, "rarity": "rare" },
  "studio":          { "lastImagePrompt": "...", "visualDirty": false }
}
```

**Rules:**
- Tools MUST preserve unknown extension namespaces verbatim through edits and commits.
- Tools SHOULD validate their own namespace's contents but ignore unknown namespaces.
- The reserved namespace `studio` is for the Narrative Studio's runtime hints (e.g. cached image prompts, visual-dirty flags). These are non-normative and other tools may ignore them.

---

## 2. The Repository Layout

A *Nit repository* is a directory whose layout closely mirrors git's `.git/`. The intent is operational familiarity: anyone who's used git can reason about a Nit repo.

```
my-narrative.nit/
├── manifest.json              # repo-level metadata (formatVersion, refs index, asset count)
├── working/
│   └── narrative.json         # the current working state (a Narrative Document, see §1)
├── commits/
│   └── <sha256>.json          # one Commit per file, content-addressable
├── refs/
│   └── heads/
│       ├── main
│       └── alt-timeline
├── assets/
│   └── <sha256>.<ext>         # content-addressable asset store
├── scratchpad/                # markdown documents, mirrors working/narrative.json#scratchpad
│   └── <docId>.md
├── HEAD                       # plain-text: ref name (e.g. "ref: refs/heads/main") or commit hash
└── .nit-version               # plain-text: format version (e.g. "1.0.0")
```

### 2.1 manifest.json

```ts
RepoManifest {
  formatVersion: string         // "1.0.0"
  narrativeId: string           // matches Narrative.metadata.id
  title: string
  description?: string
  branches: BranchSummary[]
  head: { ref?: string; commit?: string }    // ref (branch) OR commit (detached)
  assetIndex: AssetIndexEntry[]              // every asset known to the repo
  createdAt: string
  updatedAt: string
}

BranchSummary {
  name: string
  head: string                  // commit hash
  parentBranch?: string         // branch this was forked from
  parentCommit?: string         // commit forked from
  isCanon?: boolean
  color?: string
  description?: string
  createdAt: string
  updatedAt: string
  merged?: {
    intoBranch: string
    mergeCommit: string         // hash of the merge commit
    at: string                  // ISO-8601
  }
}

AssetIndexEntry {
  sha256: string
  mimeType: string
  bytes: number
  width?: number
  height?: number
  duration?: number
  externalUri?: string          // if missing locally, fetch from here
}
```

### 2.2 refs/

Plain text file, one per branch, contents = commit hash. Identical to git semantics.

### 2.3 HEAD

Plain text. Either:
- `ref: refs/heads/main` — points to a branch (normal mode)
- `<commit-hash>` — detached HEAD (checked out a specific commit)

### 2.4 commits/

One JSON file per commit, named `<commit-hash>.json`. Commit format described in §3.

### 2.5 assets/

Content-addressable blob store. Filename is `<sha256>.<extension>` where the extension matches the mimeType (`image/png` → `.png`, `image/jpeg` → `.jpg`, `image/webp` → `.webp`, `audio/mp3` → `.mp3`, etc.).

### 2.6 working/narrative.json

The current working state. A Narrative Document as defined in §1. This is what consumer apps read; this is what the studio actively edits.

**Invariant:** every `AssetRef.sha256` referenced in `working/narrative.json` MUST exist either in `assets/` locally OR have an `externalUri` set.

---

## 3. Operations & Commits

### 3.1 GraphOperation

Every change to the narrative is expressed as a typed operation.

```ts
type GraphOperation =
  | { type: 'ADD_ENTITY';          payload: Entity }
  | { type: 'UPDATE_ENTITY';       payload: { entityId: string; changes: Partial<Entity> } }
  | { type: 'REMOVE_ENTITY';       payload: { entityId: string; reason?: string } }
  | { type: 'ADD_RELATIONSHIP';    payload: Relationship }
  | { type: 'UPDATE_RELATIONSHIP'; payload: { relationshipId: string; changes: Partial<Relationship> } }
  | { type: 'REMOVE_RELATIONSHIP'; payload: { relationshipId: string; reason?: string } }
  | { type: 'ADD_SCENE';           payload: Scene }
  | { type: 'UPDATE_SCENE';        payload: { sceneId: string; changes: Partial<Scene> } }
  | { type: 'REMOVE_SCENE';        payload: { sceneId: string; reason?: string } }
  | { type: 'REORDER_SCENES';      payload: { orderedSceneIds: string[] } }
  | { type: 'ADD_FRAME';           payload: { sceneId: string; frame: Frame; position: number } }
  | { type: 'UPDATE_FRAME';        payload: { sceneId: string; frameId: string; changes: Partial<Frame> } }
  | { type: 'REMOVE_FRAME';        payload: { sceneId: string; frameId: string } }
  | { type: 'SET_STYLE_PROFILE';   payload: StyleProfile }
  | { type: 'WRITE_SCRATCHPAD';    payload: ScratchpadDocument }
  | { type: 'REMOVE_SCRATCHPAD';   payload: { documentId: string } }
```

Each operation MUST be applicable in isolation and is the unit at which AI agents and tools mutate state.

### 3.2 Commit

```ts
Commit {
  hash: string                  // sha256(canonicalJson({ parentHashes, author, timestamp, message, operations }))
  parentHashes: string[]        // [parent] for normal, [target, source] for merge, [] for root
  author: AuthorRef
  timestamp: number             // unix ms
  message: string
  branch: string                // which branch this commit lives on at creation time

  operations: GraphOperation[]  // the mutations introduced by this commit

  // Derived metadata captured at commit time (informational, not authoritative)
  storyConsistency?: StoryConsistencyReport
  workingTreeHash?: string      // hash of the post-commit working narrative; speeds up checkout

  tags?: string[]
  extensions?: { [namespace: string]: unknown }
}

AuthorRef {
  kind: 'user' | 'ai' | 'system'
  name: string                  // display name
  identifier?: string           // email, public key fingerprint, agent id, etc.
}

StoryConsistencyReport {
  errors: number
  warnings: number
  isConsistent: boolean
  issues?: ContinuityIssue[]
}

ContinuityIssue {
  sceneId: string
  severity: 'error' | 'warning'
  code: string                  // machine-readable error code
  message: string
  entityIds?: string[]          // entities involved
}
```

**Hashing rules:**
- `hash` is SHA-256 of the canonical JSON encoding of everything except `hash`, `workingTreeHash`, and `extensions`.
- Canonical JSON: keys sorted alphabetically, no whitespace, UTF-8.
- `workingTreeHash` is SHA-256 of the canonical JSON of the post-commit `working/narrative.json` (excluding its own `extensions.studio` runtime hints — see §3.3).
- The hash is content-addressable: identical commit content yields the same hash, enabling dedup and integrity verification.

### 3.3 Determinism & Round-Tripping

For `workingTreeHash` to be stable across tools, certain runtime fields are excluded from the hash:

- `extensions.studio.*` (cached image prompts, visual-dirty flags, etc.)
- `cachedUri` on AssetRefs (local serving hints)
- Anything explicitly marked `runtime` in a future schema revision

Tools MUST use the same canonicalisation algorithm. A reference implementation is provided in `@narrative/canon`.

### 3.4 Branches

A branch is a named pointer to a commit hash, stored as a one-line file in `refs/heads/<name>`. Branches additionally carry metadata in `manifest.json#branches` (parent branch, color, canon flag, merge status).

**Creating a branch:**
1. Resolve the source commit (current HEAD or specified)
2. Write `refs/heads/<new-name>` containing that commit's hash
3. Append a `BranchSummary` to `manifest.json#branches`
4. Update `manifest.updatedAt`

**Checkout:**
1. Resolve target (branch name → ref → commit, or directly a commit)
2. Reconstruct `working/narrative.json` from that commit's `workingTreeHash` (or by replaying operations from root, if hash unavailable)
3. Update `HEAD`
4. Refuse if `working/narrative.json` has uncommitted changes; require explicit `--force` or stash

**Merge:**
1. Compute merge base (lowest common ancestor in the commit DAG)
2. Compute three-way diff
3. Detect conflicts (same field changed differently in both branches)
4. Apply non-conflicting changes; require resolution for conflicts
5. Create a merge commit with `parentHashes: [target, source]`
6. Update target branch ref to new merge commit
7. Mark source branch's `BranchSummary.merged` field

---

## 4. Asset Handling

### 4.1 Storing assets

When a tool introduces a new asset (e.g. a generated portrait):

1. Hash the bytes: `sha256 = SHA-256(bytes)`
2. Determine extension from mimeType
3. Write to `assets/<sha256>.<ext>` if not already present
4. Append to `manifest.assetIndex` if not already present
5. Reference the asset elsewhere via `AssetRef { sha256, mimeType, ... }`

### 4.2 Resolving assets

Given an `AssetRef { sha256, mimeType, externalUri? }`:

1. Look up `assets/<sha256>.<ext>` locally → if present, return bytes
2. Otherwise, fetch from `externalUri` if set, store locally, return bytes
3. Otherwise, raise a "missing asset" error to the caller

`cachedUri` is a fast path some tools use to avoid even hitting the asset store (they serve `/api/.../foo.png` directly), but it is never authoritative and other tools MUST NOT rely on it.

### 4.3 Garbage collection

Assets unreferenced by any commit or by `working/narrative.json` MAY be pruned. Tools SHOULD provide a `nit gc` operation. Pruning is optional; storage is cheap; orphan assets do not affect correctness.

---

## 5. Compatibility & Versioning

### 5.1 Format version

The top-level `formatVersion` field is REQUIRED in:
- `manifest.json`
- `working/narrative.json`
- Each commit JSON

The current version is `1.0.0`. Versioning is semver:
- **Major**: incompatible structural changes (consumers must migrate)
- **Minor**: backward-compatible additions (older consumers ignore new fields)
- **Patch**: clarifications, no schema changes

### 5.2 Migration

Each tool MUST refuse to read a `formatVersion` whose major version exceeds what it supports. Migrators are provided as separate utilities (e.g. `@narrative/canon-migrate v1-to-v2`).

### 5.3 Forward compatibility

Tools SHOULD preserve unknown fields verbatim through reads and writes (round-trip safe). Specifically:

- Unknown top-level fields on Narrative, Entity, Scene, etc.
- Unknown extension namespaces
- Unknown operation types in commits (treat as opaque, preserve)

---

## 6. Reading vs Authoring

### 6.1 Read-only consumers

A comic generator, microdrama renderer, or card-game builder typically:

1. Reads `manifest.json` (or `.nit-version`) to verify formatVersion compatibility
2. Reads `working/narrative.json` (or a specific commit if needed)
3. Iterates over `scenes` → `frames` → resolves `participantIds` → `references` → assets
4. Emits its target medium

It does NOT need to understand commits, branches, refs, or operations.

### 6.2 Authors

The Narrative Studio (and any other authoring tool) additionally:

1. Records mutations as `GraphOperation`s
2. Stages and commits them via `nit commit`
3. Manages branches, merges, and conflict resolution
4. Resolves `cachedUri` to its own asset URL scheme for fast in-app rendering

### 6.3 Federated authors

Two studios working on the same narrative push and pull commits via:

1. `nit push <remote>` — uploads commits + assets the remote doesn't have
2. `nit pull <remote>` — downloads new commits + assets, attempts merge if local diverged
3. AI conflict resolution available as an opt-in hook

---

## 7. Operations Vocabulary (recommended)

To improve interoperability across tools, the following relationship types and shot types are RECOMMENDED. Tools MAY use other values; consumers SHOULD handle unknown values gracefully.

### 7.1 Relationship types
`knows`, `loves`, `fears`, `hunts`, `betrayed`, `created`, `serves`, `commands`, `owns`, `inhabits`, `rivals`, `allies_with`, `parent_of`, `child_of`, `sibling_of`, `married_to`, `mentor_of`, `secretly_knows`.

### 7.2 Shot types
`establishing`, `wide`, `medium`, `medium-wide`, `medium-close`, `close-up`, `extreme-close-up`, `over-the-shoulder`, `point-of-view`, `two-shot`, `insert`.

### 7.3 Camera moves
`static`, `pan-left`, `pan-right`, `tilt-up`, `tilt-down`, `tracking`, `dolly-in`, `dolly-out`, `crane`, `handheld`, `aerial`.

### 7.4 Visual output intents
`cinematic`, `comic`, `illustration`, `photoreal`, `concept-art`, `storyboard-sketch`.

---

## 8. Reference Implementation

The reference implementation lives in [`src/git/format/v1/`](../src/git/format/v1) of `@narrative/canon`:

- `schemas.ts` — zod schemas for every type in this spec
- `types.ts` — TypeScript types derived from the schemas
- `validate.ts` — `validateNarrative()`, `validateRepository()`, `validateCommit()` helpers
- `canonicalize.ts` — canonical JSON serialisation for hashing
- `migrate-from-studio.ts` — converts the studio's current `.narrative-data/project_*.json` shape into v1 format

---

## 9. Open Questions

These are deliberately left for v1.1 or later:

- **Audio assets** for microdrama: clip references on frames, voice samples per character. Schema sketched in `AssetRef.duration` but not fully specified.
- **Localisation**: per-locale prose / titles. Likely an `i18n` extension namespace in v1; promoted to first-class in v2.
- **Cryptographic signing** of commits: `AuthorRef.identifier` could carry a public key fingerprint, with signature stored in `Commit.extensions.signing`. Not required in v1.
- **Push/pull wire protocol**: commit + asset transfer over HTTP. Spec'd separately in `NIT_PROTOCOL_SPEC.md` (TBD).
- **Plot structure overlays** (act/sequence/scene hierarchies): probably an extension namespace; promoted if widely adopted.

---

## Changelog

- **1.0.0-draft** (2026-04-30): Initial draft based on the Narrative Studio's live data shape, with content-addressable assets, proper commit DAG, frames-within-scenes, scratchpad, and style profiles.

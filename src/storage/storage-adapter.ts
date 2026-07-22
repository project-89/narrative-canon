/**
 * Storage Adapter Interface
 *
 * Defines the contract for storage backends (file-based, MongoDB, etc.)
 * All storage operations are async to support both local and remote backends.
 */

export interface ConversationHistory {
  messages: any[];
  worldContext: {
    themes: string[];
    tone: string;
    influences: string[];
  };
  currentFocus: string[];
  userDecisions: any[];
  lastUpdated: number;
  /** T0b (Canon rail substrate): pending proposals survive restarts. Was
   *  memory-only on the session — a reload silently emptied the review queue. */
  pendingProposals?: any[];
}

export interface ScratchpadDocument {
  id: string;
  title: string;
  content: string;
  category: 'world_bible' | 'story_arc' | 'character_notes' | 'reference' | 'other';
  isPinned: boolean;
  source?: 'user' | 'assistant' | 'system';
  createdAt: number;
  updatedAt: number;
}

/** Uploaded asset metadata. Source files live on disk (or storage backend);
 *  this record points at them and carries the user-curated metadata.
 *  category 'style' = visual style reference; 'character/scene/location/object'
 *  = subject reference material; 'reference' = anything else useful for AI
 *  context; 'other' = catch-all. */
export interface Asset {
  id: string;
  category: 'character' | 'scene' | 'location' | 'object' | 'style' | 'reference' | 'other';
  name: string;
  description?: string;
  tags?: string[];
  url: string;
  mimeType: string;
  originalFilename: string;
  fileSize: number;
  width?: number;
  height?: number;
  uploadedAt: number;
  linkedEntityIds?: string[];
  linkedSceneIds?: string[];
}

/** Script document — the writing surface of the project, following the
 *  standard scriptwriting flow in 10 stages. Each stage is independently
 *  editable; downstream stages snapshot from upstream with explicit resync
 *  (no live linking, by design — locked in STUDIO_DESIGN.md). */
export interface ProjectScript {
  /** Stage 1 — single canonical sentence. */
  logline?: string;
  /** Stage 2 — short character descriptions, optionally linked to entities. */
  characterSummaries?: Array<{
    id: string;
    name: string;
    summary: string;
    linkedEntityId?: string;
    updatedAt?: number;
  }>;
  /** Stage 3 — paragraph or two of the story. Snapshots from logline. */
  synopsis?: string;
  /** Stage 4 — four paragraphs, one per act. Snapshots from synopsis. */
  actSummaries?: {
    act1?: string;
    act2a?: string;
    act2b?: string;
    act3?: string;
  };
  /** Stage 5 — bullet points per act, specific story points. */
  actBreakdowns?: {
    act1?: string[];
    act2a?: string[];
    act2b?: string[];
    act3?: string[];
  };
  /** Stage 6 — deeper character work. Linked + resyncable with entities. */
  characterList?: Array<{
    id: string;
    name: string;
    description?: string;
    arc?: string;
    motivations?: string;
    linkedEntityId?: string;
    updatedAt?: number;
  }>;
  /** Stage 7 — narrative beats at positions (Save the Cat style or custom). */
  beatSheet?: Array<{
    id: string;
    label: string;
    position?: number;
    description?: string;
  }>;
  /** Stage 8 — theme exploration. No upstream dependency. */
  theme?: string;
  /** Stage 9 — 30-40 scenes as orderable cards. Each pitch can be promoted
   *  to a production Scene (snapshot + resync model). */
  sceneList?: Array<{
    id: string;
    number?: number;
    pitch: string;
    linkedSceneId?: string;
    lastResyncedAt?: number;
  }>;
  /** Stage 10 — long-form prose. */
  write?: string;
  updatedAt?: number;
}

/** Acts are the top-level organizing unit of the story — broad sweeping
 *  arcs that contain scenes. Each scene belongs to at most one act via
 *  `scene.actId`. The Storyboard phase visualises Acts → Scenes → Shots.
 *  Scenes without an actId render in an "Unassigned" bucket. */
export interface ProjectAct {
  id: string;
  title: string;
  /** The sweeping arc description — what the act is about, where the
   *  characters start, where they end up, the change inside this stretch. */
  arc?: string;
  /** Order index among all acts. Lower = earlier in the story. */
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Timeline track — a horizontal row of clips. Most projects start with
 *  a single video track; users can add more (audio, alt-cuts, captions). */
export interface ProjectTimelineTrack {
  id: string;
  name: string;
  /** What kind of content this track holds. The Production timeline is
   *  primarily 'video'; we leave room for 'audio', 'caption', 'note'. */
  kind: 'video' | 'audio' | 'caption' | 'note';
  /** Display order (top-to-bottom in the editor). */
  order: number;
  /** Whether the track is muted/disabled in playback. */
  muted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Timeline clip — a placement of a source asset (currently always a
 *  shot/frame) on a track at a specific position with a duration. */
export interface ProjectTimelineItem {
  id: string;
  trackId: string;
  /** What kind of source this clip references. For now, all clips are
   *  shots (frames within a scene). Future: 'audio', 'caption'. */
  sourceType: 'shot';
  /** ID of the source shot's parent scene. */
  sourceSceneId: string;
  /** ID of the source shot (= SceneFrame.id). */
  sourceShotId: string;
  /** Ordering within the track. Lower = earlier. The startSec is derived
   *  from preceding items' durations; we don't store absolute time. */
  order: number;
  /** How long this clip plays for (seconds). Defaults to the shot's
   *  durationSec or 5. Per-clip override lets the editor stretch/compress
   *  without affecting the underlying shot. */
  durationSec: number;
  /** Optional notes/label for the clip in the timeline UI. */
  label?: string;
  /** VIRTUAL CHOP (P2/P3). When set, the clip plays THIS source video over
   *  [inSec, outSec) instead of the shot's own `frame.video`. Used both for
   *  single-clip in/out trim (the source is the shot's video) and for
   *  multi-shot sequence chop (the source is a scene's `sequenceVideo`, shared
   *  by every clip in the run). Absent → resolve the shot's own video. */
  sourceVideoUrl?: string;
  /** In-point: offset (seconds) into the source video where this clip starts.
   *  Default 0. */
  inSec?: number;
  /** Out-point: offset (seconds) into the source video where this clip ends.
   *  Default inSec + durationSec. INVARIANT: durationSec === outSec - inSec —
   *  the timeline footprint always equals the played length. */
  outSec?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Project timeline — the editing-line for Production phase. */
export interface ProjectTimeline {
  tracks: ProjectTimelineTrack[];
  items: ProjectTimelineItem[];
  /** Playback rate in seconds per real-time second. Default 1.0. */
  playbackRate?: number;
  updatedAt?: number;
}

/** A production — one deliverable (film, comic issue, episode) inside the
 *  world. T0a-WORLD (TRANSMEDIA_INTEGRATION_REVIEW §9): the project is the
 *  WORLD/campaign; productions are ADDITIVE — scenes/acts carry an optional
 *  `productionId`, and the DEFAULT production (id `prod_default`) owns
 *  everything untagged plus the legacy top-level `script`/`timeline`, so
 *  existing projects need zero data migration. Non-default productions carry
 *  their own `script`/`timeline` here. */
export interface ProjectProduction {
  id: string;
  title: string;
  format: 'film' | 'comic' | 'episode';
  createdAt: string;
  updatedAt?: string;
  /** Non-default productions own their script here (default uses ProjectData.script). */
  script?: ProjectScript;
  /** Non-default productions own their timeline here (default uses ProjectData.timeline). */
  timeline?: ProjectTimeline;
  /** Arc(s) this production advances — ProjectArc.ids. */
  arcIds?: string[];
  /** The Autonomy Dial (REVIEW §9 / roadmap): how much human is in the loop
   *  for THIS production. `direct` = human drives, agent assists (default);
   *  `review` = agent produces, human gates each phase; `autonomous` = agent
   *  runs unattended within budget + QC, morning report. Stored from T0b so
   *  the dial is a first-class property; ENFORCED by hooks/scheduler at T3. */
  autonomy?: 'direct' | 'review' | 'autonomous';
  /** Budget cap for autonomous runs on this production (paid clips/renders
   *  per run — same unit as dream_film's maxClips). */
  autonomyBudget?: number;
  /** T1-COMIC: the production's comic pages (format 'comic'). Whole-page
   *  generations with HITL keep/reject; superseded renders accumulate in
   *  takes (nothing generated is ever lost). */
  comicPages?: Array<{
    id: string;
    pageNumber: number;
    sceneId?: string;
    brief: string;
    imageUrl?: string;
    prompt?: string;
    status: 'draft' | 'kept' | 'rejected';
    takes?: Array<{ imageUrl: string; prompt?: string; generatedAt: string }>;
    generatedAt?: string;
    updatedAt?: string;
  }>;
  /** T1-COMIC: last PDF export of this production's comic. */
  lastComicExport?: { fileName: string; url: string; pageCount: number; exportedAt: string };
}

/** A long-range narrative arc spanning productions (the fork-into-arc
 *  substrate — REVIEW §9.2). An arc is an INTENTION: a thesis about the
 *  world, tracked against what has actually been rendered into canon. */
export interface ProjectArc {
  id: string;
  title: string;
  /** The dramatic claim, e.g. "Aria discovers the pattern". */
  thesis: string;
  entityIds: string[];
  /** Desired end-states, e.g. "Aria: knows about the Loom". */
  targetStates?: string[];
  productionIds: string[];
  /** Set when the arc was forked from a divergence (conflict-as-content). */
  branchName?: string;
  sourceCommitId?: string;
  status: 'seed' | 'active' | 'resolved' | 'abandoned';
  /** 0..1 — how much of the thesis has become canon. */
  canonProgress?: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

/** C1 (CHRONICLE_DESIGN.md): a media-agnostic happening on the UNIVERSE
 *  chronology (valid time). World-scoped. Scenes in ANY production
 *  dramatize events via scene.eventLinks — a shared eventId across two
 *  productions IS true transmedia. Events enter the hashed nit schema at
 *  C1.5; until then they are blob-only (the ledger does not see them). */
export interface WorldEvent {
  id: string;
  /** Universe time (valid time). Defaults to arrival order. */
  chronologyIndex: number;
  /** Universe fork (grey/green looms). Absent = the canon timeline. */
  timelineId?: string;
  title: string;
  description?: string;
  entityIds: string[];
  /** Typed state deltas — feed worldStateAt() and deterministic conflict
   *  checks (C1.5). */
  stateChanges?: Array<{
    entityId: string;
    kind: 'died' | 'born' | 'introduced' | 'learned' | 'acquired' | 'lost' | 'moved' | 'transformed' | 'custom';
    detail?: string;
  }>;
  /** Explicit requirements (LLM-checked tier, C4). */
  preconditions?: string[];
  arcId?: string;
  /** Draft/canon on the SHARED timeline; canonization gates (creator|vote|rule) flip it. */
  status: 'draft' | 'canon';
  /** Two-way media: the production/telling that birthed this event. */
  sourceProductionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectData {
  entities: any[];
  relationships: any[];
  commits: any[];
  branches: any[];
  interactions: any[];
  documents: ScratchpadDocument[];
  /** Diegetic media objects — Time covers, articles, memos, social posts, etc.
   *  See createEmptyProjectData() for the empty default. */
  artifacts?: any[];
  /** User-uploaded reference assets — character sheets, location refs, style
   *  references, etc. Separate from artifacts (which are in-universe media). */
  assets?: Asset[];
  /** Registry of EVERY generated image, recorded at creation time so nothing is
   *  wasted — including free-form /render outputs not attached to any entity/
   *  scene/frame/artifact. Surfaced in the Assets > Generated tab (deduped
   *  against the entity/frame/artifact rollup by url). */
  generatedImages?: Array<{ id: string; url: string; sourceType?: string; prompt?: string; backend?: string; mimeType?: string; generatedAt?: string }>;
  /** Script document — see ProjectScript. */
  script?: ProjectScript;
  /** Acts — top-level story arcs that group scenes. New in stage 2 of the
   *  pipeline restructure. Scenes link via `scene.actId`. */
  acts?: ProjectAct[];
  /** Editing timeline — the Production phase's primary surface. Tracks of
   *  clips that reference shots. New in stage 3 of the pipeline restructure. */
  timeline?: ProjectTimeline;
  storyGraph?: any;
  conversationHistory?: ConversationHistory;
  /** T0a-WORLD: the world's productions. Lazily initialized — absent means
   *  the project predates multi-production and everything belongs to the
   *  default production. */
  productions?: ProjectProduction[];
  /** Which production tools/UI operate on when no explicit productionId is
   *  passed. Defaults to the default production. */
  activeProductionId?: string;
  /** T0a-WORLD: long-range arcs spanning productions. */
  arcs?: ProjectArc[];
  /** C1: the world's events — the universe chronology (valid time). */
  events?: WorldEvent[];
}

export interface ProjectStats {
  entities: number;
  relationships: number;
  commits: number;
  branches: number;
}

export interface ProjectStyleProfile {
  presetId?: string;
  presetName?: string;
  narrativePresetId?: string;
  narrativePresetName?: string;
  visualPresetId?: string;
  visualPresetName?: string;
  narrativePrompt?: string;
  visualPrompt?: string;
  /** Asset IDs (from ProjectData.assets) that should be auto-attached as
   *  reference images on every /render call. Lets a project pin its visual
   *  style references once and have them propagate to all generations. */
  styleAssetIds?: string[];
  /** Default aspect ratio for image generation across the project. Used
   *  when the caller doesn't pass one explicitly. Lets a microdrama
   *  project default everything to 9:16 (vertical), a cinematic project to
   *  21:9, a square-feed project to 1:1, etc. Defaults to "16:9" if unset. */
  aspectRatio?: string;
  /** Default image model for the project. Routes through to /render and the
   *  templated portrait endpoint. Supported values:
   *  - "nano-banana"           → Gemini 3.1 Flash Image Preview (NB2) [default]
   *  - "nano-banana-pro"       → Gemini 3 Pro Image Preview
   *  - "nano-banana-legacy"    → Gemini 2.5 Flash Image (legacy fast)
   *  - "gpt-image"             → OpenAI gpt-image-2/-1
   *  Caller-level overrides still win per call. */
  imageModel?: string;
  updatedAt?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
  stats: ProjectStats;
  color: string;
  styleProfile?: ProjectStyleProfile;
}

export interface StorageAdapter {
  // Project operations
  loadProjects(): Promise<Project[]>;
  saveProjects(projects: Project[]): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  createProject(project: Omit<Project, 'id'> & { id?: string }): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;

  // Project data operations
  loadProjectData(projectId: string): Promise<ProjectData>;
  saveProjectData(projectId: string, data: ProjectData): Promise<void>;

  // Convenience methods
  getActiveProject(): Promise<Project | null>;
  setActiveProject(projectId: string): Promise<void>;

  // Health check
  isHealthy(): Promise<boolean>;

  // Cleanup
  close?(): Promise<void>;
}

// Default empty project data
export function createEmptyProjectData(): ProjectData {
  return {
    entities: [],
    relationships: [],
    commits: [],
    branches: [
      {
        id: 'main',
        name: 'main',
        description: 'The canonical timeline',
        color: '#22c55e',
        isActive: true,
        isCanon: true,
        probability: 1.0,
        commitCount: 0,
        lastCommit: 'never',
        createdAt: new Date().toISOString(),
      }
    ],
    interactions: [],
    documents: [],
    artifacts: [],
    assets: [],
    script: {},
    acts: [],
    timeline: { tracks: [], items: [] },
  };
}

// Default demo project
export function createDefaultProject(): Project {
  return {
    id: 'demo',
    name: 'Demo Universe',
    description: 'A sample narrative universe to explore the workbench features',
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 2 * 60 * 60 * 1000,
    isActive: true,
    stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
    color: '#06b6d4',
    styleProfile: {
      presetId: 'cinematic-concept',
      presetName: 'Cinematic Concept',
      narrativePresetId: 'cinematic-concept',
      narrativePresetName: 'Cinematic Concept',
      visualPresetId: 'cinematic-concept',
      visualPresetName: 'Cinematic Concept',
      narrativePrompt: 'Cinematic prose with concrete sensory detail, emotional clarity, and clear cause/effect transitions.',
      visualPrompt: 'Concept art with natural lighting, grounded anatomy, atmospheric depth, and strong environmental storytelling.',
      updatedAt: Date.now(),
    },
  };
}

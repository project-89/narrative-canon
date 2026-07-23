"use client";

/**
 * WorldTimeline — the World mode's canvas, INSIDE the studio shell.
 *
 * Michael's correction #2: the world view must INHERIT the studio experience
 * — its real chat (context-aware, push layout), its entity workbench, its
 * navigation — not run a parallel copy. So this component is ONLY the
 * timeline canvas + coverage panel; the studio provides chat, entities,
 * header, and world selection (StorySwitcher). Descending into a production
 * happens in-app (no page reload) via onDescend.
 *
 * The canvas is a React Flow GIT-GRAPH of the universe chronology:
 * the CANON SPINE is the main line (event nodes at y=0, x = chronology
 * order); each production is a BRANCH below it — a label node at the
 * branch's start, a divergence bezier from its first covered event, and a
 * horizontal run of commit dots under each covered event (the branch line's
 * horizontal extent = the chronology span that production covers).
 * Hovering an event dot floats a card with its description + up to three
 * artifact thumbnails (coverage fetched lazily, cached per event).
 */

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  NodeToolbar,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Milestone, Link2, Loader2, RefreshCw, Film, BookOpen, Tv, Users,
  CheckCircle2, CircleDashed, AlertTriangle, ArrowRight, Sparkles, GitBranch, Clapperboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
const FORMAT_ICONS = { film: Film, comic: BookOpen, episode: Tv } as const;
const STAGE_STYLE: Record<string, string> = {
  empty: "border-gray-600/40 bg-gray-700/20 text-gray-500",
  drafting: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  producing: "border-cyan-400/40 bg-cyan-500/15 text-cyan-300",
  exported: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
};

export interface WorldEventLite { id: string; chronologyIndex: number; title: string; description?: string; entityIds: string[]; status: "draft" | "canon"; arcId?: string; sourceProductionId?: string; }
interface Lane { productionId: string; title: string; format: "film" | "comic" | "episode"; eventIds: string[]; sceneCount: number; renderedScenes: number; keptPages: number; draftEvents: number; stage: string; autonomy: string; }
interface Arc { id: string; title: string; status: string; minIndex: number | null; maxIndex: number | null; }
interface PickerScene { id: string; title: string; productionId: string; linked: boolean; }

interface WorldTimelineProps {
  projectId: string | null;
  /** Bumped by the parent when the agent (or anything) may have changed the world. */
  refreshToken?: number;
  /** Descend into a production (parent switches production + leaves world mode — no reload). */
  onDescend: (productionId: string) => void;
  /** Open the studio's full-screen entity management. */
  onOpenEntities: () => void;
  /** Selected event changes — the parent feeds this to the agent's context. */
  onSelectedEvent?: (event: WorldEventLite | null) => void;
  onOpenScene?: (sceneId: string) => void;
}

/* ================= GIT-GRAPH GEOMETRY ================= */
const SLOT = 240;            // equal x slot per chronology position
const PAD = 80;              // x of the first event dot's center
const EVENT_W = 180;         // event node width (dot centered)
const DOT_Y = 14;            // dot center y inside the event node (w-7 dot)
const LANE_Y0 = 140;         // first branch lane y  (y = 140 + laneIndex*110)
const LANE_STEP = 110;       // per-lane y step
const BRANCH_LABEL_W = 260;  // branch label node width
const BRANCH_LABEL_H = 40;   // branch label node height (h-10)
const COMMIT_R = 6;          // commit dot radius (12px circle)
const SPINE_STROKE = "rgba(16,185,129,0.55)";
const FORMAT_HUES: Record<string, string> = {
  film: "34,211,238",     // cyan  #22d3ee
  comic: "56,189,248",    // sky   #38bdf8
  episode: "192,132,252", // purple #c084fc
};
const HIDDEN_HANDLE: CSSProperties = {
  opacity: 0, width: 6, height: 6, minWidth: 0, minHeight: 0,
  border: "none", background: "transparent", pointerEvents: "none",
};

const xAt = (i: number) => PAD + i * SLOT;

/* ================= CUSTOM NODES ================= */

type EventNodeData = {
  event: WorldEventLite;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  fetchCoverage: (eventId: string) => Promise<any | null>;
};

/** Canon-spine event: dot + title + caption; hover floats a card with the
 *  description and up to 3 dramatization/comic thumbnails (lazy coverage). */
function WorldEventNode({ data }: NodeProps) {
  const { event, isSelected, onSelect, fetchCoverage } = data as unknown as EventNodeData;
  const [hovered, setHovered] = useState(false);
  const [cov, setCov] = useState<any | null | undefined>(undefined); // undefined = not fetched yet
  const fetching = useRef(false);

  const handleEnter = () => {
    setHovered(true);
    if (cov === undefined && !fetching.current) {
      fetching.current = true;
      fetchCoverage(event.id).then((d) => { setCov(d ?? null); fetching.current = false; });
    }
  };

  const thumbs: string[] = [];
  if (cov) {
    for (const d of cov.dramatizations || []) if (d.imageUrl) thumbs.push(d.imageUrl);
    for (const p of cov.comicPages || []) if (p.imageUrl) thumbs.push(p.imageUrl);
  }
  const thumbUrls = thumbs.slice(0, 3).map((u) => (u.startsWith("/") ? `${API_BASE}${u}` : u));

  return (
    <div className="flex flex-col items-center" style={{ width: EVENT_W }}
      onMouseEnter={handleEnter} onMouseLeave={() => setHovered(false)}>
      <NodeToolbar isVisible={hovered} position={Position.Top} offset={10}>
        <div className="w-72 rounded-xl border border-white/15 bg-slate-900/95 shadow-xl shadow-black/50 p-3 pointer-events-none">
          <div className="text-xs text-gray-200 font-medium mb-1">{event.title}</div>
          {event.description && (
            <div className="text-[11px] text-gray-400 leading-snug line-clamp-4">{event.description}</div>
          )}
          <div className="mt-2">
            {cov === undefined ? (
              <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                <Loader2 className="w-3 h-3 animate-spin" /> looking up tellings…
              </div>
            ) : thumbUrls.length > 0 ? (
              <div className="flex gap-1.5">
                {thumbUrls.map((u, i) => (
                  <img key={i} src={u} alt="" className="w-[84px] h-14 rounded-md object-cover border border-white/10" />
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-gray-600">no rendered artifacts yet</div>
            )}
          </div>
        </div>
      </NodeToolbar>

      {/* spine handles sit at the dot's edges; the bottom handle feeds branch divergence */}
      <Handle id="in" type="target" position={Position.Left} isConnectable={false}
        style={{ ...HIDDEN_HANDLE, left: EVENT_W / 2 - 14, top: DOT_Y }} />
      <Handle id="out" type="source" position={Position.Right} isConnectable={false}
        style={{ ...HIDDEN_HANDLE, right: EVENT_W / 2 - 14, top: DOT_Y }} />
      <Handle id="down" type="source" position={Position.Bottom} isConnectable={false} style={HIDDEN_HANDLE} />

      <button onClick={() => onSelect(isSelected ? null : event.id)} className="w-full flex flex-col items-center gap-2 group">
        <span className="relative">
          <span className={cn(
            "block w-7 h-7 rounded-full border-[3px] transition-all group-hover:scale-110 shadow-lg",
            event.status === "canon"
              ? (isSelected ? "bg-emerald-300 border-emerald-100 shadow-emerald-500/40" : "bg-emerald-500 border-emerald-300 shadow-emerald-500/25")
              : (isSelected ? "bg-amber-500/30 border-amber-300" : "bg-transparent border-amber-500/80")
          )} />
          {event.sourceProductionId && (
            <span className="absolute -top-1.5 -right-2.5 w-4 h-4 rounded-full border border-white/20 bg-slate-900 text-[9px] text-amber-300 flex items-center justify-center"
              title="born on a production branch">⎇</span>
          )}
        </span>
        <span className={cn("text-xs leading-snug text-center line-clamp-2 px-1", isSelected ? "text-white" : "text-gray-400 group-hover:text-gray-200")}>
          {event.title}
        </span>
        <span className="text-[10px] text-gray-600">t={event.chronologyIndex} · {event.status}</span>
      </button>
    </div>
  );
}

type BranchNodeData = {
  lane: Lane;
  hasSpan: boolean;
  onDescend: (productionId: string) => void;
};

/** Branch label at the branch's start — the lane's identity + descend button. */
function BranchLabelNode({ data }: NodeProps) {
  const { lane, hasSpan, onDescend } = data as unknown as BranchNodeData;
  const Icon = FORMAT_ICONS[lane.format] || Film;
  return (
    <div className="relative" style={{ width: BRANCH_LABEL_W }}>
      <Handle id="in" type="target" position={Position.Top} isConnectable={false} style={HIDDEN_HANDLE} />
      <Handle id="out" type="source" position={Position.Right} isConnectable={false} style={HIDDEN_HANDLE} />
      <button
        onClick={() => onDescend(lane.productionId)}
        className="w-full flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/90 px-3 hover:border-cyan-400/50 group"
        style={{ height: BRANCH_LABEL_H }}
        title={`Open "${lane.title}" in its authorship space`}
      >
        <Icon className="w-4 h-4 text-cyan-300 shrink-0" />
        <span className="text-sm text-gray-200 truncate">{lane.title}</span>
        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border shrink-0", STAGE_STYLE[lane.stage] || STAGE_STYLE.empty)}>
          {lane.stage}
        </span>
        {lane.draftEvents > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-300 flex items-center gap-1 shrink-0"
            title="Unmerged branch: draft events awaiting validation into canon">
            <GitBranch className="w-2.5 h-2.5" />branch · {lane.draftEvents}
          </span>
        )}
        <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-cyan-300 ml-auto shrink-0" />
      </button>
      {!hasSpan && (
        <div className="absolute left-1 top-full mt-1 text-[10px] text-gray-600 whitespace-nowrap">
          {lane.sceneCount} scene(s), none placed on the chronology yet
        </div>
      )}
    </div>
  );
}

/** Tiny commit dot on a branch run, under a covered event's x-position. */
function CommitDotNode({ data }: NodeProps) {
  const { hue } = data as unknown as { hue: string };
  return (
    <div className="relative" style={{ width: COMMIT_R * 2, height: COMMIT_R * 2 }}>
      <Handle id="in" type="target" position={Position.Left} isConnectable={false} style={HIDDEN_HANDLE} />
      <div className="w-full h-full rounded-full"
        style={{ background: `rgba(${hue},0.9)`, boxShadow: "0 0 0 2px #0b0a12" }} />
      <Handle id="out" type="source" position={Position.Right} isConnectable={false} style={HIDDEN_HANDLE} />
    </div>
  );
}

/** Arc band above the spine, spanning the arc's chronology range. */
function ArcBandNode({ data }: NodeProps) {
  const { arc, width } = data as unknown as { arc: Arc; width: number };
  return (
    <div style={{ width }}
      className="h-6 rounded-full border border-purple-400/40 bg-purple-500/10 text-purple-300 text-[11px] px-3 flex items-center truncate"
      title={`Arc: ${arc.title} (${arc.status})`}>
      {arc.title}
    </div>
  );
}

const NODE_TYPES = {
  event: WorldEventNode,
  branch: BranchLabelNode,
  commit: CommitDotNode,
  arcBand: ArcBandNode,
};

export function WorldTimeline({ projectId, refreshToken = 0, onDescend, onOpenEntities, onSelectedEvent, onOpenScene }: WorldTimelineProps) {
  const [events, setEvents] = useState<WorldEventLite[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [scenePicker, setScenePicker] = useState<PickerScene[]>([]);
  const [unlinked, setUnlinked] = useState(0);
  const [entityCount, setEntityCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkSceneId, setLinkSceneId] = useState("");
  const [creatingTelling, setCreatingTelling] = useState(false);
  /** Per-event coverage cache for the hover cards (lazy, cleared on reload). */
  const coverageCacheRef = useRef<Map<string, any>>(new Map());

  const load = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    coverageCacheRef.current.clear();
    try {
      const res = await fetch(`${API_BASE}/api/narrative/chronicle?projectId=${encodeURIComponent(projectId)}`);
      if (res.ok) {
        const d = await res.json();
        setEvents(d.events || []);
        setLanes(d.lanes || []);
        setArcs(d.arcs || []);
        setScenePicker(d.scenePicker || []);
        setUnlinked(d.unlinkedSceneCount || 0);
      }
      const er = await fetch(`${API_BASE}/api/narrative/entities?projectId=${encodeURIComponent(projectId)}`);
      if (er.ok) setEntityCount(((await er.json()) || []).length);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const selectEvent = useCallback(async (id: string | null) => {
    setSelectedId(id);
    setCoverage(null);
    const event = events.find(e => e.id === id) || null;
    onSelectedEvent?.(event);
    if (!id || !projectId) return;
    try {
      const res = await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(id)}/coverage?projectId=${encodeURIComponent(projectId)}`);
      if (res.ok) {
        const d = await res.json();
        setCoverage(d);
        coverageCacheRef.current.set(id, d); // seed the hover cache too
      }
    } catch { /* panel shows empty */ }
  }, [events, projectId, onSelectedEvent]);

  /** Lazy per-event coverage for hover cards — fetched once, cached in a ref. */
  const fetchHoverCoverage = useCallback(async (eventId: string) => {
    const cached = coverageCacheRef.current.get(eventId);
    if (cached) return cached;
    if (!projectId) return null;
    try {
      const res = await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(eventId)}/coverage?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) return null;
      const d = await res.json();
      coverageCacheRef.current.set(eventId, d);
      return d;
    } catch { return null; }
  }, [projectId]);

  const linkScene = async () => {
    if (!selectedId || !linkSceneId || !projectId) return;
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(selectedId)}/link-scene`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId: linkSceneId }),
      });
      setLinkSceneId("");
      await load();
      await selectEvent(selectedId);
    } finally { setBusy(false); }
  };

  /** Any node → a new telling: production created + activated + a seeded,
   *  event-linked scene — then descend IN-APP via the parent. */
  const newTellingFrom = async (event: WorldEventLite, format: "film" | "comic" | "episode") => {
    if (!projectId) return;
    setCreatingTelling(true);
    try {
      const pr = await fetch(`${API_BASE}/api/narrative/productions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: `${event.title.slice(0, 40)} — ${format}`, format }),
      });
      if (!pr.ok) return;
      const { production } = await pr.json();
      await fetch(`${API_BASE}/api/narrative/productions/${encodeURIComponent(production.id)}/activate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const sr = await fetch(`${API_BASE}/api/narrative/interactions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: event.title, description: event.description, participantIds: event.entityIds }),
      });
      if (sr.ok) {
        const sd = await sr.json();
        const sceneId = (sd.interaction || sd)?.id;
        if (sceneId) {
          await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(event.id)}/link-scene`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, sceneId }),
          });
        }
      }
      onDescend(production.id);
    } finally {
      setCreatingTelling(false);
    }
  };

  /* ================= GIT-GRAPH BUILD =================
     The CANON SPINE is the main line (event nodes at y=0); each production
     is a branch below it, diverging from its first covered event to a label
     node, then running horizontally with a commit dot under EACH covered
     event — the branch's extent IS the chronology span it covers. */
  const graph = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // arc bands above the spine
    arcs.filter(a => a.minIndex !== null).forEach((arc) => {
      const from = events.findIndex(e => e.chronologyIndex === arc.minIndex);
      const to = events.findIndex(e => e.chronologyIndex === arc.maxIndex);
      if (from < 0 || to < 0) return;
      nodes.push({
        id: `arc-${arc.id}`, type: "arcBand",
        position: { x: xAt(from) - 40, y: -84 },
        data: { arc, width: (to - from) * SLOT + 80 },
        draggable: false, selectable: false, zIndex: 0,
      });
    });

    // the canon spine: event nodes + consecutive edges (arrowhead on the last)
    events.forEach((e, i) => {
      nodes.push({
        id: e.id, type: "event",
        position: { x: xAt(i) - EVENT_W / 2, y: 0 },
        data: { event: e, isSelected: e.id === selectedId, onSelect: selectEvent, fetchCoverage: fetchHoverCoverage },
        style: { width: EVENT_W },
        draggable: false, selectable: true,
      });
      if (i > 0) {
        edges.push({
          id: `spine-${i}`,
          source: events[i - 1].id, sourceHandle: "out",
          target: e.id, targetHandle: "in",
          type: "straight",
          style: { stroke: SPINE_STROKE, strokeWidth: 2.5 },
          markerEnd: i === events.length - 1
            ? { type: MarkerType.ArrowClosed, color: SPINE_STROKE, width: 14, height: 14 }
            : undefined,
        });
      }
    });

    // production branches below
    const visibleLanes = lanes.filter(l => l.sceneCount > 0 || l.eventIds.length > 0 || l.stage !== "empty");
    visibleLanes.forEach((lane, li) => {
      const laneY = LANE_Y0 + li * LANE_STEP;
      const idxs = lane.eventIds
        .map(id => events.findIndex(e => e.id === id))
        .filter(i => i >= 0)
        .sort((a, b) => a - b);
      const hasSpan = idxs.length > 0;
      const startIdx = hasSpan ? idxs[0] : 0;
      const hue = FORMAT_HUES[lane.format] ?? FORMAT_HUES.film;
      const edgeColor = `rgba(${hue},0.35)`;
      const dash = lane.draftEvents > 0 ? "5 4" : undefined;
      const labelId = `branch-${lane.productionId}`;

      nodes.push({
        id: labelId, type: "branch",
        position: { x: xAt(startIdx) - BRANCH_LABEL_W - 40, y: laneY },
        data: { lane, hasSpan, onDescend },
        style: { width: BRANCH_LABEL_W },
        draggable: false, selectable: false,
      });
      if (!hasSpan) return;

      // divergence: first covered event → branch label (bezier, format color)
      edges.push({
        id: `div-${lane.productionId}`,
        source: events[startIdx].id, sourceHandle: "down",
        target: labelId, targetHandle: "in",
        type: "default",
        style: { stroke: edgeColor, strokeWidth: 2, strokeDasharray: dash },
      });

      // horizontal run: label → commit dot under each covered event, in sequence
      let prevId = labelId;
      idxs.forEach((idx, k) => {
        const dotId = `commit-${lane.productionId}-${idx}`;
        nodes.push({
          id: dotId, type: "commit",
          position: { x: xAt(idx) - COMMIT_R, y: laneY + BRANCH_LABEL_H / 2 - COMMIT_R },
          data: { hue },
          draggable: false, selectable: false,
        });
        edges.push({
          id: `run-${lane.productionId}-${k}`,
          source: prevId, sourceHandle: "out",
          target: dotId, targetHandle: "in",
          type: "straight",
          style: { stroke: edgeColor, strokeWidth: 2, strokeDasharray: dash },
          markerEnd: k === idxs.length - 1
            ? { type: MarkerType.ArrowClosed, color: edgeColor, width: 12, height: 12 }
            : undefined,
        });
        prevId = dotId;
      });
    });

    return { nodes, edges };
  }, [events, lanes, arcs, selectedId, selectEvent, fetchHoverCoverage, onDescend]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => { setNodes(graph.nodes); setEdges(graph.edges); }, [graph, setNodes, setEdges]);

  const selected = events.find(e => e.id === selectedId) || null;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-3" /> Composing the chronology…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar strip (the studio header stays above — this is canvas chrome) */}
      <div className="shrink-0 px-5 py-2 border-b border-white/10 flex items-center gap-3">
        <Milestone className="w-4 h-4 text-emerald-300" />
        <span className="text-sm text-gray-200 font-medium">Universe Chronology</span>
        <span className="text-xs text-gray-500">
          {events.length} event(s) · {lanes.filter(l => l.sceneCount > 0 || l.eventIds.length > 0).length} telling(s)
          {unlinked > 0 && <span className="text-amber-400/90"> · {unlinked} unplaced scene(s)</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onOpenEntities}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 flex items-center gap-1.5"
            title="Open the entity workbench (full management — the studio's World rail)">
            <Users className="w-3.5 h-3.5" /> Entities ({entityCount})
          </button>
          <button onClick={load} className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-gray-200"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Timeline canvas — the React Flow git-graph */}
      <div className="flex-1 min-h-0 relative">
        {events.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Milestone className="w-10 h-10 text-emerald-400/30 mx-auto mb-3" />
              <div className="text-gray-400">The chronology is empty.</div>
              <div className="text-sm text-gray-600 max-w-sm mt-1">
                Ask the agent to author the first world event — it will handle the metadata (cast, state changes, placement).
              </div>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={1.5}
            panOnDrag
            zoomOnScroll
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            onPaneClick={() => { if (selectedId) selectEvent(null); }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} color="rgba(255,255,255,0.04)" />
          </ReactFlow>
        )}
      </div>

      {/* Coverage panel */}
      <div className="shrink-0 border-t border-white/10 bg-slate-950/70 px-5 py-3 max-h-[36%] overflow-y-auto">
        {!selected ? (
          <div className="text-sm text-gray-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Select an event to see every telling of it — or ask the agent to author new moments.
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              {selected.status === "canon"
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                : <CircleDashed className="w-5 h-5 text-amber-400" />}
              <span className="text-base text-gray-100 font-medium">{selected.title}</span>
              <span className="text-xs text-gray-500">t={selected.chronologyIndex} · {selected.status}</span>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1 flex items-center gap-1"><Clapperboard className="w-3 h-3" />new telling:</span>
                {(["film", "comic", "episode"] as const).map(f => {
                  const Icon = FORMAT_ICONS[f];
                  return (
                    <button key={f}
                      onClick={() => newTellingFrom(selected, f)}
                      disabled={creatingTelling}
                      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center gap-1 capitalize">
                      {creatingTelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                      {f}
                    </button>
                  );
                })}
                <span className="w-px h-5 bg-white/10 mx-1" />
                <select value={linkSceneId} onChange={(e) => setLinkSceneId(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-300 max-w-[240px]">
                  <option value="" className="bg-gray-900">Link a scene from any production…</option>
                  {scenePicker.map(s => {
                    const lane = lanes.find(l => l.productionId === s.productionId);
                    return <option key={s.id} value={s.id} className="bg-gray-900">{lane ? `[${lane.title}] ` : ""}{s.title}{s.linked ? " ✓" : ""}</option>;
                  })}
                </select>
                <button onClick={linkScene} disabled={!linkSceneId || busy}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 px-2.5 py-1.5 text-xs hover:bg-emerald-500/25 disabled:opacity-50 flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" /> Link
                </button>
              </div>
            </div>
            {coverage && (coverage.dramatizations?.length > 0 || coverage.comicPages?.length > 0) ? (
              <div className="flex gap-4 overflow-x-auto pb-1">
                {(coverage.dramatizations || []).map((d: any) => {
                  const Icon = FORMAT_ICONS[d.format as keyof typeof FORMAT_ICONS] || Film;
                  return (
                    <button key={d.sceneId} onClick={() => onOpenScene?.(d.sceneId)} className="shrink-0 w-52 rounded-xl border border-white/10 bg-white/5 overflow-hidden text-left hover:border-cyan-400/40">
                      {d.imageUrl
                        ? <img src={d.imageUrl.startsWith("http") ? d.imageUrl : `${API_BASE}${d.imageUrl}`} alt="" className="w-full h-32 object-cover" />
                        : <div className="w-full h-32 bg-black/30 flex items-center justify-center"><Icon className="w-7 h-7 text-gray-700" /></div>}
                      <div className="p-2.5">
                        <div className="text-xs text-gray-200 truncate flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-cyan-300 shrink-0" />{d.sceneTitle}
                          {d.stale && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="dramatizes an older version of this event" />}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">{d.productionTitle} · {d.format}</div>
                      </div>
                    </button>
                  );
                })}
                {(coverage.comicPages || []).map((pg: any) => (
                  <div key={pg.pageId} className="shrink-0 w-52 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                    {pg.imageUrl && <img src={pg.imageUrl.startsWith("http") ? pg.imageUrl : `${API_BASE}${pg.imageUrl}`} alt="" className="w-full h-32 object-cover object-top" />}
                    <div className="p-2.5">
                      <div className="text-xs text-gray-200 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-cyan-300" />Comic page {pg.pageNumber}</div>
                      <div className="text-[11px] text-gray-500 truncate">{pg.productionTitle} · {pg.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-600">No telling of this moment yet — start one with the buttons above, or ask the agent.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default WorldTimeline;

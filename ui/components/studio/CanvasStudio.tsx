"use client";

/**
 * CanvasStudio — the free-form generative canvas (Michael 2026-07-31: "explore
 * a world visually and interactively... moving between structure and
 * non-structure to world build, discover, and create").
 *
 * v1.2 (Michael's iteration notes):
 *   - LABELS: nodes carry a short name ("Aria: candidate 3") — yours or the
 *     agent's (label_canvas_node); labels stage as pendingAgentPatches and the
 *     open canvas adopts them live.
 *   - LOCK TO ENTITY: a resolved node can graduate — "lock this one as a
 *     reference for Aria" appends it to the entity's labeled album and the
 *     node keeps a live link chip.
 *   - MULTI-SELECT → COMBINE: select nodes, hit Combine, get a new node wired
 *     from all of them.
 *   - STRUCTURE WITH PROVENANCE: place scenes / shots / entities from the
 *     linear system as nodes carrying data.source {kind, sceneId, frameId,
 *     entityId} — snapshot + resync (never live-link), click-through back to
 *     where it lives, and "break into shots" fans a scene out into its
 *     frames, wired.
 *   - VIDEO NODES: an idle node can be flipped to video — prompt + video
 *     model + wired references (H3 reference-to-video takes several) → a
 *     DURABLE server job. The node persists its jobId, so a reload resumes
 *     polling instead of forgetting the run.
 *   - PERSISTENCE: debounced saves + pagehide/unmount flush + saved viewport,
 *     one canvas per project.
 *
 * The core grammar is unchanged: a NODE is a generation, EDGES are the
 * reference pipe (identity by default; click a wire to flip it to STYLE),
 * dormant wires draw gray-dashed, re-running preserves the old image as a
 * sibling "take", and everything is archived by the registry rule.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, addEdge, Handle, Position, useReactFlow, useStore,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection, type NodeProps, type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Loader2, Play, Pin, ImagePlus, Sparkles, X, Check, Bot, Film, Clapperboard,
  UserPlus, RefreshCw, ExternalLink, Layers, Combine, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLightbox } from "@/components/studio/ImageLightbox";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
const resolveUrl = (u?: string) => (u && !u.startsWith("http") ? `${API_BASE}${u}` : u);
const mintClientId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

interface NodeSource {
  kind: "scene" | "shot" | "entity";
  sceneId?: string;
  frameId?: string;
  entityId?: string;
  title?: string;
  /** The source's updatedAt at snapshot time — resync compares against it. */
  sourceUpdatedAt?: string;
}

interface GenNodeData extends Record<string, unknown> {
  prompt: string;
  model: string;
  kind?: "image" | "video"; // default image
  label?: string;
  url?: string;
  status: "idle" | "running" | "done" | "error";
  error?: string;
  warning?: string; // server-surfaced render warnings (ref budget, photoreal rule)
  jobId?: string; // video: the durable job — persisted so reloads resume polling
  durationSec?: number; // video
  generatedAt?: string;
  raw?: boolean; // suppress project style for this node
  styleApplied?: boolean; // last render carried the project style leash
  pinned?: boolean; // pinned as a project style reference
  archived?: boolean; // a preserved previous take (spawned on re-run)
  fromAgent?: boolean; // placed by the agent via add_canvas_node
  source?: NodeSource; // provenance — where in the linear system this came from
  entityRefs?: Array<{ id: string; name: string }>; // locked into entity albums (one node can reference several)
}

type GenNode = Node<GenNodeData, "gen">;
type CanvasEdge = Edge & { role?: "style" };

interface ModelOption { key: string; label: string; status: "live" | "down"; notes?: string; }
const FALLBACK_MODELS: ModelOption[] = [
  { key: "nano-banana", label: "NB2", status: "live" },
  { key: "gpt-image", label: "GPT-Image 2", status: "live" },
];
const FALLBACK_VIDEO_MODELS: ModelOption[] = [
  { key: "veo", label: "Veo 3.1", status: "live" },
  { key: "minimax-h3", label: "MiniMax H3", status: "live" },
];
const modelsFor = (kind: "image" | "video"): ModelOption[] => {
  if (typeof window === "undefined") return kind === "video" ? FALLBACK_VIDEO_MODELS : FALLBACK_MODELS;
  const g = (window as any)[kind === "video" ? "__canvasVideoModels" : "__canvasModels"];
  return g || (kind === "video" ? FALLBACK_VIDEO_MODELS : FALLBACK_MODELS);
};

// ---------------------------------------------------------------------------
// The node. Flora states: idle = dashed 50%, configured = solid, processing =
// pulsing glow + frozen inputs, resolved = media preview (dbl-click lightbox
// for images; native controls for video). Below ~35% zoom the card collapses
// to just its picture (LOD). Module-level (stable identity).
// ---------------------------------------------------------------------------
function GenNodeView({ id, data, selected }: NodeProps<GenNode>) {
  const isVideo = data.kind === "video";
  // A node placed FROM structure is a snapshot, not a generator — running it
  // would overwrite the linked image and make the provenance chip lie. To
  // riff on it, wire it into a fresh node.
  const isSourceNode = Boolean(data.source);
  const running = data.status === "running";
  const resolved = data.status === "done" && data.url;
  const configured = Boolean(data.prompt?.trim());
  const farOut = useStore((s) => s.transform[2] < 0.35);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onField = (patch: Partial<GenNodeData>) =>
    window.dispatchEvent(new CustomEvent("canvas:patch-node", { detail: { id, patch } }));
  const fire = (kind: string) =>
    window.dispatchEvent(new CustomEvent(`canvas:${kind}`, { detail: { id } }));
  const models = modelsFor(isVideo ? "video" : "image");
  const requestDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2000);
      return;
    }
    fire("delete-node");
  };

  const frame = cn(
    "w-72 rounded-xl border bg-slate-950/90 shadow-xl transition-all",
    running ? "border-cyan-400/80 shadow-cyan-500/20 animate-pulse"
      : selected ? "border-amber-400/70"
      : data.source ? "border-sky-400/40"
      : data.fromAgent ? "border-violet-400/50"
      : resolved || configured ? "border-white/25"
      : "border-dashed border-white/20 opacity-80",
  );

  // LOD: far-out zoom renders just the picture (or state color) + one line.
  if (farOut) {
    return (
      <div className={frame}>
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-violet-400 !border-violet-200" />
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-emerald-400 !border-emerald-200" />
        {resolved ? (
          isVideo
            ? <video src={resolveUrl(data.url)} muted loop playsInline className="w-full h-44 object-cover rounded-xl" />
            : <img src={resolveUrl(data.url)} alt={data.prompt} className="w-full h-44 object-cover rounded-xl" draggable={false} />
        ) : (
          <div className="w-full h-44 flex items-center justify-center">
            {running ? <Loader2 className="w-8 h-8 animate-spin text-cyan-300" /> : <Sparkles className="w-8 h-8 text-gray-700" />}
          </div>
        )}
        <div className="px-2 py-1 text-[16px] text-gray-400 truncate">{data.label || data.prompt || "…"}</div>
      </div>
    );
  }

  return (
    <div className={frame}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-violet-400 !border-violet-200" title="References in — upstream node images ride into this generation" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-emerald-400 !border-emerald-200" title="Feed this image into downstream nodes" />

      {/* header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/10">
        {isVideo
          ? <Clapperboard className={cn("w-3.5 h-3.5", resolved ? "text-emerald-300" : "text-gray-500")} />
          : <Sparkles className={cn("w-3.5 h-3.5", resolved ? "text-emerald-300" : "text-gray-500")} />}
        <span className="text-[10px] uppercase tracking-wider text-gray-400 flex-1 truncate" title={data.label || undefined}>
          {running ? (isVideo ? "rendering video…" : "generating…") : (data.label || (resolved ? (data.model || "image") : (isVideo ? "video node" : "image node")))}
        </span>
        {data.fromAgent && (
          <span title="Placed by the agent" className="flex items-center gap-0.5 text-[9px] text-violet-300"><Bot className="w-3 h-3" /></span>
        )}
        {data.archived && (
          <span title="A preserved previous take of its neighbor" className="text-[9px] text-gray-500">take</span>
        )}
        {data.entityRefs && data.entityRefs.length > 0 && (
          <span title={`Locked into: ${data.entityRefs.map((r) => r.name).join(", ")} — click to open`} onClick={() => fire("open-entity-ref")}
            className="nodrag cursor-pointer text-[9px] text-amber-300 flex items-center gap-0.5 hover:underline">
            <UserPlus className="w-2.5 h-2.5" />{data.entityRefs[data.entityRefs.length - 1].name.slice(0, 12)}{data.entityRefs.length > 1 ? ` +${data.entityRefs.length - 1}` : ""}
          </span>
        )}
        {data.pinned && (
          <span title="Pinned as a project style reference" className="text-[9px] text-amber-300 flex items-center gap-0.5"><Pin className="w-2.5 h-2.5" />pinned</span>
        )}
        {resolved && data.styleApplied && !data.raw && (
          <span title="The project's pinned style rode along on this render — tick 'raw' to escape the leash" className="text-[9px] text-cyan-300/80">leashed</span>
        )}
        <button onClick={requestDelete} disabled={running}
          title={confirmDelete ? "Click again to delete (downstream wires go with it)" : "Delete node"}
          className={cn("disabled:opacity-30", confirmDelete ? "text-rose-400" : "text-gray-600 hover:text-rose-300")}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* provenance chip — this node came FROM the linear system and stays linked */}
      {data.source && (
        <div className="flex items-center gap-1 px-2.5 py-1 border-b border-white/5 bg-sky-500/5">
          <button onClick={() => fire("open-source")} title="Open where this lives in the linear system"
            className="nodrag flex items-center gap-1 text-[9px] text-sky-300 hover:underline min-w-0">
            {data.source.kind === "entity" ? <UserPlus className="w-2.5 h-2.5 shrink-0" /> : data.source.kind === "shot" ? <Film className="w-2.5 h-2.5 shrink-0" /> : <Clapperboard className="w-2.5 h-2.5 shrink-0" />}
            <span className="truncate">{data.source.kind} · {data.source.title || data.source.sceneId || data.source.entityId}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </button>
          <div className="flex-1" />
          {data.source.kind === "scene" && (
            <button onClick={() => fire("break-scene")} title="Break this scene into its shots on the canvas"
              className="nodrag text-[9px] text-sky-300/80 hover:text-sky-200 flex items-center gap-0.5"><Layers className="w-2.5 h-2.5" />shots</button>
          )}
          <button onClick={() => fire("resync-source")} title="Resync from the linear system (snapshot again)"
            className="nodrag text-gray-500 hover:text-sky-300"><RefreshCw className="w-2.5 h-2.5" /></button>
        </div>
      )}

      {/* media body */}
      {resolved ? (
        isVideo ? (
          <video src={resolveUrl(data.url)} controls muted loop playsInline
            className="w-full h-44 object-cover nodrag bg-black" />
        ) : (
          <img src={resolveUrl(data.url)} alt={data.prompt}
            onDoubleClick={() => fire("inspect-node")}
            title="Double-click to inspect full size"
            className="w-full h-44 object-cover cursor-zoom-in nodrag" draggable={false} />
        )
      ) : (
        <div className="w-full h-24 flex items-center justify-center text-gray-600">
          {running ? (
            <div className="flex flex-col items-center gap-1">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-300" />
              {isVideo && <span className="text-[9px] text-cyan-300/70">video renders take minutes — safe to reload, the job survives</span>}
            </div>
          ) : data.status === "error" ? <span className="text-[10px] text-rose-300 px-3 text-center">{data.error || "generation failed"}</span>
            : <span className="text-[10px] px-3 text-center">wire references in, write a prompt, run</span>}
        </div>
      )}

      {/* label (shown when set or selected — the field stays quiet otherwise) */}
      {(selected || data.label) && (
        <div className="px-2 pt-1.5">
          <input
            value={data.label || ""}
            onChange={(e) => onField({ label: e.target.value || undefined })}
            placeholder="label — e.g. 'Aria: candidate 3'"
            className="nodrag w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-amber-100/90 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
          />
        </div>
      )}

      {/* source nodes are read-only snapshots — wire them into a fresh node to riff */}
      {isSourceNode ? (
        <div className="px-2.5 py-1.5 text-[9px] text-gray-600">a snapshot from the world — wire it into a node to build on it</div>
      ) : (
      /* prompt + controls (frozen while processing — Flora state 3) */
      <div className="p-2 space-y-1.5">
        <textarea
          value={data.prompt}
          onChange={(e) => onField({ prompt: e.target.value })}
          disabled={running}
          rows={2}
          placeholder={isVideo ? "what happens in this clip?" : "what should exist here?"}
          className="nodrag w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40 resize-none disabled:opacity-50"
        />
        {data.warning && (
          <div className="text-[9px] text-amber-300/90 leading-tight px-0.5">{data.warning}</div>
        )}
        <div className="flex items-center gap-1.5">
          {/* image ↔ video flip — only before anything exists on the node */}
          {!resolved && !running && (
            <button onClick={() => onField(isVideo ? { kind: "image", model: "nano-banana" } : { kind: "video", model: "minimax-h3" })}
              title={isVideo ? "Flip to an image node" : "Flip to a VIDEO node (wired images ride as references — H3 takes several)"}
              className="nodrag rounded-lg border border-white/10 bg-black/40 p-1 text-gray-400 hover:text-cyan-300">
              {isVideo ? <ImagePlus className="w-3 h-3" /> : <Clapperboard className="w-3 h-3" />}
            </button>
          )}
          <select value={data.model} disabled={running}
            onChange={(e) => onField({ model: e.target.value })}
            title={models.find((m) => m.key === data.model)?.notes || "Pick the engine for this node"}
            className="nodrag rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-[10px] text-gray-300 focus:outline-none disabled:opacity-50 max-w-[104px]">
            {models.map((m) => (
              <option key={m.key} value={m.key} disabled={m.status === "down"} title={m.notes}>{m.label}{m.status === "down" ? " (down)" : ""}</option>
            ))}
          </select>
          {isVideo ? (
            <input type="number" min={1} max={15} value={data.durationSec || 5} disabled={running}
              onChange={(e) => onField({ durationSec: Math.max(1, Math.min(15, Number(e.target.value) || 5)) })}
              title="Clip length (seconds)"
              className="nodrag w-11 rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-[10px] text-gray-300 focus:outline-none disabled:opacity-50" />
          ) : (
            <label className="nodrag flex items-center gap-1 text-[9px] text-gray-500 cursor-pointer" title="Raw: ignore the pinned project style for this node">
              <input type="checkbox" checked={Boolean(data.raw)} disabled={running} onChange={(e) => onField({ raw: e.target.checked })} />
              raw
            </label>
          )}
          <div className="flex-1" />
          {resolved && !isVideo && (
            <button onClick={() => fire("lock-node")}
              title={data.entityRefs?.length ? `Locked into ${data.entityRefs.map((r) => r.name).join(", ")} — lock into another?` : "Lock this image as a reference for an entity (\"this IS Aria\")"}
              className={cn("nodrag rounded-lg border px-1.5 py-1 text-[10px]",
                data.entityRefs?.length
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                  : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25")}>
              <UserPlus className="w-3 h-3" />
            </button>
          )}
          {resolved && !isVideo && (
            <button onClick={() => fire("pin-node")}
              title={data.pinned ? "Already pinned as a project style reference" : "Pin this image as a PROJECT STYLE REFERENCE"}
              className={cn("nodrag rounded-lg border px-1.5 py-1 text-[10px]",
                data.pinned
                  ? "border-amber-400/70 bg-amber-500/25 text-amber-200"
                  : "border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/25")}>
              <Pin className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => fire("run-node")} disabled={running || !configured}
            title={resolved ? "Re-run — the current result is preserved as a 'take' node next door; this node re-generates" : "Generate"}
            className="nodrag rounded-lg bg-cyan-600 px-2.5 py-1 text-[10px] text-white hover:bg-cyan-500 disabled:opacity-40 flex items-center gap-1">
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

const nodeTypes = { gen: GenNodeView };

// ---------------------------------------------------------------------------
// The canvas.
// ---------------------------------------------------------------------------
interface CanvasProps {
  projectId: string | null;
  onJumpToScene?: (sceneId: string) => void;
  onJumpToShot?: (sceneId: string, shotId: string) => void;
  onJumpToEntity?: (entityId: string) => void;
}

interface PickerScene { id: string; title: string; imageUrl?: string; updatedAt?: string; frames: Array<{ id: string; title?: string; imageUrl?: string; lastImageAt?: string }>; }
interface PickerEntity { id: string; name: string; url?: string; updatedAt?: string; gallery: any[]; }

function CanvasInner({ projectId, onJumpToScene, onJumpToShot, onJumpToEntity }: CanvasProps) {
  const { openLightbox } = useLightbox();
  const { screenToFlowPosition, fitView, setViewport } = useReactFlow();
  const [nodes, setNodes] = useState<GenNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ mode: "place" | "lock"; lockNodeId?: string; tab: "scenes" | "entities" } | null>(null);
  const [pickerScenes, setPickerScenes] = useState<PickerScene[] | null>(null);
  const [pickerEntities, setPickerEntities] = useState<PickerEntity[] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const ackPatchesRef = useRef<Set<string>>(new Set());
  // refs mirror state for the event handlers (module-level node component
  // dispatches CustomEvents — no stale closures)
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const projectRef = useRef(projectId); projectRef.current = projectId;
  const loadedRef = useRef(loaded); loadedRef.current = loaded;

  // ---- model registries for node dropdowns (window-shared: the node
  // component is module-level; nodes are nudged to re-render once these land) ----
  useEffect(() => {
    (async () => {
      try {
        const [ri, rv] = await Promise.all([
          fetch(`${API_BASE}/api/narrative/models?kind=image`),
          fetch(`${API_BASE}/api/narrative/models?kind=video`),
        ]);
        if (ri.ok) {
          const d = await ri.json();
          (window as any).__canvasModels = (d.models || []).map((m: any) => ({ key: m.key, label: m.label, status: m.status, notes: m.notes }));
        }
        if (rv.ok) {
          const d = await rv.json();
          (window as any).__canvasVideoModels = (d.models || [])
            .filter((m: any) => m.key !== "seedance") // legacy Replicate path — not a canvas backend
            .map((m: any) => ({ key: m.key, label: m.label, status: m.status, notes: m.notes }));
        }
        setNodes((ns) => ns.map((n) => ({ ...n }))); // re-render existing nodes with real options
      } catch { /* fallbacks stay */ }
    })();
  }, []);

  // ---- load (project-scoped; switching projects RESETS the field first —
  // otherwise a debounced save armed for project A fires under project B's id
  // and overwrites B's canvas wholesale) ----
  useEffect(() => {
    if (!projectId) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setLoaded(false);
    setNodes([]);
    setEdges([]);
    setPicker(null);
    setPickerScenes(null);
    setPickerEntities(null);
    ackPatchesRef.current = new Set();
    seenPendingNodeIds.current = new Set();
    seenPendingEdgeIds.current = new Set();
    let cancelled = false;
    (async () => {
      try {
        // A dead-lettered unload save (canvas too big for fetch keepalive)
        // reconciles BEFORE the load, so we read our own last edits back.
        try {
          const pending = localStorage.getItem(`canvas:pending:${projectId}`);
          if (pending) {
            const pr = await fetch(`${API_BASE}/api/narrative/canvas`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: pending });
            if (pr.ok) localStorage.removeItem(`canvas:pending:${projectId}`);
          }
        } catch { /* the regular load proceeds either way */ }
        const r = await fetch(`${API_BASE}/api/narrative/canvas?projectId=${encodeURIComponent(projectId)}`);
        if (cancelled) return;
        if (r.ok) {
          const d = await r.json();
          const adopt = (arr: any[]) => (arr || []).map((n: any) => ({
            ...n,
            type: "gen",
            // a node mid-generation when the page closed: a VIDEO node with a
            // jobId stays 'running' — the durable job survived and polling
            // resumes below; an image node keeps its last picture (done) or
            // drops to idle. Never hide a picture.
            data: {
              ...n.data,
              status: n.data?.status === "running"
                ? (n.data?.kind === "video" && n.data?.jobId ? "running" : (n.data?.url ? "done" : "idle"))
                : (n.data?.status || "idle"),
            },
          }));
          const loadedNodes: GenNode[] = [...adopt(d.canvas?.nodes), ...adopt(d.canvas?.pendingAgentNodes)];
          const loadedEdges: CanvasEdge[] = [...(d.canvas?.edges || []), ...(d.canvas?.pendingAgentEdges || [])];
          setNodes(loadedNodes);
          setEdges(loadedEdges);
          const vp = d.canvas?.viewport;
          if (vp && typeof vp.x === "number" && typeof vp.zoom === "number") {
            viewportRef.current = vp;
            requestAnimationFrame(() => { try { setViewport(vp); } catch { /* not mounted yet */ } });
          } else if (loadedNodes.length > 0) {
            requestAnimationFrame(() => { try { fitView({ padding: 0.2, maxZoom: 1.25 }); } catch { /* not mounted yet */ } });
          }
        }
      } finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [projectId, fitView, setViewport]);

  // ---- debounced save (+ flush on unmount AND page unload — a reload must
  // never lose the last edits) ----
  const seenPendingNodeIds = useRef<Set<string>>(new Set());
  const seenPendingEdgeIds = useRef<Set<string>>(new Set());
  const persist = useCallback((keepalive = false) => {
    const pid = projectRef.current;
    if (!pid || !loadedRef.current) return Promise.resolve();
    const acked = Array.from(ackPatchesRef.current);
    // Adopted-then-deleted staged items: without this explicit signal the
    // server (which only evicts staging on presence-in-nodes[]) would
    // resurrect them forever.
    const removedPendingNodeIds = Array.from(seenPendingNodeIds.current).filter((id) => !nodesRef.current.some((n) => n.id === id));
    const removedPendingEdgeIds = Array.from(seenPendingEdgeIds.current).filter((id) => !edgesRef.current.some((e) => e.id === id));
    const body = JSON.stringify({
      projectId: pid,
      nodes: nodesRef.current.map(({ id, type, position, data }) => ({ id, type, position, data })),
      edges: edgesRef.current.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.role ? { role: e.role } : {}) })),
      ...(viewportRef.current ? { viewport: viewportRef.current } : {}),
      ...(acked.length ? { adoptedPatchIds: acked } : {}),
      ...(removedPendingNodeIds.length ? { removedPendingNodeIds } : {}),
      ...(removedPendingEdgeIds.length ? { removedPendingEdgeIds } : {}),
    });
    // fetch keepalive rejects bodies over ~64KiB BEFORE sending — on unload a
    // big canvas must dead-letter to localStorage instead (reconciled by the
    // next load of this project).
    if (keepalive && new Blob([body]).size > 60_000) {
      try { localStorage.setItem(`canvas:pending:${pid}`, body); } catch { /* best effort */ }
      return Promise.resolve();
    }
    return fetch(`${API_BASE}/api/narrative/canvas`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, keepalive, body,
    }).then(
      (r) => {
        if (!r.ok) return; // non-2xx: nothing was saved — keep acks, no green check
        acked.forEach((id) => ackPatchesRef.current.delete(id));
        removedPendingNodeIds.forEach((id) => seenPendingNodeIds.current.delete(id));
        removedPendingEdgeIds.forEach((id) => seenPendingEdgeIds.current.delete(id));
        try { localStorage.removeItem(`canvas:pending:${pid}`); } catch { /* ignore */ }
        setSavedAt(new Date().toLocaleTimeString());
      },
      () => { /* retry on next change */ },
    );
  }, []);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(); }, 1200);
  }, [persist]);
  useEffect(() => () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); void persist(true); }
  }, [persist]);
  useEffect(() => {
    // React effect cleanups do NOT reliably run on a browser reload — flush
    // through pagehide (fetch keepalive survives the navigation).
    const flush = () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; void persist(true); }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [persist]);

  // ---- agent adoption: add_canvas_node / label_canvas_node placements stage
  // server-side (pendingAgentNodes/Edges/Patches); poll while open and pull
  // them onto the field. The follow-up save persists nodes/edges (clearing
  // them from staging) and acknowledges adopted patch ids. ----
  useEffect(() => {
    if (!projectId || !loaded) return;
    const t = setInterval(async () => {
      const pid = projectId; // the project this tick was scheduled for
      try {
        const r = await fetch(`${API_BASE}/api/narrative/canvas?projectId=${encodeURIComponent(pid)}`);
        if (!r.ok) return;
        const d = await r.json();
        // Project switched while the GET was in flight — these staged items
        // belong to the OLD project and must not merge into the new field.
        if (projectRef.current !== pid) return;
        const pendingNodes: any[] = d.canvas?.pendingAgentNodes || [];
        const pendingEdges: any[] = d.canvas?.pendingAgentEdges || [];
        const pendingPatches: any[] = d.canvas?.pendingAgentPatches || [];
        if (!pendingNodes.length && !pendingEdges.length && !pendingPatches.length) return;
        const localIds = new Set(nodesRef.current.map((n) => n.id));
        const freshNodes = pendingNodes.filter((n) => n?.id && !localIds.has(n.id) && !seenPendingNodeIds.current.has(n.id));
        const afterIds = new Set<string>(Array.from(localIds).concat(freshNodes.map((n) => n.id)));
        const localEdgeIds = new Set(edgesRef.current.map((e) => e.id));
        const freshEdges = pendingEdges.filter((e) => e?.id && !localEdgeIds.has(e.id) && !seenPendingEdgeIds.current.has(e.id) && afterIds.has(e.source) && afterIds.has(e.target));
        const applicablePatches = pendingPatches.filter((p) => p?.id && p?.nodeId && !ackPatchesRef.current.has(p.id));
        if (!freshNodes.length && !freshEdges.length && !applicablePatches.length) return;
        if (freshNodes.length) {
          freshNodes.forEach((n) => seenPendingNodeIds.current.add(n.id));
          setNodes((ns) => [...ns, ...freshNodes.map((n) => ({ ...n, type: "gen" as const }))]);
        }
        if (freshEdges.length) {
          freshEdges.forEach((e) => seenPendingEdgeIds.current.add(e.id));
          setEdges((es) => [...es, ...freshEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.role ? { role: e.role } : {}) }))]);
        }
        if (applicablePatches.length) {
          // Ack ONLY patches that matched a live node — a patch for a node the
          // creator deleted must not be reported as adopted. The fromAgent
          // stamp lights the Bot badge so the change is visible, not silent.
          const matchedIds = new Set<string>();
          applicablePatches.forEach((p) => { if (nodesRef.current.some((n) => n.id === p.nodeId)) matchedIds.add(p.id); });
          setNodes((ns) => ns.map((n) => {
            const mine = applicablePatches.filter((p) => p.nodeId === n.id);
            if (!mine.length) return n;
            return { ...n, data: { ...n.data, ...Object.assign({}, ...mine.map((p) => p.patch || {})), fromAgent: true } };
          }));
          applicablePatches.forEach((p) => { if (matchedIds.has(p.id)) ackPatchesRef.current.add(p.id); });
        }
        scheduleSave();
      } catch { /* next tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [projectId, loaded, scheduleSave]);

  // ---- durable video jobs: poll every running video node's job; a reload
  // re-enters here because the node persisted its jobId. ----
  useEffect(() => {
    if (!projectId || !loaded) return;
    const t = setInterval(async () => {
      const watching = nodesRef.current.filter((n) => n.data.kind === "video" && n.data.status === "running" && n.data.jobId);
      for (const n of watching) {
        try {
          const r = await fetch(`${API_BASE}/api/narrative/visual/video-job/${encodeURIComponent(n.data.jobId!)}`);
          if (r.status === 404) {
            setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "error", error: "video job lost (server restarted before it finished)", jobId: undefined } } : x));
            scheduleSave();
            continue;
          }
          if (!r.ok) continue;
          const d = await r.json();
          if (d.status === "done" && d.videoUrl) {
            setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "done", url: d.videoUrl, jobId: undefined, generatedAt: new Date().toISOString() } } : x));
            scheduleSave();
          } else if (d.status === "error") {
            setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "error", error: String(d.error || "video render failed").slice(0, 140), jobId: undefined } } : x));
            scheduleSave();
          }
        } catch { /* next tick */ }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [projectId, loaded, scheduleSave]);

  const onNodesChange = useCallback((changes: NodeChange<GenNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    scheduleSave();
  }, [scheduleSave]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es) as CanvasEdge[]);
    scheduleSave();
  }, [scheduleSave]);
  const onConnect = useCallback((c: Connection) => {
    setEdges((es) => addEdge(c, es) as CanvasEdge[]);
    scheduleSave();
  }, [scheduleSave]);
  // A wire carries identity by default; clicking flips it to STYLE (rendering
  // language only). The visual grammar lives in displayEdges below.
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEdges((es) => es.map((e) => e.id === edge.id ? { ...e, role: e.role === "style" ? undefined : "style" } : e));
    scheduleSave();
  }, [scheduleSave]);
  const onMoveEnd = useCallback((_: unknown, vp: Viewport) => {
    viewportRef.current = vp;
    scheduleSave();
  }, [scheduleSave]);

  // Derived edge visuals — live (source resolved) vs dormant, identity vs
  // style. Derived at render, never persisted, so styling survives reloads by
  // construction and a dead reference wire is visibly dead.
  const displayEdges = useMemo(() => {
    const urlOf = new Map(nodes.map((n) => [n.id, n.data.url]));
    const videoTargets = new Set(nodes.filter((n) => n.data.kind === "video").map((n) => n.id));
    return displayEdgesFrom(edges, urlOf, videoTargets);
  }, [nodes, edges]);

  const selectedCount = useMemo(() => nodes.filter((n) => n.selected).length, [nodes]);

  // ---- spawn ----
  const addNodeAt = useCallback((flowPos: { x: number; y: number }, data?: Partial<GenNodeData>) => {
    const id = mintClientId("cnode");
    setNodes((ns) => [...ns, {
      id, type: "gen", position: flowPos,
      data: { prompt: "", model: "nano-banana", status: "idle", ...data } as GenNodeData,
    }]);
    scheduleSave();
    return id;
  }, [scheduleSave]);

  // React Flow v12 has no onPaneDoubleClick; onPaneClick is target-guarded to
  // the pane itself (nodes/Controls/MiniMap excluded), and detail===2 makes it
  // a double-click. zoomOnDoubleClick is off so the gesture doesn't also zoom.
  const onPaneClick = useCallback((e: React.MouseEvent) => {
    if (e.detail !== 2) return;
    addNodeAt(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [addNodeAt, screenToFlowPosition]);

  // ---- multi-select → combine: a new node wired from every selected node ----
  const combineSelected = useCallback(() => {
    const selected = nodesRef.current.filter((n) => n.selected);
    if (selected.length < 2) return;
    const maxX = Math.max(...selected.map((n) => n.position.x));
    const avgY = selected.reduce((a, n) => a + n.position.y, 0) / selected.length;
    const id = addNodeAt({ x: maxX + 360, y: avgY }, { prompt: "" });
    // ids minted OUTSIDE the updater — impure updaters double-fire in dev
    const newEdges = selected.map((n) => ({ id: mintClientId("cedge"), source: n.id, target: id }));
    setEdges((es) => [...es, ...newEdges]);
    scheduleSave();
  }, [addNodeAt, scheduleSave]);

  // ---- the world picker (place structure / lock into an entity) ----
  const openPicker = useCallback(async (mode: "place" | "lock", lockNodeId?: string) => {
    setPicker({ mode, lockNodeId, tab: mode === "lock" ? "entities" : "scenes" });
    // Always refetch fresh — a lock writes the whole gallery back, so a stale
    // snapshot here would erase whatever landed since the last open.
    setPickerScenes(null);
    setPickerEntities(null);
    const pid = projectRef.current;
    if (!pid) return;
    try {
      const [rs, re] = await Promise.all([
        fetch(`${API_BASE}/api/narrative/interactions?projectId=${encodeURIComponent(pid)}`),
        fetch(`${API_BASE}/api/narrative/entities?projectId=${encodeURIComponent(pid)}&type=all`),
      ]);
      if (rs.ok) {
        const arr = await rs.json();
        setPickerScenes((Array.isArray(arr) ? arr : []).map((i: any) => ({
          id: i.id,
          title: i.title || (i.summary || "").slice(0, 50) || "Untitled scene",
          imageUrl: i.imageUrl,
          updatedAt: i.updatedAt,
          frames: (i.frames || []).map((f: any) => ({ id: f.id, title: f.title, imageUrl: f.imageUrl, lastImageAt: f.lastImageAt })),
        })));
      }
      if (re.ok) {
        const arr = await re.json();
        setPickerEntities((Array.isArray(arr) ? arr : []).map((e: any) => ({
          id: e.id, name: e.name || "unnamed", url: e.referenceImage || e.imageUrl, updatedAt: e.updatedAt, gallery: Array.isArray(e.imageGallery) ? e.imageGallery : [],
        })));
      }
    } catch { /* lists stay null → loading state */ }
  }, []);

  const centerPos = useCallback(() =>
    screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }), [screenToFlowPosition]);

  const placeScene = useCallback((s: PickerScene, withShots: boolean) => {
    const at = centerPos();
    const sceneNodeId = addNodeAt(at, {
      label: s.title, url: s.imageUrl, status: s.imageUrl ? "done" : "idle",
      source: { kind: "scene", sceneId: s.id, title: s.title, sourceUpdatedAt: s.updatedAt },
      generatedAt: new Date().toISOString(),
    });
    if (withShots && s.frames.length) {
      const shotIds: Array<{ id: string; frameId: string }> = [];
      s.frames.forEach((f, i) => {
        const id = addNodeAt(
          { x: at.x + 360 + (i % 3) * 340, y: at.y - 100 + Math.floor(i / 3) * 320 },
          {
            label: f.title || `Shot ${i + 1}`, url: f.imageUrl, status: f.imageUrl ? "done" : "idle",
            source: { kind: "shot", sceneId: s.id, frameId: f.id, title: f.title || `Shot ${i + 1}`, sourceUpdatedAt: f.lastImageAt || s.updatedAt },
            generatedAt: new Date().toISOString(),
          },
        );
        shotIds.push({ id, frameId: f.id });
      });
      setEdges((es) => [...es, ...shotIds.map((sh) => ({ id: mintClientId("cedge"), source: sceneNodeId, target: sh.id }))]);
    }
    setPicker(null);
    scheduleSave();
  }, [addNodeAt, centerPos, scheduleSave]);

  const placeEntity = useCallback((e: PickerEntity) => {
    addNodeAt(centerPos(), {
      label: e.name, url: e.url, status: e.url ? "done" : "idle",
      source: { kind: "entity", entityId: e.id, title: e.name, sourceUpdatedAt: e.updatedAt },
      generatedAt: new Date().toISOString(),
    });
    setPicker(null);
    scheduleSave();
  }, [addNodeAt, centerPos, scheduleSave]);

  // "Lock this one as a reference for Aria" — append the node's image to the
  // entity's labeled album (same read-modify-write recipe the entity workbench
  // uses) and keep the link on the node.
  const lockIntoEntity = useCallback(async (e: PickerEntity) => {
    const nodeId = picker?.lockNodeId;
    const pid = projectRef.current;
    setPicker(null);
    if (!nodeId || !pid) return;
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node?.data.url) return;
    const label = node.data.label || (node.data.prompt || "").slice(0, 40) || "canvas reference";
    try {
      const setRef = (x: GenNode): GenNode => ({
        ...x,
        data: {
          ...x.data,
          entityRefs: [...(x.data.entityRefs || []).filter((r) => r.id !== e.id), { id: e.id, name: e.name }],
          label: x.data.label || label,
        },
      });
      // Already in this entity's album? Re-locking is a no-op, not a duplicate.
      if (e.gallery.some((g: any) => g?.url === node.data.url)) {
        setNodes((ns) => ns.map((x) => (x.id === nodeId ? setRef(x) : x)));
        scheduleSave();
        return;
      }
      const entry = { id: mintClientId("img"), url: node.data.url, label, ...(node.data.prompt ? { prompt: node.data.prompt } : {}), createdAt: new Date().toISOString() };
      const r = await fetch(`${API_BASE}/api/narrative/entity/${encodeURIComponent(e.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, updates: { imageGallery: [...e.gallery, entry] } }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "lock failed");
      setNodes((ns) => ns.map((x) => (x.id === nodeId ? setRef(x) : x)));
    } catch (err: any) {
      setNodes((ns) => ns.map((x) => x.id === nodeId ? { ...x, data: { ...x.data, error: `lock failed: ${String(err.message || err).slice(0, 100)}` } } : x));
    }
    scheduleSave();
  }, [picker, scheduleSave]);

  // ---- node actions via CustomEvents (stable module-level node component) ----
  useEffect(() => {
    const patch = (e: Event) => {
      const { id, patch } = (e as CustomEvent).detail;
      setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
      scheduleSave();
    };
    const del = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((ed) => ed.source !== id && ed.target !== id));
      scheduleSave();
    };
    const inspect = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const n = nodesRef.current.find((x) => x.id === id);
      if (n?.data.url && n.data.kind !== "video") openLightbox(resolveUrl(n.data.url)!, n.data.label || n.data.prompt);
    };
    const pin = async (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const n = nodesRef.current.find((x) => x.id === id);
      const pid = projectRef.current;
      if (!n?.data.url || !pid) return;
      try {
        const r = await fetch(`${API_BASE}/api/narrative/assets/style-reference-from-url`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: pid, imageUrl: n.data.url, label: `style: canvas — ${(n.data.label || n.data.prompt || "").slice(0, 40)}`, description: n.data.prompt }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "pin failed");
        setNodes((ns) => ns.map((x) => x.id === id ? { ...x, data: { ...x.data, pinned: true } } : x));
      } catch (err: any) {
        setNodes((ns) => ns.map((x) => x.id === id ? { ...x, data: { ...x.data, error: `pin failed: ${String(err.message || err).slice(0, 120)}`, status: x.data.url ? x.data.status : "error" } } : x));
      }
      scheduleSave();
    };
    const lock = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      void openPicker("lock", id);
    };
    const openSource = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const src = nodesRef.current.find((x) => x.id === id)?.data.source;
      if (!src) return;
      if (src.kind === "scene" && src.sceneId) onJumpToScene?.(src.sceneId);
      else if (src.kind === "shot" && src.sceneId && src.frameId) onJumpToShot?.(src.sceneId, src.frameId);
      else if (src.kind === "entity" && src.entityId) onJumpToEntity?.(src.entityId);
    };
    const openEntityRef = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const refs = nodesRef.current.find((x) => x.id === id)?.data.entityRefs;
      if (refs?.length) onJumpToEntity?.(refs[refs.length - 1].id);
    };
    const resync = async (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const pid = projectRef.current;
      const node = nodesRef.current.find((x) => x.id === id);
      const src = node?.data.source;
      if (!src || !pid) return;
      // Compare the source's clock against the snapshot's before overwriting —
      // resync must say "already current" rather than silently doing nothing.
      const apply = (patch: { url?: string; title?: string; stamp?: string }) => {
        const unchanged = Boolean(patch.stamp && src.sourceUpdatedAt && patch.stamp === src.sourceUpdatedAt);
        setNodes((ns) => ns.map((x) => x.id === id
          ? {
              ...x,
              data: unchanged
                ? { ...x.data, warning: "source unchanged — already current" }
                : {
                    ...x.data,
                    url: patch.url || x.data.url,
                    status: patch.url ? "done" : x.data.status,
                    warning: undefined,
                    source: { ...src, title: patch.title || src.title, sourceUpdatedAt: patch.stamp || src.sourceUpdatedAt },
                  },
            } : x));
      };
      try {
        if (src.kind === "entity" && src.entityId) {
          const r = await fetch(`${API_BASE}/api/narrative/entities?projectId=${encodeURIComponent(pid)}&type=all`);
          const arr = r.ok ? await r.json() : [];
          const ent = (Array.isArray(arr) ? arr : []).find((x: any) => x.id === src.entityId);
          if (ent) apply({ url: ent.referenceImage || ent.imageUrl, title: ent.name, stamp: ent.updatedAt });
        } else if (src.sceneId) {
          const r = await fetch(`${API_BASE}/api/narrative/interactions?projectId=${encodeURIComponent(pid)}`);
          const arr = r.ok ? await r.json() : [];
          const scene = (Array.isArray(arr) ? arr : []).find((x: any) => x.id === src.sceneId);
          if (!scene) return;
          if (src.kind === "scene") {
            apply({ url: scene.imageUrl, title: scene.title, stamp: scene.updatedAt });
          } else if (src.kind === "shot" && src.frameId) {
            const f = (scene.frames || []).find((fr: any) => fr.id === src.frameId);
            if (f) apply({ url: f.imageUrl, title: f.title, stamp: f.lastImageAt || scene.updatedAt });
          }
        }
      } catch { /* leave the snapshot */ }
      scheduleSave();
    };
    const breakScene = async (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const pid = projectRef.current;
      const node = nodesRef.current.find((x) => x.id === id);
      const src = node?.data.source;
      if (!node || !src || src.kind !== "scene" || !src.sceneId || !pid) return;
      try {
        const r = await fetch(`${API_BASE}/api/narrative/interactions?projectId=${encodeURIComponent(pid)}`);
        const arr = r.ok ? await r.json() : [];
        const scene = (Array.isArray(arr) ? arr : []).find((x: any) => x.id === src.sceneId);
        const frames: any[] = scene?.frames || [];
        if (!frames.length) return;
        // skip shots already on the field; build additions OUTSIDE the
        // updaters (impure updaters double-fire in dev)
        const placed = new Set(nodesRef.current.map((n) => n.data.source?.frameId).filter(Boolean));
        const fresh = frames.filter((f) => !placed.has(f.id));
        const additions: GenNode[] = fresh.map((f, i) => ({
          id: mintClientId("cnode"), type: "gen" as const,
          position: { x: node.position.x + 360 + (i % 3) * 340, y: node.position.y - 100 + Math.floor(i / 3) * 320 },
          data: {
            prompt: "", model: "nano-banana", status: f.imageUrl ? "done" : "idle",
            label: f.title || `Shot ${i + 1}`, url: f.imageUrl,
            source: { kind: "shot", sceneId: src.sceneId, frameId: f.id, title: f.title || `Shot ${i + 1}`, sourceUpdatedAt: f.lastImageAt || scene.updatedAt },
            generatedAt: new Date().toISOString(),
          } as GenNodeData,
        }));
        const newEdges = additions.map((a) => ({ id: mintClientId("cedge"), source: id, target: a.id }));
        setNodes((ns) => [...ns, ...additions]);
        setEdges((es) => [...es, ...newEdges]);
      } catch { /* nothing spawned */ }
      scheduleSave();
    };
    const run = async (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const pid = projectRef.current;
      const node = nodesRef.current.find((x) => x.id === id);
      if (!node || !pid || !node.data.prompt?.trim()) return;
      if (node.data.source) return; // source nodes are snapshots — never re-generated
      // upstream references: every incoming edge's source node image; a wire
      // flipped to 'style' rides as a style ref (no subject/identity leak)
      const refUrls: string[] = [];
      const refRoles: Record<string, string> = {};
      for (const ed of edgesRef.current.filter((x) => x.target === id)) {
        const u = nodesRef.current.find((x) => x.id === ed.source)?.data.url;
        if (!u) continue;
        refUrls.push(u);
        if (ed.role === "style") refRoles[u] = "style";
      }
      // Re-run preserves the current result as a sibling "take" node next door
      // (nothing on the field is ever lost — the tooltip's promise, kept).
      if (node.data.url && node.data.status === "done") {
        const takeId = mintClientId("cnode");
        setNodes((ns) => [...ns, {
          id: takeId, type: "gen",
          position: { x: node.position.x - 320, y: node.position.y + 24 },
          data: {
            prompt: node.data.prompt, model: node.data.model, url: node.data.url,
            kind: node.data.kind, label: node.data.label ? `${node.data.label} (take)` : undefined,
            status: "done", generatedAt: node.data.generatedAt, archived: true,
            ...(node.data.raw ? { raw: true } : {}),
          } as GenNodeData,
        }]);
      }
      setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, status: "running", error: undefined, warning: undefined } } : n));
      if (node.data.kind === "video") {
        // Durable job: the node persists its jobId, so a reload resumes the
        // poll instead of forgetting a minutes-long render.
        const clientNotes = Object.keys(refRoles).length ? ["style wires ride as plain references for video"] : [];
        try {
          const r = await fetch(`${API_BASE}/api/narrative/visual/render-video`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: pid,
              prompt: node.data.prompt.trim(),
              backend: node.data.model,
              ...(refUrls.length ? { referenceUrls: refUrls } : {}),
              durationSec: node.data.durationSec || 5,
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "video render failed to start");
          const allNotes = [...clientNotes, ...(Array.isArray(d.warnings) ? d.warnings : [])];
          setNodes((ns) => ns.map((n) => n.id === id
            ? { ...n, data: { ...n.data, jobId: d.jobId, ...(allNotes.length ? { warning: allNotes.join(" · ").slice(0, 220) } : {}) } } : n));
        } catch (err: any) {
          setNodes((ns) => ns.map((n) => n.id === id
            ? { ...n, data: { ...n.data, status: "error", error: String(err.message || err).slice(0, 140) } } : n));
        }
        scheduleSave();
        return;
      }
      try {
        const r = await fetch(`${API_BASE}/api/narrative/visual/render`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: pid,
            prompt: node.data.prompt.trim(),
            model: node.data.model,
            ...(refUrls.length ? { referenceUrls: refUrls } : {}),
            ...(Object.keys(refRoles).length ? { referenceRoles: refRoles } : {}),
            ...(node.data.raw ? { suppressProjectStyle: true } : {}),
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "render failed");
        if (projectRef.current !== pid) return; // project switched mid-flight — the result is archived server-side
        setNodes((ns) => ns.map((n) => n.id === id
          ? {
              ...n,
              data: {
                ...n.data, status: "done", url: d.imageUrl, generatedAt: new Date().toISOString(),
                styleApplied: Boolean(d.styleDirectiveApplied),
                ...(Array.isArray(d.warnings) && d.warnings.length ? { warning: d.warnings.join(" · ").slice(0, 220) } : {}),
              },
            } : n));
      } catch (err: any) {
        if (projectRef.current !== pid) return;
        setNodes((ns) => ns.map((n) => n.id === id
          ? { ...n, data: { ...n.data, status: "error", error: String(err.message || err).slice(0, 140) } } : n));
      }
      scheduleSave();
    };
    window.addEventListener("canvas:patch-node", patch);
    window.addEventListener("canvas:delete-node", del);
    window.addEventListener("canvas:inspect-node", inspect);
    window.addEventListener("canvas:pin-node", pin);
    window.addEventListener("canvas:lock-node", lock);
    window.addEventListener("canvas:open-source", openSource);
    window.addEventListener("canvas:open-entity-ref", openEntityRef);
    window.addEventListener("canvas:resync-source", resync);
    window.addEventListener("canvas:break-scene", breakScene);
    window.addEventListener("canvas:run-node", run);
    return () => {
      window.removeEventListener("canvas:patch-node", patch);
      window.removeEventListener("canvas:delete-node", del);
      window.removeEventListener("canvas:inspect-node", inspect);
      window.removeEventListener("canvas:pin-node", pin);
      window.removeEventListener("canvas:lock-node", lock);
      window.removeEventListener("canvas:open-source", openSource);
      window.removeEventListener("canvas:open-entity-ref", openEntityRef);
      window.removeEventListener("canvas:resync-source", resync);
      window.removeEventListener("canvas:break-scene", breakScene);
      window.removeEventListener("canvas:run-node", run);
    };
  }, [openLightbox, scheduleSave, openPicker, onJumpToScene, onJumpToShot, onJumpToEntity]);

  if (!projectId) {
    return <div className="h-full flex items-center justify-center text-gray-500 text-sm">Open a project to use the canvas.</div>;
  }
  if (!loaded) {
    return <div className="h-full flex items-center justify-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Opening the canvas…</div>;
  }

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        multiSelectionKeyCode="Shift"
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        className="bg-[#0b0a12]"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2a2838" />
        <Controls position="bottom-left" className="!bg-slate-900 !border-white/10 [&>button]:!bg-slate-900 [&>button]:!border-white/10 [&>button]:!text-gray-400" />
        {nodes.length > 6 && <MiniMap pannable zoomable className="!bg-slate-900/90" nodeColor={() => "#334"} maskColor="rgba(10,10,18,0.7)" />}
      </ReactFlow>

      {/* bottom-center dock (Flora's asset dock, minimal) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/90 px-3 py-2 shadow-2xl">
        <button
          onClick={() => addNodeAt(centerPos())}
          className="flex items-center gap-1.5 rounded-full bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500">
          <ImagePlus className="w-3.5 h-3.5" /> Node
        </button>
        <button
          onClick={() => void openPicker("place")}
          title="Place a scene, its shots, or an entity from the world onto the field — it stays linked"
          className="flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-500/25">
          <Globe className="w-3.5 h-3.5" /> From world
        </button>
        {selectedCount >= 2 && (
          <button
            onClick={combineSelected}
            title="Spawn a new node wired from every selected node — write the fusion prompt and run"
            className="flex items-center gap-1.5 rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/30">
            <Combine className="w-3.5 h-3.5" /> Combine ({selectedCount})
          </button>
        )}
        <span className="text-[10px] text-gray-500 pr-1">
          double-click to spawn · wire to combine · click a wire: identity ↔ style · shift-click to multi-select · the agent sees this field and places nodes
        </span>
        {savedAt && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />{savedAt}</span>}
      </div>

      {/* the world picker — place structure, or lock a node into an entity */}
      {picker && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setPicker(null)}>
          <div className="w-[520px] max-h-[70%] flex flex-col rounded-2xl border border-white/15 bg-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <span className="text-sm text-gray-200 flex-1">
                {picker.mode === "lock" ? "Lock this image into which entity's album?" : "Place from the world"}
              </span>
              {picker.mode === "place" && (
                <div className="flex gap-1">
                  {(["scenes", "entities"] as const).map((t) => (
                    <button key={t} onClick={() => setPicker((p) => p && { ...p, tab: t })}
                      className={cn("rounded-full px-2.5 py-1 text-[11px]", picker.tab === t ? "bg-sky-500/25 text-sky-200" : "text-gray-500 hover:text-gray-300")}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setPicker(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {picker.tab === "scenes" ? (
                pickerScenes === null ? <div className="p-6 text-center text-gray-500 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />loading scenes…</div>
                : pickerScenes.length === 0 ? <div className="p-6 text-center text-gray-600 text-xs">No scenes yet — the world's tellings are empty.</div>
                : pickerScenes.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5 group">
                    {s.imageUrl
                      ? <img src={resolveUrl(s.imageUrl)} className="w-14 h-9 object-cover rounded" alt="" />
                      : <div className="w-14 h-9 rounded bg-white/5 flex items-center justify-center"><Clapperboard className="w-3.5 h-3.5 text-gray-600" /></div>}
                    <button onClick={() => placeScene(s, false)} className="flex-1 text-left min-w-0" title="Place this scene as a linked node">
                      <div className="text-xs text-gray-200 truncate">{s.title}</div>
                      <div className="text-[10px] text-gray-500">{s.frames.length} shot{s.frames.length === 1 ? "" : "s"}</div>
                    </button>
                    {s.frames.length > 0 && (
                      <button onClick={() => placeScene(s, true)}
                        title="Place the scene AND fan out its shots, wired"
                        className="opacity-0 group-hover:opacity-100 rounded-md border border-sky-400/40 px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-500/20 flex items-center gap-1">
                        <Layers className="w-3 h-3" /> + shots
                      </button>
                    )}
                  </div>
                ))
              ) : (
                pickerEntities === null ? <div className="p-6 text-center text-gray-500 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />loading entities…</div>
                : pickerEntities.length === 0 ? <div className="p-6 text-center text-gray-600 text-xs">No entities yet{picker.mode === "lock" ? " — create one first (ask the agent to propose it from the canvas)" : ""}.</div>
                : pickerEntities.map((e) => (
                  <button key={e.id} onClick={() => (picker.mode === "lock" ? void lockIntoEntity(e) : placeEntity(e))}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
                    {e.url
                      ? <img src={resolveUrl(e.url)} className="w-9 h-9 object-cover rounded-full" alt="" />
                      : <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center"><UserPlus className="w-3.5 h-3.5 text-gray-600" /></div>}
                    <div className="min-w-0">
                      <div className="text-xs text-gray-200 truncate">{e.name}</div>
                      <div className="text-[10px] text-gray-500">{e.gallery.length} album image{e.gallery.length === 1 ? "" : "s"}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {nodes.length === 0 && !picker && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-md">
            <Sparkles className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <div className="text-gray-400 text-sm">A blank field. No structure required.</div>
            <div className="text-gray-600 text-xs mt-1.5">
              Double-click anywhere to plant a generation — flip it to video and wired images
              become its references. Pull scenes, shots, or cast in with "From world" (they stay
              linked). Ask the agent to riff — it sees the field, labels what's emerging, and
              places its own nodes. When something keeps appearing, lock it: into a character's
              album, a style pin, or a draft event.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Edge visual grammar, extracted for clarity: live+identity = animated
 *  violet; live+style = animated amber dashed, labeled; dormant (source has
 *  no image yet) = static gray dashed — a wire that feeds nothing must not
 *  look like a wire that does. Wires INTO a video node never show the style
 *  treatment: video renders take references as plain images, and the visuals
 *  must not promise a distinction the backend can't honor. */
function displayEdgesFrom(edges: CanvasEdge[], urlOf: Map<string, string | undefined>, videoTargets?: Set<string>): CanvasEdge[] {
  return edges.map((e) => {
    const live = Boolean(urlOf.get(e.source));
    const isStyle = e.role === "style" && !videoTargets?.has(e.target);
    return {
      ...e,
      animated: live,
      ...(isStyle ? {
        label: "style",
        labelStyle: { fill: "#fbbf24", fontSize: 9 },
        labelBgStyle: { fill: "#1e1b2e", fillOpacity: 0.85 },
      } : {}),
      style: live
        ? { stroke: isStyle ? "#fbbf24" : "#a78bfa", ...(isStyle ? { strokeDasharray: "6 3" } : {}) }
        : { stroke: "#4b5563", strokeDasharray: "4 4" },
    };
  });
}

export function CanvasStudio(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export default CanvasStudio;

"use client";

/**
 * CanvasStudio — the free-form generative canvas (Michael 2026-07-31: "explore
 * a world visually and interactively... moving between structure and
 * non-structure to world build, discover, and create").
 *
 * Design language adapted from the Flora canvas spec, simplified onto OUR
 * substrate:
 *   - a NODE is a generation (prompt + model → image), with Flora's four
 *     states: idle (dashed) → configured (solid) → processing (pulsing) →
 *     resolved (media preview, double-click = lightbox)
 *   - EDGES are lineage AND the reference pipe: running a node sends every
 *     connected upstream node's image as referenceUrls into /render — our
 *     reference system is the type system, so "combine two nodes" is just
 *     drawing two wires into a third node. A wire carries IDENTITY by default;
 *     click it to flip to STYLE (rendering language only — no subject leak).
 *     Dormant wires (source not yet rendered) draw gray-dashed, live wires
 *     animate violet/amber, so a dead reference is never invisible.
 *   - the AGENT co-pilot is the studio chat rail (already beside the canvas);
 *     view_canvas gives it eyes, add_canvas_node gives it HANDS — its
 *     placements stage server-side and this component adopts them live.
 *   - every render is archived by the registry rule — wandering is never
 *     waste. Re-running a resolved node moves the old image to a sibling
 *     "take" node next door, so the field itself never loses a picture.
 *
 * Spawn: double-click empty pane (onPaneClick + detail===2 — React Flow v12
 * has no pane-scoped onDoubleClick prop; a naked onDoubleClick lands on the
 * wrapper div and fires for nodes/Controls/MiniMap too), or the dock button.
 * Persistence: one canvas per project (GET/PUT /api/narrative/canvas),
 * debounced, flushed on unmount.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, addEdge, Handle, Position, useReactFlow, useStore,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Play, Pin, ImagePlus, Sparkles, X, Check, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLightbox } from "@/components/studio/ImageLightbox";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
const resolveUrl = (u?: string) => (u && !u.startsWith("http") ? `${API_BASE}${u}` : u);

interface GenNodeData extends Record<string, unknown> {
  prompt: string;
  model: string;
  url?: string;
  status: "idle" | "running" | "done" | "error";
  error?: string;
  warning?: string; // server-surfaced render warnings (ref budget, photoreal rule)
  generatedAt?: string;
  raw?: boolean; // suppress project style for this node
  styleApplied?: boolean; // last render carried the project style leash
  pinned?: boolean; // pinned as a project style reference
  archived?: boolean; // a preserved previous take (spawned on re-run)
  fromAgent?: boolean; // placed by the agent via add_canvas_node
}

type GenNode = Node<GenNodeData, "gen">;
type CanvasEdge = Edge & { role?: "style" };

interface ModelOption { key: string; label: string; status: "live" | "down"; notes?: string; }
const FALLBACK_MODELS: ModelOption[] = [
  { key: "nano-banana", label: "NB2", status: "live" },
  { key: "gpt-image", label: "GPT-Image 2", status: "live" },
];

// ---------------------------------------------------------------------------
// The node. Flora states: idle = dashed 50%, configured = solid, processing =
// pulsing glow + frozen inputs, resolved = media preview (dbl-click lightbox).
// Handles: target (left) receives reference wires; source (right) feeds
// downstream nodes. Module-level (stable identity — the StyleStudio lesson).
// Below ~35% zoom the card collapses to just its picture (LOD) — controls at
// that scale are sub-pixel anyway.
// ---------------------------------------------------------------------------
function GenNodeView({ id, data, selected }: NodeProps<GenNode>) {
  const running = data.status === "running";
  const resolved = data.status === "done" && data.url;
  const configured = Boolean(data.prompt?.trim());
  const farOut = useStore((s) => s.transform[2] < 0.35);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onField = (patch: Partial<GenNodeData>) =>
    window.dispatchEvent(new CustomEvent("canvas:patch-node", { detail: { id, patch } }));
  const fire = (kind: string) =>
    window.dispatchEvent(new CustomEvent(`canvas:${kind}`, { detail: { id } }));
  const models: ModelOption[] =
    (typeof window !== "undefined" && (window as any).__canvasModels) || FALLBACK_MODELS;
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
          <img src={resolveUrl(data.url)} alt={data.prompt} className="w-full h-44 object-cover rounded-xl" draggable={false} />
        ) : (
          <div className="w-full h-44 flex items-center justify-center">
            {running ? <Loader2 className="w-8 h-8 animate-spin text-cyan-300" /> : <Sparkles className="w-8 h-8 text-gray-700" />}
          </div>
        )}
        <div className="px-2 py-1 text-[16px] text-gray-400 truncate">{data.prompt || "…"}</div>
      </div>
    );
  }

  return (
    <div className={frame}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-violet-400 !border-violet-200" title="References in — upstream node images ride into this generation" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-emerald-400 !border-emerald-200" title="Feed this image into downstream nodes" />

      {/* header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/10">
        <Sparkles className={cn("w-3.5 h-3.5", resolved ? "text-emerald-300" : "text-gray-500")} />
        <span className="text-[10px] uppercase tracking-wider text-gray-400 flex-1 truncate">
          {running ? "generating…" : resolved ? (data.model || "image") : "image node"}
        </span>
        {data.fromAgent && (
          <span title="Placed by the agent" className="flex items-center gap-0.5 text-[9px] text-violet-300"><Bot className="w-3 h-3" /></span>
        )}
        {data.archived && (
          <span title="A preserved previous take of its neighbor" className="text-[9px] text-gray-500">take</span>
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

      {/* media body */}
      {resolved ? (
        <img src={resolveUrl(data.url)} alt={data.prompt}
          onDoubleClick={() => fire("inspect-node")}
          title="Double-click to inspect full size"
          className="w-full h-44 object-cover cursor-zoom-in nodrag" draggable={false} />
      ) : (
        <div className="w-full h-24 flex items-center justify-center text-gray-600">
          {running ? <Loader2 className="w-6 h-6 animate-spin text-cyan-300" />
            : data.status === "error" ? <span className="text-[10px] text-rose-300 px-3 text-center">{data.error || "generation failed"}</span>
            : <span className="text-[10px] px-3 text-center">wire references in, write a prompt, run</span>}
        </div>
      )}

      {/* prompt + controls (frozen while processing — Flora state 3) */}
      <div className="p-2 space-y-1.5">
        <textarea
          value={data.prompt}
          onChange={(e) => onField({ prompt: e.target.value })}
          disabled={running}
          rows={2}
          placeholder="what should exist here?"
          className="nodrag w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40 resize-none disabled:opacity-50"
        />
        {data.warning && (
          <div className="text-[9px] text-amber-300/90 leading-tight px-0.5">{data.warning}</div>
        )}
        <div className="flex items-center gap-1.5">
          <select value={data.model} disabled={running}
            onChange={(e) => onField({ model: e.target.value })}
            title={models.find((m) => m.key === data.model)?.notes || "Pick the engine for this node"}
            className="nodrag rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-[10px] text-gray-300 focus:outline-none disabled:opacity-50 max-w-[110px]">
            {models.map((m) => (
              <option key={m.key} value={m.key} disabled={m.status === "down"} title={m.notes}>{m.label}{m.status === "down" ? " (down)" : ""}</option>
            ))}
          </select>
          <label className="nodrag flex items-center gap-1 text-[9px] text-gray-500 cursor-pointer" title="Raw: ignore the pinned project style for this node">
            <input type="checkbox" checked={Boolean(data.raw)} disabled={running} onChange={(e) => onField({ raw: e.target.checked })} />
            raw
          </label>
          <div className="flex-1" />
          {resolved && (
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
            title={resolved ? "Re-run — the current image is preserved as a 'take' node next door; this node re-generates" : "Generate"}
            className="nodrag rounded-lg bg-cyan-600 px-2.5 py-1 text-[10px] text-white hover:bg-cyan-500 disabled:opacity-40 flex items-center gap-1">
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run
          </button>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { gen: GenNodeView };

// ---------------------------------------------------------------------------
// The canvas.
// ---------------------------------------------------------------------------
function CanvasInner({ projectId }: { projectId: string | null }) {
  const { openLightbox } = useLightbox();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes] = useState<GenNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // refs mirror state for the event handlers (module-level node component
  // dispatches CustomEvents — no stale closures)
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const projectRef = useRef(projectId); projectRef.current = projectId;
  const loadedRef = useRef(loaded); loadedRef.current = loaded;

  // ---- model registry for node dropdowns (window-shared: the node component
  // is module-level and can't take props; nodes are nudged to re-render once
  // the registry lands, or pre-fetch nodes would show fallbacks forever) ----
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/narrative/models?kind=image`);
        if (r.ok) {
          const d = await r.json();
          (window as any).__canvasModels = (d.models || []).map((m: any) => ({
            key: m.key, label: m.label, status: m.status, notes: m.notes,
          }));
          setNodes((ns) => ns.map((n) => ({ ...n }))); // re-render existing nodes with real options
        }
      } catch { /* fallback stays */ }
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
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/narrative/canvas?projectId=${encodeURIComponent(projectId)}`);
        if (cancelled) return;
        if (r.ok) {
          const d = await r.json();
          const adopt = (arr: any[]) => (arr || []).map((n: any) => ({
            ...n,
            type: "gen",
            // a node mid-generation when the page closed: keep its last image
            // (done) if it had one, else back to idle — never hide a picture.
            data: { ...n.data, status: n.data?.status === "running" ? (n.data?.url ? "done" : "idle") : (n.data?.status || "idle") },
          }));
          const loadedNodes: GenNode[] = [...adopt(d.canvas?.nodes), ...adopt(d.canvas?.pendingAgentNodes)];
          const loadedEdges: CanvasEdge[] = [...(d.canvas?.edges || []), ...(d.canvas?.pendingAgentEdges || [])];
          setNodes(loadedNodes);
          setEdges(loadedEdges);
          if (loadedNodes.length > 0) {
            requestAnimationFrame(() => { try { fitView({ padding: 0.2, maxZoom: 1.25 }); } catch { /* not mounted yet */ } });
          }
        }
      } finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [projectId, fitView]);

  // ---- debounced save (+ flush on unmount so the last edits aren't lost) ----
  const persist = useCallback((keepalive = false) => {
    const pid = projectRef.current;
    if (!pid || !loadedRef.current) return Promise.resolve();
    return fetch(`${API_BASE}/api/narrative/canvas`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, keepalive,
      body: JSON.stringify({
        projectId: pid,
        nodes: nodesRef.current.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: edgesRef.current.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.role ? { role: e.role } : {}) })),
      }),
    }).then(() => setSavedAt(new Date().toLocaleTimeString()), () => { /* retry on next change */ });
  }, []);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(); }, 1200);
  }, [persist]);
  useEffect(() => () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); void persist(true); }
  }, [persist]);

  // ---- agent adoption: the agent's add_canvas_node placements stage in
  // pendingAgentNodes/Edges server-side; poll while open and pull them onto
  // the field. The follow-up save persists them into nodes[], which clears
  // them from staging (the server only clears ADOPTED ids). ----
  useEffect(() => {
    if (!projectId || !loaded) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/narrative/canvas?projectId=${encodeURIComponent(projectId)}`);
        if (!r.ok) return;
        const d = await r.json();
        const pendingNodes: any[] = d.canvas?.pendingAgentNodes || [];
        const pendingEdges: any[] = d.canvas?.pendingAgentEdges || [];
        if (!pendingNodes.length && !pendingEdges.length) return;
        const localIds = new Set(nodesRef.current.map((n) => n.id));
        const freshNodes = pendingNodes.filter((n) => n?.id && !localIds.has(n.id));
        const afterIds = new Set<string>(Array.from(localIds).concat(freshNodes.map((n) => n.id)));
        const localEdgeIds = new Set(edgesRef.current.map((e) => e.id));
        const freshEdges = pendingEdges.filter((e) => e?.id && !localEdgeIds.has(e.id) && afterIds.has(e.source) && afterIds.has(e.target));
        if (!freshNodes.length && !freshEdges.length) return;
        if (freshNodes.length) setNodes((ns) => [...ns, ...freshNodes.map((n) => ({ ...n, type: "gen" as const }))]);
        if (freshEdges.length) setEdges((es) => [...es, ...freshEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.role ? { role: e.role } : {}) }))]);
        scheduleSave();
      } catch { /* next tick */ }
    }, 4000);
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

  // Derived edge visuals — live (source resolved) vs dormant, identity vs
  // style. Derived at render, never persisted, so styling survives reloads by
  // construction and a dead reference wire is visibly dead.
  const displayEdges = useMemo(() => {
    const urlOf = new Map(nodes.map((n) => [n.id, n.data.url]));
    return displayEdgesFrom(edges, urlOf);
  }, [nodes, edges]);

  // ---- spawn ----
  const addNodeAt = useCallback((flowPos: { x: number; y: number }, prompt = "") => {
    const id = `cnode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setNodes((ns) => [...ns, {
      id, type: "gen", position: flowPos,
      data: { prompt, model: "nano-banana", status: "idle" },
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
      if (n?.data.url) openLightbox(resolveUrl(n.data.url)!, n.data.prompt);
    };
    const pin = async (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const n = nodesRef.current.find((x) => x.id === id);
      const pid = projectRef.current;
      if (!n?.data.url || !pid) return;
      try {
        const r = await fetch(`${API_BASE}/api/narrative/assets/style-reference-from-url`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: pid, imageUrl: n.data.url, label: `style: canvas — ${(n.data.prompt || "").slice(0, 40)}`, description: n.data.prompt }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "pin failed");
        setNodes((ns) => ns.map((x) => x.id === id ? { ...x, data: { ...x.data, pinned: true } } : x));
      } catch (err: any) {
        setNodes((ns) => ns.map((x) => x.id === id ? { ...x, data: { ...x.data, error: `pin failed: ${String(err.message || err).slice(0, 120)}`, status: x.data.url ? x.data.status : "error" } } : x));
      }
      scheduleSave();
    };
    const run = async (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const pid = projectRef.current;
      const node = nodesRef.current.find((x) => x.id === id);
      if (!node || !pid || !node.data.prompt?.trim()) return;
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
      // Re-run preserves the current image as a sibling "take" node next door
      // (nothing on the field is ever lost — the tooltip's promise, kept).
      if (node.data.url && node.data.status === "done") {
        const takeId = `cnode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setNodes((ns) => [...ns, {
          id: takeId, type: "gen",
          position: { x: node.position.x - 320, y: node.position.y + 24 },
          data: {
            prompt: node.data.prompt, model: node.data.model, url: node.data.url,
            status: "done", generatedAt: node.data.generatedAt, archived: true,
            ...(node.data.raw ? { raw: true } : {}),
          },
        }]);
      }
      setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, status: "running", error: undefined, warning: undefined } } : n));
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
        if (projectRef.current !== pid) return; // project switched mid-flight — this result belongs to the old field (it's archived server-side)
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
    window.addEventListener("canvas:run-node", run);
    return () => {
      window.removeEventListener("canvas:patch-node", patch);
      window.removeEventListener("canvas:delete-node", del);
      window.removeEventListener("canvas:inspect-node", inspect);
      window.removeEventListener("canvas:pin-node", pin);
      window.removeEventListener("canvas:run-node", run);
    };
  }, [openLightbox, scheduleSave]);

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
          onClick={() => addNodeAt(screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))}
          className="flex items-center gap-1.5 rounded-full bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500">
          <ImagePlus className="w-3.5 h-3.5" /> Image node
        </button>
        <span className="text-[10px] text-gray-500 pr-1">
          double-click to spawn · wire nodes to combine · click a wire to flip identity ↔ style · the agent sees this field and can place nodes (ask it to riff)
        </span>
        {savedAt && <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />{savedAt}</span>}
      </div>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-md">
            <Sparkles className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <div className="text-gray-400 text-sm">A blank field. No structure required.</div>
            <div className="text-gray-600 text-xs mt-1.5">
              Double-click anywhere to plant a generation. Wire nodes together and their images
              become references for the next one. Ask the agent to riff — it sees the field and
              places its own nodes. When something keeps appearing — a face, a look, a place —
              it can graduate into an entity, a style, or an event.
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
 *  look like a wire that does. */
function displayEdgesFrom(edges: CanvasEdge[], urlOf: Map<string, string | undefined>): CanvasEdge[] {
  return edges.map((e) => {
    const live = Boolean(urlOf.get(e.source));
    const isStyle = e.role === "style";
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

export function CanvasStudio({ projectId }: { projectId: string | null }) {
  return (
    <ReactFlowProvider>
      <CanvasInner projectId={projectId} />
    </ReactFlowProvider>
  );
}

export default CanvasStudio;

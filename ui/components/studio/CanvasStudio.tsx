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
 * reference pipe. Every wire says what it carries in words — "same subject" by
 * default, "look only" once flipped — dormant wires draw thin and gray,
 * re-running preserves the old image as a sibling "take", and everything is
 * archived by the registry rule.
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
  UserPlus, RefreshCw, ExternalLink, Layers, Combine, Globe, Receipt, Copy, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLightbox } from "@/components/studio/ImageLightbox";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
const resolveUrl = (u?: string) =>
  (u && !u.startsWith("http") && !u.startsWith("data:") && !u.startsWith("blob:") ? `${API_BASE}${u}` : u);
const mintClientId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Where a new card is allowed to land, in card-steps out from the spot we
// wanted: that spot first, then rings around it. Nothing ever lands exactly on
// something already there, and new work still appears where you are looking.
const PLACE_STEP = { x: 230, y: 175 };
const PLACE_SPOTS: Array<[number, number]> = [
  [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
  [2, 0], [0, 2], [-2, 0], [0, -2], [2, 1], [-2, 1], [2, -1], [-2, -1],
  [1, 2], [-1, 2], [1, -2], [-1, -2], [2, 2], [-2, 2], [2, -2], [-2, -2],
];
const CARD_W = 288; // w-72

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
  startedAt?: number; // when this run began — the card shows its age while it works
  durationSec?: number; // video
  generatedAt?: string;
  raw?: boolean; // suppress project style for this node
  styleApplied?: boolean; // last render carried the project style leash
  pinned?: boolean; // pinned as a project style reference
  archived?: boolean; // a preserved previous take (spawned on re-run)
  fromAgent?: boolean; // placed by the agent via add_canvas_node
  source?: NodeSource; // provenance — where in the linear system this came from
  entityRefs?: Array<{ id: string; name: string }>; // locked into entity albums (one node can reference several)
  // THE RECEIPT — the generation's provenance, passed by the agent on
  // add_canvas_node. Shapes vary by producer: render tools emit
  // {description, type}; the sequence engine emits {order, role, label, url}.
  backend?: string;
  styleId?: string;
  styleName?: string;
  referencesAttached?: Array<{ description?: string; type?: string; order?: number; role?: string; label?: string; url?: string }>;
}

/** Older agent nodes persisted entityRefs as bare id strings — read both. */
const normEntityRefs = (refs?: GenNodeData["entityRefs"]): Array<{ id: string; name: string }> =>
  (refs || []).map((r: any) => (typeof r === "string" ? { id: r, name: r } : r)).filter((r) => r?.id);

/** What a card can actually feed downstream. A card in an error state shows no
 *  picture — its image went missing, or its render failed — so its wire must
 *  not claim to be carrying one, and Run must not post the dead url onward. */
const feedUrl = (d?: GenNodeData): string | undefined => (!d || d.status === "error" ? undefined : d.url);

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

// THE ENGINES, IN A CREATOR'S WORDS. The registry's own `label` is a codename
// ("NB2") and its `notes` are operator prose written for the agent — API keys,
// file paths, per-second prices. Neither belongs on a hover state, so the card
// reads from this table instead: a name you can say out loud, and the one fact
// that decides whether you pick it. An engine we don't know yet shows its name
// and no claim at all — better silent than leaking the changelog.
const ENGINE_COPY: Record<string, { name: string; fact: string }> = {
  "nano-banana": { name: "Nano Banana", fact: "Holds a character's face and wardrobe across shots. The default." },
  "nano-banana-pro": { name: "Nano Banana Pro", fact: "Slower, stronger — busy compositions and readable text in the frame." },
  "nano-banana-legacy": { name: "Nano Banana (old)", fact: "The older one. Here to reproduce older images; 3 references max." },
  "gpt-image": { name: "GPT-Image 2", fact: "Follows written art direction best. Weak on faces — don't cast with it." },
  "flux-2": { name: "FLUX.2 Pro", fact: "Up to 8 references, and it can match the look of one of them." },
  "seedream": { name: "Seedream 5", fact: "Stylised and anime-leaning. Never feed it photoreal faces." },
  "veo": { name: "Veo 3.1", fact: "Photoreal clips with sound, up to 8 seconds." },
  "seedance-video": { name: "Seedance 2", fact: "Animation and stylised motion, up to 15s. No photoreal faces." },
  "flux-3": { name: "FLUX 3", fact: "The long take — up to 20s with sound, in one go." },
  "minimax-h3": { name: "MiniMax H3", fact: "Photoreal clips up to 15s, several references at once." },
};
// The "From world" tabs, in the production's nouns rather than the system's.
const PICKER_TABS = [
  { key: "scenes", label: "Scenes" },
  { key: "entities", label: "Cast & places" },
  { key: "generated", label: "Everything generated" },
] as const;

const engineNameOf = (key?: string) => (key ? ENGINE_COPY[key]?.name || key : "");
const engineName = (m: ModelOption) => ENGINE_COPY[m.key]?.name || m.label;
const engineFact = (m: ModelOption) => ENGINE_COPY[m.key]?.fact;

// ---------------------------------------------------------------------------
// The node. Flora states: idle = dashed, configured = solid, processing =
// glowing border + frozen inputs, resolved = media preview (dbl-click lightbox
// for images; native controls for video). Below 60% zoom the card's controls
// are too small to read or hit, so it collapses to its picture and its name
// (LOD) — an honest picture beats a fake-usable cockpit. Module-level (stable
// identity).
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
  const farOut = useStore((s) => s.transform[2] < 0.6);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A working card says how long it has been working — a spinner with no age
  // is the difference between "twenty seconds in" and "stuck since Tuesday".
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setClock(Date.now());
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const workingFor = running && typeof data.startedAt === "number"
    ? (() => {
        const s = Math.max(0, Math.round((clock - data.startedAt!) / 1000));
        return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
      })()
    : null;
  const onField = (patch: Partial<GenNodeData>) =>
    window.dispatchEvent(new CustomEvent("canvas:patch-node", { detail: { id, patch } }));
  const fire = (kind: string) =>
    window.dispatchEvent(new CustomEvent(`canvas:${kind}`, { detail: { id } }));
  // THE ENGINE IS THE MEDIUM. One dropdown in two groups — pick a clip engine
  // and the card becomes a clip. Once something has been rendered the medium is
  // settled, so only same-medium engines stay on offer and the card can never
  // end up labelled one thing and holding another.
  const settled = Boolean(resolved) || running;
  const stillEngines = settled && isVideo ? [] : modelsFor("image");
  const clipEngines = settled && !isVideo ? [] : modelsFor("video");
  const currentEngine = [...stillEngines, ...clipEngines].find((m) => m.key === data.model);
  // A card with no name of its own says what it IS — in its own words if it has
  // any, otherwise the plainest noun there is. Never an engine key: which engine
  // rendered this lives in the receipt, and the header's guess can be wrong.
  const headerFallback = data.archived ? "earlier take"
    : data.prompt?.trim() ? data.prompt.trim().slice(0, 60)
    : resolved ? (isVideo ? "clip" : "image")
    : (isVideo ? "new video" : "new image");
  // One rule for removing a card: it asks once. (Backspace/Delete asks the same
  // question at the canvas level — see handleBeforeDelete.)
  const requestDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    fire("delete-node");
  };

  // A card is an OBJECT on the field: its own surface, lifted off the ground by
  // a real contrast step and a top rim-light (a black shadow on a near-black
  // field renders nothing). Running glows at the border — it never breathes the
  // picture. Selection is a white ring, laid OVER the card's own colour, so
  // clicking a card never disguises it as something else.
  const frame = cn(
    "w-72 rounded-xl border bg-slate-800/95 transition-all",
    running
      ? "border-cyan-400/80 shadow-[0_0_20px_-2px_rgba(34,211,238,0.45),0_12px_28px_-12px_rgba(0,0,0,0.9)]"
      : "shadow-[0_12px_28px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)]",
    !running && (
      // a shelved take is history, not the live card — it recedes
      data.archived ? "border-white/10 opacity-70 hover:opacity-100"
        : data.source ? "border-sky-400/40"
        : data.fromAgent ? "border-violet-400/50"
        : resolved || configured ? "border-white/25"
        : "border-dashed border-white/25"
    ),
    selected && "ring-2 ring-white/70",
  );

  // LOD: far-out zoom renders just the picture (or state color) + one line.
  if (farOut) {
    return (
      <div className={frame}>
        <Handle type="target" position={Position.Left} className="!w-4 !h-4 !bg-slate-300 !border-slate-500" />
        <Handle type="source" position={Position.Right} className="!w-4 !h-4 !bg-slate-300 !border-slate-500" />
        {resolved ? (
          isVideo
            ? <video src={resolveUrl(data.url)} muted loop playsInline
                onError={() => onField({ status: "error", error: "this clip is no longer where it was saved" })}
                className="w-full h-44 object-cover rounded-t-xl" />
            : <img src={resolveUrl(data.url)} alt={data.prompt}
                onError={() => onField({ status: "error", error: "this image is no longer where it was saved" })}
                className="w-full h-44 object-cover rounded-t-xl" draggable={false} />
        ) : (
          <div className="w-full h-44 flex items-center justify-center">
            {running ? <Loader2 className="w-8 h-8 animate-spin text-cyan-300" />
              : data.status === "error" ? <X className="w-8 h-8 text-rose-400" />
              : <Sparkles className="w-8 h-8 text-gray-500" />}
          </div>
        )}
        <div className="px-2.5 py-1.5 text-[18px] leading-tight font-medium text-gray-200 truncate">{data.label || data.prompt || "…"}</div>
      </div>
    );
  }

  return (
    <div className={frame}>
      <Handle type="target" position={Position.Left} className="!w-4 !h-4 !bg-slate-300 !border-slate-500" title="References in — drop a wire here to use another card as a reference" />
      <Handle type="source" position={Position.Right} className="!w-4 !h-4 !bg-slate-300 !border-slate-500" title="Drag from here to use this card as a reference somewhere else" />

      {/* header — the creator's own name for this card comes FIRST and keeps the
          room: the system's marks are a tight cluster of small icons after it,
          each one saying what it means on hover. Never uppercased; a label is
          the creator's words, in their case. */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/10">
        {isVideo
          ? <Clapperboard className="w-3.5 h-3.5 shrink-0 text-gray-300" />
          : <Sparkles className="w-3.5 h-3.5 shrink-0 text-gray-300" />}
        <span className={cn("text-[11px] flex-1 min-w-0 truncate", data.label ? "text-gray-100" : "text-gray-400")}
          title={data.label || data.prompt || undefined}>
          {running ? (isVideo ? "rendering video…" : "generating…") : (data.label || headerFallback)}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {data.fromAgent && (
            <span title="Placed by the agent" className="text-violet-300"><Bot className="w-3 h-3" /></span>
          )}
          {(() => {
            const ents = normEntityRefs(data.entityRefs);
            return ents.length > 0 && (
              <span title={`Kept as a reference for ${ents.map((r) => r.name).join(", ")} — click to open`} onClick={() => fire("open-entity-ref")}
                className="nodrag cursor-pointer text-emerald-300 hover:text-emerald-200">
                <UserPlus className="w-3 h-3" />
              </span>
            );
          })()}
          {/* the project's look has ONE home on this card — the "look:" switch
              in the controls below, and the Pin button beside it. A second,
              read-only copy of both up here taught nothing and said it twice. */}
        </span>
        {/* nodrag: without it the press starts a card drag and d3 swallows the
            click, so the confirm never lands. */}
        {/* removable even mid-render: the result is archived server-side either
            way, so a card you no longer want is never a trap */}
        <button onClick={requestDelete}
          title={confirmDelete ? "Click again to remove this card and its wires" : "Remove this card"}
          className={cn("nodrag shrink-0 flex items-center gap-0.5 rounded px-1 py-0.5",
            confirmDelete ? "bg-rose-500/20 text-rose-200" : "text-gray-400 hover:text-rose-300")}>
          {confirmDelete && <span className="text-[9px] leading-none">delete?</span>}
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* provenance chip — this node came FROM the linear system and stays linked */}
      {data.source && (
        <div className="flex items-center gap-1 px-2.5 py-1 border-b border-white/5 bg-sky-500/5">
          <button onClick={() => fire("open-source")} title="Open this where it lives in the world"
            className="nodrag flex items-center gap-1 text-[10px] text-sky-300 hover:underline min-w-0">
            {data.source.kind === "entity" ? <UserPlus className="w-2.5 h-2.5 shrink-0" /> : data.source.kind === "shot" ? <Film className="w-2.5 h-2.5 shrink-0" /> : <Clapperboard className="w-2.5 h-2.5 shrink-0" />}
            <span className="truncate">{data.source.title || data.source.sceneId || data.source.entityId}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </button>
          <div className="flex-1" />
          {data.source.kind === "scene" && (
            <button onClick={() => fire("break-scene")} title="Lay this scene's shots out on the field, wired"
              className="nodrag text-[10px] text-sky-300 hover:text-sky-200 flex items-center gap-0.5"><Layers className="w-3 h-3" />shots</button>
          )}
          <button onClick={() => fire("resync-source")} title="Fetch this again from the world"
            className="nodrag text-gray-400 hover:text-sky-300"><RefreshCw className="w-3 h-3" /></button>
        </div>
      )}

      {/* WHAT WENT WRONG / WHAT THE RENDER SAID — above the picture, so it
          shows on every card. Pin, Lock and Resync all speak here; before this
          they wrote into a slot only half the cards could ever draw. */}
      {data.error && (
        <div className="px-2.5 py-1 border-b border-rose-400/30 bg-rose-500/15 text-[10px] leading-snug text-rose-200">{data.error}</div>
      )}
      {/* a note from the render, not a fault — neutral, because amber on this
          field means "the project's look" and rose means "it failed" */}
      {data.warning && (
        <div className="px-2.5 py-1 border-b border-white/10 bg-white/5 text-[10px] leading-snug text-gray-200">{data.warning}</div>
      )}

      {/* media body */}
      {resolved ? (
        isVideo ? (
          <video src={resolveUrl(data.url)} controls muted loop playsInline
            onError={() => onField({ status: "error", error: "this clip is no longer where it was saved" })}
            className="w-full h-44 object-cover nodrag bg-black" />
        ) : (
          <img src={resolveUrl(data.url)} alt={data.prompt}
            onDoubleClick={() => fire("inspect-node")}
            onError={() => onField({ status: "error", error: "this image is no longer where it was saved" })}
            title="Double-click to inspect full size"
            className="w-full h-44 object-cover cursor-zoom-in nodrag" draggable={false} />
        )
      ) : (
        <div className="w-full h-24 flex items-center justify-center text-gray-300">
          {running ? (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-300" />
                {workingFor && <span className="text-[11px] tabular-nums text-cyan-200">{workingFor}</span>}
              </div>
              {isVideo && <span className="text-[10px] text-cyan-200/90 px-3 text-center">video takes a few minutes — safe to reload, it keeps rendering</span>}
            </div>
          ) : data.status === "error" ? (
            <span className="text-[11px] text-gray-300 px-3 text-center">
              {isSourceNode ? "nothing to show — hit refresh above" : data.error ? "nothing landed — run it again" : "that didn't work — run it again"}
            </span>
          )
            : <span className="text-[11px] px-3 text-center">wire references in, write a prompt, run</span>}
        </div>
      )}

      {/* label (shown when set or selected — the field stays quiet otherwise) */}
      {(selected || data.label) && (
        <div className="px-2 pt-1.5">
          <input
            value={data.label || ""}
            onChange={(e) => onField({ label: e.target.value || undefined })}
            placeholder="name this card — e.g. 'Aria, candidate 3'"
            className="nodrag w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-white/40"
          />
        </div>
      )}

      {/* source nodes are read-only snapshots — wire them into a fresh node to riff */}
      {isSourceNode ? (
        <div className="px-2.5 py-1.5 text-[10px] leading-snug text-gray-300">a snapshot from the world — wire it into a new card to build on it</div>
      ) : (
      /* prompt + controls (frozen while processing — Flora state 3). nowheel:
         scrolling a long prompt scrolls the PROMPT, not the whole field. */
      <div className="p-2 space-y-1.5">
        <textarea
          value={data.prompt}
          onChange={(e) => onField({ prompt: e.target.value })}
          disabled={running}
          rows={3}
          placeholder={isVideo ? "what happens in this clip?" : "what should exist here?"}
          className="nodrag nowheel w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-cyan-500/60 resize-y disabled:opacity-50"
        />
        <div className="flex items-center gap-1.5">
          {/* ONE choice, not two: the engine you pick is the medium you get.
              "Still or moving?" used to be asked by a separate unlabeled flip
              before there was anything to decide it with. */}
          <select value={data.model} disabled={running}
            onChange={(e) => {
              const key = e.target.value;
              onField({ model: key, kind: clipEngines.some((m) => m.key === key) ? "video" : "image" });
            }}
            title={currentEngine
              ? `${engineName(currentEngine)}${engineFact(currentEngine) ? ` — ${engineFact(currentEngine)}` : ""}`
              : "Which engine renders this card"}
            className="nodrag min-w-0 rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-[10px] text-gray-300 focus:outline-none disabled:opacity-50 max-w-[124px]">
            {/* an engine we no longer offer still names itself, rather than
                showing the card as blank */}
            {!currentEngine && <option value={data.model}>{engineNameOf(data.model)}</option>}
            {stillEngines.length > 0 && (
              <optgroup label="Stills">
                {stillEngines.map((m) => (
                  <option key={m.key} value={m.key} disabled={m.status === "down"} title={engineFact(m)}>{engineName(m)}{m.status === "down" ? " (down)" : ""}</option>
                ))}
              </optgroup>
            )}
            {clipEngines.length > 0 && (
              <optgroup label="Moving">
                {clipEngines.map((m) => (
                  <option key={m.key} value={m.key} disabled={m.status === "down"} title={engineFact(m)}>{engineName(m)}{m.status === "down" ? " (down)" : ""}</option>
                ))}
              </optgroup>
            )}
          </select>
          {isVideo ? (
            /* clip length is a choice, not a typing exercise — a number field
               here snapped back to 5 the moment you cleared it to retype */
            <select value={data.durationSec || 5} disabled={running}
              onChange={(e) => onField({ durationSec: Number(e.target.value) })}
              title="How long this clip runs"
              className="nodrag rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-[10px] text-gray-300 focus:outline-none disabled:opacity-50">
              {Array.from(new Set([5, 10, 15, data.durationSec || 5])).sort((a, b) => a - b)
                .map((s) => <option key={s} value={s}>{s}s</option>)}
            </select>
          ) : (
            /* THE PROJECT'S LOOK, on or off for this card — the one place the
               idea lives, and it says which it is in words rather than asking
               anyone to read the difference between two shades of an icon.
               (Amber means "the project's look" everywhere on this field.) */
            <button onClick={() => onField({ raw: !data.raw })} disabled={running}
              title={data.raw
                ? "This card renders WITHOUT the project's look. Click to bring it back."
                : "The project's look rides along on this card. Click to render without it."}
              className={cn("nodrag shrink-0 flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[10px] disabled:opacity-50",
                data.raw
                  ? "border-white/10 bg-black/40 text-gray-400 hover:text-gray-200"
                  : "border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20")}>
              <Palette className="w-3 h-3" />look: {data.raw ? "off" : "on"}
            </button>
          )}
          <div className="flex-1" />
          {resolved && !isVideo && (
            <button onClick={() => fire("lock-node")}
              title={data.entityRefs?.length ? `Kept as a reference for ${normEntityRefs(data.entityRefs).map((r) => r.name).join(", ")} — add it to another?` : "Keep this as a reference for someone in the cast, or a place (\"this IS Aria\")"}
              className={cn("nodrag rounded-lg border px-1.5 py-1 text-[10px]",
                data.entityRefs?.length
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                  : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25")}>
              <UserPlus className="w-3 h-3" />
            </button>
          )}
          {resolved && !isVideo && (
            <button onClick={() => fire("pin-node")}
              title={data.pinned ? "Already the project's look" : "Make this the project's look — every render can carry it"}
              className={cn("nodrag rounded-lg border px-1.5 py-1 text-[10px]",
                data.pinned
                  ? "border-amber-400/70 bg-amber-500/25 text-amber-200"
                  : "border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/25")}>
              <Pin className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* the one thing this card is for gets its own line, at full width —
            it stopped competing for room with the settings that feed it */}
        {running ? (
          /* an exit from the wait — the render keeps going server-side and
             lands in the archive either way, so this only stops watching */
          <button onClick={() => onField({ status: "error", error: "you stopped waiting — if it finishes it lands in the archive", jobId: undefined, startedAt: undefined })}
            title="Stop waiting on this one. The render carries on and its result is archived — this card just stops watching."
            className="nodrag w-full rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-[10px] text-gray-300 hover:border-rose-400/50 hover:text-rose-200">
            Stop waiting
          </button>
        ) : (
          <button onClick={() => fire("run-node")} disabled={!configured}
            title={resolved ? "Run again — what you have now is kept as a take, just below this card" : "Make it"}
            className="nodrag w-full rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[11px] text-white hover:bg-cyan-500 disabled:opacity-40 flex items-center justify-center gap-1.5">
            <Play className="w-3 h-3" /> {resolved ? "Run again" : "Run"}
          </button>
        )}
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
  const { screenToFlowPosition, flowToScreenPosition, fitView, setViewport } = useReactFlow();
  const [nodes, setNodes] = useState<GenNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ mode: "place" | "lock"; lockNodeId?: string; tab: "scenes" | "entities" | "generated" } | null>(null);
  const [pickerScenes, setPickerScenes] = useState<PickerScene[] | null>(null);
  const [pickerEntities, setPickerEntities] = useState<PickerEntity[] | null>(null);
  // The whole generated archive, droppable onto the field — "explore them
  // further for jewels and gems."
  const [pickerAssets, setPickerAssets] = useState<Array<{ id: string; url: string; name?: string; video?: boolean }> | null>(null);
  // null on a list means LOADING and nothing else — when a fetch fails the list
  // becomes empty and this says why, with a way to try again.
  const [pickerError, setPickerError] = useState<string | null>(null);
  // One search box over whichever list is open — a real production has sixty
  // scenes and forty characters, and scrolling is not finding.
  const [pickerQuery, setPickerQuery] = useState("");
  // What the agent just dropped on the field — a transient chip in the dock,
  // because nodes can arrive far from where you are looking.
  const [arrived, setArrived] = useState<string[] | null>(null);
  const arrivedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Deleting from the keyboard asks once, exactly like the card's own × does.
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const deleteArmRef = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedProjectRef = useRef<string | null>(null);
  const persistRef = useRef<(keepalive?: boolean, projectIdOverride?: string | null) => Promise<void>>(
    () => Promise.resolve(),
  );
  const viewportRef = useRef<Viewport | null>(null);
  const ackPatchesRef = useRef<Set<string>>(new Set());
  // refs mirror state for the event handlers (module-level node component
  // dispatches CustomEvents — no stale closures)
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const projectRef = useRef(projectId); projectRef.current = projectId;
  const loadedRef = useRef(loaded); loadedRef.current = loaded;

  // ---- PLACEMENT — one helper behind every "put a card on the field" ----
  /** Nudge a wanted spot until it is clear of every card already there. */
  const freeSpot = useCallback((want: { x: number; y: number }) => {
    const clash = (p: { x: number; y: number }) => nodesRef.current.some(
      (n) => Math.abs(n.position.x - p.x) < 200 && Math.abs(n.position.y - p.y) < 140);
    for (const [sx, sy] of PLACE_SPOTS) {
      const p = { x: want.x + sx * PLACE_STEP.x, y: want.y + sy * PLACE_STEP.y };
      if (!clash(p)) return p;
    }
    const n = nodesRef.current.length; // crowded field — keep walking out
    return { x: want.x + 3 * PLACE_STEP.x + n * 20, y: want.y + 3 * PLACE_STEP.y + n * 16 };
  }, []);

  /** The stretch of field you can actually see, in flow coordinates. */
  const visibleRect = useCallback(() => {
    const r = paneRef.current?.getBoundingClientRect();
    if (!r || r.width < 1) return null;
    const tl = screenToFlowPosition({ x: r.left, y: r.top });
    const br = screenToFlowPosition({ x: r.right, y: r.bottom });
    return { x1: tl.x, y1: tl.y, x2: br.x, y2: br.y };
  }, [screenToFlowPosition]);

  /** Where a new card lands: centred on the CANVAS itself — the window is the
   *  wrong ruler, the canvas is inset by the rail and the chat — and never on
   *  top of a card that is already there. */
  const placePos = useCallback(() => {
    const r = paneRef.current?.getBoundingClientRect();
    const screen = r && r.width > 0
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const c = screenToFlowPosition(screen);
    return freeSpot({ x: c.x - CARD_W / 2, y: c.y - 120 });
  }, [screenToFlowPosition, freeSpot]);

  /** Glide the view to a set of nodes (the agent's arrivals). */
  const showNodes = useCallback((ids: string[]) => {
    const live = ids.filter((id) => nodesRef.current.some((n) => n.id === id));
    if (!live.length) return;
    try { fitView({ nodes: live.map((id) => ({ id })), padding: 0.45, duration: 700, maxZoom: 1.1 }); }
    catch { /* not mounted */ }
  }, [fitView]);

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
    const previousProjectId = loadedProjectRef.current;
    if (previousProjectId === projectId && loadedRef.current) return;

    // Flush A with A's explicit id before resetting the field for B. Merely
    // clearing this timer discarded the creator's last 1.2 seconds of work.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (previousProjectId && previousProjectId !== projectId) {
        void persistRef.current(true, previousProjectId);
      }
    }
    loadedProjectRef.current = projectId;
    if (!projectId) return;
    setLoaded(false);
    setSavedAt(null);
    setSaveError(null);
    setNodes([]);
    setEdges([]);
    setPicker(null);
    setPickerScenes(null);
    setPickerEntities(null);
    setPickerError(null);
    setArrived(null);
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
          const adopt = (arr: any[]) => (arr || []).map((n: any) => {
            const d = n.data || {};
            // A card that still has its picture opens SHOWING it: last
            // session's failure isn't this session's truth. If the picture
            // really is gone it says so again the instant it fails to load.
            const healed = d.status === "error" && Boolean(d.url);
            return {
              ...n,
              type: "gen",
              // a node mid-generation when the page closed: a VIDEO node with a
              // jobId stays 'running' — the durable job survived and polling
              // resumes below; an image node keeps its last picture (done) or
              // drops to idle. Never hide a picture.
              data: {
                ...d,
                ...(healed ? { error: undefined } : {}),
                status: d.status === "running"
                  ? (d.kind === "video" && d.jobId ? "running" : (d.url ? "done" : "idle"))
                  : healed ? "done" : (d.status || "idle"),
              },
            };
          });
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
  const persist = useCallback((keepalive = false, projectIdOverride?: string | null) => {
    const pid = projectIdOverride ?? projectRef.current;
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
    const deadLetter = () => {
      try {
        localStorage.setItem(`canvas:pending:${pid}`, body);
      } catch (error) {
        console.error("Canvas save could not be queued locally:", error);
      }
    };
    if (keepalive && new Blob([body]).size > 60_000) {
      deadLetter();
      return Promise.resolve();
    }
    return fetch(`${API_BASE}/api/narrative/canvas`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, keepalive, body,
    }).then(
      (r) => {
        if (!r.ok) {
          deadLetter();
          // truthful: nothing retries on its own — the next attempt rides the
          // next edit, or the reopen that reconciles the dead-letter
          if (projectRef.current === pid) setSaveError("Not saved — will retry on your next edit or reopen");
          return; // nothing was saved — keep acks, no green check
        }
        acked.forEach((id) => ackPatchesRef.current.delete(id));
        removedPendingNodeIds.forEach((id) => seenPendingNodeIds.current.delete(id));
        removedPendingEdgeIds.forEach((id) => seenPendingEdgeIds.current.delete(id));
        try { localStorage.removeItem(`canvas:pending:${pid}`); } catch { /* ignore */ }
        if (projectRef.current === pid) {
          setSaveError(null);
          setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        }
      },
      (error) => {
        deadLetter();
        if (projectRef.current === pid) setSaveError("Not saved — will retry on your next edit or reopen");
        console.error("Canvas save failed:", error);
      },
    );
  }, []);
  persistRef.current = persist;
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist();
    }, 1200);
  }, [persist]);
  useEffect(() => () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); void persist(true); }
    if (arrivedTimer.current) clearTimeout(arrivedTimer.current);
    if (deleteArmRef.current) clearTimeout(deleteArmRef.current.timer);
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
          // The agent works in a fresh column past everything on the field —
          // usually nowhere near what you're looking at. Say it arrived, and
          // if it landed entirely out of sight, glide over to it.
          const ids: string[] = freshNodes.map((n) => n.id);
          setArrived((prev) => [...(prev || []), ...ids]);
          if (arrivedTimer.current) clearTimeout(arrivedTimer.current);
          arrivedTimer.current = setTimeout(() => setArrived(null), 15000);
          const v = visibleRect();
          const outOfSight = Boolean(v) && freshNodes.every((n) => {
            const p = n.position || { x: 0, y: 0 };
            return p.x > v!.x2 || p.x + CARD_W < v!.x1 || p.y > v!.y2 || p.y + 200 < v!.y1;
          });
          // never yank the view out from under someone mid-sentence
          const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
          if (outOfSight && !typing) setTimeout(() => showNodes(ids), 250); // let them mount + measure
        }
        if (freshEdges.length) {
          freshEdges.forEach((e) => seenPendingEdgeIds.current.add(e.id));
          setEdges((es) => [...es, ...freshEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.role ? { role: e.role } : {}) }))]);
        }
        if (applicablePatches.length) {
          // Ack ONLY patches that matched a live node — a patch for a node the
          // creator deleted must not be reported as adopted.
          // The patch carries the agent's EDIT, never its authorship: a card
          // the agent merely renamed is still yours, and "placed by the agent"
          // must stay true or the seam between you and it stops meaning
          // anything. Only add_canvas_node sets fromAgent.
          const matchedIds = new Set<string>();
          applicablePatches.forEach((p) => { if (nodesRef.current.some((n) => n.id === p.nodeId)) matchedIds.add(p.id); });
          setNodes((ns) => ns.map((n) => {
            const mine = applicablePatches.filter((p) => p.nodeId === n.id);
            if (!mine.length) return n;
            return { ...n, data: { ...n.data, ...Object.assign({}, ...mine.map((p) => p.patch || {})) } };
          }));
          applicablePatches.forEach((p) => { if (matchedIds.has(p.id)) ackPatchesRef.current.add(p.id); });
        }
        scheduleSave();
      } catch { /* next tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [projectId, loaded, scheduleSave, visibleRect, showNodes]);

  // ---- durable video jobs: poll every running video node's job; a reload
  // re-enters here because the node persisted its jobId. A poll that keeps
  // failing gives up out loud — silence forever is not a state. ----
  const pollMissesRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!projectId || !loaded) return;
    const t = setInterval(async () => {
      const watching = nodesRef.current.filter((n) => n.data.kind === "video" && n.data.status === "running" && n.data.jobId);
      for (const n of watching) {
        const jobId = n.data.jobId!;
        const lost = (message: string) => {
          pollMissesRef.current.delete(jobId);
          setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "error", error: message, jobId: undefined, startedAt: undefined } } : x));
          scheduleSave();
        };
        // 6 straight misses ≈ 30s of no answer — say so instead of spinning on
        const miss = () => {
          const c = (pollMissesRef.current.get(jobId) || 0) + 1;
          pollMissesRef.current.set(jobId, c);
          if (c >= 6) lost("lost touch with this render — run it again");
        };
        try {
          const r = await fetch(`${API_BASE}/api/narrative/visual/video-job/${encodeURIComponent(jobId)}`);
          if (r.status === 404) {
            lost("this render was lost before it finished — run it again");
            continue;
          }
          if (!r.ok) { miss(); continue; }
          pollMissesRef.current.delete(jobId);
          const d = await r.json();
          if (d.status === "done" && d.videoUrl) {
            setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "done", url: d.videoUrl, jobId: undefined, startedAt: undefined, error: undefined, generatedAt: new Date().toISOString() } } : x));
            scheduleSave();
          } else if (d.status === "error") {
            setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "error", error: String(d.error || "video render failed").slice(0, 140), jobId: undefined, startedAt: undefined } } : x));
            scheduleSave();
          }
        } catch { miss(); }
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
  // A wire carries the SUBJECT by default; flipping it makes it carry the look
  // only. Both states are labeled on the wire itself, so a flip — deliberate or
  // stray — is readable the instant it happens. The visual grammar lives in
  // displayEdges below.
  const flipWire = useCallback((edgeId: string) => {
    setEdges((es) => es.map((e) => e.id === edgeId ? { ...e, role: e.role === "style" ? undefined : "style" } : e));
    scheduleSave();
  }, [scheduleSave]);
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    // Into a video node there is nothing to flip — video takes every reference
    // as the subject. Offering the flip here would write a lie into the receipt.
    if (nodesRef.current.some((n) => n.id === edge.target && n.data.kind === "video")) return;
    flipWire(edge.id);
  }, [flipWire]);
  const onMoveEnd = useCallback((_: unknown, vp: Viewport) => {
    viewportRef.current = vp;
    scheduleSave();
  }, [scheduleSave]);

  // ---- ONE deletion rule on the field ----
  // Removing a card asks once, whichever way you reach for it: the card's own ×
  // arms and waits for a second click; Backspace/Delete arms and waits for a
  // second press. Nothing here can be undone, so nothing here goes on one
  // stroke. Wires are the exception on purpose — a wire is redrawn by dragging,
  // and no generation goes with it.
  const disarmDelete = useCallback(() => {
    if (deleteArmRef.current) clearTimeout(deleteArmRef.current.timer);
    deleteArmRef.current = null;
    setDeleteArmed(null);
  }, []);
  const handleBeforeDelete = useCallback(async ({ nodes: dying }: { nodes: GenNode[]; edges: CanvasEdge[] }) => {
    if (!dying.length) return true; // wires only
    const key = dying.map((n) => n.id).sort().join("|");
    if (deleteArmRef.current?.key === key) { disarmDelete(); return true; }
    if (deleteArmRef.current) clearTimeout(deleteArmRef.current.timer);
    deleteArmRef.current = {
      key,
      timer: setTimeout(() => { deleteArmRef.current = null; setDeleteArmed(null); }, 2500),
    };
    setDeleteArmed(dying.length === 1
      ? "Press again to remove this card and its wires"
      : `Press again to remove these ${dying.length} cards and their wires`);
    return false;
  }, [disarmDelete]);

  // Derived edge visuals — live (source resolved) vs dormant, same-subject vs
  // look-only. Derived at render, never persisted, so styling survives reloads
  // by construction and a dead reference wire is visibly dead.
  const displayEdges = useMemo(() => {
    const urlOf = new Map(nodes.map((n) => [n.id, feedUrl(n.data)]));
    const videoTargets = new Set(nodes.filter((n) => n.data.kind === "video").map((n) => n.id));
    return displayEdgesFrom(edges, urlOf, videoTargets);
  }, [nodes, edges]);

  const selectedCount = useMemo(() => nodes.filter((n) => n.selected).length, [nodes]);

  // ---- the receipt: settle on ONE card and read how it was made ----
  // Not while it is being dragged — React Flow selects a card the instant you
  // grab it, and a panel that snaps open every time you nudge something is
  // noise. The receipt waits for the card to be put down.
  const settledOn = useMemo(() => {
    const sel = nodes.filter((n) => n.selected);
    return sel.length === 1 && !sel[0].dragging ? sel[0] : null;
  }, [nodes]);
  // Live wires INTO that card — the recipe a Run would use right now.
  const inspectedWires = useMemo(() => {
    if (!settledOn) return [];
    return edges.filter((e) => e.target === settledOn.id).map((e) => {
      const src = nodes.find((n) => n.id === e.source);
      return { id: e.id, role: (e as CanvasEdge).role, label: (src?.data.label || src?.data.prompt || "(unlabeled)").slice(0, 60), url: feedUrl(src?.data) };
    });
  }, [settledOn, edges, nodes]);
  // …and only when there is something on it worth reading. A blank card you
  // just made has no story yet; the panel used to open anyway, to say so.
  const inspected = useMemo(() => {
    if (!settledOn) return null;
    const d = settledOn.data;
    const worthReading = Boolean(d.prompt?.trim()) || Boolean(d.referencesAttached?.length)
      || Boolean(d.backend || d.styleName) || Boolean(d.source) || Boolean(d.error)
      || normEntityRefs(d.entityRefs).length > 0 || inspectedWires.length > 0;
    return worthReading ? settledOn : null;
  }, [settledOn, inspectedWires]);

  // The receipt opens on the far side of the card it describes, so it never
  // covers the thing you just clicked. Decided once per card — it must not
  // hop sides while you are reading it.
  const inspectedId = inspected?.id ?? null;
  const receiptOnLeft = useMemo(() => {
    const n = nodesRef.current.find((x) => x.id === inspectedId);
    const r = paneRef.current?.getBoundingClientRect();
    if (!n || !r || r.width < 1) return true;
    try { return flowToScreenPosition(n.position).x > r.left + r.width / 2; }
    catch { return true; }
  }, [inspectedId, flowToScreenPosition]);

  // ---- pointing at a card in the conversation. The chat composer claims this
  // event and prefills itself (it calls preventDefault to say so); if the chat
  // isn't listening the reference goes to the clipboard instead, so the button
  // never does nothing. ----
  const [handedOff, setHandedOff] = useState<string | null>(null);
  const handToAgent = useCallback((n: GenNode) => {
    const name = (n.data.label || n.data.prompt || "this card").trim().slice(0, 60);
    const text = `About the card “${name}” (canvas id ${n.id}) — `;
    const claimed = !window.dispatchEvent(new CustomEvent("studio:compose-chat", {
      detail: { text, nodeId: n.id }, cancelable: true,
    }));
    if (claimed) return;
    void navigator.clipboard?.writeText(text);
    setHandedOff(n.id);
    setTimeout(() => setHandedOff((v) => (v === n.id ? null : v)), 3000);
  }, []);

  // ---- spawn ----
  const addNodeAt = useCallback((flowPos: { x: number; y: number }, data?: Partial<GenNodeData>) => {
    const id = mintClientId("cnode");
    const node: GenNode = {
      id, type: "gen", position: flowPos,
      data: { prompt: "", model: "nano-banana", status: "idle", ...data } as GenNodeData,
    };
    setNodes((ns) => [...ns, node]);
    // mirror immediately so several cards placed in one tick still cascade
    // clear of each other (the next render overwrites this with the truth)
    nodesRef.current = [...nodesRef.current, node];
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
    const id = addNodeAt(freeSpot({ x: maxX + 360, y: avgY }), { prompt: "" });
    // ids minted OUTSIDE the updater — impure updaters double-fire in dev
    const newEdges = selected.map((n) => ({ id: mintClientId("cedge"), source: n.id, target: id }));
    setEdges((es) => [...es, ...newEdges]);
    // let the sources go — otherwise the dock keeps offering Combine and a
    // second press buries an identical node under the first
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    scheduleSave();
  }, [addNodeAt, freeSpot, scheduleSave]);

  // ---- the world picker (place structure / lock into an entity) ----
  const openPicker = useCallback(async (mode: "place" | "lock", lockNodeId?: string) => {
    setPicker({ mode, lockNodeId, tab: mode === "lock" ? "entities" : "scenes" });
    // Always refetch fresh — a lock writes the whole gallery back, so a stale
    // snapshot here would erase whatever landed since the last open.
    setPickerScenes(null);
    setPickerEntities(null);
    setPickerAssets(null);
    setPickerError(null);
    setPickerQuery("");
    const pid = projectRef.current;
    if (!pid) {
      setPickerScenes([]); setPickerEntities([]); setPickerAssets([]);
      setPickerError("No project open.");
      return;
    }
    // A list that can't be fetched is EMPTY plus a reason — never a spinner
    // that runs until the creator gives up on the feature.
    const unreachable = () => setPickerError("Couldn't reach the world.");
    if (mode === "place") {
      // The generated archive rides in lazily alongside — every render and
      // clip the project ever made is placeable material.
      void (async () => {
        try {
          const rg = await fetch(`${API_BASE}/api/narrative/assets/generated?projectId=${encodeURIComponent(pid)}`);
          if (!rg.ok) throw new Error(String(rg.status));
          const d = await rg.json();
          setPickerAssets(((d.assets || []) as any[]).slice(0, 300).map((a: any) => ({
            id: a.id, url: a.url, name: a.name || a.sourceLabel, video: a.kind === "video",
          })));
        } catch { setPickerAssets([]); unreachable(); }
      })();
    }
    try {
      const [rs, re] = await Promise.all([
        fetch(`${API_BASE}/api/narrative/interactions?projectId=${encodeURIComponent(pid)}`),
        fetch(`${API_BASE}/api/narrative/entities?projectId=${encodeURIComponent(pid)}&type=all`),
      ]);
      if (!rs.ok || !re.ok) unreachable();
      if (!rs.ok) setPickerScenes([]);
      if (!re.ok) setPickerEntities([]);
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
    } catch {
      setPickerScenes((v) => v ?? []);
      setPickerEntities((v) => v ?? []);
      unreachable();
    }
  }, []);

  const placeScene = useCallback((s: PickerScene, withShots: boolean) => {
    const at = placePos();
    const sceneNodeId = addNodeAt(at, {
      label: s.title, url: s.imageUrl, status: s.imageUrl ? "done" : "idle",
      source: { kind: "scene", sceneId: s.id, title: s.title, sourceUpdatedAt: s.updatedAt },
      generatedAt: new Date().toISOString(),
    });
    if (withShots && s.frames.length) {
      const shotIds: Array<{ id: string; frameId: string }> = [];
      s.frames.forEach((f, i) => {
        const id = addNodeAt(
          freeSpot({ x: at.x + 360 + (i % 3) * 340, y: at.y - 100 + Math.floor(i / 3) * 320 }),
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
  }, [addNodeAt, placePos, freeSpot, scheduleSave]);

  const placeEntity = useCallback((e: PickerEntity) => {
    addNodeAt(placePos(), {
      label: e.name, url: e.url, status: e.url ? "done" : "idle",
      source: { kind: "entity", entityId: e.id, title: e.name, sourceUpdatedAt: e.updatedAt },
      generatedAt: new Date().toISOString(),
    });
    setPicker(null);
    scheduleSave();
  }, [addNodeAt, placePos, scheduleSave]);

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
          entityRefs: [...normEntityRefs(x.data.entityRefs).filter((r) => r.id !== e.id), { id: e.id, name: e.name }],
          label: x.data.label || label,
          error: undefined,
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
      setNodes((ns) => ns.map((x) => x.id === nodeId ? { ...x, data: { ...x.data, error: `couldn't add this to ${e.name}'s album — ${String(err.message || err).slice(0, 90)}` } } : x));
    }
    scheduleSave();
  }, [picker, scheduleSave]);

  // ---- node actions via CustomEvents (stable module-level node component) ----
  useEffect(() => {
    const patch = (e: Event) => {
      const { id, patch } = (e as CustomEvent).detail;
      // A note from the last render ("already up to date", "3 refs is the
      // budget") answers the state the card was in — the moment the creator
      // changes the card, it's stale. It clears unless the patch renews it.
      setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, warning: undefined, ...patch } } : n));
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
        setNodes((ns) => ns.map((x) => x.id === id ? { ...x, data: { ...x.data, pinned: true, error: undefined } } : x));
      } catch (err: any) {
        setNodes((ns) => ns.map((x) => x.id === id ? { ...x, data: { ...x.data, error: `couldn't pin this as the project's style — ${String(err.message || err).slice(0, 100)}`, status: x.data.url ? x.data.status : "error" } } : x));
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
      const refs = normEntityRefs(nodesRef.current.find((x) => x.id === id)?.data.entityRefs);
      if (refs.length) onJumpToEntity?.(refs[refs.length - 1].id);
    };
    const resync = async (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      const pid = projectRef.current;
      const node = nodesRef.current.find((x) => x.id === id);
      const src = node?.data.source;
      if (!src || !pid) return;
      // Compare the source's clock against the snapshot's before overwriting —
      // resync must SAY "already up to date" rather than silently doing
      // nothing. Every outcome speaks on the card (the note draws above the
      // picture, so source cards show it too).
      // an acknowledgement is a moment, not a label — it shows, then it fades
      const say = (warning: string) => {
        setNodes((ns) => ns.map((x) => x.id === id ? { ...x, data: { ...x.data, warning } } : x));
        setTimeout(() => {
          setNodes((ns) => ns.map((x) => (x.id === id && x.data.warning === warning ? { ...x, data: { ...x.data, warning: undefined } } : x)));
          scheduleSave();
        }, 8000);
      };
      const apply = (patch: { url?: string; title?: string; stamp?: string }) => {
        if (patch.stamp && src.sourceUpdatedAt && patch.stamp === src.sourceUpdatedAt) {
          say("already up to date with the world");
          return;
        }
        setNodes((ns) => ns.map((x) => x.id === id
          ? {
              ...x,
              data: {
                ...x.data,
                url: patch.url || x.data.url,
                status: patch.url ? "done" : x.data.status,
                error: undefined,
                source: { ...src, title: patch.title || src.title, sourceUpdatedAt: patch.stamp || src.sourceUpdatedAt },
              },
            } : x));
        say("refreshed from the world");
      };
      try {
        if (src.kind === "entity" && src.entityId) {
          const r = await fetch(`${API_BASE}/api/narrative/entities?projectId=${encodeURIComponent(pid)}&type=all`);
          const arr = r.ok ? await r.json() : [];
          const ent = (Array.isArray(arr) ? arr : []).find((x: any) => x.id === src.entityId);
          if (ent) apply({ url: ent.referenceImage || ent.imageUrl, title: ent.name, stamp: ent.updatedAt });
          else say("this one is no longer in the world — the card keeps its snapshot");
        } else if (src.sceneId) {
          const r = await fetch(`${API_BASE}/api/narrative/interactions?projectId=${encodeURIComponent(pid)}`);
          const arr = r.ok ? await r.json() : [];
          const scene = (Array.isArray(arr) ? arr : []).find((x: any) => x.id === src.sceneId);
          if (!scene) say("this scene is no longer in the world — the card keeps its snapshot");
          else if (src.kind === "scene") {
            apply({ url: scene.imageUrl, title: scene.title, stamp: scene.updatedAt });
          } else if (src.kind === "shot" && src.frameId) {
            const f = (scene.frames || []).find((fr: any) => fr.id === src.frameId);
            if (f) apply({ url: f.imageUrl, title: f.title, stamp: f.lastImageAt || scene.updatedAt });
            else say("this shot is no longer in the scene — the card keeps its snapshot");
          }
        }
      } catch { say("couldn't reach the world — try again"); }
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
      const refLabels: string[] = [];
      const refRoles: Record<string, string> = {};
      for (const ed of edgesRef.current.filter((x) => x.target === id)) {
        const src = nodesRef.current.find((x) => x.id === ed.source);
        const u = feedUrl(src?.data); // a broken card feeds nothing — it must not poison this run
        if (!u) continue;
        refUrls.push(u);
        // The wired node's LABEL rides into video prompts as an @Image role —
        // the model is told WHO each reference is, not just handed pixels.
        refLabels.push((src?.data.label || src?.data.prompt || "").slice(0, 60));
        if (ed.role === "style") refRoles[u] = "style";
      }
      // No wires but the node carries a receipt with resolvable urls (an
      // agent-placed generation): re-run means SAME RECIPE — re-attach them.
      if (!refUrls.length) {
        for (const ra of node.data.referencesAttached || []) {
          if (!ra?.url) continue;
          refUrls.push(ra.url);
          refLabels.push((ra.label || ra.description || "").slice(0, 60));
          if ((ra.role || ra.type) === "style") refRoles[ra.url] = "style";
        }
      }
      // Re-run preserves the current result as a sibling "take" node next door
      // (nothing on the field is ever lost — the tooltip's promise, kept).
      if (node.data.url && node.data.status === "done") {
        const takeId = mintClientId("cnode");
        // Takes stack DOWNWARD under the node they came from — a visible strip
        // of history. Never to the left, where the references feeding this
        // node live, and never on last take's head.
        const below = nodesRef.current.filter((x) => x.data.archived
          && Math.abs(x.position.x - node.position.x) < 120
          && x.position.y > node.position.y).length;
        setNodes((ns) => [...ns, {
          id: takeId, type: "gen",
          position: freeSpot({ x: node.position.x, y: node.position.y + 380 + below * 300 }),
          data: {
            prompt: node.data.prompt, model: node.data.model, url: node.data.url,
            kind: node.data.kind, label: node.data.label ? `${node.data.label} (take)` : undefined,
            status: "done", generatedAt: node.data.generatedAt, archived: true,
            ...(node.data.raw ? { raw: true } : {}),
          } as GenNodeData,
        }]);
      }
      // startedAt: the card shows how long it has been working, and survives a
      // reload with the job, so a resumed video render still has its age
      setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, status: "running", error: undefined, warning: undefined, startedAt: Date.now() } } : n));
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
              ...(refUrls.length ? { referenceUrls: refUrls, referenceLabels: refLabels, refMode: "reference" } : {}),
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
            ? { ...n, data: { ...n.data, status: "error", error: String(err.message || err).slice(0, 140), startedAt: undefined } } : n));
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
                error: undefined, startedAt: undefined,
                styleApplied: Boolean(d.styleDirectiveApplied),
                ...(Array.isArray(d.warnings) && d.warnings.length ? { warning: d.warnings.join(" · ").slice(0, 220) } : {}),
              },
            } : n));
      } catch (err: any) {
        if (projectRef.current !== pid) return;
        setNodes((ns) => ns.map((n) => n.id === id
          ? { ...n, data: { ...n.data, status: "error", error: String(err.message || err).slice(0, 140), startedAt: undefined } } : n));
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
  }, [openLightbox, scheduleSave, openPicker, freeSpot, onJumpToScene, onJumpToShot, onJumpToEntity]);

  if (!projectId) {
    return <div className="h-full flex items-center justify-center text-gray-300 text-sm">Open a project to use the canvas.</div>;
  }
  if (!loaded) {
    return <div className="h-full flex items-center justify-center text-gray-300"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Opening the canvas…</div>;
  }

  // The open list in the picker, and the one search that runs over it.
  const pickerQ = pickerQuery.trim().toLowerCase();
  const pickerHit = (s?: string) => !pickerQ || (s || "").toLowerCase().includes(pickerQ);
  const pickerCount = !picker ? 0
    : picker.tab === "scenes" ? (pickerScenes?.length ?? 0)
    : picker.tab === "entities" ? (pickerEntities?.length ?? 0)
    : (pickerAssets?.length ?? 0);

  // ONE line in the dock, about what you are doing right now. It replaced a
  // five-clause manual that was wider than the canvas itself; short enough that
  // it can never push the dock past its buttons, and silent on a cold field
  // where the overlay is already teaching.
  // It also steps aside whenever the dock has something better to hold — the
  // Combine button, or the agent's arrivals — so the dock never outgrows the
  // pane it sits in.
  const dockHint = nodes.length === 0 || selectedCount >= 2 || (arrived?.length || 0) > 0 ? null
    : selectedCount === 1 ? "Drag a card's side dot to wire it in"
    : "Double-click the field for a new card";

  /** An empty list in the picker: either the world really is empty here, or we
   *  couldn't reach it — and if we couldn't, the way back is one click. */
  const pickerEmpty = (empty: string) => (
    <div className="p-6 text-center text-xs">
      {pickerError ? (
        <>
          <div className="text-rose-300">{pickerError}</div>
          <button onClick={() => picker && void openPicker(picker.mode, picker.lockNodeId)}
            className="mt-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-[11px] text-rose-200 hover:bg-rose-500/25">
            Try again
          </button>
        </>
      ) : <span className="text-gray-300">{empty}</span>}
    </div>
  );

  return (
    /* paneRef measures the canvas itself — everything places against THIS
       rect, not the window (the window includes the rail and the chat). */
    <div ref={paneRef} className="h-full w-full relative">
      {/* Wires and handles are the field's one essential gesture — they get a
          real hover state, a real cursor, and a hit target you can find. React
          Flow writes stroke inline, so these rules have to shout to win. */}
      <style>{`
        .react-flow__edge.canvas-wire { cursor: pointer; }
        .react-flow__edge.canvas-wire-fixed { cursor: default; }
        .react-flow__edge.canvas-wire:hover .react-flow__edge-path { stroke-width: 5 !important; }
        .react-flow__edge.canvas-wire:hover .react-flow__edge-textbg { fill-opacity: 1 !important; }
        .react-flow__edge.canvas-wire.selected .react-flow__edge-path { stroke: #f8fafc !important; stroke-width: 5 !important; }
        .react-flow__handle { transition: box-shadow .12s ease; }
        .react-flow__handle:hover { box-shadow: 0 0 0 5px rgba(255,255,255,0.16); }
      `}</style>
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
        onBeforeDelete={handleBeforeDelete}
        deleteKeyCode={["Backspace", "Delete"]}
        connectionRadius={40}
        multiSelectionKeyCode="Shift"
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        className="bg-[#0b0a12]"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2a2838" />
        {/* showInteractive=false: the default padlock froze dragging, wiring
            and selection with nothing on screen to say why, and this field has
            no read-only mode for it to serve */}
        <Controls position="bottom-left" showInteractive={false}
          className="!bg-slate-800 !border-white/15 [&>button]:!bg-slate-800 [&>button]:!border-white/15 [&>button]:!text-gray-200" />
        {nodes.length > 6 && <MiniMap pannable zoomable className="!bg-slate-800/90"
          nodeColor={(n) => (n.data?.fromAgent ? "#8b5cf6" : "#334")} maskColor="rgba(10,10,18,0.7)" />}
      </ReactFlow>

      {/* the keyboard's half of the deletion rule — the card's × says the same
          thing inline, this says it for Backspace/Delete */}
      {deleteArmed && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none rounded-full border border-rose-400/50 bg-rose-950/90 px-3.5 py-1.5 text-[11px] text-rose-200 shadow-xl">
          {deleteArmed}
        </div>
      )}

      {/* THE RECEIPT — settle on one card and read how it was made: engine,
          look, the full prompt, every reference that rode along (live wires +
          the persisted provenance), who's in it, where it came from. It reads;
          the card edits. It opens on the far side of the card it describes, and
          only when that card has something to say. */}
      {inspected && (() => {
        const d = inspected.data;
        const ents = normEntityRefs(d.entityRefs);
        const receiptRefs = d.referencesAttached || [];
        const canRerun = !d.source && Boolean(d.prompt?.trim()) && d.status !== "running";
        // Run takes the live wires when there are any, and only falls back to
        // what the receipt remembers when the card has none. Both sections say
        // so, so "Run this again" can never quietly mean something else.
        const liveWins = inspectedWires.length > 0;
        return (
          <div className={cn(
            "absolute top-3 z-10 w-72 max-h-[calc(100%-6rem)] flex flex-col rounded-xl border border-white/20 bg-slate-800/95 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.07)]",
            receiptOnLeft ? "left-3" : "right-3",
          )}>
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
              <Receipt className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-[11px] text-gray-100 flex-1 truncate" title={d.label || d.prompt}>
                {d.label || (d.prompt || "").slice(0, 40) || (d.kind === "video" ? "new video" : "new image")}
              </span>
              <button onClick={() => setNodes((ns) => ns.map((n) => n.selected ? { ...n, selected: false } : n))}
                title="Close (deselect)" className="text-gray-400 hover:text-gray-100"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-[10px]">
              {/* who made it, what made it, and whether the project's look was
                  on — in the same words the card's own switch uses */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* who made it — selection paints a white ring over the card's
                    own violet frame, so the receipt says it in words too */}
                {d.fromAgent && (
                  <span className="flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-violet-200">
                    <Bot className="w-3 h-3" />placed by the agent
                  </span>
                )}
                {(d.backend || d.model) && <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-200">{engineNameOf(d.backend || d.model)}</span>}
                {d.kind === "video" && <span className="rounded-full border border-white/15 px-2 py-0.5 text-gray-300">video{d.durationSec ? ` · ${d.durationSec}s` : ""}</span>}
                {d.styleName
                  ? <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-amber-200" title={d.styleId}>look: {d.styleName}</span>
                  : d.raw
                    ? <span className="rounded-full border border-white/15 px-2 py-0.5 text-gray-300" title="This card renders without the project's look">look: off</span>
                    : d.styleApplied
                      ? <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200" title="The project's look rode along on this render">look: on</span>
                      : null}
                {d.generatedAt && <span className="text-gray-400">{new Date(d.generatedAt).toLocaleString()}</span>}
              </div>
              {/* the full prompt — never truncated in the receipt */}
              {d.prompt && (
                <div>
                  <div className="flex items-center gap-1 text-gray-400 uppercase tracking-wider text-[9px] mb-0.5">
                    prompt
                    <button onClick={() => { void navigator.clipboard?.writeText(d.prompt); }} title="Copy the full prompt"
                      className="text-gray-400 hover:text-gray-100"><Copy className="w-3 h-3" /></button>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] leading-relaxed text-gray-200 whitespace-pre-wrap">{d.prompt}</div>
                </div>
              )}
              {/* live wires — what a Run would attach right now. The pill is
                  the wire's own switch: same subject ↔ look only. Into a video
                  node it doesn't switch, because the renderer takes every
                  reference as the subject. */}
              {inspectedWires.length > 0 && (
                <div>
                  <div className="text-gray-300 text-[10px] mb-0.5">Wired in now ({inspectedWires.length}) — <span className="text-cyan-200">a run uses these</span></div>
                  <div className="space-y-1">
                    {inspectedWires.map((w) => {
                      const lookOnly = w.role === "style" && d.kind !== "video";
                      return (
                        <div key={w.id} className="flex items-center gap-1.5">
                          {w.url && <img src={resolveUrl(w.url)} alt="" className="w-6 h-6 rounded object-cover border border-white/10" />}
                          <span className="flex-1 truncate text-gray-300">{w.label}</span>
                          {d.kind === "video" ? (
                            <span title="A video render takes every reference as the subject — there is no look-only here"
                              className="rounded px-1 py-0.5 text-[9px] bg-violet-500/20 text-violet-200">same subject</span>
                          ) : (
                            <button onClick={() => flipWire(w.id)}
                              title={lookOnly
                                ? "Look only — this reference lends its rendering language, not its subject. Click for 'same subject'."
                                : "Same subject — this reference IS the person or place. Click for 'look only'."}
                              className={cn("rounded px-1 py-0.5 text-[9px] hover:brightness-125",
                                lookOnly ? "bg-amber-500/20 text-amber-200" : "bg-violet-500/20 text-violet-200")}>
                              {lookOnly ? "look only" : "same subject"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* the persisted receipt — what the ORIGINAL generation attached.
                  With wires on the card it is history; without them it is the
                  recipe a re-run repeats. The heading says which. */}
              {receiptRefs.length > 0 && (
                <div className={cn(liveWins && "opacity-60")}>
                  <div className="text-gray-300 text-[10px] mb-0.5">
                    Used when this was made ({receiptRefs.length}) — {liveWins
                      ? <span className="text-gray-400">kept for the record</span>
                      : <span className="text-cyan-200">a run uses these again</span>}
                  </div>
                  <div className="space-y-1">
                    {receiptRefs.map((ra, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        {ra.url && <img src={resolveUrl(ra.url)} alt="" className="w-6 h-6 rounded object-cover border border-white/10" />}
                        <span className="flex-1 truncate text-gray-300">{ra.label || ra.description || `reference ${ra.order ?? i + 1}`}</span>
                        {(ra.role || ra.type) && <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px]", (ra.role || ra.type) === "style" ? "bg-amber-500/20 text-amber-200" : "bg-violet-500/20 text-violet-200")}>{(ra.role || ra.type) === "style" ? "look only" : ra.role || ra.type}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* who's in it */}
              {ents.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-gray-400 uppercase tracking-wider text-[9px]">cast:</span>
                  {ents.map((r) => (
                    <button key={r.id} onClick={() => onJumpToEntity?.(r.id)} title={`Open ${r.name}`}
                      className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200 hover:bg-emerald-500/25">{r.name}</button>
                  ))}
                </div>
              )}
              {d.source && (
                <div className="text-sky-300/80">from the world: {d.source.title || d.source.sceneId || d.source.entityId}</div>
              )}
              {d.warning && <div className="text-gray-200">{d.warning}</div>}
              {d.error && <div className="text-rose-300">{d.error}</div>}
            </div>
            <div className="px-3 py-2 border-t border-white/10 space-y-1.5">
              {/* the pointing gesture — the field is shared with the agent, and
                  this is how you say "this one" without describing it */}
              <button
                onClick={() => handToAgent(inspected)}
                title="Put this card in the chat box, so the agent knows exactly which one you mean"
                className="w-full rounded-lg border border-violet-400/50 bg-violet-500/15 hover:bg-violet-500/30 px-2 py-1.5 text-[10px] text-violet-200 flex items-center justify-center gap-1.5">
                <Bot className="w-3 h-3" />
                {handedOff === inspected.id ? "copied — paste it into the chat" : "Ask the agent about this card"}
              </button>
              {canRerun && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("canvas:run-node", { detail: { id: inspected.id } }))}
                  title={liveWins
                    ? "Run this again — same prompt, same engine, and the references wired in now. What you have is kept as a take."
                    : "Run this again — same prompt, same engine, same references. What you have is kept as a take."}
                  className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 px-2 py-1.5 text-[10px] text-white flex items-center justify-center gap-1.5">
                  <Play className="w-3 h-3" /> Run this again
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* bottom-center dock (Flora's asset dock, minimal) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/20 bg-slate-800/95 px-3 py-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.07)]">
        <button
          onClick={() => addNodeAt(placePos())}
          title="A new card for a still image"
          className="flex items-center gap-1.5 rounded-full bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500">
          <ImagePlus className="w-3.5 h-3.5" /> Image
        </button>
        <button
          onClick={() => addNodeAt(placePos(), { kind: "video", model: "minimax-h3", durationSec: 5 })}
          title="A new card for a moving clip — wire images in and they ride along as references"
          className="flex items-center gap-1.5 rounded-full border border-cyan-400/50 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/30">
          <Clapperboard className="w-3.5 h-3.5" /> Video
        </button>
        <button
          onClick={() => void openPicker("place")}
          title="Bring a scene, its shots, or someone from the cast onto the field — it stays linked"
          className="flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-500/25">
          <Globe className="w-3.5 h-3.5" /> From world
        </button>
        {selectedCount >= 2 && (
          <button
            onClick={combineSelected}
            title="One new card fed by every card you've selected — write the prompt and run it"
            className="flex items-center gap-1.5 rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/30">
            <Combine className="w-3.5 h-3.5" /> Combine ({selectedCount})
          </button>
        )}
        {arrived && arrived.length > 0 && (
          <button
            onClick={() => { showNodes(arrived); setArrived(null); }}
            title="The agent just placed these — take me there"
            className="flex items-center gap-1.5 rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/30">
            <Bot className="w-3.5 h-3.5" /> {arrived.length} new from the agent
          </button>
        )}
        {dockHint && <span className="text-[10px] text-gray-300 whitespace-nowrap pr-1">{dockHint}</span>}
        {/* a failed save is the one thing in here worth interrupting for */}
        {saveError
          ? <span title={saveError} className="flex items-center gap-1 rounded-full border border-rose-400/60 bg-rose-500/20 px-2.5 py-1 text-[11px] text-rose-100">
              <X className="w-3 h-3 shrink-0" />{saveError}
            </span>
          : savedAt && <span className="text-[10px] text-gray-300 flex items-center gap-0.5 whitespace-nowrap"><Check className="w-3 h-3" />Saved {savedAt}</span>}
      </div>

      {/* the world picker — bring something in from the world, or keep an image
          as a reference for someone in the cast */}
      {picker && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setPicker(null)}>
          <div className="w-[520px] max-h-[70%] flex flex-col rounded-2xl border border-white/20 bg-slate-800 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.95)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <span className="text-sm text-gray-200 flex-1 min-w-0 truncate">
                {picker.mode === "lock" ? "Who or what is this a reference for?" : "From the world"}
              </span>
              {picker.mode === "place" && (
                <div className="flex gap-1">
                  {PICKER_TABS.map((t) => (
                    <button key={t.key} onClick={() => { setPicker((p) => p && { ...p, tab: t.key }); setPickerQuery(""); }}
                      className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px]", picker.tab === t.key ? "bg-sky-500/25 text-sky-200" : "text-gray-400 hover:text-gray-100")}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setPicker(null)} title="Close" className="text-gray-400 hover:text-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {/* one search over whatever list is open — long lists only */}
              {pickerCount > 8 && (
                <input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full mb-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-sky-500/40"
                />
              )}
              {picker.tab === "generated" ? (
                pickerAssets === null ? <div className="p-6 text-center text-gray-300 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />loading…</div>
                : (() => {
                  const list = pickerAssets.filter((a) => pickerHit(a.name));
                  if (list.length === 0) {
                    return pickerQ ? <div className="p-6 text-center text-gray-300 text-xs">Nothing matches.</div>
                      : pickerEmpty("Nothing generated yet — everything you render lands here.");
                  }
                  return (
                    /* three across, in the shape the material is actually in —
                       and every frame wears its name, because the search
                       above looks for it */
                    <div className="grid grid-cols-3 gap-2">
                      {list.slice(0, 120).map((a) => (
                        <button key={a.id}
                          onClick={() => {
                            addNodeAt(placePos(), {
                              label: (a.name || "").slice(0, 60) || undefined,
                              url: a.url, status: "done",
                              ...(a.video ? { kind: "video" as const, model: "minimax-h3" } : {}),
                              generatedAt: new Date().toISOString(),
                            });
                            setPicker(null);
                          }}
                          title={`${a.name || "untitled"} — put it on the field${a.video ? " (a clip)" : ""}`}
                          className="relative rounded-lg overflow-hidden border border-white/10 bg-black/40 hover:border-sky-400/60 text-left">
                          {a.video ? (
                            <video src={resolveUrl(a.url)} muted playsInline className="w-full aspect-video object-cover bg-black" />
                          ) : (
                            <img src={resolveUrl(a.url)} alt="" className="w-full aspect-video object-cover" loading="lazy" />
                          )}
                          {a.video && <Clapperboard className="absolute top-1 right-1 w-3.5 h-3.5 text-cyan-300 drop-shadow" />}
                          <div className="px-1.5 py-1 text-[10px] text-gray-200 truncate">{a.name || "untitled"}</div>
                        </button>
                      ))}
                    </div>
                  );
                })()
              ) : picker.tab === "scenes" ? (
                pickerScenes === null ? <div className="p-6 text-center text-gray-300 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />loading scenes…</div>
                : pickerScenes.length === 0 ? pickerEmpty("No scenes yet.")
                : (() => {
                  const list = pickerScenes.filter((s) => pickerHit(s.title));
                  if (list.length === 0) return <div className="p-6 text-center text-gray-300 text-xs">Nothing matches.</div>;
                  return list.map((s) => (
                    <div key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
                      {s.imageUrl
                        ? <img src={resolveUrl(s.imageUrl)} className="w-14 h-9 object-cover rounded" alt="" />
                        : <div className="w-14 h-9 rounded bg-white/5 flex items-center justify-center"><Clapperboard className="w-3.5 h-3.5 text-gray-400" /></div>}
                      <button onClick={() => placeScene(s, false)} className="flex-1 text-left min-w-0" title="Put this scene on the field — it stays linked">
                        <div className="text-xs text-gray-100 truncate">{s.title}</div>
                        <div className="text-[10px] text-gray-400">{s.frames.length} shot{s.frames.length === 1 ? "" : "s"}</div>
                      </button>
                      {s.frames.length > 0 && (
                        <button onClick={() => placeScene(s, true)}
                          title="Put the scene and all its shots on the field, wired"
                          className="shrink-0 rounded-md border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-200 hover:bg-sky-500/25 flex items-center gap-1">
                          <Layers className="w-3 h-3" /> + shots
                        </button>
                      )}
                    </div>
                  ));
                })()
              ) : (
                pickerEntities === null ? <div className="p-6 text-center text-gray-300 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />loading the cast…</div>
                : pickerEntities.length === 0 ? pickerEmpty(`No cast or places yet${picker.mode === "lock" ? " — ask the agent to make one from this image first" : ""}.`)
                : (() => {
                  const list = pickerEntities.filter((e) => pickerHit(e.name));
                  if (list.length === 0) return <div className="p-6 text-center text-gray-300 text-xs">Nothing matches.</div>;
                  return list.map((e) => (
                    <button key={e.id} onClick={() => (picker.mode === "lock" ? void lockIntoEntity(e) : placeEntity(e))}
                      title={picker.mode === "lock" ? `Keep this image as a reference for ${e.name}` : `Put ${e.name} on the field — they stay linked`}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
                      {e.url
                        ? <img src={resolveUrl(e.url)} className="w-9 h-9 object-cover rounded-full" alt="" />
                        : <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center"><UserPlus className="w-3.5 h-3.5 text-gray-400" /></div>}
                      <div className="min-w-0">
                        <div className="text-xs text-gray-100 truncate">{e.name}</div>
                        <div className="text-[10px] text-gray-400">{e.gallery.length} reference{e.gallery.length === 1 ? "" : "s"}</div>
                      </div>
                    </button>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {nodes.length === 0 && !picker && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-md">
            <Sparkles className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <div className="text-gray-100 text-base">A blank field. No structure required.</div>
            <div className="text-gray-300 text-sm leading-relaxed mt-2">
              Double-click anywhere to make a picture, then wire one card into another to use it
              as a reference. Bring scenes and cast in with “From world” — the agent sees this
              field too, and adds its own.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Edge visual grammar. EVERY wire says what it carries, in words a filmmaker
 *  reads without a legend: "same subject" (the default — this IS that person
 *  or place) or "look only" (borrow the rendering language, not the subject).
 *  Live (the source has a picture) draws thick, bright and solid; "look only"
 *  marches in amber dashes; a dormant wire — the source has nothing to send
 *  yet — draws thin, gray and still, because a wire that feeds nothing must
 *  not look like a wire that does. Wires INTO a video node always read "same
 *  subject": video renders take every reference as the subject, and the field
 *  must not promise a distinction the renderer can't honor. */
function displayEdgesFrom(edges: CanvasEdge[], urlOf: Map<string, string | undefined>, videoTargets?: Set<string>): CanvasEdge[] {
  return edges.map((e) => {
    const live = Boolean(urlOf.get(e.source));
    const intoVideo = Boolean(videoTargets?.has(e.target));
    const isStyle = e.role === "style" && !intoVideo;
    return {
      ...e,
      animated: live && isStyle,
      // a generous invisible band so the wire is easy to hit on purpose
      interactionWidth: 26,
      className: intoVideo ? "canvas-wire canvas-wire-fixed" : "canvas-wire",
      label: isStyle ? "look only" : "same subject",
      labelStyle: {
        fill: !live ? "#9ca3af" : isStyle ? "#fde68a" : "#ddd6fe",
        fontSize: 10, fontWeight: 500,
      },
      labelBgStyle: { fill: "#12101c", fillOpacity: 0.92 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 5,
      style: live
        ? {
            stroke: isStyle ? "#fbbf24" : "#a78bfa",
            strokeWidth: 3,
            strokeDasharray: isStyle ? "7 4" : "none",
          }
        : { stroke: "#6b7280", strokeWidth: 1.75, strokeDasharray: "3 5" },
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

"use client";

/**
 * DramaturgyStudio — THE DRAMATURGY ROOM, v1 (docs/DRAMATURGY_DESIGN.md §0, §1, §5).
 *
 * The Story tab rebuilt on the world's spine. v1 shows three things — the
 * board, Bind, and Break-into-scenes — everything else arrives the first time
 * you touch it (progressive disclosure; the label is the only required field).
 *
 *   - FRAME BAR: logline · THE HOOK (what grabs the watcher?) · theme · motifs,
 *     autosaved on blur; synopsis folds out as a second row.
 *   - THE BOARD: beats in PRESENTATION order (the third clock), grouped under
 *     slim act headers. Height IS the tension curve — each card offsets by
 *     -charge×6px, so the row physically reads as the shape of the telling.
 *     Drag a card's grip onto another card to reorder (the server assigns
 *     positions; reordering NEVER touches chronologyIndex).
 *   - BIND: an unbound beat claims a WorldEvent (typeahead over the world
 *     chronology) or mints a draft one. The pip on each card's left edge is
 *     the claim state: solid cyan = canon claim, dashed amber = draft, dotted
 *     gray = unbound, violet = device.
 *   - BREAK: a bound beat mints scenes with eventLinks pre-wired — the
 *     transmedia link born correct, one click.
 *   - ORPHAN ROW: scenes with no beat and no event — adoptable, never shamed.
 *   - LINTS: "N notes" pill; notes, never grades. Hook lints surface first.
 *
 * Editing beat text never writes the event. The board is free; the world is
 * deliberate.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Loader2, X, Plus, Minus, RefreshCw, Link2, Clapperboard, Sparkles,
  ChevronDown, ChevronUp, AlertTriangle, GripHorizontal, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
const resolveUrl = (u?: string) =>
  (u && !u.startsWith("http") && !u.startsWith("data:") && !u.startsWith("blob:") ? `${API_BASE}${u}` : u);

// ---------------------------------------------------------------------------
// The derived read model, as GET /api/narrative/dramaturgy serves it.
// ---------------------------------------------------------------------------
interface BeatRec {
  id: string;
  kind: "event" | "device";
  eventId?: string;
  position: number;
  actId?: string;
  label: string;
  intent?: string;
  charge?: number;
  emphasis?: string;
  deviceKind?: string;
}
interface EventRec { id: string; title: string; chronologyIndex: number; status: "draft" | "canon"; }
type ClaimState = "current" | "stale" | "orphaned" | "off-timeline" | "unbound" | "n/a";
interface BeatView {
  beat: BeatRec;
  event?: EventRec;
  claimState: ClaimState;
  drift?: Array<{ field: string; was: unknown; now: unknown }>;
  temporalDevice: "linear" | "flashback";
  coverage: { sceneIds: string[]; renderedShots: number; firstStill?: string };
}
interface ActView {
  act: { id: string; title: string; summary?: string; turn?: string; order?: number };
  beatIds: string[];
  span: { fromIndex: number; toIndex: number } | null;
}
interface Lint { code: string; severity: "info" | "warn" | "block"; beatId?: string; sceneId?: string; message: string; }
interface Framing {
  logline?: string; synopsis?: string; theme?: string; motifs?: string;
  hook?: { text: string; deliveredAtBeatId?: string };
  question?: { text: string };
}
interface DramaturgyView {
  productionId: string;
  format: string;
  profile: { groupLabel: string; weightUnit: string };
  framing: Framing;
  acts: ActView[];
  beats: BeatView[];
  span: { fromIndex: number; toIndex: number } | null;
  draftDebt: { mine: number; foreign: number; totalEventBeats: number };
  lints: Lint[];
}
interface OrphanScene { id: string; title: string; imageUrl?: string; }
interface Segment { actId?: string; title?: string; views: BeatView[]; }

// ---------------------------------------------------------------------------
// Frame-bar field: uncontrolled, autosaves on blur. Key it on the server value
// so a round-tripped save (or an agent edit) re-seeds it, while typing never
// gets clobbered mid-word.
// ---------------------------------------------------------------------------
function FrameField({ value, placeholder, className, onSave }: {
  value: string; placeholder: string; className?: string; onSave: (v: string) => void;
}) {
  return (
    <input
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => { if (e.target.value !== value) onSave(e.target.value); }}
      className={cn(
        "rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// One beat card (~w-52). The grip strip is the drag handle so the label input
// stays selectable; the whole card is the drop target.
// ---------------------------------------------------------------------------
function BeatCard({ v, onPatch, onDelete, onBind, onResync, onBreak, onOpenScene, onDragStartCard, onDropOnCard }: {
  v: BeatView;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onBind: (beatId: string) => void;
  onResync: (id: string) => void;
  onBreak: (id: string) => void;
  onOpenScene?: (sceneId: string) => void;
  onDragStartCard: (id: string) => void;
  onDropOnCard: (id: string) => void;
}) {
  const b = v.beat;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const requestDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2000);
      return;
    }
    onDelete(b.id);
  };
  const charge = b.charge ?? 0;
  const isDevice = b.kind === "device";
  const bound = Boolean(b.eventId);
  // Binding pip: solid cyan = a current canon claim · dashed amber = a draft
  // (or drifted) claim · dotted gray = unbound · violet = device tissue.
  const pipClass = isDevice
    ? "border-violet-400/80"
    : !bound
      ? "border-dotted border-gray-600"
      : v.claimState === "current" && v.event?.status === "canon"
        ? "border-cyan-400"
        : "border-dashed border-amber-400/80";
  const pipTitle = isDevice
    ? "structural device — never claims an event"
    : !bound
      ? "unbound — an idea, not a beat yet"
      : `${v.claimState} claim on ${v.event ? `a ${v.event.status} event` : "a deleted event"}`;

  return (
    <div
      id={`dram-beat-${b.id}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDropOnCard(b.id); }}
      style={{ transform: `translateY(${-charge * 6}px)` }}
      className="relative w-52 shrink-0 rounded-xl border border-white/15 bg-slate-950/90 shadow-xl pl-2.5 transition-transform"
    >
      <div className={cn("absolute left-1 top-2 bottom-2 w-0 border-l-2", pipClass)} title={pipTitle} />

      {/* grip strip — the drag handle (drag = presentation order, never chronology) */}
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStartCard(b.id); }}
        title="Drag onto another card to reorder — presentation order only, the chronology never moves"
        className="flex items-center gap-1 px-1.5 pt-1.5 cursor-grab active:cursor-grabbing"
      >
        <GripHorizontal className="w-3 h-3 text-gray-600" />
        {v.temporalDevice === "flashback" && (
          <span title="This beat lands earlier in story time than the beat before it — a presentation choice, not a chronology edit" className="text-[9px] text-fuchsia-300/90">↩ flashback</span>
        )}
        <div className="flex-1" />
        <button
          onClick={requestDelete}
          title={confirmDelete ? "Click again to delete the beat (its event is never deleted)" : "Delete beat"}
          className={cn(confirmDelete ? "text-rose-400" : "text-gray-600 hover:text-rose-300")}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* label — the only required field, everywhere, always */}
      <div className="px-1.5 pt-1">
        <input
          key={`${b.id}:${b.label}`}
          defaultValue={b.label}
          title={b.intent || undefined}
          placeholder="what happens?"
          onBlur={(e) => { const val = e.target.value.trim(); if (val && val !== b.label) onPatch(b.id, { label: val }); }}
          className="w-full rounded-md border border-transparent hover:border-white/10 focus:border-amber-500/40 bg-transparent px-1 py-0.5 text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:bg-black/30"
        />
      </div>

      {/* story-time chip + resync + emphasis */}
      <div className="flex items-center gap-1.5 px-2.5 pt-1">
        {isDevice ? (
          <span className="text-[10px] text-violet-300">device · {b.deviceKind || "tissue"}</span>
        ) : v.event ? (
          <span className={cn("text-[10px] font-mono", v.event.status === "canon" ? "text-cyan-300" : "text-amber-300")}>
            t={v.event.chronologyIndex} · {v.claimState === "off-timeline" ? "off-timeline" : v.event.status}
          </span>
        ) : bound ? (
          <span className="text-[10px] text-rose-300">t=? orphaned</span>
        ) : (
          <span className="text-[10px] text-gray-500">t=? unbound</span>
        )}
        {v.claimState === "stale" && (
          <button
            onClick={() => onResync(b.id)}
            title={`The event changed under this claim (${(v.drift || []).map((d) => d.field).join(", ")}) — resync the snapshot`}
            className="flex items-center gap-0.5 rounded border border-amber-400/40 bg-amber-500/10 px-1 py-px text-[9px] text-amber-300 hover:bg-amber-500/25"
          >
            <RefreshCw className="w-2.5 h-2.5" /> Resync
          </button>
        )}
        <div className="flex-1" />
        {b.emphasis && <span className="text-[9px] text-gray-500 border border-white/10 rounded px-1">{b.emphasis}</span>}
      </div>

      {/* charge stepper — height is the tension curve */}
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5">
        <button
          onClick={() => onPatch(b.id, { charge: Math.max(-5, charge - 1) })}
          disabled={charge <= -5}
          title="Lower the charge — the card sinks; the row is the tension curve"
          className="rounded border border-white/10 bg-black/40 p-0.5 text-gray-400 hover:text-rose-300 disabled:opacity-30"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span
          title="Value polarity after this beat (-5..+5)"
          className={cn("min-w-8 text-center text-[10px] font-mono rounded px-1",
            charge > 0 ? "text-cyan-300 bg-cyan-500/10" : charge < 0 ? "text-rose-300 bg-rose-500/10" : "text-gray-500")}
        >
          Δ{charge > 0 ? "+" : ""}{charge}
        </span>
        <button
          onClick={() => onPatch(b.id, { charge: Math.min(5, charge + 1) })}
          disabled={charge >= 5}
          title="Raise the charge — the card lifts"
          className="rounded border border-white/10 bg-black/40 p-0.5 text-gray-400 hover:text-cyan-300 disabled:opacity-30"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* coverage — the film coming into being under this beat */}
      {v.coverage.sceneIds.length > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 pt-1.5">
          {v.coverage.firstStill && (
            <img src={resolveUrl(v.coverage.firstStill)} alt="" draggable={false} className="w-[60px] h-9 object-cover rounded" />
          )}
          <button
            onClick={() => onOpenScene?.(v.coverage.sceneIds[0])}
            title="Open the first scene under this beat"
            className="text-[10px] text-sky-300 hover:underline text-left"
          >
            {v.coverage.sceneIds.length} scene{v.coverage.sceneIds.length === 1 ? "" : "s"} · {v.coverage.renderedShots} shot{v.coverage.renderedShots === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {/* the two doors: Bind (claim the world) · Break (scenes born linked) */}
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        {!isDevice && !bound && (
          <button
            onClick={() => onBind(b.id)}
            title="Claim a WorldEvent for this beat, or mint a draft one"
            className="flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/25"
          >
            <Link2 className="w-3 h-3" /> Bind
          </button>
        )}
        {bound && (
          <button
            onClick={() => onBreak(b.id)}
            title="Break into a scene — born with its eventLink pre-wired"
            className="flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/25"
          >
            <Clapperboard className="w-3 h-3" /> ▸ scenes
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The room.
// ---------------------------------------------------------------------------
export function DramaturgyStudio({ projectId, productionId, refreshToken, onOpenScene }: {
  projectId: string | null; productionId?: string; refreshToken?: number;
  onOpenScene?: (sceneId: string) => void;
}) {
  const [view, setView] = useState<DramaturgyView | null>(null);
  const [orphans, setOrphans] = useState<OrphanScene[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const [lintsOpen, setLintsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  // Bind popover target: an existing beat (beatId) or the add-form's new beat (newLabel).
  const [bind, setBind] = useState<{ beatId?: string; newLabel?: string } | null>(null);
  const [bindEvents, setBindEvents] = useState<EventRec[] | null>(null);
  const [bindFilter, setBindFilter] = useState("");
  const dragIdRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef(projectId); projectRef.current = projectId;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ---- fetch: the derived view + the scenes (for the orphan row) ----
  const refetch = useCallback(async () => {
    const pid = projectId;
    if (!pid) return;
    try {
      const q = `projectId=${encodeURIComponent(pid)}${productionId ? `&productionId=${encodeURIComponent(productionId)}` : ""}`;
      const [rd, ri] = await Promise.all([
        fetch(`${API_BASE}/api/narrative/dramaturgy?${q}`),
        fetch(`${API_BASE}/api/narrative/interactions?projectId=${encodeURIComponent(pid)}`),
      ]);
      if (projectRef.current !== pid) return; // project switched mid-flight
      if (rd.ok) setView(await rd.json());
      if (ri.ok) {
        const arr = await ri.json();
        setOrphans((Array.isArray(arr) ? arr : [])
          .filter((s: any) => !s.sourceBeatId && !((s.eventLinks || []).length))
          .map((s: any) => ({
            id: String(s.id),
            title: s.title || String(s.summary || "").slice(0, 50) || "Untitled scene",
            imageUrl: s.imageUrl,
          })));
      }
    } catch { /* the last good view stays up */ }
  }, [projectId, productionId]);

  // Reset on production identity change; refetch on mount + identity +
  // refreshToken + after every mutation (simple, no optimistic state).
  useEffect(() => {
    setView(null); setOrphans([]); setAddOpen(false); setAddLabel("");
    setBind(null); setLintsOpen(false); setSynopsisOpen(false);
  }, [projectId, productionId]);
  useEffect(() => { void refetch(); }, [refetch, refreshToken]);

  // ---- one mutation helper: call, surface the error, re-GET ----
  const mutate = useCallback(async (method: string, path: string, body?: Record<string, unknown>): Promise<any | null> => {
    const pid = projectRef.current;
    if (!pid) return null;
    try {
      const r = await fetch(`${API_BASE}${path}`, {
        method,
        ...(body !== undefined ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: pid, ...(productionId ? { productionId } : {}), ...body }),
        } : {}),
      });
      const d = await r.json().catch(() => ({} as any));
      if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
      await refetch();
      return d;
    } catch (err: any) {
      showToast(String(err?.message || err).slice(0, 160));
      return null;
    }
  }, [productionId, refetch, showToast]);

  const saveFraming = useCallback((patch: Record<string, unknown>) => {
    void mutate("PATCH", "/api/narrative/dramaturgy", patch);
  }, [mutate]);

  const patchBeat = useCallback((id: string, patch: Record<string, unknown>) => {
    void mutate("PATCH", `/api/narrative/dramaturgy/beats/${encodeURIComponent(id)}`, patch);
  }, [mutate]);

  const deleteBeat = useCallback((id: string) => {
    const pid = projectRef.current || "";
    void mutate("DELETE", `/api/narrative/dramaturgy/beats/${encodeURIComponent(id)}?projectId=${encodeURIComponent(pid)}${productionId ? `&productionId=${encodeURIComponent(productionId)}` : ""}`);
  }, [mutate, productionId]);

  const resyncBeat = useCallback((id: string) => {
    void mutate("POST", `/api/narrative/dramaturgy/beats/${encodeURIComponent(id)}/resync`, {});
  }, [mutate]);

  const breakBeat = useCallback(async (id: string) => {
    const d = await mutate("POST", `/api/narrative/dramaturgy/beats/${encodeURIComponent(id)}/break`, { count: 1 });
    if (d && Array.isArray(d.scenes) && d.scenes.length) {
      showToast(`+${d.scenes.length} scene${d.scenes.length === 1 ? "" : "s"} — eventLink pre-wired`);
      onOpenScene?.(String(d.scenes[0].id));
    }
  }, [mutate, showToast, onOpenScene]);

  const adoptScene = useCallback(async (sceneId: string) => {
    const d = await mutate("POST", "/api/narrative/dramaturgy/adopt-scene", { sceneId });
    if (d) showToast("scene adopted as a beat");
  }, [mutate, showToast]);

  const addBeat = useCallback(async (body: Record<string, unknown>) => {
    const d = await mutate("POST", "/api/narrative/dramaturgy/beats", body);
    if (d) { setAddOpen(false); setAddLabel(""); }
    return d;
  }, [mutate]);

  // ---- drag-to-reorder: full ordered id list, server assigns positions ----
  const onDropOnCard = useCallback((targetId: string) => {
    const src = dragIdRef.current;
    dragIdRef.current = null;
    if (!src || src === targetId || !view) return;
    const ids = [...view.beats].sort((a, b) => (a.beat.position ?? 0) - (b.beat.position ?? 0)).map((v) => v.beat.id);
    const from = ids.indexOf(src);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, src);
    void mutate("POST", "/api/narrative/dramaturgy/beats/reorder", { orderedIds: ids });
  }, [view, mutate]);

  // ---- bind popover ----
  const openBind = useCallback(async (target: { beatId?: string; newLabel?: string }) => {
    setBind(target);
    setBindEvents(null);
    setBindFilter("");
    const pid = projectRef.current;
    if (!pid) return;
    try {
      // NOTE: this route returns { events: [...] }, not a bare array.
      const r = await fetch(`${API_BASE}/api/narrative/events?projectId=${encodeURIComponent(pid)}`);
      const d = r.ok ? await r.json() : {};
      setBindEvents((Array.isArray(d.events) ? d.events : []).map((e: any) => ({
        id: String(e.id), title: String(e.title || "untitled"),
        chronologyIndex: Number(e.chronologyIndex) || 0,
        status: e.status === "canon" ? "canon" as const : "draft" as const,
      })));
    } catch { setBindEvents([]); }
  }, []);

  const chooseEvent = useCallback(async (ev: EventRec) => {
    const target = bind;
    setBind(null);
    if (!target) return;
    if (target.beatId) {
      const d = await mutate("POST", `/api/narrative/dramaturgy/beats/${encodeURIComponent(target.beatId)}/bind`, { eventId: ev.id });
      if (d) showToast(`claimed t=${ev.chronologyIndex} · ${ev.title.slice(0, 40)}`);
    } else if (target.newLabel) {
      await addBeat({ label: target.newLabel, eventId: ev.id });
    }
  }, [bind, mutate, addBeat, showToast]);

  const mintFromBind = useCallback(async () => {
    const target = bind;
    setBind(null);
    if (!target) return;
    if (target.beatId) {
      const d = await mutate("POST", `/api/narrative/dramaturgy/beats/${encodeURIComponent(target.beatId)}/bind`, { mintEvent: true });
      if (d) showToast("draft event minted from this beat");
    } else if (target.newLabel) {
      await addBeat({ label: target.newLabel, mintEvent: true });
    }
  }, [bind, mutate, addBeat, showToast]);

  // ---- derived: act-grouped segments (consecutive runs share a header) ----
  const segments = useMemo<Segment[]>(() => {
    if (!view) return [];
    const actTitle = new Map(view.acts.map((a) => [a.act.id, a.act.title]));
    const sorted = [...view.beats].sort((a, b) => (a.beat.position ?? 0) - (b.beat.position ?? 0));
    const segs: Segment[] = [];
    for (const v of sorted) {
      const aid = v.beat.actId && actTitle.has(v.beat.actId) ? v.beat.actId : undefined;
      const last = segs[segs.length - 1];
      if (last && last.actId === aid) last.views.push(v);
      else segs.push({ actId: aid, title: aid ? actTitle.get(aid) : undefined, views: [v] });
    }
    return segs;
  }, [view]);

  // Hook lints lead — the cold-open check is the room's top note.
  const sortedLints = useMemo<Lint[]>(() => {
    const hookFirst = (c: string) => (c === "no-hook" || c === "cold-open" || c === "hook-undelivered" ? 0 : 1);
    const sev = (s: Lint["severity"]) => (s === "block" ? 0 : s === "warn" ? 1 : 2);
    return [...(view?.lints || [])].sort((a, b) => hookFirst(a.code) - hookFirst(b.code) || sev(a.severity) - sev(b.severity));
  }, [view]);

  const scrollToBeat = useCallback((beatId: string) => {
    setLintsOpen(false);
    document.getElementById(`dram-beat-${beatId}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  const filteredEvents = useMemo<EventRec[]>(() => {
    if (!bindEvents) return [];
    const f = bindFilter.trim().toLowerCase();
    if (!f) return bindEvents;
    return bindEvents.filter((e) => e.title.toLowerCase().includes(f) || `t=${e.chronologyIndex}`.includes(f));
  }, [bindEvents, bindFilter]);

  if (!projectId) {
    return <div className="h-full flex items-center justify-center text-gray-500 text-sm">Open a project to enter the dramaturgy room.</div>;
  }
  if (!view) {
    return <div className="h-full flex items-center justify-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Opening the room…</div>;
  }

  const fr = view.framing;
  const addChipsDisabled = !addLabel.trim();

  return (
    <div className="h-full flex flex-col bg-[#0b0a12] relative">
      {/* ---- FRAME BAR ---- */}
      <div className="border-b border-white/10 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <FrameField
            key={`log:${view.productionId}:${fr.logline || ""}`}
            value={fr.logline || ""}
            placeholder="logline — the telling in one line"
            className="flex-1 min-w-32"
            onSave={(v) => saveFraming({ logline: v })}
          />
          <FrameField
            key={`hook:${view.productionId}:${fr.hook?.text || ""}`}
            value={fr.hook?.text || ""}
            placeholder="what grabs the watcher?"
            className="w-56 border-amber-400/40 bg-amber-500/10 text-amber-100 placeholder:text-amber-300/50 focus:border-amber-400/70"
            onSave={(v) => saveFraming({ hook: { text: v, ...(fr.hook?.deliveredAtBeatId ? { deliveredAtBeatId: fr.hook.deliveredAtBeatId } : {}) } })}
          />
          <FrameField
            key={`thm:${view.productionId}:${fr.theme || ""}`}
            value={fr.theme || ""}
            placeholder="theme"
            className="w-36"
            onSave={(v) => saveFraming({ theme: v })}
          />
          <FrameField
            key={`mot:${view.productionId}:${fr.motifs || ""}`}
            value={fr.motifs || ""}
            placeholder="motifs"
            className="w-36"
            onSave={(v) => saveFraming({ motifs: v })}
          />
          <button
            onClick={() => setSynopsisOpen((o) => !o)}
            title={synopsisOpen ? "Fold the synopsis away" : "Unfold the synopsis"}
            className="rounded-lg border border-white/10 bg-black/30 p-1 text-gray-500 hover:text-gray-300"
          >
            {synopsisOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {view.span && (
            <span title="The stretch of the chronology this telling claims" className="text-[10px] font-mono text-gray-600">
              t={view.span.fromIndex}–{view.span.toIndex}
            </span>
          )}
          {sortedLints.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setLintsOpen((o) => !o)}
                title="Notes on the shape — never grades"
                className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                  sortedLints.some((l) => l.severity === "block") ? "border-rose-400/50 bg-rose-500/10 text-rose-300"
                    : sortedLints.some((l) => l.severity === "warn") ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                    : "border-white/15 bg-black/30 text-gray-400")}
              >
                <AlertTriangle className="w-3 h-3" /> {sortedLints.length} note{sortedLints.length === 1 ? "" : "s"}
              </button>
              {lintsOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 w-80 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-slate-950 shadow-2xl p-1.5 space-y-1">
                  {sortedLints.map((l, i) => (
                    <button
                      key={`${l.code}-${i}`}
                      onClick={() => { if (l.beatId) scrollToBeat(l.beatId); }}
                      className={cn("w-full text-left rounded-lg px-2 py-1.5", l.beatId ? "hover:bg-white/5 cursor-pointer" : "cursor-default")}
                    >
                      <span className={cn("text-[9px] uppercase tracking-wider mr-1.5",
                        l.severity === "block" ? "text-rose-400" : l.severity === "warn" ? "text-amber-400" : "text-gray-500")}>
                        {l.severity}
                      </span>
                      <span className="text-[10px] text-gray-300">{l.message}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {synopsisOpen && (
          <textarea
            key={`syn:${view.productionId}:${fr.synopsis || ""}`}
            defaultValue={fr.synopsis || ""}
            placeholder="synopsis — the fuller shape"
            rows={2}
            onBlur={(e) => { if (e.target.value !== (fr.synopsis || "")) saveFraming({ synopsis: e.target.value }); }}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40 resize-none"
          />
        )}
      </div>

      {/* ---- THE BOARD ---- */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex items-center gap-4 px-4 py-12 min-w-max">
          {view.beats.length === 0 && (
            <div className="max-w-xs pr-2">
              <Sparkles className="w-6 h-6 text-gray-700 mb-2" />
              <div className="text-gray-400 text-sm">The shape of the telling lives here.</div>
              <div className="text-gray-600 text-xs mt-1">Add a beat, or ask the agent to find the shape.</div>
            </div>
          )}
          {segments.map((seg, i) => (
            <div key={seg.actId || `free-${i}`} className="flex flex-col gap-1.5">
              <div className={cn("h-4 px-1 text-[10px] uppercase tracking-wider truncate",
                seg.title ? "text-amber-300/70 border-b border-amber-400/20" : "")}>
                {seg.title ? `${view.profile.groupLabel} · ${seg.title}` : ""}
              </div>
              <div className="flex items-center gap-3">
                {seg.views.map((v) => (
                  <BeatCard
                    key={v.beat.id}
                    v={v}
                    onPatch={patchBeat}
                    onDelete={deleteBeat}
                    onBind={(beatId) => void openBind({ beatId })}
                    onResync={resyncBeat}
                    onBreak={(id) => void breakBeat(id)}
                    onOpenScene={onOpenScene}
                    onDragStartCard={(id) => { dragIdRef.current = id; }}
                    onDropOnCard={onDropOnCard}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* ---- + BEAT (ghost card) ---- */}
          <div className="flex flex-col gap-1.5">
            <div className="h-4" />
            <div className="w-52 shrink-0 rounded-xl border border-dashed border-white/20 bg-slate-950/50 p-2.5">
              {!addOpen ? (
                <button
                  onClick={() => setAddOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-4 text-xs text-gray-500 hover:text-cyan-300"
                >
                  <Plus className="w-3.5 h-3.5" /> Beat
                </button>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      value={addLabel}
                      onChange={(e) => setAddLabel(e.target.value)}
                      autoFocus
                      placeholder="what happens?"
                      className="flex-1 min-w-0 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40"
                    />
                    <button onClick={() => { setAddOpen(false); setAddLabel(""); }} className="text-gray-600 hover:text-gray-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      disabled={addChipsDisabled}
                      onClick={() => void openBind({ newLabel: addLabel.trim() })}
                      title="Claim an existing WorldEvent for this beat"
                      className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40"
                    >
                      Claim an event ▾
                    </button>
                    <button
                      disabled={addChipsDisabled}
                      onClick={() => void addBeat({ label: addLabel.trim(), mintEvent: true })}
                      title="Mint a draft WorldEvent from this beat — canon is earned later"
                      className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                    >
                      Draft new event
                    </button>
                    <button
                      disabled={addChipsDisabled}
                      onClick={() => void addBeat({ label: addLabel.trim(), kind: "device", deviceKind: "montage" })}
                      title="Structural tissue (montage / title card / time-skip) — never claims an event"
                      className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/25 disabled:opacity-40"
                    >
                      Device
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- ORPHAN ROW (no shaming) ---- */}
      {orphans.length > 0 && (
        <div className="border-t border-white/10 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Scenes off the spine — adopt to place them</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {orphans.map((s) => (
              <div key={s.id} className="w-56 shrink-0 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/80 p-1.5">
                {s.imageUrl
                  ? <img src={resolveUrl(s.imageUrl)} alt="" draggable={false} className="w-12 h-8 object-cover rounded" />
                  : <div className="w-12 h-8 rounded bg-white/5 flex items-center justify-center"><Clapperboard className="w-3 h-3 text-gray-600" /></div>}
                <span className="flex-1 min-w-0 text-[10px] text-gray-300 truncate" title={s.title}>{s.title}</span>
                <button
                  onClick={() => void adoptScene(s.id)}
                  title="Adopt this scene as a beat on the board (claims its event if it has one)"
                  className="rounded-md border border-sky-400/40 bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-300 hover:bg-sky-500/25 whitespace-nowrap"
                >
                  Adopt as beat
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- BIND POPOVER ---- */}
      {bind && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setBind(null)}>
          <div className="w-[440px] max-h-[70%] flex flex-col rounded-2xl border border-white/15 bg-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Link2 className="w-3.5 h-3.5 text-cyan-300" />
              <span className="text-sm text-gray-200 flex-1 truncate">
                Claim which event{bind.newLabel ? ` for “${bind.newLabel}”` : ""}?
              </span>
              <button onClick={() => setBind(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-3 pt-2">
              <input
                value={bindFilter}
                onChange={(e) => setBindFilter(e.target.value)}
                autoFocus
                placeholder="filter the chronology…"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {bindEvents === null ? (
                <div className="p-6 text-center text-gray-500 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />reading the chronology…</div>
              ) : filteredEvents.length === 0 ? (
                <div className="p-6 text-center text-gray-600 text-xs">
                  {bindEvents.length === 0 ? "The chronology is empty — draft the first event below." : "Nothing matches — clear the filter or draft a new event."}
                </div>
              ) : (
                filteredEvents.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => void chooseEvent(ev)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left"
                  >
                    <span className="text-[10px] font-mono text-cyan-300 w-10 shrink-0">t={ev.chronologyIndex}</span>
                    <span className="flex-1 min-w-0 text-xs text-gray-200 truncate">{ev.title}</span>
                    <span className={cn("text-[9px] rounded-full border px-1.5 py-px shrink-0",
                      ev.status === "canon" ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-300" : "border-amber-400/40 bg-amber-500/10 text-amber-300")}>
                      {ev.status}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-white/10 p-2">
              <button
                onClick={() => void mintFromBind()}
                title="Mint a draft WorldEvent from this beat's label — it earns canon later, through the gate"
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300 hover:bg-amber-500/25"
              >
                <Sparkles className="w-3 h-3" /> draft a new event from this beat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- toast ---- */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/95 px-3 py-1.5 text-xs text-gray-200 shadow-2xl">
          <Check className="w-3 h-3 text-emerald-300" /> {toast}
        </div>
      )}
    </div>
  );
}

export default DramaturgyStudio;

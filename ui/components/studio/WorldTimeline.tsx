"use client";

/**
 * WorldTimeline — the world's master view as a PREMIERE-STYLE STACKED TIMELINE
 * (Michael's redesign, 2026-07-23; React Flow retired — too free-form for a
 * timeline). x = UNIVERSE CHRONOLOGY (a real axis with a ruler); each track is
 * a full production in its medium; a production SPANS the chronology length it
 * covers; canon events live on the top CANON track; productions carrying
 * unmerged drafts read as BRANCHES (dashed/amber) vs part of MAIN (solid).
 * Tracks show STILLS of their content (comic pages / film frames). A PLAYHEAD
 * scrubs story-time; the PREVIEW shows what a moment holds; a selected
 * production opens an INFO panel (participating entities, stage, notes,
 * metadata). Same props contract as before — zero parent changes.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Milestone, Link2, Loader2, RefreshCw, Film, BookOpen, Tv, Users,
  ArrowRight, Clapperboard, GitBranch, ZoomIn, ZoomOut, Maximize2, CheckCircle2, CircleDashed,
  ChevronDown, Sparkles, Skull, Baby, Brain, Package, MapPin, Wand2, Target,
  AlertTriangle, Lock, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
const FORMAT_ICONS = { film: Film, comic: BookOpen, episode: Tv } as const;
const FORMAT_HUE = { film: "34,211,238", comic: "56,189,248", episode: "192,132,252" } as const;
const STAGE_STYLE: Record<string, string> = {
  empty: "border-gray-600/40 bg-gray-700/20 text-gray-500",
  drafting: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  producing: "border-cyan-400/40 bg-cyan-500/15 text-cyan-300",
  exported: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
};
const KIND_ICON: Record<string, any> = {
  died: Skull, born: Baby, introduced: Baby, learned: Brain,
  acquired: Package, lost: Package, moved: MapPin, transformed: Wand2, custom: Target,
};

export interface WorldEventLite {
  id: string; chronologyIndex: number; title: string; description?: string;
  entityIds: string[]; status: "draft" | "canon"; arcId?: string; sourceProductionId?: string;
  stateChanges?: Array<{ entityId: string; kind: string; detail?: string }>;
  timelineId?: string;
}
interface Thumb { url: string; chronologyIndex: number | null; kind: string; label?: string }
interface Lane {
  productionId: string; title: string; format: "film" | "comic" | "episode";
  eventIds: string[]; minIndex: number | null; maxIndex: number | null;
  sceneCount: number; renderedScenes: number; keptPages: number; draftEvents: number;
  stage: string; autonomy: string; canonGate?: "creator" | "vote" | "rule"; branchState: "branch" | "main"; thumbnails: Thumb[]; entityIds: string[]; notes?: string;
}
interface Arc { id: string; title: string; status: string; minIndex: number | null; maxIndex: number | null; }
interface PickerScene { id: string; title: string; productionId: string; linked: boolean; }

interface WorldTimelineProps {
  projectId: string | null;
  refreshToken?: number;
  onDescend: (productionId: string) => void;
  onOpenEntities: () => void;
  onSelectedEvent?: (event: WorldEventLite | null) => void;
  onOpenScene?: (sceneId: string) => void;
  /** Click a participating entity → open its detail (parent focuses it). */
  onOpenEntity?: (entityId: string) => void;
  /** Restore this event as selected on mount (returning from an entity/scene). */
  initialSelectedEventId?: string | null;
}

const HEADER_W = 240;
const RULER_H = 34;
const TRACK_H = 92;
const CANON_H = 60;
const PAD_UNITS = 1;

export function WorldTimeline({ projectId, refreshToken = 0, onDescend, onOpenEntities, onSelectedEvent, onOpenScene, onOpenEntity, initialSelectedEventId }: WorldTimelineProps) {
  const [events, setEvents] = useState<WorldEventLite[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [scenePicker, setScenePicker] = useState<PickerScene[]>([]);
  const [unlinked, setUnlinked] = useState(0);
  const [entities, setEntities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [zoom, setZoom] = useState(120);
  const [playT, setPlayT] = useState<number>(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedProdId, setSelectedProdId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<any | null>(null);
  const [linkSceneId, setLinkSceneId] = useState("");
  const [creatingTelling, setCreatingTelling] = useState(false);
  const [expandedLaneId, setExpandedLaneId] = useState<string | null>(null); // lane opened downward → filmstrip
  const [canonBlock, setCanonBlock] = useState<any | null>(null);   // C3: gate/conflict block on the selected event
  const [tellingCanon, setTellingCanon] = useState<any | null>(null); // C3: bulk canonize-telling result/preview
  const laneScrollRef = useRef<HTMLDivElement | null>(null);
  const TRACK_H_OPEN = 220;
  const laneH = (l: Lane) => (expandedLaneId === l.productionId ? TRACK_H_OPEN : TRACK_H);

  const load = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/chronicle?projectId=${encodeURIComponent(projectId)}`);
      if (res.ok) {
        const d = await res.json();
        setEvents(d.events || []);
        setLanes((d.lanes || []).filter((l: Lane) => l.sceneCount > 0 || l.eventIds.length > 0 || l.stage !== "empty"));
        setArcs(d.arcs || []);
        setScenePicker(d.scenePicker || []);
        setUnlinked(d.unlinkedSceneCount || 0);
      }
      const er = await fetch(`${API_BASE}/api/narrative/entities?projectId=${encodeURIComponent(projectId)}`);
      if (er.ok) setEntities((await er.json()) || []);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  // Restore the event we were on before an entity/scene detour (once, when
  // events have loaded and nothing is selected yet).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !initialSelectedEventId || events.length === 0) return;
    if (events.some(e => e.id === initialSelectedEventId)) {
      restoredRef.current = true;
      void pickEvent(initialSelectedEventId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, initialSelectedEventId]);

  const { minC, maxC, spanW } = useMemo(() => {
    const all: number[] = [
      ...events.map(e => e.chronologyIndex),
      ...lanes.flatMap(l => [l.minIndex, l.maxIndex]).filter((n): n is number => n !== null),
    ];
    const lo = all.length ? Math.min(...all) : 0;
    const hi = all.length ? Math.max(...all) : 0;
    const min = lo - PAD_UNITS, max = hi + PAD_UNITS;
    return { minC: min, maxC: max, spanW: (max - min) * zoom };
  }, [events, lanes, zoom]);
  const xAt = (c: number) => (c - minC) * zoom;
  const cAtX = (px: number) => minC + px / zoom;
  const MIN_BAR = Math.max(64, zoom * 0.6);

  const entityById = useMemo(() => new Map(entities.map((e: any) => [e.id, e])), [entities]);
  const selectedEvent = events.find(e => e.id === selectedEventId) || null;
  const selectedLane = lanes.find(l => l.productionId === selectedProdId) || null;

  const pickEvent = async (id: string | null) => {
    setSelectedEventId(id);
    setCoverage(null);
    setCanonBlock(null); // clear any stale conflict panel from the previous event
    const ev = events.find(e => e.id === id) || null;
    onSelectedEvent?.(ev);
    if (ev) setPlayT(ev.chronologyIndex);
    if (!id || !projectId) return;
    try {
      const r = await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(id)}/coverage?projectId=${encodeURIComponent(projectId)}`);
      if (r.ok) setCoverage(await r.json());
    } catch { /* preview shows empty */ }
  };

  const scrubTo = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const scroll = laneScrollRef.current?.scrollLeft || 0;
    setPlayT(Math.max(minC, Math.min(maxC, cAtX(clientX - rect.left + scroll))));
  };

  const linkScene = async () => {
    if (!selectedEventId || !linkSceneId || !projectId) return;
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(selectedEventId)}/link-scene`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId: linkSceneId }),
      });
      setLinkSceneId("");
      await load();
      await pickEvent(selectedEventId);
    } finally { setBusy(false); }
  };

  // Inline event authoring — PATCH the selected event, then refresh.
  const updateEvent = async (patch: Record<string, any>) => {
    if (!selectedEventId || !projectId) return;
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(selectedEventId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...patch }),
      });
      await load();
      await pickEvent(selectedEventId);
    } finally { setBusy(false); }
  };

  // C3 — the GATED, VALIDATED canonize. On a 409 (gate not met / temporal
  // conflict) we surface the block (violations + resolutions) instead of a
  // silent no-op; `force` overrides it as a deliberate creator act.
  const canonize = async (force = false) => {
    if (!selectedEventId || !projectId) return;
    setBusy(true); setCanonBlock(null);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(selectedEventId)}/canonize`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, force }),
      });
      if (r.status === 409) { setCanonBlock(await r.json()); return; }
      await load();
      await pickEvent(selectedEventId);
    } finally { setBusy(false); }
  };

  const uncanonize = async () => {
    if (!selectedEventId || !projectId) return;
    setBusy(true); setCanonBlock(null);
    try {
      await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(selectedEventId)}/uncanonize`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }),
      });
      await load();
      await pickEvent(selectedEventId);
    } finally { setBusy(false); }
  };

  // C3 — lock a whole telling. dryRun previews (what would canonize vs. what's
  // blocked); a real run flips the clean ones. `force` overrides conflicts.
  const canonizeTelling = async (productionId: string, opts: { dryRun?: boolean; force?: boolean } = {}) => {
    if (!projectId) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/productions/${encodeURIComponent(productionId)}/canonize`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, dryRun: opts.dryRun === true, force: opts.force === true }),
      });
      if (r.ok) {
        setTellingCanon(await r.json());
        if (opts.dryRun !== true) await load();
      }
    } finally { setBusy(false); }
  };

  const setGate = async (productionId: string, gate: "creator" | "vote" | "rule") => {
    if (!projectId) return;
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/narrative/productions/${encodeURIComponent(productionId)}/canon-gate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, gate }),
      });
      await load();
    } finally { setBusy(false); }
  };

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
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }),
      });
      const sr = await fetch(`${API_BASE}/api/narrative/interactions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: event.title, description: event.description, participantIds: event.entityIds }),
      });
      if (sr.ok) {
        const sceneId = ((await sr.json()).interaction || {})?.id;
        if (sceneId) await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(event.id)}/link-scene`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, sceneId }),
        });
      }
      onDescend(production.id);
    } finally { setCreatingTelling(false); }
  };

  const fit = () => {
    const w = (laneScrollRef.current?.clientWidth || 900) - 40;
    const units = Math.max(1, maxC - minC);
    setZoom(Math.max(24, Math.min(400, w / units)));
  };

  const ticks = useMemo(() => {
    const range = maxC - minC;
    const step = range <= 6 ? 1 : range <= 20 ? 2 : range <= 60 ? 5 : 10;
    const out: number[] = [];
    for (let c = Math.ceil(minC / step) * step; c <= maxC; c += step) out.push(c);
    return out;
  }, [minC, maxC]);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mr-3" /> Composing the chronology…</div>;
  }

  const canvasW = Math.max(spanW + 40, 600);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0b0a12]">
      {/* Toolbar */}
      <div className="shrink-0 px-5 py-2 border-b border-white/10 flex items-center gap-3">
        <Milestone className="w-4 h-4 text-emerald-300" />
        <span className="text-sm text-gray-200 font-medium">Universe Chronology</span>
        <span className="text-xs text-gray-500">
          {events.length} event(s) · {lanes.length} telling(s)
          {unlinked > 0 && <span className="text-amber-400/90"> · {unlinked} unplaced</span>}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setZoom(z => Math.max(24, z / 1.4))} className="p-1.5 rounded-md border border-white/10 bg-white/5 text-gray-400 hover:text-gray-200" title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
          <button onClick={() => setZoom(z => Math.min(400, z * 1.4))} className="p-1.5 rounded-md border border-white/10 bg-white/5 text-gray-400 hover:text-gray-200" title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
          <button onClick={fit} className="p-1.5 rounded-md border border-white/10 bg-white/5 text-gray-400 hover:text-gray-200" title="Fit to width"><Maximize2 className="w-3.5 h-3.5" /></button>
          <button onClick={onOpenEntities} className="ml-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Entities ({entities.length})</button>
          <button onClick={load} className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-gray-200"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* ===== The stacked timeline ===== */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 flex">
          {/* Left: track headers */}
          <div className="shrink-0 border-r border-white/10 bg-slate-950/60 overflow-y-auto" style={{ width: HEADER_W }}>
            <div style={{ height: RULER_H }} className="border-b border-white/10 flex items-center px-3 text-[10px] uppercase tracking-widest text-gray-600">Tracks</div>
            <div style={{ height: CANON_H }} className="border-b border-white/10 flex items-center gap-2 px-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span className="text-sm text-emerald-200 font-medium">Canon</span>
              <span className="text-[10px] text-gray-600 ml-auto">main line</span>
            </div>
            {lanes.map(lane => {
              const Icon = FORMAT_ICONS[lane.format] || Film;
              const sel = lane.productionId === selectedProdId;
              const open = expandedLaneId === lane.productionId;
              return (
                <div key={lane.productionId} style={{ height: laneH(lane) }}
                  onClick={() => setSelectedProdId(sel ? null : lane.productionId)}
                  className={cn("border-b border-white/5 px-3 py-2 flex flex-col justify-center gap-1 cursor-pointer transition-colors", sel ? "bg-cyan-500/10" : "hover:bg-white/5")}>
                  <div className="flex items-center gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); setExpandedLaneId(open ? null : lane.productionId); }}
                      title={open ? "Collapse lane" : "Expand lane to see its stills"} className="text-gray-500 hover:text-gray-200">
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open ? "" : "-rotate-90")} />
                    </button>
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: `rgb(${FORMAT_HUE[lane.format]})` }} />
                    <span className="text-xs text-gray-100 truncate flex-1" title={lane.title}>{lane.title}</span>
                    <button onClick={(e) => { e.stopPropagation(); onDescend(lane.productionId); }} title="Open in the studio" className="text-gray-600 hover:text-cyan-300"><ArrowRight className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-1 pl-5">
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border", STAGE_STYLE[lane.stage] || STAGE_STYLE.empty)}>{lane.stage}</span>
                    {lane.branchState === "branch"
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-300 flex items-center gap-0.5"><GitBranch className="w-2.5 h-2.5" />branch</span>
                      : <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300/80">main</span>}
                  </div>
                  {open && <div className="pl-5 text-[10px] text-gray-500 mt-1">{lane.thumbnails.length} still(s) · click ↗ to edit</div>}
                </div>
              );
            })}
            {lanes.length === 0 && <div className="p-3 text-[11px] text-gray-600">No tellings yet.</div>}
          </div>

          {/* Right: scrollable canvas */}
          <div ref={laneScrollRef} className="flex-1 min-h-0 overflow-auto relative">
            <div style={{ width: canvasW }} className="relative">
              {/* Ruler (scrub) */}
              <div style={{ height: RULER_H }}
                className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0a12] cursor-col-resize select-none"
                onMouseDown={(e) => { const el = e.currentTarget as HTMLElement; scrubTo(e.clientX, el); const mv = (m: MouseEvent) => scrubTo(m.clientX, el); const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }; window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up); }}>
                {ticks.map(t => (
                  <div key={t} className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: xAt(t) }}>
                    <div className="w-px h-2 bg-white/20" />
                    <span className="text-[9px] text-gray-600 mt-0.5">t={t}</span>
                  </div>
                ))}
              </div>

              {/* Canon track */}
              <div style={{ height: CANON_H }} className="relative border-b border-white/10">
                <div className="absolute left-0 right-0 top-1/2 border-t-2 border-emerald-500/40" />
                {events.map(ev => {
                  const sel = ev.id === selectedEventId;
                  return (
                    <button key={ev.id} onClick={() => pickEvent(sel ? null : ev.id)}
                      className="absolute -translate-x-1/2 top-1/2 -translate-y-1/2 group" style={{ left: xAt(ev.chronologyIndex) }}
                      title={`${ev.title} (t=${ev.chronologyIndex} · ${ev.status})`}>
                      <span className={cn("block rounded-full border-[3px] transition-transform group-hover:scale-125",
                        ev.status === "canon"
                          ? (sel ? "w-5 h-5 bg-emerald-200 border-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.8)]" : "w-4 h-4 bg-emerald-500 border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]")
                          : (sel ? "w-5 h-5 bg-amber-500/40 border-amber-300" : "w-4 h-4 bg-transparent border-amber-500/80")
                      )} />
                      {ev.sourceProductionId && <span className="absolute -top-1 -right-1 text-[8px] text-amber-300">⎇</span>}
                    </button>
                  );
                })}
                {events.length === 0 && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] text-gray-600">No events yet — ask the agent to author the world's first moment.</span>}
              </div>

              {/* Production tracks */}
              {lanes.map(lane => {
                const hasSpan = lane.minIndex !== null && lane.maxIndex !== null;
                const startX = hasSpan ? xAt(lane.minIndex!) : 8;
                const rawW = hasSpan ? xAt(lane.maxIndex!) - xAt(lane.minIndex!) : 0;
                const barW = Math.max(rawW, MIN_BAR);
                const barX = hasSpan ? startX - (barW - rawW) / 2 : 8;
                const hue = FORMAT_HUE[lane.format];
                const sel = lane.productionId === selectedProdId;
                const isBranch = lane.branchState === "branch";
                const open = expandedLaneId === lane.productionId;
                return (
                  <div key={lane.productionId} style={{ height: laneH(lane) }} className="relative border-b border-white/5">
                    <div
                      onClick={() => setSelectedProdId(sel ? null : lane.productionId)}
                      className="absolute top-2 bottom-2 rounded-lg overflow-hidden cursor-pointer transition-all"
                      style={{
                        left: Math.max(4, barX), width: barW,
                        border: `2px ${isBranch ? "dashed" : "solid"} rgba(${isBranch ? "251,191,36" : hue},${sel ? 0.9 : 0.5})`,
                        background: `rgba(${hue},0.08)`,
                        boxShadow: sel ? `0 0 0 2px rgba(${hue},0.3)` : undefined,
                      }}
                      title={`${lane.title} — spans t=${lane.minIndex} to t=${lane.maxIndex}`}>
                      {/* content stills — a bigger filmstrip when the lane is expanded */}
                      <div className="h-full flex items-stretch gap-px overflow-hidden">
                        {lane.thumbnails.length > 0 ? lane.thumbnails.map((th, i) => (
                          <div key={i} className="relative h-full shrink-0 group/still" style={{ width: open ? (lane.format === "comic" ? 130 : 200) : (lane.format === "comic" ? 48 : 80) }}>
                            <img src={th.url.startsWith("http") ? th.url : `${API_BASE}${th.url}`} alt={th.label || ""}
                              className={cn("w-full h-full object-cover", lane.format === "comic" ? "object-top" : "")} />
                            {open && th.label && <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-gray-200 px-1 py-0.5 truncate">{th.label}</span>}
                          </div>
                        )) : (
                          <div className="w-full h-full flex items-center px-3 text-[11px] text-gray-500">{lane.sceneCount} scene(s) · {lane.stage} — no stills yet</div>
                        )}
                      </div>
                      {lane.eventIds.map(eid => {
                        const ev = events.find(e => e.id === eid); if (!ev) return null;
                        return <span key={eid} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: xAt(ev.chronologyIndex) - Math.max(4, barX) }} />;
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Playhead (full canvas height) */}
              <div className="absolute z-30 pointer-events-none" style={{ left: xAt(playT), top: 0, height: RULER_H + CANON_H + lanes.reduce((h, l) => h + laneH(l), 0) }}>
                <div className="w-px h-full bg-amber-400/80" />
                <div className="absolute -top-0.5 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-amber-400" />
              </div>
            </div>
          </div>
        </div>

        {/* ===== Metadata / preview / info — ABOVE the swimlane (Michael) ===== */}
        <div className="order-first shrink-0 border-b border-white/10 bg-slate-950/80 px-5 py-2.5 max-h-[48%] overflow-y-auto flex gap-6">
          <div className="flex-1 min-w-0">
            {selectedEvent ? (
              <>
                {/* ===== EVENT AUTHORING HEADER ===== */}
                <div className="flex items-start gap-3 mb-2">
                  <button onClick={() => selectedEvent.status === "canon" ? uncanonize() : canonize(false)}
                    title={selectedEvent.status === "canon" ? "Canon — click to return to draft" : "Draft — click to canonize (gated + validated)"} disabled={busy}
                    className="mt-0.5 shrink-0">
                    {selectedEvent.status === "canon" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <CircleDashed className="w-5 h-5 text-amber-400" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <input
                      key={`title-${selectedEvent.id}`} defaultValue={selectedEvent.title}
                      onBlur={e => { if (e.target.value.trim() && e.target.value !== selectedEvent.title) updateEvent({ title: e.target.value.trim() }); }}
                      className="w-full bg-transparent text-sm text-gray-100 font-medium focus:outline-none focus:bg-white/5 rounded px-1 -ml-1"
                    />
                    {/* chronology stepper + status + pacing */}
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <button onClick={() => updateEvent({ chronologyIndex: selectedEvent.chronologyIndex - 1 })} disabled={busy} className="px-1 rounded hover:bg-white/10 text-gray-400">−</button>
                        <span className="text-gray-300">t={selectedEvent.chronologyIndex}</span>
                        <button onClick={() => updateEvent({ chronologyIndex: selectedEvent.chronologyIndex + 1 })} disabled={busy} className="px-1 rounded hover:bg-white/10 text-gray-400">+</button>
                      </span>
                      <span className={selectedEvent.status === "canon" ? "text-emerald-400/80" : "text-amber-400/80"}>{selectedEvent.status}</span>
                      {(() => {
                        const sorted = events.slice().sort((a, b) => a.chronologyIndex - b.chronologyIndex);
                        const i = sorted.findIndex(e => e.id === selectedEvent.id);
                        const prev = sorted[i - 1], next = sorted[i + 1];
                        return <span className="text-gray-600">
                          {prev ? `${selectedEvent.chronologyIndex - prev.chronologyIndex} after "${prev.title.slice(0, 20)}"` : "first moment"}
                          {next ? ` · ${next.chronologyIndex - selectedEvent.chronologyIndex} before "${next.title.slice(0, 20)}"` : " · latest moment"}
                        </span>;
                      })()}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider flex items-center gap-1"><Clapperboard className="w-3 h-3" />new telling:</span>
                    {(["film", "comic", "episode"] as const).map(f => {
                      const Icon = FORMAT_ICONS[f];
                      return <button key={f} onClick={() => newTellingFrom(selectedEvent, f)} disabled={creatingTelling}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center gap-1 capitalize">
                        {creatingTelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}{f}</button>;
                    })}
                  </div>
                </div>
                {/* C3 — canonization block: gate not met, or a temporal conflict
                    with canon. Shows the contradiction + the four narrative
                    resolutions, and lets the creator override. */}
                {canonBlock && (
                  <div className="mb-2 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-rose-300 font-medium mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {canonBlock.reason === "gate" ? "Canonization gate not met" : "Can't canonize — this would contradict canon"}
                    </div>
                    <div className="text-[11px] text-rose-200/90 mb-1.5">{canonBlock.message || canonBlock.error}</div>
                    {Array.isArray(canonBlock.violations) && canonBlock.violations.length > 0 && (
                      <ul className="text-[10px] text-rose-200/70 list-disc list-inside mb-1.5 space-y-0.5">
                        {canonBlock.violations.slice(0, 4).map((v: any, i: number) => <li key={i}>{v.message}</li>)}
                      </ul>
                    )}
                    {Array.isArray(canonBlock.resolutions) && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {canonBlock.resolutions.map((r: any) => (
                          <span key={r.kind} title={r.how} className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-300 cursor-help">{r.label}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={() => canonize(true)} disabled={busy}
                        className="text-[10px] px-2 py-1 rounded border border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:opacity-50">
                        Canonize anyway (override)
                      </button>
                      <button onClick={() => setCanonBlock(null)} className="text-[10px] text-gray-500 hover:text-gray-300">Dismiss</button>
                    </div>
                  </div>
                )}
                {/* description + notes — inline editable (the authoring surface) */}
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <textarea key={`desc-${selectedEvent.id}`} defaultValue={selectedEvent.description || ""}
                    onBlur={e => { if (e.target.value !== (selectedEvent.description || "")) updateEvent({ description: e.target.value }); }}
                    placeholder="What happens in this moment…"
                    className="h-12 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40 resize-none" />
                  <textarea key={`notes-${selectedEvent.id}`} defaultValue={(selectedEvent as any).notes || ""}
                    onBlur={e => { if (e.target.value !== ((selectedEvent as any).notes || "")) updateEvent({ notes: e.target.value }); }}
                    placeholder="Story / pacing notes — beats, tension, why it matters…"
                    className="h-12 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-amber-200/70 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none" />
                </div>
                <div className="flex flex-wrap items-start gap-x-6 gap-y-2 mb-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Participants {selectedEvent.entityIds?.length ? `(${selectedEvent.entityIds.length})` : ""}</div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {(selectedEvent.entityIds || []).map(id => { const e = entityById.get(id); const img = e?.referenceImage || e?.imageUrl;
                        return <span key={id} className="text-[11px] pl-1 pr-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-gray-200 flex items-center gap-1.5 group/part">
                          <button onClick={() => onOpenEntity?.(id)} title={`Open ${e?.name || id}`} className="flex items-center gap-1.5 hover:text-cyan-200">
                            {img ? <img src={img.startsWith("http") ? img : `${API_BASE}${img}`} className="w-5 h-5 rounded-full object-cover" alt="" /> : <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px]">{(e?.name || "?")[0]}</span>}
                            {e?.name || id}
                          </button>
                          <button onClick={() => updateEvent({ entityIds: (selectedEvent.entityIds || []).filter(x => x !== id) })} className="opacity-0 group-hover/part:opacity-100 text-gray-500 hover:text-rose-300" title="Remove">×</button>
                        </span>; })}
                      <select value="" onChange={e => { if (e.target.value) updateEvent({ entityIds: [...(selectedEvent.entityIds || []), e.target.value] }); }}
                        className="text-[11px] rounded-full border border-dashed border-white/15 bg-transparent px-2 py-1 text-gray-500 hover:text-gray-300 focus:outline-none">
                        <option value="" className="bg-gray-900">+ add</option>
                        {entities.filter((en: any) => !(selectedEvent.entityIds || []).includes(en.id)).map((en: any) => <option key={en.id} value={en.id} className="bg-gray-900">{en.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {selectedEvent.stateChanges && selectedEvent.stateChanges.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">How the world changed</div>
                      <div className="flex flex-col gap-1">
                        {selectedEvent.stateChanges.map((c, i) => { const Icon = KIND_ICON[c.kind] || Target; const e = entityById.get(c.entityId);
                          return <div key={i} className="text-[11px] text-gray-300 flex items-center gap-1.5">
                            <Icon className="w-3 h-3 text-cyan-300/80" /><span className="text-gray-200">{e?.name || c.entityId}</span>
                            <span className="text-gray-500">{c.kind}</span>{c.detail && <span className="text-gray-400">— {c.detail}</span>}</div>; })}
                      </div>
                      <div className="text-[10px] text-gray-600 mt-1 italic">ask the agent to add/change state deltas</div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-600">Told in</span>
                  <select value={linkSceneId} onChange={e => setLinkSceneId(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-2 py-0.5 text-[11px] text-gray-300 max-w-[200px]">
                    <option value="" className="bg-gray-900">Link a scene…</option>
                    {scenePicker.map(s => { const l = lanes.find(x => x.productionId === s.productionId); return <option key={s.id} value={s.id} className="bg-gray-900">{l ? `[${l.title}] ` : ""}{s.title}{s.linked ? " ✓" : ""}</option>; })}
                  </select>
                  <button onClick={linkScene} disabled={!linkSceneId || busy} className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[11px] hover:bg-emerald-500/25 disabled:opacity-50 flex items-center gap-1"><Link2 className="w-3 h-3" />Link</button>
                </div>
                {coverage && (coverage.dramatizations?.length || coverage.comicPages?.length) ? (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {(coverage.dramatizations || []).map((d: any) => {
                      const Icon = FORMAT_ICONS[d.format as keyof typeof FORMAT_ICONS] || Film;
                      return (
                        <button key={d.sceneId} onClick={() => onOpenScene?.(d.sceneId)} className="shrink-0 w-36 rounded-lg border border-white/10 bg-white/5 overflow-hidden text-left hover:border-cyan-400/40">
                          {d.imageUrl ? <img src={d.imageUrl.startsWith("http") ? d.imageUrl : `${API_BASE}${d.imageUrl}`} alt="" className="w-full h-16 object-cover" /> : <div className="w-full h-16 bg-black/30 flex items-center justify-center"><Icon className="w-5 h-5 text-gray-700" /></div>}
                          <div className="p-2"><div className="text-[11px] text-gray-200 truncate flex items-center gap-1"><Icon className="w-3 h-3 text-cyan-300" />{d.sceneTitle}</div><div className="text-[10px] text-gray-500 truncate">{d.productionTitle}</div></div>
                        </button>
                      );
                    })}
                    {(coverage.comicPages || []).map((pg: any) => (
                      <div key={pg.pageId} className="shrink-0 w-36 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                        {pg.imageUrl && <img src={pg.imageUrl.startsWith("http") ? pg.imageUrl : `${API_BASE}${pg.imageUrl}`} alt="" className="w-full h-16 object-cover object-top" />}
                        <div className="p-2"><div className="text-[11px] text-gray-200 flex items-center gap-1"><BookOpen className="w-3 h-3 text-cyan-300" />Page {pg.pageNumber}</div><div className="text-[10px] text-gray-500 truncate">{pg.productionTitle} · {pg.status}</div></div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-xs text-gray-600">No telling of this moment yet — start one above, or ask the agent.</div>}
              </>
            ) : selectedLane ? (
              <div className="text-sm text-gray-500 flex items-center gap-2 h-full">
                <Clapperboard className="w-4 h-4 text-gray-600" /> Inspecting <span className="text-gray-300">{selectedLane.title}</span> — its metadata is in the panel at right. Click an event to see the moment; click ↗ to open the telling.
              </div>
            ) : (
              /* World-at-a-glance: the empty area now carries the world's shape */
              <div className="h-full">
                <div className="flex items-center gap-2 mb-2">
                  <Milestone className="w-4 h-4 text-emerald-300" />
                  <span className="text-sm text-gray-200 font-medium">The world at a glance</span>
                  <span className="text-[10px] text-gray-600">playhead t={playT.toFixed(1)}</span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400 mb-3">
                  <span><span className="text-emerald-300 font-medium">{events.filter(e => e.status === "canon").length}</span> canon · <span className="text-amber-300">{events.filter(e => e.status === "draft").length}</span> draft events</span>
                  <span><span className="text-gray-200 font-medium">{lanes.length}</span> telling(s) · {lanes.filter(l => l.branchState === "branch").length} on branches</span>
                  <span><span className="text-gray-200 font-medium">{entities.length}</span> entities</span>
                  {arcs.length > 0 && <span><span className="text-purple-300 font-medium">{arcs.length}</span> arc(s)</span>}
                  {unlinked > 0 && <span className="text-amber-400/80">{unlinked} scene(s) not yet placed on the chronology</span>}
                </div>
                <div className="text-[11px] text-gray-600">
                  Click an <span className="text-emerald-300">event</span> to see every telling of it and how it changed the world · click a <span className="text-cyan-300">track</span> to inspect a production · <span className="text-gray-400">ask the agent below</span> to author events, entities, and whole worlds.
                </div>
              </div>
            )}
          </div>

          {selectedLane && (
            <div className="shrink-0 w-72 border-l border-white/10 pl-5">
              <div className="flex items-center gap-2 mb-2">
                {(() => { const Icon = FORMAT_ICONS[selectedLane.format] || Film; return <Icon className="w-4 h-4" style={{ color: `rgb(${FORMAT_HUE[selectedLane.format]})` }} />; })()}
                <span className="text-sm text-gray-100 font-medium truncate">{selectedLane.title}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", STAGE_STYLE[selectedLane.stage])}>{selectedLane.stage}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-gray-400 capitalize">{selectedLane.format}</span>
                {selectedLane.branchState === "branch" && <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-300">branch · {selectedLane.draftEvents} draft</span>}
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-gray-400">dial: {selectedLane.autonomy}</span>
              </div>
              <div className="text-[11px] text-gray-500 mb-2">
                {selectedLane.sceneCount} scene(s) · {selectedLane.renderedScenes} rendered{selectedLane.format === "comic" ? ` · ${selectedLane.keptPages} page(s)` : ""} · spans t={selectedLane.minIndex ?? "—"}→{selectedLane.maxIndex ?? "—"}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Participating entities</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {selectedLane.entityIds.length ? selectedLane.entityIds.map(id => {
                  const e = entityById.get(id);
                  const img = e?.referenceImage || e?.imageUrl;
                  return <span key={id} className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-gray-300 flex items-center gap-1">
                    {img ? <img src={img.startsWith("http") ? img : `${API_BASE}${img}`} className="w-3.5 h-3.5 rounded-full object-cover" alt="" /> : <Users className="w-3 h-3 text-gray-500" />}
                    {e?.name || id}</span>;
                }) : <span className="text-[11px] text-gray-600">none yet</span>}
              </div>
              {selectedLane.notes && <div className="text-[11px] text-gray-400 italic mb-3">{selectedLane.notes}</div>}

              {/* ===== C3 — CANONIZE THIS TELLING ===== */}
              <div className="mb-3 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                  <Lock className="w-3 h-3" /> Canonization
                </div>
                {/* gate selector */}
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-[10px] text-gray-500 mr-1">gate:</span>
                  {(["creator", "vote", "rule"] as const).map(g => {
                    const on = (selectedLane.canonGate || "creator") === g;
                    return <button key={g} onClick={() => setGate(selectedLane.productionId, g)} disabled={busy}
                      title={g === "creator" ? "A human locks events into canon (the live gate)" : g === "vote" ? "A quorum of votes canonizes (M3 — scaffolded)" : "An Aureum rule auto-canonizes (T6 — scaffolded)"}
                      className={cn("text-[10px] px-1.5 py-0.5 rounded border capitalize", on ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-gray-400 hover:text-gray-200")}>{g}</button>;
                  })}
                </div>
                {selectedLane.draftEvents > 0 ? (
                  <>
                    <div className="text-[11px] text-amber-300/90 mb-1.5">{selectedLane.draftEvents} draft event(s) awaiting canon.</div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => canonizeTelling(selectedLane.productionId, { dryRun: true })} disabled={busy}
                        className="text-[10px] px-2 py-1 rounded border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50">Preview</button>
                      <button onClick={() => canonizeTelling(selectedLane.productionId)} disabled={busy}
                        className="flex-1 text-[10px] px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Canonize this telling
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-emerald-400/80 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> All events are canon.</div>
                )}
                {/* result / preview summary — only for this telling */}
                {tellingCanon?.production?.id === selectedLane.productionId && (
                  <div className="mt-2 text-[10px] text-gray-400 border-t border-white/10 pt-1.5">
                    {tellingCanon.dryRun ? "Preview: " : ""}{tellingCanon.canonized?.length || 0}/{tellingCanon.total || 0} {tellingCanon.dryRun ? "would canonize" : "canonized"}
                    {(tellingCanon.blocked?.length || 0) > 0 && (
                      <div className="mt-1 text-rose-300/80">
                        {tellingCanon.blocked.length} blocked:
                        <ul className="list-disc list-inside text-rose-200/60">
                          {tellingCanon.blocked.slice(0, 3).map((b: any) => <li key={b.eventId} title={b.message}>{b.title}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button onClick={() => onDescend(selectedLane.productionId)} className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 px-3 py-1.5 text-xs hover:bg-cyan-500/25 flex items-center justify-center gap-1.5">
                Open in the studio <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorldTimeline;

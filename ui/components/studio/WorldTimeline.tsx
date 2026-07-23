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
 */

import { useState, useEffect, useCallback } from "react";
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

  const load = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
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

  const selectEvent = async (id: string | null) => {
    setSelectedId(id);
    setCoverage(null);
    const event = events.find(e => e.id === id) || null;
    onSelectedEvent?.(event);
    if (!id || !projectId) return;
    try {
      const res = await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(id)}/coverage?projectId=${encodeURIComponent(projectId)}`);
      if (res.ok) setCoverage(await res.json());
    } catch { /* panel shows empty */ }
  };

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

  const SLOT = 220;
  const PAD = 80;
  const width = Math.max(1100, PAD * 2 + Math.max(events.length - 1, 0) * SLOT + 240);
  const xAt = (i: number) => PAD + i * SLOT;
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

      {/* Timeline canvas */}
      <div className="flex-1 min-h-0 overflow-auto relative">
        <div style={{ width, minHeight: 360 }} className="relative">
          <div className="absolute left-0 right-0 top-0 h-10 border-b border-white/5">
            {arcs.filter(a => a.minIndex !== null).map((arc) => {
              const from = events.findIndex(e => e.chronologyIndex === arc.minIndex);
              const to = events.findIndex(e => e.chronologyIndex === arc.maxIndex);
              if (from < 0 || to < 0) return null;
              return (
                <div key={arc.id}
                  className="absolute h-6 rounded-full border border-purple-400/40 bg-purple-500/10 text-purple-300 text-[11px] px-3 flex items-center truncate"
                  style={{ left: xAt(from) - 40, width: (to - from) * SLOT + 80, top: 8 }}
                  title={`Arc: ${arc.title} (${arc.status})`}>
                  {arc.title}
                </div>
              );
            })}
          </div>

          {/* ================= GIT-GRAPH RENDERING =================
              The CANON SPINE is the main line; each production is a branch
              line diverging below it at its first covered event. Canon
              events sit ON the spine; DRAFT events sit on their SOURCE
              production's branch line (unmerged work lives on its branch —
              canonization moves the dot up to the spine). */}
          <svg className="absolute left-0 pointer-events-none" style={{ top: 0, width, height: 200 + lanes.length * 56 }}>
            {/* the canon spine */}
            <line x1={PAD - 40} y1={106} x2={width - 40} y2={106} stroke="rgba(16,185,129,0.45)" strokeWidth={2.5} />
            <polygon points={`${width - 40},106 ${width - 52},101 ${width - 52},111`} fill="rgba(16,185,129,0.45)" />
            {/* branch lines: diverge from the spine at the first covered event */}
            {lanes.filter(l => l.eventIds.length > 0 || l.sceneCount > 0).map((lane, li) => {
              const laneY = 224 + li * 56;
              const idxs = lane.eventIds.map(id => events.findIndex(e => e.id === id)).filter(i => i >= 0);
              const branchStartX = idxs.length > 0 ? xAt(Math.min(...idxs)) : PAD - 20;
              const branchEndX = idxs.length > 0 ? Math.max(xAt(Math.max(...idxs)) + 60, branchStartX + 120) : branchStartX + 120;
              const hue = lane.format === "comic" ? "56,189,248" : lane.format === "episode" ? "192,132,252" : "34,211,238";
              return (
                <g key={lane.productionId}>
                  {/* divergence curve from the spine */}
                  <path d={`M ${branchStartX} 106 C ${branchStartX - 30} ${106 + (laneY - 106) * 0.4}, ${branchStartX - 30} ${laneY - 20}, ${branchStartX - 10} ${laneY}`}
                    fill="none" stroke={`rgba(${hue},0.35)`} strokeWidth={2} strokeDasharray={lane.draftEvents > 0 ? "5 4" : undefined} />
                  {/* the branch line */}
                  <line x1={branchStartX - 10} y1={laneY} x2={branchEndX} y2={laneY} stroke={`rgba(${hue},0.35)`} strokeWidth={2} strokeDasharray={lane.draftEvents > 0 ? "5 4" : undefined} />
                  <polygon points={`${branchEndX + 10},${laneY} ${branchEndX - 2},${laneY - 4} ${branchEndX - 2},${laneY + 4}`} fill={`rgba(${hue},0.35)`} />
                  {/* commit dots: covered events on the branch */}
                  {idxs.map(i => (
                    <circle key={i} cx={xAt(i)} cy={laneY} r={4.5} fill={`rgba(${hue},0.9)`} stroke="#0b0a12" strokeWidth={2} />
                  ))}
                  {/* vertical trace from branch dot up to its spine event */}
                  {idxs.map(i => (
                    <line key={`t${i}`} x1={xAt(i)} y1={laneY - 5} x2={xAt(i)} y2={112} stroke={`rgba(${hue},0.12)`} strokeWidth={1.5} />
                  ))}
                </g>
              );
            })}
          </svg>
          {events.map((e, i) => {
            const isSel = e.id === selectedId;
            return (
              <div key={e.id} className="absolute" style={{ left: xAt(i) - 90, top: 70, width: 180 }}>
                <button onClick={() => selectEvent(isSel ? null : e.id)} className="w-full flex flex-col items-center gap-2 group">
                  <span className={cn(
                    "w-6 h-6 rounded-full border-[3px] transition-all group-hover:scale-110 shadow-lg mt-6",
                    e.status === "canon"
                      ? (isSel ? "bg-emerald-300 border-emerald-100 shadow-emerald-500/40" : "bg-emerald-500 border-emerald-300 shadow-emerald-500/20")
                      : (isSel ? "bg-amber-500/30 border-amber-300" : "bg-transparent border-amber-500/80")
                  )} />
                  <span className={cn("text-xs leading-snug text-center line-clamp-2 px-1", isSel ? "text-white" : "text-gray-400 group-hover:text-gray-200")}>
                    {e.title}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    t={e.chronologyIndex} · {e.status}{e.sourceProductionId ? " · ⎇" : ""}
                  </span>
                </button>
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: 140 }}>
              <Milestone className="w-10 h-10 text-emerald-400/30 mx-auto mb-3" />
              <div className="text-gray-400">The chronology is empty.</div>
              <div className="text-sm text-gray-600 max-w-sm mt-1">
                Ask the agent to author the first world event — it will handle the metadata (cast, state changes, placement).
              </div>
            </div>
          )}

          <div className="absolute left-0 right-0" style={{ top: 196 }}>
            {lanes.filter(l => l.sceneCount > 0 || l.eventIds.length > 0 || l.stage !== "empty").map((lane) => {
              const Icon = FORMAT_ICONS[lane.format] || Film;
              const idxs = lane.eventIds.map(id => events.findIndex(e => e.id === id)).filter(i => i >= 0);
              const hasSpan = idxs.length > 0;
              const from = hasSpan ? Math.min(...idxs) : 0;
              const to = hasSpan ? Math.max(...idxs) : 0;
              return (
                <div key={lane.productionId} className="relative h-14 border-b border-white/5">
                  <button
                    onClick={() => onDescend(lane.productionId)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-1.5 hover:border-cyan-400/50 group"
                    title={`Open "${lane.title}" in its authorship space`}
                  >
                    <Icon className="w-4 h-4 text-cyan-300" />
                    <span className="text-sm text-gray-200 max-w-[180px] truncate">{lane.title}</span>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", STAGE_STYLE[lane.stage] || STAGE_STYLE.empty)}>
                      {lane.stage}
                    </span>
                    {lane.draftEvents > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-300 flex items-center gap-1"
                        title="Unmerged branch: draft events awaiting validation into canon">
                        <GitBranch className="w-2.5 h-2.5" />branch · {lane.draftEvents}
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-cyan-300" />
                  </button>
                  {!hasSpan && (
                    <span className="absolute left-[320px] top-1/2 -translate-y-1/2 text-[11px] text-gray-600">
                      {lane.sceneCount} scene(s), none placed on the chronology yet
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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

"use client";

/**
 * ChronicleView — C2 (CHRONICLE_DESIGN.md): the world's master view.
 *
 * Horizontal axis = UNIVERSE CHRONOLOGY (WorldEvent.chronologyIndex — the
 * valid-time clock; never authoring order). The event spine runs across the
 * top; each production renders a coverage lane spanning the events its
 * scenes dramatize. Overlapping lanes = the same moment told from multiple
 * vantage points — clicking an event shows every dramatization side by side
 * (the true-transmedia click-through). v1 is deliberately static: spine +
 * lanes + coverage panel + create/link. Span-select create-from-here is C2b.
 */

import { useState, useEffect, useCallback } from "react";
import { Milestone, Plus, Link2, Loader2, RefreshCw, Film, BookOpen, Tv, CheckCircle2, CircleDashed, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChronicleEvent {
  id: string;
  chronologyIndex: number;
  title: string;
  description?: string;
  entityIds: string[];
  status: "draft" | "canon";
  arcId?: string;
}
interface ChronicleLane {
  productionId: string;
  title: string;
  format: "film" | "comic" | "episode";
  eventIds: string[];
  minIndex: number | null;
  maxIndex: number | null;
}
interface ChronicleArc {
  id: string; title: string; status: string; minIndex: number | null; maxIndex: number | null;
}
interface CoverageScene {
  sceneId: string; sceneTitle: string; productionId: string; productionTitle: string; format: string; stale: boolean; imageUrl?: string;
}
interface CoveragePage {
  pageId: string; pageNumber: number; status: string; imageUrl?: string; productionId: string; productionTitle: string;
}

const FORMAT_ICONS = { film: Film, comic: BookOpen, episode: Tv } as const;

interface ChronicleViewProps {
  projectId: string | null;
  /** Scenes of the ACTIVE production (for the link-scene picker). */
  scenes: Array<{ id: string; title: string }>;
  onOpenScene?: (sceneId: string) => void;
}

export function ChronicleView({ projectId, scenes, onOpenScene }: ChronicleViewProps) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
  const [events, setEvents] = useState<ChronicleEvent[]>([]);
  const [lanes, setLanes] = useState<ChronicleLane[]>([]);
  const [arcs, setArcs] = useState<ChronicleArc[]>([]);
  const [unlinkedSceneCount, setUnlinkedSceneCount] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<{ dramatizations: CoverageScene[]; comicPages: CoveragePage[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCoverageLoading, setIsCoverageLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [linkSceneId, setLinkSceneId] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/chronicle${qs}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setLanes(data.lanes || []);
        setArcs(data.arcs || []);
        setUnlinkedSceneCount(data.unlinkedSceneCount || 0);
      }
    } catch (err) {
      console.error("Chronicle load failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, qs]);

  useEffect(() => { load(); }, [load]);

  const selectEvent = async (eventId: string) => {
    setSelectedEventId(eventId);
    setCoverage(null);
    setIsCoverageLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(eventId)}/coverage${qs}`);
      if (res.ok) {
        const data = await res.json();
        setCoverage({ dramatizations: data.dramatizations || [], comicPages: data.comicPages || [] });
      }
    } catch (err) {
      console.error("Coverage load failed:", err);
    } finally {
      setIsCoverageLoading(false);
    }
  };

  const createEvent = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(projectId ? { projectId } : {}), title: newTitle.trim() }),
      });
      if (res.ok) {
        setNewTitle("");
        await load();
      }
    } finally {
      setIsCreating(false);
    }
  };

  const linkScene = async () => {
    if (!selectedEventId || !linkSceneId) return;
    setIsLinking(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(selectedEventId)}/link-scene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(projectId ? { projectId } : {}), sceneId: linkSceneId }),
      });
      if (res.ok) {
        setLinkSceneId("");
        await load();
        await selectEvent(selectedEventId);
      }
    } finally {
      setIsLinking(false);
    }
  };

  // Ordinal x-positions (equal spacing in chronology ORDER, index labeled) —
  // honest for sparse indexes; pixel-proportional spacing is a C2b concern.
  const SLOT = 120;
  const PAD = 48;
  const xFor = (eventId: string) => {
    const i = events.findIndex(e => e.id === eventId);
    return PAD + (i < 0 ? 0 : i) * SLOT;
  };
  const width = Math.max(720, PAD * 2 + Math.max(events.length - 1, 0) * SLOT + 120);
  const selected = events.find(e => e.id === selectedEventId) || null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-slate-950/60">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Milestone className="w-4 h-4 text-emerald-300" />
          <span className="font-medium">The Chronicle</span>
          <span className="text-xs text-gray-500">universe chronology · {events.length} event(s)</span>
          {unlinkedSceneCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300"
              title="Scenes not yet linked to any world event — the Chronicle can't place them">
              {unlinkedSceneCount} unlinked scene(s)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createEvent()}
            placeholder="New event: what happens?"
            className="w-64 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={createEvent}
            disabled={!newTitle.trim() || isCreating}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1"
          >
            {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Event
          </button>
          <button onClick={load} title="Refresh" className="rounded-md border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-gray-200">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading the chronology…
        </div>
      ) : events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <Milestone className="w-12 h-12 text-emerald-400/30 mb-4" />
          <div className="text-gray-300 font-medium mb-1">No world events yet</div>
          <div className="text-sm text-gray-500 max-w-md">
            Events are the media-agnostic moments of your universe — what HAPPENS,
            independent of any telling. Create one above, promote a scene into one
            (ask the agent: “create an event from this scene”), and every film,
            comic, and episode that dramatizes it will appear here, in story order.
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* The timeline canvas */}
          <div className="flex-1 min-h-0 overflow-auto">
            <div style={{ width, minHeight: 220 }} className="relative px-0 py-4">
              {/* Arc brackets */}
              {arcs.filter(a => a.minIndex !== null).map((arc, ai) => {
                const from = events.findIndex(e => e.chronologyIndex === arc.minIndex);
                const to = events.findIndex(e => e.chronologyIndex === arc.maxIndex);
                if (from < 0 || to < 0) return null;
                return (
                  <div key={arc.id}
                    className="absolute h-5 border-l border-r border-t border-purple-400/40 text-purple-300/90 text-[10px] px-2 truncate"
                    style={{ left: PAD + from * SLOT - 14, width: (to - from) * SLOT + 28, top: 2 + ai * 20 }}
                    title={`Arc: ${arc.title} (${arc.status})`}>
                    {arc.title}
                  </div>
                );
              })}

              {/* The spine */}
              <div className="absolute left-0 right-0 border-t border-white/15" style={{ top: 64 }} />
              {events.map((e) => {
                const x = xFor(e.id);
                const isSel = e.id === selectedEventId;
                return (
                  <div key={e.id} className="absolute" style={{ left: x - 56, top: 40, width: 112 }}>
                    <button
                      onClick={() => selectEvent(e.id)}
                      className="w-full flex flex-col items-center gap-1 group"
                      title={`${e.title} — chronology ${e.chronologyIndex} (${e.status})`}
                    >
                      <span className={cn(
                        "w-4 h-4 rounded-full border-2 transition-transform group-hover:scale-125 mt-3",
                        e.status === "canon"
                          ? (isSel ? "bg-emerald-300 border-emerald-200" : "bg-emerald-500 border-emerald-400")
                          : (isSel ? "bg-transparent border-amber-300" : "bg-transparent border-amber-500/70")
                      )} />
                      <span className={cn("text-[10px] leading-tight text-center line-clamp-2", isSel ? "text-white" : "text-gray-400 group-hover:text-gray-200")}>
                        {e.title}
                      </span>
                      <span className="text-[9px] text-gray-600">t={e.chronologyIndex}</span>
                    </button>
                  </div>
                );
              })}

              {/* Production coverage lanes */}
              {lanes.filter(l => l.eventIds.length > 0).map((lane, li) => {
                const idxs = lane.eventIds.map(id => events.findIndex(e => e.id === id)).filter(i => i >= 0);
                if (idxs.length === 0) return null;
                const from = Math.min(...idxs), to = Math.max(...idxs);
                const Icon = FORMAT_ICONS[lane.format] || Film;
                return (
                  <div key={lane.productionId}
                    className="absolute h-6 rounded-md border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 text-[10px] flex items-center gap-1.5 px-2 truncate"
                    style={{ left: PAD + from * SLOT - 40, width: (to - from) * SLOT + 80, top: 128 + li * 30 }}
                    title={`${lane.title} — dramatizes ${lane.eventIds.length} event(s)`}>
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{lane.title}</span>
                    <span className="text-cyan-400/70">({lane.eventIds.length})</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coverage panel — the click-through: every vantage point of the selected event */}
          <div className="border-t border-white/10 bg-slate-950/70 px-4 py-3 max-h-[42%] overflow-y-auto">
            {!selected ? (
              <div className="text-xs text-gray-500">Select an event on the spine to see every dramatization of it — the same moment from every vantage point.</div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {selected.status === "canon"
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    : <CircleDashed className="w-4 h-4 text-amber-400" />}
                  <span className="text-sm text-gray-200 font-medium">{selected.title}</span>
                  <span className="text-[10px] text-gray-500">t={selected.chronologyIndex} · {selected.status}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <select
                      value={linkSceneId}
                      onChange={(e) => setLinkSceneId(e.target.value)}
                      className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-gray-300 max-w-[220px]"
                    >
                      <option value="" className="bg-gray-900">Link a scene…</option>
                      {scenes.map(s => <option key={s.id} value={s.id} className="bg-gray-900">{s.title}</option>)}
                    </select>
                    <button
                      onClick={linkScene}
                      disabled={!linkSceneId || isLinking}
                      className="rounded-md border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 px-2 py-1 text-[11px] hover:bg-emerald-500/25 disabled:opacity-50 flex items-center gap-1"
                    >
                      {isLinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      Link
                    </button>
                  </div>
                </div>
                {isCoverageLoading ? (
                  <div className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading dramatizations…</div>
                ) : coverage && (coverage.dramatizations.length > 0 || coverage.comicPages.length > 0) ? (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {coverage.dramatizations.map(d => {
                      const Icon = FORMAT_ICONS[d.format as keyof typeof FORMAT_ICONS] || Film;
                      return (
                        <button key={d.sceneId} onClick={() => onOpenScene?.(d.sceneId)}
                          className="shrink-0 w-40 rounded-lg border border-white/10 bg-white/5 hover:border-cyan-400/40 overflow-hidden text-left">
                          {d.imageUrl
                            ? <img src={d.imageUrl.startsWith("http") ? d.imageUrl : `${API_BASE}${d.imageUrl}`} alt="" className="w-full h-24 object-cover" />
                            : <div className="w-full h-24 bg-black/30 flex items-center justify-center"><Icon className="w-6 h-6 text-gray-600" /></div>}
                          <div className="p-2">
                            <div className="text-[11px] text-gray-200 truncate flex items-center gap-1">
                              <Icon className="w-3 h-3 text-cyan-300 shrink-0" />{d.sceneTitle}
                              {d.stale && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" aria-label="stale vs event" />}
                            </div>
                            <div className="text-[10px] text-gray-500 truncate">{d.productionTitle}</div>
                          </div>
                        </button>
                      );
                    })}
                    {coverage.comicPages.map(pg => (
                      <div key={pg.pageId} className="shrink-0 w-40 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                        {pg.imageUrl
                          ? <img src={pg.imageUrl.startsWith("http") ? pg.imageUrl : `${API_BASE}${pg.imageUrl}`} alt="" className="w-full h-24 object-cover object-top" />
                          : <div className="w-full h-24 bg-black/30" />}
                        <div className="p-2">
                          <div className="text-[11px] text-gray-200 truncate flex items-center gap-1">
                            <BookOpen className="w-3 h-3 text-cyan-300 shrink-0" />Comic p.{pg.pageNumber}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">{pg.productionTitle} · {pg.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">No production has dramatized this event yet — an unadapted moment. Link a scene, or ask the agent to create a telling of it.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChronicleView;

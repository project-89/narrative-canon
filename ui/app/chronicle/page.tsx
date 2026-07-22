"use client";

/**
 * THE WORLD VIEW — /chronicle (Michael's lift-up, 2026-07-22).
 *
 * A PARENT to the studio in the UI hierarchy: the studio is scoped by the
 * production switcher; this space is scoped only by the WORLD. The universe
 * timeline is the centerpiece — world events on the chronology, production
 * lanes showing what each medium dramatizes and what stage it's in, shared
 * events as visible overlap, drafts (branch content) distinct from canon.
 * From here you descend INTO a production (activates it, opens the studio).
 * Authoring at this level = world authoring: events, links, (soon) entities.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Milestone, Link2, Loader2, RefreshCw, Film, BookOpen, Tv,
  CheckCircle2, CircleDashed, AlertTriangle, ArrowRight, Sparkles, Globe2, Users, GitBranch, Clapperboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorldChat } from "@/components/studio/WorldChat";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
const FORMAT_ICONS = { film: Film, comic: BookOpen, episode: Tv } as const;
const STAGE_STYLE: Record<string, string> = {
  empty: "border-gray-600/40 bg-gray-700/20 text-gray-500",
  drafting: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  producing: "border-cyan-400/40 bg-cyan-500/15 text-cyan-300",
  exported: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
};

interface WEvent { id: string; chronologyIndex: number; title: string; description?: string; entityIds: string[]; status: "draft" | "canon"; arcId?: string; }
interface Lane { productionId: string; title: string; format: "film" | "comic" | "episode"; eventIds: string[]; sceneCount: number; renderedScenes: number; keptPages: number; draftEvents: number; stage: string; autonomy: string; }
interface Arc { id: string; title: string; status: string; minIndex: number | null; maxIndex: number | null; }
interface PickerScene { id: string; title: string; productionId: string; linked: boolean; }

export default function ChroniclePage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [events, setEvents] = useState<WEvent[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [scenePicker, setScenePicker] = useState<PickerScene[]>([]);
  const [unlinked, setUnlinked] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkSceneId, setLinkSceneId] = useState("");
  const [entities, setEntities] = useState<any[]>([]);
  const [showEntities, setShowEntities] = useState(false);
  const [creatingTellingFor, setCreatingTellingFor] = useState<string | null>(null);

  // World selection: default to the server's active project.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects`);
        if (res.ok) {
          const list = await res.json();
          setProjects(list);
          const active = list.find((p: any) => p.isActive) || list[0];
          if (active) setProjectId(active.id);
        }
      } catch { /* the load below will show empty */ }
    })();
  }, []);

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
      if (er.ok) setEntities(await er.json());
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const selectEvent = async (id: string) => {
    setSelectedId(id);
    setCoverage(null);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/events/${encodeURIComponent(id)}/coverage?projectId=${encodeURIComponent(projectId!)}`);
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

  /** Any node → new media from here: create the production, activate it,
   *  seed a scene from the event (linked with provenance), descend into the
   *  studio — arriving in the right authorship space for the medium. */
  const newTellingFrom = async (event: WEvent, format: "film" | "comic" | "episode") => {
    if (!projectId) return;
    setCreatingTellingFor(event.id);
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
      window.location.href = "/studio";
    } finally {
      setCreatingTellingFor(null);
    }
  };

  const openProduction = async (productionId: string) => {
    if (!projectId) return;
    // Descend into the studio: activate the production, then navigate.
    await fetch(`${API_BASE}/api/narrative/productions/${encodeURIComponent(productionId)}/activate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    }).catch(() => {});
    window.location.href = "/studio";
  };

  // Layout: generous slots, proportional-ish by chronology ORDER.
  const SLOT = 220;
  const PAD = 80;
  const width = Math.max(1100, PAD * 2 + Math.max(events.length - 1, 0) * SLOT + 240);
  const xAt = (i: number) => PAD + i * SLOT;
  const selected = events.find(e => e.id === selectedId) || null;
  const world = projects.find(p => p.id === projectId);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0b0a12] text-gray-200 flex flex-col">
      {/* ===== World header — the PARENT level: no production switcher here ===== */}
      <header className="shrink-0 border-b border-white/10 bg-slate-950/80 backdrop-blur px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-emerald-300" />
          <span className="text-sm uppercase tracking-widest text-gray-400">World</span>
        </div>
        <select
          value={projectId || ""}
          onChange={(e) => { setSelectedId(null); setCoverage(null); setProjectId(e.target.value); }}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-emerald-500/50"
        >
          {projects.map(p => <option key={p.id} value={p.id} className="bg-gray-900">{p.name}</option>)}
        </select>
        <span className="text-xs text-gray-500">
          {events.length} event(s) · {lanes.filter(l => l.sceneCount > 0 || l.eventIds.length > 0).length} production(s)
          {unlinked > 0 && <span className="text-amber-400/90"> · {unlinked} unplaced scene(s)</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowEntities(v => !v)}
            className={cn("rounded-lg border px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors",
              showEntities ? "border-purple-400/40 bg-purple-500/15 text-purple-300" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10")}>
            <Users className="w-4 h-4" /> Entities <span className="text-xs text-gray-500">({entities.length})</span>
          </button>
          <button onClick={load} className="rounded-lg border border-white/10 bg-white/5 p-2 text-gray-400 hover:text-gray-200"><RefreshCw className="w-4 h-4" /></button>
          <a href="/studio" className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-300 hover:bg-cyan-500/20 flex items-center gap-1.5">
            Studio <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-3" /> Composing the chronology…
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* ===== The timeline canvas ===== */}
          <div className="flex-1 min-h-0 overflow-auto relative">
            <div style={{ width, minHeight: 380 }} className="relative">

              {/* Arc band */}
              <div className="absolute left-0 right-0 top-0 h-10 border-b border-white/5">
                {arcs.filter(a => a.minIndex !== null).map((arc, ai) => {
                  const from = events.findIndex(e => e.chronologyIndex === arc.minIndex);
                  const to = events.findIndex(e => e.chronologyIndex === arc.maxIndex);
                  if (from < 0 || to < 0) return null;
                  return (
                    <div key={arc.id}
                      className="absolute h-6 rounded-full border border-purple-400/40 bg-purple-500/10 text-purple-300 text-[11px] px-3 flex items-center truncate"
                      style={{ left: xAt(from) - 40, width: (to - from) * SLOT + 80, top: 8 + (ai % 1) * 0 }}
                      title={`Arc: ${arc.title} (${arc.status})`}>
                      {arc.title}
                    </div>
                  );
                })}
                {arcs.filter(a => a.minIndex !== null).length === 0 && (
                  <div className="absolute left-6 top-2.5 text-[11px] text-gray-600">arcs will bracket the chronology here</div>
                )}
              </div>

              {/* The spine */}
              <div className="absolute left-0 right-0" style={{ top: 110 }}>
                <div className="border-t-2 border-white/15" />
              </div>
              {events.map((e, i) => {
                const isSel = e.id === selectedId;
                return (
                  <div key={e.id} className="absolute" style={{ left: xAt(i) - 90, top: 74, width: 180 }}>
                    <button onClick={() => selectEvent(e.id)} className="w-full flex flex-col items-center gap-2 group">
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
                        t={e.chronologyIndex} · {e.status === "canon" ? "canon" : "draft"}
                      </span>
                    </button>
                  </div>
                );
              })}
              {events.length === 0 && (
                <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: 150 }}>
                  <Milestone className="w-10 h-10 text-emerald-400/30 mx-auto mb-3" />
                  <div className="text-gray-400">The chronology is empty.</div>
                  <div className="text-sm text-gray-600 max-w-sm mt-1">Author the first world event above, or ask the agent to promote an existing scene into one.</div>
                </div>
              )}

              {/* ===== Production lanes: full-width threads with stage ===== */}
              <div className="absolute left-0 right-0" style={{ top: 200 }}>
                {lanes.filter(l => l.sceneCount > 0 || l.eventIds.length > 0 || l.stage !== "empty").map((lane, li) => {
                  const Icon = FORMAT_ICONS[lane.format] || Film;
                  const idxs = lane.eventIds.map(id => events.findIndex(e => e.id === id)).filter(i => i >= 0);
                  const hasSpan = idxs.length > 0;
                  const from = hasSpan ? Math.min(...idxs) : 0;
                  const to = hasSpan ? Math.max(...idxs) : 0;
                  return (
                    <div key={lane.productionId} className="relative h-14 border-b border-white/5">
                      {/* Lane label rail (sticky-feel, always visible at left) */}
                      <button
                        onClick={() => openProduction(lane.productionId)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-1.5 hover:border-cyan-400/50 group"
                        title={`Open "${lane.title}" in the studio`}
                      >
                        <Icon className="w-4 h-4 text-cyan-300" />
                        <span className="text-sm text-gray-200 max-w-[180px] truncate">{lane.title}</span>
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", STAGE_STYLE[lane.stage] || STAGE_STYLE.empty)}>
                          {lane.stage}
                        </span>
                        {lane.draftEvents > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-300 flex items-center gap-1"
                            title="Unmerged branch: draft events born from this production, awaiting validation into canon">
                            <GitBranch className="w-2.5 h-2.5" />branch · {lane.draftEvents} draft
                          </span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-cyan-300" />
                      </button>
                      {/* Coverage span */}
                      {hasSpan && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-7 rounded-full border border-cyan-400/30 bg-gradient-to-r from-cyan-500/15 to-cyan-500/5"
                          style={{ left: xAt(from) - 30, width: (to - from) * SLOT + 60 }}
                        >
                          {/* event ticks inside the span */}
                          {idxs.map(i => (
                            <span key={i} className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-300/90"
                              style={{ left: xAt(i) - (xAt(from) - 30) - 4 }} />
                          ))}
                        </div>
                      )}
                      {/* Meta at right of label when no span */}
                      {!hasSpan && (
                        <span className="absolute left-[300px] top-1/2 -translate-y-1/2 text-[11px] text-gray-600">
                          {lane.sceneCount} scene(s), none placed on the chronology yet
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ===== Coverage panel ===== */}
          <div className="shrink-0 border-t border-white/10 bg-slate-950/80 px-6 py-4 max-h-[38%] overflow-y-auto">
            {!selected ? (
              <div className="text-sm text-gray-600 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Select an event to see every telling of it — the same moment from every medium.
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  {selected.status === "canon"
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    : <CircleDashed className="w-5 h-5 text-amber-400" />}
                  <span className="text-base text-gray-100 font-medium">{selected.title}</span>
                  <span className="text-xs text-gray-500">t={selected.chronologyIndex} · {selected.status}</span>
                  {selected.description && <span className="text-xs text-gray-500 truncate max-w-md">— {selected.description}</span>}
                  <div className="ml-auto flex items-center gap-2">
                    {/* Any node → new media from here */}
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1 flex items-center gap-1"><Clapperboard className="w-3 h-3" />new telling:</span>
                    {(["film", "comic", "episode"] as const).map(f => {
                      const Icon = FORMAT_ICONS[f];
                      return (
                        <button key={f}
                          onClick={() => newTellingFrom(selected, f)}
                          disabled={creatingTellingFor === selected.id}
                          title={`Create a new ${f} production dramatizing this event and open it in the studio`}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center gap-1 capitalize">
                          {creatingTellingFor === selected.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                          {f}
                        </button>
                      );
                    })}
                    <span className="w-px h-5 bg-white/10 mx-1" />
                    <select value={linkSceneId} onChange={(e) => setLinkSceneId(e.target.value)}
                      className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-300 max-w-[260px]">
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
                        <div key={d.sceneId} className="shrink-0 w-52 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
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
                        </div>
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
                  <div className="text-xs text-gray-600">No telling of this moment exists yet — link a scene from any production, or open one and dramatize it.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Entities overlay (world-level graph browsing) ===== */}
      {showEntities && (
        <div className="fixed left-0 top-[57px] bottom-16 z-[65] w-[360px] border-r border-white/10 bg-[#100e1a]/95 backdrop-blur-xl flex flex-col">
          <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-300" />
            <span className="text-sm text-gray-200 font-medium">World Entities</span>
            <span className="text-xs text-gray-500">{entities.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
            {entities.map((e: any) => {
              const img = e.referenceImage || e.imageUrl;
              return (
                <div key={e.id} className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                  {img
                    ? <img src={img.startsWith("http") ? img : `${API_BASE}${img}`} alt="" className="w-full h-24 object-cover" />
                    : <div className="w-full h-24 bg-black/30 flex items-center justify-center text-2xl text-gray-700">{(e.name || "?")[0]}</div>}
                  <div className="p-2">
                    <div className="text-xs text-gray-200 truncate">{e.name}</div>
                    <div className="text-[10px] text-gray-500 capitalize">{e.type}</div>
                  </div>
                </div>
              );
            })}
            {entities.length === 0 && (
              <div className="col-span-2 text-xs text-gray-600 pt-6 text-center leading-relaxed">
                No entities yet. Ask the agent below —<br />“create a character named …” —<br />and they appear here with portraits.
              </div>
            )}
          </div>
          <div className="shrink-0 px-4 py-2.5 border-t border-white/10 text-[11px] text-gray-600">
            Create + edit entities conversationally (the agent handles portraits, looks, relationships). Deep editing lives in the Studio’s World rail.
          </div>
        </div>
      )}

      {/* ===== The World Agent (all tools, world scope) ===== */}
      <WorldChat projectId={projectId} onWorldChanged={load} />
      {/* spacer so the fixed quick-bar never covers the coverage panel */}
      <div className="shrink-0 h-14" />
    </div>
  );
}

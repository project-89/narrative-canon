"use client";

/**
 * ProductionsView — the World rail's "Productions" section: every telling of
 * this world as a card (format, stage, coverage, branch state), plus
 * creation. Clicking a card DESCENDS into that production's specialized
 * workspace. This is the master's registry of its specializations.
 */

import { useState, useEffect, useCallback } from "react";
import { Film, BookOpen, Tv, Plus, Loader2, ArrowRight, GitBranch, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
const FORMAT_ICONS = { film: Film, comic: BookOpen, episode: Tv } as const;
const STAGE_STYLE: Record<string, string> = {
  empty: "border-gray-600/40 bg-gray-700/20 text-gray-500",
  drafting: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  producing: "border-cyan-400/40 bg-cyan-500/15 text-cyan-300",
  exported: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
};

interface Lane {
  productionId: string; title: string; format: "film" | "comic" | "episode";
  eventIds: string[]; sceneCount: number; renderedScenes: number; keptPages: number;
  draftEvents: number; stage: string; autonomy: string;
}

interface ProductionsViewProps {
  projectId: string | null;
  refreshToken?: number;
  onDescend: (productionId: string) => void;
}

export function ProductionsView({ projectId, refreshToken = 0, onDescend }: ProductionsViewProps) {
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newFormat, setNewFormat] = useState<"film" | "comic" | "episode">("film");
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/chronicle?projectId=${encodeURIComponent(projectId)}`);
      if (res.ok) {
        const d = await res.json();
        setLanes(d.lanes || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const create = async () => {
    if (!newTitle.trim() || !projectId) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/productions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: newTitle.trim(), format: newFormat }),
      });
      if (res.ok) {
        const { production } = await res.json();
        await fetch(`${API_BASE}/api/narrative/productions/${encodeURIComponent(production.id)}/activate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        setNewTitle("");
        onDescend(production.id);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 py-2 border-b border-white/10 flex items-center gap-3">
        <Clapperboard className="w-4 h-4 text-cyan-300" />
        <span className="text-sm text-gray-200 font-medium">Productions</span>
        <span className="text-xs text-gray-500">{lanes.length} telling(s) of this world</span>
        <div className="ml-auto flex items-center gap-2">
          {(["film", "comic", "episode"] as const).map(f => {
            const Icon = FORMAT_ICONS[f];
            return (
              <button key={f} onClick={() => setNewFormat(f)}
                className={cn("rounded-lg border px-2 py-1.5 text-xs capitalize flex items-center gap-1",
                  newFormat === f ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-200" : "border-white/10 bg-white/5 text-gray-500 hover:text-gray-300")}>
                <Icon className="w-3.5 h-3.5" />{f}
              </button>
            );
          })}
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={`New ${newFormat} title…`}
            className="w-56 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50"
          />
          <button onClick={create} disabled={!newTitle.trim() || isCreating}
            className="rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs text-white hover:bg-cyan-500 disabled:opacity-50 flex items-center gap-1">
            {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading productions…
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {lanes.map(lane => {
              const Icon = FORMAT_ICONS[lane.format] || Film;
              return (
                <button key={lane.productionId} onClick={() => onDescend(lane.productionId)}
                  className="rounded-xl border border-white/10 bg-white/5 hover:border-cyan-400/40 p-4 text-left group transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-5 h-5 text-cyan-300" />
                    <span className="text-sm text-gray-100 font-medium truncate flex-1">{lane.title}</span>
                    <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-cyan-300" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", STAGE_STYLE[lane.stage] || STAGE_STYLE.empty)}>{lane.stage}</span>
                    <span className="text-[10px] text-gray-500 capitalize">{lane.format} · {lane.autonomy}</span>
                    {lane.draftEvents > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-300 flex items-center gap-1">
                        <GitBranch className="w-2.5 h-2.5" />branch · {lane.draftEvents} draft
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500">
                    {lane.sceneCount} scene(s) · {lane.renderedScenes} rendered
                    {lane.format === "comic" ? ` · ${lane.keptPages} page(s) kept` : ""}
                    {" · "}{lane.eventIds.length} event(s) on the chronology
                  </div>
                </button>
              );
            })}
            {lanes.length === 0 && (
              <div className="col-span-full text-center text-sm text-gray-600 py-16">
                No productions yet — the world comes first. When the bible has grown enough, create the first telling above.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductionsView;

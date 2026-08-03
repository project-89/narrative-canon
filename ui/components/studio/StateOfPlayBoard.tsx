"use client";

/**
 * StateOfPlayBoard — THE STATE OF PLAY dashboard.
 *
 * One glance answers "where is this production, what's missing, what should
 * we do next". It never mutates anything — every click is navigation
 * (onOpenRoom / onOpenScene / onOpenProduction), never a write.
 *
 *   - THE LADDER: seven layer cards in flow order (World → Look → Shape →
 *     Scenes → Coverage → Motion → Cut). The `weakest.layer` card carries an
 *     amber highlight and its `why`. In world scope only World and Look have
 *     live numbers — the rest render dimmed with an "enter a production" hint
 *     and don't navigate.
 *   - FOCUS STRIP: the server's own suggestions, first one loudest.
 *   - Below the ladder: a production shows its scene-readiness grid; a world
 *     shows its productions as cards.
 *
 * Reads GET /api/narrative/state-of-play?projectId=...(&productionId=...) on
 * mount and whenever projectId/productionId/refreshToken change.
 */

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

// ---------------------------------------------------------------------------
// The derived read model, as GET /api/narrative/state-of-play serves it.
// ---------------------------------------------------------------------------
type LayerKey = "world" | "look" | "shape" | "scenes" | "coverage" | "motion" | "cut";

interface StateOfPlay {
  scope: "world" | "production";
  projectId: string;
  production?: { id: string; title: string; format: string };
  layers: {
    world: { entities: number; withPortraits: number; locations: number; events: number; draftEvents: number; canonEvents: number };
    look: { savedStyles: number; defaultStyleId: string | null; productionStyleId: string | null; pinnedRefs: number };
    shape: null | { migrated: boolean; hook: string | null; logline: string | null; beats: number; claimed: number; devices: number; unbound: number; orphanScenes: number };
    scenes: { total: number; withProse: number; fromBeats: number };
    coverage: { shots: number; stills: number; dirtyStills: number };
    motion: { clips: number; scenesWithSequence: number };
    cut: { timelineClips: number; timelineSeconds: number };
  };
  sceneGrid: Array<{ id: string; title: string; beatLinked: boolean; proseChars: number; shots: number; stills: number; dirty: number; clips: number; hasSequence: boolean }>;
  productions?: Array<{ id: string; title: string; format: string; isActive: boolean; scenes: number; beats: number }>;
  weakest: { layer: LayerKey; why: string };
  focus: string[];
}

type RailRow = "entities" | "pre-pro" | "script" | "storyboard" | "scenes" | "worldline" | "productions";

interface StateOfPlayBoardProps {
  projectId: string;
  productionId?: string;
  refreshToken?: number;
  onOpenScene?: (sceneId: string) => void;
  onOpenRoom?: (row: RailRow) => void;
  onOpenProduction?: (productionId: string) => void;
}

// ---------------------------------------------------------------------------
// Ladder config: flow order, the room each card opens, and how to summarize it.
// ---------------------------------------------------------------------------
const LAYER_ROOM: Record<LayerKey, RailRow> = {
  world: "entities",
  look: "pre-pro",
  shape: "script",
  scenes: "storyboard",
  coverage: "storyboard",
  motion: "scenes",
  cut: "scenes",
};

interface LayerConfig {
  key: LayerKey;
  label: string;
  liveInWorldScope: boolean;
  stats: (d: StateOfPlay) => string;
}

const LAYER_CONFIGS: LayerConfig[] = [
  {
    key: "world", label: "World", liveInWorldScope: true,
    stats: (d) => `${d.layers.world.entities} cast · ${d.layers.world.events} events`,
  },
  {
    key: "look", label: "Look", liveInWorldScope: true,
    stats: (d) => `${d.layers.look.savedStyles} styles · ${d.layers.look.pinnedRefs} pinned refs`,
  },
  {
    key: "shape", label: "Shape", liveInWorldScope: false,
    stats: (d) => d.layers.shape ? `${d.layers.shape.beats} beats · ${d.layers.shape.unbound} unbound` : "—",
  },
  {
    key: "scenes", label: "Scenes", liveInWorldScope: false,
    stats: (d) => `${d.layers.scenes.total} scenes · ${d.layers.scenes.withProse} with prose`,
  },
  {
    key: "coverage", label: "Coverage", liveInWorldScope: false,
    stats: (d) => `${d.layers.coverage.shots} shots · ${d.layers.coverage.stills} stills`,
  },
  {
    key: "motion", label: "Motion", liveInWorldScope: false,
    stats: (d) => `${d.layers.motion.clips} clips · ${d.layers.motion.scenesWithSequence} sequenced`,
  },
  {
    key: "cut", label: "Cut", liveInWorldScope: false,
    stats: (d) => `${d.layers.cut.timelineClips} clips · ${d.layers.cut.timelineSeconds}s`,
  },
];

// ---------------------------------------------------------------------------
// One layer card.
// ---------------------------------------------------------------------------
function LayerCard({ cfg, data, onOpenRoom }: {
  cfg: LayerConfig;
  data: StateOfPlay;
  onOpenRoom?: (row: RailRow) => void;
}) {
  const dimmed = data.scope === "world" && !cfg.liveInWorldScope;
  const isWeakest = !dimmed && data.weakest.layer === cfg.key;

  return (
    <button
      type="button"
      onClick={() => { if (!dimmed) onOpenRoom?.(LAYER_ROOM[cfg.key]); }}
      disabled={dimmed}
      title={dimmed ? "Enter a production to see this layer" : `Open ${cfg.label.toLowerCase()}`}
      className={cn(
        "flex-1 min-w-[132px] text-left rounded-xl border px-3 py-2.5 transition-colors",
        dimmed
          ? "border-white/5 bg-black/20 opacity-40 cursor-default"
          : isWeakest
            ? "border-amber-400/50 bg-amber-500/10 shadow-[0_0_14px_rgba(251,191,36,0.15)] hover:bg-amber-500/15 cursor-pointer"
            : "border-white/10 bg-slate-950/80 hover:border-white/20 hover:bg-slate-900/80 cursor-pointer",
      )}
    >
      <div className={cn("text-[10px] uppercase tracking-wider", isWeakest ? "text-amber-300/80" : "text-gray-500")}>
        {cfg.label}
      </div>
      <div className={cn("text-xs mt-1 truncate", isWeakest ? "text-amber-100" : dimmed ? "text-gray-600" : "text-gray-200")}>
        {cfg.stats(data)}
      </div>
      {dimmed && <div className="text-[9px] text-gray-600 mt-1">enter a production</div>}
      {isWeakest && <div className="text-[9px] text-amber-300/90 mt-1 leading-tight">{data.weakest.why}</div>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The board.
// ---------------------------------------------------------------------------
export function StateOfPlayBoard({ projectId, productionId, refreshToken, onOpenScene, onOpenRoom, onOpenProduction }: StateOfPlayBoardProps) {
  const [data, setData] = useState<StateOfPlay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No productionId = the world board. scope=world forces that server-side
      // even while a production is active (the server otherwise defaults to it).
      const q = `projectId=${encodeURIComponent(projectId)}${productionId ? `&productionId=${encodeURIComponent(productionId)}` : "&scope=world"}`;
      const r = await fetch(`${API_BASE}/api/narrative/state-of-play?${q}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d && d.error) || `request failed (${r.status})`);
      setData(d as StateOfPlay);
    } catch (err: any) {
      setError(String(err?.message || err).slice(0, 200));
    } finally {
      setLoading(false);
    }
  }, [projectId, productionId]);

  useEffect(() => { void refetch(); }, [refetch, refreshToken]);

  // ---- first load: skeleton / error, nothing else on screen yet ----
  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Reading the board…
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{error}</span>
          <button onClick={() => void refetch()} className="underline text-gray-400 hover:text-gray-200">
            retry
          </button>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const inProduction = data.scope === "production";

  return (
    <div className="h-full flex flex-col bg-[#0b0a12] overflow-y-auto">
      {/* ---- header: where we are ---- */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          {inProduction ? "Production" : "World"}
        </span>
        {inProduction && data.production && (
          <>
            <span className="text-sm text-gray-100 truncate">{data.production.title}</span>
            <span className="text-[9px] uppercase tracking-wider rounded-full border border-white/15 bg-black/30 px-1.5 py-0.5 text-gray-400">
              {data.production.format}
            </span>
          </>
        )}
        <div className="flex-1" />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-600" />}
        {error && (
          <div className="flex items-center gap-1.5 text-[10px] text-rose-300/90">
            <AlertTriangle className="w-3 h-3" /> {error}
            <button onClick={() => void refetch()} title="Retry" className="text-gray-500 hover:text-gray-300">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* ---- THE LADDER ---- */}
      <div className="border-b border-white/10 px-3 py-2.5 overflow-x-auto">
        <div className="flex items-stretch gap-2 min-w-max">
          {LAYER_CONFIGS.map((cfg) => (
            <LayerCard key={cfg.key} cfg={cfg} data={data} onOpenRoom={onOpenRoom} />
          ))}
        </div>
      </div>

      {/* ---- FOCUS STRIP ---- */}
      {data.focus.length > 0 && (
        <div className="border-b border-white/10 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Where the work wants to go</div>
          <ul className="space-y-0.5">
            {data.focus.map((f, i) => (
              <li key={i} className={cn("text-xs leading-snug", i === 0 ? "text-gray-100" : "text-gray-500")}>
                {i === 0 ? "→ " : "·  "}{f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- SCENE READINESS GRID (production scope) ---- */}
      {inProduction && (
        <div className="flex-1 overflow-auto px-3 py-2">
          {data.sceneGrid.length === 0 ? (
            <div className="text-center text-gray-600 text-xs py-8">No scenes yet.</div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-[#0b0a12]">
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/10">
                  <th className="py-1.5 pr-2 font-normal">Title</th>
                  <th className="py-1.5 pr-2 font-normal">Beat</th>
                  <th className="py-1.5 pr-2 font-normal">Prose</th>
                  <th className="py-1.5 pr-2 font-normal">Shots</th>
                  <th className="py-1.5 pr-2 font-normal">Stills</th>
                  <th className="py-1.5 pr-2 font-normal">Clips</th>
                </tr>
              </thead>
              <tbody>
                {data.sceneGrid.map((s, i) => (
                  <tr
                    key={s.id}
                    onClick={() => onOpenScene?.(s.id)}
                    className={cn(
                      "cursor-pointer border-b border-white/5 hover:bg-white/5",
                      i % 2 === 1 && "bg-white/[0.02]",
                    )}
                  >
                    <td className="py-1 pr-2 text-gray-200 truncate max-w-[240px]" title={s.title}>
                      {s.title}
                    </td>
                    <td className="py-1 pr-2">
                      {s.beatLinked
                        ? <Check className="w-3 h-3 text-emerald-400" />
                        : <span className="text-amber-400 text-[11px]">unbound</span>}
                    </td>
                    <td className="py-1 pr-2">
                      {s.proseChars > 200
                        ? <Check className="w-3 h-3 text-emerald-400" />
                        : s.proseChars > 0
                          ? <span className="text-amber-400 text-[11px]">thin</span>
                          : <span className="text-rose-400/80 text-[11px]">—</span>}
                    </td>
                    <td className={cn("py-1 pr-2", s.shots === 0 ? "text-gray-600" : "text-gray-300")}>
                      {s.shots}
                    </td>
                    <td className="py-1 pr-2">
                      <span
                        className={s.dirty > 0 ? "text-amber-400" : "text-gray-300"}
                        title={s.dirty > 0 ? `${s.dirty} stale` : undefined}
                      >
                        {s.stills}/{s.shots}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-gray-300">
                      {s.clips}
                      {s.hasSequence && (
                        <span
                          title="has a sequence"
                          className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 ml-1.5 align-middle"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---- PRODUCTIONS (world scope) ---- */}
      {!inProduction && (
        <div className="flex-1 overflow-auto px-3 py-2 space-y-1.5">
          {(!data.productions || data.productions.length === 0) ? (
            <div className="text-center text-gray-600 text-xs py-8">No productions yet.</div>
          ) : (
            data.productions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProduction?.(p.id)}
                className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-left hover:border-white/20 hover:bg-slate-900/80"
              >
                <span className="flex-1 min-w-0 text-sm text-gray-100 truncate">{p.title}</span>
                <span className="text-[9px] uppercase tracking-wider rounded-full border border-white/15 bg-black/30 px-1.5 py-0.5 text-gray-400 shrink-0">
                  {p.format}
                </span>
                <span className="text-[11px] text-gray-500 whitespace-nowrap shrink-0">
                  {p.scenes} scenes · {p.beats} beats
                </span>
                {p.isActive && (
                  <span className="text-[9px] rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300 shrink-0">
                    active
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default StateOfPlayBoard;

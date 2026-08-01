"use client";

/**
 * StyleLibraryPanel — the reusable-style layer above the style creator
 * (Michael: configurable styles you make, save, and select per production;
 * nothing locked). Build + test a style in PreProductionView below, then
 * SAVE it here as a named style; reuse it, set it as the world default, or
 * (inside a production) apply it to the current telling.
 */

import { useState, useEffect, useCallback } from "react";
import { Palette, Plus, Star, Trash2, Loader2, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

interface SavedStyle { id: string; name: string; description?: string; visualPrompt?: string; styleAssetIds?: string[]; outputIntent?: string; previewImageUrl?: string; }
interface ProductionStyle { productionId: string; title: string; format: string; styleId: string | null; }

interface StyleLibraryPanelProps {
  projectId: string | null;
  /** The style being built in the creator below — saved verbatim. */
  currentVisualPrompt?: string;
  currentStyleAssetIds?: string[];
  currentOutputIntent?: string;
  /** In a production: apply-to-this-telling; in world: library + default only. */
  activeProduction?: { id: string; title?: string; format?: string } | null;
  worldMode?: boolean;
  /** Clear the working style (prompt + pinned refs) to start building the
   *  NEXT one — saved styles are untouched. Without this, style #2 could
   *  only ever be a remix of style #1. */
  onStartFresh?: () => void;
  /** Load a saved style back into the WORKING session (prompt + pins both
   *  restore) — click a style, resume that style's session. */
  onLoadStyle?: (style: SavedStyle) => void;
}

export function StyleLibraryPanel({ projectId, currentVisualPrompt, currentStyleAssetIds, currentOutputIntent, activeProduction, worldMode, onStartFresh, onLoadStyle }: StyleLibraryPanelProps) {
  const [styles, setStyles] = useState<SavedStyle[]>([]);
  const [defaultStyleId, setDefaultStyleId] = useState<string | null>(null);
  const [productionStyles, setProductionStyles] = useState<ProductionStyle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/styles?projectId=${encodeURIComponent(projectId)}`);
      if (r.ok) {
        const d = await r.json();
        setStyles(d.styles || []);
        setDefaultStyleId(d.defaultStyleId || null);
        setProductionStyles(d.productionStyles || []);
      }
    } finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const prodStyleId = activeProduction ? (productionStyles.find(p => p.productionId === activeProduction.id)?.styleId || null) : null;

  const saveCurrent = async () => {
    if (!newName.trim() || !projectId) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/styles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: newName.trim(), visualPrompt: currentVisualPrompt, styleAssetIds: currentStyleAssetIds, outputIntent: currentOutputIntent }),
      });
      if (r.ok) { setNewName(""); await load(); }
    } finally { setSaving(false); }
  };

  const setDefault = async (id: string) => {
    if (!projectId) return;
    setBusyId(id);
    try {
      await fetch(`${API_BASE}/api/narrative/styles/${encodeURIComponent(id)}/set-default`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }),
      });
      await load();
    } finally { setBusyId(null); }
  };

  const applyToProduction = async (id: string) => {
    if (!projectId || !activeProduction) return;
    setBusyId(id);
    try {
      await fetch(`${API_BASE}/api/narrative/productions/${encodeURIComponent(activeProduction.id)}/style`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, styleId: id }),
      });
      await load();
    } finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    if (!projectId) return;
    setBusyId(id);
    try {
      await fetch(`${API_BASE}/api/narrative/styles/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
      await load();
    } finally { setBusyId(null); }
  };

  return (
    <div className="border-b border-white/10 bg-slate-950/50 px-5 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Palette className="w-4 h-4 text-pink-300" />
        <span className="text-sm text-gray-200 font-medium">Style Library</span>
        <span className="text-xs text-gray-500">reusable styles — nothing is locked</span>
        {activeProduction && <span className="text-[11px] text-gray-500 ml-2">· this telling uses: <span className="text-cyan-300">{styles.find(s => s.id === prodStyleId)?.name || (defaultStyleId ? `${styles.find(s => s.id === defaultStyleId)?.name} (world default)` : "legacy project style")}</span></span>}
        <div className="ml-auto flex items-center gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveCurrent()}
            placeholder="Name the style you built below…"
            className="w-56 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-pink-500/50" />
          {onStartFresh && (
            <button
              onClick={() => { setNewName(""); onStartFresh(); }}
              title="Start a NEW blank style — clears the working prompt + pinned refs below. Saved styles are untouched."
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-pink-300 hover:border-pink-500/40"
            >
              New blank
            </button>
          )}
          <button onClick={saveCurrent} disabled={!newName.trim() || saving}
            className="rounded-lg bg-pink-600 px-2.5 py-1.5 text-xs text-white hover:bg-pink-500 disabled:opacity-50 flex items-center gap-1">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Save current
          </button>
          <button onClick={load} className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-gray-200"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-gray-500 flex items-center gap-2 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> loading styles…</div>
      ) : styles.length === 0 ? (
        <div className="text-xs text-gray-600 py-1">No saved styles yet. Build and test a look below, then name it and “Save current” to reuse it across productions.</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {styles.map(s => {
            const isDefault = s.id === defaultStyleId;
            const isProd = s.id === prodStyleId;
            const busy = busyId === s.id;
            return (
              <div key={s.id} className={cn("shrink-0 w-56 rounded-lg border overflow-hidden bg-white/5", isProd ? "border-cyan-400/50" : isDefault ? "border-amber-400/40" : "border-white/10")}>
                {s.previewImageUrl
                  ? <img src={s.previewImageUrl.startsWith("http") ? s.previewImageUrl : `${API_BASE}${s.previewImageUrl}`} alt="" className="w-full h-24 object-cover" />
                  : <div className="w-full h-24 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center"><Palette className="w-6 h-6 text-gray-700" /></div>}
                <div className="p-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-100 font-medium truncate flex-1" title={s.name}>{s.name}</span>
                    {isDefault && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-300 flex items-center gap-0.5"><Star className="w-2.5 h-2.5" />default</span>}
                  </div>
                  <div className="text-[10px] text-gray-500 line-clamp-2 mt-0.5 h-7">{s.visualPrompt || s.description || "—"}</div>
                  <div className="text-[9px] text-gray-600 mt-1">{(s.styleAssetIds || []).length} ref image(s){s.outputIntent ? ` · ${s.outputIntent}` : ""}</div>
                  <div className="flex items-center gap-1 mt-2">
                    {onLoadStyle && (
                      <button onClick={() => onLoadStyle(s)} disabled={busy}
                        title="Resume this style's session — the working prompt AND its pinned refs load back into the creator below"
                        className="rounded-md border border-pink-400/40 bg-pink-500/10 px-2 py-1 text-[10px] text-pink-300 hover:bg-pink-500/25 disabled:opacity-40">
                        Load
                      </button>
                    )}
                    {activeProduction && (
                      <button onClick={() => applyToProduction(s.id)} disabled={busy || isProd}
                        className={cn("flex-1 rounded-md border px-2 py-1 text-[10px] flex items-center justify-center gap-1", isProd ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-200" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10")}>
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : isProd ? <Check className="w-3 h-3" /> : null}
                        {isProd ? "In use here" : "Use here"}
                      </button>
                    )}
                    <button onClick={() => setDefault(s.id)} disabled={busy || isDefault} title="Set as the world default style"
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-gray-400 hover:text-amber-300 disabled:opacity-40"><Star className="w-3 h-3" /></button>
                    <button onClick={() => remove(s.id)} disabled={busy} title="Delete style"
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-gray-500 hover:text-rose-300"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StyleLibraryPanel;

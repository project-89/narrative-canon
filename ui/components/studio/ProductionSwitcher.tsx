"use client";

/**
 * ProductionSwitcher — T0a-ii (TRANSMEDIA_INTEGRATION_REVIEW §9.4).
 *
 * The project is the WORLD; a production is one deliverable inside it (film /
 * comic / episode) sharing the world's cast, looks, and style but owning its
 * own scenes, script, and timeline. This sits in the header next to the
 * StorySwitcher: story picks the world, this picks the production. Switching
 * POSTs /productions/:id/activate — the server's accessors then resolve every
 * scene/script/timeline call to the new production — and the parent refetches.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Plus, Check, Loader2, Film, BookOpen, Tv } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Production {
  id: string;
  title: string;
  format: "film" | "comic" | "episode";
  active?: boolean;
}

interface ProductionSwitcherProps {
  /** Current world (project) id — refetches the production list when it changes. */
  projectId: string | null;
  /** Fired AFTER the server-side activation succeeds; parent refetches scenes/script/acts/timeline. */
  onProductionChange?: (productionId: string) => void;
  /** Fired whenever the ACTIVE production is known/changes (load + switch) —
   *  the page uses format to swap production surfaces (comic → pages grid). */
  onActiveProduction?: (production: { id: string; format: string }) => void;
  className?: string;
}

const FORMAT_ICONS = { film: Film, comic: BookOpen, episode: Tv } as const;
const FORMATS: Array<Production["format"]> = ["film", "comic", "episode"];

export function ProductionSwitcher({ projectId, onProductionChange, onActiveProduction, className }: ProductionSwitcherProps) {
  const [productions, setProductions] = useState<Production[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFormat, setNewFormat] = useState<Production["format"]>("film");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

  const loadProductions = useCallback(async () => {
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const res = await fetch(`${API_BASE}/api/narrative/productions${qs}`);
      if (res.ok) {
        const data = await res.json();
        setProductions(data.productions || []);
        setActiveId(data.activeProductionId || null);
        const act = (data.productions || []).find((p: Production) => p.id === data.activeProductionId) || (data.productions || [])[0];
        if (act) onActiveProduction?.({ id: act.id, format: act.format });
      }
    } catch (error) {
      console.error("Failed to load productions:", error);
    }
  }, [API_BASE, projectId]);

  useEffect(() => {
    loadProductions();
  }, [loadProductions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSwitch = async (production: Production) => {
    if (production.id === activeId) {
      setIsOpen(false);
      return;
    }
    setIsSwitching(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/productions/${encodeURIComponent(production.id)}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectId ? { projectId } : {}),
      });
      if (res.ok) {
        setActiveId(production.id);
        setIsOpen(false);
        onActiveProduction?.({ id: production.id, format: production.format });
        onProductionChange?.(production.id);
      }
    } catch (error) {
      console.error("Failed to switch production:", error);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleQuickCreate = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/productions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(projectId ? { projectId } : {}), title: newTitle.trim(), format: newFormat }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewTitle("");
        await loadProductions();
        handleSwitch(data.production);
      }
    } catch (error) {
      console.error("Failed to create production:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const active = productions.find(p => p.id === activeId) || productions[0];
  const ActiveIcon = active ? FORMAT_ICONS[active.format] || Film : Film;

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        title="Production — which deliverable (film / comic / episode) of this world you are working on"
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        <ActiveIcon className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
        <span className="text-xs font-medium text-gray-300 max-w-[120px] truncate">
          {active ? active.title : "Production"}
        </span>
        {isSwitching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        ) : (
          <ChevronDown className={cn("h-3.5 w-3.5 text-gray-400 transition-transform", isOpen && "rotate-180")} />
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-[100] w-72 rounded-lg border border-white/20 bg-[#1e1b2e] shadow-2xl shadow-black/50">
          <div className="max-h-64 overflow-y-auto p-1">
            {productions.map((production) => {
              const Icon = FORMAT_ICONS[production.format] || Film;
              return (
                <button
                  key={production.id}
                  onClick={() => handleSwitch(production)}
                  disabled={isSwitching}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    production.id === activeId
                      ? "bg-cyan-500/20 text-cyan-200"
                      : "text-gray-300 hover:bg-white/10"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-cyan-300/80" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{production.title}</div>
                    <div className="text-xs text-gray-500 capitalize">{production.format}</div>
                  </div>
                  {production.id === activeId && <Check className="h-4 w-4 text-cyan-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Quick create: title + format */}
          <div className="border-t border-white/10 p-2 space-y-2">
            <div className="flex gap-1">
              {FORMATS.map((f) => {
                const Icon = FORMAT_ICONS[f];
                return (
                  <button
                    key={f}
                    onClick={() => setNewFormat(f)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs capitalize transition-colors",
                      newFormat === f
                        ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-200"
                        : "border-white/10 bg-black/20 text-gray-400 hover:bg-white/5"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {f}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`New ${newFormat} title...`}
                className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-cyan-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleQuickCreate()}
              />
              <button
                onClick={handleQuickCreate}
                disabled={!newTitle.trim() || isCreating}
                className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductionSwitcher;

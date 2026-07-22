"use client";

/**
 * ComicPagesView — M1: the comic production's PRODUCTION surface. When the
 * active production's format is 'comic', this replaces the video timeline —
 * the first de-video-ing of the studio's production area. Pages grid in
 * reading order with the HITL gates (keep / reject / redo-with-notes),
 * takes count, compose, and PDF export — all on the T1 endpoints.
 */

import { useState, useEffect, useCallback } from "react";
import { BookOpen, Check, X, RotateCcw, Loader2, RefreshCw, FileDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComicPage {
  id: string;
  pageNumber: number;
  sceneId?: string;
  imageUrl?: string;
  status: "draft" | "kept" | "rejected";
  takes?: Array<{ imageUrl: string }>;
}

interface ComicPagesViewProps {
  projectId: string | null;
  productionId: string;
  onOpenScene?: (sceneId: string) => void;
}

export function ComicPagesView({ projectId, productionId, onOpenScene }: ComicPagesViewProps) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
  const [pages, setPages] = useState<ComicPage[]>([]);
  const [lastExport, setLastExport] = useState<{ url: string; pageCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyPageId, setBusyPageId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [redoPageId, setRedoPageId] = useState<string | null>(null);
  const [redoNotes, setRedoNotes] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const body = (extra: object = {}) => JSON.stringify({ ...(projectId ? { projectId } : {}), productionId, ...extra });
  const qs = `?${projectId ? `projectId=${encodeURIComponent(projectId)}&` : ""}productionId=${encodeURIComponent(productionId)}`;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/comic/pages${qs}`);
      if (res.ok) {
        const data = await res.json();
        setPages((data.pages || []).slice().sort((a: ComicPage, b: ComicPage) => a.pageNumber - b.pageNumber));
      }
      const prodRes = await fetch(`${API_BASE}/api/narrative/productions${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`);
      if (prodRes.ok) {
        const d = await prodRes.json();
        const me = (d.productions || []).find((p: any) => p.id === productionId);
        setLastExport(me?.lastComicExport || null);
      }
    } catch (err) {
      console.error("Comic pages load failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, qs, projectId, productionId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (pageId: string, decision: "keep" | "reject") => {
    setBusyPageId(pageId);
    try {
      await fetch(`${API_BASE}/api/narrative/comic/pages/${encodeURIComponent(pageId)}/decide`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: body({ decision }),
      });
      await load();
    } finally {
      setBusyPageId(null);
    }
  };

  const redo = async () => {
    if (!redoPageId) return;
    const pageId = redoPageId;
    setBusyPageId(pageId);
    setRedoPageId(null);
    try {
      await fetch(`${API_BASE}/api/narrative/comic/pages/${encodeURIComponent(pageId)}/redo`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: body({ feedback: redoNotes }),
      });
      setRedoNotes("");
      await load();
    } finally {
      setBusyPageId(null);
    }
  };

  const compose = async () => {
    setIsComposing(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/comic/compose`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: body(),
      });
      if (res.ok) {
        const { jobId } = await res.json();
        // Poll until done (pages appear incrementally on reload).
        const poll = async () => {
          const jr = await fetch(`${API_BASE}/api/narrative/comic/job/${jobId}`);
          if (jr.ok) {
            const job = await jr.json();
            await load();
            if (job.status === "pending" || job.status === "processing") {
              setTimeout(poll, 4000);
              return;
            }
          }
          setIsComposing(false);
        };
        setTimeout(poll, 4000);
        return;
      }
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Compose failed");
      setIsComposing(false);
    } catch {
      setIsComposing(false);
    }
  };

  const exportPdf = async () => {
    setIsExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/comic/export`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: body(),
      });
      if (res.ok) {
        const data = await res.json();
        setLastExport({ url: data.url, pageCount: data.pageCount });
        window.open(`${API_BASE}${data.url}`, "_blank");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const keptCount = pages.filter(p => p.status === "kept").length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-slate-950/60">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <BookOpen className="w-4 h-4 text-cyan-300" />
          <span className="font-medium">Comic Pages</span>
          <span className="text-xs text-gray-500">{pages.length} page(s) · {keptCount} kept</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={compose} disabled={isComposing}
            className="rounded-md bg-cyan-600 px-2.5 py-1.5 text-xs text-white hover:bg-cyan-500 disabled:opacity-60 flex items-center gap-1.5"
            title="Compose pages for this production's scenes (one page per scene)">
            {isComposing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isComposing ? "Composing…" : "Compose"}
          </button>
          <button onClick={exportPdf} disabled={isExporting || pages.every(p => p.status === "rejected")}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5">
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            Export PDF
          </button>
          {lastExport && (
            <a href={`${API_BASE}${lastExport.url}`} target="_blank" rel="noreferrer"
              className="text-[10px] text-cyan-300 hover:underline">last export ({lastExport.pageCount}p)</a>
          )}
          <button onClick={load} title="Refresh" className="rounded-md border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-gray-200">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading pages…
        </div>
      ) : pages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <BookOpen className="w-12 h-12 text-cyan-400/30 mb-4" />
          <div className="text-gray-300 font-medium mb-1">No pages yet</div>
          <div className="text-sm text-gray-500 max-w-md">
            Compose renders one full comic page per scene — lettering, balloons,
            and SFX drawn into the art, with your characters&apos; reference images
            and the project style locked in. Pages arrive as drafts for your
            keep / reject / redo review.
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
            {pages.map((page) => {
              const busy = busyPageId === page.id;
              return (
                <div key={page.id} className={cn(
                  "rounded-xl border overflow-hidden bg-white/5 transition-colors",
                  page.status === "kept" ? "border-emerald-500/50" : page.status === "rejected" ? "border-rose-500/40 opacity-60" : "border-white/10"
                )}>
                  <button className="w-full relative" onClick={() => page.imageUrl && setLightbox(page.imageUrl)}>
                    {page.imageUrl
                      ? <img src={page.imageUrl.startsWith("http") ? page.imageUrl : `${API_BASE}${page.imageUrl}`} alt={`Page ${page.pageNumber}`} className="w-full aspect-[2/3] object-cover" />
                      : <div className="w-full aspect-[2/3] bg-black/30" />}
                    {busy && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}
                    <span className={cn(
                      "absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border backdrop-blur",
                      page.status === "kept" ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-200"
                        : page.status === "rejected" ? "border-rose-400/50 bg-rose-500/25 text-rose-200"
                        : "border-amber-400/50 bg-amber-500/25 text-amber-200"
                    )}>
                      p.{page.pageNumber} · {page.status}{(page.takes?.length || 0) > 0 ? ` · ${page.takes!.length} take(s)` : ""}
                    </span>
                  </button>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => decide(page.id, "keep")} disabled={busy || page.status === "kept"}
                        title="Keep" className="p-1.5 rounded-md text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"><Check className="w-4 h-4" /></button>
                      <button onClick={() => decide(page.id, "reject")} disabled={busy || page.status === "rejected"}
                        title="Reject" className="p-1.5 rounded-md text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"><X className="w-4 h-4" /></button>
                      <button onClick={() => { setRedoPageId(page.id); setRedoNotes(""); }} disabled={busy}
                        title="Redo with notes (old render kept as a take)" className="p-1.5 rounded-md text-amber-300 hover:bg-amber-500/20 disabled:opacity-40"><RotateCcw className="w-4 h-4" /></button>
                    </div>
                    {page.sceneId && (
                      <button onClick={() => onOpenScene?.(page.sceneId!)} className="text-[10px] text-gray-500 hover:text-cyan-300">scene ↗</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Redo notes modal (lightweight) */}
      {redoPageId && (
        <div className="absolute inset-0 z-[80] bg-black/60 flex items-center justify-center" onClick={() => setRedoPageId(null)}>
          <div className="w-[420px] rounded-xl border border-white/15 bg-[#1e1b2e] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm text-gray-200 font-medium mb-2">Redo page — what should change?</div>
            <textarea
              value={redoNotes}
              onChange={(e) => setRedoNotes(e.target.value)}
              placeholder={'e.g. "Panel 2 lettering is garbled — re-letter it. Keep the layout."'}
              className="w-full h-24 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRedoPageId(null)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200">Cancel</button>
              <button onClick={redo} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-500 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Re-render
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="absolute inset-0 z-[90] bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox.startsWith("http") ? lightbox : `${API_BASE}${lightbox}`} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

export default ComicPagesView;

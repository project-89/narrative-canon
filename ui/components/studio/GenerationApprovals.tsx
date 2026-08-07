"use client";

/**
 * GenerationApprovals — the creative-control approval queue. When creative
 * control is HUMAN (the default), every paid generation the agent proposes
 * STAGES here instead of executing: the creator sees what would be spent
 * (tool, model, duration, prompt) and approves or rejects it. Approval
 * executes the EXACT staged args through the same tool executor the agent
 * uses; rejection just marks the card. Same polling shape as
 * ActivityIndicator — renders nothing when the queue is empty.
 */

import { useState, useEffect, useRef } from "react";
import { ShieldCheck, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

interface GenerationProposal {
  id: string;
  tool: string;
  summary: string;
  status: string;
  createdAt: string;
  args?: Record<string, unknown>;
}

export function GenerationApprovals({ projectId }: { projectId?: string | null }) {
  const [pending, setPending] = useState<GenerationProposal[]>([]);
  const [open, setOpen] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        if (!projectId) return;
        const r = await fetch(`${API_BASE}/api/narrative/generation-proposals?projectId=${encodeURIComponent(projectId)}`);
        if (r.ok && alive) {
          const d = await r.json();
          setPending(Array.isArray(d.pending) ? d.pending : []);
        }
      } catch { /* server down — badge just hides */ }
    };
    poll();
    timer.current = setInterval(poll, 8000);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, [projectId]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    setDeciding(id);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/generation-proposals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, projectId }),
      });
      // Only trust the server: a failed decide (409 already-decided, 400
      // missing project) used to vanish the card locally while the queue
      // still held it — the "rejected one is still showing" bug.
      if (r.ok) setPending((prev) => prev.filter((p) => p.id !== id));
    } catch { /* leave the card; next poll re-syncs */ }
    setDeciding(null);
  };

  if (pending.length === 0) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        title="The agent proposed paid generations — approve or reject each before money is spent"
        className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
          open ? "border-amber-400/60 bg-amber-500/20 text-amber-200" : "border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20")}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
        </span>
        {pending.length} to approve
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-96 rounded-xl border border-white/10 bg-slate-950/95 shadow-2xl p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Staged generations — nothing runs until you approve it
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {pending.map((p) => (
              <div key={p.id} className="rounded-lg bg-white/5 px-2 py-1.5">
                <div className="text-[11px] text-gray-200 break-words">{p.summary}</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 flex-1 truncate">{p.tool}</span>
                  {deciding === p.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  ) : (
                    <>
                      <button onClick={() => decide(p.id, "reject")}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors">
                        <X className="w-3 h-3" /> Reject
                      </button>
                      <button onClick={() => decide(p.id, "approve")}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors">
                        <Check className="w-3 h-3" /> Approve &amp; run
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default GenerationApprovals;

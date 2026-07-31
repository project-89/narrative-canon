"use client";

/**
 * ActivityIndicator — the studio's answer to "what is the server doing right
 * now?" One agent tool call can spawn work that keeps running after the chat
 * turn (production runs rendering shot after shot, video/comic/export jobs,
 * autonomous dream loops). None of that is a visible tool call, so it used to
 * be invisible. This polls /api/narrative/jobs/active and shows a pulsing
 * badge + a dropdown of every in-flight job.
 */

import { useState, useEffect, useRef } from "react";
import { Activity, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

interface ActiveJob {
  kind: string; id: string; status: string; label: string; detail?: string;
  projectId?: string; startedAt?: number; updatedAt?: number;
}

const KIND_COLOR: Record<string, string> = {
  "clip": "text-sky-300",
  "produce-scene": "text-emerald-300",
  "film-export": "text-amber-300",
  "comic": "text-fuchsia-300",
  "dream-film": "text-violet-300",
  "extraction": "text-gray-300",
};

export function ActivityIndicator() {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/narrative/jobs/active`);
        if (r.ok && alive) {
          const d = await r.json();
          setJobs(Array.isArray(d.jobs) ? d.jobs : []);
        }
      } catch { /* server down — badge just hides */ }
    };
    poll();
    timer.current = setInterval(poll, 8000);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        title="Background work in flight — renders, runs, and jobs that continue after a chat turn ends"
        className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
          open ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20")}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        {jobs.length} working
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-80 rounded-xl border border-white/10 bg-slate-950/95 shadow-2xl p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-2">
            <Activity className="w-3.5 h-3.5" /> Server activity — work continuing beyond chat turns
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {jobs.map((j) => (
              <div key={`${j.kind}_${j.id}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                <Loader2 className={cn("w-3.5 h-3.5 animate-spin shrink-0", KIND_COLOR[j.kind] || "text-gray-300")} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-gray-200 truncate">{j.label}</div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {j.status}{j.detail ? ` · ${j.detail}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivityIndicator;

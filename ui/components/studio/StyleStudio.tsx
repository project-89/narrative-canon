"use client";

/**
 * StyleStudio — the interactive, iterative style creator (Michael, 2026-07-27:
 * "style and consistency is HUGE... more interactive, more intuitive, more
 * iterative").
 *
 * The loop this surface exists for:
 *   1. MATRIX  — many styles at once: one constant subject, axes that disagree
 *   2. ITERATE — mutate a plate ("same but warmer"), breed two winners
 *   3. UPLOAD  — bring outside images (Midjourney renders) as the style basis
 *   4. TRY     — test the look against models, side by side
 *   5. PIN     — the winner becomes a style REFERENCE (the image leash)
 *
 * All actions hit the deterministic REST endpoints over the same cores the
 * agent's tools use (agent-first: both surfaces, one impl):
 *   POST /explorations/style-matrix | /mutate | /breed
 *   POST /assets (multipart, category 'style' auto-pins)
 *   POST /assets/style-reference-from-url  (pin any candidate/bench render)
 *   POST /visual/render                    (bench tiles, per-model)
 *
 * Every render is archived in the project registry server-side — exploration
 * is never waste; curation = deciding what to PIN.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Grid3X3, Loader2, Pin, Dna, GitBranch, Upload, FlaskConical, Plus, X,
  RefreshCw, Sparkles, Check, ImageIcon, Combine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLightbox } from "@/components/studio/ImageLightbox";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

interface Candidate { id: string; url: string; label?: string; keep?: boolean; axes?: Record<string, string>; parentCandidateIds?: string[]; prompt?: string; backend?: string; }
interface ExplorationSet { id: string; engine: string; title?: string; status?: string; candidates: Candidate[]; createdAt?: string; }

interface PlateRow { axes: string; directive: string; }

const PLATE_PACKS: Record<string, PlateRow[]> = {
  "Media sweep": [
    { axes: "3D cel-shaded", directive: "3D cel-shaded animation still, toon shading, crisp rim light, painterly backgrounds" },
    { axes: "painterly", directive: "digital painting, visible brushwork, soft edges, gouache texture" },
    { axes: "anime", directive: "2D anime illustration, clean line art, flat cel shading, detailed background art" },
    { axes: "photoreal", directive: "photorealistic live-action cinematography, 35mm, natural light" },
  ],
  "Palette sweep": [
    { axes: "teal & amber", directive: "cinematic teal and amber palette, high contrast, warm skin against cool shadows" },
    { axes: "neon noir", directive: "neon noir palette — magenta and cyan glow against deep blacks, wet reflections" },
    { axes: "muted earth", directive: "muted earth tones, desaturated, morning haze, film grain" },
  ],
  "Lighting sweep": [
    { axes: "hard noir", directive: "hard single-source noir lighting, deep shadows, venetian-blind slats" },
    { axes: "golden hour", directive: "golden hour backlight, long shadows, atmospheric bloom" },
    { axes: "overcast soft", directive: "flat overcast softbox light, minimal shadows, quiet mood" },
  ],
};

const MODEL_OPTIONS = [
  { key: "nano-banana", label: "NB2" },
  { key: "nano-banana-pro", label: "NB Pro" },
  { key: "gpt-image", label: "GPT-Image" },
];

const DEFAULT_SUBJECT = "a courier girl pausing under a neon streetlight, medium shot";
const DEFAULT_BENCH_PROMPT = "A character portrait, waist up, expressive face, in this project's locked style";

interface StyleStudioProps {
  projectId: string | null;
  /** Bumped by the parent when style pins change elsewhere. */
  refreshToken?: number;
  /** Notify the parent (pins strip in the Spec tab) after we pin something. */
  onStylePinned?: () => void;
}

export function StyleStudio({ projectId, refreshToken = 0, onStylePinned }: StyleStudioProps) {
  const { openLightbox } = useLightbox();

  // ---- matrix lab ----
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [plates, setPlates] = useState<PlateRow[]>(PLATE_PACKS["Media sweep"].slice(0, 3));
  const [matrixModel, setMatrixModel] = useState("gpt-image");
  const [runningMatrix, setRunningMatrix] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [blendNote, setBlendNote] = useState<string | null>(null); // "N blended plates loaded"
  const matrixRef = useRef<HTMLElement>(null);

  // ---- exploration sets (persisted server-side) ----
  const [sets, setSets] = useState<ExplorationSet[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);

  // ---- per-candidate iteration state ----
  const [mutatingId, setMutatingId] = useState<string | null>(null);   // candidate with the direction input open
  const [mutateDirection, setMutateDirection] = useState("");
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [breedParent, setBreedParent] = useState<Candidate | null>(null); // first parent selected
  const [breedPromptFor, setBreedPromptFor] = useState<Candidate | null>(null); // second parent → prompt open
  const [breedPrompt, setBreedPrompt] = useState("");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());   // session-local "pinned!" feedback

  // ---- upload ----
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- test bench ----
  const [benchPrompt, setBenchPrompt] = useState(DEFAULT_BENCH_PROMPT);
  const [benchModels, setBenchModels] = useState<Set<string>>(new Set(["nano-banana", "gpt-image"]));
  const [benchRaw, setBenchRaw] = useState(false); // suppress project style (see the model's default read)
  const [benchRuns, setBenchRuns] = useState<Array<{ id: string; prompt: string; raw: boolean; tiles: Array<{ model: string; url?: string; error?: string }> }>>([]);
  const [runningBench, setRunningBench] = useState(false);

  const loadSets = useCallback(async () => {
    if (!projectId) return;
    setLoadingSets(true);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations?projectId=${encodeURIComponent(projectId)}`);
      if (r.ok) {
        const d = await r.json();
        const styleEngines = new Set(["style-matrix", "mutation", "breed"]);
        setSets(((d.explorations || []) as ExplorationSet[]).filter((s) => styleEngines.has(s.engine)).reverse());
      }
    } finally { setLoadingSets(false); }
  }, [projectId]);

  useEffect(() => { loadSets(); }, [loadSets, refreshToken]);

  // ---------------- matrix ----------------
  const runMatrix = async () => {
    if (!projectId || !subject.trim() || plates.length === 0) return;
    setRunningMatrix(true); setLabError(null);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations/style-matrix`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          subject: subject.trim(),
          title: `Matrix — ${new Date().toLocaleTimeString()}`,
          model: matrixModel,
          plates: plates.filter((p) => p.directive.trim()).map((p) => ({ axes: { style: p.axes || p.directive.slice(0, 24) }, styleDirective: p.directive })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Matrix failed");
      await loadSets();
    } catch (e: any) { setLabError(e.message); }
    finally { setRunningMatrix(false); }
  };

  // ---------------- iterate ----------------
  const runMutate = async (candidate: Candidate) => {
    if (!projectId || !mutateDirection.trim()) return;
    setBusyCandidateId(candidate.id);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations/mutate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, candidateId: candidate.id, directions: [mutateDirection.trim()], model: "nano-banana" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Mutate failed");
      setMutatingId(null); setMutateDirection("");
      await loadSets();
    } catch (e: any) { setLabError(e.message); }
    finally { setBusyCandidateId(null); }
  };

  const runBreed = async (parentB: Candidate) => {
    if (!projectId || !breedParent || !breedPrompt.trim()) return;
    setBusyCandidateId(parentB.id);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations/breed`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, candidateIdA: breedParent.id, candidateIdB: parentB.id, fusionPrompts: [breedPrompt.trim()] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Breed failed");
      setBreedParent(null); setBreedPromptFor(null); setBreedPrompt("");
      await loadSets();
    } catch (e: any) { setLabError(e.message); }
    finally { setBusyCandidateId(null); }
  };

  // BLEND → MATRIX (the feedback loop): the LLM merges the two parents' style
  // DIRECTIVES into fresh plates, loaded straight into the matrix builder.
  // Nothing renders until the writer hits Run — blending is cheap, deliberate.
  const runBlendToMatrix = async (parentB: Candidate) => {
    if (!projectId || !breedParent) return;
    setBusyCandidateId(parentB.id);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations/blend-styles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, candidateIdA: breedParent.id, candidateIdB: parentB.id, count: 3 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Blend failed");
      const newPlates: PlateRow[] = (d.plates || []).map((p: any) => ({ axes: p.axes?.style || "blend", directive: p.styleDirective }));
      setPlates(newPlates);
      setBlendNote(`${newPlates.length} blended plates loaded from “${breedParent.label}” × “${parentB.label}” — run the matrix.`);
      setBreedParent(null); setBreedPromptFor(null); setBreedPrompt("");
      matrixRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e: any) { setLabError(e.message); }
    finally { setBusyCandidateId(null); }
  };

  const pinUrl = async (url: string, label: string, feedbackId?: string) => {
    if (!projectId) return;
    if (feedbackId) setBusyCandidateId(feedbackId);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/assets/style-reference-from-url`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, imageUrl: url, label }),
      });
      if (r.ok && feedbackId) setPinnedIds((prev) => new Set(prev).add(feedbackId));
      if (r.ok) onStylePinned?.();
    } finally { if (feedbackId) setBusyCandidateId(null); }
  };

  // ---------------- upload ----------------
  const uploadFiles = async (files: FileList | File[]) => {
    if (!projectId || !files || files.length === 0) return;
    setUploading(true); setUploadNote(null);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      form.append("projectId", projectId);
      form.append("category", "style"); // 'style' uploads AUTO-PIN as style refs
      const r = await fetch(`${API_BASE}/api/narrative/assets`, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Upload failed");
      setUploadNote(`${(d.assets || []).length} image(s) uploaded and PINNED as style references.`);
      onStylePinned?.();
    } catch (e: any) { setUploadNote(`Upload failed: ${e.message}`); }
    finally { setUploading(false); }
  };

  // ---------------- bench ----------------
  const runBench = async () => {
    if (!projectId || !benchPrompt.trim() || benchModels.size === 0) return;
    setRunningBench(true);
    const models = Array.from(benchModels);
    const runId = `bench_${Date.now()}`;
    setBenchRuns((prev) => [{ id: runId, prompt: benchPrompt, raw: benchRaw, tiles: models.map((m) => ({ model: m })) }, ...prev]);
    await Promise.all(models.map(async (model) => {
      try {
        const r = await fetch(`${API_BASE}/api/narrative/visual/render`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, prompt: benchPrompt.trim(), model, ...(benchRaw ? { suppressProjectStyle: true } : {}) }),
        });
        const d = await r.json();
        setBenchRuns((prev) => prev.map((run) => run.id !== runId ? run : {
          ...run,
          tiles: run.tiles.map((t) => t.model !== model ? t : (r.ok ? { ...t, url: d.imageUrl } : { ...t, error: d.error || "render failed" })),
        }));
      } catch (e: any) {
        setBenchRuns((prev) => prev.map((run) => run.id !== runId ? run : {
          ...run, tiles: run.tiles.map((t) => t.model !== model ? t : { ...t, error: e.message }),
        }));
      }
    }));
    setRunningBench(false);
  };

  const resolveUrl = (u?: string) => (u && !u.startsWith("http") ? `${API_BASE}${u}` : u);

  // ---------------- candidate tile ----------------
  const CandidateTile = ({ c }: { c: Candidate }) => {
    const busy = busyCandidateId === c.id;
    const pinned = pinnedIds.has(c.id);
    const isBreedA = breedParent?.id === c.id;
    const promptingBreed = breedPromptFor?.id === c.id;
    return (
      <div className={cn("shrink-0 w-44 rounded-lg border overflow-hidden bg-white/5",
        isBreedA ? "border-fuchsia-400/70 ring-1 ring-fuchsia-400/50" : pinned ? "border-amber-400/60" : "border-white/10")}>
        <div className="relative">
          <img src={resolveUrl(c.url)} alt={c.label || ""} loading="lazy"
            onClick={() => openLightbox(resolveUrl(c.url)!, c.label)}
            title="Click to inspect full size"
            className="w-full h-28 object-cover cursor-zoom-in" />
          {Array.isArray(c.parentCandidateIds) && c.parentCandidateIds.length > 0 && (
            <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full bg-black/70 text-violet-300 border border-violet-400/40 flex items-center gap-0.5">
              <GitBranch className="w-2.5 h-2.5" />{c.parentCandidateIds.length === 2 ? "bred" : "mutated"}
            </span>
          )}
          {pinned && <span className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/90 text-black font-medium flex items-center gap-0.5"><Pin className="w-2.5 h-2.5" />pinned</span>}
        </div>
        <div className="p-1.5">
          <div className="text-[10px] text-gray-300 truncate" title={c.label}>{c.label || c.id}</div>
          <div className="flex items-center gap-1 mt-1.5">
            <button onClick={() => pinUrl(c.url, `style: ${c.label || c.id}`, c.id)} disabled={busy || pinned}
              title="Pin as a PROJECT STYLE REFERENCE — the image leash every render obeys"
              className="flex-1 rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 flex items-center justify-center gap-1">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : pinned ? <Check className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              {pinned ? "Pinned" : "Pin style"}
            </button>
            <button onClick={() => { setMutatingId(mutatingId === c.id ? null : c.id); setMutateDirection(""); }} disabled={busy}
              title='Mutate — "same but warmer", "same but grainier"…'
              className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-gray-300 hover:bg-white/15"><Sparkles className="w-3 h-3" /></button>
            <button
              onClick={() => {
                if (!breedParent) { setBreedParent(c); }
                else if (breedParent.id === c.id) { setBreedParent(null); setBreedPromptFor(null); }
                else { setBreedPromptFor(c); setBreedPrompt(""); }
              }}
              disabled={busy}
              title={breedParent && breedParent.id !== c.id ? `Breed with "${breedParent.label}"` : "Breed — select this as parent A, then click another candidate"}
              className={cn("rounded border px-1.5 py-1 text-[10px]", isBreedA ? "border-fuchsia-400/70 bg-fuchsia-500/25 text-fuchsia-200" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/15")}>
              <Dna className="w-3 h-3" />
            </button>
          </div>
          {mutatingId === c.id && (
            <div className="mt-1.5 flex items-center gap-1">
              <input autoFocus value={mutateDirection} onChange={(e) => setMutateDirection(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runMutate(c)}
                placeholder="same but warmer…"
                className="flex-1 min-w-0 rounded border border-violet-400/40 bg-black/40 px-1.5 py-1 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none" />
              <button onClick={() => runMutate(c)} disabled={busy || !mutateDirection.trim()}
                className="rounded bg-violet-600 px-1.5 py-1 text-[10px] text-white disabled:opacity-50">Go</button>
            </div>
          )}
          {promptingBreed && breedParent && (
            <div className="mt-1.5">
              <div className="text-[9px] text-fuchsia-300 mb-1">Fusing with “{breedParent.label}”:</div>
              <div className="flex items-center gap-1">
                <input autoFocus value={breedPrompt} onChange={(e) => setBreedPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runBreed(c)}
                  placeholder="A's palette on B's linework…"
                  className="flex-1 min-w-0 rounded border border-fuchsia-400/40 bg-black/40 px-1.5 py-1 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none" />
                <button onClick={() => runBreed(c)} disabled={busy || !breedPrompt.trim()}
                  className="rounded bg-fuchsia-600 px-1.5 py-1 text-[10px] text-white disabled:opacity-50">Go</button>
              </div>
              <button onClick={() => runBlendToMatrix(c)} disabled={busy}
                title="An LLM merges the two parents' style DIRECTIVES into 3 new plates and loads them into the matrix — nothing renders until you run it"
                className="mt-1 w-full rounded border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-1">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Combine className="w-3 h-3" />}
                Blend prompts → matrix
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-4 space-y-6">
      {/* ============ 1. MATRIX LAB ============ */}
      <section ref={matrixRef} className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Grid3X3 className="w-4 h-4 text-cyan-300" />
          <span className="text-sm font-medium text-gray-100">Style Matrix</span>
          <span className="text-xs text-gray-500">one subject, many styles — axes should disagree, or the sheet teaches nothing</span>
        </div>
        {blendNote && (
          <div className="mt-1 text-[11px] text-cyan-300 flex items-center gap-1.5">
            <Combine className="w-3 h-3" />{blendNote}
            <button onClick={() => setBlendNote(null)} className="text-gray-600 hover:text-gray-300"><X className="w-3 h-3" /></button>
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] text-gray-500 shrink-0">Test subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)}
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50" />
          <select value={matrixModel} onChange={(e) => setMatrixModel(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-gray-300 focus:outline-none">
            {MODEL_OPTIONS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <select value="" onChange={(e) => { if (PLATE_PACKS[e.target.value]) setPlates(PLATE_PACKS[e.target.value]); }}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-gray-400 focus:outline-none">
            <option value="">Load a pack…</option>
            {Object.keys(PLATE_PACKS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="mt-2 space-y-1.5">
          {plates.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={p.axes} onChange={(e) => setPlates(plates.map((x, j) => j === i ? { ...x, axes: e.target.value } : x))}
                placeholder="axis label" className="w-36 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-cyan-200 focus:outline-none" />
              <input value={p.directive} onChange={(e) => setPlates(plates.map((x, j) => j === i ? { ...x, directive: e.target.value } : x))}
                placeholder="full style directive for this plate — medium, palette, lighting, stylization"
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-gray-200 focus:outline-none" />
              <button onClick={() => setPlates(plates.filter((_, j) => j !== i))} className="text-gray-600 hover:text-rose-300"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button onClick={() => setPlates([...plates, { axes: "", directive: "" }])}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-200 flex items-center gap-1"><Plus className="w-3 h-3" /> plate</button>
            <button onClick={runMatrix} disabled={runningMatrix || !subject.trim() || plates.filter((p) => p.directive.trim()).length === 0}
              className="ml-auto rounded-lg bg-cyan-600 px-4 py-1.5 text-xs text-white hover:bg-cyan-500 disabled:opacity-50 flex items-center gap-1.5">
              {runningMatrix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Grid3X3 className="w-3.5 h-3.5" />}
              Run matrix ({plates.filter((p) => p.directive.trim()).length} plates)
            </button>
          </div>
        </div>
        {labError && <div className="mt-2 text-[11px] text-rose-300">{labError}</div>}
      </section>

      {/* ============ 2. EXPLORATIONS (persisted; pin / mutate / breed) ============ */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-violet-300" />
          <span className="text-sm font-medium text-gray-100">Explorations</span>
          <span className="text-xs text-gray-500">
            {breedParent ? <span className="text-fuchsia-300">breeding from “{breedParent.label}” — click a second candidate</span>
              : "pin the winners · mutate what’s close · breed two you love"}
          </span>
          <button onClick={loadSets} className="ml-auto rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-gray-200"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
        {loadingSets ? (
          <div className="text-xs text-gray-500 flex items-center gap-2 py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" /> loading explorations…</div>
        ) : sets.length === 0 ? (
          <div className="text-xs text-gray-600 py-2">No style explorations yet — run a matrix above, or ask the agent for one (“give me a 3×2 style matrix for this world”).</div>
        ) : (
          <div className="space-y-4">
            {sets.map((s) => (
              <div key={s.id}>
                <div className="text-[11px] text-gray-500 mb-1.5">
                  <span className={cn("px-1.5 py-0.5 rounded-full border mr-2 text-[9px] uppercase tracking-wider",
                    s.engine === "style-matrix" ? "border-cyan-400/40 text-cyan-300" : s.engine === "breed" ? "border-fuchsia-400/40 text-fuchsia-300" : "border-violet-400/40 text-violet-300")}>
                    {s.engine}
                  </span>
                  {s.title || s.id}
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {(s.candidates || []).map((c) => <CandidateTile key={c.id} c={c} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============ 3. UPLOAD (Midjourney etc. as the style basis) ============ */}
      <section
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className={cn("rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors",
          dragOver ? "border-amber-400/70 bg-amber-500/10" : "border-white/15 bg-white/[0.02] hover:border-white/30")}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex items-center justify-center gap-2 text-gray-300 text-sm">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-amber-300" />}
          Drop style images here — Midjourney renders, film stills, paintings
        </div>
        <div className="text-[11px] text-gray-500 mt-1">Uploaded images are pinned as STYLE REFERENCES immediately — the image is the leash, not a description of it.</div>
        {uploadNote && <div className={cn("text-[11px] mt-1.5", uploadNote.startsWith("Upload failed") ? "text-rose-300" : "text-emerald-300")}>{uploadNote}</div>}
      </section>

      {/* ============ 4. TEST BENCH — try the style against models ============ */}
      <section className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-4 h-4 text-emerald-300" />
          <span className="text-sm font-medium text-gray-100">Test bench</span>
          <span className="text-xs text-gray-500">the same prompt through each model — the pinned style rides along unless you go raw</span>
        </div>
        <textarea value={benchPrompt} onChange={(e) => setBenchPrompt(e.target.value)} rows={2}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/40 resize-none" />
        <div className="flex items-center gap-3 mt-2">
          {MODEL_OPTIONS.map((m) => (
            <label key={m.key} className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
              <input type="checkbox" checked={benchModels.has(m.key)}
                onChange={(e) => setBenchModels((prev) => { const n = new Set(prev); e.target.checked ? n.add(m.key) : n.delete(m.key); return n; })} />
              {m.label}
            </label>
          ))}
          <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer ml-2" title="Suppress the pinned project style — see each model's unleashed read of the prompt">
            <input type="checkbox" checked={benchRaw} onChange={(e) => setBenchRaw(e.target.checked)} />
            raw (no project style)
          </label>
          <button onClick={runBench} disabled={runningBench || !benchPrompt.trim() || benchModels.size === 0}
            className="ml-auto rounded-lg bg-emerald-600 px-4 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5">
            {runningBench ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
            Try it ({benchModels.size} model{benchModels.size === 1 ? "" : "s"})
          </button>
        </div>
        {benchRuns.length > 0 && (
          <div className="mt-3 space-y-3">
            {benchRuns.map((run) => (
              <div key={run.id}>
                <div className="text-[10px] text-gray-500 mb-1 truncate">“{run.prompt}”{run.raw ? " · raw" : " · project style applied"}</div>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {run.tiles.map((t) => (
                    <div key={t.model} className="shrink-0 w-44 rounded-lg border border-white/10 overflow-hidden bg-white/5">
                      {t.url ? (
                        <img src={resolveUrl(t.url)} alt={t.model}
                          onClick={() => openLightbox(resolveUrl(t.url)!, `${MODEL_OPTIONS.find((m) => m.key === t.model)?.label} — ${run.prompt.slice(0, 60)}`)}
                          title="Click to inspect full size"
                          className="w-full h-28 object-cover cursor-zoom-in" />
                      ) : t.error ? (
                        <div className="w-full h-28 flex items-center justify-center text-[10px] text-rose-300 px-2 text-center">{t.error}</div>
                      ) : (
                        <div className="w-full h-28 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-600" /></div>
                      )}
                      <div className="p-1.5 flex items-center gap-1">
                        <span className="text-[10px] text-gray-300 flex-1">{MODEL_OPTIONS.find((m) => m.key === t.model)?.label || t.model}</span>
                        {t.url && (
                          <button onClick={() => pinUrl(t.url!, `style: bench ${MODEL_OPTIONS.find((m) => m.key === t.model)?.label}`)}
                            title="Pin this render as a style reference"
                            className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/25 flex items-center gap-0.5">
                            <Pin className="w-2.5 h-2.5" />Pin
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {benchRuns.length === 0 && (
          <div className="mt-2 text-[11px] text-gray-600 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Runs accumulate here — compare models side by side, pin what lands.</div>
        )}
      </section>
    </div>
  );
}

export default StyleStudio;

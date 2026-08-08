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
  RefreshCw, Sparkles, Check, ImageIcon, Combine, Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ASSET_UPLOAD_BATCH_SIZE,
  ASSET_UPLOAD_MAX_FILE_BYTES,
  ASSET_UPLOAD_MAX_FILES,
  AssetUploadError,
  assetUploadErrorNotice,
  uploadAssetBatches,
} from "@/lib/asset-upload";
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

// Fallback when /api/narrative/models is unreachable; the live registry
// (fetched on mount) is the real source — labels + availability come from it.
const FALLBACK_MODEL_OPTIONS: ModelOption[] = [
  { key: "nano-banana", label: "NB2", status: "live" },
  { key: "nano-banana-pro", label: "NB Pro", status: "live" },
  { key: "gpt-image", label: "GPT-Image 2", status: "down" },
];

interface ModelOption { key: string; label: string; status: "live" | "down"; }

const DEFAULT_SUBJECT = "a courier girl pausing under a neon streetlight, medium shot";
const DEFAULT_BENCH_PROMPT = "A character portrait, waist up, expressive face, in this project's locked style";

interface StyleStudioProps {
  projectId: string | null;
  /** Bumped by the parent when style pins change elsewhere. */
  refreshToken?: number;
  /** Notify the parent (pins strip in the Spec tab) after we pin something. */
  onStylePinned?: (projectId?: string) => void;
  /** The WORKING style prompt (the draft style under construction — pins +
   *  this prompt are what "Save current" snapshots into a named style). */
  currentVisualPrompt?: string;
  /** Adopt a plate's directive AS the working style prompt. */
  onAdoptDirective?: (directive: string) => void;
  /** The working style's pinned reference images — THE LEASH, shown in the
   *  room where it's built (they were only visible on the Spec tab, so an
   *  upload appeared to vanish). */
  pinnedStyleRefs?: Array<{ id: string; url: string; name?: string }>;
  /** Unpin a reference (toggle off). */
  onUnpin?: (assetId: string) => void;
}

/** A matrix plate's full prompt embeds its directive between markers; pull it
 *  back out so a winning plate's RECIPE (not just its image) can be adopted. */
function extractPlateDirective(prompt?: string): string | null {
  if (!prompt) return null;
  const m = /=== PLATE (?:STYLE|VARIATION)[^=]*===\n([\s\S]*?)\n===/.exec(prompt);
  return m ? m[1].trim() : null;
}

const resolveUrl = (u?: string) => (u && !u.startsWith("http") ? `${API_BASE}${u}` : u);

/**
 * MODULE-LEVEL tile, deliberately. It was defined inside StyleStudio, which
 * recreates the component TYPE on every parent render — React then remounts
 * the whole tile subtree per keystroke, and the breed input's autoFocus
 * dragged focus back after every character (the "bouncing" bug). Hoisted +
 * input text held in tile-local state, the identity is stable and typing is
 * ordinary typing.
 */
function CandidateTileView({ c, busy, pinned, isBreedA, breedArmed, breedParentLabel, promptingBreed, showAdopt, onInspect, onPin, onMutate, onBreedClick, onBreed, onBlend, onAdopt, onDiversify }: {
  c: Candidate;
  busy: boolean;
  pinned: boolean;
  isBreedA: boolean;
  breedArmed: boolean;           // a DIFFERENT candidate is armed as parent A
  breedParentLabel?: string;
  promptingBreed: boolean;       // this tile is the chosen parent B → show the breed panel
  showAdopt: boolean;
  onInspect: (url: string, label?: string) => void;
  onPin: (c: Candidate) => void;
  onMutate: (c: Candidate, direction: string) => void;
  onBreedClick: (c: Candidate) => void;
  onBreed: (c: Candidate, fusionPrompt?: string) => void;
  onBlend: (c: Candidate) => void;
  onAdopt: (directive: string, label?: string) => void;
  onDiversify: (c: Candidate, mode: "around" | "escape") => void;
}) {
  const [mutateOpen, setMutateOpen] = useState(false);
  const [mutateText, setMutateText] = useState("");
  const [breedText, setBreedText] = useState("");
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [diversifyOpen, setDiversifyOpen] = useState(false);
  const plateDirective = extractPlateDirective(c.prompt);
  // The RECIPE this image was rendered from — plate directive when it's a
  // plate, else the candidate's full prompt (mutations/bred children).
  const recipe = plateDirective || c.prompt || null;
  return (
    <div className={cn("shrink-0 w-44 rounded-lg border overflow-hidden bg-white/5",
      isBreedA ? "border-fuchsia-400/70 ring-1 ring-fuchsia-400/50" : pinned ? "border-amber-400/60" : "border-white/10")}>
      <div className="relative">
        <img src={resolveUrl(c.url)} alt={c.label || ""} loading="lazy"
          onClick={() => onInspect(resolveUrl(c.url)!, c.label)}
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
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-300 truncate flex-1" title={c.label}>{c.label || c.id}</span>
          {c.backend && (
            <span className="shrink-0 text-[8px] px-1 py-0.5 rounded border border-white/10 text-gray-500" title={`Generated with ${c.backend}`}>
              {c.backend}
            </span>
          )}
          {recipe && (
            <button onClick={() => setRecipeOpen(!recipeOpen)}
              title="Show the prompt this image was rendered from"
              className={cn("shrink-0 text-[9px] px-1 py-0.5 rounded border", recipeOpen ? "border-cyan-400/50 text-cyan-300 bg-cyan-500/10" : "border-white/10 text-gray-500 hover:text-gray-300")}>
              prompt
            </button>
          )}
        </div>
        {recipeOpen && recipe && (
          <div className="mt-1 max-h-28 overflow-y-auto rounded border border-cyan-500/20 bg-black/40 p-1.5 text-[9px] leading-snug text-gray-300 whitespace-pre-wrap select-text">
            {recipe}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1.5">
          <button onClick={() => onPin(c)} disabled={busy || pinned}
            title="Pin as a PROJECT STYLE REFERENCE — the image leash every render obeys"
            className="flex-1 rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 flex items-center justify-center gap-1">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : pinned ? <Check className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            {pinned ? "Pinned" : "Pin style"}
          </button>
          <button onClick={() => { setMutateOpen(!mutateOpen); setMutateText(""); }} disabled={busy}
            title='Mutate — "same but warmer", "same but grainier"…'
            className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-gray-300 hover:bg-white/15"><Sparkles className="w-3 h-3" /></button>
          <button onClick={() => setDiversifyOpen(!diversifyOpen)} disabled={busy}
            title="Diversify — sample the style space: AROUND this basin (many distinct takes within the same family) or ESCAPE it (jump to distant styles). No image anchor either way — the anchor is what holds you in place."
            className={cn("rounded border px-1.5 py-1 text-[10px]", diversifyOpen ? "border-orange-400/50 bg-orange-500/15 text-orange-300" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/15")}><Shuffle className="w-3 h-3" /></button>
          <button
            onClick={() => onBreedClick(c)}
            disabled={busy}
            title={breedArmed ? `Breed with "${breedParentLabel}"` : "Breed — select this as parent A, then click 🧬 on another candidate"}
            className={cn("rounded border px-1.5 py-1 text-[10px]", isBreedA ? "border-fuchsia-400/70 bg-fuchsia-500/25 text-fuchsia-200" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/15")}>
            <Dna className="w-3 h-3" />
          </button>
        </div>
        {plateDirective && showAdopt && (
          <button
            onClick={() => onAdopt(plateDirective, c.label)}
            title={`Adopt this plate's RECIPE as the working style prompt:\n\n${plateDirective.slice(0, 300)}`}
            className="mt-1 w-full rounded border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/25 flex items-center justify-center gap-1">
            <Check className="w-3 h-3" /> Use as style prompt
          </button>
        )}
        {diversifyOpen && (
          <div className="mt-1.5 space-y-1">
            <button onClick={() => { onDiversify(c, "around"); setDiversifyOpen(false); }} disabled={busy}
              title="The hard one: 5 maximally DISTINCT variations that stay inside this style's family — different sub-traditions, eras, color scripts, linework, feature conventions — escaping only the family's generic center. anime → many different animes."
              className="w-full rounded border border-orange-400/40 bg-orange-500/10 px-1.5 py-1 text-[10px] text-orange-300 hover:bg-orange-500/25 disabled:opacity-50 flex items-center justify-center gap-1">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shuffle className="w-3 h-3" />}
              Around this style ×5
            </button>
            <button onClick={() => { onDiversify(c, "escape"); setDiversifyOpen(false); }} disabled={busy}
              title="Jump to 5 DISTANT basins entirely — different medium, era, tradition. For when the whole family is wrong."
              className="w-full rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-gray-300 hover:bg-white/15 disabled:opacity-50 flex items-center justify-center gap-1">
              <Shuffle className="w-3 h-3" /> Escape the basin ×5
            </button>
          </div>
        )}
        {mutateOpen && (
          <div className="mt-1.5 flex items-center gap-1">
            <input value={mutateText} onChange={(e) => setMutateText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && mutateText.trim()) { onMutate(c, mutateText.trim()); setMutateOpen(false); } }}
              placeholder="same but warmer…"
              className="flex-1 min-w-0 rounded border border-violet-400/40 bg-black/40 px-1.5 py-1 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none" />
            <button onClick={() => { if (mutateText.trim()) { onMutate(c, mutateText.trim()); setMutateOpen(false); } }} disabled={busy || !mutateText.trim()}
              className="rounded bg-violet-600 px-1.5 py-1 text-[10px] text-white disabled:opacity-50">Go</button>
          </div>
        )}
        {promptingBreed && (
          <div className="mt-1.5">
            <div className="text-[9px] text-fuchsia-300 mb-1">Breeding with “{breedParentLabel}”:</div>
            <button onClick={() => onBreed(c)} disabled={busy}
              title="One click, no prompt needed: 3 offspring — a true 50/50 (anti-dominance held on realism level), one leaning A, one leaning B"
              className="w-full rounded bg-fuchsia-600 px-1.5 py-1 text-[10px] text-white hover:bg-fuchsia-500 disabled:opacity-50 flex items-center justify-center gap-1">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dna className="w-3 h-3" />}
              Breed now (50/50 · lean A · lean B)
            </button>
            <div className="flex items-center gap-1 mt-1">
              <input value={breedText} onChange={(e) => setBreedText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && breedText.trim()) onBreed(c, breedText.trim()); }}
                placeholder="optional: A's palette on B's linework…"
                className="flex-1 min-w-0 rounded border border-fuchsia-400/30 bg-black/40 px-1.5 py-1 text-[10px] text-gray-200 placeholder:text-gray-600 focus:outline-none" />
              <button onClick={() => onBreed(c, breedText.trim())} disabled={busy || !breedText.trim()}
                className="rounded border border-fuchsia-400/40 bg-fuchsia-500/15 px-1.5 py-1 text-[10px] text-fuchsia-200 disabled:opacity-40">Go</button>
            </div>
            <button onClick={() => onBlend(c)} disabled={busy}
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
}

export function StyleStudio({ projectId, refreshToken = 0, onStylePinned, currentVisualPrompt, onAdoptDirective, pinnedStyleRefs = [], onUnpin }: StyleStudioProps) {
  const { openLightbox } = useLightbox();
  const liveProjectIdRef = useRef(projectId);
  liveProjectIdRef.current = projectId;

  // ---- matrix lab ----
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [plates, setPlates] = useState<PlateRow[]>(PLATE_PACKS["Media sweep"].slice(0, 3));
  const [matrixModel, setMatrixModel] = useState("nano-banana");
  const [matrixLeashed, setMatrixLeashed] = useState(false); // pins ride every plate
  const [runningMatrix, setRunningMatrix] = useState(false);

  // Live model registry — labels + availability from the server; pickers show
  // "(down)" for models whose provider key is absent. Prefers gpt-image for
  // matrices the moment it's live (it obeys style text best).
  const [MODEL_OPTIONS, setModelOptions] = useState<ModelOption[]>(FALLBACK_MODEL_OPTIONS);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/narrative/models?kind=image`);
        if (!r.ok) return;
        const d = await r.json();
        const opts: ModelOption[] = (d.models || []).map((m: any) => ({
          key: m.key, status: m.status,
          label: m.status === "down" ? `${m.label} (down)` : m.label,
        }));
        if (opts.length) {
          setModelOptions(opts);
          const gpt = opts.find((o) => o.key === "gpt-image");
          if (gpt?.status === "live") setMatrixModel("gpt-image");
        }
      } catch { /* fallback stays */ }
    })();
  }, []);
  const [labError, setLabError] = useState<string | null>(null);
  const [blendNote, setBlendNote] = useState<string | null>(null); // "N blended plates loaded"
  const matrixRef = useRef<HTMLElement>(null);
  const [evolveDirection, setEvolveDirection] = useState("");
  const [evolving, setEvolving] = useState(false);

  // ---- exploration sets (persisted server-side) ----
  const [sets, setSets] = useState<ExplorationSet[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);

  // ---- per-candidate iteration state (input TEXT lives inside each tile —
  //      see CandidateTileView's hoisting note) ----
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [breedParent, setBreedParent] = useState<Candidate | null>(null); // first parent selected
  const [breedPromptFor, setBreedPromptFor] = useState<Candidate | null>(null); // second parent → panel open
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());   // session-local "pinned!" feedback

  // ---- upload ----
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDragOver(false);
    setUploadNote(null);
    setUploadFailed(false);
  }, [projectId]);

  // ---- test bench ----
  const [benchPrompt, setBenchPrompt] = useState(DEFAULT_BENCH_PROMPT);
  const [benchModels, setBenchModels] = useState<Set<string>>(new Set(["nano-banana", "nano-banana-pro"])); // gpt-image down until AtlasCloud
  // full = prompt + pinned images · image-only = JUST the pinned images (does
  // the leash hold without the text propping it up?) · raw = neither.
  const [benchStyleMode, setBenchStyleMode] = useState<"full" | "image-only" | "raw">("full");
  const [benchRuns, setBenchRuns] = useState<Array<{ id: string; prompt: string; styleMode: string; tiles: Array<{ model: string; url?: string; error?: string }> }>>([]);
  const [runningBench, setRunningBench] = useState(false);

  // Explorations live PER STYLE SESSION: "New blank" starts one, Load resumes
  // one, Save names it (its sets re-stamp onto the saved style). The strip
  // shows THIS session's search by default; "all" reaches older/other sets.
  const [styleSessionId, setStyleSessionId] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [allSetsCount, setAllSetsCount] = useState(0);
  const loadSets = useCallback(async () => {
    if (!projectId) return;
    setLoadingSets(true);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations?projectId=${encodeURIComponent(projectId)}`);
      if (r.ok) {
        const d = await r.json();
        // prompt-grid = explore_prompts output — agent grids MUST show here
        const styleEngines = new Set(["style-matrix", "mutation", "breed", "diversify", "prompt-grid"]);
        const styleSets = ((d.explorations || []) as ExplorationSet[]).filter((s) => styleEngines.has(s.engine)).reverse();
        const sid = typeof d.styleSessionId === "string" ? d.styleSessionId : null;
        setStyleSessionId(sid);
        setAllSetsCount(styleSets.length);
        // Session filter, made honest: sets WITHOUT a session stamp (agent-
        // made) always show, and an empty current session falls back to ALL
        // sets — "my explorations vanished" was this filter hiding them.
        const inSession = sid ? styleSets.filter((x: any) => !(x as any).styleSessionId || (x as any).styleSessionId === sid) : styleSets;
        setSets(!showAllSessions && sid && inSession.length > 0 ? inSession : styleSets);
      }
    } finally { setLoadingSets(false); }
  }, [projectId, showAllSessions]);

  useEffect(() => { loadSets(); }, [loadSets, refreshToken]);
  // Staleness self-heals: poll while the room is open + refetch on focus,
  // so agent-run or other-tab explorations appear without a reload.
  useEffect(() => {
    const t = setInterval(() => { void loadSets(); }, 12000);
    const onFocus = () => { void loadSets(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [loadSets]);

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
          title: `${matrixLeashed ? "Leashed matrix" : "Matrix"} — ${new Date().toLocaleTimeString()}`,
          model: matrixModel,
          useProjectStyle: matrixLeashed,
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
  const runMutate = async (candidate: Candidate, direction: string) => {
    if (!projectId || !direction.trim()) return;
    setBusyCandidateId(candidate.id);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations/mutate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, candidateId: candidate.id, directions: [direction.trim()], model: "nano-banana" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Mutate failed");
      await loadSets();
    } catch (e: any) { setLabError(e.message); }
    finally { setBusyCandidateId(null); }
  };

  // fusionPrompt optional — omitted, the server breeds the default litter
  // (true 50/50 with anti-dominance held on realism level, lean-A, lean-B).
  const runBreed = async (parentB: Candidate, fusionPrompt?: string) => {
    if (!projectId || !breedParent) return;
    setBusyCandidateId(parentB.id);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations/breed`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, candidateIdA: breedParent.id, candidateIdB: parentB.id,
          ...(fusionPrompt && fusionPrompt.trim() ? { fusionPrompts: [fusionPrompt.trim()] } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Breed failed");
      setBreedParent(null); setBreedPromptFor(null);
      await loadSets();
    } catch (e: any) { setLabError(e.message); }
    finally { setBusyCandidateId(null); }
  };

  const handleBreedClick = (c: Candidate) => {
    if (!breedParent) { setBreedParent(c); }
    else if (breedParent.id === c.id) { setBreedParent(null); setBreedPromptFor(null); }
    else { setBreedPromptFor(c); }
  };

  // DIVERSIFY — recipe-only scatter, no image anchor. mode 'around' samples
  // the neighborhood WITHIN the style family; 'escape' jumps to distant basins.
  const runDiversify = async (candidate: Candidate, mode: "around" | "escape") => {
    if (!projectId) return;
    setBusyCandidateId(candidate.id);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations/diversify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, candidateId: candidate.id, count: 5, mode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Diversify failed");
      await loadSets();
    } catch (e: any) { setLabError(e.message); }
    finally { setBusyCandidateId(null); }
  };

  // EVOLVE → MATRIX: the LLM mutates the WORKING STYLE PROMPT per the writer's
  // direction ("grittier", "more painterly, less neon") into 3 evolved
  // directives, loaded as plates. Prompt-space mutation — the style itself
  // evolves, not just an image of it.
  const runEvolve = async () => {
    if (!projectId || !evolveDirection.trim()) return;
    setEvolving(true); setLabError(null);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/explorations/evolve-style`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, direction: evolveDirection.trim(), baseDirective: currentVisualPrompt || undefined, count: 3 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Evolve failed");
      setPlates((d.plates || []).map((p: any) => ({ axes: p.axes?.style || "evolved", directive: p.styleDirective })));
      setBlendNote(`Style evolved ${d.plates.length} ways per “${evolveDirection.trim()}” — run the matrix, then adopt the winner's directive.`);
      setEvolveDirection("");
    } catch (e: any) { setLabError(e.message); }
    finally { setEvolving(false); }
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
      setBreedParent(null); setBreedPromptFor(null);
      matrixRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e: any) { setLabError(e.message); }
    finally { setBusyCandidateId(null); }
  };

  // Pins the IMAGE as a style reference; the recipe rides along as the asset's
  // description so the knowledge isn't lost — but the WORKING STYLE PROMPT is
  // not changed by a pin ("Use as style prompt" does that half).
  const pinUrl = async (url: string, label: string, feedbackId?: string, recipe?: string) => {
    if (!projectId) return;
    if (feedbackId) setBusyCandidateId(feedbackId);
    try {
      const r = await fetch(`${API_BASE}/api/narrative/assets/style-reference-from-url`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, imageUrl: url, label, ...(recipe ? { description: recipe } : {}) }),
      });
      if (r.ok && feedbackId) setPinnedIds((prev) => new Set(prev).add(feedbackId));
      if (r.ok) onStylePinned?.(projectId);
    } finally { if (feedbackId) setBusyCandidateId(null); }
  };

  // ---------------- upload ----------------
  const uploadFiles = async (files: FileList | File[]) => {
    if (uploading || !files || files.length === 0) return;
    const uploadProjectId = projectId;
    setUploading(true); setUploadNote(null); setUploadFailed(false);
    try {
      const result = await uploadAssetBatches({
        files,
        projectId: uploadProjectId || "",
        category: "style", // style uploads auto-pin as style refs server-side
        endpoint: `${API_BASE}/api/narrative/assets`,
        onBatchComplete: (progress) => {
          if (liveProjectIdRef.current === uploadProjectId) {
            setUploadNote(`Uploading… ${progress.completedFileCount} of ${progress.selectedFileCount} images saved.`);
          }
        },
      });
      if (liveProjectIdRef.current === uploadProjectId) {
        setUploadNote(`${result.completedFileCount} image${result.completedFileCount === 1 ? "" : "s"} uploaded and PINNED as style references.`);
        setUploadFailed(false);
        onStylePinned?.(uploadProjectId || undefined);
      }
    } catch (error) {
      if (liveProjectIdRef.current === uploadProjectId) {
        setUploadNote(assetUploadErrorNotice(error));
        setUploadFailed(true);
        // Request-level failures may follow a successful write (or occur after
        // earlier batches). Ask the parent to refetch assets + pins so those
        // durable successes appear immediately.
        if (error instanceof AssetUploadError && error.kind === "request") {
          onStylePinned?.(uploadProjectId || undefined);
        }
      }
    }
    finally { setUploading(false); }
  };

  // ---------------- bench ----------------
  const runBench = async () => {
    if (!projectId || !benchPrompt.trim() || benchModels.size === 0) return;
    setRunningBench(true);
    const models = Array.from(benchModels);
    const runId = `bench_${Date.now()}`;
    setBenchRuns((prev) => [{ id: runId, prompt: benchPrompt, styleMode: benchStyleMode, tiles: models.map((m) => ({ model: m })) }, ...prev]);
    await Promise.all(models.map(async (model) => {
      try {
        const r = await fetch(`${API_BASE}/api/narrative/visual/render`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId, prompt: benchPrompt.trim(), model,
            ...(benchStyleMode === "raw" ? { suppressProjectStyle: true } : {}),
            ...(benchStyleMode === "image-only" ? { suppressStylePrompt: true } : {}),
          }),
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
        {/* EVOLVE — directed prompt-space mutation of the working style */}
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] px-2.5 py-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-300 shrink-0" />
          <input value={evolveDirection} onChange={(e) => setEvolveDirection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runEvolve()}
            placeholder='Evolve the current style — "grittier, more film grain", "less neon, more dawn light"…'
            className="flex-1 bg-transparent text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none" />
          <button onClick={runEvolve} disabled={evolving || !evolveDirection.trim()}
            title="An LLM rewrites the working style prompt per your direction, 3 ways (restrained → radical), loaded as plates"
            className="rounded-lg bg-violet-600 px-3 py-1 text-[11px] text-white hover:bg-violet-500 disabled:opacity-50 flex items-center gap-1">
            {evolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Evolve
          </button>
        </div>
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
            <label className={cn("flex items-center gap-1.5 text-[11px] cursor-pointer rounded-lg border px-2 py-1",
              matrixLeashed ? "border-amber-400/50 bg-amber-500/10 text-amber-300" : "border-white/10 text-gray-500 hover:text-gray-300")}
              title="Leashed: your pinned style refs ride EVERY plate, and the directives become variations ON TOP of the locked look — explore around a pinned Midjourney basis. Unchecked: plates read pure and ignore the pins (compare styles from scratch). Mutations inherit whichever mode the plate was born in.">
              <input type="checkbox" checked={matrixLeashed} onChange={(e) => setMatrixLeashed(e.target.checked)} className="accent-amber-400" />
              <Pin className="w-3 h-3" /> leash to pinned style
            </label>
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
          <div className="ml-auto flex items-center gap-2">
            {styleSessionId && (
              <button
                onClick={() => setShowAllSessions((v) => !v)}
                title={showAllSessions ? "Show only THIS style session's explorations" : `Show every style session's explorations (${allSetsCount} total)`}
                className={`rounded-lg border px-2 py-1 text-[10px] ${showAllSessions ? "border-pink-400/50 bg-pink-500/15 text-pink-200" : "border-white/10 bg-white/5 text-gray-400 hover:text-gray-200"}`}
              >
                {showAllSessions ? `all sessions (${allSetsCount})` : "this style only"}
              </button>
            )}
            <button onClick={loadSets} className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 hover:text-gray-200"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
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
                    s.engine === "style-matrix" ? "border-cyan-400/40 text-cyan-300"
                    : s.engine === "breed" ? "border-fuchsia-400/40 text-fuchsia-300"
                    : s.engine === "diversify" ? "border-orange-400/40 text-orange-300"
                    : s.engine === "prompt-grid" ? "border-emerald-400/40 text-emerald-300"
                    : "border-violet-400/40 text-violet-300")}>
                    {s.engine}
                  </span>
                  {s.title || s.id}
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {(s.candidates || []).map((c) => (
                    <CandidateTileView key={c.id} c={c}
                      busy={busyCandidateId === c.id}
                      pinned={pinnedIds.has(c.id)}
                      isBreedA={breedParent?.id === c.id}
                      breedArmed={Boolean(breedParent && breedParent.id !== c.id)}
                      breedParentLabel={breedParent?.label}
                      promptingBreed={breedPromptFor?.id === c.id && Boolean(breedParent)}
                      showAdopt={Boolean(onAdoptDirective)}
                      onInspect={openLightbox}
                      onPin={(cand) => {
                        const recipe = extractPlateDirective(cand.prompt) || cand.prompt;
                        void pinUrl(cand.url, `style: ${cand.label || cand.id}`, cand.id, recipe || undefined);
                        // A pin captures the IMAGE half; nudge for the other half
                        // when this candidate carries an adoptable recipe.
                        if (extractPlateDirective(cand.prompt) && onAdoptDirective) {
                          setBlendNote(`“${cand.label}” image pinned (recipe saved on the asset). The working style PROMPT is unchanged — click “Use as style prompt” on the tile to take both halves.`);
                        }
                      }}
                      onMutate={runMutate}
                      onBreedClick={handleBreedClick}
                      onBreed={runBreed}
                      onBlend={runBlendToMatrix}
                      onDiversify={runDiversify}
                      onAdopt={(directive, label) => { onAdoptDirective?.(directive); setBlendNote(`Adopted “${label}” as the working style prompt — pin its image too, then Save it as a named style in the library above.`); }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============ 3. STYLE REFERENCES — the leash (pinned strip + upload) ============ */}
      <section className="rounded-xl border border-amber-400/20 bg-amber-500/[0.03] p-4">
        <div className="flex items-center gap-2 mb-2">
          <Pin className="w-4 h-4 text-amber-300" />
          <span className="text-sm font-medium text-gray-100">Style references</span>
          <span className="text-xs text-gray-500">
            {pinnedStyleRefs.length > 0
              ? `${pinnedStyleRefs.length} pinned — these images + the style prompt ARE the working style; every render obeys them`
              : "nothing pinned yet — the style prompt alone is a weak leash; pin an image"}
          </span>
        </div>
        {pinnedStyleRefs.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto pb-2 mb-2">
            {pinnedStyleRefs.map((ref) => (
              <div key={ref.id} className="shrink-0 w-32 rounded-lg border border-amber-400/40 overflow-hidden bg-white/5 relative group">
                <img src={resolveUrl(ref.url)} alt={ref.name || ""}
                  onClick={() => openLightbox(resolveUrl(ref.url)!, ref.name)}
                  title="Click to inspect full size"
                  className="w-full h-20 object-cover cursor-zoom-in" />
                <span className="absolute top-1 left-1 text-[8px] px-1 py-0.5 rounded-full bg-amber-500/90 text-black font-medium flex items-center gap-0.5"><Pin className="w-2 h-2" />ref</span>
                {onUnpin && (
                  <button onClick={() => onUnpin(ref.id)} title="Unpin this reference"
                    className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-rose-300 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                )}
                <div className="px-1.5 py-1 text-[9px] text-gray-400 truncate" title={ref.name}>{ref.name || ref.id}</div>
              </div>
            ))}
          </div>
        )}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
          onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
          className={cn("rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors",
            dragOver ? "border-amber-400/70 bg-amber-500/10" : "border-white/15 bg-white/[0.02] hover:border-white/30")}
        >
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ""; }} />
          <div className="flex items-center justify-center gap-2 text-gray-300 text-sm">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-amber-300" />}
            Drop style images here — Midjourney renders, film stills, paintings
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Uploads pin immediately and appear above. Up to {ASSET_UPLOAD_MAX_FILES} images, {ASSET_UPLOAD_MAX_FILE_BYTES / (1024 * 1024)} MiB each; sent {ASSET_UPLOAD_BATCH_SIZE} at a time.
          </div>
          {uploadNote && <div role={uploadFailed ? "alert" : "status"} aria-live="polite" className={cn("text-[11px] mt-1.5", uploadFailed ? "text-rose-300" : "text-emerald-300")}>{uploadNote}</div>}
        </div>
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
          <select value={benchStyleMode} onChange={(e) => setBenchStyleMode(e.target.value as any)}
            title="full = style prompt + pinned images · image leash only = JUST the pinned images, no style text (does the pin hold on its own?) · raw = neither"
            className="ml-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-gray-300 focus:outline-none">
            <option value="full">project style (prompt + images)</option>
            <option value="image-only">image leash only</option>
            <option value="raw">raw (no style)</option>
          </select>
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
                <div className="text-[10px] text-gray-500 mb-1 truncate">“{run.prompt}”{run.styleMode === "raw" ? " · raw" : run.styleMode === "image-only" ? " · image leash only" : " · project style applied"}</div>
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
                          <button onClick={() => pinUrl(t.url!, `style: bench ${MODEL_OPTIONS.find((m) => m.key === t.model)?.label}`, undefined, run.prompt)}
                            title="Pin this render as a style reference (its bench prompt is saved on the asset)"
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

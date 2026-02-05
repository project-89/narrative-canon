"use client";

import { useState, useEffect } from "react";
import {
  PenTool,
  Sparkles,
  Loader2,
  Users,
  MapPin,
  Building2,
  Copy,
  Check,
  GitBranch,
  Plus,
  X,
  ChevronDown,
  BookOpen,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Entity {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface GenerationResult {
  content: string;
  newEntities: Entity[];
  newRelationships: any[];
}

const contentTypes = [
  { id: "scene", name: "Scene", description: "A narrative scene with action and dialogue" },
  { id: "dialogue", name: "Dialogue", description: "A conversation between characters" },
  { id: "description", name: "Description", description: "Descriptive prose for a location or character" },
  { id: "outline", name: "Outline", description: "A structured outline for a story beat" },
];

const toneOptions = [
  "neutral", "tense", "mysterious", "hopeful", "dark", "action", "emotional", "humorous"
];

export default function WritePage() {
  const [prompt, setPrompt] = useState("");
  const [contentType, setContentType] = useState("scene");
  const [tone, setTone] = useState("neutral");
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [useBranch, setUseBranch] = useState(false);
  const [branchName, setBranchName] = useState("");

  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch entities
  useEffect(() => {
    async function fetchEntities() {
      setIsLoading(true);
      try {
        const res = await fetch("http://localhost:3088/api/narrative/entities");
        if (res.ok) setEntities(await res.json());
      } catch (e) {
        console.error("Error fetching entities:", e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchEntities();
  }, []);

  const characters = entities.filter((e) => e.type === "character");
  const locations = entities.filter((e) => e.type === "location");

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("http://localhost:3088/api/canon/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          type: contentType,
          constraints: {
            mustInclude: selectedEntities,
            location: selectedLocation || undefined,
            tone,
          },
          branch: useBranch ? branchName || `what-if-${Date.now()}` : undefined,
        }),
      });

      if (!response.ok) throw new Error("Generation failed");

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.content) return;
    await navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleEntity = (id: string) => {
    setSelectedEntities((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Grounded Writer</h1>
        <p className="text-sm text-muted-foreground">
          Generate new content that respects your established canon
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Configuration panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Prompt */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground">What do you want to write?</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Write a scene where Agent Chen confronts Director Voss in Oneirocom Tower about the Convergence Protocol..."
              rows={4}
              className="mt-2 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Content type */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground">Content Type</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {contentTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setContentType(type.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    contentType === type.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/50 hover:bg-muted"
                  )}
                >
                  <p className="text-sm font-medium text-foreground">{type.name}</p>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Characters to include */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground">Include Characters</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {characters.map((char) => (
                <button
                  key={char.id}
                  onClick={() => toggleEntity(char.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors",
                    selectedEntities.includes(char.id)
                      ? "border-cyan-500 bg-cyan-500/20 text-cyan-400"
                      : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Users className="h-3 w-3" />
                  {char.name}
                  {selectedEntities.includes(char.id) && (
                    <X className="h-3 w-3 ml-1" />
                  )}
                </button>
              ))}
              {characters.length === 0 && (
                <p className="text-xs text-muted-foreground">No characters in canon yet</p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground">Location</label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Any location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tone */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground">Tone</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {toneOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm capitalize transition-colors",
                    tone === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Branch option */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useBranch}
                onChange={(e) => setUseBranch(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm font-medium text-foreground">Create as what-if branch</span>
            </label>
            {useBranch && (
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Branch name (optional)"
                className="mt-2 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {useBranch
                ? "Content will be saved to a separate timeline branch"
                : "New entities from this content can be committed to main canon"}
            </p>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-cyan-600 transition-all"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Generate Content
              </>
            )}
          </button>
        </div>

        {/* Output panel */}
        <div className="lg:col-span-3 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="font-medium text-red-500">Error</p>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {result ? (
            <>
              {/* Generated content */}
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <h3 className="font-medium text-foreground">Generated Content</h3>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-3 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="p-4">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">
                      {result.content}
                    </pre>
                  </div>
                </div>
              </div>

              {/* New entities discovered */}
              {result.newEntities && result.newEntities.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <h3 className="font-medium text-amber-400 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    New Entities Discovered
                  </h3>
                  <p className="mt-1 text-sm text-amber-300/80">
                    The following entities were mentioned in the generated content:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.newEntities.map((entity) => (
                      <span
                        key={entity.id}
                        className="rounded-full bg-amber-500/20 px-3 py-1 text-sm text-amber-300"
                      >
                        {entity.name} ({entity.type})
                      </span>
                    ))}
                  </div>
                  <button className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors">
                    <Plus className="h-4 w-4" />
                    Add to Canon
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
              <PenTool className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-medium text-foreground">
                Ready to write
              </h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Configure your generation settings on the left and click "Generate Content" to create
                new narrative content grounded in your established canon.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

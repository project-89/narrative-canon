"use client";

import { useState } from "react";
import {
  Upload,
  FileText,
  Loader2,
  Check,
  X,
  Users,
  MapPin,
  Building2,
  Lightbulb,
  Network,
  Link2,
  ChevronDown,
  ChevronRight,
  GitCommit,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExtractedEntity {
  id: string;
  name: string;
  type: string;
  description: string;
  approved: boolean;
}

interface ExtractedRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  description?: string;
  approved: boolean;
}

interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

const typeIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  concept: Lightbulb,
  technology: Network,
};

const typeColors: Record<string, string> = {
  character: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
  location: "text-green-400 bg-green-400/10 border-green-400/30",
  organization: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  concept: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  technology: "text-pink-400 bg-pink-400/10 border-pink-400/30",
};

export default function ImportPage() {
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [showEntities, setShowEntities] = useState(true);
  const [showRelationships, setShowRelationships] = useState(true);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    if (!text.trim()) return;

    setIsExtracting(true);
    setError(null);
    setExtraction(null);

    try {
      const response = await fetch("http://localhost:3088/api/canon/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          source: sourceName || "Imported content",
        }),
      });

      if (!response.ok) throw new Error("Extraction failed");

      const data = await response.json();

      // Mark all as approved by default
      setExtraction({
        entities: data.entities.map((e: any) => ({ ...e, approved: true })),
        relationships: data.relationships.map((r: any) => ({ ...r, approved: true })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setIsExtracting(false);
    }
  };

  const toggleEntityApproval = (id: string) => {
    if (!extraction) return;
    setExtraction({
      ...extraction,
      entities: extraction.entities.map((e) =>
        e.id === id ? { ...e, approved: !e.approved } : e
      ),
    });
  };

  const toggleRelationshipApproval = (id: string) => {
    if (!extraction) return;
    setExtraction({
      ...extraction,
      relationships: extraction.relationships.map((r) =>
        r.id === id ? { ...r, approved: !r.approved } : r
      ),
    });
  };

  const handleCommit = async () => {
    if (!extraction) return;

    const approvedEntities = extraction.entities.filter((e) => e.approved);
    const approvedRelationships = extraction.relationships.filter((r) => r.approved);

    if (approvedEntities.length === 0 && approvedRelationships.length === 0) {
      setError("Please approve at least one entity or relationship");
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:3088/api/canon/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entities: approvedEntities,
          relationships: approvedRelationships,
          message: `Import: ${sourceName || "New content"} (${approvedEntities.length} entities, ${approvedRelationships.length} relationships)`,
        }),
      });

      if (!response.ok) throw new Error("Commit failed");

      setCommitSuccess(true);
      setTimeout(() => {
        setText("");
        setSourceName("");
        setExtraction(null);
        setCommitSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setIsCommitting(false);
    }
  };

  const approvedCount = extraction
    ? extraction.entities.filter((e) => e.approved).length +
      extraction.relationships.filter((r) => r.approved).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Lore</h1>
        <p className="text-sm text-muted-foreground">
          Paste text to extract entities and relationships into your canon
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground">Source Name</label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g., Chapter 1, Episode Script, Lore Doc"
              className="mt-2 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground">Content to Extract</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your narrative text here. The system will extract characters, locations, organizations, and relationships..."
              rows={16}
              className="mt-2 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {text.length} characters
              </span>
              <button
                onClick={handleExtract}
                disabled={!text.trim() || isExtracting}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Extract Entities
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Extraction results */}
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-500">Error</p>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            </div>
          )}

          {commitSuccess && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 flex items-center gap-3">
              <Check className="h-5 w-5 text-green-500" />
              <p className="font-medium text-green-500">
                Successfully committed to canon!
              </p>
            </div>
          )}

          {extraction ? (
            <>
              {/* Entities section */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setShowEntities(!showEntities)}
                  className="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {showEntities ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-foreground">
                      Entities ({extraction.entities.length})
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {extraction.entities.filter((e) => e.approved).length} approved
                    </span>
                  </div>
                </button>

                {showEntities && (
                  <div className="border-t border-border divide-y divide-border">
                    {extraction.entities.map((entity) => {
                      const Icon = typeIcons[entity.type] || FileText;
                      const colors = typeColors[entity.type] || "text-gray-400 bg-gray-400/10 border-gray-400/30";

                      return (
                        <div
                          key={entity.id}
                          className={cn(
                            "p-4 transition-colors",
                            entity.approved ? "bg-card" : "bg-muted/30 opacity-60"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleEntityApproval(entity.id)}
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 mt-0.5 transition-colors",
                                entity.approved
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card"
                              )}
                            >
                              {entity.approved && <Check className="h-3 w-3" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", colors)}>
                                  <Icon className="h-3 w-3" />
                                  {entity.type}
                                </span>
                                <span className="font-medium text-foreground truncate">
                                  {entity.name}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                {entity.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Relationships section */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setShowRelationships(!showRelationships)}
                  className="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {showRelationships ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-foreground">
                      Relationships ({extraction.relationships.length})
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {extraction.relationships.filter((r) => r.approved).length} approved
                    </span>
                  </div>
                </button>

                {showRelationships && (
                  <div className="border-t border-border divide-y divide-border">
                    {extraction.relationships.map((rel) => (
                      <div
                        key={rel.id}
                        className={cn(
                          "p-4 transition-colors",
                          rel.approved ? "bg-card" : "bg-muted/30 opacity-60"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleRelationshipApproval(rel.id)}
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 mt-0.5 transition-colors",
                              rel.approved
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card"
                            )}
                          >
                            {rel.approved && <Check className="h-3 w-3" />}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium text-foreground">{rel.source}</span>
                              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                                {rel.type.replace(/_/g, " ")}
                              </span>
                              <span className="font-medium text-foreground">{rel.target}</span>
                            </div>
                            {rel.description && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {rel.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Commit button */}
              <button
                onClick={handleCommit}
                disabled={approvedCount === 0 || isCommitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-cyan-600 transition-all"
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Committing to Canon...
                  </>
                ) : (
                  <>
                    <GitCommit className="h-4 w-4" />
                    Commit {approvedCount} Items to Canon
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-medium text-foreground">
                No extraction yet
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Paste content and click "Extract Entities" to see what can be added to your canon
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

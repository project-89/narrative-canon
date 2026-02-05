"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Image,
  Users,
  LayoutGrid,
  BookOpen,
  Sparkles,
  RefreshCw,
  Settings2,
  Clock,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PortraitGrid } from "@/components/visuals/PortraitGrid";
import { PanelGallery } from "@/components/visuals/PanelGallery";

interface Entity {
  id: string;
  name: string;
  type: string;
  description?: string;
}

interface Interaction {
  id: string;
  type: string;
  description?: string;
  participants?: string[];
}

interface Portrait {
  id: string;
  entityId: string;
  entityName: string;
  entityType: string;
  imageUrl?: string;
  status: "complete" | "generating" | "pending";
  generatedAt?: string;
}

interface Panel {
  id: string;
  interactionId: string;
  interactionTitle: string;
  interactionType: string;
  imageUrl?: string;
  status: "complete" | "generating" | "pending";
  generatedAt?: string;
}

const tabs = [
  { id: "portraits", name: "Portraits", icon: Users },
  { id: "panels", name: "Panels", icon: LayoutGrid },
  { id: "pages", name: "Comic Pages", icon: BookOpen },
];

export default function VisualsPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("portraits");
  const [selectedPortrait, setSelectedPortrait] = useState<string | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  // Fetch entities and interactions from API
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const [entitiesRes, interactionsRes] = await Promise.all([
          fetch("http://localhost:3088/api/narrative/entities"),
          fetch("http://localhost:3088/api/narrative/interactions"),
        ]);

        if (!entitiesRes.ok || !interactionsRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const [entitiesData, interactionsData] = await Promise.all([
          entitiesRes.json(),
          interactionsRes.json(),
        ]);

        setEntities(entitiesData);
        setInteractions(interactionsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
        console.error("Error fetching visuals data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Convert entities to portrait format
  const portraits: Portrait[] = useMemo(() => {
    return entities.map((entity) => ({
      id: `portrait-${entity.id}`,
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      status: generatingIds.has(`portrait-${entity.id}`)
        ? "generating"
        : "pending" as const,
    }));
  }, [entities, generatingIds]);

  // Convert interactions to panel format
  const panels: Panel[] = useMemo(() => {
    return interactions.map((interaction) => ({
      id: `panel-${interaction.id}`,
      interactionId: interaction.id,
      interactionTitle: interaction.description || `${interaction.type} interaction`,
      interactionType: interaction.type || "dialogue",
      status: generatingIds.has(`panel-${interaction.id}`)
        ? "generating"
        : "pending" as const,
    }));
  }, [interactions, generatingIds]);

  // Calculate stats
  const allItems = [...portraits, ...panels];
  const generateCount = allItems.filter((p) => p.status === "generating").length;
  const pendingCount = allItems.filter((p) => p.status === "pending").length;
  const completeCount = allItems.filter((p) => p.status === "complete").length;

  const handleGenerate = (id: string) => {
    // Simulated generation - in real implementation would call API
    setGeneratingIds((prev) => new Set([...Array.from(prev), id]));

    // Simulate generation completion after 3 seconds
    setTimeout(() => {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 3000);
  };

  const handleRegenerate = (id: string) => {
    handleGenerate(id);
  };

  const handleGenerateAll = () => {
    if (activeTab === "portraits") {
      portraits.forEach((p) => handleGenerate(p.id));
    } else if (activeTab === "panels") {
      panels.forEach((p) => handleGenerate(p.id));
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading visuals data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Image className="h-12 w-12 text-red-500/50" />
        <h3 className="mt-4 font-semibold text-red-500">Error loading visuals</h3>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {/* Tabs */}
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Settings2 className="h-4 w-4" />
            Settings
          </button>
          <button
            onClick={handleGenerateAll}
            disabled={generateCount > 0}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Generate All
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Image className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {portraits.length + panels.length}
              </p>
              <p className="text-xs text-muted-foreground">Total Visuals</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{completeCount}</p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
              <RefreshCw className={cn("h-5 w-5", generateCount > 0 && "animate-spin")} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{generateCount}</p>
              <p className="text-xs text-muted-foreground">Generating</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-foreground">
            {activeTab === "portraits" && "Entity Portraits"}
            {activeTab === "panels" && "Comic Panels"}
            {activeTab === "pages" && "Comic Pages"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {activeTab === "portraits" &&
              "Generate and manage portraits for all narrative entities"}
            {activeTab === "panels" &&
              "Generate comic panels from story interactions"}
            {activeTab === "pages" &&
              "Compose panels into full comic pages"}
          </p>
        </div>
        <div className="p-6">
          {activeTab === "portraits" && (
            portraits.length > 0 ? (
              <PortraitGrid
                portraits={portraits}
                onGenerate={handleGenerate}
                onRegenerate={handleRegenerate}
                onSelect={setSelectedPortrait}
                selectedId={selectedPortrait}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-16 w-16 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  No Entities Yet
                </h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Play the game to create entities in your narrative. Each entity can have a portrait generated.
                </p>
              </div>
            )
          )}
          {activeTab === "panels" && (
            panels.length > 0 ? (
              <PanelGallery
                panels={panels}
                onGenerate={handleGenerate}
                onRegenerate={handleRegenerate}
                onSelect={setSelectedPanel}
                selectedId={selectedPanel}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <LayoutGrid className="h-16 w-16 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  No Interactions Yet
                </h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Play the game to create interactions in your narrative. Each interaction can be turned into a comic panel.
                </p>
              </div>
            )
          )}
          {activeTab === "pages" && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="h-16 w-16 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Comic Page Composer
              </h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Drag and drop panels to compose full comic pages. Choose from
                various layout templates or create custom arrangements.
              </p>
              <button className="mt-6 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                <Sparkles className="h-4 w-4" />
                Create New Page
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Generation queue */}
      {generateCount > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-primary animate-spin" />
              <div>
                <p className="font-medium text-foreground">
                  Generating {generateCount} visual{generateCount !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  Using AI to create visuals from narrative descriptions
                </p>
              </div>
            </div>
            <button className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              View Queue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import {
  MessageSquare,
  Swords,
  Heart,
  Lightbulb,
  Eye,
  Zap,
  Search,
  Filter,
  Image,
  X,
  Users,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractionTimeline } from "@/components/interactions/InteractionTimeline";

interface Participant {
  id: string;
  name: string;
  type: string;
}

interface Interaction {
  id: string;
  type: "dialogue" | "conflict" | "alliance" | "revelation" | "observation" | "transformation";
  title: string;
  description: string;
  participants: Participant[];
  scene?: string;
  chapter?: string;
  emotionalTone?: string;
  timestamp?: string;
  hasVisual?: boolean;
}

interface GroupedInteractions {
  group: string;
  interactions: Interaction[];
}

const interactionTypes = [
  { id: "all", name: "All", icon: null },
  { id: "dialogue", name: "Dialogue", icon: MessageSquare, color: "text-interaction-dialogue" },
  { id: "conflict", name: "Conflict", icon: Swords, color: "text-interaction-conflict" },
  { id: "alliance", name: "Alliance", icon: Heart, color: "text-interaction-alliance" },
  { id: "revelation", name: "Revelation", icon: Lightbulb, color: "text-interaction-revelation" },
  { id: "observation", name: "Observation", icon: Eye, color: "text-interaction-observation" },
  { id: "transformation", name: "Transform", icon: Zap, color: "text-purple-500" },
];

export default function InteractionsPage() {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch interactions from API
  useEffect(() => {
    async function fetchInteractions() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("http://localhost:3088/api/narrative/interactions");
        if (!res.ok) throw new Error("Failed to fetch interactions");
        const data = await res.json();

        // Transform API data to our format
        const transformedInteractions: Interaction[] = data.map((i: any) => ({
          id: i.id,
          type: mapInteractionType(i.type),
          title: i.description || `${i.type} interaction`,
          description: i.context || i.description || "No description available",
          participants: i.participants?.map((p: any) => ({
            id: typeof p === "string" ? p : p.id,
            name: typeof p === "string" ? p : p.name || p.id,
            type: typeof p === "string" ? "character" : p.type || "character",
          })) || [],
          scene: i.scene || i.location,
          chapter: i.chapter,
          emotionalTone: i.emotionalTone || i.outcome,
          timestamp: i.timestamp,
          hasVisual: i.hasVisual || false,
        }));

        setInteractions(transformedInteractions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch interactions");
        console.error("Error fetching interactions:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchInteractions();
  }, []);

  // Map API interaction types to our types
  function mapInteractionType(type: string): Interaction["type"] {
    const typeMap: Record<string, Interaction["type"]> = {
      dialogue: "dialogue",
      conversation: "dialogue",
      talk: "dialogue",
      conflict: "conflict",
      fight: "conflict",
      battle: "conflict",
      alliance: "alliance",
      join: "alliance",
      agree: "alliance",
      revelation: "revelation",
      discover: "revelation",
      reveal: "revelation",
      observation: "observation",
      observe: "observation",
      witness: "observation",
      transformation: "transformation",
      change: "transformation",
      transform: "transformation",
    };
    return typeMap[type?.toLowerCase()] || "dialogue";
  }

  const selectedInteraction = interactions.find((i) => i.id === selectedId);

  // Filter and group interactions
  const filteredInteractions = useMemo(() => {
    return interactions.filter((interaction) => {
      const matchesType = selectedType === "all" || interaction.type === selectedType;
      const matchesSearch =
        interaction.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        interaction.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [interactions, selectedType, searchQuery]);

  // Group by chapter/scene
  const groupedInteractions = useMemo((): GroupedInteractions[] => {
    const groups = new Map<string, Interaction[]>();

    filteredInteractions.forEach((interaction) => {
      const groupKey = interaction.chapter || interaction.scene || "Unclassified";
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(interaction);
    });

    return Array.from(groups.entries())
      .map(([group, ints]) => ({ group, interactions: ints }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [filteredInteractions]);

  // Count interactions by type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: interactions.length };
    interactionTypes.slice(1).forEach((type) => {
      counts[type.id] = interactions.filter((i) => i.type === type.id).length;
    });
    return counts;
  }, [interactions]);

  // Count unique chapters
  const chapterCount = useMemo(() => {
    return new Set(interactions.map((i) => i.chapter || i.scene).filter(Boolean)).size;
  }, [interactions]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading interactions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MessageSquare className="h-12 w-12 text-red-500/50" />
        <h3 className="mt-4 font-semibold text-red-500">Error loading interactions</h3>
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
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search interactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-lg border border-border bg-muted/50 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Filter button */}
          <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>

        <div className="text-sm text-muted-foreground">
          {interactions.length} interactions across {chapterCount} scenes
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {interactionTypes.map((type) => {
          const isSelected = selectedType === type.id;
          const Icon = type.icon;
          const count = typeCounts[type.id] || 0;
          return (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {Icon && <Icon className={cn("h-4 w-4", type.color)} />}
              {type.name}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  isSelected ? "bg-primary/20" : "bg-muted"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          {groupedInteractions.length > 0 ? (
            <InteractionTimeline
              groupedInteractions={groupedInteractions}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold text-foreground">No interactions found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {searchQuery || selectedType !== "all"
                  ? "Try adjusting your search or filters"
                  : "Play the game to create narrative interactions"}
              </p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedInteraction ? (
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Interaction Details</h3>
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {/* Title and type */}
                <div>
                  <h4 className="font-semibold text-foreground text-lg">
                    {selectedInteraction.title}
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary capitalize">
                      {selectedInteraction.type}
                    </span>
                    {selectedInteraction.emotionalTone && (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {selectedInteraction.emotionalTone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-foreground">{selectedInteraction.description}</p>
                </div>

                {/* Location */}
                <div className="grid grid-cols-2 gap-3">
                  {selectedInteraction.chapter && (
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Chapter</p>
                      <p className="font-medium text-foreground">{selectedInteraction.chapter}</p>
                    </div>
                  )}
                  {selectedInteraction.scene && (
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Scene</p>
                      <p className="font-medium text-foreground">{selectedInteraction.scene}</p>
                    </div>
                  )}
                </div>

                {/* Participants */}
                {selectedInteraction.participants.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Participants</p>
                    <div className="space-y-2">
                      {selectedInteraction.participants.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"
                        >
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="text-xs text-muted-foreground capitalize">
                            ({p.type})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t border-border space-y-2">
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                    <Image className="h-4 w-4" />
                    Generate Panel
                  </button>
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                    View in Timeline
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold text-foreground">Select an Interaction</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Click on an interaction to view details and generate visuals
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

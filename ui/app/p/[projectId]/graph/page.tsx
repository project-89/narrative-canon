"use client";

import { useState, useEffect } from "react";
import {
  Search,
  SlidersHorizontal,
  Expand,
  X,
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
  Network,
  MessageSquare,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityGraph } from "@/components/graph/EntityGraph";
import Link from "next/link";

interface Entity {
  id: string;
  name: string;
  type: string;
  description: string;
  traits?: string[];
  properties?: Record<string, any>;
}

interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  description?: string;
}

interface SelectedEntity extends Entity {
  relationships: number;
  interactions: number;
}

interface GraphData {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: { label: string; type: string; description: string };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    type: string;
  }>;
}

const typeIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  object: Box,
  concept: Lightbulb,
  technology: Cpu,
};

const typeColors: Record<string, string> = {
  character: "text-entity-character border-entity-character/30 bg-entity-character/10",
  location: "text-entity-location border-entity-location/30 bg-entity-location/10",
  organization: "text-entity-organization border-entity-organization/30 bg-entity-organization/10",
  object: "text-entity-object border-entity-object/30 bg-entity-object/10",
  concept: "text-entity-concept border-entity-concept/30 bg-entity-concept/10",
  technology: "text-entity-technology border-entity-technology/30 bg-entity-technology/10",
};

export default function GraphPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Fetch data from API
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const [entitiesRes, relationshipsRes, graphRes] = await Promise.all([
          fetch("http://localhost:3088/api/narrative/entities"),
          fetch("http://localhost:3088/api/narrative/relationships"),
          fetch("http://localhost:3088/api/narrative/graph")
        ]);

        if (!entitiesRes.ok || !relationshipsRes.ok || !graphRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const [entitiesData, relationshipsData, graphDataRes] = await Promise.all([
          entitiesRes.json(),
          relationshipsRes.json(),
          graphRes.json()
        ]);

        setEntities(entitiesData);
        setRelationships(relationshipsData);
        setGraphData(graphDataRes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
        console.error("Error fetching graph data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleEntityClick = (entityId: string) => {
    const entity = entities.find(e => e.id === entityId);
    if (!entity) return;

    // Count relationships for this entity
    const relCount = relationships.filter(
      r => r.source === entityId || r.target === entityId
    ).length;

    setSelectedEntity({
      ...entity,
      relationships: relCount,
      interactions: 0 // Would need to fetch interactions
    });
  };

  // Filter entities based on search
  const filteredEntities = entities.filter(e =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-center">
        <Network className="h-12 w-12 text-red-500/50" />
        <h3 className="mt-4 font-semibold text-red-500">Error loading graph</h3>
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
    <div className={cn(
      "flex flex-col",
      isFullscreen ? "fixed inset-0 z-50 bg-background" : "h-[calc(100vh-8rem)]"
    )}>
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-3">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-foreground">Entity Relationship Graph</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-64 rounded-lg border border-border bg-muted/50 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {/* Search results dropdown */}
          {searchQuery && filteredEntities.length > 0 && (
            <div className="absolute top-12 left-32 z-50 w-64 rounded-lg border border-border bg-card shadow-lg">
              <div className="max-h-64 overflow-y-auto p-2">
                {filteredEntities.slice(0, 10).map(entity => (
                  <button
                    key={entity.id}
                    onClick={() => {
                      handleEntityClick(entity.id);
                      setSearchQuery("");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {(() => {
                      const Icon = typeIcons[entity.type] || Box;
                      return <Icon className="h-4 w-4 text-muted-foreground" />;
                    })()}
                    <span className="text-foreground">{entity.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">({entity.type})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors",
              showSettings
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Expand className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="relative flex-1">
        <EntityGraph
          nodes={graphData?.nodes || []}
          edges={graphData?.edges || []}
          onNodeClick={handleEntityClick}
        />

        {/* Legend */}
        <div className="absolute bottom-4 right-4 rounded-lg border border-border bg-card/95 backdrop-blur-sm p-3 shadow-lg">
          <p className="text-xs font-medium text-muted-foreground mb-2">Entity Types</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(typeIcons).map(([type, Icon]) => (
              <div key={type} className="flex items-center gap-2">
                <Icon className={cn("h-3 w-3", typeColors[type]?.split(" ")[0])} />
                <span className="text-xs text-muted-foreground capitalize">{type}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-1">Relationships</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-cyan-500" />
                <span className="text-xs text-muted-foreground">Member/Ally</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-red-500" style={{ backgroundImage: "linear-gradient(90deg, #ef4444 50%, transparent 50%)", backgroundSize: "6px 1px" }} />
                <span className="text-xs text-muted-foreground">Conflict</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-purple-500" />
                <span className="text-xs text-muted-foreground">Location</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="absolute top-4 right-4 flex gap-2">
          <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm px-3 py-2 shadow-lg">
            <p className="text-lg font-bold text-foreground">{entities.length}</p>
            <p className="text-xs text-muted-foreground">Entities</p>
          </div>
          <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm px-3 py-2 shadow-lg">
            <p className="text-lg font-bold text-foreground">{relationships.length}</p>
            <p className="text-xs text-muted-foreground">Relations</p>
          </div>
        </div>
      </div>

      {/* Entity Detail Panel (slides in from right) */}
      {selectedEntity && (
        <div className="absolute right-0 top-0 bottom-0 w-80 border-l border-border bg-card shadow-xl animate-in slide-in-from-right">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h3 className="font-semibold text-foreground">Entity Details</h3>
            <button
              onClick={() => setSelectedEntity(null)}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            {/* Entity header */}
            <div className="flex items-start gap-3">
              {(() => {
                const Icon = typeIcons[selectedEntity.type] || Box;
                const colorClasses = typeColors[selectedEntity.type] || "text-foreground border-border bg-muted";
                return (
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl border", colorClasses)}>
                    <Icon className="h-6 w-6" />
                  </div>
                );
              })()}
              <div>
                <h4 className="font-semibold text-foreground">{selectedEntity.name}</h4>
                <span className={cn(
                  "inline-block rounded-full border px-2 py-0.5 text-xs capitalize mt-1",
                  typeColors[selectedEntity.type]
                )}>
                  {selectedEntity.type}
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-foreground">{selectedEntity.description}</p>
            </div>

            {/* Properties */}
            {selectedEntity.properties && Object.keys(selectedEntity.properties).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Properties</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(selectedEntity.properties).map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                    >
                      {key}: {String(value)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Network className="h-4 w-4" />
                  <span className="text-xs">Relationships</span>
                </div>
                <p className="mt-1 text-xl font-bold text-foreground">{selectedEntity.relationships}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs">Interactions</span>
                </div>
                <p className="mt-1 text-xl font-bold text-foreground">{selectedEntity.interactions}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-border">
              <Link
                href={`/entities/${selectedEntity.id}`}
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View Full Details
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

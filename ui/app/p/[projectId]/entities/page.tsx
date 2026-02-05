"use client";

import { useState, useEffect } from "react";
import {
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
  Filter,
  Grid3X3,
  List,
  Search,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityCard } from "@/components/entities/EntityCard";

// Entity type configuration
const entityTypes = [
  { id: "all", name: "All", icon: null, color: "text-foreground" },
  { id: "character", name: "Characters", icon: Users, color: "text-entity-character" },
  { id: "location", name: "Locations", icon: MapPin, color: "text-entity-location" },
  { id: "organization", name: "Organizations", icon: Building2, color: "text-entity-organization" },
  { id: "object", name: "Objects", icon: Box, color: "text-entity-object" },
  { id: "concept", name: "Concepts", icon: Lightbulb, color: "text-entity-concept" },
  { id: "technology", name: "Technology", icon: Cpu, color: "text-entity-technology" },
];

interface Entity {
  id: string;
  name: string;
  type: string;
  description: string;
  traits?: string[];
  atmosphere?: string;
  relationships?: number;
  interactions?: number;
}

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch entities from API
  useEffect(() => {
    async function fetchEntities() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("http://localhost:3088/api/narrative/entities");
        if (!response.ok) {
          throw new Error(`Failed to fetch entities: ${response.status}`);
        }
        const data = await response.json();
        setEntities(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch entities");
        console.error("Error fetching entities:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchEntities();
  }, []);

  // Filter entities
  const filteredEntities = entities.filter((entity) => {
    const matchesType = selectedType === "all" || entity.type === selectedType;
    const matchesSearch =
      entity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entity.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Count by type
  const typeCounts = entityTypes.reduce((acc, type) => {
    if (type.id === "all") {
      acc[type.id] = entities.length;
    } else {
      acc[type.id] = entities.filter((e) => e.type === type.id).length;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Filters and search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search entities..."
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

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-border bg-muted/50">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-l-lg transition-colors",
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-r-lg transition-colors",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Add entity button */}
          <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Add Entity
          </button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {entityTypes.map((type) => {
          const isSelected = selectedType === type.id;
          const Icon = type.icon;
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
                {typeCounts[type.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Entity grid/list */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <h3 className="mt-4 font-semibold text-foreground">Loading entities...</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Fetching data from the API
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 py-16 text-center">
          <Users className="h-12 w-12 text-red-500/50" />
          <h3 className="mt-4 font-semibold text-red-500">Error loading entities</h3>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Retry
          </button>
        </div>
      ) : filteredEntities.length > 0 ? (
        <div
          className={cn(
            viewMode === "grid"
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "flex flex-col gap-3"
          )}
        >
          {filteredEntities.map((entity) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              viewMode={viewMode}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-semibold text-foreground">No entities found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {searchQuery
              ? "Try adjusting your search or filters"
              : "Extract a narrative to populate entities"}
          </p>
        </div>
      )}
    </div>
  );
}

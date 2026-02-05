"use client";

import {
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Download,
  Filter,
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
  Wand2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onReset: () => void;
  onAutoLayout?: () => void;
  isLayouting?: boolean;
  onExport?: () => void;
  entityFilters: Record<string, boolean>;
  onFilterChange: (type: string, enabled: boolean) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
}

const entityTypes = [
  { id: "character", name: "Characters", icon: Users, color: "text-entity-character" },
  { id: "location", name: "Locations", icon: MapPin, color: "text-entity-location" },
  { id: "organization", name: "Organizations", icon: Building2, color: "text-entity-organization" },
  { id: "object", name: "Objects", icon: Box, color: "text-entity-object" },
  { id: "concept", name: "Concepts", icon: Lightbulb, color: "text-entity-concept" },
  { id: "technology", name: "Technology", icon: Cpu, color: "text-entity-technology" },
];

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onFitView,
  onReset,
  onAutoLayout,
  isLayouting,
  onExport,
  entityFilters,
  onFilterChange,
  depth,
  onDepthChange,
}: GraphControlsProps) {
  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
      {/* Zoom Controls */}
      <div className="flex flex-col rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-lg">
        <button
          onClick={onZoomIn}
          className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground rounded-t-lg"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={onZoomOut}
          className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground border-t border-border"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={onFitView}
          className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground border-t border-border"
          title="Fit View"
        >
          <Maximize className="h-4 w-4" />
        </button>
        <button
          onClick={onReset}
          className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground border-t border-border"
          title="Reset Layout"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        {onAutoLayout && (
          <button
            onClick={onAutoLayout}
            disabled={isLayouting}
            className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground border-t border-border rounded-b-lg disabled:opacity-50"
            title="Auto Layout"
          >
            {isLayouting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Depth Control */}
      <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm p-3 shadow-lg">
        <p className="text-xs font-medium text-muted-foreground mb-2">Depth</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              onClick={() => onDepthChange(d)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors",
                depth === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Entity Type Filters */}
      <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm p-3 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Filter</p>
        </div>
        <div className="space-y-1">
          {entityTypes.map((type) => {
            const Icon = type.icon;
            const isEnabled = entityFilters[type.id] !== false;
            return (
              <button
                key={type.id}
                onClick={() => onFilterChange(type.id, !isEnabled)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                  isEnabled
                    ? "bg-muted/50 text-foreground"
                    : "text-muted-foreground opacity-50"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isEnabled && type.color)} />
                <span>{type.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Export */}
      {onExport && (
        <button
          onClick={onExport}
          className="flex items-center gap-2 rounded-lg border border-border bg-card/95 backdrop-blur-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shadow-lg"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      )}
    </div>
  );
}

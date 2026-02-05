"use client";

import {
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
  Plus,
  RefreshCw,
  Download,
  Expand,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Portrait {
  id: string;
  entityId: string;
  entityName: string;
  entityType: string;
  imageUrl?: string;
  status: "pending" | "generating" | "complete" | "error";
  generatedAt?: string;
}

interface PortraitGridProps {
  portraits: Portrait[];
  onGenerate: (entityId: string) => void;
  onRegenerate: (portraitId: string) => void;
  onSelect: (portraitId: string) => void;
  selectedId: string | null;
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
  character: "text-entity-character border-entity-character/30",
  location: "text-entity-location border-entity-location/30",
  organization: "text-entity-organization border-entity-organization/30",
  object: "text-entity-object border-entity-object/30",
  concept: "text-entity-concept border-entity-concept/30",
  technology: "text-entity-technology border-entity-technology/30",
};

export function PortraitGrid({
  portraits,
  onGenerate,
  onRegenerate,
  onSelect,
  selectedId,
}: PortraitGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {portraits.map((portrait) => {
        const Icon = typeIcons[portrait.entityType] || Box;
        const colorClasses = typeColors[portrait.entityType] || "text-foreground border-border";

        return (
          <div
            key={portrait.id}
            onClick={() => onSelect(portrait.id)}
            className={cn(
              "group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-xl border transition-all",
              selectedId === portrait.id
                ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "border-border hover:border-primary/50"
            )}
          >
            {/* Image or placeholder */}
            {portrait.imageUrl ? (
              <img
                src={portrait.imageUrl}
                alt={portrait.entityName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted/50">
                {portrait.status === "generating" ? (
                  <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                ) : (
                  <Icon className={cn("h-12 w-12", colorClasses.split(" ")[0])} />
                )}
              </div>
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <h4 className="font-medium text-white truncate">{portrait.entityName}</h4>
                <p className="text-xs text-white/70 capitalize">{portrait.entityType}</p>
              </div>

              {/* Action buttons */}
              <div className="absolute top-2 right-2 flex gap-1">
                {portrait.imageUrl ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate(portrait.id);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"
                      title="Regenerate"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"
                      title="Expand"
                    >
                      <Expand className="h-4 w-4" />
                    </button>
                  </>
                ) : portrait.status !== "generating" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerate(portrait.entityId);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-3 w-3" />
                    Generate
                  </button>
                )}
              </div>
            </div>

            {/* Status badge */}
            {portrait.status === "generating" && (
              <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-primary/90 px-2 py-1 text-xs font-medium text-primary-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Generating...
              </div>
            )}
            {portrait.status === "error" && (
              <div className="absolute top-2 left-2 rounded bg-red-500/90 px-2 py-1 text-xs font-medium text-white">
                Error
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

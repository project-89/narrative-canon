"use client";

import {
  MessageSquare,
  Swords,
  Heart,
  Lightbulb,
  Eye,
  Zap,
  RefreshCw,
  Download,
  Expand,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Panel {
  id: string;
  interactionId: string;
  interactionTitle: string;
  interactionType: string;
  imageUrl?: string;
  status: "pending" | "generating" | "complete" | "error";
  generatedAt?: string;
}

interface PanelGalleryProps {
  panels: Panel[];
  onGenerate: (interactionId: string) => void;
  onRegenerate: (panelId: string) => void;
  onSelect: (panelId: string) => void;
  selectedId: string | null;
}

const typeIcons: Record<string, typeof MessageSquare> = {
  dialogue: MessageSquare,
  conflict: Swords,
  alliance: Heart,
  revelation: Lightbulb,
  observation: Eye,
  transformation: Zap,
};

const typeColors: Record<string, string> = {
  dialogue: "text-interaction-dialogue",
  conflict: "text-interaction-conflict",
  alliance: "text-interaction-alliance",
  revelation: "text-interaction-revelation",
  observation: "text-interaction-observation",
  transformation: "text-purple-500",
};

export function PanelGallery({
  panels,
  onGenerate,
  onRegenerate,
  onSelect,
  selectedId,
}: PanelGalleryProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {panels.map((panel) => {
        const Icon = typeIcons[panel.interactionType] || MessageSquare;
        const colorClass = typeColors[panel.interactionType] || "text-foreground";

        return (
          <div
            key={panel.id}
            onClick={() => onSelect(panel.id)}
            className={cn(
              "group relative aspect-video cursor-pointer overflow-hidden rounded-xl border transition-all",
              selectedId === panel.id
                ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "border-border hover:border-primary/50"
            )}
          >
            {/* Image or placeholder */}
            {panel.imageUrl ? (
              <img
                src={panel.imageUrl}
                alt={panel.interactionTitle}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-muted/50 gap-2">
                {panel.status === "generating" ? (
                  <>
                    <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                    <span className="text-sm text-muted-foreground">Generating panel...</span>
                  </>
                ) : (
                  <>
                    <Icon className={cn("h-12 w-12", colorClass)} />
                    <span className="text-sm text-muted-foreground">No panel yet</span>
                  </>
                )}
              </div>
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("h-4 w-4", colorClass)} />
                  <span className="text-xs text-white/70 capitalize">{panel.interactionType}</span>
                </div>
                <h4 className="font-medium text-white truncate">{panel.interactionTitle}</h4>
              </div>

              {/* Action buttons */}
              <div className="absolute top-2 right-2 flex gap-1">
                {panel.imageUrl ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate(panel.id);
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
                ) : panel.status !== "generating" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerate(panel.interactionId);
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
            {panel.status === "generating" && (
              <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-primary/90 px-2 py-1 text-xs font-medium text-primary-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Generating...
              </div>
            )}
            {panel.status === "error" && (
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

"use client";

import {
  Plus,
  Minus,
  ArrowRight,
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EntityDiff {
  entityId: string;
  entityName: string;
  entityType: string;
  changeType: "added" | "modified" | "deleted" | "removed";
  changes: {
    field: string;
    oldValue?: string;
    newValue?: string;
  }[];
}

interface RelationshipDiff {
  relationshipId: string;
  changeType: "added" | "deleted" | "removed";
  sourceEntity: string;
  targetEntity: string;
  relationType: string;
}

interface DiffViewerProps {
  commitHash: string;
  entityDiffs: EntityDiff[];
  relationshipDiffs: RelationshipDiff[];
  onClose?: () => void;
}

const entityIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  object: Box,
  concept: Lightbulb,
  technology: Cpu,
};

const changeTypeColors: Record<string, string> = {
  added: "text-green-500 bg-green-500/10 border-green-500/30",
  modified: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  deleted: "text-red-500 bg-red-500/10 border-red-500/30",
  removed: "text-red-500 bg-red-500/10 border-red-500/30",
};

export function DiffViewer({
  commitHash,
  entityDiffs,
  relationshipDiffs,
  onClose,
}: DiffViewerProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-foreground">Commit Diff</h3>
          <code className="rounded bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
            {commitHash.slice(0, 7)}
          </code>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="divide-y divide-border">
        {/* Entity changes */}
        {entityDiffs.length > 0 && (
          <div className="p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Entity Changes ({entityDiffs.length})
            </h4>
            <div className="space-y-3">
              {entityDiffs.map((diff) => {
                const Icon = entityIcons[diff.entityType] || Box;
                return (
                  <div
                    key={diff.entityId}
                    className={cn(
                      "rounded-lg border p-3",
                      changeTypeColors[diff.changeType]
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {diff.changeType === "added" && <Plus className="h-4 w-4" />}
                      {diff.changeType === "deleted" && <Minus className="h-4 w-4" />}
                      {diff.changeType === "modified" && (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{diff.entityName}</span>
                      <span className="text-xs opacity-70 capitalize">
                        ({diff.entityType})
                      </span>
                    </div>

                    {diff.changes.length > 0 && (
                      <div className="mt-2 space-y-1 text-sm">
                        {diff.changes.map((change, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-muted-foreground min-w-20">
                              {change.field}:
                            </span>
                            <div className="flex-1">
                              {change.oldValue && (
                                <span className="line-through text-red-400/70 mr-2">
                                  {change.oldValue}
                                </span>
                              )}
                              {change.newValue && (
                                <span className="text-green-400">
                                  {change.newValue}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Relationship changes */}
        {relationshipDiffs.length > 0 && (
          <div className="p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Relationship Changes ({relationshipDiffs.length})
            </h4>
            <div className="space-y-2">
              {relationshipDiffs.map((diff) => (
                <div
                  key={diff.relationshipId}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2",
                    diff.changeType === "added"
                      ? "text-green-500 bg-green-500/10 border-green-500/30"
                      : "text-red-500 bg-red-500/10 border-red-500/30"
                  )}
                >
                  {diff.changeType === "added" ? (
                    <Plus className="h-4 w-4" />
                  ) : (
                    <Minus className="h-4 w-4" />
                  )}
                  <LinkIcon className="h-4 w-4" />
                  <span className="font-medium">{diff.sourceEntity}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted/50">
                    {diff.relationType}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{diff.targetEntity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {entityDiffs.length === 0 && relationshipDiffs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No changes in this commit</p>
          </div>
        )}
      </div>
    </div>
  );
}

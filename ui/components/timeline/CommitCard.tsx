"use client";

import {
  GitCommit,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Link as LinkIcon,
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Operation {
  type: "add" | "modify" | "delete" | "link" | "update" | "remove";
  entityType: string;
  entityName: string;
  details?: string;
}

interface Commit {
  id: string;
  hash: string;
  message: string;
  timestamp: string;
  branch: string;
  author: string;
  tags?: string[];
  operations: Operation[];
  metrics?: {
    entitiesChanged: number;
    relationshipsChanged: number;
    consistencyScore: number;
  };
}

interface CommitCardProps {
  commit: Commit;
  isSelected?: boolean;
  onClick?: () => void;
  showBranchLine?: boolean;
  isHead?: boolean;
}

const operationIcons: Record<string, typeof Plus> = {
  add: Plus,
  modify: Pencil,
  update: Pencil,
  delete: Trash2,
  remove: Trash2,
  link: LinkIcon,
};

const operationColors: Record<string, string> = {
  add: "text-green-500 bg-green-500/10",
  modify: "text-amber-500 bg-amber-500/10",
  update: "text-amber-500 bg-amber-500/10",
  delete: "text-red-500 bg-red-500/10",
  remove: "text-red-500 bg-red-500/10",
  link: "text-purple-500 bg-purple-500/10",
};

const entityIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  object: Box,
  concept: Lightbulb,
  technology: Cpu,
};

export function CommitCard({
  commit,
  isSelected,
  onClick,
  showBranchLine = true,
  isHead = false,
}: CommitCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex gap-4 cursor-pointer transition-colors",
        isSelected ? "bg-primary/5" : "hover:bg-muted/50"
      )}
    >
      {/* Branch line and commit dot */}
      <div className="relative flex flex-col items-center py-4 pl-4">
        {showBranchLine && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-primary/30" />
        )}
        <div
          className={cn(
            "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
            isHead
              ? "border-primary bg-primary text-primary-foreground"
              : isSelected
              ? "border-primary bg-primary/20 text-primary"
              : "border-border bg-card text-muted-foreground group-hover:border-primary/50"
          )}
        >
          <GitCommit className="h-4 w-4" />
        </div>
      </div>

      {/* Commit content */}
      <div className="flex-1 py-4 pr-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Message and tags */}
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-foreground truncate">
                {commit.message}
              </h4>
              {isHead && (
                <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  HEAD
                </span>
              )}
              {commit.tags?.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-secondary/20 px-1.5 py-0.5 text-[10px] font-medium text-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Metadata */}
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {commit.hash.slice(0, 7)}
              </code>
              <span>{commit.author}</span>
              <span>{commit.timestamp}</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                {commit.branch}
              </span>
            </div>

            {/* Operations summary */}
            <div className="mt-3 flex flex-wrap gap-2">
              {commit.operations.slice(0, 4).map((op, i) => {
                const OpIcon = operationIcons[op.type];
                const EntityIcon = entityIcons[op.entityType] || Box;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
                      operationColors[op.type]
                    )}
                  >
                    <OpIcon className="h-3 w-3" />
                    <EntityIcon className="h-3 w-3" />
                    <span className="max-w-24 truncate">{op.entityName}</span>
                  </div>
                );
              })}
              {commit.operations.length > 4 && (
                <span className="flex items-center text-xs text-muted-foreground">
                  +{commit.operations.length - 4} more
                </span>
              )}
            </div>
          </div>

          {/* Metrics */}
          {commit.metrics && (
            <div className="flex flex-col items-end gap-1 text-xs">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  {commit.metrics.entitiesChanged} entities
                </span>
                <span className="text-muted-foreground">
                  {commit.metrics.relationshipsChanged} relations
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Consistency:</span>
                <span
                  className={cn(
                    "font-medium",
                    commit.metrics.consistencyScore >= 0.9
                      ? "text-green-500"
                      : commit.metrics.consistencyScore >= 0.7
                      ? "text-amber-500"
                      : "text-red-500"
                  )}
                >
                  {Math.round(commit.metrics.consistencyScore * 100)}%
                </span>
              </div>
            </div>
          )}

          <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </div>
  );
}

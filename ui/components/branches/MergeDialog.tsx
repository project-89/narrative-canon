"use client";

import { useState } from "react";
import {
  X,
  GitMerge,
  GitBranch,
  ArrowRight,
  AlertTriangle,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MergeDialogProps {
  sourceBranch: {
    name: string;
    color?: string;
  };
  targetBranch: {
    name: string;
    color?: string;
  };
  hasConflicts: boolean;
  conflictCount?: number;
  onMerge: (strategy: "auto" | "manual") => void;
  onCancel: () => void;
}

export function MergeDialog({
  sourceBranch,
  targetBranch,
  hasConflicts,
  conflictCount = 0,
  onMerge,
  onCancel,
}: MergeDialogProps) {
  const [strategy, setStrategy] = useState<"auto" | "manual">("auto");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Merge Branches</h3>
          </div>
          <button
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Branch visualization */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
              <GitBranch className="h-4 w-4" style={{ color: sourceBranch.color }} />
              <span className="font-medium text-foreground">{sourceBranch.name}</span>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
              <GitBranch className="h-4 w-4" style={{ color: targetBranch.color }} />
              <span className="font-medium text-foreground">{targetBranch.name}</span>
            </div>
          </div>

          {/* Conflict warning */}
          {hasConflicts && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="font-medium text-amber-500">
                  {conflictCount} conflict{conflictCount !== 1 ? "s" : ""} detected
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  These branches have diverged and contain conflicting narrative changes.
                  Choose a merge strategy below.
                </p>
              </div>
            </div>
          )}

          {/* Merge strategy */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Merge Strategy
            </label>
            <div className="space-y-2">
              <button
                onClick={() => setStrategy("auto")}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                  strategy === "auto"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border",
                    strategy === "auto"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  )}
                >
                  {strategy === "auto" && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div>
                  <p className="font-medium text-foreground">Auto-merge</p>
                  <p className="text-sm text-muted-foreground">
                    Let the AI resolve conflicts automatically based on narrative coherence
                  </p>
                </div>
              </button>
              <button
                onClick={() => setStrategy("manual")}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                  strategy === "manual"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border",
                    strategy === "manual"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  )}
                >
                  {strategy === "manual" && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div>
                  <p className="font-medium text-foreground">Manual review</p>
                  <p className="text-sm text-muted-foreground">
                    Review and resolve each conflict manually
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border p-4">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => onMerge(strategy)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <GitMerge className="h-4 w-4" />
            Merge Branches
          </button>
        </div>
      </div>
    </div>
  );
}

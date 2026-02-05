"use client";

import {
  GitBranch,
  Check,
  MoreVertical,
  GitMerge,
  Trash2,
  Copy,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Branch {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isActive: boolean;
  isCanon: boolean;
  probability?: number;
  commitCount: number;
  lastCommit?: string;
  parentBranch?: string;
  createdAt?: string;
}

interface BranchListProps {
  branches: Branch[];
  selectedBranch: string | null;
  onSelectBranch: (branchId: string) => void;
  onCheckout: (branchId: string) => void;
  onMerge: (branchId: string) => void;
  onDelete: (branchId: string) => void;
}

export function BranchList({
  branches,
  selectedBranch,
  onSelectBranch,
  onCheckout,
  onMerge,
  onDelete,
}: BranchListProps) {
  return (
    <div className="divide-y divide-border">
      {branches.map((branch) => (
        <div
          key={branch.id}
          onClick={() => onSelectBranch(branch.id)}
          className={cn(
            "group flex items-center gap-4 p-4 cursor-pointer transition-colors",
            selectedBranch === branch.id ? "bg-primary/5" : "hover:bg-muted/50"
          )}
        >
          {/* Branch icon */}
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${branch.color}20` }}
          >
            <GitBranch className="h-5 w-5" style={{ color: branch.color }} />
          </div>

          {/* Branch info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-foreground">{branch.name}</h4>
              {branch.isActive && (
                <span className="flex items-center gap-1 rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
                  <Check className="h-3 w-3" />
                  HEAD
                </span>
              )}
              {branch.isCanon && (
                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  canon
                </span>
              )}
              {branch.probability !== undefined && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {Math.round(branch.probability * 100)}% likely
                </span>
              )}
            </div>
            {branch.description && (
              <p className="mt-0.5 text-sm text-muted-foreground truncate">
                {branch.description}
              </p>
            )}
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{branch.commitCount} commits</span>
              <span>•</span>
              <span>Last: {branch.lastCommit}</span>
              {branch.parentBranch && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    from {branch.parentBranch}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!branch.isActive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckout(branch.id);
                }}
                className="flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowRight className="h-3 w-3" />
                Checkout
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMerge(branch.id);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Merge"
            >
              <GitMerge className="h-4 w-4" />
            </button>
            {!branch.isCanon && !branch.isActive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(branch.id);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

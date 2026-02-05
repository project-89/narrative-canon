"use client";

import { cn } from "@/lib/utils";

interface Branch {
  name: string;
  color: string;
  commits: string[];
  parentBranch?: string;
  branchPoint?: string;
}

interface BranchGraphProps {
  branches: Branch[];
  currentCommit: string;
  onCommitClick?: (commitId: string) => void;
}

// Simple branch visualization showing branch structure
export function BranchGraph({ branches, currentCommit, onCommitClick }: BranchGraphProps) {
  const mainBranch = branches.find((b) => b.name === "main") || branches[0];
  const otherBranches = branches.filter((b) => b.name !== "main");

  return (
    <div className="relative">
      {/* Main branch line */}
      <div className="flex items-center gap-2">
        <div
          className="h-full w-1 rounded-full"
          style={{ backgroundColor: mainBranch?.color || "#22c55e" }}
        />
        <div className="flex flex-col gap-3 py-4">
          {mainBranch?.commits.map((commitId, index) => {
            const isHead = commitId === currentCommit;
            // Check if this is a branch point
            const branchingHere = otherBranches.filter(
              (b) => b.branchPoint === commitId
            );

            return (
              <div key={commitId} className="relative flex items-center gap-2">
                {/* Commit dot */}
                <button
                  onClick={() => onCommitClick?.(commitId)}
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-all",
                    isHead
                      ? "border-primary bg-primary scale-125"
                      : "border-border bg-card hover:border-primary hover:scale-110"
                  )}
                  style={{
                    borderColor: isHead ? undefined : mainBranch?.color,
                  }}
                />

                {/* Branch fork visualization */}
                {branchingHere.map((branch, bi) => (
                  <div
                    key={branch.name}
                    className="absolute left-6 flex items-center"
                    style={{ top: `${(bi + 1) * 16}px` }}
                  >
                    <svg
                      width="40"
                      height="20"
                      className="overflow-visible"
                    >
                      <path
                        d={`M0,0 Q20,0 20,10 Q20,20 40,20`}
                        fill="none"
                        stroke={branch.color}
                        strokeWidth="2"
                      />
                    </svg>
                    <div className="flex items-center gap-1 ml-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: branch.color }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {branch.name}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Commit label */}
                <code className="text-xs text-muted-foreground font-mono">
                  {commitId.slice(0, 7)}
                </code>
                {isHead && (
                  <span className="rounded bg-primary/20 px-1 py-0.5 text-[10px] font-medium text-primary">
                    HEAD
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

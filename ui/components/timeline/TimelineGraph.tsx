"use client";

import { useState, useEffect, useMemo } from "react";
import { GitBranch, GitCommit, ChevronRight, Clock, Zap, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface Commit {
  id: string;
  hash: string;
  message: string;
  timestamp: number;
  branch: string;
  author?: string;
  isHead?: boolean;
  operations?: Array<{
    type: string;
    entityType: string;
    entityName: string;
  }>;
}

interface Branch {
  name: string;
  color: string;
  isActive: boolean;
  isCanon: boolean;
  commits: Commit[];
}

interface TimelineGraphProps {
  onCommitSelect?: (commit: Commit) => void;
  onBranchCheckout?: (branchName: string) => void;
}

// Generate consistent color for branch
function getBranchColor(name: string, index: number): string {
  if (name === 'main' || name === 'convergent-timeline') return '#22c55e';
  const colors = ['#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6'];
  return colors[index % colors.length];
}

// Format timestamp
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TimelineGraph({ onCommitSelect, onBranchCheckout }: TimelineGraphProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        const [branchesRes, commitsRes] = await Promise.all([
          fetch("http://localhost:3088/api/narrative/git/branches"),
          fetch("http://localhost:3088/api/narrative/git/commits"),
        ]);

        const branchesData = await branchesRes.json();
        const commitsData = await commitsRes.json();

        // Group commits by branch
        const branchMap = new Map<string, Commit[]>();
        commitsData.forEach((c: Commit) => {
          const branch = c.branch || 'main';
          if (!branchMap.has(branch)) branchMap.set(branch, []);
          branchMap.get(branch)!.push(c);
        });

        // Build branch objects
        const branchObjects: Branch[] = branchesData.map((b: any, i: number) => ({
          name: b.name,
          color: getBranchColor(b.name, i),
          isActive: b.isActive,
          isCanon: b.isCanon,
          commits: branchMap.get(b.name) || [],
        }));

        setBranches(branchObjects);
        setCommits(commitsData);
      } catch (err) {
        console.error("Error fetching timeline data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Find the main/canon branch
  const mainBranch = branches.find(b => b.name === 'main' || b.name === 'convergent-timeline') || branches[0];
  const otherBranches = branches.filter(b => b !== mainBranch);

  // Calculate branch positions for visualization
  const branchLanes = useMemo(() => {
    const lanes: Record<string, number> = {};
    if (mainBranch) lanes[mainBranch.name] = 0;
    otherBranches.forEach((b, i) => {
      lanes[b.name] = i + 1;
    });
    return lanes;
  }, [mainBranch, otherBranches]);

  const handleCommitClick = (commit: Commit) => {
    setSelectedCommit(commit);
    onCommitSelect?.(commit);
  };

  const handleCheckout = async (branchName: string) => {
    try {
      await fetch("http://localhost:3088/api/narrative/git/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: branchName }),
      });
      onBranchCheckout?.(branchName);
      // Refresh
      window.location.reload();
    } catch (err) {
      console.error("Error checking out:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading timeline...</div>
      </div>
    );
  }

  const LANE_WIDTH = 32;
  const COMMIT_HEIGHT = 80;
  const totalWidth = (Object.keys(branchLanes).length) * LANE_WIDTH + 400;

  return (
    <div className="relative overflow-x-auto">
      {/* Branch legend */}
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-border">
        {branches.map((branch) => (
          <button
            key={branch.name}
            onClick={() => handleCheckout(branch.name)}
            onMouseEnter={() => setHoveredBranch(branch.name)}
            onMouseLeave={() => setHoveredBranch(null)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all",
              branch.isActive
                ? "bg-primary/20 text-primary ring-2 ring-primary/50"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: branch.color }}
            />
            <span className="font-medium">{branch.name}</span>
            {branch.isActive && (
              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                HEAD
              </span>
            )}
            {branch.isCanon && (
              <span className="text-[10px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded">
                canon
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Git graph visualization */}
      <div className="relative" style={{ minWidth: totalWidth }}>
        {/* SVG for branch lines */}
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: LANE_WIDTH * branches.length + 20,
            height: commits.length * COMMIT_HEIGHT + 40,
          }}
        >
          {/* Draw branch lines */}
          {branches.map((branch, branchIndex) => {
            const x = branchLanes[branch.name] * LANE_WIDTH + 16;
            const branchCommits = commits.filter(c => c.branch === branch.name);

            if (branchCommits.length === 0) return null;

            // Find where this branch starts (index in commits array)
            const firstCommitIndex = commits.findIndex(c => c.id === branchCommits[0]?.id);
            const lastCommitIndex = commits.findIndex(c => c.id === branchCommits[branchCommits.length - 1]?.id);

            // Draw vertical line for this branch
            const startY = firstCommitIndex * COMMIT_HEIGHT + 20;
            const endY = lastCommitIndex * COMMIT_HEIGHT + 20;

            // If not main branch, draw a curve from main to this branch
            const isMainBranch = branch === mainBranch;

            return (
              <g key={branch.name}>
                {/* Branch line */}
                <line
                  x1={x}
                  y1={startY}
                  x2={x}
                  y2={endY}
                  stroke={branch.color}
                  strokeWidth={hoveredBranch === branch.name ? 4 : 2}
                  strokeLinecap="round"
                  className="transition-all"
                />

                {/* Fork curve from main branch */}
                {!isMainBranch && mainBranch && firstCommitIndex > 0 && (
                  <path
                    d={`M ${16} ${startY - 20}
                        Q ${16} ${startY} ${x} ${startY}`}
                    fill="none"
                    stroke={branch.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Commit nodes and messages */}
        <div className="relative" style={{ marginLeft: branches.length * LANE_WIDTH + 20 }}>
          {commits.map((commit, index) => {
            const branch = branches.find(b => b.name === commit.branch) || mainBranch;
            const laneX = branchLanes[commit.branch || 'main'] * LANE_WIDTH + 16;
            const isSelected = selectedCommit?.id === commit.id;

            return (
              <div
                key={commit.id}
                className="relative flex items-start gap-4"
                style={{ height: COMMIT_HEIGHT }}
              >
                {/* Commit dot (positioned absolutely on the lane) */}
                <button
                  onClick={() => handleCommitClick(commit)}
                  className={cn(
                    "absolute w-6 h-6 rounded-full border-4 transition-all z-10",
                    "hover:scale-125 hover:shadow-lg",
                    isSelected && "ring-4 ring-primary/50 scale-125"
                  )}
                  style={{
                    left: laneX - branches.length * LANE_WIDTH - 32,
                    top: 8,
                    backgroundColor: commit.isHead ? branch?.color : '#1a1a2e',
                    borderColor: branch?.color,
                  }}
                  title={`Checkout ${commit.hash}`}
                >
                  {commit.isHead && (
                    <div className="absolute inset-0 rounded-full animate-ping opacity-50"
                      style={{ backgroundColor: branch?.color }}
                    />
                  )}
                </button>

                {/* Commit info */}
                <div
                  className={cn(
                    "flex-1 p-3 rounded-lg border transition-all cursor-pointer",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card/50 hover:bg-card hover:border-primary/50"
                  )}
                  onClick={() => handleCommitClick(commit)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-muted-foreground">
                          {commit.hash}
                        </code>
                        {commit.isHead && (
                          <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                            HEAD
                          </span>
                        )}
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${branch?.color}20`,
                            color: branch?.color,
                          }}
                        >
                          {commit.branch}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-foreground font-medium truncate">
                        {commit.message.split('\n')[0]}
                      </p>
                      {commit.operations && commit.operations.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {commit.operations.slice(0, 3).map((op, i) => (
                            <span
                              key={i}
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded",
                                op.type === 'add' && "bg-green-500/20 text-green-500",
                                op.type === 'update' && "bg-amber-500/20 text-amber-500",
                                op.type === 'remove' && "bg-red-500/20 text-red-500"
                              )}
                            >
                              {op.type} {op.entityName}
                            </span>
                          ))}
                          {commit.operations.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{commit.operations.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatTime(commit.timestamp)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected commit detail panel */}
      {selectedCommit && (
        <div className="fixed bottom-4 right-4 w-96 p-4 rounded-xl border border-primary/50 bg-card shadow-2xl shadow-primary/20 z-50">
          <div className="flex items-start justify-between mb-3">
            <div>
              <code className="text-xs font-mono text-primary">{selectedCommit.hash}</code>
              <h3 className="font-semibold text-foreground mt-1">
                {selectedCommit.message.split('\n')[0]}
              </h3>
            </div>
            <button
              onClick={() => setSelectedCommit(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              &times;
            </button>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitBranch className="w-4 h-4" />
              <span>Branch: {selectedCommit.branch}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{new Date(selectedCommit.timestamp).toLocaleString()}</span>
            </div>
          </div>

          {selectedCommit.operations && selectedCommit.operations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Changes:</p>
              <div className="space-y-1">
                {selectedCommit.operations.map((op, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      op.type === 'add' && "bg-green-500",
                      op.type === 'update' && "bg-amber-500",
                      op.type === 'remove' && "bg-red-500"
                    )} />
                    <span className="text-foreground">{op.entityName}</span>
                    <span className="text-muted-foreground">({op.entityType})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => handleCheckout(selectedCommit.branch)}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Travel to Timeline
            </button>
            <button className="flex items-center justify-center gap-2 border border-border bg-card rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted transition-colors">
              <Eye className="w-4 h-4" />
              View Diff
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

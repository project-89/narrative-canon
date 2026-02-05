"use client";

import { useState, useEffect } from "react";
import {
  GitCommit,
  GitBranch,
  Filter,
  Search,
  Calendar,
  Tag,
  ChevronDown,
  RefreshCw,
  Loader2,
  LayoutGrid,
  GitGraph,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommitCard } from "@/components/timeline/CommitCard";
import { DiffViewer } from "@/components/timeline/DiffViewer";
import { TimelineGraph } from "@/components/timeline/TimelineGraph";

interface Commit {
  id: string;
  hash: string;
  message: string;
  timestamp: number;
  branch: string;
  author: string;
  tags: string[];
  isHead: boolean;
  operations: Array<{
    type: "add" | "update" | "remove" | "link";
    entityType: string;
    entityName: string;
  }>;
  metrics: {
    entitiesChanged: number;
    relationshipsChanged: number;
    consistencyScore: number;
  };
}

interface Branch {
  id: string;
  name: string;
  isActive: boolean;
  isCanon: boolean;
  commitCount: number;
  color?: string;
}

interface EntityDiff {
  entityId: string;
  entityName: string;
  entityType: string;
  changeType: "added" | "modified" | "removed";
  changes: Array<{
    field: string;
    oldValue?: string;
    newValue?: string;
  }>;
}

interface RelationshipDiff {
  relationshipId: string;
  changeType: "added" | "removed";
  sourceEntity: string;
  targetEntity: string;
  relationType: string;
}

interface CommitDiff {
  commit: any;
  entityDiffs: EntityDiff[];
  relationshipDiffs: RelationshipDiff[];
}

// Generate color for branch based on name
function getBranchColor(name: string): string {
  if (name === 'main' || name === 'convergent-timeline') return '#22c55e';
  const colors = ['#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function TimelinePage() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<CommitDiff | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "graph">("graph");

  // Fetch commits and branches
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const [commitsRes, branchesRes] = await Promise.all([
          fetch("http://localhost:3088/api/narrative/git/commits"),
          fetch("http://localhost:3088/api/narrative/git/branches")
        ]);

        if (!commitsRes.ok || !branchesRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const commitsData = await commitsRes.json();
        const branchesData = await branchesRes.json();

        setCommits(commitsData);
        setBranches(branchesData.map((b: Branch) => ({
          ...b,
          color: getBranchColor(b.name)
        })));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
        console.error("Error fetching timeline data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Fetch diff when commit is selected
  useEffect(() => {
    async function fetchDiff() {
      if (!selectedCommit) {
        setSelectedDiff(null);
        return;
      }

      setIsDiffLoading(true);
      try {
        const res = await fetch(`http://localhost:3088/api/narrative/git/commit/${selectedCommit}`);
        if (res.ok) {
          const diffData = await res.json();
          setSelectedDiff(diffData);
        }
      } catch (err) {
        console.error("Error fetching commit diff:", err);
      } finally {
        setIsDiffLoading(false);
      }
    }
    fetchDiff();
  }, [selectedCommit]);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const [commitsRes, branchesRes] = await Promise.all([
        fetch("http://localhost:3088/api/narrative/git/commits"),
        fetch("http://localhost:3088/api/narrative/git/branches")
      ]);
      if (commitsRes.ok && branchesRes.ok) {
        setCommits(await commitsRes.json());
        const branchesData = await branchesRes.json();
        setBranches(branchesData.map((b: Branch) => ({
          ...b,
          color: getBranchColor(b.name)
        })));
      }
    } catch (err) {
      console.error("Error refreshing:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCommits = commits.filter((commit) => {
    const matchesBranch = selectedBranch === "all" || commit.branch === selectedBranch;
    const matchesSearch =
      commit.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      commit.hash.includes(searchQuery);
    return matchesBranch && matchesSearch;
  });

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading timeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <GitCommit className="h-12 w-12 text-red-500/50" />
        <h3 className="mt-4 font-semibold text-red-500">Error loading timeline</h3>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button
          onClick={handleRefresh}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search commits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-lg border border-border bg-muted/50 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Branch filter */}
          <div className="relative">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="h-9 appearance-none rounded-lg border border-border bg-muted/50 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Filter button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
              showFilters
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-border bg-muted/50">
            <button
              onClick={() => setViewMode("graph")}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-l-lg px-3 text-sm transition-colors",
                viewMode === "graph"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <GitGraph className="h-4 w-4" />
              Graph
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-r-lg px-3 text-sm transition-colors",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              List
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date Range</label>
              <div className="mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">All time</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tags</label>
              <div className="mt-1 flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">All tags</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Author</label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">All authors</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Branch overview */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedBranch("all")}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            selectedBranch === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <GitCommit className="h-4 w-4" />
          All Commits
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {commits.length}
          </span>
        </button>
        {branches.map((branch) => (
          <button
            key={branch.id}
            onClick={() => setSelectedBranch(branch.name)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              selectedBranch === branch.name
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <GitBranch className="h-4 w-4" style={{ color: branch.color }} />
            {branch.name}
            {branch.isActive && (
              <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-500">
                HEAD
              </span>
            )}
            {branch.isCanon && (
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                canon
              </span>
            )}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {branch.commitCount}
            </span>
          </button>
        ))}
      </div>

      {/* Main content - Graph or List view */}
      {viewMode === "graph" ? (
        <div className="rounded-xl border border-border bg-card p-6 overflow-hidden">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Timeline Graph</h3>
            <p className="text-sm text-muted-foreground">
              Visual representation of narrative branches and commits. Click branches to travel between timelines.
            </p>
          </div>
          <TimelineGraph
            onCommitSelect={(commit) => setSelectedCommit(commit.id)}
            onBranchCheckout={(branch) => {
              console.log("Checked out:", branch);
              handleRefresh();
            }}
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Commit list */}
          <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Commit History</h3>
              <p className="text-sm text-muted-foreground">
                {filteredCommits.length} commits
              </p>
            </div>
            {filteredCommits.length > 0 ? (
              <div className="divide-y divide-border">
                {filteredCommits.map((commit, index) => (
                  <CommitCard
                    key={commit.id}
                    commit={{
                      ...commit,
                      timestamp: formatTime(commit.timestamp)
                    }}
                    isSelected={selectedCommit === commit.id}
                    onClick={() => setSelectedCommit(commit.id)}
                    isHead={commit.isHead}
                    showBranchLine={true}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <GitCommit className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 font-semibold text-foreground">No commits found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {searchQuery
                    ? "Try adjusting your search"
                    : "Play the game to create narrative commits"}
                </p>
              </div>
            )}
          </div>

          {/* Diff viewer / details panel */}
          <div className="lg:col-span-2">
            {selectedCommit ? (
              isDiffLoading ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                  <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
                  <p className="mt-4 text-sm text-muted-foreground">Loading diff...</p>
                </div>
              ) : selectedDiff ? (
                <DiffViewer
                  commitHash={selectedDiff.commit?.hash || ""}
                  entityDiffs={selectedDiff.entityDiffs}
                  relationshipDiffs={selectedDiff.relationshipDiffs}
                  onClose={() => setSelectedCommit(null)}
                />
              ) : (
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                  <GitCommit className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 font-semibold text-foreground">No diff data</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This commit has no recorded changes
                  </p>
                </div>
              )
            ) : (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <GitCommit className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 font-semibold text-foreground">Select a Commit</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Click on a commit to view its diff and details
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

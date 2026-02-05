"use client";

import { useState, useEffect } from "react";
import {
  GitBranch,
  Plus,
  Search,
  GitCompare,
  BarChart3,
  Clock,
  Users,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BranchList } from "@/components/branches/BranchList";
import { MergeDialog } from "@/components/branches/MergeDialog";

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

// Generate color for branch based on name
function getBranchColor(name: string, isCanon: boolean): string {
  if (isCanon || name === 'main' || name === 'convergent-timeline') return '#22c55e';
  const colors = ['#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Format time for display
function formatTime(timestamp?: number): string {
  if (!timestamp) return "Unknown";
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
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergingBranch, setMergingBranch] = useState<string | null>(null);
  const [showNewBranchForm, setShowNewBranchForm] = useState(false);

  // Fetch branches from API
  useEffect(() => {
    async function fetchBranches() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("http://localhost:3088/api/narrative/git/branches");
        if (!res.ok) throw new Error("Failed to fetch branches");
        const data = await res.json();

        // Transform and enhance branch data
        const enhancedBranches: Branch[] = data.map((b: any) => ({
          id: b.id || b.name,
          name: b.name,
          description: b.description || `Timeline branch: ${b.name}`,
          color: getBranchColor(b.name, b.isCanon),
          isActive: b.isActive || false,
          isCanon: b.isCanon || false,
          probability: b.probability,
          commitCount: b.commitCount || 0,
          lastCommit: formatTime(b.lastCommitTimestamp),
          parentBranch: b.parentBranch,
          createdAt: formatTime(b.createdAt),
        }));

        setBranches(enhancedBranches);

        // Auto-select active branch
        const activeBranch = enhancedBranches.find(b => b.isActive);
        if (activeBranch && !selectedBranch) {
          setSelectedBranch(activeBranch.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch branches");
        console.error("Error fetching branches:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchBranches();
  }, []);

  const selectedBranchData = branches.find((b) => b.id === selectedBranch);
  const activeBranch = branches.find((b) => b.isActive);

  const filteredBranches = branches.filter((branch) =>
    branch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate stats
  const canonBranches = branches.filter(b => b.isCanon).length;
  const altTimelines = branches.filter(b => !b.isCanon).length;
  const totalCommits = branches.reduce((sum, b) => sum + b.commitCount, 0);

  const handleMerge = (branchId: string) => {
    setMergingBranch(branchId);
    setShowMergeDialog(true);
  };

  const handleCheckout = async (branchId: string) => {
    try {
      const res = await fetch("http://localhost:3088/api/narrative/git/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: branchId }),
      });
      if (res.ok) {
        // Refresh branches
        const branchesRes = await fetch("http://localhost:3088/api/narrative/git/branches");
        if (branchesRes.ok) {
          const data = await branchesRes.json();
          const enhancedBranches: Branch[] = data.map((b: any) => ({
            id: b.id || b.name,
            name: b.name,
            description: b.description || `Timeline branch: ${b.name}`,
            color: getBranchColor(b.name, b.isCanon),
            isActive: b.isActive || false,
            isCanon: b.isCanon || false,
            probability: b.probability,
            commitCount: b.commitCount || 0,
            lastCommit: formatTime(b.lastCommitTimestamp),
            parentBranch: b.parentBranch,
            createdAt: formatTime(b.createdAt),
          }));
          setBranches(enhancedBranches);
        }
      }
    } catch (err) {
      console.error("Error checking out branch:", err);
    }
  };

  const handleMergeConfirm = async (strategy: "auto" | "manual") => {
    console.log(`Merging with strategy: ${strategy}`);
    // TODO: Implement actual merge API call
    setShowMergeDialog(false);
    setMergingBranch(null);
  };

  const handleDelete = async (branchId: string) => {
    // TODO: Implement delete API call
    console.log("Delete:", branchId);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading branches...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <GitBranch className="h-12 w-12 text-red-500/50" />
        <h3 className="mt-4 font-semibold text-red-500">Error loading branches</h3>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-lg border border-border bg-muted/50 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <GitCompare className="h-4 w-4" />
            Compare
          </button>
          <button
            onClick={() => setShowNewBranchForm(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Branch
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{branches.length}</p>
              <p className="text-xs text-muted-foreground">Total Branches</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{canonBranches}</p>
              <p className="text-xs text-muted-foreground">Canon Timeline</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{altTimelines}</p>
              <p className="text-xs text-muted-foreground">Alt Timelines</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalCommits}</p>
              <p className="text-xs text-muted-foreground">Total Commits</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Branch list */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border p-4">
            <h3 className="font-semibold text-foreground">Timeline Branches</h3>
            <p className="text-sm text-muted-foreground">
              Manage alternate narrative timelines
            </p>
          </div>
          {filteredBranches.length > 0 ? (
            <BranchList
              branches={filteredBranches}
              selectedBranch={selectedBranch}
              onSelectBranch={setSelectedBranch}
              onCheckout={handleCheckout}
              onMerge={handleMerge}
              onDelete={handleDelete}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <GitBranch className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold text-foreground">No branches found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {searchQuery
                  ? "Try adjusting your search"
                  : "Create narrative commits to generate timeline branches"}
              </p>
            </div>
          )}
        </div>

        {/* Branch details */}
        <div className="space-y-6">
          {selectedBranchData ? (
            <>
              {/* Branch info card */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${selectedBranchData.color}20` }}
                  >
                    <GitBranch
                      className="h-6 w-6"
                      style={{ color: selectedBranchData.color }}
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">
                      {selectedBranchData.name}
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedBranchData.isCanon && (
                        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          canon
                        </span>
                      )}
                      {selectedBranchData.isActive && (
                        <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
                          HEAD
                        </span>
                      )}
                      {selectedBranchData.probability !== undefined && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {Math.round(selectedBranchData.probability * 100)}% prob
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {selectedBranchData.description && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {selectedBranchData.description}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Commits</p>
                    <p className="font-medium text-foreground">
                      {selectedBranchData.commitCount}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Last Update</p>
                    <p className="font-medium text-foreground">
                      {selectedBranchData.lastCommit || "Unknown"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="font-medium text-foreground">
                      {selectedBranchData.createdAt || "Unknown"}
                    </p>
                  </div>
                  {selectedBranchData.parentBranch && (
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Parent</p>
                      <p className="font-medium text-foreground">
                        {selectedBranchData.parentBranch}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  {!selectedBranchData.isActive && (
                    <button
                      onClick={() => handleCheckout(selectedBranchData.id)}
                      className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Checkout
                    </button>
                  )}
                  <button className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                    View Diff
                  </button>
                </div>
              </div>

              {/* Probability visualization */}
              {selectedBranchData.probability !== undefined && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h4 className="text-sm font-medium text-foreground mb-3">
                    Timeline Probability
                  </h4>
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${selectedBranchData.probability * 100}%`,
                          backgroundColor: selectedBranchData.color,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This timeline has a {Math.round(selectedBranchData.probability * 100)}%
                      probability of becoming canon based on narrative coherence metrics.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <GitBranch className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold text-foreground">Select a Branch</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Click on a branch to view its details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Merge dialog */}
      {showMergeDialog && mergingBranch && (
        <MergeDialog
          sourceBranch={branches.find((b) => b.id === mergingBranch) || { name: "", color: "" }}
          targetBranch={activeBranch || { name: "main", color: "#22c55e" }}
          hasConflicts={true}
          conflictCount={2}
          onMerge={handleMergeConfirm}
          onCancel={() => {
            setShowMergeDialog(false);
            setMergingBranch(null);
          }}
        />
      )}
    </div>
  );
}

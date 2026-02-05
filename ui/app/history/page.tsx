"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  GitBranch,
  GitCommit,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  Calendar,
  BookOpen,
  Users,
  MapPin,
  Sparkles,
  ArrowRight,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  description?: string;
  color: string;
  isActive: boolean;
  isCanon: boolean;
  probability?: number;
  commitCount: number;
  lastCommitTimestamp?: number;
}

interface TimelineEvent {
  id: string;
  type: "commit" | "branch_created" | "branch_merged";
  timestamp: number;
  branch: string;
  branchColor: string;
  commit?: Commit;
  description: string;
  isHead?: boolean;
}

// Generate color for branch based on name
function getBranchColor(name: string, isCanon?: boolean): string {
  if (isCanon || name === 'main' || name === 'convergent-timeline') return '#22c55e';
  const colors = ['#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Format timestamp
function formatTime(timestamp: number): string {
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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function HistoryPage() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const [commitsRes, branchesRes] = await Promise.all([
          fetch("http://localhost:3088/api/narrative/git/commits"),
          fetch("http://localhost:3088/api/narrative/git/branches"),
        ]);

        if (!commitsRes.ok || !branchesRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const commitsData = await commitsRes.json();
        const branchesData = await branchesRes.json();

        setCommits(commitsData);
        setBranches(branchesData.map((b: any) => ({
          ...b,
          color: getBranchColor(b.name, b.isCanon),
        })));

        // Expand today by default
        const today = new Date().toDateString();
        setExpandedDays(new Set([today]));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
        console.error("Error fetching history:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Create timeline events from commits
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    commits.forEach((commit) => {
      const branch = branches.find(b => b.name === commit.branch);
      events.push({
        id: commit.id,
        type: "commit",
        timestamp: commit.timestamp,
        branch: commit.branch,
        branchColor: branch?.color || getBranchColor(commit.branch),
        commit,
        description: commit.message,
        isHead: commit.isHead,
      });
    });

    // Sort by timestamp descending
    events.sort((a, b) => b.timestamp - a.timestamp);
    return events;
  }, [commits, branches]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return timelineEvents.filter((event) => {
      const matchesBranch = selectedBranch === "all" || event.branch === selectedBranch;
      const matchesSearch =
        event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.branch.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesBranch && matchesSearch;
    });
  }, [timelineEvents, selectedBranch, searchQuery]);

  // Group events by day
  const eventsByDay = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();

    filteredEvents.forEach((event) => {
      const dayKey = new Date(event.timestamp).toDateString();
      if (!groups.has(dayKey)) {
        groups.set(dayKey, []);
      }
      groups.get(dayKey)!.push(event);
    });

    return Array.from(groups.entries())
      .map(([day, events]) => ({ day, events }))
      .sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime());
  }, [filteredEvents]);

  const toggleDay = (day: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const handleCheckout = async (branchName: string) => {
    try {
      const res = await fetch("http://localhost:3088/api/narrative/git/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: branchName }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error("Error checking out:", err);
    }
  };

  // Stats
  const activeBranch = branches.find(b => b.isActive);
  const totalEvents = filteredEvents.length;
  const branchCount = branches.length;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading narrative history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clock className="h-12 w-12 text-red-500/50" />
        <h3 className="mt-4 font-semibold text-red-500">Error loading history</h3>
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Narrative History</h1>
        <p className="text-sm text-muted-foreground">
          Chronicle of your story's evolution across all timelines
        </p>
      </div>

      {/* Current timeline indicator */}
      {activeBranch && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${activeBranch.color}20` }}
              >
                <GitBranch className="h-5 w-5" style={{ color: activeBranch.color }} />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  Currently on: <span style={{ color: activeBranch.color }}>{activeBranch.name}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {activeBranch.commitCount} commits
                  {activeBranch.isCanon && " · Canon timeline"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {branches.filter(b => !b.isActive).length > 0 && (
                <select
                  onChange={(e) => e.target.value && handleCheckout(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                  defaultValue=""
                >
                  <option value="" disabled>Switch timeline...</option>
                  {branches.filter(b => !b.isActive).map(b => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-lg border border-border bg-muted/50 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="relative">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="h-9 appearance-none rounded-lg border border-border bg-muted/50 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All timelines</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {totalEvents} events across {branchCount} timelines
        </div>
      </div>

      {/* Branch pills */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedBranch("all")}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            selectedBranch === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Clock className="h-4 w-4" />
          All History
        </button>
        {branches.map((branch) => (
          <button
            key={branch.id}
            onClick={() => setSelectedBranch(branch.name)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              selectedBranch === branch.name
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: branch.color }}
            />
            {branch.name}
            {branch.isActive && (
              <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-500">
                HEAD
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {eventsByDay.length > 0 ? (
            eventsByDay.map(({ day, events }) => (
              <div key={day} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Day header */}
                <button
                  onClick={() => toggleDay(day)}
                  className="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedDays.has(day) ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <Calendar className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <p className="font-medium text-foreground">
                        {new Date(day).toDateString() === new Date().toDateString()
                          ? "Today"
                          : formatDate(new Date(day).getTime())}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {events.length} event{events.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex -space-x-1">
                    {Array.from(new Set(events.map(e => e.branchColor))).slice(0, 5).map((color, i) => (
                      <div
                        key={i}
                        className="h-4 w-4 rounded-full border-2 border-card"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </button>

                {/* Day events */}
                {expandedDays.has(day) && (
                  <div className="border-t border-border">
                    {events.map((event, index) => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className={cn(
                          "w-full text-left p-4 transition-colors hover:bg-muted/50",
                          selectedEvent?.id === event.id && "bg-muted/50",
                          index !== events.length - 1 && "border-b border-border"
                        )}
                      >
                        <div className="flex gap-4">
                          {/* Timeline indicator */}
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full",
                                event.isHead ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""
                              )}
                              style={{ backgroundColor: `${event.branchColor}20` }}
                            >
                              <GitCommit className="h-4 w-4" style={{ color: event.branchColor }} />
                            </div>
                            {index !== events.length - 1 && (
                              <div className="w-0.5 flex-1 bg-border mt-2" />
                            )}
                          </div>

                          {/* Event content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-foreground line-clamp-2">
                                {event.description}
                              </p>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatTime(event.timestamp)}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span
                                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                                style={{
                                  backgroundColor: `${event.branchColor}20`,
                                  color: event.branchColor,
                                }}
                              >
                                <GitBranch className="h-3 w-3" />
                                {event.branch}
                              </span>

                              {event.commit?.operations && event.commit.operations.length > 0 && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Sparkles className="h-3 w-3" />
                                  {event.commit.operations.length} changes
                                </span>
                              )}

                              {event.isHead && (
                                <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
                                  HEAD
                                </span>
                              )}
                            </div>

                            {/* Operations preview */}
                            {event.commit?.operations && event.commit.operations.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {event.commit.operations.slice(0, 3).map((op, i) => (
                                  <span
                                    key={i}
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[10px]",
                                      op.type === "add" && "bg-green-500/20 text-green-500",
                                      op.type === "update" && "bg-amber-500/20 text-amber-500",
                                      op.type === "remove" && "bg-red-500/20 text-red-500",
                                      op.type === "link" && "bg-cyan-500/20 text-cyan-500"
                                    )}
                                  >
                                    {op.type}: {op.entityName}
                                  </span>
                                ))}
                                {event.commit.operations.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{event.commit.operations.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-medium text-foreground">No history yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {searchQuery || selectedBranch !== "all"
                  ? "Try adjusting your search or filter"
                  : "Import lore or generate content to create narrative history"}
              </p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedEvent ? (
            <div className="rounded-xl border border-border bg-card sticky top-6">
              <div className="border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${selectedEvent.branchColor}20` }}
                  >
                    <GitCommit className="h-4 w-4" style={{ color: selectedEvent.branchColor }} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(selectedEvent.timestamp)}
                    </p>
                    <p className="text-xs" style={{ color: selectedEvent.branchColor }}>
                      {selectedEvent.branch}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <h3 className="font-semibold text-foreground">{selectedEvent.description}</h3>
                  {selectedEvent.commit?.hash && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {selectedEvent.commit.hash.slice(0, 8)}
                    </p>
                  )}
                </div>

                {/* Operations */}
                {selectedEvent.commit?.operations && selectedEvent.commit.operations.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Changes</p>
                    <div className="space-y-2">
                      {selectedEvent.commit.operations.map((op, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-lg bg-muted/50 p-2"
                        >
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-xs font-medium",
                              op.type === "add" && "bg-green-500/20 text-green-500",
                              op.type === "update" && "bg-amber-500/20 text-amber-500",
                              op.type === "remove" && "bg-red-500/20 text-red-500",
                              op.type === "link" && "bg-cyan-500/20 text-cyan-500"
                            )}
                          >
                            {op.type}
                          </span>
                          <span className="text-sm text-foreground">{op.entityName}</span>
                          <span className="text-xs text-muted-foreground capitalize">
                            ({op.entityType})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metrics */}
                {selectedEvent.commit?.metrics && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Entities</p>
                      <p className="font-medium text-foreground">
                        {selectedEvent.commit.metrics.entitiesChanged}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Relations</p>
                      <p className="font-medium text-foreground">
                        {selectedEvent.commit.metrics.relationshipsChanged}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t border-border space-y-2">
                  {!selectedEvent.isHead && (
                    <button
                      onClick={() => handleCheckout(selectedEvent.branch)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Play className="h-4 w-4" />
                      Travel to Timeline
                    </button>
                  )}
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                    <BookOpen className="h-4 w-4" />
                    View Full Diff
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold text-foreground">Select an Event</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Click on a history event to view details and travel to that timeline
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

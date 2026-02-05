"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Users,
  Network,
  GitCommit,
  GitBranch,
  MessageCircle,
  Image,
  Clock,
  Loader2,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
  PenTool,
  Download,
  ListTree,
  Globe,
  Sparkles,
  ArrowRight,
  Film,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NarrativeStatus {
  currentBranch: string;
  head: string;
  clean: boolean;
  entities: number;
  relationships: number;
  branches: number;
  commits: number;
}

interface Entity {
  id: string;
  name: string;
  type: string;
}

interface Commit {
  id: string;
  hash: string;
  message: string;
  timestamp: number;
  branch: string;
  operations?: any[];
}

interface Branch {
  id: string;
  name: string;
  isActive: boolean;
  isCanon: boolean;
  commitCount: number;
}

const typeIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  object: Box,
  concept: Lightbulb,
  technology: Cpu,
};

const typeColors: Record<string, string> = {
  character: "text-cyan-400 bg-cyan-400/10",
  location: "text-green-400 bg-green-400/10",
  organization: "text-purple-400 bg-purple-400/10",
  object: "text-amber-400 bg-amber-400/10",
  concept: "text-pink-400 bg-pink-400/10",
  technology: "text-blue-400 bg-blue-400/10",
};

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

function getBranchColor(name: string, isCanon: boolean): string {
  if (isCanon || name === "main" || name === "convergent-timeline") return "#22c55e";
  const colors = ["#8b5cf6", "#ef4444", "#f59e0b", "#06b6d4", "#ec4899"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function ProjectDashboard() {
  const params = useParams();
  const projectId = params.projectId as string;
  const basePath = `/p/${projectId}`;

  const [status, setStatus] = useState<NarrativeStatus | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectName, setProjectName] = useState<string>("");

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch project info
        const projectRes = await fetch(`http://localhost:3088/api/projects/${projectId}`);
        if (projectRes.ok) {
          const project = await projectRes.json();
          setProjectName(project.name);
        }

        // Fetch narrative data
        const [statusRes, entitiesRes, commitsRes, branchesRes] = await Promise.all([
          fetch("http://localhost:3088/api/narrative/status"),
          fetch("http://localhost:3088/api/narrative/entities"),
          fetch("http://localhost:3088/api/narrative/git/commits"),
          fetch("http://localhost:3088/api/narrative/git/branches"),
        ]);

        if (statusRes.ok) setStatus(await statusRes.json());
        if (entitiesRes.ok) setEntities(await entitiesRes.json());
        if (commitsRes.ok) setCommits(await commitsRes.json());
        if (branchesRes.ok) setBranches(await branchesRes.json());
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [projectId]);

  const activeBranch = branches.find((b) => b.isActive);

  const entityBreakdown = entities.reduce((acc, entity) => {
    acc[entity.type] = (acc[entity.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Primary creation actions (project-scoped)
  const createActions = [
    {
      name: "Ask the Canon",
      description: "Query your narrative with natural language",
      icon: MessageCircle,
      href: `${basePath}/chat`,
      gradient: "from-cyan-500 to-blue-500",
      badge: "AI",
    },
    {
      name: "Write Content",
      description: "Generate grounded narrative content",
      icon: PenTool,
      href: `${basePath}/write`,
      gradient: "from-purple-500 to-pink-500",
      badge: "AI",
    },
    {
      name: "Import Lore",
      description: "Extract entities from existing text",
      icon: Download,
      href: `${basePath}/import`,
      gradient: "from-amber-500 to-orange-500",
      badge: "AI",
    },
    {
      name: "Plan Story",
      description: "Design arcs and story beats",
      icon: ListTree,
      href: `${basePath}/plan`,
      gradient: "from-green-500 to-emerald-500",
      badge: null,
    },
  ];

  // Exploration actions (project-scoped)
  const exploreActions = [
    { name: "World", description: "Browse entities", icon: Globe, href: `${basePath}/world` },
    { name: "Map", description: "View relationships", icon: Network, href: `${basePath}/graph` },
    { name: "History", description: "Timeline events", icon: Clock, href: `${basePath}/history` },
    { name: "Scenes", description: "Story interactions", icon: Film, href: `${basePath}/scenes` },
    { name: "Assets", description: "Generated visuals", icon: Image, href: `${basePath}/assets` },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome header with current state */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {projectName || "Narrative Workbench"}
            </h1>
            <p className="mt-2 text-muted-foreground max-w-xl">
              Your creative command center for building, exploring, and evolving this narrative universe.
              Import lore, generate content, and track your story across infinite timelines.
            </p>
          </div>
          {activeBranch && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: getBranchColor(activeBranch.name, activeBranch.isCanon) }}
              />
              <span className="text-sm font-medium text-foreground">{activeBranch.name}</span>
              {activeBranch.isCanon && (
                <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-500">
                  canon
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quick stats inline */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-border/50 bg-card/50 p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-cyan-400" />
              <span className="text-2xl font-bold text-foreground">
                {isLoading ? "..." : entities.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Entities</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/50 p-3">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-purple-400" />
              <span className="text-2xl font-bold text-foreground">
                {isLoading ? "..." : status?.relationships ?? "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Relationships</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/50 p-3">
            <div className="flex items-center gap-2">
              <GitCommit className="h-4 w-4 text-green-400" />
              <span className="text-2xl font-bold text-foreground">
                {isLoading ? "..." : commits.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Commits</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/50 p-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-amber-400" />
              <span className="text-2xl font-bold text-foreground">
                {isLoading ? "..." : branches.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Timelines</p>
          </div>
        </div>
      </div>

      {/* Primary creation actions */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Create & Generate</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {createActions.map((action) => (
            <Link
              key={action.name}
              href={action.href}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
            >
              <div
                className={cn(
                  "absolute inset-0 opacity-0 transition-opacity group-hover:opacity-10 bg-gradient-to-br",
                  action.gradient
                )}
              />
              <div className="relative">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white",
                      action.gradient
                    )}
                  >
                    <action.icon className="h-5 w-5" />
                  </div>
                  {action.badge && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {action.badge}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-semibold text-foreground group-hover:text-primary transition-colors">
                  {action.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Explore section */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Explore Your World</h2>
        <div className="grid grid-cols-5 gap-3">
          {exploreActions.map((action) => (
            <Link
              key={action.name}
              href={action.href}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:bg-muted/50"
            >
              <action.icon className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{action.name}</span>
              <span className="text-xs text-muted-foreground">{action.description}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent activity */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h3 className="font-semibold text-foreground">Recent Activity</h3>
            <Link
              href={`${basePath}/history`}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            ) : commits.length > 0 ? (
              <div className="space-y-3">
                {commits.slice(0, 6).map((commit) => {
                  const branch = branches.find((b) => b.name === commit.branch);
                  return (
                    <div
                      key={commit.id}
                      className="flex items-start gap-3 rounded-lg bg-muted/30 p-3"
                    >
                      <div
                        className="mt-1 flex h-6 w-6 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: `${getBranchColor(
                            commit.branch,
                            branch?.isCanon ?? false
                          )}20`,
                        }}
                      >
                        <GitCommit
                          className="h-3 w-3"
                          style={{
                            color: getBranchColor(commit.branch, branch?.isCanon ?? false),
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-1">
                          {commit.message}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
                            style={{
                              backgroundColor: `${getBranchColor(
                                commit.branch,
                                branch?.isCanon ?? false
                              )}15`,
                              color: getBranchColor(commit.branch, branch?.isCanon ?? false),
                            }}
                          >
                            <GitBranch className="h-3 w-3" />
                            {commit.branch}
                          </span>
                          <span className="text-muted-foreground/50">•</span>
                          <span>{formatTime(commit.timestamp)}</span>
                          {commit.operations && commit.operations.length > 0 && (
                            <>
                              <span className="text-muted-foreground/50">•</span>
                              <span>{commit.operations.length} changes</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground/30" />
                <h4 className="mt-4 font-medium text-foreground">Your story awaits</h4>
                <p className="mt-2 text-sm text-muted-foreground max-w-md">
                  Import existing lore, generate new content, or start building your narrative
                  universe from scratch.
                </p>
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`${basePath}/import`}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Import Lore
                  </Link>
                  <Link
                    href={`${basePath}/chat`}
                    className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Ask Questions
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Canon overview sidebar */}
        <div className="space-y-6">
          {/* Entity breakdown */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Canon Breakdown</h3>
              <Link
                href={`${basePath}/world`}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Browse <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              ) : Object.keys(entityBreakdown).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(entityBreakdown).map(([type, count]) => {
                    const Icon = typeIcons[type] || Box;
                    const colorClasses = typeColors[type] || "text-muted-foreground bg-muted";
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between rounded-lg bg-muted/30 p-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn("rounded p-1.5", colorClasses)}>
                            <Icon className="h-3 w-3" />
                          </div>
                          <span className="text-sm text-foreground capitalize">{type}s</span>
                        </div>
                        <span className="font-semibold text-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Users className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-2 text-sm text-muted-foreground">No entities yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Timeline branches */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="font-semibold text-foreground">Timelines</h3>
              <Link
                href={`${basePath}/history`}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              ) : branches.length > 0 ? (
                <div className="space-y-2">
                  {branches.slice(0, 5).map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center justify-between rounded-lg bg-muted/30 p-2"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: getBranchColor(branch.name, branch.isCanon) }}
                        />
                        <span className="text-sm font-medium text-foreground">{branch.name}</span>
                        {branch.isActive && (
                          <span className="rounded bg-green-500/20 px-1 py-0.5 text-[9px] text-green-500">
                            HEAD
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{branch.commitCount}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-2 text-sm text-muted-foreground">No timelines yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick tip */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-medium text-foreground">Quick Tip</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use <strong>Ask the Canon</strong> to query your lore with natural language, or{" "}
                  <strong>Write Content</strong> to generate new scenes that respect your
                  established facts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

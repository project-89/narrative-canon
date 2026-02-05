"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  GitBranch,
  Home,
  Settings,
  BookOpen,
  Sparkles,
  Globe,
  Network,
  Clock,
  Film,
  MessageCircle,
  PenTool,
  ListTree,
  Download,
  Palette,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavSection {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

interface NavItem {
  name: string;
  path: string; // relative path like "world" or "chat"
  icon: typeof Home;
  badge?: string;
}

const navSections: NavSection[] = [
  {
    title: "Explore",
    defaultOpen: true,
    items: [
      { name: "World", path: "world", icon: Globe },
      { name: "Map", path: "graph", icon: Network },
      { name: "History", path: "history", icon: Clock },
      { name: "Scenes", path: "scenes", icon: Film },
    ],
  },
  {
    title: "Create",
    defaultOpen: true,
    items: [
      { name: "Chat", path: "chat", icon: MessageCircle, badge: "New" },
      { name: "Write", path: "write", icon: PenTool, badge: "New" },
      { name: "Plan", path: "plan", icon: ListTree, badge: "New" },
    ],
  },
  {
    title: "Manage",
    defaultOpen: false,
    items: [
      { name: "Import", path: "import", icon: Download },
      { name: "Assets", path: "assets", icon: Palette },
      { name: "Settings", path: "settings", icon: Settings },
    ],
  },
];

interface BranchInfo {
  name: string;
  commitCount: number;
  branchCount: number;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

interface SidebarProps {
  projectId: string;
}

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const basePath = `/p/${projectId}`;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Explore: true,
    Create: true,
    Manage: false,
  });
  const [branchInfo, setBranchInfo] = useState<BranchInfo>({
    name: "main",
    commitCount: 0,
    branchCount: 1,
  });
  const [currentProject, setCurrentProject] = useState<Project>({
    id: projectId,
    name: "Loading...",
    color: "#8b5cf6",
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);

  // Fetch branch info and projects
  useEffect(() => {
    async function fetchData() {
      try {
        const [branchesRes, commitsRes, projectsRes] = await Promise.all([
          fetch(`http://localhost:3088/api/projects/${projectId}/branches`),
          fetch(`http://localhost:3088/api/projects/${projectId}/commits`),
          fetch("http://localhost:3088/api/projects"),
        ]);

        // Try project-specific endpoints first, fall back to generic
        if (branchesRes.ok && commitsRes.ok) {
          const branches = await branchesRes.json();
          const commits = await commitsRes.json();
          const activeBranch = branches.find((b: any) => b.isActive);
          setBranchInfo({
            name: activeBranch?.name || "main",
            commitCount: commits.length,
            branchCount: branches.length,
          });
        } else {
          // Fall back to non-project-specific endpoints
          const [fallbackBranches, fallbackCommits] = await Promise.all([
            fetch("http://localhost:3088/api/narrative/git/branches").then(r => r.ok ? r.json() : []),
            fetch("http://localhost:3088/api/narrative/git/commits").then(r => r.ok ? r.json() : []),
          ]);
          const activeBranch = fallbackBranches.find((b: any) => b.isActive);
          setBranchInfo({
            name: activeBranch?.name || "main",
            commitCount: fallbackCommits.length || 0,
            branchCount: fallbackBranches.length || 1,
          });
        }

        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          setProjects(projectsData);
          const current = projectsData.find((p: any) => p.id === projectId);
          if (current) {
            setCurrentProject(current);
          }
        }
      } catch (e) {
        // Ignore errors, keep defaults
      }
    }
    fetchData();
  }, [projectId]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleSwitchProject = async (project: Project) => {
    try {
      await fetch("http://localhost:3088/api/projects/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
    } catch {
      // Continue anyway
    }
    setCurrentProject(project);
    setShowProjectMenu(false);
    // Navigate to the new project's home page
    router.push(`/p/${project.id}`);
  };

  const isActivePath = (path: string) => {
    const fullPath = `${basePath}/${path}`;
    return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      {/* Logo & Project Selector */}
      <div className="border-b border-border">
        <div className="flex h-14 items-center gap-3 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/30">
            <BookOpen className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground">Narrative Canon</h1>
          </div>
        </div>

        {/* Project selector */}
        <div className="px-3 pb-3 relative">
          <button
            onClick={() => setShowProjectMenu(!showProjectMenu)}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-left hover:bg-muted transition-colors"
          >
            <div
              className="flex h-6 w-6 items-center justify-center rounded shrink-0"
              style={{ backgroundColor: `${currentProject.color}20` }}
            >
              <FolderOpen className="h-3 w-3" style={{ color: currentProject.color }} />
            </div>
            <span className="flex-1 text-sm font-medium text-foreground truncate">
              {currentProject.name}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                showProjectMenu && "rotate-180"
              )}
            />
          </button>

          {/* Project dropdown */}
          {showProjectMenu && (
            <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg border border-border bg-card shadow-lg">
              <div className="p-1 max-h-64 overflow-y-auto">
                {projects.length > 0 ? (
                  projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleSwitchProject(project)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        project.id === currentProject.id
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <div
                        className="flex h-5 w-5 items-center justify-center rounded"
                        style={{ backgroundColor: `${project.color}20` }}
                      >
                        <FolderOpen className="h-3 w-3" style={{ color: project.color }} />
                      </div>
                      <span className="truncate">{project.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No projects yet
                  </div>
                )}
              </div>
              <div className="border-t border-border p-1">
                <Link
                  href={`${basePath}/settings`}
                  onClick={() => setShowProjectMenu(false)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New Project...
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Home link */}
      <div className="px-3 pt-4">
        <Link
          href={basePath}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
            pathname === basePath
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Home className="h-5 w-5" />
          Dashboard
        </Link>
      </div>

      {/* Main navigation sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navSections.map((section) => (
          <div key={section.title} className="mb-2">
            {/* Section header */}
            <button
              onClick={() => toggleSection(section.title)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {section.title}
              {openSections[section.title] ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>

            {/* Section items */}
            {openSections[section.title] && (
              <div className="space-y-1">
                {section.items.map((item) => {
                  const href = `${basePath}/${item.path}`;
                  const isActive = isActivePath(item.path);
                  return (
                    <Link
                      key={item.name}
                      href={href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.name}</span>
                      {item.badge && (
                        <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Quick actions */}
      <div className="border-t border-border p-3">
        <Link
          href={`${basePath}/chat`}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-cyan-500/20 px-3 py-2.5 text-sm font-medium text-cyan-400 hover:from-purple-500/20 hover:to-cyan-500/20 transition-all"
        >
          <Sparkles className="h-4 w-4" />
          Ask the Canon
        </Link>
      </div>

      {/* Branch indicator */}
      <div className="border-t border-border p-3">
        <Link
          href={`${basePath}/history`}
          className="block rounded-lg bg-muted/50 p-3 hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">{branchInfo.name}</span>
            {branchInfo.name !== "main" && (
              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] text-amber-400">
                branch
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {branchInfo.commitCount} commits • {branchInfo.branchCount} branches
          </p>
        </Link>
      </div>
    </div>
  );
}

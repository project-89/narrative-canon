"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Plus, Check, Loader2, FolderOpen, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  stats: {
    entities: number;
    relationships: number;
    commits: number;
    branches: number;
  };
}

interface StorySwitcherProps {
  onStoryChange?: (projectId: string) => void | Promise<void>;
  className?: string;
}

const projectColors = [
  "#8b5cf6", "#ef4444", "#f59e0b", "#06b6d4",
  "#22c55e", "#ec4899", "#6366f1", "#14b8a6",
];

export function StorySwitcher({ onStoryChange, className }: StorySwitcherProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

  // Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch(`${API_BASE}/api/projects`);
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
          const active = data.find((p: Project) => p.isActive);
          setCurrentProject(active || data[0]);
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProjects();
  }, [API_BASE]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSwitchProject = async (project: Project) => {
    if (project.id === currentProject?.id) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });

      if (!res.ok) throw new Error(`Project switch failed (${res.status}): ${await res.text()}`);

      // Keep the switcher locked until the studio has finished replacing the
      // prior world's data; otherwise a second click can interleave two loads.
      await onStoryChange?.(project.id);
      setCurrentProject(project);
      setProjects(prev => prev.map(p => ({
        ...p,
        isActive: p.id === project.id,
      })));
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to switch project:", error);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleQuickCreate = async () => {
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: "",
          color: projectColors[projects.length % projectColors.length],
        }),
      });

      if (res.ok) {
        const newProject = await res.json();
        setProjects(prev => [...prev, newProject]);
        setNewProjectName("");
        // Optionally switch to the new project
        handleSwitchProject(newProject);
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        {currentProject && (
          <>
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: currentProject.color }}
            />
            <span className="text-sm font-medium text-gray-200 max-w-[150px] truncate">
              {currentProject.name}
            </span>
          </>
        )}
        {!currentProject && (
          <>
            <FolderOpen className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-400">Select Story</span>
          </>
        )}
        {isSwitching ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : (
          <ChevronDown className={cn(
            "h-4 w-4 text-gray-400 transition-transform",
            isOpen && "rotate-180"
          )} />
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-[100] w-72 rounded-lg border border-white/20 bg-[#1e1b2e] shadow-2xl shadow-black/50">
          {/* Project list */}
          <div className="max-h-64 overflow-y-auto p-1">
            {projects.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                No stories yet. Create one below!
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSwitchProject(project)}
                  disabled={isSwitching}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    project.id === currentProject?.id
                      ? "bg-purple-500/30 text-purple-200"
                      : "text-gray-300 hover:bg-white/10"
                  )}
                >
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{project.name}</div>
                    <div className="text-xs text-gray-500">
                      {project.stats.entities} entities · {project.stats.relationships} relationships
                    </div>
                  </div>
                  {project.id === currentProject?.id && (
                    <Check className="h-4 w-4 text-purple-400 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Quick create */}
          <div className="border-t border-white/10 p-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="New story name..."
                className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-purple-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleQuickCreate()}
              />
              <button
                onClick={handleQuickCreate}
                disabled={!newProjectName.trim() || isCreating}
                className="rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Link to full story manager */}
          <div className="border-t border-white/10 p-2">
            <Link
              href="/stories"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
            >
              <Settings2 className="h-4 w-4" />
              Manage All Stories
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default StorySwitcher;

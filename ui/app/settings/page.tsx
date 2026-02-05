"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  FolderOpen,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  BookOpen,
  Calendar,
  Users,
  GitBranch,
  AlertTriangle,
  Download,
  Upload,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
  stats: {
    entities: number;
    relationships: number;
    commits: number;
    branches: number;
  };
  color: string;
}

const projectColors = [
  "#8b5cf6", // purple
  "#ef4444", // red
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#22c55e", // green
  "#ec4899", // pink
  "#6366f1", // indigo
  "#14b8a6", // teal
];

export default function SettingsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Fetch projects
  useEffect(() => {
    async function fetchProjects() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("http://localhost:3088/api/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        } else {
          // If no projects endpoint, use demo data
          setProjects([
            {
              id: "default",
              name: "Project 89",
              description: "The main narrative universe - timeline warfare against Oneirocom",
              createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
              updatedAt: Date.now() - 2 * 60 * 60 * 1000,
              isActive: true,
              stats: { entities: 8, relationships: 8, commits: 3, branches: 3 },
              color: "#8b5cf6",
            },
          ]);
        }
      } catch (err) {
        console.error("Error fetching projects:", err);
        // Use demo project
        setProjects([
          {
            id: "default",
            name: "Project 89",
            description: "The main narrative universe - timeline warfare against Oneirocom",
            createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
            updatedAt: Date.now() - 2 * 60 * 60 * 1000,
            isActive: true,
            stats: { entities: 8, relationships: 8, commits: 3, branches: 3 },
            color: "#8b5cf6",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      const newProject: Project = {
        id: `project_${Date.now()}`,
        name: newProjectName.trim(),
        description: newProjectDescription.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isActive: false,
        stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
        color: projectColors[projects.length % projectColors.length],
      };

      // Try to create via API
      try {
        const res = await fetch("http://localhost:3088/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newProject),
        });
        if (res.ok) {
          const created = await res.json();
          setProjects((prev) => [...prev, created]);
        } else {
          setProjects((prev) => [...prev, newProject]);
        }
      } catch {
        setProjects((prev) => [...prev, newProject]);
      }

      setNewProjectName("");
      setNewProjectDescription("");
      setShowNewProjectForm(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSwitchProject = async (projectId: string) => {
    try {
      await fetch("http://localhost:3088/api/projects/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // Continue anyway for demo
    }

    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        isActive: p.id === projectId,
      }))
    );

    // Reload to refresh all data
    window.location.href = "/";
  };

  const handleUpdateProject = async (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, name: editName, description: editDescription, updatedAt: Date.now() }
          : p
      )
    );
    setEditingProject(null);
  };

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (project?.isActive) {
      setError("Cannot delete the active project. Switch to another project first.");
      setDeleteConfirm(null);
      return;
    }

    try {
      await fetch(`http://localhost:3088/api/projects/${projectId}`, {
        method: "DELETE",
      });
    } catch {
      // Continue anyway
    }

    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setDeleteConfirm(null);
  };

  const startEditing = (project: Project) => {
    setEditingProject(project.id);
    setEditName(project.name);
    setEditDescription(project.description);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const activeProject = projects.find((p) => p.isActive);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your narrative projects and workbench preferences
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Projects Section */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold text-foreground">Projects</h2>
              <p className="text-xs text-muted-foreground">
                Each project is a separate narrative universe
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNewProjectForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        {/* New project form */}
        {showNewProjectForm && (
          <div className="border-b border-border bg-muted/30 p-4">
            <h3 className="font-medium text-foreground mb-3">Create New Project</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name (e.g., 'Epic Fantasy Saga')"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <textarea
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="Brief description of this narrative world..."
                rows={2}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || isCreating}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Project
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowNewProjectForm(false);
                    setNewProjectName("");
                    setNewProjectDescription("");
                  }}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Project list */}
        <div className="divide-y divide-border">
          {projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "p-4 transition-colors",
                project.isActive && "bg-primary/5"
              )}
            >
              {editingProject === project.id ? (
                /* Edit mode */
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateProject(project.id)}
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                    >
                      <Check className="h-3 w-3" />
                      Save
                    </button>
                    <button
                      onClick={() => setEditingProject(null)}
                      className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground"
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : deleteConfirm === project.id ? (
                /* Delete confirmation */
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <p className="text-sm text-foreground">
                      Delete <strong>{project.name}</strong>? This cannot be undone.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteProject(project.id)}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal view */
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
                    style={{ backgroundColor: `${project.color}20` }}
                  >
                    <BookOpen className="h-6 w-6" style={{ color: project.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{project.name}</h3>
                      {project.isActive && (
                        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-500">
                          Active
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {project.stats.entities} entities
                      </span>
                      <span className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {project.stats.branches} branches
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Created {formatDate(project.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!project.isActive && (
                      <button
                        onClick={() => handleSwitchProject(project.id)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Switch
                      </button>
                    )}
                    <button
                      onClick={() => startEditing(project)}
                      className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {!project.isActive && (
                      <button
                        onClick={() => setDeleteConfirm(project.id)}
                        className="rounded p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {projects.length === 0 && (
            <div className="p-8 text-center">
              <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-medium text-foreground">No projects yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first narrative project to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Data Management */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold text-foreground">Data Management</h2>
            <p className="text-xs text-muted-foreground">
              Export and import your narrative data
            </p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {activeProject && (
            <div className="rounded-lg bg-muted/30 p-4">
              <h4 className="font-medium text-foreground mb-2">
                Current Project: {activeProject.name}
              </h4>
              <div className="flex gap-3">
                <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted">
                  <Download className="h-4 w-4" />
                  Export Project
                </button>
                <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted">
                  <Upload className="h-4 w-4" />
                  Import Data
                </button>
                <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted">
                  <RefreshCw className="h-4 w-4" />
                  Reset to Demo
                </button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            <p>
              <strong>Export</strong> creates a JSON backup of all entities, relationships, commits, and branches.
            </p>
            <p className="mt-1">
              <strong>Import</strong> merges data from a backup file into the current project.
            </p>
          </div>
        </div>
      </div>

      {/* API Settings */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold text-foreground">API Configuration</h2>
            <p className="text-xs text-muted-foreground">
              Configure LLM and backend connections
            </p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">API Endpoint</label>
            <input
              type="text"
              defaultValue="http://localhost:3088"
              className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">LLM Provider</label>
            <select className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="local">Local (Ollama)</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            LLM is used for entity extraction, content generation, and canon queries.
          </p>
        </div>
      </div>
    </div>
  );
}

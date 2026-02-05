"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Download,
  Upload,
  Search,
  Grid,
  List,
  MoreHorizontal,
  Check,
  X,
  Loader2,
  Calendar,
  Users,
  GitBranch,
  FolderOpen,
  Sparkles,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
  "#8b5cf6", "#ef4444", "#f59e0b", "#06b6d4",
  "#22c55e", "#ec4899", "#6366f1", "#14b8a6",
];

export default function StoriesPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "updated" | "created">("updated");

  // New project form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState(projectColors[0]);
  const [isCreating, setIsCreating] = useState(false);

  // Generate world state
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generateName, setGenerateName] = useState("");
  const [generateColor, setGenerateColor] = useState(projectColors[Math.floor(Math.random() * projectColors.length)]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch(`${API_BASE}/api/projects`);
        if (res.ok) {
          setProjects(await res.json());
        } else {
          setError("Failed to load stories");
        }
      } catch (err) {
        setError("Failed to connect to server");
      } finally {
        setIsLoading(false);
      }
    }
    loadProjects();
  }, [API_BASE]);

  // Filter and sort projects
  const filteredProjects = projects
    .filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "name": return a.name.localeCompare(b.name);
        case "updated": return b.updatedAt - a.updatedAt;
        case "created": return b.createdAt - a.createdAt;
        default: return 0;
      }
    });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
          color: newColor,
        }),
      });

      if (res.ok) {
        const project = await res.json();
        setProjects(prev => [...prev, project]);
        setShowNewForm(false);
        setNewName("");
        setNewDescription("");
        setNewColor(projectColors[0]);
      } else {
        setError("Failed to create story");
      }
    } catch (err) {
      setError("Failed to create story");
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateWorld = async () => {
    if (!generatePrompt.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/projects/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: generatePrompt.trim(),
          name: generateName.trim() || undefined,
          color: generateColor,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setShowGenerateForm(false);
        setGeneratePrompt("");
        setGenerateName("");
        setGenerateColor(projectColors[Math.floor(Math.random() * projectColors.length)]);
        router.push("/studio");
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.message || "Failed to generate world");
      }
    } catch (err) {
      setError("Failed to generate world - check server connection");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSwitch = async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        setProjects(prev => prev.map(p => ({ ...p, isActive: p.id === projectId })));
      }
    } catch (err) {
      setError("Failed to switch story");
    }
  };

  const handleUpdate = async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
        }),
      });

      if (res.ok) {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, name: editName, description: editDescription, updatedAt: Date.now() } : p
        ));
        setEditingId(null);
      }
    } catch (err) {
      setError("Failed to update story");
    }
  };

  const handleDelete = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project?.isActive) {
      setError("Cannot delete the active story. Switch to another story first.");
      setDeleteConfirmId(null);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== projectId));
        setDeleteConfirmId(null);
      }
    } catch (err) {
      setError("Failed to delete story");
    }
  };

  const handleDuplicate = async (project: Project) => {
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${project.name} (Copy)`,
          description: project.description,
          color: project.color,
        }),
      });

      if (res.ok) {
        const newProject = await res.json();
        setProjects(prev => [...prev, newProject]);
      }
    } catch (err) {
      setError("Failed to duplicate story");
    } finally {
      setIsCreating(false);
    }
  };

  const handleExport = async (project: Project) => {
    try {
      // Switch to the project first
      await fetch(`${API_BASE}/api/projects/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });

      // Fetch all project data
      const [entities, relationships, interactions] = await Promise.all([
        fetch(`${API_BASE}/api/narrative/entities`).then(r => r.json()),
        fetch(`${API_BASE}/api/narrative/relationships`).then(r => r.json()),
        fetch(`${API_BASE}/api/narrative/interactions`).then(r => r.json()),
      ]);

      const exportData = {
        project: {
          name: project.name,
          description: project.description,
          color: project.color,
        },
        data: { entities, relationships, interactions },
        exportedAt: new Date().toISOString(),
        version: "1.0.0",
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, "_")}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to export story");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      const res = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importData.project?.name || "Imported Story",
          description: importData.project?.description || "",
          color: importData.project?.color || projectColors[0],
        }),
      });

      if (res.ok) {
        const newProject = await res.json();
        setProjects(prev => [...prev, newProject]);
        // TODO: Import the actual data (entities, relationships, etc.)
      }
    } catch (err) {
      setError("Failed to import story - invalid file format");
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric"
  });

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDescription(project.description);
    setOpenMenuId(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading stories...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/studio" className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-3">
                <FolderOpen className="w-6 h-6 text-purple-400" />
                <h1 className="text-xl font-semibold text-white">Story Manager</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search stories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-purple-500/50 w-64"
                />
              </div>

              {/* View mode toggle */}
              <div className="flex border border-white/10 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "grid" ? "bg-purple-500/20 text-purple-400" : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "list" ? "bg-purple-500/20 text-purple-400" : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Import */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-white/10 rounded-lg text-gray-300 hover:bg-white/5 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>

              {/* Generate World */}
              <button
                onClick={() => setShowGenerateForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-violet-500/20"
              >
                <Wand2 className="w-4 h-4" />
                Generate World
              </button>

              {/* New Story */}
              <button
                onClick={() => setShowNewForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Story
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="max-w-6xl mx-auto px-6 mt-4">
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-500/20 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Sort Options */}
        <div className="flex items-center gap-4 mb-6">
          <span className="text-sm text-gray-500">Sort by:</span>
          <div className="flex gap-2">
            {[
              { value: "updated", label: "Recently Updated" },
              { value: "created", label: "Recently Created" },
              { value: "name", label: "Name" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  sortBy === option.value
                    ? "bg-purple-500/20 text-purple-400"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-sm text-gray-500">
            {filteredProjects.length} {filteredProjects.length === 1 ? "story" : "stories"}
          </span>
        </div>

        {/* Stories Grid/List */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              {searchQuery ? "No stories found" : "No stories yet"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery ? "Try a different search term" : "Create your first story to get started"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowNewForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Story
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "group relative rounded-xl border bg-slate-900/50 p-5 transition-all hover:bg-slate-800/50",
                  project.isActive ? "border-purple-500/50 ring-1 ring-purple-500/20" : "border-white/10"
                )}
              >
                {/* Active badge */}
                {project.isActive && (
                  <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full font-medium">
                    Active
                  </div>
                )}

                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${project.color}20` }}
                  >
                    <BookOpen className="w-5 h-5" style={{ color: project.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === project.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-white/5 border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-purple-500"
                        autoFocus
                      />
                    ) : (
                      <h3 className="font-semibold text-white truncate">{project.name}</h3>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      Updated {formatDate(project.updatedAt)}
                    </p>
                  </div>

                  {/* Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {openMenuId === project.id && (
                      <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-white/10 rounded-lg shadow-xl py-1 z-10">
                        <button
                          onClick={() => startEdit(project)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5"
                        >
                          <Edit2 className="w-4 h-4" />
                          Rename
                        </button>
                        <button
                          onClick={() => { handleDuplicate(project); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5"
                        >
                          <Copy className="w-4 h-4" />
                          Duplicate
                        </button>
                        <button
                          onClick={() => { handleExport(project); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/5"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                        <hr className="my-1 border-white/10" />
                        <button
                          onClick={() => { setDeleteConfirmId(project.id); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                          disabled={project.isActive}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                {editingId === project.id ? (
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description..."
                    className="w-full h-16 bg-white/5 border border-white/20 rounded px-2 py-1 text-gray-300 text-sm resize-none focus:outline-none focus:border-purple-500 mb-4"
                  />
                ) : (
                  <p className="text-sm text-gray-400 mb-4 line-clamp-2 min-h-[2.5rem]">
                    {project.description || "No description"}
                  </p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {project.stats.entities}
                  </span>
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3.5 h-3.5" />
                    {project.stats.branches}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(project.createdAt)}
                  </span>
                </div>

                {/* Actions */}
                {editingId === project.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(project.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-2 border border-white/10 text-gray-300 hover:bg-white/5 rounded-lg text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {project.isActive ? (
                      <Link
                        href="/studio"
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in Studio
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleSwitch(project.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-white/10 text-gray-300 hover:bg-white/5 rounded-lg text-sm transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        Switch to this story
                      </button>
                    )}
                  </div>
                )}

                {/* Delete confirmation overlay */}
                {deleteConfirmId === project.id && (
                  <div className="absolute inset-0 bg-slate-900/95 rounded-xl flex flex-col items-center justify-center p-4 z-20">
                    <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
                    <p className="text-sm text-gray-300 text-center mb-4">
                      Delete "<strong>{project.name}</strong>"? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-4 py-2 border border-white/10 text-gray-300 hover:bg-white/5 rounded-lg text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "group flex items-center gap-4 rounded-lg border bg-slate-900/50 p-4 transition-all hover:bg-slate-800/50",
                  project.isActive ? "border-purple-500/50" : "border-white/10"
                )}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${project.color}20` }}
                >
                  <BookOpen className="w-5 h-5" style={{ color: project.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white truncate">{project.name}</h3>
                    {project.isActive && (
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 truncate">
                    {project.description || "No description"}
                  </p>
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-500">
                  <span>{project.stats.entities} entities</span>
                  <span>{formatDate(project.updatedAt)}</span>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(project)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleExport(project)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  {project.isActive ? (
                    <Link
                      href="/studio"
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Open
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleSwitch(project.id)}
                      className="px-3 py-1.5 border border-white/10 text-gray-300 hover:bg-white/5 rounded-lg text-sm transition-colors"
                    >
                      Switch
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Story Modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowNewForm(false)} />
          <div className="relative bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Create New Story</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Story Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter story name..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-purple-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full h-20 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-200 placeholder:text-gray-500 resize-none focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Color</label>
                <div className="flex gap-2">
                  {projectColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={cn(
                        "w-8 h-8 rounded-lg transition-all",
                        newColor === color ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : "hover:scale-110"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowNewForm(false)}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || isCreating}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Story
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate World Modal */}
      {showGenerateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => !isGenerating && setShowGenerateForm(false)} />
          <div className="relative bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
                <Wand2 className="w-5 h-5 text-fuchsia-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Generate World</h2>
            </div>

            {isGenerating ? (
              <div className="py-12 text-center">
                <div className="relative inline-flex items-center justify-center mb-4">
                  <div className="w-16 h-16 border-2 border-violet-500/30 rounded-full animate-spin border-t-violet-400" />
                  <Sparkles className="w-6 h-6 text-violet-400 absolute animate-pulse" />
                </div>
                <p className="text-gray-300 font-medium mb-1">Generating your world...</p>
                <p className="text-sm text-gray-500">This may take 15-30 seconds</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Creative Prompt</label>
                    <textarea
                      value={generatePrompt}
                      onChange={(e) => setGeneratePrompt(e.target.value)}
                      placeholder="Describe the world you want to create... e.g. 'A cyberpunk city where AI entities have gained sentience and formed their own underground society'"
                      className="w-full h-32 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-200 placeholder:text-gray-500 resize-none focus:outline-none focus:border-violet-500"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-1">The AI will generate entities, relationships, and opening scenes from your prompt</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">World Name <span className="text-gray-500">(optional)</span></label>
                    <input
                      type="text"
                      value={generateName}
                      onChange={(e) => setGenerateName(e.target.value)}
                      placeholder="Auto-generated from prompt if left blank"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Color</label>
                    <div className="flex gap-2">
                      {projectColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setGenerateColor(color)}
                          className={cn(
                            "w-8 h-8 rounded-lg transition-all",
                            generateColor === color ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : "hover:scale-110"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowGenerateForm(false)}
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerateWorld}
                    disabled={!generatePrompt.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20"
                  >
                    <Wand2 className="w-4 h-4" />
                    Generate World
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Click outside to close menus */}
      {openMenuId && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setOpenMenuId(null)}
        />
      )}
    </div>
  );
}

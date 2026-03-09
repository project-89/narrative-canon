"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Plus,
  Pin,
  PinOff,
  Trash2,
  FileText,
  BookOpen,
  Map,
  Users,
  Bookmark,
  MoreHorizontal,
  Check,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReferenceDocument {
  id: string;
  title: string;
  content: string;
  category: "world_bible" | "story_arc" | "character_notes" | "reference" | "other";
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const CATEGORIES = [
  { value: "world_bible", label: "World Bible", icon: Map, color: "text-purple-400" },
  { value: "story_arc", label: "Story Arc", icon: BookOpen, color: "text-amber-400" },
  { value: "character_notes", label: "Character Notes", icon: Users, color: "text-cyan-400" },
  { value: "reference", label: "Reference", icon: Bookmark, color: "text-emerald-400" },
  { value: "other", label: "Other", icon: FileText, color: "text-gray-400" },
] as const;

function getCategoryConfig(category: string) {
  return CATEGORIES.find((c) => c.value === category) || CATEGORIES[4];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentsPanelProps {
  onClose: () => void;
  projectId?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentsPanel({ onClose, projectId }: DocumentsPanelProps) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";
  const docsApiUrl = useCallback((path: string): string => {
    if (!projectId) return `${API_BASE}${path}`;
    const separator = path.includes("?") ? "&" : "?";
    return `${API_BASE}${path}${separator}projectId=${encodeURIComponent(projectId)}`;
  }, [API_BASE, projectId]);

  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Editor state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState<string>("other");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ title: string; content: string; category: string }>({
    title: "",
    content: "",
    category: "",
  });

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  // ---- Data loading ----

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setSelectedDocId(null);
      setDocuments([]);
      try {
        const res = await fetch(docsApiUrl("/api/narrative/documents"));
        if (res.ok) {
          const data = await res.json();
          setDocuments(data);
        }
      } catch (e) {
        console.error("Failed to load documents:", e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [docsApiUrl]);

  // When selecting a document, populate editor
  useEffect(() => {
    if (selectedDoc) {
      setEditTitle(selectedDoc.title);
      setEditContent(selectedDoc.content);
      setEditCategory(selectedDoc.category);
      lastSavedRef.current = {
        title: selectedDoc.title,
        content: selectedDoc.content,
        category: selectedDoc.category,
      };
    }
  }, [selectedDocId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-save with debounce ----

  const saveDocument = useCallback(
    async (docId: string, updates: Partial<ReferenceDocument>) => {
      setIsSaving(true);
      try {
        const res = await fetch(docsApiUrl(`/api/narrative/documents/${docId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          const result = await res.json();
          setDocuments((prev) =>
            prev.map((d) => (d.id === docId ? { ...d, ...result.document } : d))
          );
          lastSavedRef.current = {
            title: updates.title ?? lastSavedRef.current.title,
            content: updates.content ?? lastSavedRef.current.content,
            category: (updates.category as string) ?? lastSavedRef.current.category,
          };
        }
      } catch (e) {
        console.error("Failed to save document:", e);
      } finally {
        setIsSaving(false);
      }
    },
    [docsApiUrl]
  );

  const scheduleSave = useCallback(
    (docId: string, updates: Partial<ReferenceDocument>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveDocument(docId, updates);
      }, 1500);
    },
    [saveDocument]
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleTitleChange = (value: string) => {
    setEditTitle(value);
    if (selectedDocId) {
      scheduleSave(selectedDocId, { title: value, content: editContent, category: editCategory as any });
    }
  };

  const handleContentChange = (value: string) => {
    setEditContent(value);
    if (selectedDocId) {
      scheduleSave(selectedDocId, { title: editTitle, content: value, category: editCategory as any });
    }
  };

  const handleCategoryChange = (value: string) => {
    setEditCategory(value);
    setShowCategoryPicker(false);
    if (selectedDocId) {
      saveDocument(selectedDocId, { category: value as any });
    }
  };

  // ---- CRUD operations ----

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const res = await fetch(docsApiUrl("/api/narrative/documents"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Document",
          content: "",
          category: "other",
          isPinned: false,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setDocuments((prev) => [...prev, result.document]);
        setSelectedDocId(result.document.id);
      }
    } catch (e) {
      console.error("Failed to create document:", e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleTogglePin = async (doc: ReferenceDocument) => {
    const newPinned = !doc.isPinned;
    // Optimistic update
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, isPinned: newPinned } : d))
    );
    try {
      await fetch(docsApiUrl(`/api/narrative/documents/${doc.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: newPinned }),
      });
    } catch (e) {
      // Revert on failure
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, isPinned: !newPinned } : d))
      );
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(docsApiUrl(`/api/narrative/documents/${docId}`), {
        method: "DELETE",
      });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        if (selectedDocId === docId) {
          setSelectedDocId(null);
        }
      }
    } catch (e) {
      console.error("Failed to delete document:", e);
    } finally {
      setConfirmDelete(null);
    }
  };

  // ---- Render ----

  // Document editor view
  if (selectedDoc) {
    const catConfig = getCategoryConfig(editCategory);
    const CatIcon = catConfig.icon;

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <button
            onClick={() => {
              // Flush any pending save
              if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveDocument(selectedDocId!, { title: editTitle, content: editContent, category: editCategory as any });
              }
              setSelectedDocId(null);
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-200 flex-1 truncate">Edit Scratchpad Note</span>
          {isSaving && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
          <button
            onClick={() => handleTogglePin(selectedDoc)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              selectedDoc.isPinned
                ? "text-amber-400 bg-amber-500/20 hover:bg-amber-500/30"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            )}
            title={selectedDoc.isPinned ? "Unpin from AI context" : "Pin to AI context"}
          >
            {selectedDoc.isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Title */}
          <input
            type="text"
            value={editTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full bg-transparent text-lg font-semibold text-gray-100 placeholder:text-gray-600 focus:outline-none border-b border-transparent focus:border-amber-500/50 pb-1 transition-colors"
            placeholder="Document title..."
          />

          {/* Category picker */}
          <div className="relative">
            <button
              onClick={() => setShowCategoryPicker(!showCategoryPicker)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 hover:border-white/20 transition-colors text-xs"
            >
              <CatIcon className={cn("w-3 h-3", catConfig.color)} />
              <span className="text-gray-300">{catConfig.label}</span>
            </button>
            {showCategoryPicker && (
              <div className="absolute top-full left-0 mt-1 z-10 bg-slate-800 border border-white/20 rounded-lg shadow-xl p-1 min-w-[180px]">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.value}
                      onClick={() => handleCategoryChange(cat.value)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs text-left transition-colors",
                        editCategory === cat.value
                          ? "bg-white/10 text-white"
                          : "text-gray-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon className={cn("w-3.5 h-3.5", cat.color)} />
                      <span>{cat.label}</span>
                      {editCategory === cat.value && <Check className="w-3 h-3 ml-auto text-amber-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Content */}
          <textarea
            value={editContent}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full flex-1 min-h-[300px] bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/30 resize-none font-mono leading-relaxed"
            placeholder="Write your reference document here...&#10;&#10;Supports freeform text — world lore, character backstories, story outlines, research notes..."
          />

          {/* Pin info */}
          {selectedDoc.isPinned && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Pin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-300">
                Pinned — this note is injected into AI context for each message (still non-canon)
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-[10px] text-gray-500">
            {new Date(selectedDoc.updatedAt).toLocaleDateString()} · {editContent.length} chars
          </span>
          <button
            onClick={() => setConfirmDelete(selectedDoc.id)}
            className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        </div>

        {/* Delete confirmation */}
        {confirmDelete === selectedDoc.id && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
            <div className="bg-slate-800 border border-white/20 rounded-xl p-4 max-w-[250px] space-y-3">
              <p className="text-sm text-gray-200">Delete &quot;{selectedDoc.title}&quot;?</p>
              <p className="text-xs text-gray-400">This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-gray-300 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(selectedDoc.id)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-red-600 text-xs text-white hover:bg-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Document list view
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-gray-200">Scratchpad</span>
          {documents.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-400">
              {documents.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            title="New document"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <FileText className="w-8 h-8 text-gray-600 mx-auto" />
            <div>
              <p className="text-sm text-gray-400">No documents yet</p>
              <p className="text-xs text-gray-500 mt-1">
                Keep non-canon notes, arcs, references, and planning docs
              </p>
            </div>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="px-4 py-2 rounded-lg bg-amber-600 text-sm text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              Create First Note
            </button>
          </div>
        ) : (
          <>
            {/* Pinned first */}
            {documents
              .sort((a, b) => {
                if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
                return b.updatedAt - a.updatedAt;
              })
              .map((doc) => {
                const catConfig = getCategoryConfig(doc.category);
                const CatIcon = catConfig.icon;

                return (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className="w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left hover:bg-white/5 transition-colors group"
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                        doc.isPinned ? "bg-amber-500/20" : "bg-white/5"
                      )}
                    >
                      <CatIcon className={cn("w-4 h-4", catConfig.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-200 truncate">{doc.title}</span>
                        {doc.isPinned && <Pin className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {doc.content.slice(0, 60) || "Empty document"}
                        {doc.content.length > 60 ? "..." : ""}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePin(doc);
                      }}
                      className={cn(
                        "p-1 rounded opacity-0 group-hover:opacity-100 transition-all",
                        doc.isPinned
                          ? "text-amber-400 hover:bg-amber-500/20"
                          : "text-gray-500 hover:text-gray-300 hover:bg-white/10"
                      )}
                      title={doc.isPinned ? "Unpin from AI context" : "Pin to AI context"}
                    >
                      {doc.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                    </button>
                  </button>
                );
              })}
          </>
        )}
      </div>

      {/* Footer hint */}
      {documents.length > 0 && (
        <div className="px-3 py-2 border-t border-white/10">
          <p className="text-[10px] text-gray-500 text-center">
            📌 Pinned notes are injected into AI context (non-canon)
          </p>
        </div>
      )}
    </div>
  );
}

export default DocumentsPanel;

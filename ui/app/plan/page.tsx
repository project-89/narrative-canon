"use client";

import { useState, useEffect } from "react";
import {
  ListTree,
  Plus,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Sparkles,
  Users,
  MapPin,
  Target,
  Clock,
  CheckCircle,
  Circle,
  PlayCircle,
  Loader2,
  Trash2,
  Edit2,
  Link2,
  BookOpen,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Entity {
  id: string;
  name: string;
  type: string;
  description?: string;
}

interface StoryBeat {
  id: string;
  title: string;
  description: string;
  status: "planned" | "in_progress" | "completed";
  entities: string[]; // entity IDs
  location?: string;
  order: number;
}

interface StoryArc {
  id: string;
  title: string;
  description: string;
  beats: StoryBeat[];
  status: "planned" | "in_progress" | "completed";
  entities: string[];
  createdAt: number;
  color: string;
}

const arcColors = [
  "#8b5cf6", // purple
  "#ef4444", // red
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#22c55e", // green
  "#ec4899", // pink
];

const defaultArcs: StoryArc[] = [];

export default function PlanPage() {
  const [arcs, setArcs] = useState<StoryArc[]>(defaultArcs);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedArcs, setExpandedArcs] = useState<Set<string>>(new Set());
  const [selectedArc, setSelectedArc] = useState<string | null>(null);
  const [selectedBeat, setSelectedBeat] = useState<string | null>(null);
  const [showNewArcForm, setShowNewArcForm] = useState(false);
  const [newArcTitle, setNewArcTitle] = useState("");
  const [newArcDescription, setNewArcDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch entities
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("http://localhost:3088/api/narrative/entities");
        if (res.ok) {
          setEntities(await res.json());
        }
        // TODO: Fetch saved arcs from API
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const toggleArc = (arcId: string) => {
    setExpandedArcs((prev) => {
      const next = new Set(prev);
      if (next.has(arcId)) {
        next.delete(arcId);
      } else {
        next.add(arcId);
      }
      return next;
    });
  };

  const handleCreateArc = () => {
    if (!newArcTitle.trim()) return;

    const newArc: StoryArc = {
      id: `arc_${Date.now()}`,
      title: newArcTitle.trim(),
      description: newArcDescription.trim(),
      beats: [],
      status: "planned",
      entities: [],
      createdAt: Date.now(),
      color: arcColors[arcs.length % arcColors.length],
    };

    setArcs((prev) => [...prev, newArc]);
    setExpandedArcs((prev) => new Set([...Array.from(prev), newArc.id]));
    setSelectedArc(newArc.id);
    setNewArcTitle("");
    setNewArcDescription("");
    setShowNewArcForm(false);
  };

  const handleAddBeat = (arcId: string) => {
    setArcs((prev) =>
      prev.map((arc) => {
        if (arc.id !== arcId) return arc;
        const newBeat: StoryBeat = {
          id: `beat_${Date.now()}`,
          title: `Beat ${arc.beats.length + 1}`,
          description: "",
          status: "planned",
          entities: [],
          order: arc.beats.length,
        };
        return { ...arc, beats: [...arc.beats, newBeat] };
      })
    );
  };

  const handleGenerateBeats = async (arcId: string) => {
    const arc = arcs.find((a) => a.id === arcId);
    if (!arc) return;

    setIsGenerating(true);

    // Simulate AI generation - in real implementation, call API
    await new Promise((r) => setTimeout(r, 2000));

    const generatedBeats: StoryBeat[] = [
      {
        id: `beat_${Date.now()}_1`,
        title: "Setup: Introduce the Conflict",
        description: "Establish the stakes and introduce the central tension that will drive the arc.",
        status: "planned",
        entities: [],
        order: 0,
      },
      {
        id: `beat_${Date.now()}_2`,
        title: "Rising Action: First Complications",
        description: "The protagonist encounters initial obstacles that test their resolve.",
        status: "planned",
        entities: [],
        order: 1,
      },
      {
        id: `beat_${Date.now()}_3`,
        title: "Midpoint: Major Revelation",
        description: "A significant discovery changes the protagonist's understanding of the conflict.",
        status: "planned",
        entities: [],
        order: 2,
      },
      {
        id: `beat_${Date.now()}_4`,
        title: "Crisis: All Seems Lost",
        description: "The protagonist faces their darkest moment as obstacles seem insurmountable.",
        status: "planned",
        entities: [],
        order: 3,
      },
      {
        id: `beat_${Date.now()}_5`,
        title: "Climax: Final Confrontation",
        description: "The protagonist must make a decisive choice and face the central conflict head-on.",
        status: "planned",
        entities: [],
        order: 4,
      },
      {
        id: `beat_${Date.now()}_6`,
        title: "Resolution: New Equilibrium",
        description: "The aftermath of the confrontation and establishment of a new status quo.",
        status: "planned",
        entities: [],
        order: 5,
      },
    ];

    setArcs((prev) =>
      prev.map((a) => {
        if (a.id !== arcId) return a;
        return { ...a, beats: generatedBeats };
      })
    );

    setIsGenerating(false);
  };

  const handleUpdateBeat = (arcId: string, beatId: string, updates: Partial<StoryBeat>) => {
    setArcs((prev) =>
      prev.map((arc) => {
        if (arc.id !== arcId) return arc;
        return {
          ...arc,
          beats: arc.beats.map((beat) =>
            beat.id === beatId ? { ...beat, ...updates } : beat
          ),
        };
      })
    );
  };

  const handleDeleteBeat = (arcId: string, beatId: string) => {
    setArcs((prev) =>
      prev.map((arc) => {
        if (arc.id !== arcId) return arc;
        return {
          ...arc,
          beats: arc.beats.filter((beat) => beat.id !== beatId),
        };
      })
    );
    if (selectedBeat === beatId) setSelectedBeat(null);
  };

  const handleDeleteArc = (arcId: string) => {
    setArcs((prev) => prev.filter((arc) => arc.id !== arcId));
    if (selectedArc === arcId) {
      setSelectedArc(null);
      setSelectedBeat(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <PlayCircle className="h-4 w-4 text-amber-500" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const selectedArcData = arcs.find((a) => a.id === selectedArc);
  const selectedBeatData = selectedArcData?.beats.find((b) => b.id === selectedBeat);

  // Stats
  const totalArcs = arcs.length;
  const totalBeats = arcs.reduce((sum, arc) => sum + arc.beats.length, 0);
  const completedBeats = arcs.reduce(
    (sum, arc) => sum + arc.beats.filter((b) => b.status === "completed").length,
    0
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading story plans...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Story Planner</h1>
          <p className="text-sm text-muted-foreground">
            Design narrative arcs and plan story beats
          </p>
        </div>
        <button
          onClick={() => setShowNewArcForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Arc
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ListTree className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalArcs}</p>
              <p className="text-xs text-muted-foreground">Story Arcs</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalBeats}</p>
              <p className="text-xs text-muted-foreground">Story Beats</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {totalBeats > 0 ? Math.round((completedBeats / totalBeats) * 100) : 0}%
              </p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </div>
          </div>
        </div>
      </div>

      {/* New Arc Form */}
      {showNewArcForm && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="font-medium text-foreground mb-3">Create New Story Arc</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={newArcTitle}
              onChange={(e) => setNewArcTitle(e.target.value)}
              placeholder="Arc title (e.g., 'The Awakening')"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={newArcDescription}
              onChange={(e) => setNewArcDescription(e.target.value)}
              placeholder="Brief description of this story arc..."
              rows={2}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateArc}
                disabled={!newArcTitle.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Create Arc
              </button>
              <button
                onClick={() => {
                  setShowNewArcForm(false);
                  setNewArcTitle("");
                  setNewArcDescription("");
                }}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Arc list */}
        <div className="lg:col-span-2 space-y-4">
          {arcs.length > 0 ? (
            arcs.map((arc) => (
              <div
                key={arc.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                {/* Arc header */}
                <div
                  className={cn(
                    "flex items-center gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/50",
                    selectedArc === arc.id && "bg-muted/50"
                  )}
                  onClick={() => {
                    toggleArc(arc.id);
                    setSelectedArc(arc.id);
                    setSelectedBeat(null);
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleArc(arc.id);
                    }}
                    className="text-muted-foreground"
                  >
                    {expandedArcs.has(arc.id) ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                  </button>
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: arc.color }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">{arc.title}</h3>
                      {getStatusIcon(arc.status)}
                    </div>
                    {arc.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {arc.description}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {arc.beats.length} beats
                  </div>
                </div>

                {/* Arc beats */}
                {expandedArcs.has(arc.id) && (
                  <div className="border-t border-border">
                    {arc.beats.length > 0 ? (
                      <div className="divide-y divide-border">
                        {arc.beats.map((beat, index) => (
                          <div
                            key={beat.id}
                            className={cn(
                              "flex items-start gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/50",
                              selectedBeat === beat.id && "bg-muted/50"
                            )}
                            onClick={() => {
                              setSelectedArc(arc.id);
                              setSelectedBeat(beat.id);
                            }}
                          >
                            <div className="flex flex-col items-center">
                              <div
                                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium"
                                style={{
                                  backgroundColor: `${arc.color}20`,
                                  color: arc.color,
                                }}
                              >
                                {index + 1}
                              </div>
                              {index < arc.beats.length - 1 && (
                                <div
                                  className="w-0.5 flex-1 mt-2"
                                  style={{ backgroundColor: `${arc.color}40` }}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-foreground">
                                  {beat.title}
                                </h4>
                                {getStatusIcon(beat.status)}
                              </div>
                              {beat.description && (
                                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                  {beat.description}
                                </p>
                              )}
                              {beat.entities.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {beat.entities.map((entityId) => {
                                    const entity = entities.find((e) => e.id === entityId);
                                    return entity ? (
                                      <span
                                        key={entityId}
                                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                      >
                                        {entity.name}
                                      </span>
                                    ) : null;
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <Target className="mx-auto h-8 w-8 text-muted-foreground/50" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          No beats in this arc yet
                        </p>
                      </div>
                    )}

                    {/* Arc actions */}
                    <div className="border-t border-border p-3 flex gap-2">
                      <button
                        onClick={() => handleAddBeat(arc.id)}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <Plus className="h-3 w-3" />
                        Add Beat
                      </button>
                      <button
                        onClick={() => handleGenerateBeats(arc.id)}
                        disabled={isGenerating}
                        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-cyan-500 px-3 py-1.5 text-sm font-medium text-white transition-all hover:from-purple-600 hover:to-cyan-600 disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-3 w-3" />
                            Generate Beats
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteArc(arc.id)}
                        className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-500 transition-colors hover:bg-red-500/20 ml-auto"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
              <ListTree className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-medium text-foreground">No story arcs yet</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                Story arcs help you plan the major narrative threads in your world.
                Each arc contains beats that define key story moments.
              </p>
              <button
                onClick={() => setShowNewArcForm(true)}
                className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground mx-auto transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Create Your First Arc
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedBeatData && selectedArcData ? (
            <div className="rounded-xl border border-border bg-card sticky top-6">
              <div className="border-b border-border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Beat Details</h3>
                  <div className="flex gap-1">
                    <button className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBeat(selectedArcData.id, selectedBeatData.id)}
                      className="rounded p-1 text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <input
                    type="text"
                    value={selectedBeatData.title}
                    onChange={(e) =>
                      handleUpdateBeat(selectedArcData.id, selectedBeatData.id, {
                        title: e.target.value,
                      })
                    }
                    className="w-full font-medium text-foreground bg-transparent border-none focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    value={selectedBeatData.description}
                    onChange={(e) =>
                      handleUpdateBeat(selectedArcData.id, selectedBeatData.id, {
                        description: e.target.value,
                      })
                    }
                    placeholder="Describe what happens in this beat..."
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select
                    value={selectedBeatData.status}
                    onChange={(e) =>
                      handleUpdateBeat(selectedArcData.id, selectedBeatData.id, {
                        status: e.target.value as StoryBeat["status"],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Involved Entities
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entities.slice(0, 6).map((entity) => (
                      <button
                        key={entity.id}
                        onClick={() => {
                          const currentEntities = selectedBeatData.entities;
                          const newEntities = currentEntities.includes(entity.id)
                            ? currentEntities.filter((e) => e !== entity.id)
                            : [...currentEntities, entity.id];
                          handleUpdateBeat(selectedArcData.id, selectedBeatData.id, {
                            entities: newEntities,
                          });
                        }}
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
                          selectedBeatData.entities.includes(entity.id)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {entity.type === "character" && <Users className="h-3 w-3" />}
                        {entity.type === "location" && <MapPin className="h-3 w-3" />}
                        {entity.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-border space-y-2">
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-cyan-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-purple-600 hover:to-cyan-600">
                    <Sparkles className="h-4 w-4" />
                    Generate Scene
                  </button>
                  <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                    <Link2 className="h-4 w-4" />
                    Link to Content
                  </button>
                </div>
              </div>
            </div>
          ) : selectedArcData ? (
            <div className="rounded-xl border border-border bg-card sticky top-6">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Arc Overview</h3>
              </div>
              <div className="p-4 space-y-4">
                <div
                  className="flex items-center gap-3 rounded-lg p-3"
                  style={{ backgroundColor: `${selectedArcData.color}10` }}
                >
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${selectedArcData.color}20` }}
                  >
                    <ListTree className="h-5 w-5" style={{ color: selectedArcData.color }} />
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">{selectedArcData.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      {selectedArcData.beats.length} beats
                    </p>
                  </div>
                </div>

                {selectedArcData.description && (
                  <p className="text-sm text-muted-foreground">{selectedArcData.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="font-medium text-foreground capitalize">
                      {selectedArcData.status.replace("_", " ")}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-xs text-muted-foreground">Progress</p>
                    <p className="font-medium text-foreground">
                      {selectedArcData.beats.length > 0
                        ? Math.round(
                            (selectedArcData.beats.filter((b) => b.status === "completed").length /
                              selectedArcData.beats.length) *
                              100
                          )
                        : 0}
                      %
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold text-foreground">Select a Beat</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Click on a story beat to view and edit its details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

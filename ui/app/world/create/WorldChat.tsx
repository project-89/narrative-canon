"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  GitBranch,
  GitCommit,
  History,
  Sparkles,
  X,
  ChevronRight,
  ChevronLeft,
  Users,
  MapPin,
  Lightbulb,
  Clock,
  BookOpen,
  Wand2,
  PanelRightOpen,
  PanelRightClose,
  PanelLeftOpen,
  PanelLeftClose,
  GitMerge,
  Link2,
  Circle,
  Play,
  Trash2,
  Building2,
  Zap,
  Box,
  Calendar,
  RotateCcw,
  Target,
  Pencil,
  AlertCircle,
  CheckCircle2,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

// Dynamically import MiniGraph to avoid SSR issues with ReactFlow
const MiniGraph = dynamic(() => import("./MiniGraph").then(mod => mod.MiniGraph), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading graph...</div>
});

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  extractedEntities?: Array<{ name: string; type: string; description: string }>;
  extractedRelationships?: Array<{ source: string; target: string; type: string }>;
  narrative?: {
    focusedEntities: string[];
    operationType: "elaboration" | "event";
    eventDescription?: string;
    suggestCommit: boolean;
  };
}

interface WorldState {
  entityCount: number;
  relationshipCount: number;
  currentBranch: string;
  uncommittedChanges: boolean;
  themes: string[];
  currentFocus?: string[];
  canonCount?: number;
}

interface NarrativeState {
  focusedEntities: string[];
  operationType: "elaboration" | "event";
  eventDescription?: string;
  suggestCommit: boolean;
  canonNotes?: string;
}

interface Commit {
  id: string;
  message: string;
  branch: string;
  timestamp: number;
  entityCount: number;
  relationshipCount: number;
  // Delta info - what changed in this commit
  delta?: {
    addedEntities: Array<{ id: string; name: string; type: string; description?: string }>;
    modifiedEntities: Array<{ id: string; name: string; type: string; description?: string }>;
    addedRelationships: Array<{ id: string; sourceName: string; targetName: string; type: string }>;
  };
  stats?: {
    entitiesAdded: number;
    entitiesModified: number;
    relationshipsAdded: number;
  };
}

interface Branch {
  name: string;
  commitCount: number;
  isCurrent: boolean;
  isCanon: boolean;
}

interface WorldEntity {
  id: string;
  name: string;
  type: string;
  description?: string;
  traits?: string[];
  // Extended fields for richer entity tracking
  backstory?: string;
  motivations?: string[];
  secrets?: string[];
  status?: string; // e.g., "alive", "deceased", "unknown", "active", "dormant"
  firstMentioned?: number; // timestamp when first created
  lastUpdated?: number; // timestamp when last modified
  mentions?: number; // how many times this entity has been discussed
  commitHistory?: string[]; // IDs of commits that touched this entity
  isCanon?: boolean; // whether this entity is committed to canon
  notes?: string; // additional freeform notes
}

interface WorldRelationship {
  id: string;
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  type: string;
}

interface StoryEvent {
  id: string;
  content: string;
  timestamp: number;
  operationType: "elaboration" | "event";
  isEvent: boolean;
  focusedEntities: string[];
  entitiesMentioned: string[];
  relationshipsFormed: number;
  sequenceNumber?: number;
}

interface StoryData {
  storyEvents: StoryEvent[];
  fullStory: Array<StoryEvent & { sequenceNumber: number }>;
  milestones: Array<{ id: string; type: string; message: string; timestamp: number; entityCount: number; relationshipCount: number }>;
  stats: {
    totalEvents: number;
    totalElaborations: number;
    totalExchanges: number;
    uniqueEntitiesFocused: number;
  };
}

// Merge conflict types
interface EntityConflict {
  entityId: string;
  entityName: string;
  entityType: string;
  field: string;
  baseValue: any;
  mainValue: any;
  branchValue: any;
  resolution?: "main" | "branch" | "custom" | "ai";
  resolvedValue?: any;
}

interface MergePreview {
  sourceBranch: string;
  targetBranch: string;
  canAutoMerge: boolean;
  conflicts: EntityConflict[];
  additions: Array<{ id: string; name: string; type: string; source: "main" | "branch" }>;
  modifications: Array<{ id: string; name: string; field: string; source: "main" | "branch" }>;
}

// Proposed changes from AI that need user confirmation
interface ProposedChange {
  id: string;
  type: "add_entity" | "update_entity" | "add_relationship";
  entity?: WorldEntity & { updateReason?: string };
  relationship?: WorldRelationship & { description?: string };
  existingEntity?: WorldEntity; // For updates, shows current state
  status: "pending" | "accepted" | "rejected";
  messageId?: string;
}

// Entity detail for exploration
interface EntityDetail {
  entity: WorldEntity & { isCanon: boolean };
  relationships: Array<WorldRelationship & { direction: "incoming" | "outgoing"; otherEntity?: WorldEntity }>;
  relatedEntities: WorldEntity[];
}

const entityTypeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  character: { icon: Users, color: "text-cyan-400", bg: "bg-cyan-500/20" },
  location: { icon: MapPin, color: "text-emerald-400", bg: "bg-emerald-500/20" },
  organization: { icon: Building2, color: "text-blue-400", bg: "bg-blue-500/20" },
  faction: { icon: Building2, color: "text-blue-400", bg: "bg-blue-500/20" },
  object: { icon: Box, color: "text-amber-400", bg: "bg-amber-500/20" },
  artifact: { icon: Sparkles, color: "text-amber-400", bg: "bg-amber-500/20" },
  concept: { icon: Lightbulb, color: "text-purple-400", bg: "bg-purple-500/20" },
  event: { icon: Calendar, color: "text-rose-400", bg: "bg-rose-500/20" },
  creature: { icon: Zap, color: "text-orange-400", bg: "bg-orange-500/20" },
};

export default function WorldChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [worldState, setWorldState] = useState<WorldState>({
    entityCount: 0,
    relationshipCount: 0,
    currentBranch: "main",
    uncommittedChanges: false,
    themes: [],
  });
  const [suggestedDirections, setSuggestedDirections] = useState<string[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(true); // Narrative timeline drawer
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null); // For focusing on a story beat
  const [drawerTab, setDrawerTab] = useState<"entities" | "relationships" | "graph" | "story">("entities");
  const [timeline, setTimeline] = useState<{ commits: Commit[]; branches: Branch[] }>({
    commits: [],
    branches: [],
  });
  const [worldEntities, setWorldEntities] = useState<WorldEntity[]>([]);
  const [worldRelationships, setWorldRelationships] = useState<WorldRelationship[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [narrativeState, setNarrativeState] = useState<NarrativeState | null>(null);
  const [pendingCommit, setPendingCommit] = useState<{ suggested: boolean; eventDescription?: string } | null>(null);
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  // Merge state
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [mergeResolutions, setMergeResolutions] = useState<Map<string, EntityConflict>>(new Map());
  const [isMerging, setIsMerging] = useState(false);
  const [isLoadingAiResolution, setIsLoadingAiResolution] = useState<string | null>(null);

  // Proposal confirmation state
  const [pendingProposals, setPendingProposals] = useState<ProposedChange[]>([]);
  const [processingProposal, setProcessingProposal] = useState<string | null>(null);

  // Entity exploration state
  const [entityDetailStack, setEntityDetailStack] = useState<EntityDetail[]>([]); // Navigation stack
  const [drawerWidth, setDrawerWidth] = useState(320); // Resizable drawer width
  const [isResizing, setIsResizing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  // Load conversation history and world state on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        // Load conversation history
        const historyRes = await fetch("http://localhost:3088/api/narrative/history");
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData.messages && historyData.messages.length > 0) {
            // Convert server messages to our Message format
            const loadedMessages: Message[] = historyData.messages.map((m: any, i: number) => ({
              id: `msg_loaded_${i}`,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              extractedEntities: m.extractedEntities,
              extractedRelationships: m.extractedRelationships,
              narrative: m.focus ? {
                focusedEntities: m.focus,
                operationType: m.operationType || 'elaboration',
                suggestCommit: false,
              } : undefined,
            }));
            setMessages(loadedMessages);
            console.log(`📜 Restored ${loadedMessages.length} messages from history`);
          }

          // Set world context
          if (historyData.worldContext?.themes) {
            setWorldState(prev => ({
              ...prev,
              themes: historyData.worldContext.themes,
            }));
          }

          // Set narrative focus
          if (historyData.currentFocus?.length > 0) {
            setNarrativeState({
              focusedEntities: historyData.currentFocus,
              operationType: 'elaboration',
              suggestCommit: false,
            });
          }
        }

        // Load world state
        const worldRes = await fetch("http://localhost:3088/api/narrative/world");
        if (worldRes.ok) {
          const worldData = await worldRes.json();
          setWorldState(prev => ({
            ...prev,
            entityCount: worldData.stats?.entityCount || worldData.entities?.length || 0,
            relationshipCount: worldData.stats?.relationshipCount || worldData.relationships?.length || 0,
            currentBranch: worldData.currentBranch || 'main',
            uncommittedChanges: worldData.uncommittedChanges || false,
            themes: worldData.themes || prev.themes,
          }));
        }
      } catch (error) {
        console.error("Failed to load session:", error);
      }
    };

    loadSession();
  }, []);

  // Load world data when drawer opens
  useEffect(() => {
    if (drawerOpen) {
      loadWorld();
    }
  }, [drawerOpen]);

  // Also refresh world data when world state changes
  useEffect(() => {
    if (drawerOpen && worldState.entityCount > 0) {
      loadWorld();
    }
  }, [worldState.entityCount, worldState.relationshipCount]);

  // Load story data when story tab is selected
  useEffect(() => {
    if (drawerOpen && drawerTab === "story") {
      loadStory();
    }
  }, [drawerOpen, drawerTab]);

  // Load timeline for left drawer (loads on mount and when left drawer opens)
  useEffect(() => {
    if (leftDrawerOpen) {
      loadTimeline();
    }
  }, [leftDrawerOpen]);

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:3088/api/narrative/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();

      // Use server's messageId to link assistant message with its proposals
      const messageId = data.messageId || `msg_${Date.now()}_assistant`;

      const assistantMessage: Message = {
        id: messageId,
        role: "assistant",
        content: data.response,
        timestamp: Date.now(),
        extractedEntities: data.extracted?.entities,
        extractedRelationships: data.extracted?.relationships,
        narrative: data.narrative,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setWorldState(data.worldState);
      setSuggestedDirections(data.suggestedDirections || []);

      // Handle pending proposals - these need user confirmation
      // Proposals already have messageId from server, matching assistantMessage.id
      if (data.pendingProposals && data.pendingProposals.length > 0) {
        setPendingProposals(prev => [...prev, ...data.pendingProposals]);
      }

      // Update narrative state
      if (data.narrative) {
        setNarrativeState(data.narrative);

        // If an event occurred and commit is suggested, show prompt
        if (data.narrative.suggestCommit && data.narrative.operationType === "event") {
          setPendingCommit({
            suggested: true,
            eventDescription: data.narrative.eventDescription,
          });
        } else {
          setPendingCommit(null);
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_error`,
          role: "system",
          content: "Something went wrong. Make sure the server is running on port 3088.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMessage || `World state commit` }),
      });

      if (!response.ok) throw new Error("Failed to commit");

      const data = await response.json();
      setWorldState((prev) => ({ ...prev, uncommittedChanges: false }));
      setShowCommitDialog(false);
      setCommitMessage("");
      setPendingCommit(null); // Clear the pending commit suggestion

      // Reload timeline to show new commit
      loadTimeline();

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_system`,
          role: "system",
          content: `Committed: "${data.commit.message}"`,
          timestamp: Date.now(),
        },
      ]);
    } catch (error) {
      console.error("Commit error:", error);
    }
  };

  const handleDeleteCommit = async (commitId: string) => {
    if (!confirm("Delete this commit? This cannot be undone.")) return;

    try {
      const response = await fetch(`http://localhost:3088/api/narrative/commit/${commitId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete commit");

      // Reload timeline
      loadTimeline();
      loadWorld();
    } catch (error) {
      console.error("Delete commit error:", error);
    }
  };

  // === PROPOSAL HANDLING ===

  const handleProposalDecision = async (proposalId: string, decision: "accept" | "reject", reason?: string) => {
    setProcessingProposal(proposalId);
    try {
      const response = await fetch(`http://localhost:3088/api/narrative/proposals/${proposalId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });

      if (!response.ok) throw new Error("Failed to process decision");

      const data = await response.json();

      // Remove from pending proposals
      setPendingProposals(prev => prev.filter(p => p.id !== proposalId));

      // Update world state if changed
      if (data.worldState) {
        setWorldState(prev => ({
          ...prev,
          entityCount: data.worldState.entityCount,
          relationshipCount: data.worldState.relationshipCount,
          uncommittedChanges: data.worldState.uncommittedChanges,
        }));
      }

      // Reload world data to show new entities
      if (decision === "accept") {
        loadWorld();
      }
    } catch (error) {
      console.error("Proposal decision error:", error);
    } finally {
      setProcessingProposal(null);
    }
  };

  const handleAcceptAll = async () => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/proposals/accept-all", {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to accept all");

      const data = await response.json();
      setPendingProposals([]);

      if (data.worldState) {
        setWorldState(prev => ({
          ...prev,
          entityCount: data.worldState.entityCount,
          relationshipCount: data.worldState.relationshipCount,
          uncommittedChanges: data.worldState.uncommittedChanges,
        }));
      }

      loadWorld();
    } catch (error) {
      console.error("Accept all error:", error);
    }
  };

  const handleRejectAll = async () => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/proposals/reject-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected in batch" }),
      });

      if (!response.ok) throw new Error("Failed to reject all");

      setPendingProposals([]);
    } catch (error) {
      console.error("Reject all error:", error);
    }
  };

  // === ENTITY EXPLORATION ===

  const openEntityDetail = async (entityId: string) => {
    try {
      const response = await fetch(`http://localhost:3088/api/narrative/entities/${entityId}/detail`);
      if (!response.ok) throw new Error("Failed to load entity detail");

      const data: EntityDetail = await response.json();

      // Push to navigation stack
      setEntityDetailStack(prev => [...prev, data]);

      // Set focus on the server
      await fetch("http://localhost:3088/api/narrative/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId }),
      });
    } catch (error) {
      console.error("Entity detail error:", error);
    }
  };

  const navigateBack = () => {
    setEntityDetailStack(prev => prev.slice(0, -1));
  };

  const navigateToRoot = () => {
    setEntityDetailStack([]);
    // Clear focus on the server
    fetch("http://localhost:3088/api/narrative/focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId: null }),
    });
  };

  // === DRAWER RESIZE ===

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      setDrawerWidth(Math.min(Math.max(280, newWidth), 600));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleBranch = async () => {
    if (!branchName.trim()) return;

    try {
      const response = await fetch("http://localhost:3088/api/narrative/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: branchName }),
      });

      if (!response.ok) throw new Error("Failed to create branch");

      setWorldState((prev) => ({
        ...prev,
        currentBranch: branchName,
        uncommittedChanges: false,
      }));
      setShowBranchDialog(false);
      setBranchName("");

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_system`,
          role: "system",
          content: `Branched to: "${branchName}" - exploring a new timeline`,
          timestamp: Date.now(),
        },
      ]);
    } catch (error) {
      console.error("Branch error:", error);
    }
  };

  // Branch from a specific commit (for going back and editing earlier story beats)
  const handleBranchFrom = async (commitId: string, name: string) => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, fromCommit: commitId }),
      });

      if (!response.ok) throw new Error("Failed to create branch from commit");

      const commit = timeline.commits.find(c => c.id === commitId);

      setWorldState((prev) => ({
        ...prev,
        currentBranch: name,
        uncommittedChanges: false,
      }));

      // Reload world data since we've restored to a previous state
      loadWorld();
      loadTimeline();

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_system`,
          role: "system",
          content: `Branched to "${name}" from: "${commit?.message || commitId}" - editing this point in the story`,
          timestamp: Date.now(),
        },
      ]);
    } catch (error) {
      console.error("Branch from commit error:", error);
    }
  };

  // Preview merge - detect conflicts
  const previewMerge = async (sourceBranch: string) => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/merge/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBranch, targetBranch: "main" }),
      });

      if (!response.ok) throw new Error("Failed to preview merge");

      const preview: MergePreview = await response.json();
      setMergePreview(preview);

      // Initialize resolutions map with conflicts
      const initialResolutions = new Map<string, EntityConflict>();
      for (const conflict of preview.conflicts) {
        const key = `${conflict.entityId}-${conflict.field}`;
        initialResolutions.set(key, { ...conflict });
      }
      setMergeResolutions(initialResolutions);

      setShowMergeDialog(true);
    } catch (error) {
      console.error("Merge preview error:", error);
    }
  };

  // Execute merge with resolutions
  const executeMerge = async () => {
    if (!mergePreview) return;

    setIsMerging(true);
    try {
      // Convert resolutions map to array
      const resolutions = Array.from(mergeResolutions.values())
        .filter((r) => r.resolution) // Only include resolved conflicts
        .map((r) => ({
          entityId: r.entityId,
          field: r.field,
          resolution: r.resolution,
          resolvedValue: r.resolvedValue,
        }));

      const response = await fetch("http://localhost:3088/api/narrative/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBranch: mergePreview.sourceBranch,
          targetBranch: mergePreview.targetBranch,
          resolutions,
        }),
      });

      if (!response.ok) throw new Error("Failed to execute merge");

      const data = await response.json();

      // Update world state
      setWorldState((prev) => ({
        ...prev,
        currentBranch: data.worldState.currentBranch,
        entityCount: data.worldState.entityCount,
        relationshipCount: data.worldState.relationshipCount,
        uncommittedChanges: false,
      }));

      // Reload data
      loadWorld();
      loadTimeline();

      // Add system message
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_system`,
          role: "system",
          content: `Merged branch '${mergePreview.sourceBranch}' into ${mergePreview.targetBranch}`,
          timestamp: Date.now(),
        },
      ]);

      // Close dialog
      setShowMergeDialog(false);
      setMergePreview(null);
      setMergeResolutions(new Map());
    } catch (error) {
      console.error("Merge error:", error);
    } finally {
      setIsMerging(false);
    }
  };

  // AI-assisted conflict resolution
  const resolveWithAI = async (conflict: EntityConflict) => {
    const key = `${conflict.entityId}-${conflict.field}`;
    setIsLoadingAiResolution(key);

    try {
      const response = await fetch("http://localhost:3088/api/narrative/merge/resolve-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conflict }),
      });

      if (!response.ok) throw new Error("AI resolution failed");

      const data = await response.json();

      // Update the resolution
      setMergeResolutions((prev) => {
        const updated = new Map(prev);
        updated.set(key, {
          ...conflict,
          resolution: "ai",
          resolvedValue: data.resolvedValue,
        });
        return updated;
      });
    } catch (error) {
      console.error("AI resolution error:", error);
    } finally {
      setIsLoadingAiResolution(null);
    }
  };

  // Set a manual resolution
  const setResolution = (conflict: EntityConflict, resolution: "main" | "branch" | "custom", customValue?: any) => {
    const key = `${conflict.entityId}-${conflict.field}`;
    setMergeResolutions((prev) => {
      const updated = new Map(prev);
      updated.set(key, {
        ...conflict,
        resolution,
        resolvedValue: resolution === "main" ? conflict.mainValue : resolution === "branch" ? conflict.branchValue : customValue,
      });
      return updated;
    });
  };

  const loadTimeline = async () => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/timeline");
      if (!response.ok) throw new Error("Failed to load timeline");
      const data = await response.json();
      setTimeline(data);
      setShowTimeline(true);
    } catch (error) {
      console.error("Timeline error:", error);
    }
  };

  const loadWorld = async () => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/world");
      if (!response.ok) throw new Error("Failed to load world");
      const data = await response.json();
      setWorldEntities(data.entities || []);
      setWorldRelationships(data.relationships || []);
    } catch (error) {
      console.error("World error:", error);
    }
  };

  const loadStory = async () => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/story");
      if (!response.ok) throw new Error("Failed to load story");
      const data = await response.json();
      setStoryData(data);
    } catch (error) {
      console.error("Story error:", error);
    }
  };

  const generateScene = async (focus?: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:3088/api/narrative/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus }),
      });

      if (!response.ok) throw new Error("Failed to generate scene");

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_scene`,
          role: "assistant",
          content: `*A scene unfolds...*\n\n${data.scene}`,
          timestamp: Date.now(),
        },
      ]);
    } catch (error) {
      console.error("Scene error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const editEntityWithAI = async (entityId: string, instruction: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3088/api/narrative/entity/${entityId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });

      if (!response.ok) throw new Error("Failed to edit entity");

      const data = await response.json();

      setWorldEntities((prev) =>
        prev.map((e) => (e.id === entityId ? data.entity : e))
      );
      setWorldState((prev) => ({ ...prev, uncommittedChanges: true }));

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_system`,
          role: "system",
          content: `Updated "${data.entity.name}": ${instruction}`,
          timestamp: Date.now(),
        },
      ]);
    } catch (error) {
      console.error("Edit entity error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteEntity = async (entityId: string) => {
    try {
      const response = await fetch(`http://localhost:3088/api/narrative/entity/${entityId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete entity");

      const data = await response.json();

      setWorldEntities((prev) => prev.filter((e) => e.id !== entityId));
      setWorldRelationships((prev) =>
        prev.filter((r) => r.source !== entityId && r.target !== entityId)
      );
      setWorldState((prev) => ({
        ...prev,
        entityCount: prev.entityCount - 1,
        uncommittedChanges: true,
      }));

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_system`,
          role: "system",
          content: `Removed "${data.removedEntity.name}" from the world`,
          timestamp: Date.now(),
        },
      ]);
    } catch (error) {
      console.error("Delete entity error:", error);
    }
  };

  const resetWorld = async () => {
    try {
      const response = await fetch("http://localhost:3088/api/narrative/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepCommits: false }),
      });

      if (!response.ok) throw new Error("Failed to reset world");

      const data = await response.json();

      // Clear local state
      setMessages([]);
      setWorldState(data.worldState);
      setWorldEntities([]);
      setWorldRelationships([]);
      setSuggestedDirections([]);
      setShowResetDialog(false);
      setDrawerOpen(false);
    } catch (error) {
      console.error("Reset error:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Get entity types for filter
  const entityTypes = ["all", ...Array.from(new Set(worldEntities.map((e) => e.type)))];
  const filteredEntities =
    entityFilter === "all"
      ? worldEntities
      : worldEntities.filter((e) => e.type === entityFilter);

  // Group entities by type for display
  const entitiesByType = filteredEntities.reduce((acc, entity) => {
    if (!acc[entity.type]) acc[entity.type] = [];
    acc[entity.type].push(entity);
    return acc;
  }, {} as Record<string, WorldEntity[]>);

  const getEntityConfig = (type: string) =>
    entityTypeConfig[type] || { icon: Sparkles, color: "text-gray-400", bg: "bg-gray-500/20" };

  // Welcome screen if no messages
  if (messages.length === 0) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex flex-col">
        {/* Header */}
        <header className="border-b border-gray-800/50 bg-gray-900/30 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h1 className="font-semibold text-gray-100">World Builder</h1>
                <p className="text-xs text-gray-500">Collaborative narrative creation</p>
              </div>
            </div>
          </div>
        </header>

        {/* Welcome content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full text-center space-y-8">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full scale-150" />
              <Sparkles className="w-20 h-20 mx-auto text-cyan-500/60 relative" />
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                Build a World Together
              </h1>
              <p className="text-lg text-gray-400 leading-relaxed max-w-xl mx-auto">
                Describe your vision. I'll help shape it, add to it, question it.
                <br />
                <span className="text-gray-500">Every idea becomes part of a living world.</span>
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="A world where sound is the fundamental force of reality..."
                  className={cn(
                    "relative w-full px-5 py-4 rounded-2xl text-lg resize-none",
                    "bg-gray-900/80 backdrop-blur-sm border border-gray-800",
                    "text-gray-200 placeholder-gray-600",
                    "focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20",
                    "transition-all min-h-[100px]"
                  )}
                  disabled={isLoading}
                />
              </div>
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className={cn(
                  "w-full px-6 py-4 rounded-2xl text-lg font-medium transition-all",
                  "bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20",
                  "border border-cyan-500/30 text-cyan-400",
                  "hover:from-cyan-500/30 hover:via-blue-500/30 hover:to-cyan-500/30",
                  "hover:border-cyan-400/50 hover:text-cyan-300",
                  "disabled:opacity-50"
                )}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    The world stirs...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Begin Creating
                  </span>
                )}
              </button>
            </div>

            <div className="pt-6 border-t border-gray-800/50">
              <p className="text-xs text-gray-600 uppercase tracking-wider mb-4">Or start with a seed</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "A city where memories are currency",
                  "The last lighthouse keeper",
                  "A war fought in dreams",
                  "The machine that grants wishes",
                ].map((seed) => (
                  <button
                    key={seed}
                    onClick={() => sendMessage(seed)}
                    disabled={isLoading}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm transition-all",
                      "bg-gray-900/50 border border-gray-800",
                      "text-gray-400 hover:text-gray-200",
                      "hover:bg-gray-800/80 hover:border-gray-700",
                      "disabled:opacity-50"
                    )}
                  >
                    {seed}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-950 flex">
      {/* LEFT DRAWER - Narrative Timeline */}
      <div className={cn(
        "h-full bg-gray-900/50 border-r border-gray-800/50 flex flex-col transition-all duration-300 overflow-hidden",
        leftDrawerOpen ? "w-72" : "w-0"
      )}>
        {leftDrawerOpen && (
          <>
            {/* Left Drawer Header */}
            <div className="p-3 border-b border-gray-800/50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span className="font-medium text-gray-200 text-sm">Narrative Timeline</span>
              </div>
              <button
                onClick={() => setLeftDrawerOpen(false)}
                className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Branch selector */}
            <div className="p-3 border-b border-gray-800/50 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs">
                <GitBranch className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">{worldState.currentBranch}</span>
                {timeline.branches.length > 1 && (
                  <span className="text-gray-500">+{timeline.branches.length - 1} branches</span>
                )}
              </div>
            </div>

            {/* Timeline content */}
            <div className="flex-1 overflow-y-auto p-3">
              {timeline.commits.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Circle className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No story beats yet</p>
                  <p className="text-xs text-gray-600 mt-1">Events will appear here</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-700" />

                  <div className="space-y-3">
                    {/* Reverse to show oldest first (story order) */}
                    {[...timeline.commits].reverse().map((commit, idx) => {
                      const isSelected = selectedCommitId === commit.id;
                      const isLatest = idx === timeline.commits.length - 1;
                      const hasChanges = commit.stats && (commit.stats.entitiesAdded > 0 || commit.stats.entitiesModified > 0);

                      return (
                        <div
                          key={commit.id}
                          className={cn(
                            "relative pl-8 cursor-pointer group",
                            isSelected && "bg-purple-500/10 -mx-3 px-3 pl-11 py-2 rounded-lg"
                          )}
                          onClick={() => setSelectedCommitId(isSelected ? null : commit.id)}
                        >
                          {/* Timeline node */}
                          <div className={cn(
                            "absolute left-1.5 top-1 w-4 h-4 rounded-full border-2 transition-all",
                            isLatest
                              ? "bg-emerald-500 border-emerald-400"
                              : isSelected
                              ? "bg-purple-500 border-purple-400"
                              : "bg-gray-800 border-gray-600 group-hover:border-gray-500"
                          )}>
                            {isLatest && <Play className="w-2 h-2 text-white absolute top-0.5 left-0.5" />}
                          </div>

                          {/* Content */}
                          <div className="min-w-0">
                            <p className={cn(
                              "text-sm leading-snug line-clamp-2",
                              isSelected ? "text-purple-200" : "text-gray-300 group-hover:text-gray-200"
                            )}>
                              {commit.message}
                            </p>

                            {/* Delta badges */}
                            {hasChanges && (
                              <div className="flex gap-1 mt-1">
                                {commit.stats!.entitiesAdded > 0 && (
                                  <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                                    +{commit.stats!.entitiesAdded}
                                  </span>
                                )}
                                {commit.stats!.entitiesModified > 0 && (
                                  <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                    ~{commit.stats!.entitiesModified}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Expand actions when selected */}
                            {isSelected && (
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const defaultName = `edit-${commit.message.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                                    const name = window.prompt("Branch name:", defaultName);
                                    if (name) {
                                      handleBranchFrom(commit.id, name);
                                      setSelectedCommitId(null);
                                    }
                                  }}
                                  className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 flex items-center gap-1"
                                >
                                  <GitBranch className="w-3 h-3" />
                                  Branch here
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Focus on this story beat for elaboration
                                    setInput(`Let's elaborate on: "${commit.message}"`);
                                  }}
                                  className="text-xs px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 flex items-center gap-1"
                                >
                                  <Pencil className="w-3 h-3" />
                                  Elaborate
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Current position indicator */}
                  {worldState.uncommittedChanges && (
                    <div className="relative pl-8 mt-3">
                      <div className="absolute left-1.5 top-1 w-4 h-4 rounded-full border-2 border-dashed border-amber-500 bg-gray-900" />
                      <p className="text-xs text-amber-400 italic">Uncommitted changes...</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Left Drawer Footer */}
            <div className="p-3 border-t border-gray-800/50 flex-shrink-0 space-y-2">
              {/* Merge button - only show when on a branch that's not main */}
              {worldState.currentBranch !== "main" && (
                <button
                  onClick={() => previewMerge(worldState.currentBranch)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 transition-all"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  Merge into main
                </button>
              )}
              <div className="text-xs text-gray-500 flex items-center justify-between">
                <span>{timeline.commits.length} story beats</span>
                <button
                  onClick={loadTimeline}
                  className="text-gray-400 hover:text-gray-200"
                >
                  Refresh
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main content area */}
      <div className={cn("flex-1 flex flex-col transition-all duration-300", drawerOpen ? "mr-80" : "mr-0")}>
        {/* Header */}
        <header className="border-b border-gray-800/50 bg-gray-900/30 backdrop-blur-sm px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-100 text-sm">World Builder</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    {worldState.currentBranch}
                  </span>
                  {worldState.uncommittedChanges && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Uncommitted changes" />
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{worldState.entityCount} elements</span>
                  <span>{worldState.relationshipCount} connections</span>
                  {worldState.canonCount !== undefined && worldState.canonCount > 0 && (
                    <span className="text-emerald-500">{worldState.canonCount} canon</span>
                  )}
                </div>
                {/* Current focus indicator */}
                {narrativeState?.focusedEntities && narrativeState.focusedEntities.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Target className="w-3 h-3 text-cyan-500" />
                    <span className="text-xs text-cyan-400/70">
                      {narrativeState.focusedEntities.slice(0, 3).join(", ")}
                      {narrativeState.focusedEntities.length > 3 && ` +${narrativeState.focusedEntities.length - 3}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Left drawer toggle - Story */}
              <button
                onClick={() => {
                  setLeftDrawerOpen(!leftDrawerOpen);
                  if (!leftDrawerOpen) loadTimeline(); // Load when opening
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
                  leftDrawerOpen
                    ? "bg-purple-500/20 border border-purple-500/30 text-purple-400"
                    : "bg-gray-800/50 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                )}
              >
                {leftDrawerOpen ? <PanelLeftClose className="w-3 h-3" /> : <PanelLeftOpen className="w-3 h-3" />}
                Story
              </button>
              <button
                onClick={() => setShowCommitDialog(true)}
                disabled={!worldState.uncommittedChanges}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
                  worldState.uncommittedChanges
                    ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30"
                    : "bg-gray-800/50 border border-gray-700 text-gray-500"
                )}
              >
                <GitCommit className="w-3 h-3" />
                Commit
              </button>
              <button
                onClick={() => setShowBranchDialog(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-gray-800/50 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-all"
              >
                <GitBranch className="w-3 h-3" />
                Branch
              </button>
              <button
                onClick={() => setShowResetDialog(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-gray-800/50 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/30 transition-all"
                title="Start a new world"
              >
                <RotateCcw className="w-3 h-3" />
                New
              </button>
              <button
                onClick={() => setDrawerOpen(!drawerOpen)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
                  drawerOpen
                    ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400"
                    : "bg-gray-800/50 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
                )}
              >
                {drawerOpen ? <PanelRightClose className="w-3 h-3" /> : <PanelRightOpen className="w-3 h-3" />}
                World
              </button>
            </div>
          </div>
        </header>

        {/* Event/Commit Suggestion Bar */}
        {pendingCommit?.suggested && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-300">
                <strong>Event detected:</strong> {pendingCommit.eventDescription || "Something significant happened"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCommitMessage(pendingCommit.eventDescription || "");
                  setShowCommitDialog(true);
                }}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-all flex items-center gap-1.5"
              >
                <GitCommit className="w-3 h-3" />
                Commit Event
              </button>
              <button
                onClick={() => setPendingCommit(null)}
                className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-4",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-cyan-500/20 border border-cyan-500/30 text-gray-100"
                      : message.role === "system"
                      ? "bg-gray-800/50 border border-gray-700 text-gray-400 text-sm italic"
                      : "bg-gray-800/50 border border-gray-700/50 text-gray-200"
                  )}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>

                  {/* Narrative type indicator */}
                  {message.role === "assistant" && message.narrative && (
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      {message.narrative.operationType === "event" ? (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Zap className="w-3 h-3" />
                          Event
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Pencil className="w-3 h-3" />
                          Elaboration
                        </span>
                      )}
                      {message.narrative.focusedEntities?.length > 0 && (
                        <span className="text-gray-500">
                          · Focus: {message.narrative.focusedEntities.slice(0, 2).join(", ")}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Inline Proposals for this message */}
                  {(() => {
                    const messageProposals = pendingProposals.filter(
                      (p) => p.messageId === message.id && p.status === "pending"
                    );
                    if (messageProposals.length === 0) return null;
                    return (
                      <div className="mt-3 pt-3 border-t border-amber-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-amber-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {messageProposals.length} proposed change{messageProposals.length !== 1 ? 's' : ''}
                          </div>
                          {messageProposals.length > 1 && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  messageProposals.forEach((p) =>
                                    handleProposalDecision(p.id, "accept")
                                  );
                                }}
                                className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                              >
                                Accept All
                              </button>
                              <button
                                onClick={() => {
                                  messageProposals.forEach((p) =>
                                    handleProposalDecision(p.id, "reject")
                                  );
                                }}
                                className="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30"
                              >
                                Reject All
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          {messageProposals.map((proposal) => {
                            const isProcessing = processingProposal === proposal.id;
                            const config = proposal.entity
                              ? getEntityConfig(proposal.entity.type)
                              : { icon: Link2, color: "text-gray-400", bg: "bg-gray-500/20" };
                            const Icon = config.icon;

                            return (
                              <div
                                key={proposal.id}
                                className={cn(
                                  "p-2 rounded-lg border flex items-start gap-2 text-xs",
                                  proposal.type === "add_entity"
                                    ? "bg-emerald-500/5 border-emerald-500/20"
                                    : proposal.type === "update_entity"
                                    ? "bg-amber-500/5 border-amber-500/20"
                                    : "bg-purple-500/5 border-purple-500/20"
                                )}
                              >
                                <div
                                  className={cn(
                                    "w-6 h-6 rounded flex items-center justify-center flex-shrink-0",
                                    config.bg
                                  )}
                                >
                                  <Icon className={cn("w-3 h-3", config.color)} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span
                                      className={cn(
                                        "font-medium",
                                        proposal.type === "add_entity"
                                          ? "text-emerald-400"
                                          : proposal.type === "update_entity"
                                          ? "text-amber-400"
                                          : "text-purple-400"
                                      )}
                                    >
                                      {proposal.type === "add_entity"
                                        ? "Add"
                                        : proposal.type === "update_entity"
                                        ? "Update"
                                        : "Link"}
                                    </span>
                                    <span className="text-gray-200 font-medium">
                                      {proposal.entity?.name ||
                                        (proposal.relationship &&
                                          `${proposal.relationship.sourceName} → ${proposal.relationship.targetName}`)}
                                    </span>
                                    {proposal.entity && (
                                      <span className="text-gray-500 capitalize">
                                        ({proposal.entity.type})
                                      </span>
                                    )}
                                  </div>

                                  {proposal.entity?.description && (
                                    <p className="text-gray-400 line-clamp-2">
                                      {proposal.entity.description}
                                    </p>
                                  )}

                                  {proposal.relationship?.description && (
                                    <p className="text-gray-400 line-clamp-1">
                                      {proposal.relationship.description}
                                    </p>
                                  )}

                                  {proposal.entity?.traits && proposal.entity.traits.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {proposal.entity.traits.slice(0, 3).map((trait, i) => (
                                        <span
                                          key={i}
                                          className="px-1 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400"
                                        >
                                          {trait}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="flex gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => handleProposalDecision(proposal.id, "accept")}
                                    disabled={isProcessing}
                                    className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
                                    title="Accept"
                                  >
                                    {isProcessing ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleProposalDecision(proposal.id, "reject")}
                                    disabled={isProcessing}
                                    className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                                    title="Reject"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1">
                    <Users className="w-4 h-4 text-gray-400" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                </div>
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">The world responds...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Suggested directions */}
        {suggestedDirections.length > 0 && !isLoading && (
          <div className="border-t border-gray-800/50 bg-gray-900/30 px-4 py-3">
            <div className="max-w-3xl mx-auto">
              <div className="text-xs text-gray-500 mb-2">Paths forward:</div>
              <div className="flex flex-wrap gap-2">
                {suggestedDirections.map((direction, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(direction)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-gray-800/50 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-all flex items-center gap-1.5"
                  >
                    <ChevronRight className="w-3 h-3" />
                    {direction}
                  </button>
                ))}
                <button
                  onClick={() => generateScene()}
                  className="px-3 py-1.5 rounded-lg text-xs bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 transition-all flex items-center gap-1.5"
                >
                  <BookOpen className="w-3 h-3" />
                  Generate a scene
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-gray-800/50 bg-gray-900/50 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe, question, explore..."
                rows={1}
                className={cn(
                  "flex-1 px-4 py-3 rounded-xl text-sm resize-none",
                  "bg-gray-800/80 border border-gray-700",
                  "text-gray-200 placeholder-gray-500",
                  "focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20",
                  "transition-all"
                )}
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className={cn(
                  "px-4 py-3 rounded-xl transition-all flex-shrink-0",
                  "bg-gradient-to-r from-cyan-500/20 to-blue-500/20",
                  "border border-cyan-500/30 text-cyan-400",
                  "hover:from-cyan-500/30 hover:to-blue-500/30 hover:border-cyan-400/50",
                  "disabled:opacity-50"
                )}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* World State Drawer */}
      <div
        ref={drawerRef}
        style={{ width: drawerWidth }}
        className={cn(
          "fixed right-0 top-0 h-full bg-gray-900 border-l border-gray-800 flex flex-col transition-transform duration-300 z-40",
          drawerOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-cyan-500/50 transition-colors",
            isResizing && "bg-cyan-500/50"
          )}
        />

        {/* Drawer Header - shows entity detail or world state */}
        {entityDetailStack.length > 0 ? (
          <div className="p-4 border-b border-gray-800">
            {/* Breadcrumb navigation */}
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
              <button onClick={navigateToRoot} className="hover:text-gray-300">
                World
              </button>
              {entityDetailStack.map((detail, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" />
                  <button
                    onClick={() => setEntityDetailStack(prev => prev.slice(0, i + 1))}
                    className={cn(
                      "hover:text-gray-300",
                      i === entityDetailStack.length - 1 && "text-cyan-400"
                    )}
                  >
                    {detail.entity.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {entityDetailStack.length > 1 && (
                  <button
                    onClick={navigateBack}
                    className="p-1 rounded hover:bg-gray-800 text-gray-400"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <h2 className="font-semibold text-gray-100 flex items-center gap-2">
                    {(() => {
                      const current = entityDetailStack[entityDetailStack.length - 1];
                      const config = getEntityConfig(current.entity.type);
                      const Icon = config.icon;
                      return <Icon className={cn("w-4 h-4", config.color)} />;
                    })()}
                    {entityDetailStack[entityDetailStack.length - 1].entity.name}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {entityDetailStack[entityDetailStack.length - 1].entity.type}
                    {entityDetailStack[entityDetailStack.length - 1].entity.isCanon && (
                      <span className="ml-2 text-green-400">● Canon</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={navigateToRoot}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                World State
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {worldEntities.length} elements · {worldRelationships.length} connections
              </p>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Entity Detail View - when exploring an entity */}
        {entityDetailStack.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-4">
            {(() => {
              const detail = entityDetailStack[entityDetailStack.length - 1];
              const entity = detail.entity;
              const config = getEntityConfig(entity.type);

              return (
                <div className="space-y-4">
                  {/* Description */}
                  {entity.description && (
                    <div>
                      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Description</h3>
                      <p className="text-sm text-gray-300 leading-relaxed">{entity.description}</p>
                    </div>
                  )}

                  {/* Backstory */}
                  {entity.backstory && (
                    <div>
                      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Backstory</h3>
                      <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{entity.backstory}</p>
                    </div>
                  )}

                  {/* Traits */}
                  {entity.traits && entity.traits.length > 0 && (
                    <div>
                      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Traits</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {entity.traits.map((trait, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs">
                            {trait}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Motivations */}
                  {entity.motivations && entity.motivations.length > 0 && (
                    <div>
                      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Motivations</h3>
                      <ul className="space-y-1">
                        {entity.motivations.map((m, i) => (
                          <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                            <Target className="w-3 h-3 mt-0.5 text-amber-400 flex-shrink-0" />
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Secrets */}
                  {entity.secrets && entity.secrets.length > 0 && (
                    <div>
                      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Secrets</h3>
                      <ul className="space-y-1">
                        {entity.secrets.map((s, i) => (
                          <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                            <Sparkles className="w-3 h-3 mt-0.5 text-purple-400 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Status */}
                  {entity.status && (
                    <div>
                      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Status</h3>
                      <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs capitalize">
                        {entity.status}
                      </span>
                    </div>
                  )}

                  {/* Relationships */}
                  {detail.relationships.length > 0 && (
                    <div>
                      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                        Connections ({detail.relationships.length})
                      </h3>
                      <div className="space-y-2">
                        {detail.relationships.map((rel) => {
                          const otherEntity = rel.otherEntity;
                          if (!otherEntity) return null;
                          const otherConfig = getEntityConfig(otherEntity.type);
                          const OtherIcon = otherConfig.icon;

                          return (
                            <div
                              key={rel.id}
                              onClick={() => openEntityDetail(otherEntity.id)}
                              className="p-2 rounded-lg bg-gray-800/50 border border-gray-700/50 hover:border-gray-600 cursor-pointer transition-all flex items-center gap-2"
                            >
                              <div className={cn("w-6 h-6 rounded flex items-center justify-center", otherConfig.bg)}>
                                <OtherIcon className={cn("w-3 h-3", otherConfig.color)} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">
                                    {rel.direction === "outgoing" ? "→" : "←"}
                                  </span>
                                  <span className="text-xs text-cyan-400 font-medium">{rel.type}</span>
                                  <span className="text-xs text-gray-500">
                                    {rel.direction === "outgoing" ? "→" : "←"}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-200 truncate">{otherEntity.name}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-600" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {entity.notes && (
                    <div>
                      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Notes</h3>
                      <p className="text-sm text-gray-400 whitespace-pre-wrap">{entity.notes}</p>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="pt-4 border-t border-gray-800">
                    <div className="text-xs text-gray-600 space-y-1">
                      {entity.firstMentioned && (
                        <p>First mentioned: {new Date(entity.firstMentioned).toLocaleDateString()}</p>
                      )}
                      {entity.lastUpdated && (
                        <p>Last updated: {new Date(entity.lastUpdated).toLocaleDateString()}</p>
                      )}
                      {entity.mentions && <p>Mentions: {entity.mentions}</p>}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => setDrawerTab("graph")}
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1",
                  drawerTab === "graph"
                    ? "text-cyan-400 border-b-2 border-cyan-400"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                <Network className="w-3.5 h-3.5" />
                Graph
              </button>
              <button
                onClick={() => setDrawerTab("entities")}
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                  drawerTab === "entities"
                    ? "text-cyan-400 border-b-2 border-cyan-400"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                List
              </button>
          <button
            onClick={() => setDrawerTab("relationships")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors",
              drawerTab === "relationships"
                ? "text-cyan-400 border-b-2 border-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            Links
          </button>
          <button
            onClick={() => setDrawerTab("story")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1",
              drawerTab === "story"
                ? "text-cyan-400 border-b-2 border-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Story
          </button>
        </div>

        {/* Type filter (for entities tab) */}
        {drawerTab === "entities" && worldEntities.length > 0 && (
          <div className="p-3 border-b border-gray-800 flex flex-wrap gap-1.5">
            {entityTypes.map((type) => (
              <button
                key={type}
                onClick={() => setEntityFilter(type)}
                className={cn(
                  "px-2 py-1 rounded text-xs capitalize transition-all",
                  entityFilter === type
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "bg-gray-800 text-gray-500 hover:text-gray-300"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className={cn(
          "flex-1",
          drawerTab === "graph" ? "p-0" : "overflow-y-auto p-3",
          drawerTab === "story" && "overflow-y-auto"
        )}>
          {drawerTab === "graph" ? (
            <MiniGraph
              entities={worldEntities}
              relationships={worldRelationships}
              focusedEntities={narrativeState?.focusedEntities || []}
              onEntityClick={(entity) => setSelectedEntityId(entity.id === selectedEntityId ? null : entity.id)}
              className="h-full"
            />
          ) : drawerTab === "entities" ? (
            worldEntities.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No entities yet</p>
                <p className="text-xs mt-1">Start chatting to build your world</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(entitiesByType).map(([type, entities]) => {
                  const config = getEntityConfig(type);
                  const Icon = config.icon;
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 uppercase tracking-wider">
                        <Icon className={cn("w-3 h-3", config.color)} />
                        {type}s ({entities.length})
                      </div>
                      <div className="space-y-2">
                        {entities.map((entity) => {
                          const isFocused = narrativeState?.focusedEntities?.some(
                            (f) => f.toLowerCase() === entity.name.toLowerCase()
                          );
                          return (
                          <div
                            key={entity.id}
                            className={cn(
                              "p-3 rounded-lg border transition-all cursor-pointer group relative",
                              selectedEntityId === entity.id
                                ? "bg-gray-800 border-cyan-500/50"
                                : isFocused
                                ? "bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30"
                                : "bg-gray-800/50 border-gray-700/50 hover:border-gray-600"
                            )}
                            onClick={() => openEntityDetail(entity.id)}
                          >
                            {/* Focus indicator */}
                            {isFocused && (
                              <div className="absolute -top-1 -right-1">
                                <Target className="w-3.5 h-3.5 text-cyan-400" />
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className={cn("w-6 h-6 rounded flex items-center justify-center", config.bg)}>
                                  <Icon className={cn("w-3 h-3", config.color)} />
                                </div>
                                <span className={cn(
                                  "font-medium text-sm",
                                  isFocused ? "text-cyan-300" : "text-gray-200"
                                )}>{entity.name}</span>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const instruction = window.prompt(`How should "${entity.name}" be changed?`);
                                    if (instruction) editEntityWithAI(entity.id, instruction);
                                  }}
                                  className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-cyan-400"
                                  title="Edit with AI"
                                >
                                  <Wand2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`Delete "${entity.name}"?`)) deleteEntity(entity.id);
                                  }}
                                  className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-red-400"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            {selectedEntityId === entity.id && entity.description && (
                              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                                {entity.description}
                              </p>
                            )}
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : drawerTab === "relationships" ? (
            // Relationships tab
            worldRelationships.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No connections yet</p>
                <p className="text-xs mt-1">Relationships form as you build</p>
              </div>
            ) : (
              <div className="space-y-2">
                {worldRelationships.map((rel) => (
                  <div
                    key={rel.id}
                    className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-sm"
                  >
                    <div className="flex items-center gap-2 text-gray-300">
                      <span className="text-cyan-400">{rel.sourceName}</span>
                      <ChevronRight className="w-3 h-3 text-gray-600" />
                      <span className="text-purple-400">{rel.targetName}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{rel.type}</div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // Story tab - linear narrative timeline
            !storyData || storyData.storyEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No story yet</p>
                <p className="text-xs mt-1">Your narrative will appear here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Story Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <div className="text-xs text-rose-400">Events</div>
                    <div className="text-lg font-semibold text-rose-300">{storyData.stats.totalEvents}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                    <div className="text-xs text-cyan-400">Elaborations</div>
                    <div className="text-lg font-semibold text-cyan-300">{storyData.stats.totalElaborations}</div>
                  </div>
                </div>

                {/* Milestones (commits) */}
                {storyData.milestones.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <GitCommit className="w-3 h-3" />
                      Milestones
                    </div>
                    <div className="space-y-1.5">
                      {storyData.milestones.map((milestone) => (
                        <div
                          key={milestone.id}
                          className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs"
                        >
                          <div className="text-emerald-300 font-medium">{milestone.message}</div>
                          <div className="text-emerald-400/60 mt-0.5">
                            {milestone.entityCount} entities · {milestone.relationshipCount} connections
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Story Events Timeline */}
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Story Timeline
                  </div>
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-700" />

                    <div className="space-y-3">
                      {storyData.storyEvents.map((event, idx) => (
                        <div key={event.id} className="relative pl-8">
                          {/* Timeline dot */}
                          <div className={cn(
                            "absolute left-1.5 top-2 w-3 h-3 rounded-full border-2",
                            event.isEvent
                              ? "bg-rose-500 border-rose-400"
                              : "bg-gray-700 border-gray-500"
                          )} />

                          <div className={cn(
                            "p-3 rounded-lg border text-sm",
                            event.isEvent
                              ? "bg-rose-500/10 border-rose-500/30"
                              : "bg-gray-800/50 border-gray-700/50"
                          )}>
                            {/* Event badge */}
                            {event.isEvent && (
                              <div className="flex items-center gap-1 text-xs text-rose-400 mb-1">
                                <Zap className="w-3 h-3" />
                                Event
                              </div>
                            )}

                            {/* Content preview */}
                            <p className="text-gray-300 line-clamp-3">
                              {event.content.slice(0, 200)}{event.content.length > 200 ? "..." : ""}
                            </p>

                            {/* Metadata */}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {event.focusedEntities.slice(0, 3).map((entity, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400"
                                >
                                  {entity}
                                </span>
                              ))}
                              {event.focusedEntities.length > 3 && (
                                <span className="text-xs text-gray-500">
                                  +{event.focusedEntities.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Drawer Footer */}
        {worldState.themes.length > 0 && (
          <div className="p-3 border-t border-gray-800">
            <div className="text-xs text-gray-500 mb-1.5">Themes</div>
            <div className="flex flex-wrap gap-1">
              {worldState.themes.map((theme, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                  {theme}
                </span>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Commit Dialog */}
      {showCommitDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                <GitCommit className="w-5 h-5 text-emerald-400" />
                Commit World State
              </h3>
              <button
                onClick={() => setShowCommitDialog(false)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Save the current state of your world. You can return to this point later.
            </p>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe this state..."
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCommitDialog(false)}
                className="flex-1 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                className="flex-1 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30"
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Dialog */}
      {showBranchDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-purple-400" />
                Create Branch
              </h3>
              <button
                onClick={() => setShowBranchDialog(false)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Explore an alternate timeline. Your main branch stays safe.
            </p>
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value.replace(/\s+/g, "-"))}
              placeholder="what-if-silas-stayed"
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowBranchDialog(false)}
                className="flex-1 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleBranch}
                disabled={!branchName.trim()}
                className="flex-1 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50"
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-red-400" />
                Start New World?
              </h3>
              <button
                onClick={() => setShowResetDialog(false)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              This will clear all entities, relationships, and conversation history.
              Committed snapshots will also be removed.
            </p>
            <p className="text-xs text-gray-500 mb-4">
              If you want to keep this world, consider creating a branch first.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetDialog(false)}
                className="flex-1 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={resetWorld}
                className="flex-1 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"
              >
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Modal */}
      {showTimeline && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                <History className="w-5 h-5 text-cyan-400" />
                Timeline
              </h3>
              <button
                onClick={() => setShowTimeline(false)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Branches</div>
              <div className="flex flex-wrap gap-2">
                {timeline.branches.map((branch) => (
                  <span
                    key={branch.name}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs flex items-center gap-1.5",
                      branch.isCurrent
                        ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400"
                        : "bg-gray-800 border border-gray-700 text-gray-400"
                    )}
                  >
                    <GitBranch className="w-3 h-3" />
                    {branch.name}
                    {branch.isCanon && <span className="text-emerald-400">*</span>}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Commits</div>
              {timeline.commits.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No commits yet</p>
                  <p className="text-xs">Build your world, then commit to save it</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {timeline.commits.map((commit) => (
                    <div key={commit.id} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="text-sm text-gray-200">{commit.message}</div>

                          {/* Delta stats - show what changed */}
                          {commit.stats && (commit.stats.entitiesAdded > 0 || commit.stats.entitiesModified > 0 || commit.stats.relationshipsAdded > 0) ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {commit.stats.entitiesAdded > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">
                                  +{commit.stats.entitiesAdded} new
                                </span>
                              )}
                              {commit.stats.entitiesModified > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
                                  ~{commit.stats.entitiesModified} updated
                                </span>
                              )}
                              {commit.stats.relationshipsAdded > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                                  +{commit.stats.relationshipsAdded} links
                                </span>
                              )}
                            </div>
                          ) : null}

                          {/* Entity names from delta */}
                          {commit.delta && (commit.delta.addedEntities.length > 0 || commit.delta.modifiedEntities.length > 0) && (
                            <div className="mt-1.5 text-xs text-gray-500">
                              {commit.delta.addedEntities.map(e => e.name).concat(commit.delta.modifiedEntities.map(e => e.name)).slice(0, 4).join(", ")}
                              {(commit.delta.addedEntities.length + commit.delta.modifiedEntities.length) > 4 && (
                                <span className="text-gray-600"> +{(commit.delta.addedEntities.length + commit.delta.modifiedEntities.length) - 4} more</span>
                              )}
                            </div>
                          )}

                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                            <span>{commit.branch}</span>
                            <span>·</span>
                            <span>{commit.entityCount} total</span>
                            <span>·</span>
                            <span>{new Date(commit.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteCommit(commit.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
                          title="Delete commit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Merge Dialog */}
      {showMergeDialog && mergePreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-purple-400" />
                Merge {mergePreview.sourceBranch} → {mergePreview.targetBranch}
              </h3>
              <button
                onClick={() => {
                  setShowMergeDialog(false);
                  setMergePreview(null);
                  setMergeResolutions(new Map());
                }}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary */}
            <div className="mb-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 flex-shrink-0">
              <div className="flex gap-4 text-sm">
                {mergePreview.additions.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-gray-400">{mergePreview.additions.length} additions</span>
                  </div>
                )}
                {mergePreview.modifications.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-gray-400">{mergePreview.modifications.length} modifications</span>
                  </div>
                )}
                {mergePreview.conflicts.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-red-400">{mergePreview.conflicts.length} conflicts</span>
                  </div>
                )}
                {mergePreview.canAutoMerge && (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Auto-merge possible</span>
                  </div>
                )}
              </div>
            </div>

            {/* Conflicts */}
            {mergePreview.conflicts.length > 0 && (
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                <div className="text-sm text-gray-400 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  Resolve conflicts before merging
                </div>

                {mergePreview.conflicts.map((conflict) => {
                  const key = `${conflict.entityId}-${conflict.field}`;
                  const resolution = mergeResolutions.get(key);
                  const isResolved = resolution?.resolution;
                  const isLoadingAI = isLoadingAiResolution === key;

                  return (
                    <div
                      key={key}
                      className={cn(
                        "p-4 rounded-lg border",
                        isResolved
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : "bg-red-500/5 border-red-500/30"
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-medium text-gray-200">{conflict.entityName}</span>
                          <span className="text-gray-500 text-sm ml-2">({conflict.entityType})</span>
                          <span className="text-gray-400 text-sm ml-2">· {conflict.field}</span>
                        </div>
                        {isResolved && (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                            {resolution?.resolution === "ai" ? "AI Resolved" : resolution?.resolution}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {/* Main version */}
                        <div
                          onClick={() => setResolution(conflict, "main")}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all",
                            resolution?.resolution === "main"
                              ? "bg-cyan-500/10 border-cyan-500/50"
                              : "bg-gray-800/50 border-gray-700 hover:border-gray-600"
                          )}
                        >
                          <div className="text-xs text-cyan-400 mb-1 font-medium">Main ({mergePreview.targetBranch})</div>
                          <p className="text-sm text-gray-300 line-clamp-3">
                            {typeof conflict.mainValue === "string"
                              ? conflict.mainValue || "(empty)"
                              : JSON.stringify(conflict.mainValue) || "(empty)"}
                          </p>
                        </div>

                        {/* Branch version */}
                        <div
                          onClick={() => setResolution(conflict, "branch")}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all",
                            resolution?.resolution === "branch"
                              ? "bg-purple-500/10 border-purple-500/50"
                              : "bg-gray-800/50 border-gray-700 hover:border-gray-600"
                          )}
                        >
                          <div className="text-xs text-purple-400 mb-1 font-medium">Branch ({mergePreview.sourceBranch})</div>
                          <p className="text-sm text-gray-300 line-clamp-3">
                            {typeof conflict.branchValue === "string"
                              ? conflict.branchValue || "(empty)"
                              : JSON.stringify(conflict.branchValue) || "(empty)"}
                          </p>
                        </div>
                      </div>

                      {/* AI Resolution */}
                      {resolution?.resolution === "ai" && resolution.resolvedValue && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-3">
                          <div className="text-xs text-amber-400 mb-1 font-medium">AI Reconciled</div>
                          <p className="text-sm text-gray-300">
                            {typeof resolution.resolvedValue === "string"
                              ? resolution.resolvedValue
                              : JSON.stringify(resolution.resolvedValue)}
                          </p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => resolveWithAI(conflict)}
                          disabled={isLoadingAI}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                        >
                          {isLoadingAI ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Wand2 className="w-3 h-3" />
                          )}
                          {isLoadingAI ? "Reconciling..." : "AI Reconcile"}
                        </button>
                        <button
                          onClick={() => {
                            const custom = window.prompt(
                              `Custom value for ${conflict.entityName}'s ${conflict.field}:`,
                              resolution?.resolvedValue || conflict.branchValue || ""
                            );
                            if (custom !== null) {
                              setResolution(conflict, "custom", custom);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-gray-700 text-gray-300 hover:bg-gray-600"
                        >
                          <Pencil className="w-3 h-3" />
                          Custom
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* No conflicts message */}
            {mergePreview.conflicts.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-center py-8">
                <div>
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-gray-300 font-medium">No conflicts detected</p>
                  <p className="text-gray-500 text-sm mt-1">
                    Changes from {mergePreview.sourceBranch} can be merged cleanly.
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-800 flex-shrink-0">
              <button
                onClick={() => {
                  setShowMergeDialog(false);
                  setMergePreview(null);
                  setMergeResolutions(new Map());
                }}
                className="flex-1 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={executeMerge}
                disabled={
                  isMerging ||
                  (mergePreview.conflicts.length > 0 &&
                    Array.from(mergeResolutions.values()).filter((r) => r.resolution).length < mergePreview.conflicts.length)
                }
                className="flex-1 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="w-4 h-4" />
                    Merge
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

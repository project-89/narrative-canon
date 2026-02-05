"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Send,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Image as ImageIcon,
  RefreshCw,
  BookOpen,
  Users,
  MapPin,
  Package,
  Loader2,
  MessageSquare,
  Wand2,
  Film,
  ArrowRight,
  Eye,
  Layers,
  Minimize2,
  Maximize2,
  Check,
  Plus,
  Link2,
  Award,
  ChevronUp,
  Loader,
  Settings,
  Wrench,
  PenLine,
  LayoutGrid,
  GitBranch,
  GitCommit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  demoEntities,
  demoScenes,
  demoRelationships,
  getEntityRelationships,
  getEntityScenes,
  getEntityById,
  type DemoEntity,
  type DemoScene,
  type DemoRelationship,
} from "@/lib/demo-data";
import { StorySwitcher } from "@/components/studio/StorySwitcher";

// =============================================================================
// TYPES
// =============================================================================

interface Entity extends DemoEntity {}

interface SceneFrame {
  id: string;
  position: number;
  title?: string;
  description: string;
  visual_beat?: string;
  participantIds?: string[];
  locationId?: string;
  dialogue?: string[];
  caption?: string;
  sfx?: string[];
  imageUrl?: string;
  shotType?: string;
  camera?: string;
  mood?: string;
}

interface StoryContinuityIssue {
  id: string;
  sceneId: string;
  sceneTitle: string;
  position: number;
  severity: "warning" | "error";
  code: string;
  message: string;
  entityIds: string[];
}

interface SceneStoryDiff {
  baseSceneId?: string;
  position: number;
  participantIds: string[];
  locationId?: string;
  entityAdds: string[];
  entityRemoves: string[];
  firstAppearances: string[];
  locationChange?: { from?: string; to?: string };
  eventBeats: string[];
  mutationCount: number;
  issueCount: number;
  continuityIssues: StoryContinuityIssue[];
}

interface Scene extends DemoScene {
  frames?: SceneFrame[];
  stateChanges?: string[];
  storyDiff?: SceneStoryDiff;
}

interface Relationship extends DemoRelationship {
  direction: "outgoing" | "incoming";
}

interface EntityDetail {
  entity: Entity;
  relationships: Relationship[];
  scenes: Scene[];
  relatedEntities: Entity[];
  narrativeArc?: {
    entityId: string;
    entityName: string;
    firstSceneId?: string;
    latestSceneId?: string;
    entries: Array<{
      sceneId: string;
      sceneTitle: string;
      position: number;
      role: "introduced" | "enters" | "present" | "exits";
      locationId?: string;
      events: string[];
      changes: string[];
    }>;
  };
  arcIssues?: StoryContinuityIssue[];
}

// Tool usage step from agentic run
interface ToolStep {
  type: "tool_call" | "tool_result" | "text";
  timestamp: number;
  tool?: string;
  args?: Record<string, any>;
  result?: any;
  error?: string;
  text?: string;
}

interface ToolUsage {
  totalCalls: number;
  steps: ToolStep[];
}

interface Message {
  id: string;
  messageId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  proposals?: EntityProposal[];
  toolUsage?: ToolUsage | null;
}

// Entity proposals from the API
interface EntityProposal {
  id: string;
  type: "add_entity" | "update_entity" | "add_relationship" | "add_scene" | "update_scene" | "entity" | "relationship"; // Support both old and new formats
  entity?: {
    name: string;
    type: string;
    description?: string;
    traits?: string[];
    backstory?: string;
  };
  relationship?: {
    sourceName: string;
    targetName: string;
    type: string;
    description?: string;
  };
    scene?: {
      id: string;
      title: string;
      prose: string;
      summary?: string;
      participantIds?: string[];
      locationId?: string;
      events?: string[];
      stateChanges?: string[];
      status?: string;
      frames?: SceneFrame[];
      storyDiff?: SceneStoryDiff;
    };
  status: "pending" | "accepted" | "rejected";
}

// Studio settings for customizing writing and visual style
interface StudioSettings {
  writingStylePrompt: string;
  visualStylePrompt: string;
}

const DEFAULT_SETTINGS: StudioSettings = {
  writingStylePrompt: "",
  visualStylePrompt: "",
};

// LLM Commands that can be embedded in responses
// Format: [[COMMAND:param]] or [[COMMAND:param1|param2]]
type LLMCommand =
  | { type: "navigate"; entityId: string }
  | { type: "navigate_scene"; sceneId: string }
  | { type: "pin"; entityId: string }
  | { type: "unpin"; entityId: string }
  | { type: "ask_confirm"; message: string; action: string }
  | { type: "focus_row"; row: "scenes" | "entities" }
  | { type: "generate_frames"; sceneId?: string; count?: number };

// Parse commands from LLM response text
function parseLLMCommands(text: string): { cleanText: string; commands: LLMCommand[] } {
  const commands: LLMCommand[] = [];
  let cleanText = text;

  // Match [[COMMAND:params]]
  const commandRegex = /\[\[(\w+):([^\]]+)\]\]/g;
  let match;

  while ((match = commandRegex.exec(text)) !== null) {
    const [fullMatch, cmd, params] = match;
    const paramParts = params.split("|");

    switch (cmd.toUpperCase()) {
      case "NAVIGATE":
        commands.push({ type: "navigate", entityId: paramParts[0] });
        break;
      case "NAVIGATE_SCENE":
        commands.push({ type: "navigate_scene", sceneId: paramParts[0] });
        break;
      case "PIN":
        commands.push({ type: "pin", entityId: paramParts[0] });
        break;
      case "UNPIN":
        commands.push({ type: "unpin", entityId: paramParts[0] });
        break;
      case "ASK_CONFIRM":
        commands.push({ type: "ask_confirm", message: paramParts[0], action: paramParts[1] || "" });
        break;
      case "FOCUS_ROW":
        commands.push({ type: "focus_row", row: paramParts[0] as "scenes" | "entities" });
        break;
      case "GENERATE_FRAMES": {
        const first = paramParts[0];
        const second = paramParts[1];
        let sceneId: string | undefined;
        let count: number | undefined;
        if (second !== undefined) {
          sceneId = first;
          const parsed = Number(second);
          count = Number.isFinite(parsed) ? parsed : undefined;
        } else if (/^\d+$/.test(first)) {
          count = Number(first);
        } else {
          sceneId = first;
        }
        commands.push({ type: "generate_frames", sceneId, count });
        break;
      }
    }

    cleanText = cleanText.replace(fullMatch, "");
  }

  return { cleanText: cleanText.trim(), commands };
}

// Build context for LLM
function buildLLMContext(
  focusedEntity: Entity | null,
  focusedScene: Scene | null,
  pinnedEntities: Entity[],
  allEntities: Entity[],
  allScenes: Scene[],
  activeRow: CarouselRow,
  insertPosition?: { position: number; beforeScene: Scene; afterScene: Scene | null } | null
): string {
  const lines: string[] = [];

  lines.push("=== CURRENT CONTEXT ===");
  lines.push(`Active view: ${activeRow}`);

  if (focusedEntity) {
    lines.push(`\nFocused Entity: ${focusedEntity.name} (${focusedEntity.type})`);
    lines.push(`Description: ${focusedEntity.description || "None"}`);
    if (focusedEntity.traits?.length) lines.push(`Traits: ${focusedEntity.traits.join(", ")}`);
  } else if (focusedScene) {
    lines.push(`\nFocused Scene: ${focusedScene.title}`);
    lines.push(`Status: ${focusedScene.status}`);
  } else {
    lines.push("\nNo item currently focused");
  }

  if (pinnedEntities.length > 0) {
    lines.push(`\n=== WORKING MEMORY (${pinnedEntities.length} pinned) ===`);
    pinnedEntities.forEach(e => lines.push(`- ${e.name} (${e.type}) [id: ${e.id}]`));
  }

  if (insertPosition) {
    const afterTitle = insertPosition.beforeScene?.title || "Unknown";
    const beforeTitle = insertPosition.afterScene?.title || "End of storyboard";
    lines.push(`\n=== INSERT REQUEST ===`);
    lines.push(`Insert after: "${afterTitle}"`);
    lines.push(`Insert before: "${beforeTitle}"`);
    lines.push(`Target index: ${insertPosition.position}`);
  }

  lines.push(`\n=== WORLD STATE ===`);
  lines.push(`Entities (${allEntities.length}): ${allEntities.map(e => `${e.name} [${e.id}]`).join(", ")}`);
  lines.push(`Scenes (${allScenes.length}): ${allScenes.map(s => `${s.title} [${s.id}]`).join(", ")}`);

  lines.push(`\n=== AVAILABLE COMMANDS ===`);
  lines.push(`[[NAVIGATE:entity_id]] - Navigate carousel to entity`);
  lines.push(`[[NAVIGATE_SCENE:scene_id]] - Navigate carousel to scene`);
  lines.push(`[[PIN:entity_id]] - Add entity to working memory`);
  lines.push(`[[UNPIN:entity_id]] - Remove entity from working memory`);
  lines.push(`[[FOCUS_ROW:scenes|entities]] - Switch carousel view`);
  lines.push(`[[ASK_CONFIRM:message|action]] - Ask user for confirmation`);
  lines.push(`[[GENERATE_FRAMES:scene_id|count]] - Generate storyboard frames for a scene`);

  return lines.join("\n");
}

type CarouselRow = "scenes" | "entities";

// =============================================================================
// CONFIG
// =============================================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

const resolveImageUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
};

const mapScenesFromApi = (interactionsData: any[]): Scene[] => {
  const mapped = interactionsData.map((i: any, idx: number) => {
    const participantIdsRaw = i.participantIds || i.participants || [];
    const participantIds = participantIdsRaw
      .map((p: any) => (typeof p === "string" ? p : p?.id))
      .filter(Boolean);

    const frames: SceneFrame[] = (i.frames || []).map((frame: any, frameIdx: number) => ({
      id: frame.id,
      position: frame.position ?? frameIdx,
      title: frame.title,
      description: frame.description,
      visual_beat: frame.visual_beat || frame.visualBeat,
      participantIds: frame.participantIds || [],
      locationId: frame.locationId,
      dialogue: frame.dialogue,
      caption: frame.caption,
      sfx: frame.sfx,
      imageUrl: resolveImageUrl(frame.imageUrl),
      shotType: frame.shotType,
      camera: frame.camera,
      mood: frame.mood,
    }));

    return {
      id: i.id,
      title: i.title || i.summary?.slice(0, 50) || "Untitled Scene",
      prose: i.prose || i.content || i.summary || "",
      status: i.status || "draft",
      participantIds,
      locationId: i.locationId || i.location,
      events: i.events || [],
      stateChanges: i.stateChanges || [],
      imageUrl: resolveImageUrl(i.imageUrl),
      position: i.position ?? idx,
      storyDiff: i.storyDiff,
      frames: frames.length > 0 ? frames.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : undefined,
    };
  });

  return mapped.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
};

const entityTypeConfig: Record<string, { icon: any; color: string; ringColor: string; bgColor: string }> = {
  character: { icon: Users, color: "text-amber-400", ringColor: "ring-amber-500/50", bgColor: "bg-amber-500/20" },
  location: { icon: MapPin, color: "text-purple-400", ringColor: "ring-purple-500/50", bgColor: "bg-purple-500/20" },
  object: { icon: Package, color: "text-cyan-400", ringColor: "ring-cyan-500/50", bgColor: "bg-cyan-500/20" },
  creature: { icon: Sparkles, color: "text-rose-400", ringColor: "ring-rose-500/50", bgColor: "bg-rose-500/20" },
  concept: { icon: BookOpen, color: "text-blue-400", ringColor: "ring-blue-500/50", bgColor: "bg-blue-500/20" },
  faction: { icon: Users, color: "text-emerald-400", ringColor: "ring-emerald-500/50", bgColor: "bg-emerald-500/20" },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function NarrativeStudio() {
  // Real data from API (or fallback to demo)
  const [entities, setEntities] = useState<Entity[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [relationships, setRelationships] = useState<DemoRelationship[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [worldName, setWorldName] = useState("Your World");

  const [messages, setMessages] = useState<Message[]>([]);
  const [expandedToolUsage, setExpandedToolUsage] = useState<Set<string>>(new Set());

  // Git/commit state
  const [sessionStatus, setSessionStatus] = useState<{
    uncommittedChanges: boolean;
    currentBranch: string;
    storyConsistency?: {
      errors: number;
      warnings: number;
      isConsistent: boolean;
    };
    pendingChanges: {
      addedEntities: { id: string; name: string; type: string }[];
      modifiedEntities: { id: string; name: string; type: string }[];
      addedRelationships: { id: string; sourceName: string; targetName: string; type: string }[];
      addedScenes: { id: string; title: string }[];
      modifiedScenes?: { id: string; title: string }[];
      summary: { entitiesAdded: number; entitiesModified: number; relationshipsAdded: number; scenesAdded: number; scenesModified?: number; total: number };
    };
  } | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [llmCommitSuggestion, setLlmCommitSuggestion] = useState<string | null>(null);
  const [autoAcceptedProposals, setAutoAcceptedProposals] = useState<EntityProposal[] | null>(null);
  const autoAcceptedTimeoutRef = useRef<number | null>(null);
  // Proposal Review Modal state
  const [reviewingProposals, setReviewingProposals] = useState<EntityProposal[] | null>(null);
  const [reviewingMessageId, setReviewingMessageId] = useState<string | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isRefining, setIsRefining] = useState(false);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [previewPortrait, setPreviewPortrait] = useState<string | null>(null);
  const [isGeneratingPreviewPortrait, setIsGeneratingPreviewPortrait] = useState(false);

  const mapServerProposal = (p: any): EntityProposal => ({
    id: p.id,
    type: p.type,
    entity: p.entity,
    relationship: p.relationship,
    scene: p.scene,
    status: p.status || "pending",
  });

  const attachProposalsToMessages = (msgs: Message[], proposals: any[]): Message[] => {
    if (!proposals || proposals.length === 0) return msgs;
    const grouped = new Map<string, EntityProposal[]>();

    proposals.forEach((proposal) => {
      const messageId = proposal.messageId;
      if (!messageId) return;
      const mapped = mapServerProposal(proposal);
      if (!grouped.has(messageId)) {
        grouped.set(messageId, []);
      }
      grouped.get(messageId)!.push(mapped);
    });

    return msgs.map((msg) => {
      const key = msg.messageId || msg.id;
      const additions = grouped.get(key);
      if (!additions || additions.length === 0) return msg;
      const existingIds = new Set((msg.proposals || []).map(p => p.id));
      const merged = [
        ...(msg.proposals || []),
        ...additions.filter(p => !existingIds.has(p.id)),
      ];
      return { ...msg, proposals: merged };
    });
  };

  const scheduleAutoAcceptedClear = (delayMs: number = 20000) => {
    if (autoAcceptedTimeoutRef.current) {
      window.clearTimeout(autoAcceptedTimeoutRef.current);
    }
    autoAcceptedTimeoutRef.current = window.setTimeout(() => {
      setAutoAcceptedProposals(null);
      autoAcceptedTimeoutRef.current = null;
    }, delayMs);
  };

  const handleUndoAutoAccepted = async () => {
    if (!autoAcceptedProposals || autoAcceptedProposals.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/api/narrative/proposals/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: autoAcceptedProposals.map(p => p.id) }),
      });

      if (res.ok) {
        // Refresh entities, relationships, scenes
        const [entitiesRes, relationshipsRes, interactionsRes] = await Promise.all([
          fetch(`${API_BASE}/api/narrative/entities`),
          fetch(`${API_BASE}/api/narrative/relationships`),
          fetch(`${API_BASE}/api/narrative/interactions`),
        ]);

        if (entitiesRes.ok) {
          const entitiesData = await entitiesRes.json();
          setEntities(entitiesData.map((e: any) => ({
            id: e.id,
            name: e.name,
            type: e.type,
            description: e.description || "",
            backstory: e.backstory,
            traits: e.traits || [],
            status: e.status || "draft",
            referenceImage: resolveImageUrl(e.referenceImage || e.imageUrl),
          })));
        }

        if (relationshipsRes.ok) {
          const relsData = await relationshipsRes.json();
          setRelationships(relsData.map((r: any) => ({
            id: r.id,
            sourceId: r.source || r.sourceId,
            targetId: r.target || r.targetId,
            sourceName: r.sourceName,
            targetName: r.targetName,
            type: r.type,
            description: r.description,
          })));
        }

        if (interactionsRes.ok) {
          const interactionsData = await interactionsRes.json();
          setScenes(mapScenesFromApi(interactionsData));
        }

        await refreshSessionStatus();
      }
    } catch (error) {
      console.error("Failed to undo auto-accepted proposals:", error);
    } finally {
      setAutoAcceptedProposals(null);
    }
  };

  // Load data from API on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [entitiesRes, relationshipsRes, interactionsRes, historyRes, statusRes, proposalsRes] = await Promise.all([
          fetch(`${API_BASE}/api/narrative/entities`),
          fetch(`${API_BASE}/api/narrative/relationships`),
          fetch(`${API_BASE}/api/narrative/interactions`),
          fetch(`${API_BASE}/api/narrative/chat/history`),
          fetch(`${API_BASE}/api/narrative/session/status`),
          fetch(`${API_BASE}/api/narrative/proposals`),
        ]);

        let loadedWorldName = worldName;

        if (entitiesRes.ok) {
          const entitiesData = await entitiesRes.json();
          // Map API entities to our format
          const mappedEntities: Entity[] = entitiesData.map((e: any) => ({
            id: e.id,
            name: e.name,
            type: e.type || "character",
            description: e.description,
            backstory: e.backstory,
            traits: e.traits || [],
            status: e.status || "draft",
            referenceImage: resolveImageUrl(e.referenceImage || e.imageUrl),
          }));
          setEntities(mappedEntities);

          // Get world name from first location or use default
          const firstLocation = mappedEntities.find(e => e.type === "location");
          if (firstLocation) {
            loadedWorldName = firstLocation.name;
            setWorldName(firstLocation.name);
          }
        }

        if (relationshipsRes.ok) {
          const relsData = await relationshipsRes.json();
          setRelationships(relsData.map((r: any) => ({
            id: r.id,
            sourceId: r.source || r.sourceId,
            targetId: r.target || r.targetId,
            sourceName: r.sourceName,
            targetName: r.targetName,
            type: r.type,
            description: r.description,
          })));
        }

        if (interactionsRes.ok) {
          const interactionsData = await interactionsRes.json();
          setScenes(mapScenesFromApi(interactionsData));
        }

        // Load conversation history if available, otherwise show welcome message
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData.messages && historyData.messages.length > 0) {
            // Map server messages to our format
            let baseMessages: Message[] = historyData.messages.map((m: any, i: number) => ({
              id: m.id || `msg_${m.timestamp}_${i}`,
              messageId: m.messageId,
              role: m.role as "user" | "assistant" | "system",
              content: m.content,
              timestamp: m.timestamp || Date.now(),
              proposals: m.proposals || [],
            }));

            // Attach pending proposals to their originating message
            if (proposalsRes.ok) {
              const proposalsData = await proposalsRes.json();
              if (proposalsData?.proposals?.length) {
                baseMessages = attachProposalsToMessages(baseMessages, proposalsData.proposals);
              }
            }

            setMessages(baseMessages);
            console.log(`📜 Loaded ${historyData.messages.length} messages from conversation history`);
          } else {
            // No history - show welcome message
            setMessages([{
              id: "msg_welcome",
              role: "assistant",
              content: `Welcome to the world of ${loadedWorldName}. I'm here to help you explore and expand this narrative. What would you like to discover?`,
              timestamp: Date.now(),
            }]);
          }
        } else {
          // History fetch failed - show welcome message
          setMessages([{
            id: "msg_welcome",
            role: "assistant",
            content: `Welcome to the world of ${loadedWorldName}. I'm here to help you explore and expand this narrative. What would you like to discover?`,
            timestamp: Date.now(),
          }]);
        }

        // Load session status (uncommitted changes, etc.)
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setSessionStatus(statusData);
          console.log(`📊 Session status: ${statusData.uncommittedChanges ? 'has uncommitted changes' : 'clean'}`);
        }

      } catch (error) {
        console.error("Failed to load data from API, falling back to demo:", error);
        // Fallback to demo data
        setEntities(demoEntities);
        setScenes(demoScenes);
        setRelationships(demoRelationships);
        setMessages([{
          id: "msg_welcome",
          role: "assistant",
          content: "Welcome to Ashwood Village. The fog is thick today, and strange things stir in the shadows. What would you like to explore?",
          timestamp: Date.now(),
        }]);
      } finally {
        setIsDataLoading(false);
      }
    }

    loadData();
  }, []);

  // Navigation state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeRow, setActiveRow] = useState<CarouselRow>("entities");

  // UI state
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [isWorldDrawerOpen, setIsWorldDrawerOpen] = useState(false);
  const [proseMode, setProseMode] = useState(false);
  const [proseScrollAccum, setProseScrollAccum] = useState(0);

  // Detail view state
  const [selectedEntity, setSelectedEntity] = useState<EntityDetail | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [generatingFrameId, setGeneratingFrameId] = useState<string | null>(null);

  // LLM working memory - pinned entities
  const [pinnedEntities, setPinnedEntities] = useState<Entity[]>([]);
  const [focusedEntity, setFocusedEntity] = useState<Entity | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; action: string } | null>(null);

  // Settings state
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('narrativeStudioSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }, []);

  // Save settings to localStorage when changed
  const updateSettings = (newSettings: Partial<StudioSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('narrativeStudioSettings', JSON.stringify(updated));
  };

  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  // Helper to get relationships for an entity from loaded data
  const getEntityRelationshipsLocal = (entityId: string): Relationship[] => {
    return relationships
      .filter(r => r.sourceId === entityId || r.targetId === entityId)
      .map(r => ({
        ...r,
        direction: r.sourceId === entityId ? "outgoing" as const : "incoming" as const,
      }));
  };

  // Helper to get scenes for an entity from loaded data
  const getEntityScenesLocal = (entityId: string): Scene[] => {
    return scenes.filter(s => s.participantIds.includes(entityId) || s.locationId === entityId);
  };

  // Helper to get entity by ID from loaded data
  const getEntityByIdLocal = (entityId: string): Entity | undefined => {
    return entities.find(e => e.id === entityId);
  };

  const handleEntityClick = (entity: Entity) => {
    const entityRels = getEntityRelationshipsLocal(entity.id);
    const entityScenes = getEntityScenesLocal(entity.id);
    const relatedIds = new Set(
      entityRels.map((r) => (r.direction === "outgoing" ? r.targetId : r.sourceId))
    );
    const relatedEntities = entities.filter((e) => relatedIds.has(e.id));

    setSelectedEntity({
      entity,
      relationships: entityRels,
      scenes: entityScenes,
      relatedEntities,
    });
    setSelectedScene(null);

    // CRITICAL: Also update carousel position so LLM knows what's selected
    const entityIndex = entities.findIndex(e => e.id === entity.id);
    if (entityIndex >= 0) {
      setActiveRow("entities");
      setCurrentIndex(entityIndex);
    }

    // Load timeline arc for this entity (non-blocking)
    void (async () => {
      try {
        const arcRes = await fetch(`${API_BASE}/api/narrative/story/entity/${entity.id}/arc`);
        if (!arcRes.ok) return;
        const arcData = await arcRes.json();
        setSelectedEntity((prev) => {
          if (!prev || prev.entity.id !== entity.id) return prev;
          return {
            ...prev,
            narrativeArc: arcData.arc,
            arcIssues: arcData.relatedIssues || [],
          };
        });
      } catch (error) {
        console.error("Failed to load entity arc:", error);
      }
    })();
  };

  const handleSceneClick = (scene: Scene) => {
    setSelectedScene(scene);
    setSelectedEntity(null);

    // CRITICAL: Also update carousel position so LLM knows what's selected
    const sceneIndex = scenes.findIndex(s => s.id === scene.id);
    if (sceneIndex >= 0) {
      setActiveRow("scenes");
      setCurrentIndex(sceneIndex);
    }
  };

  const handleSceneUpdate = async (updatedScene: Scene) => {
    // Update local state immediately for responsiveness
    setScenes(prev => prev.map(s => s.id === updatedScene.id ? updatedScene : s));
    setSelectedScene(updatedScene);

    // Persist to API
    try {
      const response = await fetch(`${API_BASE}/api/narrative/interactions/${updatedScene.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updatedScene.title,
          prose: updatedScene.prose,
          status: updatedScene.status,
          participantIds: updatedScene.participantIds,
          locationId: updatedScene.locationId,
          events: updatedScene.events,
          stateChanges: updatedScene.stateChanges,
          imageUrl: updatedScene.imageUrl,
          position: updatedScene.position,
          frames: updatedScene.frames,
        }),
      });

      if (!response.ok) {
        console.error('Failed to persist scene update:', await response.text());
      } else {
        const result = await response.json();
        if (result?.interaction) {
          const [persistedScene] = mapScenesFromApi([result.interaction]);
          if (persistedScene) {
            setScenes((prev) => prev.map((scene) => (scene.id === persistedScene.id ? persistedScene : scene)));
            setSelectedScene(persistedScene);
          }
        }
        console.log(`📽️ Scene update persisted: ${updatedScene.title}`);
      }
    } catch (error) {
      console.error('Failed to persist scene update:', error);
    }
  };

  const handleSceneDiscuss = (scene: Scene) => {
    // Close scene detail and focus on scene in chat
    setSelectedScene(null);
    setInput(`Let's discuss the scene "${scene.title}". `);
    inputRef.current?.focus();
  };

  // Entity portrait generation state
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  const [portraitVariations, setPortraitVariations] = useState<{
    entityId: string;
    images: string[]; // Display URLs (data URLs)
    serverUrls: string[]; // Server URLs for persistence
    mimeTypes: string[]
  } | null>(null);
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const autoPortraitQueueRef = useRef<string[]>([]);
  const autoPortraitRunningRef = useRef(false);

  const generatePortraitForEntity = async (entity: Entity, options?: { silent?: boolean; customPrompt?: string }) => {
    const silent = options?.silent ?? false;
    if (!silent) setIsGeneratingPortrait(true);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/visual/entity/${entity.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityData: {
            id: entity.id,
            name: entity.name,
            type: entity.type,
            description: entity.description,
            traits: entity.traits,
          },
          aspectRatio: '1:1',
          imageSize: '1K',
          visualStylePrompt: settings.visualStylePrompt,
          customPrompt: options?.customPrompt,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate portrait');
      }

      const result = await response.json();

      // Use data URL for immediate display (works across ports)
      const displayUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : (result.imageUrl ? `${API_BASE}${result.imageUrl}` : undefined);

      // Use server-relative URL for persistence (smaller, survives reloads)
      const persistUrl = result.imageUrl || null;

      if (displayUrl) {
        // Update local state immediately with display URL
        setEntities(prev => prev.map(e =>
          e.id === entity.id ? { ...e, referenceImage: displayUrl } : e
        ));
        // Update selected entity if it's the same one
        if (selectedEntity?.entity.id === entity.id) {
          setSelectedEntity({
            ...selectedEntity,
            entity: { ...selectedEntity.entity, referenceImage: displayUrl },
          });
        }

        // Persist the server URL to the entity on the server
        if (persistUrl) {
          try {
            await fetch(`${API_BASE}/api/narrative/entity/${entity.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                updates: {
                  referenceImage: persistUrl,
                  imageUrl: persistUrl,
                },
              }),
            });
            console.log('🎨 Portrait persisted to entity:', entity.name);
          } catch (e) {
            console.error('Failed to persist portrait to entity:', e);
          }
        }
      }

      console.log('🎨 Portrait generated for:', entity.name);
    } catch (error: any) {
      console.error('Portrait generation failed:', error);
    } finally {
      if (!silent) setIsGeneratingPortrait(false);
    }
  };

  const enqueueAutoPortraits = (entityIds: string[]) => {
    const unique = entityIds.filter((id) => !autoPortraitQueueRef.current.includes(id));
    if (unique.length === 0) return;
    autoPortraitQueueRef.current.push(...unique);
    void runAutoPortraitQueue();
  };

  const runAutoPortraitQueue = async () => {
    if (autoPortraitRunningRef.current) return;
    autoPortraitRunningRef.current = true;
    try {
      while (autoPortraitQueueRef.current.length > 0) {
        const entityId = autoPortraitQueueRef.current.shift();
        if (!entityId) continue;
        const entity = entities.find(e => e.id === entityId);
        if (!entity) continue;
        if (entity.referenceImage) continue;
        if (!["character", "creature"].includes(entity.type)) continue;
        await generatePortraitForEntity(entity, { silent: true });
      }
    } finally {
      autoPortraitRunningRef.current = false;
    }
  };

  // Generate portrait for an entity using Nano Banana
  const handleGenerateEntityPortrait = async (entity: Entity, customPrompt?: string) => {
    await generatePortraitForEntity(entity, { silent: false, customPrompt });
  };

  // Generate 4 portrait variations for selection
  const handleGeneratePortraitVariations = async (entity: Entity, customPrompt?: string) => {
    setIsGeneratingVariations(true);
    setPortraitVariations({ entityId: entity.id, images: [], serverUrls: [], mimeTypes: [] });

    try {
      const images: string[] = [];
      const serverUrls: string[] = [];
      const mimeTypes: string[] = [];

      // Generate 4 variations sequentially
      for (let i = 0; i < 4; i++) {
        const response = await fetch(`${API_BASE}/api/narrative/visual/entity/${entity.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityData: {
              id: entity.id,
              name: entity.name,
              type: entity.type,
              description: entity.description,
              traits: entity.traits,
            },
            aspectRatio: '1:1',
            imageSize: '1K',
            variation: i + 1, // Pass variation number for varied prompts
            visualStylePrompt: settings.visualStylePrompt,
            customPrompt,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.image) {
            images.push(`data:${result.mimeType};base64,${result.image}`);
            serverUrls.push(result.imageUrl || '');
            mimeTypes.push(result.mimeType);
          }
        }

        // Update the UI incrementally as each image is generated
        setPortraitVariations({ entityId: entity.id, images: [...images], serverUrls: [...serverUrls], mimeTypes: [...mimeTypes] });
      }

      console.log(`🎨 Generated ${images.length} portrait variations for:`, entity.name);
    } catch (error: any) {
      console.error('Portrait variations generation failed:', error);
    } finally {
      setIsGeneratingVariations(false);
    }
  };

  // Select a specific variation as the canonical portrait
  const handleSelectPortraitVariation = async (entity: Entity, displayUrl: string, index: number) => {
    // Update local state with display URL immediately
    setEntities(prev => prev.map(e =>
      e.id === entity.id ? { ...e, referenceImage: displayUrl } : e
    ));
    // Update selected entity if it's the same one
    if (selectedEntity?.entity.id === entity.id) {
      setSelectedEntity({
        ...selectedEntity,
        entity: { ...selectedEntity.entity, referenceImage: displayUrl },
      });
    }

    // Persist the server URL to the entity
    const serverUrl = portraitVariations?.serverUrls[index];
    if (serverUrl) {
      try {
        await fetch(`${API_BASE}/api/narrative/entity/${entity.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: {
              referenceImage: serverUrl,
              imageUrl: serverUrl,
            },
          }),
        });
        console.log('✅ Selected portrait variation persisted for:', entity.name);
      } catch (e) {
        console.error('Failed to persist selected portrait:', e);
      }
    }

    // Clear the variations
    setPortraitVariations(null);
  };

  // Clear portrait variations (cancel selection)
  const handleClearPortraitVariations = () => {
    setPortraitVariations(null);
  };

  // Generate image for a scene using Nano Banana
  const handleGenerateImage = async (scene: Scene, customPrompt?: string) => {
    setIsGeneratingImage(true);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/visual/scene/${scene.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aspectRatio: '16:9',
          imageSize: '2K',
          usePro: true,
          visualStylePrompt: settings.visualStylePrompt,
          prompt: customPrompt,
          // Pass scene data directly since scenes are stored in React state
          sceneData: {
            id: scene.id,
            title: scene.title,
            prose: scene.prose,
            participantIds: scene.participantIds,
            locationId: scene.locationId,
            frames: scene.frames,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate image');
      }

      const result = await response.json();

      // Update the scene with the generated image
      // Use data URL since API is on different port than frontend
      const imageUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : (result.imageUrl ? `${API_BASE}${result.imageUrl}` : undefined);
      const updatedScene = {
        ...scene,
        imageUrl,
      };
      handleSceneUpdate(updatedScene);

      console.log('🎨 Image generated:', result.referenceCount, 'references used');
    } catch (error: any) {
      console.error('Image generation failed:', error);
      // Could show toast notification here
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateFrames = async (scene: Scene, count: number) => {
    setIsGeneratingFrames(true);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/interactions/${scene.id}/frames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          visualStylePrompt: settings.visualStylePrompt,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate frames");
      }

      const result = await response.json();
      const mappedFrames: SceneFrame[] = (result.frames || []).map((frame: any, idx: number) => ({
        id: frame.id,
        position: frame.position ?? idx,
        title: frame.title,
        description: frame.description,
        visual_beat: frame.visual_beat || frame.visualBeat,
        participantIds: frame.participantIds || [],
        locationId: frame.locationId,
        imageUrl: resolveImageUrl(frame.imageUrl),
        shotType: frame.shotType,
        camera: frame.camera,
        mood: frame.mood,
      }));

      let updatedScene: Scene = {
        ...scene,
        frames: mappedFrames.length > 0 ? mappedFrames.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [],
      };

      if (result?.interaction) {
        const [mappedScene] = mapScenesFromApi([result.interaction]);
        if (mappedScene) {
          updatedScene = {
            ...mappedScene,
            frames: mappedFrames.length > 0 ? mappedFrames.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : mappedScene.frames,
          };
        }
      }

      setScenes(prev => prev.map(s => s.id === scene.id ? updatedScene : s));
      setSelectedScene(updatedScene);
      refreshSessionStatus();
    } catch (error) {
      console.error("Frame generation failed:", error);
    } finally {
      setIsGeneratingFrames(false);
    }
  };

  const handleGenerateFrameImage = async (scene: Scene, frame: SceneFrame, customPrompt?: string) => {
    setGeneratingFrameId(frame.id);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/visual/frame/${scene.id}/${frame.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aspectRatio: "16:9",
          imageSize: "2K",
          usePro: true,
          visualStylePrompt: settings.visualStylePrompt,
          prompt: customPrompt,
          sceneData: {
            id: scene.id,
            title: scene.title,
            prose: scene.prose,
            participantIds: scene.participantIds,
            locationId: scene.locationId,
            frames: scene.frames,
          },
          frameData: frame,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate frame image");
      }

      const result = await response.json();
      const imageUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : (result.imageUrl ? `${API_BASE}${result.imageUrl}` : undefined);

      const updatedFrames = (scene.frames || []).map(f =>
        f.id === frame.id ? { ...f, imageUrl } : f
      );
      const updatedScene = { ...scene, frames: updatedFrames };
      setScenes(prev => prev.map(s => s.id === scene.id ? updatedScene : s));
      setSelectedScene(updatedScene);
      refreshSessionStatus();
    } catch (error) {
      console.error("Frame image generation failed:", error);
    } finally {
      setGeneratingFrameId(null);
    }
  };

  const handleRelatedEntityClick = (entityId: string) => {
    const entity = getEntityByIdLocal(entityId);
    if (entity) {
      handleEntityClick(entity);
      // Also update carousel position
      const idx = entities.findIndex((e) => e.id === entityId);
      if (idx >= 0) {
        setCurrentIndex(idx);
        setActiveRow("entities");
      }
    }
  };

  const handleSceneBubbleClick = (scene: Scene) => {
    setSelectedScene(scene);
    setSelectedEntity(null);
    // Update carousel
    const idx = scenes.findIndex((s) => s.id === scene.id);
    if (idx >= 0) {
      setCurrentIndex(idx);
      setActiveRow("scenes");
    }
  };

  const handleAddScene = () => {
    // Pre-fill chat with scene creation prompt
    const prompt = focusedEntity
      ? `Write a scene featuring ${focusedEntity.name}. `
      : pinnedEntities.length > 0
        ? `Write a scene featuring ${pinnedEntities.map(e => e.name).join(" and ")}. `
        : "Write a new scene for this world. ";
    setInput(prompt);
    inputRef.current?.focus();
    setIsChatExpanded(true);
    if (insertPosition) {
      setInsertPosition(null);
    }
  };

  // Handle story/project change - reload all data
  const handleStoryChange = async (projectId: string) => {
    setIsDataLoading(true);
    setSelectedEntity(null);
    setSelectedScene(null);
    setFocusedEntity(null);
    setPinnedEntities([]);
    setCurrentIndex(0);

    try {
      const [entitiesRes, relationshipsRes, interactionsRes, historyRes, proposalsRes] = await Promise.all([
        fetch(`${API_BASE}/api/narrative/entities`),
        fetch(`${API_BASE}/api/narrative/relationships`),
        fetch(`${API_BASE}/api/narrative/interactions`),
        fetch(`${API_BASE}/api/narrative/chat/history`),
        fetch(`${API_BASE}/api/narrative/proposals`),
      ]);

      let loadedWorldName = "Your World";

      if (entitiesRes.ok) {
        const entitiesData = await entitiesRes.json();
        const mappedEntities: Entity[] = entitiesData.map((e: any) => ({
          id: e.id,
          name: e.name,
          type: e.type || "character",
          description: e.description,
          backstory: e.backstory,
          traits: e.traits || [],
          status: e.status || "draft",
          referenceImage: resolveImageUrl(e.referenceImage || e.imageUrl),
        }));
        setEntities(mappedEntities);
        const firstLocation = mappedEntities.find(e => e.type === "location");
        if (firstLocation) {
          loadedWorldName = firstLocation.name;
          setWorldName(firstLocation.name);
        }
      }

      if (relationshipsRes.ok) {
        const relsData = await relationshipsRes.json();
        setRelationships(relsData.map((r: any) => ({
          id: r.id,
          sourceId: r.source || r.sourceId,
          targetId: r.target || r.targetId,
          sourceName: r.sourceName,
          targetName: r.targetName,
          type: r.type,
          description: r.description,
        })));
      }

      if (interactionsRes.ok) {
        const interactionsData = await interactionsRes.json();
        setScenes(mapScenesFromApi(interactionsData));
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        if (historyData.messages && historyData.messages.length > 0) {
          let baseMessages: Message[] = historyData.messages.map((m: any, i: number) => ({
            id: m.id || `msg_${m.timestamp}_${i}`,
            messageId: m.messageId,
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            timestamp: m.timestamp || Date.now(),
            proposals: m.proposals || [],
          }));

          if (proposalsRes.ok) {
            const proposalsData = await proposalsRes.json();
            if (proposalsData?.proposals?.length) {
              baseMessages = attachProposalsToMessages(baseMessages, proposalsData.proposals);
            }
          }

          setMessages(baseMessages);
        } else {
          setMessages([{
            id: "msg_welcome",
            role: "assistant",
            content: `Welcome to the world of ${loadedWorldName}. I'm here to help you explore and expand this narrative. What would you like to discover?`,
            timestamp: Date.now(),
          }]);
        }
      }

      console.log(`📚 Switched to project: ${projectId}`);
    } catch (error) {
      console.error("Failed to load project data:", error);
    } finally {
      setIsDataLoading(false);
    }
  };

  // Insert scene at a specific position
  const [insertPosition, setInsertPosition] = useState<{ position: number; beforeScene: Scene; afterScene: Scene | null } | null>(null);

  const handleInsertScene = (position: number, beforeScene: Scene, afterScene: Scene | null) => {
    setInsertPosition({ position, beforeScene, afterScene });
    // Pre-fill chat with contextual prompt
    const prompt = afterScene
      ? `Write a scene that happens between "${beforeScene.title}" and "${afterScene.title}". What happens between these moments? `
      : `Write a scene that happens after "${beforeScene.title}". `;
    setInput(prompt);
    inputRef.current?.focus();
    setIsChatExpanded(true);
  };

  // Scene navigation helpers
  const getSceneIndex = (sceneId: string): number => {
    return scenes.findIndex(s => s.id === sceneId);
  };

  const handlePreviousScene = () => {
    if (!selectedScene) return;
    const currentIdx = getSceneIndex(selectedScene.id);
    if (currentIdx > 0) {
      setSelectedScene(scenes[currentIdx - 1]);
    }
  };

  const handleNextScene = () => {
    if (!selectedScene) return;
    const currentIdx = getSceneIndex(selectedScene.id);
    if (currentIdx < scenes.length - 1) {
      setSelectedScene(scenes[currentIdx + 1]);
    }
  };

  // Get currently focused item based on carousel position
  const getFocusedItem = () => {
    if (focusedEntity) {
      return { entity: focusedEntity, scene: null };
    }
    if (selectedEntity?.entity) {
      return { entity: selectedEntity.entity, scene: null };
    }
    if (selectedScene) {
      return { entity: null, scene: selectedScene };
    }
    if (activeRow === "entities" && entities[currentIndex]) {
      return { entity: entities[currentIndex], scene: null };
    }
    if (activeRow === "scenes" && scenes[currentIndex]) {
      return { entity: null, scene: scenes[currentIndex] };
    }
    return { entity: null, scene: null };
  };

  // Execute LLM commands
  const executeCommands = (commands: LLMCommand[]) => {
    for (const cmd of commands) {
      switch (cmd.type) {
        case "navigate":
          const entityIdx = entities.findIndex(e => e.id === cmd.entityId);
          if (entityIdx >= 0) {
            setActiveRow("entities");
            setCurrentIndex(entityIdx);
          }
          break;
        case "navigate_scene":
          const sceneIdx = scenes.findIndex(s => s.id === cmd.sceneId);
          if (sceneIdx >= 0) {
            setActiveRow("scenes");
            setCurrentIndex(sceneIdx);
          }
          break;
        case "pin":
          const toPin = entities.find(e => e.id === cmd.entityId);
          if (toPin && !pinnedEntities.some(p => p.id === toPin.id)) {
            setPinnedEntities(prev => [...prev, toPin]);
          }
          break;
        case "unpin":
          setPinnedEntities(prev => prev.filter(p => p.id !== cmd.entityId));
          break;
        case "focus_row":
          setActiveRow(cmd.row);
          setCurrentIndex(0);
          break;
        case "ask_confirm":
          setPendingConfirm({ message: cmd.message, action: cmd.action });
          break;
        case "generate_frames": {
          const targetSceneId = cmd.sceneId || selectedScene?.id || getFocusedItem().scene?.id;
          if (!targetSceneId) break;
          const targetScene = scenes.find(s => s.id === targetSceneId);
          if (!targetScene) break;
          const frameCount = cmd.count && cmd.count > 0 ? cmd.count : 4;
          handleGenerateFrames(targetScene, frameCount);
          break;
        }
      }
    }
  };

  // Helper function to persist a scene to the API
  const persistScene = async (scene: Scene): Promise<Scene | null> => {
    try {
      const response = await fetch(`${API_BASE}/api/narrative/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: scene.title,
          prose: scene.prose,
          status: scene.status,
          participantIds: scene.participantIds,
          locationId: scene.locationId,
          events: scene.events,
          stateChanges: scene.stateChanges,
          imageUrl: scene.imageUrl,
          position: scene.position,
          frames: scene.frames,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result?.interaction) {
          const [mappedScene] = mapScenesFromApi([result.interaction]);
          return mappedScene || result.interaction;
        }
      }
    } catch (error) {
      console.error('Failed to persist scene:', error);
    }
    return null;
  };

  // Refresh session status (uncommitted changes, etc.)
  const refreshSessionStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/session/status`);
      if (res.ok) {
        const data = await res.json();
        setSessionStatus(data);
      }
    } catch (error) {
      console.error('Failed to refresh session status:', error);
    }
  };

  // Commit current changes to the narrative
  const handleCommit = async () => {
    if (!commitMessage.trim()) return;

    setIsCommitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage.trim() }),
      });

      if (res.ok) {
        const result = await res.json();
        console.log('📝 Committed:', result.commit);

        // Clear the commit input
        setCommitMessage('');
        setShowCommitInput(false);
        setLlmCommitSuggestion(null);

        // Refresh session status to reflect the commit
        await refreshSessionStatus();
      }
    } catch (error) {
      console.error('Failed to commit:', error);
    } finally {
      setIsCommitting(false);
    }
  };

  // Generate a suggested commit message based on pending changes
  const generateCommitSuggestion = () => {
    if (llmCommitSuggestion) return llmCommitSuggestion;
    if (!sessionStatus?.pendingChanges) return '';

    const { summary, addedEntities, addedRelationships, addedScenes, modifiedScenes } = sessionStatus.pendingChanges;
    const parts: string[] = [];

    if (summary.entitiesAdded > 0) {
      if (summary.entitiesAdded <= 3) {
        parts.push(`Add ${addedEntities.map(e => e.name).join(', ')}`);
      } else {
        parts.push(`Add ${summary.entitiesAdded} entities`);
      }
    }
    if (summary.entitiesModified > 0) {
      parts.push(`update ${summary.entitiesModified} entities`);
    }
    if (summary.relationshipsAdded > 0) {
      if (summary.relationshipsAdded <= 2) {
        parts.push(`connect ${addedRelationships.map(r => `${r.sourceName} → ${r.targetName}`).join(', ')}`);
      } else {
        parts.push(`add ${summary.relationshipsAdded} relationships`);
      }
    }
    if (summary.scenesAdded > 0) {
      if (summary.scenesAdded <= 2) {
        parts.push(`create scene${summary.scenesAdded > 1 ? 's' : ''}: ${addedScenes.map(s => s.title).join(', ')}`);
      } else {
        parts.push(`add ${summary.scenesAdded} scenes`);
      }
    }
    if (summary.scenesModified && summary.scenesModified > 0) {
      if (summary.scenesModified <= 2 && modifiedScenes && modifiedScenes.length > 0) {
        parts.push(`update scene${summary.scenesModified > 1 ? 's' : ''}: ${modifiedScenes.map(s => s.title).join(', ')}`);
      } else {
        parts.push(`update ${summary.scenesModified} scenes`);
      }
    }

    return parts.length > 0 ? parts.join('; ') : 'World state update';
  };

  // Handle accepting a single proposal
  const handleAcceptProposal = async (messageId: string, proposal: EntityProposal) => {
    try {
      // Check if this is a local scene proposal (not from API)
      if (proposal.id.startsWith('scene_prop_') && proposal.entity?.type === 'scene') {
        // Handle scene proposal locally - add to scenes array
        const msg = messages.find(m => m.id === messageId);

        // Collect participant IDs from focused entity and pinned entities
        const participantIds: string[] = [];
        if (focusedEntity) {
          participantIds.push(focusedEntity.id);
        }
        pinnedEntities.forEach(e => {
          if (!participantIds.includes(e.id)) {
            participantIds.push(e.id);
          }
        });

        const targetPosition = insertPosition ? insertPosition.position : scenes.length;
        const newScene: Scene = {
          id: `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: proposal.entity.name,
          prose: msg?.content || proposal.entity.description || '',
          status: 'draft',
          participantIds,
          events: [],
          stateChanges: [],
          position: targetPosition,
        };

        // Persist to API first
        const persistedScene = await persistScene(newScene);
        const sceneToAdd = persistedScene || newScene;

        setScenes(prev => {
          const shifted = prev.map(s => {
            if (s.position !== undefined && s.position >= targetPosition) {
              return { ...s, position: s.position + 1 };
            }
            return s;
          });
          return [...shifted, sceneToAdd].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        });

        if (insertPosition) {
          setInsertPosition(null);
        }

        // Update proposal status
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId || !msg.proposals) return msg;
          return {
            ...msg,
            proposals: msg.proposals.map(p =>
              p.id === proposal.id ? { ...p, status: "accepted" as const } : p
            ),
          };
        }));

        console.log(`📽️ Added scene to storyboard: ${sceneToAdd.title} (persisted: ${!!persistedScene})`);
        enqueueAutoPortraits(sceneToAdd.participantIds || []);
        refreshSessionStatus();
        return;
      }

      // For API-created proposals, call the API
      const res = await fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "accept" }),
      });

      if (res.ok) {
        // Update the proposal status in the message
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId || !msg.proposals) return msg;
          return {
            ...msg,
            proposals: msg.proposals.map(p =>
              p.id === proposal.id ? { ...p, status: "accepted" as const } : p
            ),
          };
        }));

        // Refresh data based on proposal type
        if (proposal.type === "add_scene" || proposal.type === "update_scene") {
          // Refresh scenes to include the new one
          const scenesRes = await fetch(`${API_BASE}/api/narrative/interactions`);
          if (scenesRes.ok) {
            const scenesData = await scenesRes.json();
            setScenes(mapScenesFromApi(scenesData));
            console.log(`📽️ Scene ${proposal.type === "add_scene" ? "accepted" : "updated"}: ${proposal.scene?.title}`);
          }
          if (proposal.type === "add_scene" && proposal.scene?.participantIds?.length) {
            enqueueAutoPortraits(proposal.scene.participantIds);
          }
        } else {
          // Refresh entities to include the new one
          const entitiesRes = await fetch(`${API_BASE}/api/narrative/entities`);
          if (entitiesRes.ok) {
            const entitiesData = await entitiesRes.json();
            setEntities(entitiesData.map((e: any) => ({
              id: e.id,
              name: e.name,
              type: e.type,
              description: e.description || "",
              backstory: e.backstory,
              traits: e.traits || [],
              status: e.status || "draft",
              referenceImage: resolveImageUrl(e.referenceImage || e.imageUrl),
            })));
          }

          // Also refresh relationships for relationship proposals
          if (proposal.type === "add_relationship" || proposal.type === "relationship") {
            const relsRes = await fetch(`${API_BASE}/api/narrative/relationships`);
            if (relsRes.ok) {
              const relsData = await relsRes.json();
              setRelationships(relsData.map((r: any) => ({
                id: r.id,
                sourceId: r.source || r.sourceId,
                targetId: r.target || r.targetId,
                sourceName: r.sourceName,
                targetName: r.targetName,
                type: r.type,
                description: r.description,
              })));
            }
          }
        }

        // Refresh session status to update uncommitted changes
        refreshSessionStatus();
      }
    } catch (error) {
      console.error("Failed to accept proposal:", error);
    }
  };

  // Handle rejecting a single proposal
  const handleRejectProposal = async (messageId: string, proposal: EntityProposal) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject" }),
      });

      if (res.ok) {
        // Update the proposal status in the message
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId || !msg.proposals) return msg;
          return {
            ...msg,
            proposals: msg.proposals.map(p =>
              p.id === proposal.id ? { ...p, status: "rejected" as const } : p
            ),
          };
        }));
      }
    } catch (error) {
      console.error("Failed to reject proposal:", error);
    }
  };

  // Handle accepting all proposals from a message
  const handleAcceptAllProposals = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.proposals) return;

    const pendingProposals = msg.proposals.filter(p => p.status === "pending");

    try {
      // Separate local scene proposals from API proposals
      const localSceneProposals = pendingProposals.filter(p => p.id.startsWith('scene_prop_') && p.entity?.type === 'scene');
      const apiProposals = pendingProposals.filter(p => !p.id.startsWith('scene_prop_'));
      const hasApiSceneProposals = apiProposals.some(p => p.type === 'add_scene' || p.type === 'update_scene');

      // Handle local scene proposals - persist to API
      if (localSceneProposals.length > 0) {
        const participantIds = [
          ...(focusedEntity ? [focusedEntity.id] : []),
          ...pinnedEntities.map(e => e.id),
        ].filter((id, i, arr) => arr.indexOf(id) === i); // unique IDs

        const scenesToAdd: Scene[] = [];

        const basePosition = insertPosition ? insertPosition.position : scenes.length;
        for (let i = 0; i < localSceneProposals.length; i++) {
          const proposal = localSceneProposals[i];
          const newScene: Scene = {
            id: `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: proposal.entity?.name || 'Untitled Scene',
            prose: msg.content || proposal.entity?.description || '',
            status: 'draft',
            participantIds,
            events: [],
            stateChanges: [],
            position: basePosition + i,
          };

          // Persist to API
          const persistedScene = await persistScene(newScene);
          scenesToAdd.push(persistedScene || newScene);
        }

        setScenes(prev => {
          const shifted = insertPosition
            ? prev.map(s => {
                if (s.position !== undefined && s.position >= basePosition) {
                  return { ...s, position: s.position + localSceneProposals.length };
                }
                return s;
              })
            : prev;
          return [...shifted, ...scenesToAdd].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        });
        console.log(`📽️ Added ${scenesToAdd.length} scenes to storyboard (all persisted to API)`);
        scenesToAdd.forEach(scene => enqueueAutoPortraits(scene.participantIds || []));
        if (insertPosition) {
          setInsertPosition(null);
        }
      }

      // Accept API proposals
      if (apiProposals.length > 0) {
        await Promise.all(apiProposals.map(proposal =>
          fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/decide`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "accept" }),
          })
        ));
      }

      // Update all proposal statuses
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId || !m.proposals) return m;
        return {
          ...m,
          proposals: m.proposals.map(p => ({ ...p, status: "accepted" as const })),
        };
      }));

      // Refresh data based on what was accepted
      if (hasApiSceneProposals) {
        // Refresh scenes
        const scenesRes = await fetch(`${API_BASE}/api/narrative/interactions`);
        if (scenesRes.ok) {
          const scenesData = await scenesRes.json();
          setScenes(mapScenesFromApi(scenesData));
        }
        apiProposals
          .filter(p => p.type === "add_scene")
          .forEach(p => {
            if (p.scene?.participantIds?.length) {
              enqueueAutoPortraits(p.scene.participantIds);
            }
          });
      }

      // Refresh entities
      const entitiesRes = await fetch(`${API_BASE}/api/narrative/entities`);
      if (entitiesRes.ok) {
        const entitiesData = await entitiesRes.json();
        setEntities(entitiesData.map((e: any) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description || "",
          backstory: e.backstory,
          traits: e.traits || [],
          status: e.status || "draft",
          referenceImage: resolveImageUrl(e.referenceImage || e.imageUrl),
        })));
      }

      // Refresh relationships if any relationship proposals
      if (apiProposals.some(p => p.type === 'add_relationship' || p.type === 'relationship')) {
        const relsRes = await fetch(`${API_BASE}/api/narrative/relationships`);
        if (relsRes.ok) {
          const relsData = await relsRes.json();
          setRelationships(relsData.map((r: any) => ({
            id: r.id,
            sourceId: r.source || r.sourceId,
            targetId: r.target || r.targetId,
            sourceName: r.sourceName,
            targetName: r.targetName,
            type: r.type,
            description: r.description,
          })));
        }
      }

      // Refresh session status to update uncommitted changes
      refreshSessionStatus();
    } catch (error) {
      console.error("Failed to accept all proposals:", error);
    }
  };

  // Demo mode - use local responses for instant navigation
  // Set to false to use real API with narrative graph
  const USE_DEMO_MODE = false;

  // Detect navigation intent and extract target entity
  const detectNavigationIntent = (input: string): Entity | null => {
    const lowerInput = input.toLowerCase();
    const navKeywords = ["show", "go to", "navigate", "focus", "take me to", "let's see", "open", "view"];

    const hasNavIntent = navKeywords.some(keyword => lowerInput.includes(keyword));
    if (!hasNavIntent) return null;

    // Find matching entity
    for (const entity of entities) {
      const nameLower = entity.name.toLowerCase();
      const firstName = entity.name.split(" ")[0].toLowerCase();

      if (lowerInput.includes(nameLower) || lowerInput.includes(firstName)) {
        return entity;
      }
    }
    return null;
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput("");
    setIsLoading(true);

    // Build context for LLM
    const { entity: focusedEntity, scene: focusedScene } = getFocusedItem();

    // Check for navigation intent FIRST - instant response
    const navTarget = detectNavigationIntent(currentInput);
    if (navTarget) {
      // Navigate immediately
      const idx = entities.findIndex(e => e.id === navTarget.id);
      if (idx >= 0) {
        setActiveRow("entities");
        setCurrentIndex(idx);
      }

      // Add atmospheric response
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_ai`,
          role: "assistant",
          content: `${navTarget.description || `Here is ${navTarget.name}.`}`,
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(false);
      return;
    }

    // For demo mode, use simulated responses (instant, supports commands)
    if (USE_DEMO_MODE) {
      // Small delay to feel natural
      await new Promise(resolve => setTimeout(resolve, 300));

      const simulatedResponse = generateSimulatedResponse(currentInput, focusedEntity, entities);
      const { cleanText, commands } = parseLLMCommands(simulatedResponse);

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_ai`,
          role: "assistant",
          content: cleanText,
          timestamp: Date.now(),
        },
      ]);

      if (commands.length > 0) {
        executeCommands(commands);
      }
      setIsLoading(false);
      return;
    }

    // Real API mode (for when server supports navigation commands)
    const context = buildLLMContext(
      focusedEntity,
      focusedScene,
      pinnedEntities,
      entities,
      scenes,
      activeRow,
      insertPosition
    );

    try {
      // Build system prompt with optional writing style
      let systemPrompt = `You are a narrative director helping build a story world. You can control the UI using commands.
When the user asks to see an entity, use [[NAVIGATE:entity_id]].
When discussing multiple entities, pin important ones with [[PIN:entity_id]].
When suggesting scene placement, use [[NAVIGATE_SCENE:scene_id]] and [[ASK_CONFIRM:question|action]].
Keep responses concise and atmospheric.`;

      if (settings.writingStylePrompt) {
        systemPrompt += `\n\n=== WRITING STYLE ===\n${settings.writingStylePrompt}`;
      }

      const res = await fetch(`${API_BASE}/api/narrative/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentInput,
          context: context,
          systemPrompt,
          writingStylePrompt: settings.writingStylePrompt,
          // Full selection context for proper grounding
          selection: {
            // Currently selected entity/scene (from carousel position)
            focusedEntityId: focusedEntity?.id || null,
            focusedSceneId: focusedScene?.id || null,
            // Explicit selection tracking
            activeRow,
            currentIndex,
            // Working memory - pinned entities the user wants to focus on
            pinnedEntityIds: pinnedEntities.map(e => e.id),
            // Insert context (if user is inserting a scene)
            insertAfterSceneId: insertPosition?.beforeScene?.id || null,
            insertBeforeSceneId: insertPosition?.afterScene?.id || null,
            insertPosition: insertPosition?.position ?? null,
          },
          // Legacy fields for backwards compatibility
          focusedEntityId: focusedEntity?.id || null,
          focusedSceneId: focusedScene?.id || null,
        }),
      });

      if (!res.ok) throw new Error("Chat failed");
      const data = await res.json();

      const { cleanText, commands } = parseLLMCommands(data.response);

      // Extract proposals from API response (now includes scene proposals from LLM)
      const proposals: EntityProposal[] = (data.pendingProposals || []).map(mapServerProposal);
      const autoAccepted: EntityProposal[] = (data.autoAcceptedProposals || []).map(mapServerProposal);

      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId || `msg_${Date.now()}_ai`,
          messageId: data.messageId,
          role: "assistant",
          content: cleanText,
          timestamp: Date.now(),
          proposals: proposals.length > 0 ? proposals : undefined,
          toolUsage: data.toolUsage || null,
        },
      ]);

      if (data.narrative?.suggestCommit && data.narrative?.eventDescription) {
        setLlmCommitSuggestion(data.narrative.eventDescription);
      }

      if (autoAccepted.length > 0) {
        setAutoAcceptedProposals(autoAccepted);
        scheduleAutoAcceptedClear();
      }

      // Log tool usage for debugging
      if (data.toolUsage?.totalCalls > 0) {
        console.log(`🔧 Agent used ${data.toolUsage.totalCalls} tool call(s):`, data.toolUsage.steps);
      }

      // If new entities were proposed, refresh the entity list
      if (proposals.length > 0) {
        console.log(`📝 ${proposals.length} new proposals:`, proposals);
      }

      if (commands.length > 0) {
        executeCommands(commands);
      }

      // Update session status from response (uncommitted changes, etc.)
      if (data.worldState) {
        setSessionStatus(prev => ({
          ...prev!,
          uncommittedChanges: data.worldState.uncommittedChanges ?? prev?.uncommittedChanges ?? false,
          currentBranch: data.worldState.currentBranch ?? prev?.currentBranch ?? 'main',
          storyConsistency: data.worldState.storyConsistency ?? prev?.storyConsistency,
          pendingChanges: prev?.pendingChanges ?? {
            addedEntities: [],
            modifiedEntities: [],
            addedRelationships: [],
            addedScenes: [],
            summary: { entitiesAdded: 0, entitiesModified: 0, relationshipsAdded: 0, scenesAdded: 0, total: 0 },
          },
        }));
        // Refresh full status to get detailed pending changes
        if (data.worldState.uncommittedChanges) {
          refreshSessionStatus();
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const simulatedResponse = generateSimulatedResponse(currentInput, focusedEntity, entities);
      const { cleanText, commands } = parseLLMCommands(simulatedResponse);

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_ai`,
          role: "assistant",
          content: cleanText,
          timestamp: Date.now(),
        },
      ]);

      if (commands.length > 0) {
        executeCommands(commands);
      }
    } finally {
      setIsLoading(false);
      if (insertPosition) {
        setInsertPosition(null);
      }
    }
  };

  // Simulated response for demo when API unavailable
  function generateSimulatedResponse(input: string, focused: Entity | null, allEntities: Entity[]): string {
    const lowerInput = input.toLowerCase();

    // Navigation intent keywords
    const navKeywords = ["show", "go to", "navigate", "focus", "take me", "let's see", "open", "view", "find"];
    const pinKeywords = ["pin", "remember", "track", "keep", "hold"];
    const tellKeywords = ["tell", "about", "who is", "what is", "describe", "explain"];
    const relationKeywords = ["connect", "relation", "know", "interact", "between", "link"];
    const suggestKeywords = ["suggest", "idea", "what if", "should", "could", "next", "then", "interesting"];

    // Check for entity references
    for (const entity of allEntities) {
      const nameLower = entity.name.toLowerCase();
      const firstName = entity.name.split(" ")[0].toLowerCase();
      const matchesEntity = lowerInput.includes(nameLower) || lowerInput.includes(firstName);

      if (matchesEntity) {
        // Navigation request
        if (navKeywords.some(k => lowerInput.includes(k))) {
          return `Let me show you ${entity.name}. [[NAVIGATE:${entity.id}]] ${entity.description || ""}`;
        }

        // Pin request
        if (pinKeywords.some(k => lowerInput.includes(k))) {
          return `I'll keep ${entity.name} in my working memory. [[PIN:${entity.id}]] We can reference them as we continue building the narrative.`;
        }

        // Relationship exploration - navigate to show connections
        if (relationKeywords.some(k => lowerInput.includes(k))) {
          const relationships = getEntityRelationshipsLocal(entity.id);
          if (relationships.length > 0) {
            const rel = relationships[0];
            const otherId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
            const otherName = rel.direction === "outgoing" ? rel.targetName : rel.sourceName;
            return `${entity.name} has a key connection: ${rel.type} with ${otherName}. ${rel.description || ""} [[NAVIGATE:${entity.id}]] [[PIN:${entity.id}]] Let me also bring ${otherName} into focus. [[PIN:${otherId}]]`;
          }
        }

        // Tell me about request - navigate AND pin for working context
        if (tellKeywords.some(k => lowerInput.includes(k))) {
          const relationships = getEntityRelationshipsLocal(entity.id);
          const relSummary = relationships.length > 0
            ? ` They have ${relationships.length} connections in this world.`
            : "";
          return `${entity.name}: ${entity.description || "No description yet."}${entity.backstory ? ` ${entity.backstory}` : ""}${relSummary} [[NAVIGATE:${entity.id}]] [[PIN:${entity.id}]]`;
        }

        // Just mentioned the entity - navigate to it
        return `${entity.name} - ${entity.description || "An interesting entity in this world."} [[NAVIGATE:${entity.id}]]`;
      }
    }

    // Check for scene requests
    if (lowerInput.includes("scene") || lowerInput.includes("storyboard") || lowerInput.includes("story")) {
      return `Let me show you the scenes. [[FOCUS_ROW:scenes]] We have ${scenes.length} scenes in the storyboard so far.`;
    }

    // Check for entity list requests
    if (lowerInput.includes("entities") || lowerInput.includes("characters") || lowerInput.includes("who") || lowerInput.includes("everyone")) {
      const characters = allEntities.filter(e => e.type === "character");
      return `[[FOCUS_ROW:entities]] Here are the entities in your world. We have ${characters.length} characters and ${allEntities.length - characters.length} other entities.`;
    }

    // Check for location requests
    if (lowerInput.includes("location") || lowerInput.includes("place") || lowerInput.includes("where")) {
      const locations = allEntities.filter(e => e.type === "location");
      if (locations.length > 0) {
        return `There are ${locations.length} locations in this world: ${locations.map(l => l.name).join(", ")}. [[NAVIGATE:${locations[0].id}]]`;
      }
    }

    // Check for curse/mystery/plot keywords - proactively navigate to relevant entities
    if (lowerInput.includes("curse") || lowerInput.includes("ritual") || lowerInput.includes("mystery")) {
      const shade = allEntities.find(e => e.name.toLowerCase().includes("shade") || e.name.toLowerCase().includes("hollow"));
      const ruins = allEntities.find(e => e.name.toLowerCase().includes("sanctum") || e.name.toLowerCase().includes("ruins"));
      if (shade) {
        return `The curse... it manifests through The Hollow Shade - once human, now something between life and death. [[NAVIGATE:${shade.id}]] [[PIN:${shade.id}]] The answers may lie in the Broken Sanctum where the ritual was performed.${ruins ? ` [[PIN:${ruins.id}]]` : ""}`;
      }
    }

    // Check for danger/conflict keywords
    if (lowerInput.includes("danger") || lowerInput.includes("threat") || lowerInput.includes("enemy") || lowerInput.includes("conflict")) {
      const shade = allEntities.find(e => e.type === "creature");
      const council = allEntities.find(e => e.type === "faction");
      if (shade) {
        return `The primary threat is ${shade.name}. ${shade.description || ""} [[NAVIGATE:${shade.id}]]${council ? ` But don't overlook ${council.name} - they have their own dark secrets. [[PIN:${council.id}]]` : ""}`;
      }
    }

    // Suggestion/brainstorming - proactively suggest and navigate
    if (suggestKeywords.some(k => lowerInput.includes(k))) {
      if (focused) {
        const relationships = getEntityRelationshipsLocal(focused.id);
        if (relationships.length > 0) {
          const rel = relationships[Math.floor(Math.random() * relationships.length)];
          const otherId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
          const otherName = rel.direction === "outgoing" ? rel.targetName : rel.sourceName;
          return `Interesting thought... ${focused.name}'s connection to ${otherName} could be deepened. ${rel.description || ""} What if we explored that tension further? [[NAVIGATE:${otherId}]] [[PIN:${focused.id}]] [[PIN:${otherId}]]`;
        }
      }
      // Suggest exploring an underexplored entity
      const draftEntities = allEntities.filter(e => e.status === "draft");
      if (draftEntities.length > 0) {
        const draft = draftEntities[0];
        return `I notice ${draft.name} is still in draft. Perhaps we should develop them further? [[NAVIGATE:${draft.id}]] [[PIN:${draft.id}]]`;
      }
    }

    // Context-aware response about focused item - suggest related exploration
    if (focused) {
      const relationships = getEntityRelationshipsLocal(focused.id);
      if (relationships.length > 0) {
        const rel = relationships[Math.floor(Math.random() * relationships.length)];
        const otherId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
        const otherName = rel.direction === "outgoing" ? rel.targetName : rel.sourceName;
        return `You're looking at ${focused.name}. Their ${rel.type} connection with ${otherName} is intriguing - "${rel.description || ""}". Shall we explore that thread? [[PIN:${focused.id}]]`;
      }
      return `You're looking at ${focused.name}. ${focused.description || ""} What aspect would you like to develop?`;
    }

    // Default - proactively suggest the protagonist
    const protagonist = allEntities.find(e => e.type === "character" && e.name.toLowerCase().includes("silas"));
    if (protagonist) {
      return `The mists of Ashwood swirl with possibility. Perhaps we should start with ${protagonist.name}, the wanderer drawn to this cursed place? [[NAVIGATE:${protagonist.id}]]`;
    }

    const randomEntity = allEntities[Math.floor(Math.random() * allEntities.length)];
    if (randomEntity) {
      return `The mists of Ashwood swirl with possibility. Let me draw your attention to ${randomEntity.name}. [[NAVIGATE:${randomEntity.id}]]`;
    }

    return "The mists of this world swirl with possibility. Tell me - what story shall we weave today?";
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFocusInChat = (entity: Entity) => {
    setSelectedEntity(null);
    setFocusedEntity(entity);
    setInput(`Tell me more about ${entity.name}. `);
    inputRef.current?.focus();
    // Also navigate to that entity in the carousel
    const idx = entities.findIndex(e => e.id === entity.id);
    if (idx >= 0) {
      setActiveRow("entities");
      setCurrentIndex(idx);
    }
  };

  const exitFocusMode = () => {
    setFocusedEntity(null);
  };

  // Current items based on active row
  const currentItems = activeRow === "scenes" ? scenes : entities;

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-[45] bg-slate-950/90 backdrop-blur-xl border-b border-white/10">
        {/* Main header row */}
        <div className="h-12 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-gray-200">Narrative Studio</span>
            </div>

            {/* Story Switcher */}
            <StorySwitcher onStoryChange={handleStoryChange} />
          </div>

          {/* Center: Commit status (inline) */}
          <div className="flex items-center gap-2">
            {sessionStatus?.storyConsistency && (
              <div
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border",
                  sessionStatus.storyConsistency.errors > 0
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                    : sessionStatus.storyConsistency.warnings > 0
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                      : "border-green-500/40 bg-green-500/15 text-green-300"
                )}
              >
                continuity {sessionStatus.storyConsistency.errors}e/{sessionStatus.storyConsistency.warnings}w
              </div>
            )}
            {sessionStatus?.uncommittedChanges && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span className="text-gray-500">{sessionStatus.currentBranch}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-green-300 font-medium">
                    {sessionStatus.pendingChanges?.summary.total || 0} changes
                  </span>
                </div>
                {sessionStatus.pendingChanges && (
                  <div className="flex items-center gap-1">
                    {sessionStatus.pendingChanges.summary.entitiesAdded > 0 && (
                      <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-[10px]">
                        +{sessionStatus.pendingChanges.summary.entitiesAdded}
                      </span>
                    )}
                    {sessionStatus.pendingChanges.summary.entitiesModified > 0 && (
                      <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px]">
                        ~{sessionStatus.pendingChanges.summary.entitiesModified}
                      </span>
                    )}
                    {sessionStatus.pendingChanges.summary.relationshipsAdded > 0 && (
                      <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-[10px]">
                        +{sessionStatus.pendingChanges.summary.relationshipsAdded} rel
                      </span>
                    )}
                    {sessionStatus.pendingChanges.summary.scenesAdded > 0 && (
                      <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-[10px]">
                        +{sessionStatus.pendingChanges.summary.scenesAdded} scene
                      </span>
                    )}
                  </div>
                )}
                {!showCommitInput ? (
                  <button
                    onClick={() => {
                      setShowCommitInput(true);
                      setCommitMessage(generateCommitSuggestion());
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                  >
                    <GitCommit className="w-3 h-3" />
                    Commit
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message..."
                      className="w-48 px-2 py-1 text-[11px] rounded-md bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-green-500/50"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && commitMessage.trim()) {
                          handleCommit();
                        } else if (e.key === 'Escape') {
                          setShowCommitInput(false);
                          setCommitMessage('');
                        }
                      }}
                      autoFocus
                    />
                    <button
                      onClick={handleCommit}
                      disabled={!commitMessage.trim() || isCommitting}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isCommitting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowCommitInput(false);
                        setCommitMessage('');
                      }}
                      className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1">
            {/* Working Memory - Pinned Entities */}
            {pinnedEntities.length > 0 && (
              <div className="flex items-center gap-1.5 mr-2">
                <div className="flex -space-x-1.5">
                  {pinnedEntities.map((entity) => {
                    const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
                    return (
                      <button
                        key={entity.id}
                        onClick={() => {
                          const idx = entities.findIndex(e => e.id === entity.id);
                          if (idx >= 0) {
                            setActiveRow("entities");
                            setCurrentIndex(idx);
                          }
                        }}
                        className="group relative"
                        title={entity.name}
                      >
                        <div className={cn(
                          "w-7 h-7 rounded-full overflow-hidden ring-2 ring-slate-900 transition-all group-hover:ring-amber-400",
                          config.ringColor
                        )}>
                          {entity.referenceImage ? (
                            <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                              <config.icon className={cn("w-3.5 h-3.5", config.color)} />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPinnedEntities(prev => prev.filter(p => p.id !== entity.id));
                          }}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-[8px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          ×
                        </button>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => setProseMode(!proseMode)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                proseMode ? "bg-amber-500/20 text-amber-400" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              )}
              title={proseMode ? "Switch to Director Mode" : "Switch to Prose Mode"}
            >
              {proseMode ? <LayoutGrid className="w-3.5 h-3.5" /> : <PenLine className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setIsWorldDrawerOpen(!isWorldDrawerOpen)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                isWorldDrawerOpen ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                isSettingsOpen ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              )}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Focus Mode strip (only when entity is focused) */}
        <AnimatePresence>
          {focusedEntity && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="h-8 bg-amber-500/10 border-t border-amber-500/30 flex items-center justify-center gap-3 px-4">
                <span className="text-amber-400 text-xs flex items-center gap-1.5">
                  <span>🎯</span>
                  Focusing on: <strong className="text-amber-200">{focusedEntity.name}</strong>
                </span>
                <button
                  onClick={exitFocusMode}
                  className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
                >
                  Exit Focus
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Auto-Accept Banner - Allows undo of low-risk auto-accepted changes */}
      <AnimatePresence>
        {autoAcceptedProposals && autoAcceptedProposals.length > 0 && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className={cn(
              "absolute left-0 right-0 z-40 px-4 py-1.5 flex items-center justify-between bg-blue-500/10 border-b border-blue-500/30",
              focusedEntity ? "top-20" : "top-12"
            )}
          >
            <div className="text-xs text-blue-300">
              Auto-accepted:{" "}
              <span className="text-blue-200">
                {autoAcceptedProposals.map(p => p.entity?.name || p.relationship?.type || p.scene?.title || "update").join(", ")}
              </span>
            </div>
            <button
              onClick={handleUndoAutoAccepted}
              className="px-3 py-1 text-xs rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== DIRECTOR MODE ===================== */}
      {!proseMode && (
        <>
          {/* Row Navigation - Centered below header */}
          <div className={cn(
            "absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 transition-all",
            focusedEntity ? "top-[5.5rem]" : "top-14"
          )}>
            <button
              onClick={() => { setActiveRow("scenes"); setCurrentIndex(0); }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all",
                activeRow === "scenes" ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              )}
            >
              <Film className="w-4 h-4" />
              Scenes ({scenes.length})
            </button>
            <button
              onClick={() => { setActiveRow("entities"); setCurrentIndex(0); }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all",
                activeRow === "entities" ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              )}
            >
              <Users className="w-4 h-4" />
              Entities ({entities.length})
            </button>
          </div>

          {/* Storyboard Strip - Horizontal timeline of scenes */}
          {scenes.length > 0 && (
            <div className={cn(
              "absolute left-0 right-0 z-40 py-3 bg-gradient-to-b from-slate-950/80 to-transparent transition-all",
              focusedEntity ? "top-[7.5rem]" : "top-24"
            )}>
              <StoryboardStrip
                scenes={scenes}
                selectedSceneId={selectedScene?.id}
                onSceneClick={handleSceneClick}
                onAddScene={handleAddScene}
                onInsertScene={handleInsertScene}
              />
            </div>
          )}

          {/* Main Carousel Area - shifts up when chat expands */}
          <div
            className={cn(
              "absolute inset-0",
              scenes.length > 0 ? "pt-44" : "pt-24",
              "pb-32"
            )}
            style={{
              perspective: "1200px",
              transform: isChatExpanded ? "translateY(-100px)" : "translateY(0)",
              transition: "transform 0.3s ease-out"
            }}
          >
            <Carousel3D
              items={currentItems as (Scene | Entity)[]}
              currentIndex={currentIndex}
              onIndexChange={setCurrentIndex}
              compactMode={isChatExpanded}
              renderItem={(item, isActive) =>
                activeRow === "scenes" ? (
                  <SceneCard scene={item as Scene} entities={entities} isActive={isActive} onClick={() => handleSceneClick(item as Scene)} compactMode={isChatExpanded} />
                ) : (
                  <EntityCard entity={item as Entity} isActive={isActive} onClick={() => handleEntityClick(item as Entity)} compactMode={isChatExpanded} />
                )
              }
            />
          </div>

          {/* Floating Chat Box - Centered at bottom */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4">
        <motion.div
          layout
          className="bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        >
          {/* Chat Toggle Header */}
          <button
            onClick={() => setIsChatExpanded(!isChatExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-400 hover:text-gray-200 border-b border-white/5"
          >
            <span className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {messages.length} messages
            </span>
            <span className="flex items-center gap-1">
              {isChatExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </span>
          </button>

          {/* Messages - Only shown when expanded */}
          <AnimatePresence>
            {isChatExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 260, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div ref={chatContainerRef} className="h-full overflow-y-auto p-4 space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                      <div className={cn(
                        "max-w-[85%] rounded-xl px-4 py-2.5 text-sm",
                        msg.role === "user" ? "bg-amber-500/20 text-gray-100" : "bg-white/5 text-gray-300"
                      )}>
                        {msg.content}
                      </div>

                      {/* Inline Entity Proposals */}
                      {msg.proposals && msg.proposals.length > 0 && (
                        <div className="max-w-[85%] mt-2 border border-amber-500/30 rounded-lg bg-amber-500/5 overflow-hidden">
                          <button
                            className="w-full px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400 font-medium flex items-center justify-between hover:bg-amber-500/20 transition-colors"
                            onClick={() => {
                              setReviewingProposals([...msg.proposals!]);
                              setReviewingMessageId(msg.id);
                              setReviewIndex(0);
                              setPreviewPortrait(null);
                              setRefineFeedback("");
                            }}
                          >
                            <span className="flex items-center gap-1.5">
                              <Eye className="w-3 h-3" />
                              New Elements ({msg.proposals.length})
                            </span>
                            <span className="text-amber-400/60 text-[10px]">Click to review</span>
                          </button>
                          <div className="p-2 space-y-1">
                            {msg.proposals.map((proposal) => (
                              <div
                                key={proposal.id}
                                className={cn(
                                  "flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs cursor-pointer",
                                  proposal.status === "accepted" && "bg-green-500/10",
                                  proposal.status === "rejected" && "bg-red-500/10 opacity-50",
                                  proposal.status === "pending" && "bg-white/5 hover:bg-white/10"
                                )}
                                onClick={() => {
                                  const idx = msg.proposals!.findIndex(p => p.id === proposal.id);
                                  setReviewingProposals([...msg.proposals!]);
                                  setReviewingMessageId(msg.id);
                                  setReviewIndex(idx >= 0 ? idx : 0);
                                  setPreviewPortrait(null);
                                  setRefineFeedback("");
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {proposal.type === "update_scene" ? (
                                    <PenLine className="w-3 h-3 text-purple-400 flex-shrink-0" />
                                  ) : proposal.type === "add_scene" ? (
                                    <Film className="w-3 h-3 text-purple-400 flex-shrink-0" />
                                  ) : proposal.type === "entity" || proposal.type === "add_entity" || proposal.type === "update_entity" ? (
                                    proposal.entity?.type === "scene" ? (
                                      <Film className="w-3 h-3 text-purple-400 flex-shrink-0" />
                                    ) : (
                                      <Plus className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                    )
                                  ) : (
                                    <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                                  )}
                                  <span className="text-gray-200 truncate">
                                    {proposal.type === "add_scene" || proposal.type === "update_scene"
                                      ? proposal.scene?.title
                                      : proposal.entity?.name || `${proposal.relationship?.sourceName} → ${proposal.relationship?.targetName}`}
                                  </span>
                                  <span className="text-gray-500 text-[10px] flex-shrink-0">
                                    ({proposal.type === "add_scene" || proposal.type === "update_scene"
                                      ? "scene"
                                      : proposal.entity?.type || proposal.relationship?.type})
                                  </span>
                                </div>
                                {proposal.status !== "pending" && (
                                  <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded",
                                    proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                                    proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                                  )}>
                                    {proposal.status}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          {/* Accept All / Ignore All buttons */}
                          {msg.proposals.some(p => p.status === "pending") && (
                            <div className="px-2 py-1.5 border-t border-amber-500/20 flex justify-end gap-2">
                              <button
                                onClick={() => handleAcceptAllProposals(msg.id)}
                                className="px-2 py-1 text-[10px] rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors"
                              >
                                Accept All
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tool Usage Accordion */}
                      {msg.toolUsage && msg.toolUsage.totalCalls > 0 && (
                        <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
                          <button
                            onClick={() => {
                              setExpandedToolUsage(prev => {
                                const next = new Set(prev);
                                if (next.has(msg.id)) {
                                  next.delete(msg.id);
                                } else {
                                  next.add(msg.id);
                                }
                                return next;
                              });
                            }}
                            className="w-full px-3 py-2 flex items-center gap-2 text-left text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
                          >
                            {expandedToolUsage.has(msg.id) ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            <Wrench className="w-3 h-3" />
                            <span>{msg.toolUsage.totalCalls} tool call{msg.toolUsage.totalCalls !== 1 ? 's' : ''}</span>
                          </button>

                          {expandedToolUsage.has(msg.id) && (
                            <div className="border-t border-blue-500/20 px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
                              {msg.toolUsage.steps.map((step, stepIdx) => (
                                <div key={stepIdx} className="text-xs">
                                  {step.type === 'tool_call' && (
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 text-blue-300">
                                        <span className="font-mono bg-blue-500/20 px-1.5 py-0.5 rounded">
                                          {step.tool}
                                        </span>
                                        <span className="text-blue-500/60">→</span>
                                      </div>
                                      {step.args && Object.keys(step.args).length > 0 && (
                                        <pre className="text-[10px] text-gray-400 bg-black/30 rounded px-2 py-1 overflow-x-auto">
                                          {JSON.stringify(step.args, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  )}
                                  {step.type === 'tool_result' && (
                                    <div className="pl-4 border-l-2 border-green-500/30">
                                      {step.error ? (
                                        <div className="text-red-400">
                                          <span className="font-medium">Error:</span> {step.error}
                                        </div>
                                      ) : (
                                        <pre className="text-[10px] text-green-400/80 bg-black/30 rounded px-2 py-1 overflow-x-auto max-h-24">
                                          {typeof step.result === 'string'
                                            ? step.result.slice(0, 500) + (step.result.length > 500 ? '...' : '')
                                            : JSON.stringify(step.result, null, 2).slice(0, 500)}
                                        </pre>
                                      )}
                                    </div>
                                  )}
                                  {step.type === 'text' && step.text && (
                                    <div className="text-gray-400 italic pl-4">
                                      {step.text.slice(0, 200)}{step.text.length > 200 ? '...' : ''}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-400 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Weaving...
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          <div className="p-3 flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell me about your world..."
              rows={1}
              className="flex-1 bg-white/5 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="px-4 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
        </>
      )}

      {/* ===================== PROSE MODE ===================== */}
      {proseMode && (
        <div className="absolute inset-0 top-12 flex">
          {/* Left Sidebar - Vertical Card Carousel */}
          <div className="w-72 border-r border-white/10 bg-slate-950/90 backdrop-blur-xl flex flex-col overflow-hidden">
            {/* Scenes/Entities Toggle */}
            <div className="p-3 border-b border-white/10 flex gap-2">
              <button
                onClick={() => { setActiveRow("scenes"); setCurrentIndex(0); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all",
                  activeRow === "scenes" ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
              >
                <Film className="w-4 h-4" />
                Scenes
              </button>
              <button
                onClick={() => { setActiveRow("entities"); setCurrentIndex(0); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all",
                  activeRow === "entities" ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
              >
                <Users className="w-4 h-4" />
                Entities
              </button>
            </div>

            {/* Vertical Carousel Cards */}
            <div
              className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
              onWheel={(e) => {
                e.preventDefault();
                // Accumulate scroll for smoother single-item scrolling
                const newAccum = proseScrollAccum + e.deltaY * 0.5;
                if (Math.abs(newAccum) >= 30) {
                  const delta = newAccum > 0 ? 1 : -1;
                  setCurrentIndex(prev => Math.max(0, Math.min(currentItems.length - 1, prev + delta)));
                  setProseScrollAccum(0);
                } else {
                  setProseScrollAccum(newAccum);
                }
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center py-8">
                {currentItems.map((item, index) => {
                  const offset = index - currentIndex;
                  // Only show items within range
                  if (Math.abs(offset) > 3) return null;

                  const isEntity = activeRow === "entities";
                  const entity = isEntity ? (item as Entity) : null;
                  const scene = !isEntity ? (item as Scene) : null;
                  const isSelected = index === currentIndex;
                  const config = entity ? (entityTypeConfig[entity.type] || entityTypeConfig.character) : null;

                  // Vertical carousel positioning
                  const absOffset = Math.abs(offset);
                  const yOffset = offset * 140; // Spacing between cards
                  const scale = isSelected ? 1 : Math.max(0.75, 0.9 - absOffset * 0.08);
                  const opacity = isSelected ? 1 : Math.max(0.4, 0.8 - absOffset * 0.2);
                  const zIndex = isSelected ? 20 : 10 - absOffset;

                  return (
                    <motion.button
                      key={item.id}
                      onClick={() => setCurrentIndex(index)}
                      animate={{
                        y: yOffset,
                        scale,
                        opacity,
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute w-56"
                      style={{ zIndex }}
                    >
                      <div className={cn(
                        "relative rounded-xl overflow-hidden border-2 transition-all",
                        isSelected
                          ? "border-amber-400 shadow-xl shadow-amber-500/30"
                          : "border-white/10 hover:border-white/30"
                      )}>
                        {/* Card Image */}
                        <div className="aspect-[4/3] relative">
                          {entity?.referenceImage || scene?.imageUrl ? (
                            <img
                              src={entity?.referenceImage || scene?.imageUrl}
                              alt={entity?.name || scene?.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className={cn(
                              "w-full h-full flex items-center justify-center",
                              config?.bgColor || "bg-slate-800"
                            )}>
                              {config ? (
                                <config.icon className={cn("w-12 h-12", config.color)} />
                              ) : (
                                <Film className="w-12 h-12 text-amber-400" />
                              )}
                            </div>
                          )}
                          {/* Gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                          {/* Type icon badge */}
                          <div className="absolute top-2 right-2">
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center",
                              config?.bgColor || "bg-amber-500/20"
                            )}>
                              {config ? (
                                <config.icon className={cn("w-4 h-4", config.color)} />
                              ) : (
                                <Film className="w-4 h-4 text-amber-400" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Info */}
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            {config && <config.icon className={cn("w-3 h-3", config.color)} />}
                            <span className={cn("text-[10px] uppercase tracking-wider", config?.color || "text-amber-400")}>
                              {entity?.type || "Scene"}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-white truncate">
                            {entity?.name || scene?.title}
                          </h3>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Scroll hint gradients */}
              <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-slate-950 to-transparent pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
            </div>

            {/* Navigation arrows */}
            <div className="p-3 border-t border-white/10 flex justify-center gap-4">
              <button
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                className="p-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <span className="py-2 px-3 text-sm text-gray-500">
                {currentIndex + 1} / {currentItems.length}
              </span>
              <button
                onClick={() => setCurrentIndex(Math.min(currentItems.length - 1, currentIndex + 1))}
                disabled={currentIndex === currentItems.length - 1}
                className="p-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {/* Current Entity/Scene Header - Expanded with details */}
            {currentItems[currentIndex] && (
              <div className="border-b border-white/10 bg-slate-900/50">
                {activeRow === "entities" ? (
                  <>
                    {(() => {
                      const entity = currentItems[currentIndex] as Entity;
                      const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
                      const entityRels = relationships.filter(r => r.sourceId === entity.id || r.targetId === entity.id);
                      const relatedEntityIds = entityRels.map(r => r.sourceId === entity.id ? r.targetId : r.sourceId);
                      const relatedEntities = entities.filter(e => relatedEntityIds.includes(e.id)).slice(0, 5);

                      return (
                        <div className="px-6 py-4">
                          <div className="flex items-start gap-4">
                            {/* Image */}
                            <div className={cn(
                              "w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0",
                              config.bgColor
                            )}>
                              {entity.referenceImage ? (
                                <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                              ) : (
                                <config.icon className={cn("w-8 h-8", config.color)} />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn("text-xs uppercase tracking-wider", config.color)}>{entity.type}</span>
                                {entity.status === "canon" && (
                                  <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Canon</span>
                                )}
                              </div>
                              <h2 className="text-xl font-semibold text-white mb-1">{entity.name}</h2>
                              {entity.description && (
                                <p className="text-sm text-gray-400 line-clamp-2">{entity.description}</p>
                              )}
                              {entity.traits && entity.traits.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {entity.traits.slice(0, 4).map((trait, i) => (
                                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">
                                      {trait}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Related entities bubbles */}
                            {relatedEntities.length > 0 && (
                              <div className="flex -space-x-2 flex-shrink-0">
                                {relatedEntities.map((rel) => {
                                  const relConfig = entityTypeConfig[rel.type] || entityTypeConfig.character;
                                  return (
                                    <button
                                      key={rel.id}
                                      onClick={() => {
                                        const idx = entities.findIndex(e => e.id === rel.id);
                                        if (idx >= 0) {
                                          setActiveRow("entities");
                                          setCurrentIndex(idx);
                                        }
                                      }}
                                      className={cn(
                                        "w-10 h-10 rounded-full overflow-hidden ring-2 ring-slate-900 hover:ring-amber-400 transition-all",
                                        relConfig.ringColor
                                      )}
                                      title={rel.name}
                                    >
                                      {rel.referenceImage ? (
                                        <img src={rel.referenceImage} alt={rel.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className={cn("w-full h-full flex items-center justify-center", relConfig.bgColor)}>
                                          <relConfig.icon className={cn("w-4 h-4", relConfig.color)} />
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Actions */}
                            <button
                              onClick={() => handleEntityClick(entity)}
                              className="px-3 py-1.5 rounded-lg bg-white/5 text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2 flex-shrink-0"
                            >
                              <Eye className="w-4 h-4" />
                              Details
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {(() => {
                      const scene = currentItems[currentIndex] as Scene;
                      const participants = entities.filter(e => scene.participantIds?.includes(e.id));
                      const location = entities.find(e => e.id === scene.locationId);

                      return (
                        <div className="px-6 py-4">
                          <div className="flex items-start gap-4">
                            {/* Image */}
                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                              {scene.imageUrl ? (
                                <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                              ) : (
                                <Film className="w-8 h-8 text-amber-400" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs text-amber-400 uppercase tracking-wider">Scene</span>
                                {scene.status === "canon" && (
                                  <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Canon</span>
                                )}
                                {location && (
                                  <span className="text-xs text-purple-400 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {location.name}
                                  </span>
                                )}
                              </div>
                              <h2 className="text-xl font-semibold text-white mb-1">{scene.title}</h2>
                              {scene.prose && (
                                <p className="text-sm text-gray-400 line-clamp-2">{scene.prose}</p>
                              )}
                            </div>

                            {/* Participant bubbles */}
                            {participants.length > 0 && (
                              <div className="flex -space-x-2 flex-shrink-0">
                                {participants.slice(0, 5).map((participant) => {
                                  const pConfig = entityTypeConfig[participant.type] || entityTypeConfig.character;
                                  return (
                                    <button
                                      key={participant.id}
                                      onClick={() => {
                                        const idx = entities.findIndex(e => e.id === participant.id);
                                        if (idx >= 0) {
                                          setActiveRow("entities");
                                          setCurrentIndex(idx);
                                        }
                                      }}
                                      className={cn(
                                        "w-10 h-10 rounded-full overflow-hidden ring-2 ring-slate-900 hover:ring-amber-400 transition-all",
                                        pConfig.ringColor
                                      )}
                                      title={participant.name}
                                    >
                                      {participant.referenceImage ? (
                                        <img src={participant.referenceImage} alt={participant.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className={cn("w-full h-full flex items-center justify-center", pConfig.bgColor)}>
                                          <pConfig.icon className={cn("w-4 h-4", pConfig.color)} />
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Actions */}
                            <button
                              onClick={() => handleSceneClick(scene)}
                              className="px-3 py-1.5 rounded-lg bg-white/5 text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2 flex-shrink-0"
                            >
                              <Eye className="w-4 h-4" />
                              Details
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}


            {/* Messages Area */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <PenLine className="w-12 h-12 text-amber-400/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-300 mb-2">Prose Mode</h3>
                    <p className="text-sm text-gray-500">
                      A focused writing experience. Chat with the narrative engine about your world,
                      develop characters, and craft your story.
                    </p>
                  </div>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[70%] rounded-2xl px-5 py-3",
                    msg.role === "user"
                      ? "bg-amber-500/20 text-gray-100"
                      : "bg-white/5 text-gray-300"
                  )}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>

                  {/* Tool Usage Accordion in Prose Mode */}
                  {msg.toolUsage && msg.toolUsage.totalCalls > 0 && (
                    <div className="max-w-[70%] mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
                      <button
                        onClick={() => {
                          setExpandedToolUsage(prev => {
                            const next = new Set(prev);
                            if (next.has(msg.id)) {
                              next.delete(msg.id);
                            } else {
                              next.add(msg.id);
                            }
                            return next;
                          });
                        }}
                        className="w-full px-3 py-2 flex items-center gap-2 text-left text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
                      >
                        {expandedToolUsage.has(msg.id) ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        <Wrench className="w-3 h-3" />
                        <span>{msg.toolUsage.totalCalls} tool call{msg.toolUsage.totalCalls !== 1 ? 's' : ''}</span>
                      </button>
                      {expandedToolUsage.has(msg.id) && (
                        <div className="border-t border-blue-500/20 px-3 py-2 space-y-2 max-h-48 overflow-y-auto">
                          {msg.toolUsage.steps.map((step, stepIdx) => (
                            <div key={stepIdx} className="text-xs">
                              {step.type === 'tool_call' && (
                                <div className="flex items-center gap-2 text-blue-300">
                                  <span className="font-mono bg-blue-500/20 px-1.5 py-0.5 rounded">{step.tool}</span>
                                </div>
                              )}
                              {step.type === 'tool_result' && !step.error && (
                                <div className="pl-4 text-green-400/60 truncate">✓ Result received</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Proposals in Prose Mode */}
                  {msg.proposals && msg.proposals.length > 0 && (
                    <div className="max-w-[70%] mt-2 border border-amber-500/30 rounded-lg bg-amber-500/5 overflow-hidden">
                      <button
                        className="w-full px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400 font-medium flex items-center justify-between hover:bg-amber-500/20 transition-colors"
                        onClick={() => {
                          setReviewingProposals([...msg.proposals!]);
                          setReviewingMessageId(msg.id);
                          setReviewIndex(0);
                          setPreviewPortrait(null);
                          setRefineFeedback("");
                        }}
                      >
                        <span className="flex items-center gap-1.5">
                          <Eye className="w-3 h-3" />
                          New Elements ({msg.proposals.length})
                        </span>
                        <span className="text-amber-400/60 text-[10px]">Click to review</span>
                      </button>
                      <div className="p-2 space-y-1">
                        {msg.proposals.map((proposal) => (
                          <div
                            key={proposal.id}
                            className={cn(
                              "flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs cursor-pointer",
                              proposal.status === "accepted" && "bg-green-500/10",
                              proposal.status === "rejected" && "bg-red-500/10 opacity-50",
                              proposal.status === "pending" && "bg-white/5 hover:bg-white/10"
                            )}
                            onClick={() => {
                              const idx = msg.proposals!.findIndex(p => p.id === proposal.id);
                              setReviewingProposals([...msg.proposals!]);
                              setReviewingMessageId(msg.id);
                              setReviewIndex(idx >= 0 ? idx : 0);
                              setPreviewPortrait(null);
                              setRefineFeedback("");
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {proposal.type === "update_scene" ? (
                                <PenLine className="w-3 h-3 text-purple-400 flex-shrink-0" />
                              ) : proposal.type === "add_scene" ? (
                                <Film className="w-3 h-3 text-purple-400 flex-shrink-0" />
                              ) : proposal.type === "entity" || proposal.type === "add_entity" || proposal.type === "update_entity" ? (
                                <Plus className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              ) : (
                                <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                              )}
                              <span className="text-gray-200 truncate">
                                {proposal.type === "add_scene" || proposal.type === "update_scene"
                                  ? proposal.scene?.title
                                  : proposal.entity?.name || `${proposal.relationship?.sourceName} → ${proposal.relationship?.targetName}`}
                              </span>
                            </div>
                            {proposal.status !== "pending" && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded",
                                proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                                proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                              )}>
                                {proposal.status}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 rounded-2xl px-5 py-3 text-sm text-gray-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Weaving...
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-3 max-w-4xl mx-auto">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tell me about your world..."
                  rows={2}
                  className="flex-1 bg-white/5 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                  className="px-6 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-all self-end"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* World Drawer */}
      <AnimatePresence>
        {isWorldDrawerOpen && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="absolute right-0 top-12 bottom-0 w-80 border-l border-white/10 bg-slate-900/95 backdrop-blur-xl z-40 overflow-hidden"
          >
            <WorldDrawer
              entities={entities}
              scenes={scenes}
              onEntityClick={handleEntityClick}
              onSceneClick={handleSceneClick}
              onClose={() => setIsWorldDrawerOpen(false)}
            />
          </motion.div>
        )}

        {/* Settings Panel */}
        {isSettingsOpen && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="absolute right-0 top-12 bottom-0 w-96 border-l border-white/10 bg-slate-900/95 backdrop-blur-xl z-40 overflow-hidden"
          >
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-400" />
                  Studio Settings
                </h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Writing Style Prompt */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Writing Style Prompt
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Instructions to guide the AI's writing style when generating narrative content, entity descriptions, and scene prose.
                  </p>
                  <textarea
                    value={settings.writingStylePrompt}
                    onChange={(e) => updateSettings({ writingStylePrompt: e.target.value })}
                    placeholder="Example: Write in a dark, atmospheric tone inspired by classic noir fiction. Use evocative sensory details and maintain an air of mystery..."
                    className="w-full h-32 px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 placeholder:text-gray-600 text-sm resize-none focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                {/* Visual Style Prompt */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Visual Style Prompt
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Instructions to guide the AI's visual style when generating images for entities and scenes.
                  </p>
                  <textarea
                    value={settings.visualStylePrompt}
                    onChange={(e) => updateSettings({ visualStylePrompt: e.target.value })}
                    placeholder="Example: Detailed digital painting, cinematic lighting, dramatic shadows, muted color palette with occasional vibrant accents, film grain texture..."
                    className="w-full h-32 px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 placeholder:text-gray-600 text-sm resize-none focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                {/* Status/Info */}
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-500">
                    Settings are saved automatically and persist between sessions.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entity Detail Overlay - Wide with side relationships */}
      <AnimatePresence>
        {selectedEntity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setSelectedEntity(null)} />
            <EntityDetailView
              detail={selectedEntity}
              allEntities={entities}
              onClose={() => setSelectedEntity(null)}
              onEntityClick={handleRelatedEntityClick}
              onSceneClick={handleSceneBubbleClick}
              onFocusInChat={handleFocusInChat}
              onGeneratePortrait={handleGenerateEntityPortrait}
              isGeneratingPortrait={isGeneratingPortrait}
              onGenerateVariations={handleGeneratePortraitVariations}
              isGeneratingVariations={isGeneratingVariations}
              portraitVariations={portraitVariations?.entityId === selectedEntity.entity.id ? portraitVariations.images : undefined}
              onSelectVariation={handleSelectPortraitVariation}
              onClearVariations={handleClearPortraitVariations}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scene Detail Overlay */}
      <AnimatePresence>
        {selectedScene && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setSelectedScene(null)} />
            <SceneDetailView
              scene={selectedScene}
              entities={entities}
              onClose={() => setSelectedScene(null)}
              onEntityClick={(e) => { setSelectedScene(null); handleEntityClick(e); }}
              onSceneUpdate={handleSceneUpdate}
              onDiscuss={handleSceneDiscuss}
              onGenerateImage={handleGenerateImage}
              isGeneratingImage={isGeneratingImage}
              onGenerateFrames={handleGenerateFrames}
              onGenerateFrameImage={handleGenerateFrameImage}
              isGeneratingFrames={isGeneratingFrames}
              generatingFrameId={generatingFrameId}
              onPreviousScene={getSceneIndex(selectedScene.id) > 0 ? handlePreviousScene : undefined}
              onNextScene={getSceneIndex(selectedScene.id) < scenes.length - 1 ? handleNextScene : undefined}
              sceneIndex={getSceneIndex(selectedScene.id)}
              totalScenes={scenes.length}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Proposal Review Modal */}
      <AnimatePresence>
        {reviewingProposals && reviewingProposals.length > 0 && (() => {
          const proposal = reviewingProposals[reviewIndex];
          if (!proposal) return null;
          const isEntity = proposal.entity && proposal.type !== "add_scene" && proposal.type !== "update_scene";
          const isRelationship = proposal.relationship && (proposal.type === "add_relationship" || proposal.type === "relationship");
          const isScene = proposal.type === "add_scene" || proposal.type === "update_scene" || proposal.scene;
          const typeConfig = isEntity && proposal.entity?.type
            ? entityTypeConfig[proposal.entity.type] || entityTypeConfig.character
            : null;
          const TypeIcon = typeConfig?.icon || Sparkles;
          const pendingCount = reviewingProposals.filter(p => p.status === "pending").length;
          const decidedCount = reviewingProposals.filter(p => p.status !== "pending").length;

          return (
            <motion.div
              key="review-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-black/70" onClick={() => {
                // Sync proposals back to messages
                if (reviewingMessageId) {
                  setMessages(prev => prev.map(msg => {
                    if (msg.id !== reviewingMessageId) return msg;
                    return { ...msg, proposals: reviewingProposals };
                  }));
                }
                setReviewingProposals(null);
                setReviewingMessageId(null);
                setPreviewPortrait(null);
                setRefineFeedback("");
              }} />
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="relative bg-slate-900 rounded-2xl border border-amber-500/30 w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-800/80 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">Review Proposals</span>
                    <span className="text-xs text-gray-400">
                      {reviewIndex + 1} of {reviewingProposals.length}
                    </span>
                    {decidedCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                        {decidedCount} decided
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (reviewingMessageId) {
                        setMessages(prev => prev.map(msg => {
                          if (msg.id !== reviewingMessageId) return msg;
                          return { ...msg, proposals: reviewingProposals };
                        }));
                      }
                      setReviewingProposals(null);
                      setReviewingMessageId(null);
                      setPreviewPortrait(null);
                      setRefineFeedback("");
                    }}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress dots */}
                <div className="flex items-center gap-1 px-5 py-2 bg-slate-800/40">
                  {reviewingProposals.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => { setReviewIndex(i); setPreviewPortrait(null); setRefineFeedback(""); }}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        i === reviewIndex && "w-4 bg-amber-400",
                        i !== reviewIndex && p.status === "accepted" && "bg-green-500",
                        i !== reviewIndex && p.status === "rejected" && "bg-red-500",
                        i !== reviewIndex && p.status === "pending" && "bg-white/20 hover:bg-white/40",
                      )}
                    />
                  ))}
                </div>

                {/* Content */}
                <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
                  {/* Entity content */}
                  {isEntity && proposal.entity && (
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        {/* Portrait or type icon */}
                        <div className={cn(
                          "w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 ring-2",
                          typeConfig?.ringColor || "ring-amber-500/50"
                        )}>
                          {previewPortrait ? (
                            <img src={previewPortrait} alt={proposal.entity.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className={cn("w-full h-full flex items-center justify-center", typeConfig?.bgColor || "bg-amber-500/20")}>
                              <TypeIcon className={cn("w-8 h-8", typeConfig?.color || "text-amber-400")} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-medium text-white truncate">{proposal.entity.name}</h3>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide",
                              typeConfig?.bgColor || "bg-amber-500/20",
                              typeConfig?.color || "text-amber-400"
                            )}>
                              {proposal.entity.type}
                            </span>
                            {proposal.status !== "pending" && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded",
                                proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                                proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                              )}>
                                {proposal.status}
                              </span>
                            )}
                          </div>
                          {proposal.entity.description && (
                            <p className="text-sm text-gray-300 leading-relaxed">{proposal.entity.description}</p>
                          )}
                        </div>
                      </div>

                      {/* Generate portrait button */}
                      {(proposal.entity.type === "character" || proposal.entity.type === "creature") && (
                        <button
                          onClick={async () => {
                            setIsGeneratingPreviewPortrait(true);
                            try {
                              const res = await fetch(`${API_BASE}/api/narrative/visual/entity/preview`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ entityData: proposal.entity, aspectRatio: "1:1" }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setPreviewPortrait(data.imageDataUrl || data.imageUrl);
                              }
                            } catch (e) {
                              console.error("Failed to generate preview portrait:", e);
                            } finally {
                              setIsGeneratingPreviewPortrait(false);
                            }
                          }}
                          disabled={isGeneratingPreviewPortrait}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-xs hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                        >
                          {isGeneratingPreviewPortrait ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Generating portrait...</>
                          ) : (
                            <><ImageIcon className="w-3 h-3" /> {previewPortrait ? "Regenerate Portrait" : "Generate Portrait"}</>
                          )}
                        </button>
                      )}

                      {/* Traits */}
                      {proposal.entity.traits && proposal.entity.traits.length > 0 && (
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Traits</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {proposal.entity.traits.map((trait, i) => (
                              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                                {trait}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Backstory */}
                      {proposal.entity.backstory && (
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Backstory</span>
                          <p className="text-sm text-gray-400 mt-1 leading-relaxed">{proposal.entity.backstory}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Relationship content */}
                  {isRelationship && proposal.relationship && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                          <Users className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-white font-medium">{proposal.relationship.sourceName}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                          <Users className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-white font-medium">{proposal.relationship.targetName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-wide">
                          {proposal.relationship.type}
                        </span>
                        {proposal.status !== "pending" && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded",
                            proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                            proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                          )}>
                            {proposal.status}
                          </span>
                        )}
                      </div>
                      {proposal.relationship.description && (
                        <p className="text-sm text-gray-300 leading-relaxed">{proposal.relationship.description}</p>
                      )}
                    </div>
                  )}

                  {/* Scene content */}
                  {isScene && proposal.scene && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        {proposal.type === "update_scene" ? (
                          <PenLine className="w-5 h-5 text-purple-400" />
                        ) : (
                          <Film className="w-5 h-5 text-purple-400" />
                        )}
                        <h3 className="text-lg font-medium text-white">{proposal.scene.title}</h3>
                        {proposal.status !== "pending" && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded",
                            proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                            proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                          )}>
                            {proposal.status}
                          </span>
                        )}
                      </div>
                      {proposal.scene.summary && (
                        <p className="text-sm text-gray-300 leading-relaxed">{proposal.scene.summary}</p>
                      )}
                      {proposal.scene.prose && (
                        <div className="bg-white/5 rounded-lg p-3 max-h-48 overflow-y-auto">
                          <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{proposal.scene.prose}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Refinement input */}
                  {proposal.status === "pending" && isEntity && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={refineFeedback}
                          onChange={(e) => setRefineFeedback(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && refineFeedback.trim() && !isRefining) {
                              e.preventDefault();
                              // Trigger refinement
                              (async () => {
                                setIsRefining(true);
                                try {
                                  const res = await fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/refine`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ feedback: refineFeedback }),
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    // Update the proposal in our local array
                                    const updated = [...reviewingProposals];
                                    updated[reviewIndex] = { ...updated[reviewIndex], ...data.refined };
                                    if (data.refined.entity) updated[reviewIndex].entity = data.refined.entity;
                                    if (data.refined.relationship) updated[reviewIndex].relationship = data.refined.relationship;
                                    if (data.refined.scene) updated[reviewIndex].scene = data.refined.scene;
                                    setReviewingProposals(updated);
                                    setRefineFeedback("");
                                    setPreviewPortrait(null); // Clear portrait since entity changed
                                  }
                                } catch (e) {
                                  console.error("Failed to refine proposal:", e);
                                } finally {
                                  setIsRefining(false);
                                }
                              })();
                            }
                          }}
                          placeholder="Ask AI to refine this... (e.g. 'Make them older and more mysterious')"
                          className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          disabled={isRefining}
                        />
                        <button
                          onClick={async () => {
                            if (!refineFeedback.trim() || isRefining) return;
                            setIsRefining(true);
                            try {
                              const res = await fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/refine`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ feedback: refineFeedback }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                const updated = [...reviewingProposals];
                                updated[reviewIndex] = { ...updated[reviewIndex], ...data.refined };
                                if (data.refined.entity) updated[reviewIndex].entity = data.refined.entity;
                                if (data.refined.relationship) updated[reviewIndex].relationship = data.refined.relationship;
                                if (data.refined.scene) updated[reviewIndex].scene = data.refined.scene;
                                setReviewingProposals(updated);
                                setRefineFeedback("");
                                setPreviewPortrait(null);
                              }
                            } catch (e) {
                              console.error("Failed to refine proposal:", e);
                            } finally {
                              setIsRefining(false);
                            }
                          }}
                          disabled={!refineFeedback.trim() || isRefining}
                          className="px-3 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-xs hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                        >
                          {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer with navigation and actions */}
                <div className="px-5 py-3 bg-slate-800/80 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setReviewIndex(Math.max(0, reviewIndex - 1)); setPreviewPortrait(null); setRefineFeedback(""); }}
                      disabled={reviewIndex === 0}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setReviewIndex(Math.min(reviewingProposals.length - 1, reviewIndex + 1)); setPreviewPortrait(null); setRefineFeedback(""); }}
                      disabled={reviewIndex === reviewingProposals.length - 1}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {proposal.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          if (!reviewingMessageId) return;
                          await handleRejectProposal(reviewingMessageId, proposal);
                          // Update local state
                          const updated = [...reviewingProposals];
                          updated[reviewIndex] = { ...updated[reviewIndex], status: "rejected" };
                          setReviewingProposals(updated);
                          // Auto-advance to next pending
                          const nextPending = updated.findIndex((p, i) => i > reviewIndex && p.status === "pending");
                          if (nextPending >= 0) {
                            setReviewIndex(nextPending);
                            setPreviewPortrait(null);
                            setRefineFeedback("");
                          } else if (updated.every(p => p.status !== "pending")) {
                            // All decided, sync and close
                            setMessages(prev => prev.map(msg => {
                              if (msg.id !== reviewingMessageId) return msg;
                              return { ...msg, proposals: updated };
                            }));
                            setReviewingProposals(null);
                            setReviewingMessageId(null);
                            setPreviewPortrait(null);
                            setRefineFeedback("");
                          }
                        }}
                        className="px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={async () => {
                          if (!reviewingMessageId) return;
                          await handleAcceptProposal(reviewingMessageId, proposal);
                          // Update local state
                          const updated = [...reviewingProposals];
                          updated[reviewIndex] = { ...updated[reviewIndex], status: "accepted" };
                          setReviewingProposals(updated);
                          // Auto-advance to next pending
                          const nextPending = updated.findIndex((p, i) => i > reviewIndex && p.status === "pending");
                          if (nextPending >= 0) {
                            setReviewIndex(nextPending);
                            setPreviewPortrait(null);
                            setRefineFeedback("");
                          } else if (updated.every(p => p.status !== "pending")) {
                            // All decided, sync and close
                            setMessages(prev => prev.map(msg => {
                              if (msg.id !== reviewingMessageId) return msg;
                              return { ...msg, proposals: updated };
                            }));
                            setReviewingProposals(null);
                            setReviewingMessageId(null);
                            setPreviewPortrait(null);
                            setRefineFeedback("");
                          }
                        }}
                        className="px-4 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors"
                      >
                        Accept
                      </button>
                    </div>
                  ) : (
                    <span className={cn(
                      "text-xs px-3 py-1.5 rounded-lg",
                      proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                      proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                    )}>
                      {proposal.status === "accepted" ? "Accepted" : "Rejected"}
                    </span>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* LLM Confirmation Dialog */}
      <AnimatePresence>
        {pendingConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setPendingConfirm(null)} />
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="relative bg-slate-900 rounded-2xl border border-amber-500/30 max-w-md w-full mx-4 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <span className="font-medium text-gray-200">Director asks:</span>
              </div>
              <p className="text-gray-300 mb-6">{pendingConfirm.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingConfirm(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10"
                >
                  No, not yet
                </button>
                <button
                  onClick={() => {
                    // Could trigger the action here
                    setInput(`Yes, ${pendingConfirm.action}`);
                    setPendingConfirm(null);
                    inputRef.current?.focus();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                >
                  Yes, do it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// STORYBOARD STRIP - Horizontal timeline of scenes
// =============================================================================

function StoryboardStrip({
  scenes,
  selectedSceneId,
  onSceneClick,
  onAddScene,
  onInsertScene,
}: {
  scenes: Scene[];
  selectedSceneId?: string;
  onSceneClick: (scene: Scene) => void;
  onAddScene: () => void;
  onInsertScene?: (position: number, beforeScene: Scene, afterScene: Scene | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (scenes.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4">
        <span className="text-xs text-gray-500">No scenes yet.</span>
        <button
          onClick={onAddScene}
          className="flex items-center gap-1 px-2 py-1 text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          Create first scene
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent transform -translate-y-1/2" />

      <div
        ref={containerRef}
        className="flex items-center gap-3 px-4 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {scenes.map((scene, index) => (
          <div key={scene.id} className="flex items-center gap-0 flex-shrink-0">
            {/* Insert button BEFORE this scene (only show for first scene) */}
            {index === 0 && onInsertScene && (
              <motion.button
                initial={{ opacity: 0, width: 0 }}
                whileHover={{ opacity: 1, width: 24 }}
                className="h-16 flex items-center justify-center text-amber-400/50 hover:text-amber-400 transition-colors overflow-hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertScene(0, scene, null);
                }}
                title="Insert scene before"
              >
                <Plus className="w-4 h-4" />
              </motion.button>
            )}

            <motion.button
              onClick={() => onSceneClick(scene)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all group",
                selectedSceneId === scene.id
                  ? "border-amber-400 shadow-lg shadow-amber-500/20"
                  : "border-white/10 hover:border-amber-400/50"
              )}
            >
              {/* Scene thumbnail or placeholder */}
              {scene.imageUrl ? (
                <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                  <Film className="w-5 h-5 text-amber-500/30" />
                </div>
              )}

              {/* Overlay with scene number */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                <span className="text-[10px] font-medium text-white/80 truncate px-1">
                  {index + 1}. {scene.title?.slice(0, 12) || "Scene"}
                </span>
                {scene.status === "draft" ? (
                  <span className="text-[8px] px-1 rounded bg-amber-500/30 text-amber-300">Draft</span>
                ) : (
                  <span className="text-[8px] px-1 rounded bg-green-500/30 text-green-300">✓</span>
                )}
              </div>

              {/* Hover details */}
              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                <span className="text-[10px] text-white text-center line-clamp-2">{scene.title}</span>
              </div>
            </motion.button>

            {/* Insert button AFTER this scene */}
            {onInsertScene && (
              <motion.button
                initial={{ opacity: 0, width: 0 }}
                whileHover={{ opacity: 1, width: 24 }}
                className="h-16 flex items-center justify-center text-amber-400/50 hover:text-amber-400 transition-colors overflow-hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertScene(index + 1, scene, scenes[index + 1] || null);
                }}
                title="Insert scene after"
              >
                <Plus className="w-4 h-4" />
              </motion.button>
            )}
          </div>
        ))}

        {/* Add new scene button */}
        <motion.button
          onClick={onAddScene}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-white/20 hover:border-amber-400/50 flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-amber-400 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px]">Add</span>
        </motion.button>
      </div>
    </div>
  );
}

// =============================================================================
// 3D CAROUSEL
// =============================================================================

function Carousel3D<T extends { id: string }>({
  items,
  currentIndex,
  onIndexChange,
  renderItem,
  compactMode = false,
}: {
  items: T[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  renderItem: (item: T, isActive: boolean) => React.ReactNode;
  compactMode?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollAccumulator, setScrollAccumulator] = useState(0);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Low threshold (20) for easy single-item moves, but slower accumulation (0.5x) to prevent rapid scrolling
      const acc = scrollAccumulator + e.deltaY * 0.5;
      if (Math.abs(acc) >= 20) {
        onIndexChange(Math.max(0, Math.min(items.length - 1, currentIndex + (acc > 0 ? 1 : -1))));
        setScrollAccumulator(0);
      } else {
        setScrollAccumulator(acc);
      }
    };
    const el = containerRef.current;
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }
  }, [currentIndex, items.length, scrollAccumulator, onIndexChange]);

  if (items.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-12 h-12 text-amber-400/30 mx-auto mb-4" />
          <p className="text-gray-500">No items yet</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center">
      {items.map((item, index) => {
        const offset = index - currentIndex;
        if (Math.abs(offset) > 4) return null;
        const isActive = index === currentIndex;

        // Elliptical arc - cards curve back into the distance
        const absOffset = Math.abs(offset);
        const direction = offset > 0 ? 1 : -1;

        // Angle along the ellipse (each card is ~25 degrees apart)
        const angle = absOffset * 0.35; // radians (~20 degrees per step)

        // Ellipse radii - wider than deep for a nice curve (slightly reduced in compact mode)
        const radiusX = compactMode ? 580 : 650; // horizontal radius
        const radiusZ = compactMode ? 360 : 400; // depth radius

        // Add extra offset for immediate neighbors so they peek out more
        const peekBoost = absOffset === 1 ? (compactMode ? 70 : 80) : 0;

        // Position on ellipse arc
        const xPos = direction * (Math.sin(angle) * radiusX + peekBoost);
        const zPos = isActive ? 0 : -(radiusZ - Math.cos(angle) * radiusZ);

        // Rotation follows the tangent of the ellipse
        const rotation = direction * -absOffset * 15;

        // Scale: gradual decrease (slightly reduced in compact mode - mostly rely on translateY)
        const baseScale = compactMode ? 0.85 : 1;
        const itemScale = isActive ? baseScale : Math.max(0.55 * baseScale, (0.78 - absOffset * 0.06) * baseScale);

        // Z-index: center card highest, decreases with distance
        const zIndex = isActive ? 50 : 40 - absOffset * 5;

        // Dark overlay intensity increases with distance
        const overlayOpacity = isActive ? 0 : Math.min(0.75, absOffset * 0.2);

        return (
          <motion.div
            key={item.id}
            animate={{
              rotateY: rotation,
              x: xPos,
              z: zPos,
              scale: itemScale,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={!isActive ? () => onIndexChange(index) : undefined}
            className="absolute cursor-pointer"
            style={{
              transformStyle: "preserve-3d",
              zIndex,
            }}
          >
            <div className="relative">
              {renderItem(item, isActive)}
              {/* Dark overlay for background cards */}
              {!isActive && (
                <div
                  className="absolute inset-0 bg-black rounded-2xl pointer-events-none"
                  style={{ opacity: overlayOpacity }}
                />
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Navigation */}
      {currentIndex > 0 && (
        <button
          onClick={() => onIndexChange(currentIndex - 1)}
          className="absolute left-8 z-30 p-3 rounded-full bg-black/50 text-white/70 hover:bg-black/70"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {currentIndex < items.length - 1 && (
        <button
          onClick={() => onIndexChange(currentIndex + 1)}
          className="absolute right-8 z-30 p-3 rounded-full bg-black/50 text-white/70 hover:bg-black/70"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
        {items.slice(Math.max(0, currentIndex - 4), currentIndex + 5).map((_, i) => {
          const actualIndex = Math.max(0, currentIndex - 4) + i;
          return (
            <button
              key={actualIndex}
              onClick={() => onIndexChange(actualIndex)}
              className={cn(
                "h-2 rounded-full transition-all",
                actualIndex === currentIndex ? "bg-amber-400 w-8" : "bg-white/30 w-2"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// SCENE CARD
// =============================================================================

function SceneCard({
  scene,
  entities,
  isActive,
  onClick,
  compactMode = false,
}: {
  scene: Scene;
  entities: Entity[];
  isActive: boolean;
  onClick: () => void;
  compactMode?: boolean;
}) {
  const participants = entities.filter((e) => scene.participantIds.includes(e.id));

  // Adjust sizes based on compactMode (only slight reduction since we primarily shift up)
  const activeWidth = compactMode ? 610 : 700;
  const activeHeight = compactMode ? 350 : 400;
  const inactiveWidth = compactMode ? 370 : 420;
  const inactiveHeight = compactMode ? 220 : 250;

  return (
    <div className="relative" onClick={isActive ? onClick : undefined}>
      {isActive && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute -inset-6 bg-amber-500/20 rounded-3xl blur-3xl" />
      )}
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden border-2 bg-slate-900 transition-all cursor-pointer",
          isActive ? "border-amber-500/60 shadow-2xl shadow-amber-500/20" : "border-white/10"
        )}
        style={{ width: isActive ? activeWidth : inactiveWidth, height: isActive ? activeHeight : inactiveHeight }}
      >
        {scene.imageUrl ? (
          <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
            <ImageIcon className="w-16 h-16 text-amber-500/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Scene info */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Film className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400/80 uppercase tracking-wider">Scene</span>
            {scene.status === "draft" ? (
              <span className="px-2 py-0.5 rounded bg-amber-500/80 text-xs text-black">Draft</span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-green-500/80 text-xs text-black flex items-center gap-1">
                <Award className="w-3 h-3" />
                Canon
              </span>
            )}
          </div>
          <h3 className={cn("font-bold text-white", isActive ? "text-2xl" : "text-lg")}>{scene.title}</h3>
          {isActive && <p className="text-sm text-gray-400 mt-2 line-clamp-2">{scene.prose}</p>}
        </div>

        {/* Floating participant avatars */}
        {isActive && participants.length > 0 && (
          <div className="absolute top-4 right-4 flex -space-x-3">
            {participants.slice(0, 4).map((entity) => {
              const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
              return (
                <div
                  key={entity.id}
                  className={cn("w-12 h-12 rounded-full overflow-hidden ring-2 ring-slate-900", config.ringColor)}
                >
                  {entity.referenceImage ? (
                    <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                      <config.icon className={cn("w-5 h-5", config.color)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isActive && (
          <div className="absolute top-4 left-4">
            <div className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> View Details
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ENTITY CARD
// =============================================================================

function EntityCard({ entity, isActive, onClick, compactMode = false }: { entity: Entity; isActive: boolean; onClick: () => void; compactMode?: boolean }) {
  const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
  const Icon = config.icon;

  // Adjust sizes based on compactMode (only slight reduction since we primarily shift up)
  const activeWidth = compactMode ? 520 : 600;
  const activeHeight = compactMode ? 330 : 380;
  const inactiveWidth = compactMode ? 320 : 360;
  const inactiveHeight = compactMode ? 210 : 240;

  return (
    <div className="relative" onClick={isActive ? onClick : undefined}>
      {isActive && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("absolute -inset-6 rounded-3xl blur-3xl", config.bgColor)} />
      )}
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden border-2 bg-slate-900 transition-all cursor-pointer",
          isActive ? "border-amber-500/60 shadow-2xl shadow-amber-500/20" : "border-white/10"
        )}
        style={{ width: isActive ? activeWidth : inactiveWidth, height: isActive ? activeHeight : inactiveHeight }}
      >
        {entity.referenceImage ? (
          <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
            <Icon className={cn(isActive ? "w-24 h-24" : "w-14 h-14", config.color)} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={cn("w-4 h-4", config.color)} />
            <span className="text-xs text-gray-400 uppercase tracking-wider">{entity.type}</span>
            {entity.status === "canon" && <span className="text-xs text-emerald-400">Canon</span>}
          </div>
          <h3 className={cn("font-bold text-white", isActive ? "text-2xl" : "text-lg")}>{entity.name}</h3>
          {isActive && entity.description && <p className="text-sm text-gray-400 mt-2 line-clamp-2">{entity.description}</p>}
        </div>

        {isActive && (
          <div className="absolute top-4 right-4">
            <div className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> View Details
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ENTITY DETAIL VIEW - Wide with side relationships + scene bubbles
// =============================================================================

function EntityDetailView({
  detail,
  allEntities,
  onClose,
  onEntityClick,
  onSceneClick,
  onFocusInChat,
  onGeneratePortrait,
  isGeneratingPortrait,
  onGenerateVariations,
  isGeneratingVariations,
  portraitVariations,
  onSelectVariation,
  onClearVariations,
}: {
  detail: EntityDetail;
  allEntities: Entity[];
  onClose: () => void;
  onEntityClick: (id: string) => void;
  onSceneClick: (scene: Scene) => void;
  onFocusInChat: (entity: Entity) => void;
  onGeneratePortrait?: (entity: Entity, customPrompt?: string) => void;
  isGeneratingPortrait?: boolean;
  onGenerateVariations?: (entity: Entity, customPrompt?: string) => void;
  isGeneratingVariations?: boolean;
  portraitVariations?: string[];
  onSelectVariation?: (entity: Entity, imageUrl: string, index: number) => void;
  onClearVariations?: () => void;
}) {
  const { entity, relationships, scenes, relatedEntities, narrativeArc, arcIssues } = detail;
  const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
  const Icon = config.icon;
  const [portraitPrompt, setPortraitPrompt] = useState("");

  useEffect(() => {
    setPortraitPrompt("");
  }, [entity.id]);

  // Split relationships into left (incoming) and right (outgoing)
  const incomingRels = relationships.filter((r) => r.direction === "incoming");
  const outgoingRels = relationships.filter((r) => r.direction === "outgoing");

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      className="relative flex items-center gap-8 max-w-6xl w-full mx-4"
    >
      {/* Left side - Incoming relationships */}
      <div className="flex-shrink-0 w-40 flex flex-col items-center gap-4">
        {incomingRels.slice(0, 3).map((rel) => {
          const relEntity = allEntities.find((e) => e.id === rel.sourceId);
          if (!relEntity) return null;
          const relConfig = entityTypeConfig[relEntity.type] || entityTypeConfig.character;

          return (
            <button
              key={rel.id}
              onClick={() => onEntityClick(rel.sourceId)}
              className="group relative flex flex-col items-center"
            >
              {/* Connector line */}
              <svg className="absolute top-1/2 left-full w-8 h-1" style={{ transform: "translateY(-50%)" }}>
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(251,191,36,0.3)" strokeWidth="2" strokeDasharray="4 4" />
              </svg>
              <div className={cn("w-20 h-20 rounded-full overflow-hidden ring-4 transition-all group-hover:ring-amber-400", relConfig.ringColor)}>
                {relEntity.referenceImage ? (
                  <img src={relEntity.referenceImage} alt={relEntity.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={cn("w-full h-full flex items-center justify-center", relConfig.bgColor)}>
                    <relConfig.icon className={cn("w-8 h-8", relConfig.color)} />
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 mt-2 text-center line-clamp-1">{relEntity.name}</span>
              <span className="text-[10px] text-amber-400/60">{rel.type}</span>
            </button>
          );
        })}
      </div>

      {/* Center - Main entity card */}
      <div className="flex-1 bg-slate-900 rounded-2xl border border-white/20 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header with Image */}
        <div className="h-56 relative flex-shrink-0">
          {entity.referenceImage ? (
            <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
          ) : (
            <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
              <Icon className={cn("w-24 h-24", config.color)} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white/70 hover:bg-black/70">
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-4 left-6 right-6">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn("w-5 h-5", config.color)} />
              <span className="text-sm text-gray-400 uppercase tracking-wider">{entity.type}</span>
              {entity.status === "canon" && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">Canon</span>
              )}
            </div>
            <h2 className="text-3xl font-bold text-white">{entity.name}</h2>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {entity.description && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Description</h3>
              <div className="prose prose-invert max-w-none">
                {entity.description.split(/\n\n|\n/).map((p, i) => (
                  <p key={i} className="text-gray-300 leading-relaxed mb-3 last:mb-0">{p}</p>
                ))}
              </div>
            </div>
          )}

          {entity.backstory && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Backstory</h3>
              <div className="prose prose-invert max-w-none">
                {entity.backstory.split(/\n\n|\n/).map((p, i) => (
                  <p key={i} className="text-gray-400 leading-relaxed text-sm mb-3 last:mb-0">{p}</p>
                ))}
              </div>
            </div>
          )}

          {entity.traits && entity.traits.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Traits</h3>
              <div className="flex flex-wrap gap-2">
                {entity.traits.map((trait, i) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-white/5 text-sm text-gray-300 border border-white/10">
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Portrait Prompt (Optional)</h3>
            <textarea
              value={portraitPrompt}
              onChange={(e) => setPortraitPrompt(e.target.value)}
              placeholder="Add visual notes that influence generation without overriding the entity..."
              className="w-full min-h-[80px] bg-white/5 rounded-xl p-3 text-xs text-gray-300 leading-relaxed resize-none border border-white/10 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          {/* Portrait Variations Selection */}
          {(portraitVariations || isGeneratingVariations) && (
            <div className="border border-purple-500/30 rounded-xl p-4 bg-purple-500/5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-purple-400 uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Select Reference Portrait
                </h3>
                {!isGeneratingVariations && onClearVariations && (
                  <button
                    onClick={onClearVariations}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-slate-800 border-2 border-white/10">
                    {portraitVariations && portraitVariations[idx] ? (
                      <button
                        onClick={() => onSelectVariation?.(entity, portraitVariations[idx], idx)}
                        className="w-full h-full group relative"
                      >
                        <img
                          src={portraitVariations[idx]}
                          alt={`Variation ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-purple-500/0 group-hover:bg-purple-500/30 transition-colors flex items-center justify-center">
                          <span className="text-white text-xs opacity-0 group-hover:opacity-100 font-medium">
                            Use {String.fromCharCode(65 + idx)}
                          </span>
                        </div>
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white">
                          {String.fromCharCode(65 + idx)}
                        </span>
                      </button>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {isGeneratingVariations ? (
                          <Loader className="w-6 h-6 text-purple-400/50 animate-spin" />
                        ) : (
                          <span className="text-gray-600 text-xs">{String.fromCharCode(65 + idx)}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {isGeneratingVariations && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Generating {portraitVariations?.length || 0}/4 variations...
                </p>
              )}
            </div>
          )}

          {/* Connections / Relationships */}
          {relationships.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Connections</h3>
              <div className="space-y-2 bg-white/5 rounded-xl p-3">
                {relationships.map((rel) => {
                  const otherEntityId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
                  const otherEntity = allEntities.find(e => e.id === otherEntityId);
                  const otherName = rel.direction === "outgoing"
                    ? (rel.targetName || otherEntity?.name || "Unknown")
                    : (rel.sourceName || otherEntity?.name || "Unknown");
                  const relConfig = otherEntity ? (entityTypeConfig[otherEntity.type] || entityTypeConfig.character) : entityTypeConfig.character;
                  const RelIcon = relConfig.icon;

                  return (
                    <button
                      key={rel.id}
                      onClick={() => onEntityClick(otherEntityId)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                    >
                      <span className="text-amber-400/70">
                        {rel.direction === "outgoing" ? "→" : "←"}
                      </span>
                      <span className="text-gray-400 text-sm">{rel.type.replace(/_/g, " ")}</span>
                      <div className="flex items-center gap-2 flex-1">
                        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0", relConfig.bgColor)}>
                          <RelIcon className={cn("w-3 h-3", relConfig.color)} />
                        </div>
                        <span className="text-gray-200 group-hover:text-amber-400 transition-colors">{otherName}</span>
                      </div>
                      {rel.description && (
                        <span className="text-xs text-gray-500 truncate max-w-[150px]">{rel.description}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scenes this entity appears in */}
          {scenes.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Appears In ({scenes.length} scenes)</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => onSceneClick(scene)}
                    className="flex-shrink-0 w-40 group"
                  >
                    <div className="w-full h-24 rounded-xl overflow-hidden border-2 border-white/10 group-hover:border-amber-500/50 transition-all">
                      {scene.imageUrl ? (
                        <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                          <Film className="w-8 h-8 text-amber-500/30" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2 line-clamp-1">{scene.title}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {narrativeArc && narrativeArc.entries.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                Narrative Arc ({narrativeArc.entries.length} beats)
              </h3>
              <div className="space-y-2 bg-white/5 rounded-xl p-3 max-h-56 overflow-y-auto">
                {narrativeArc.entries.map((entry, idx) => (
                  <div key={`${entry.sceneId}_${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          const targetScene = scenes.find((scene) => scene.id === entry.sceneId);
                          if (targetScene) onSceneClick(targetScene);
                        }}
                        className="text-xs text-amber-300 hover:text-amber-200 text-left"
                      >
                        Scene {entry.position + 1}: {entry.sceneTitle}
                      </button>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 uppercase tracking-wide">
                        {entry.role}
                      </span>
                    </div>
                    {entry.changes.length > 0 && (
                      <p className="text-[11px] text-gray-300 mt-1">{entry.changes.join(" ")}</p>
                    )}
                    {entry.events.length > 0 && (
                      <p className="text-[10px] text-gray-500 mt-1">Events: {entry.events.join(" | ")}</p>
                    )}
                  </div>
                ))}
              </div>
              {arcIssues && arcIssues.length > 0 && (
                <p className="text-[11px] text-rose-300/80 mt-2">
                  Continuity notes: {arcIssues.length} issue{arcIssues.length > 1 ? "s" : ""} involve this entity.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-white/5 flex flex-wrap gap-3 flex-shrink-0">
          <button
            onClick={() => onFocusInChat(entity)}
            className="flex-1 min-w-[140px] px-4 py-3 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 font-medium flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            Focus in Chat
          </button>
          {onGeneratePortrait && !portraitVariations && (
            <button
              onClick={() => onGeneratePortrait(entity, portraitPrompt)}
              disabled={isGeneratingPortrait || isGeneratingVariations}
              className={cn(
                "px-4 py-3 rounded-xl flex items-center gap-2 transition-all",
                isGeneratingPortrait
                  ? "bg-purple-500/30 text-purple-400 cursor-wait"
                  : "bg-white/5 text-gray-400 hover:bg-purple-500/20 hover:text-purple-400"
              )}
            >
              {isGeneratingPortrait ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          )}
          {onGenerateVariations && !portraitVariations && (
            <button
              onClick={() => onGenerateVariations(entity, portraitPrompt)}
              disabled={isGeneratingPortrait || isGeneratingVariations}
              className={cn(
                "px-4 py-3 rounded-xl flex items-center gap-2 transition-all",
                isGeneratingVariations
                  ? "bg-purple-500/30 text-purple-400 cursor-wait"
                  : "bg-white/5 text-gray-400 hover:bg-purple-500/20 hover:text-purple-400"
              )}
            >
              {isGeneratingVariations ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Generating 4...
                </>
              ) : (
                <>
                  <Layers className="w-4 h-4" />
                  4 Variations
                </>
              )}
            </button>
          )}
          <button className="px-4 py-3 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right side - Outgoing relationships + Scene bubbles */}
      <div className="flex-shrink-0 w-40 flex flex-col items-center gap-4">
        {outgoingRels.slice(0, 3).map((rel) => {
          const relEntity = allEntities.find((e) => e.id === rel.targetId);
          if (!relEntity) return null;
          const relConfig = entityTypeConfig[relEntity.type] || entityTypeConfig.character;

          return (
            <button
              key={rel.id}
              onClick={() => onEntityClick(rel.targetId)}
              className="group relative flex flex-col items-center"
            >
              {/* Connector line */}
              <svg className="absolute top-1/2 right-full w-8 h-1" style={{ transform: "translateY(-50%)" }}>
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(251,191,36,0.3)" strokeWidth="2" strokeDasharray="4 4" />
              </svg>
              <div className={cn("w-20 h-20 rounded-full overflow-hidden ring-4 transition-all group-hover:ring-amber-400", relConfig.ringColor)}>
                {relEntity.referenceImage ? (
                  <img src={relEntity.referenceImage} alt={relEntity.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={cn("w-full h-full flex items-center justify-center", relConfig.bgColor)}>
                    <relConfig.icon className={cn("w-8 h-8", relConfig.color)} />
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 mt-2 text-center line-clamp-1">{relEntity.name}</span>
              <span className="text-[10px] text-cyan-400/60">{rel.type}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// =============================================================================
// SCENE DETAIL VIEW
// =============================================================================

function SceneDetailView({
  scene,
  entities,
  onClose,
  onEntityClick,
  onSceneUpdate,
  onDiscuss,
  onGenerateImage,
  onGenerateFrames,
  onGenerateFrameImage,
  isGeneratingImage,
  isGeneratingFrames,
  generatingFrameId,
  onPreviousScene,
  onNextScene,
  sceneIndex,
  totalScenes,
}: {
  scene: Scene;
  entities: Entity[];
  onClose: () => void;
  onEntityClick: (entity: Entity) => void;
  onSceneUpdate: (scene: Scene) => void;
  onDiscuss: (scene: Scene) => void;
  onGenerateImage: (scene: Scene, prompt?: string) => void;
  onGenerateFrames: (scene: Scene, count: number) => void;
  onGenerateFrameImage: (scene: Scene, frame: SceneFrame, prompt?: string) => void;
  isGeneratingImage?: boolean;
  isGeneratingFrames?: boolean;
  generatingFrameId?: string | null;
  onPreviousScene?: () => void;
  onNextScene?: () => void;
  sceneIndex?: number;
  totalScenes?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(scene.title);
  const [editProse, setEditProse] = useState(scene.prose);
  const [frameCount, setFrameCount] = useState(scene.frames?.length || 4);
  const [imagePrompt, setImagePrompt] = useState("");

  useEffect(() => {
    setFrameCount(scene.frames?.length || 4);
    if (!isEditing) {
      setEditTitle(scene.title);
      setEditProse(scene.prose);
    }
  }, [scene.title, scene.prose, scene.frames?.length, isEditing]);

  useEffect(() => {
    setIsEditing(false);
    setImagePrompt("");
  }, [scene.id]);

  const participants = entities.filter((e) => scene.participantIds.includes(e.id));
  const location = entities.find((e) => e.id === scene.locationId);

  const handleSaveEdit = () => {
    onSceneUpdate({
      ...scene,
      title: editTitle,
      prose: editProse,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(scene.title);
    setEditProse(scene.prose);
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      className="relative flex items-center gap-6 max-w-5xl w-full mx-4"
    >
      {/* Left side - Participants */}
      <div className="flex-shrink-0 w-40 flex flex-col items-center gap-4">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-1">Participants</h3>
        {participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center mb-2">
              <Users className="w-6 h-6 text-gray-600" />
            </div>
            <span className="text-xs text-gray-600 text-center">No participants<br/>assigned</span>
          </div>
        ) : (
          <>
            {participants.slice(0, 4).map((entity) => {
              const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
              return (
                <button
                  key={entity.id}
                  onClick={() => onEntityClick(entity)}
                  className="group relative flex flex-col items-center"
                >
                  {/* Connector line pointing right toward center card */}
                  <svg className="absolute top-1/2 left-full w-8 h-1" style={{ transform: "translateY(-50%)" }}>
                    <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(251,191,36,0.3)" strokeWidth="2" strokeDasharray="4 4" />
                  </svg>
                  <div className={cn("w-20 h-20 rounded-full overflow-hidden ring-4 transition-all group-hover:ring-amber-400", config.ringColor)}>
                    {entity.referenceImage ? (
                      <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                        <config.icon className={cn("w-8 h-8", config.color)} />
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 mt-2 text-center line-clamp-1">{entity.name}</span>
                  <span className="text-[10px] text-amber-400/60">{entity.type}</span>
                </button>
              );
            })}
            {participants.length > 4 && (
              <span className="text-xs text-gray-500">+{participants.length - 4} more</span>
            )}
          </>
        )}
      </div>

      {/* Center - Scene card */}
      <div className="flex-1 bg-slate-900 rounded-2xl border border-white/20 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Navigation Header */}
        {(onPreviousScene || onNextScene) && (
          <div className="h-10 flex items-center justify-between px-4 border-b border-white/5 bg-slate-900/80 flex-shrink-0">
            <button
              onClick={onPreviousScene}
              disabled={!onPreviousScene}
              className={cn(
                "flex items-center gap-1 text-xs transition-colors",
                onPreviousScene ? "text-gray-400 hover:text-white" : "text-gray-600 cursor-not-allowed"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-xs text-gray-500">
              Scene {(sceneIndex ?? 0) + 1} of {totalScenes ?? 1}
            </span>
            <button
              onClick={onNextScene}
              disabled={!onNextScene}
              className={cn(
                "flex items-center gap-1 text-xs transition-colors",
                onNextScene ? "text-gray-400 hover:text-white" : "text-gray-600 cursor-not-allowed"
              )}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="h-64 relative flex-shrink-0">
          {scene.imageUrl ? (
            <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
              <Film className="w-20 h-20 text-amber-500/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white/70 hover:bg-black/70">
            <X className="w-5 h-5" />
          </button>

          {/* Re-roll and Composition buttons like mockup */}
          <div className="absolute top-4 left-4 flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs flex items-center gap-1.5 hover:bg-black/80">
              <RefreshCw className="w-3.5 h-3.5" /> Re-roll
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs flex items-center gap-1.5 hover:bg-black/80">
              <Layers className="w-3.5 h-3.5" /> Composition
            </button>
          </div>

          <div className="absolute bottom-4 left-6 right-6">
            <div className="flex items-center gap-2 mb-2">
              <Film className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-400/80 uppercase tracking-wider">Scene</span>
              {scene.status === "draft" ? (
                <button
                  onClick={() => onSceneUpdate({ ...scene, status: "canon" })}
                  className="px-2 py-0.5 rounded bg-amber-500/80 text-xs text-black hover:bg-green-500 transition-colors flex items-center gap-1"
                  title="Click to promote to Canon"
                >
                  <ChevronUp className="w-3 h-3" />
                  Promote to Canon
                </button>
              ) : (
                <span className="px-2 py-0.5 rounded bg-green-500/80 text-xs text-black flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  Canon
                </span>
              )}
            </div>
            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-2xl font-bold text-white bg-transparent border-b-2 border-amber-500 w-full outline-none"
                autoFocus
              />
            ) : (
              <h2 className="text-2xl font-bold text-white">{scene.title}</h2>
            )}
          </div>
        </div>

        {/* Prose */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {scene.events && scene.events.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {scene.events.map((event, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm">
                  {event}
                </span>
              ))}
            </div>
          )}
          {!isEditing && scene.storyDiff && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
                  +{scene.storyDiff.entityAdds.length} enters
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-500/20 text-slate-300">
                  -{scene.storyDiff.entityRemoves.length} exits
                </span>
                <span className={cn(
                  "px-2 py-0.5 rounded",
                  scene.storyDiff.issueCount > 0 ? "bg-rose-500/20 text-rose-300" : "bg-green-500/10 text-green-300"
                )}>
                  {scene.storyDiff.issueCount} continuity issues
                </span>
              </div>
              {scene.storyDiff.locationChange && (
                <p className="text-[11px] text-gray-400">
                  Location shift: {scene.storyDiff.locationChange.from || "Unspecified"} {"->"} {scene.storyDiff.locationChange.to || "Unspecified"}
                </p>
              )}
              {scene.storyDiff.continuityIssues && scene.storyDiff.continuityIssues.length > 0 && (
                <div className="space-y-1">
                  {scene.storyDiff.continuityIssues.slice(0, 3).map((issue) => (
                    <p key={issue.id} className="text-[11px] text-rose-300/90">
                      {issue.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {isEditing ? (
            <textarea
              value={editProse}
              onChange={(e) => setEditProse(e.target.value)}
              className="w-full h-full min-h-[300px] bg-white/5 rounded-xl p-4 text-gray-300 leading-relaxed resize-none border border-amber-500/30 outline-none focus:border-amber-500"
              placeholder="Write the scene prose..."
            />
          ) : (
            <div className="prose prose-invert prose-lg max-w-none">
              {scene.prose.split("\n\n").map((p, i) => (
                <p key={i} className="text-gray-300 leading-relaxed mb-4 last:mb-0">
                  {p}
                </p>
              ))}
            </div>
          )}

          {!isEditing && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Image Prompt (Optional)</h3>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Add visual notes that influence generation without overriding the scene..."
                className="w-full min-h-[80px] bg-white/5 rounded-xl p-3 text-xs text-gray-300 leading-relaxed resize-none border border-white/10 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          )}

          {/* Frames / Storyboard Breakdown */}
          {!isEditing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Frames</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={frameCount}
                    onChange={(e) => setFrameCount(Math.min(Math.max(Number(e.target.value) || 1, 1), 12))}
                    className="w-16 px-2 py-1 rounded bg-white/5 text-xs text-gray-200 border border-white/10 focus:outline-none focus:border-amber-500/50"
                  />
                  <button
                    onClick={() => onGenerateFrames(scene, frameCount)}
                    disabled={isGeneratingFrames}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors",
                      isGeneratingFrames
                        ? "bg-purple-500/30 text-purple-300 cursor-wait"
                        : "bg-white/5 text-gray-300 hover:bg-purple-500/20 hover:text-purple-300"
                    )}
                  >
                    {isGeneratingFrames ? (
                      <>
                        <Loader className="w-3 h-3 animate-spin" />
                        Generating
                      </>
                    ) : (
                      <>
                        <Layers className="w-3 h-3" />
                        Generate Frames
                      </>
                    )}
                  </button>
                </div>
              </div>

              {scene.frames && scene.frames.length > 0 ? (
                <div className="space-y-3">
                  {scene.frames.map((frame, idx) => (
                    <div key={frame.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                      <div className="aspect-video bg-slate-900/60 flex items-center justify-center relative">
                        {frame.imageUrl ? (
                          <img src={frame.imageUrl} alt={frame.title || `Frame ${idx + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <Film className="w-10 h-10 text-amber-500/20" />
                        )}
                        <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded bg-black/60 text-amber-300 uppercase tracking-wider">
                          Frame {idx + 1}
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-200">{frame.title || `Frame ${idx + 1}`}</span>
                          <button
                            onClick={() => onGenerateFrameImage(scene, frame, imagePrompt)}
                            disabled={!!generatingFrameId && generatingFrameId === frame.id}
                            className={cn(
                              "px-2 py-1 rounded text-[10px] flex items-center gap-1.5 transition-colors",
                              generatingFrameId === frame.id
                                ? "bg-purple-500/30 text-purple-300 cursor-wait"
                                : "bg-white/5 text-gray-300 hover:bg-purple-500/20 hover:text-purple-300"
                            )}
                          >
                            {generatingFrameId === frame.id ? (
                              <>
                                <Loader className="w-3 h-3 animate-spin" />
                                Generating
                              </>
                            ) : (
                              <>
                                <ImageIcon className="w-3 h-3" />
                                Generate Image
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">{frame.description}</p>
                        {frame.visual_beat && (
                          <p className="text-[10px] text-gray-500 leading-relaxed">
                            Visual: {frame.visual_beat}
                          </p>
                        )}
                        {frame.caption && (
                          <p className="text-[10px] text-amber-300/80 leading-relaxed">
                            Caption: {frame.caption}
                          </p>
                        )}
                        {frame.dialogue && frame.dialogue.length > 0 && (
                          <div className="text-[10px] text-gray-300 space-y-1">
                            {frame.dialogue.map((line, i) => (
                              <div key={i} className="bg-white/5 rounded px-2 py-1">
                                {line}
                              </div>
                            ))}
                          </div>
                        )}
                        {frame.sfx && frame.sfx.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {frame.sfx.map((sfx, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 uppercase tracking-wide">
                                {sfx}
                              </span>
                            ))}
                          </div>
                        )}
                        {(frame.shotType || frame.camera || frame.mood) && (
                          <div className="flex flex-wrap gap-1.5">
                            {frame.shotType && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300">{frame.shotType}</span>
                            )}
                            {frame.camera && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300">{frame.camera}</span>
                            )}
                            {frame.mood && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300">{frame.mood}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 bg-white/5 rounded-xl p-3">
                  No frames yet. Generate a breakdown to storyboard this scene.
                </div>
              )}
            </div>
          )}

          {/* Participants Section - like Connections in Entity view */}
          {participants.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Participants ({participants.length})</h3>
              <div className="space-y-2 bg-white/5 rounded-xl p-3">
                {participants.map((entity) => {
                  const pConfig = entityTypeConfig[entity.type] || entityTypeConfig.character;
                  const PIcon = pConfig.icon;
                  return (
                    <button
                      key={entity.id}
                      onClick={() => onEntityClick(entity)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                    >
                      <div className={cn("w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2", pConfig.ringColor)}>
                        {entity.referenceImage ? (
                          <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className={cn("w-full h-full flex items-center justify-center", pConfig.bgColor)}>
                            <PIcon className={cn("w-5 h-5", pConfig.color)} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-200 group-hover:text-amber-400 transition-colors block truncate">{entity.name}</span>
                        <span className="text-xs text-gray-500 capitalize">{entity.type}</span>
                      </div>
                      {entity.traits && entity.traits.length > 0 && (
                        <span className="text-xs text-gray-500 truncate max-w-[120px]">{entity.traits.slice(0, 2).join(", ")}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Location Section */}
          {location && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Location</h3>
              <button
                onClick={() => onEntityClick(location)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left group"
              >
                <div className={cn("w-12 h-12 rounded-full overflow-hidden flex-shrink-0 ring-2", entityTypeConfig.location.ringColor)}>
                  {location.referenceImage ? (
                    <img src={location.referenceImage} alt={location.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={cn("w-full h-full flex items-center justify-center", entityTypeConfig.location.bgColor)}>
                      <MapPin className={cn("w-6 h-6", entityTypeConfig.location.color)} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-200 group-hover:text-purple-400 transition-colors block truncate font-medium">{location.name}</span>
                  {location.description && (
                    <span className="text-xs text-gray-500 line-clamp-1">{location.description}</span>
                  )}
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-white/5 flex gap-3 flex-shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-4 py-3 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500/30 font-medium flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Save Changes
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-4 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onDiscuss(scene)}
                className="flex-1 px-4 py-3 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 font-medium flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                Discuss Scene
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-3 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10 flex items-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => onGenerateImage(scene, imagePrompt)}
                disabled={isGeneratingImage}
                className={cn(
                  "px-4 py-3 rounded-xl flex items-center gap-2 transition-all",
                  isGeneratingImage
                    ? "bg-purple-500/30 text-purple-400 cursor-wait"
                    : "bg-white/5 text-gray-400 hover:bg-purple-500/20 hover:text-purple-400"
                )}
              >
                {isGeneratingImage ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    Generate Image
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right side - Location */}
      <div className="flex-shrink-0 w-40 flex flex-col items-center gap-4">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-1">Location</h3>
        {location ? (
          <button
            onClick={() => onEntityClick(location)}
            className="group relative flex flex-col items-center"
          >
            {/* Connector line pointing left toward center card */}
            <svg className="absolute top-1/2 right-full w-8 h-1" style={{ transform: "translateY(-50%)" }}>
              <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(168,85,247,0.3)" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
            <div className={cn("w-20 h-20 rounded-full overflow-hidden ring-4 transition-all group-hover:ring-purple-400", entityTypeConfig.location.ringColor)}>
              {location.referenceImage ? (
                <img src={location.referenceImage} alt={location.name} className="w-full h-full object-cover" />
              ) : (
                <div className={cn("w-full h-full flex items-center justify-center", entityTypeConfig.location.bgColor)}>
                  <MapPin className={cn("w-8 h-8", entityTypeConfig.location.color)} />
                </div>
              )}
            </div>
            <span className="text-xs text-gray-400 mt-2 text-center line-clamp-1">{location.name}</span>
            <span className="text-[10px] text-purple-400/60">Location</span>
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center mb-2">
              <MapPin className="w-6 h-6 text-gray-600" />
            </div>
            <span className="text-xs text-gray-600 text-center">No location<br/>assigned</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// WORLD DRAWER
// =============================================================================

function WorldDrawer({
  entities,
  scenes,
  onEntityClick,
  onSceneClick,
  onClose,
}: {
  entities: Entity[];
  scenes: Scene[];
  onEntityClick: (entity: Entity) => void;
  onSceneClick: (scene: Scene) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="font-medium text-gray-200">World</h3>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{scenes.length}</div>
            <div className="text-xs text-gray-500">Scenes</div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{entities.length}</div>
            <div className="text-xs text-gray-500">Entities</div>
          </div>
        </div>

        {/* Scenes */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Film className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-gray-500 uppercase">Scenes</span>
          </div>
          <div className="space-y-2">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => onSceneClick(scene)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left"
              >
                <div className="w-12 h-8 rounded overflow-hidden bg-slate-800 flex-shrink-0">
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-4 h-4 text-amber-500/30" />
                    </div>
                  )}
                </div>
                <span className="text-sm text-gray-300 truncate">{scene.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Entities by type */}
        {["character", "location", "creature", "object", "faction"].map((type) => {
          const typeEntities = entities.filter((e) => e.type === type);
          if (typeEntities.length === 0) return null;
          const config = entityTypeConfig[type] || entityTypeConfig.character;

          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                <config.icon className={cn("w-4 h-4", config.color)} />
                <span className="text-xs font-medium text-gray-500 uppercase">
                  {type}s ({typeEntities.length})
                </span>
              </div>
              <div className="space-y-1">
                {typeEntities.map((entity) => (
                  <button
                    key={entity.id}
                    onClick={() => onEntityClick(entity)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left"
                  >
                    <div className={cn("w-9 h-9 rounded-full overflow-hidden ring-2", config.ringColor)}>
                      {entity.referenceImage ? (
                        <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                          <config.icon className={cn("w-4 h-4", config.color)} />
                        </div>
                      )}
                    </div>
                    <span className="text-sm text-gray-300 truncate">{entity.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

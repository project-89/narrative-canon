"use client";

import { useState, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  MarkerType,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  Sparkles,
  Plus,
  MessageCircle,
  Send,
  Loader2,
  RefreshCw,
  Compass,
  ChevronRight,
  Zap,
  LayoutGrid,
  ScrollText,
  X,
} from "lucide-react";
import { getHierarchicalLayout } from "./graph-layout";
import { cn } from "@/lib/utils";
import { EntityNode, EntityNodeData, Resolution, ArtifactType } from "./nodes/EntityNode";

const nodeTypes = { entity: EntityNode };

const getEdgeStyle = (resolution: Resolution, relationType?: string) => {
  const baseStyle = {
    fog: { stroke: "#4b5563", strokeWidth: 1.5, strokeDasharray: "8,4", opacity: 0.6 },
    attending: { stroke: "#06b6d4", strokeWidth: 2, strokeDasharray: undefined, opacity: 0.8 },
    crystallized: { stroke: "#10b981", strokeWidth: 2.5, strokeDasharray: undefined, opacity: 1 },
  };
  return baseStyle[resolution] || baseStyle.fog;
};

interface WorldEntity {
  id: string;
  name: string;
  type: string;
  description?: string;
  resolution: Resolution;
  hint?: string;
  imageUrl?: string;
}

interface WorldLink {
  source: string;
  target: string;
  type: string;
  resolution: Resolution;
}

interface Perception {
  text: string;
  timestamp: number;
  type: "user" | "ai" | "discovery" | "system";
}

interface GeneratedArtifact {
  title: string;
  artifactType: string;
  content: string;
  metadata?: {
    author?: string;
    date?: string;
    classification?: string;
    notes?: string;
  };
  entityId?: string;
  entityName?: string;
}

function WorldExplorerInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [perceptions, setPerceptions] = useState<Perception[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null);
  const [currentProse, setCurrentProse] = useState("");
  const [currentArtifact, setCurrentArtifact] = useState<GeneratedArtifact | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const applyLayout = useCallback(() => {
    if (nodes.length === 0) return;
    const { nodes: ln, edges: le } = getHierarchicalLayout(nodes, edges, {
      direction: "TB",
      rankSep: 120,
      nodeSep: 80,
    });
    setNodes(ln);
    setEdges(le);
  }, [nodes, edges, setNodes, setEdges]);

  const addPerception = useCallback((text: string, type: Perception["type"]) => {
    setPerceptions((prev) => [...prev.slice(-20), { text, timestamp: Date.now(), type }]);
  }, []);

  const entityToNode = useCallback(
    (entity: WorldEntity, position?: { x: number; y: number }): Node => ({
      id: entity.id,
      type: "entity",
      position: position || { x: 0, y: 0 },
      data: {
        ...entity,
        onDevelop: () => developEntity(entity.id),
        onCrystallize: (t: "document" | "portrait") => crystallizeEntity(entity.id, t),
        onGenerateArtifact: (artifactType: ArtifactType, customPrompt?: string) =>
          generateArtifact(entity.id, artifactType, customPrompt),
        onFindConnections: () => findConnections(entity.id),
        isLoading: loadingNodeId === entity.id,
      } as EntityNodeData,
    }),
    [loadingNodeId]
  );

  const linkToEdge = useCallback((link: WorldLink): Edge => {
    const style = getEdgeStyle(link.resolution, link.type);
    return {
      id: `${link.source}-${link.target}`,
      source: link.source,
      target: link.target,
      type: "smoothstep",
      label: link.type !== "potential" ? link.type : undefined,
      labelStyle: {
        fill: link.resolution === "fog" ? "#6b7280" : "#d1d5db",
        fontSize: 11,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: "#111827",
        fillOpacity: 0.9,
        rx: 4,
        ry: 4,
      },
      labelBgPadding: [6, 4] as [number, number],
      style: {
        ...style,
        strokeLinecap: "round" as const,
      },
      animated: link.resolution === "fog",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
        width: 16,
        height: 16,
      },
    };
  }, []);

  const startExploration = async (seed?: string) => {
    setIsLoading(true);
    addPerception(seed ? `"${seed}"` : "Starting...", "user");

    try {
      const res = await fetch("http://localhost:3088/api/explore/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      if (data.prose) setCurrentProse(data.prose);

      const mainEntities: WorldEntity[] = (data.entities || []).map((e: any) => ({
        ...e,
        resolution: "attending" as Resolution,
      }));

      const fogEntities: WorldEntity[] = (data.potentialEntities || []).map((e: any, i: number) => ({
        id: e.id || `fog_${Date.now()}_${i}`,
        name: "???",
        type: e.type || "unknown",
        resolution: "fog" as Resolution,
        hint: e.hint,
      }));

      const allEntities = [...mainEntities, ...fogEntities];
      const newNodes = allEntities.map((e) => entityToNode(e));

      const mainLinks: WorldLink[] = (data.relationships || []).map((r: any) => ({
        source: r.source,
        target: r.target,
        type: r.type || "related_to",
        resolution: "attending" as Resolution,
      }));

      const fogLinks: WorldLink[] = fogEntities
        .map((f, i) => ({
          source: mainEntities[i % mainEntities.length]?.id || mainEntities[0]?.id,
          target: f.id,
          type: "potential",
          resolution: "fog" as Resolution,
        }))
        .filter((l) => l.source);

      const allLinks = [...mainLinks, ...fogLinks];
      const entityIds = new Set(allEntities.map((e) => e.id));
      const validLinks = allLinks.filter((l) => entityIds.has(l.source) && entityIds.has(l.target));
      const newEdges = validLinks.map(linkToEdge);

      const { nodes: ln, edges: le } = getHierarchicalLayout(newNodes, newEdges, {
        direction: "TB",
        rankSep: 120,
        nodeSep: 80,
      });

      setNodes(ln);
      setEdges(le);
      if (data.choices) setAiSuggestions(data.choices);
      addPerception(data.perception || "World initialized.", "ai");
    } catch (err) {
      console.error(err);
      addPerception("Something went wrong.", "system");
    } finally {
      setIsLoading(false);
    }
  };

  const developEntity = async (entityId: string) => {
    setLoadingNodeId(entityId);
    setNodes((nds) => nds.map((n) => (n.id === entityId ? { ...n, data: { ...n.data, isLoading: true } } : n)));

    try {
      const known = nodes
        .filter((n) => (n.data as EntityNodeData).resolution !== "fog")
        .map((n) => ({ id: n.id, name: (n.data as EntityNodeData).name, type: (n.data as EntityNodeData).type }));

      const res = await fetch("http://localhost:3088/api/explore/attend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, context: { knownEntities: known } }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      setNodes((nds) =>
        nds.map((n) =>
          n.id === entityId
            ? {
                ...n,
                data: {
                  ...n.data,
                  name: data.name || "Something",
                  type: data.type || n.data.type,
                  description: data.description,
                  resolution: "attending" as Resolution,
                  isLoading: false,
                  onDevelop: undefined,
                  onCrystallize: (t: "document" | "portrait") => crystallizeEntity(entityId, t),
                  onFindConnections: () => findConnections(entityId),
                },
              }
            : n
        )
      );

      setEdges((eds) =>
        eds.map((e) =>
          e.source === entityId || e.target === entityId
            ? { ...e, ...linkToEdge({ source: e.source, target: e.target, type: (e.label as string) || "related_to", resolution: "attending" }) }
            : e
        )
      );

      if (data.sensedEntities?.length) {
        const node = nodes.find((n) => n.id === entityId);
        const bx = node?.position.x || 400;
        const by = node?.position.y || 300;

        const newFog = data.sensedEntities.map((e: any, i: number) => {
          const a = (i / data.sensedEntities.length) * Math.PI * 2;
          return entityToNode(
            { id: e.id || `fog_${Date.now()}_${i}`, name: "???", type: e.type || "unknown", resolution: "fog", hint: e.hint },
            { x: bx + Math.cos(a) * 200, y: by + Math.sin(a) * 200 }
          );
        });
        setNodes((nds) => [...nds, ...newFog]);

        const newEdges = data.sensedEntities.map((e: any, i: number) =>
          linkToEdge({ source: entityId, target: newFog[i].id, type: e.relationshipHint || "potential", resolution: "fog" })
        );
        setEdges((eds) => [...eds, ...newEdges]);
      }

      addPerception(data.perception || `${data.name} emerges.`, "ai");
    } catch (err) {
      console.error(err);
      addPerception("Failed.", "system");
      setNodes((nds) => nds.map((n) => (n.id === entityId ? { ...n, data: { ...n.data, isLoading: false } } : n)));
    } finally {
      setLoadingNodeId(null);
    }
  };

  const crystallizeEntity = async (entityId: string, type: "document" | "portrait") => {
    setLoadingNodeId(entityId);
    const node = nodes.find((n) => n.id === entityId);
    if (!node) return;

    addPerception(`Generating ${type}...`, "system");
    setNodes((nds) => nds.map((n) => (n.id === entityId ? { ...n, data: { ...n.data, isLoading: true } } : n)));

    try {
      const res = await fetch("http://localhost:3088/api/explore/crystallize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, entity: node.data, type }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      setNodes((nds) =>
        nds.map((n) =>
          n.id === entityId
            ? {
                ...n,
                data: {
                  ...n.data,
                  resolution: "crystallized" as Resolution,
                  imageUrl: data.imageUrl || n.data.imageUrl,
                  description: data.description || n.data.description,
                  isLoading: false,
                },
              }
            : n
        )
      );

      setEdges((eds) =>
        eds.map((e) =>
          e.source === entityId || e.target === entityId
            ? { ...e, ...linkToEdge({ source: e.source, target: e.target, type: (e.label as string) || "related_to", resolution: "crystallized" }) }
            : e
        )
      );

      addPerception(data.perception || "Crystallized!", "ai");
    } catch (err) {
      console.error(err);
      addPerception("Failed.", "system");
    } finally {
      setLoadingNodeId(null);
      setNodes((nds) => nds.map((n) => (n.id === entityId ? { ...n, data: { ...n.data, isLoading: false } } : n)));
    }
  };

  const generateArtifact = async (entityId: string, artifactType: ArtifactType, customPrompt?: string) => {
    setLoadingNodeId(entityId);
    const node = nodes.find((n) => n.id === entityId);
    if (!node) return;

    const nodeData = node.data as EntityNodeData;
    addPerception(`Generating ${artifactType}...`, "system");
    setNodes((nds) => nds.map((n) => (n.id === entityId ? { ...n, data: { ...n.data, isLoading: true } } : n)));

    try {
      // Get all known entities for context
      const knownEntities = nodes
        .filter((n) => (n.data as EntityNodeData).resolution !== "fog")
        .map((n) => ({
          id: n.id,
          name: (n.data as EntityNodeData).name,
          type: (n.data as EntityNodeData).type,
          description: (n.data as EntityNodeData).description,
        }));

      const res = await fetch("http://localhost:3088/api/explore/artifact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          entities: knownEntities,
          artifactType,
          customPrompt,
          context: { knownEntities },
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      // Set the artifact for display
      setCurrentArtifact({
        title: data.title,
        artifactType: data.artifactType,
        content: data.content,
        metadata: data.metadata,
        entityId,
        entityName: nodeData.name,
      });

      // If there are new discoveries, add them as fog nodes
      if (data.newDiscoveries?.length) {
        const bx = node.position.x;
        const by = node.position.y;

        const newFog = data.newDiscoveries.map((e: any, i: number) => {
          const a = (i / data.newDiscoveries.length) * Math.PI * 2 + Math.random() * 0.5;
          return entityToNode(
            { id: `fog_${Date.now()}_${i}`, name: "???", type: e.type || "unknown", resolution: "fog", hint: e.hint || e.name },
            { x: bx + Math.cos(a) * 250, y: by + Math.sin(a) * 250 }
          );
        });

        setNodes((nds) => {
          const ids = new Set(nds.map((n) => n.id));
          return [...nds, ...newFog.filter((n: Node) => !ids.has(n.id))];
        });
      }

      addPerception(`Created: ${data.title}`, "discovery");
    } catch (err) {
      console.error(err);
      addPerception("Failed to generate artifact.", "system");
    } finally {
      setLoadingNodeId(null);
      setNodes((nds) => nds.map((n) => (n.id === entityId ? { ...n, data: { ...n.data, isLoading: false } } : n)));
    }
  };

  const findConnections = async (entityId: string) => {
    setLoadingNodeId(entityId);
    const node = nodes.find((n) => n.id === entityId);
    if (!node) return;

    addPerception("Finding connections...", "system");

    try {
      const known = nodes
        .filter((n) => (n.data as EntityNodeData).resolution !== "fog")
        .map((n) => ({ id: n.id, name: (n.data as EntityNodeData).name, type: (n.data as EntityNodeData).type }));

      const res = await fetch("http://localhost:3088/api/explore/sense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusId: entityId, context: { knownEntities: known } }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      if (data.sensedEntities?.length) {
        const bx = node.position.x;
        const by = node.position.y;

        const newFog = data.sensedEntities.map((e: any, i: number) => {
          const a = (i / data.sensedEntities.length) * Math.PI * 2 + Math.random() * 0.5;
          return entityToNode(
            { id: e.id || `fog_${Date.now()}_${i}`, name: "???", type: e.type || "unknown", resolution: "fog", hint: e.hint },
            { x: bx + Math.cos(a) * 220, y: by + Math.sin(a) * 220 }
          );
        });

        setNodes((nds) => {
          const ids = new Set(nds.map((n) => n.id));
          return [...nds, ...newFog.filter((n: Node) => !ids.has(n.id))];
        });

        const newEdges = data.sensedEntities.map((e: any, i: number) =>
          linkToEdge({ source: entityId, target: newFog[i].id, type: e.relationshipHint || "potential", resolution: "fog" })
        );
        setEdges((eds) => [...eds, ...newEdges]);
      }

      if (data.questions) setAiSuggestions(data.questions);
      addPerception(data.perception || "Found possibilities.", "ai");
    } catch (err) {
      console.error(err);
      addPerception("Failed.", "system");
    } finally {
      setLoadingNodeId(null);
    }
  };

  const exploreViaChat = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setChatInput("");
    addPerception(prompt, "user");

    try {
      const known = nodes
        .filter((n) => (n.data as EntityNodeData).resolution !== "fog")
        .map((n) => ({
          id: n.id,
          name: (n.data as EntityNodeData).name,
          type: (n.data as EntityNodeData).type,
          description: (n.data as EntityNodeData).description,
        }));

      const res = await fetch("http://localhost:3088/api/explore/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: prompt, context: { currentNode: selectedNode?.id, knownEntities: known } }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      if (data.prose) setCurrentProse(data.prose);

      if (data.entities?.length) {
        const newNodes = data.entities.map((e: any) =>
          entityToNode({ ...e, resolution: "attending" as Resolution }, { x: 400 + Math.random() * 200 - 100, y: 300 + Math.random() * 200 - 100 })
        );
        setNodes((nds) => {
          const ids = new Set(nds.map((n) => n.id));
          return [...nds, ...newNodes.filter((n: Node) => !ids.has(n.id))];
        });
        addPerception(`Discovered: ${data.entities.map((e: any) => e.name).join(", ")}`, "discovery");
      }

      if (data.relationships?.length) {
        const newEdges = data.relationships.map((r: any) =>
          linkToEdge({ source: r.source, target: r.target, type: r.type || "related_to", resolution: "attending" })
        );
        setEdges((eds) => [...eds, ...newEdges]);
      }

      if (data.choices) setAiSuggestions(data.choices);
      addPerception("The world expands...", "ai");
    } catch (err) {
      console.error(err);
      addPerception("Failed.", "system");
    } finally {
      setIsLoading(false);
    }
  };

  const addNewNode = () => {
    const prompt = window.prompt("What would you like to add?");
    if (prompt) exploreViaChat(`Create a new element: ${prompt}`);
  };

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `${params.source}-${params.target}`,
        source: params.source!,
        target: params.target!,
        label: "related_to",
        labelStyle: { fill: "#9ca3af", fontSize: 10 },
        labelBgStyle: { fill: "#111827", fillOpacity: 0.8 },
        style: getEdgeStyle("attending"),
        markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4" },
      };
      setEdges((eds) => addEdge(newEdge, eds) as Edge[]);
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_: any, node: Node) => setSelectedNode(node), []);

  if (nodes.length === 0) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center overflow-hidden relative">
        {/* Animated background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/10 via-gray-950 to-gray-950" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI1MmUiIGZpbGwtb3BhY2l0eT0iMC40Ij48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIxIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />

        <div className="relative text-center space-y-8 max-w-xl px-6">
          {/* Logo/Icon */}
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full scale-150" />
            <Compass className="w-24 h-24 mx-auto text-cyan-500/60 relative animate-pulse" />
          </div>

          {/* Title */}
          <div className="space-y-3">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              World Weaver
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed">
              Explore the latent space of narrative possibility.<br />
              <span className="text-gray-500">Creation through discovery.</span>
            </p>
          </div>

          {/* Main Input */}
          <div className="space-y-4 pt-4">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
              <input
                type="text"
                placeholder="A haunted lighthouse, a secret society, a dying god..."
                className={cn(
                  "relative w-full px-5 py-4 rounded-2xl text-lg",
                  "bg-gray-900/80 backdrop-blur-sm border border-gray-800",
                  "text-gray-200 placeholder-gray-600",
                  "focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20",
                  "transition-all"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value) startExploration(e.currentTarget.value);
                }}
                disabled={isLoading}
              />
            </div>
            <button
              onClick={() => startExploration()}
              disabled={isLoading}
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
                  Manifesting...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Begin Exploration
                </span>
              )}
            </button>
          </div>

          {/* Genre Quick Starts */}
          <div className="pt-8 border-t border-gray-800/50">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-4">Quick Start Templates</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Cosmic Horror", seed: "A small fishing village where the sea whispers secrets", icon: "🌊" },
                { label: "Cyberpunk", seed: "A neon-lit megacity where memories can be stolen", icon: "🌃" },
                { label: "Fantasy Kingdom", seed: "An ancient empire where magic is fading", icon: "🏰" },
                { label: "Space Opera", seed: "A generation ship lost between galaxies", icon: "🚀" },
                { label: "Noir Mystery", seed: "A rain-soaked city where everyone has secrets", icon: "🔍" },
                { label: "Post-Apocalyptic", seed: "The last sanctuary after the quiet apocalypse", icon: "🌅" },
              ].map((template) => (
                <button
                  key={template.label}
                  onClick={() => startExploration(template.seed)}
                  disabled={isLoading}
                  className={cn(
                    "px-4 py-3 rounded-xl text-left transition-all group",
                    "bg-gray-900/50 border border-gray-800",
                    "hover:bg-gray-800/80 hover:border-gray-700",
                    "disabled:opacity-50"
                  )}
                >
                  <span className="text-lg mr-2">{template.icon}</span>
                  <span className="text-sm text-gray-400 group-hover:text-gray-300">{template.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-950 flex relative">
      {/* Artifact Viewer Modal */}
      {currentArtifact && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[85vh] mx-4 bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-800">
              <div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <ScrollText className="w-3 h-3" />
                  {currentArtifact.artifactType}
                  {currentArtifact.entityName && (
                    <>
                      <span>•</span>
                      <span>{currentArtifact.entityName}</span>
                    </>
                  )}
                </div>
                <h2 className="text-xl font-semibold text-gray-100">{currentArtifact.title}</h2>
                {currentArtifact.metadata?.author && (
                  <p className="text-sm text-gray-500 mt-1">By {currentArtifact.metadata.author}</p>
                )}
              </div>
              <button
                onClick={() => setCurrentArtifact(null)}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-gray-300 leading-relaxed text-sm bg-transparent p-0 m-0">
                  {currentArtifact.content}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-gray-800 bg-gray-900/50">
              <div className="flex items-center gap-4 text-xs text-gray-600">
                {currentArtifact.metadata?.date && <span>Date: {currentArtifact.metadata.date}</span>}
                {currentArtifact.metadata?.classification && (
                  <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                    {currentArtifact.metadata.classification}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentArtifact.content);
                    addPerception("Copied to clipboard", "system");
                  }}
                  className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-sm hover:text-gray-200 transition-colors"
                >
                  Copy
                </button>
                <button
                  onClick={() => setCurrentArtifact(null)}
                  className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm hover:bg-cyan-500/30 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={reactFlowWrapper} className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: "smoothstep",
          }}
          connectionLineStyle={{ stroke: "#06b6d4", strokeWidth: 2 }}
          connectionLineType={"smoothstep" as any}
          snapToGrid
          snapGrid={[20, 20]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1f2937" />
          <Controls className="!bg-gray-900 !border-gray-700 !rounded-lg" />
          <MiniMap
            className="!bg-gray-900 !border-gray-700 !rounded-lg"
            nodeColor={(n) => {
              const d = n.data as EntityNodeData;
              return d.resolution === "fog" ? "#374151" : d.resolution === "crystallized" ? "#10b981" : "#06b6d4";
            }}
          />

          <Panel position="top-left" className="flex gap-2">
            <button
              onClick={addNewNode}
              className={cn(
                "px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all",
                "bg-gradient-to-r from-cyan-500/10 to-blue-500/10",
                "border border-cyan-500/30 text-cyan-400",
                "hover:from-cyan-500/20 hover:to-blue-500/20 hover:border-cyan-400/50"
              )}
            >
              <Plus className="w-4 h-4" /> Add Element
            </button>
            <button
              onClick={applyLayout}
              className="px-4 py-2.5 rounded-xl bg-gray-900/90 backdrop-blur-sm border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 text-sm font-medium flex items-center gap-2 transition-all"
            >
              <LayoutGrid className="w-4 h-4" /> Auto Layout
            </button>
            <button
              onClick={() => {
                if (confirm("Reset the entire world? This cannot be undone.")) {
                  setNodes([]);
                  setEdges([]);
                  setPerceptions([]);
                  setAiSuggestions([]);
                  setCurrentProse("");
                  setSelectedNode(null);
                }
              }}
              className="px-3 py-2.5 rounded-xl bg-gray-900/90 backdrop-blur-sm border border-gray-800 text-gray-600 hover:text-red-400 hover:border-red-500/30 text-sm flex items-center gap-2 transition-all"
              title="Reset world"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </Panel>

          {/* Scene prose panel */}
          {currentProse && (
            <Panel position="bottom-left" className="max-w-xl">
              <div className="bg-gray-900/95 backdrop-blur-md rounded-2xl border border-gray-800/80 p-5 max-h-56 overflow-y-auto shadow-xl">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-300">Narrative Context</h4>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap italic">
                  {currentProse}
                </p>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Right Panel - AI Co-Explorer */}
      <div className="w-[420px] border-l border-gray-800 flex flex-col bg-gradient-to-b from-gray-950 to-gray-900">
        {/* Header */}
        <div className="p-5 border-b border-gray-800/80 bg-gray-900/50">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              World Weaver
            </h2>
            <div className="flex items-center gap-1 text-xs">
              <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-500">
                {nodes.length} elements
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            {selectedNode
              ? `Exploring ${(selectedNode.data as EntityNodeData).name}...`
              : "Select an element or ask me to expand the world"}
          </p>
        </div>

        {/* Selected Node Details */}
        {selectedNode && (
          <div className="p-4 border-b border-gray-800/80 bg-gradient-to-r from-gray-900/80 to-gray-800/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-lg">
                {(selectedNode.data as EntityNodeData).resolution === "fog" ? "👻" : "✨"}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-100 truncate">
                  {(selectedNode.data as EntityNodeData).name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 capitalize">
                    {(selectedNode.data as EntityNodeData).type}
                  </span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full capitalize",
                    (selectedNode.data as EntityNodeData).resolution === "fog" && "bg-gray-700 text-gray-500",
                    (selectedNode.data as EntityNodeData).resolution === "attending" && "bg-cyan-500/20 text-cyan-400",
                    (selectedNode.data as EntityNodeData).resolution === "crystallized" && "bg-emerald-500/20 text-emerald-400"
                  )}>
                    {(selectedNode.data as EntityNodeData).resolution}
                  </span>
                </div>
              </div>
            </div>
            {(selectedNode.data as EntityNodeData).description && (
              <p className="text-sm text-gray-400 mt-3 leading-relaxed line-clamp-3">
                {(selectedNode.data as EntityNodeData).description}
              </p>
            )}
          </div>
        )}

        {/* AI Suggestions */}
        {aiSuggestions.length > 0 && (
          <div className="p-4 border-b border-gray-800/80">
            <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-3 h-3" />
              Paths Forward
            </h4>
            <div className="space-y-2">
              {aiSuggestions.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  onClick={() => exploreViaChat(s)}
                  disabled={isLoading}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl text-sm transition-all",
                    "bg-gradient-to-r from-cyan-500/10 to-blue-500/5",
                    "border border-cyan-500/20 text-gray-300",
                    "hover:from-cyan-500/20 hover:to-blue-500/10 hover:border-cyan-400/40 hover:text-cyan-100",
                    "disabled:opacity-50 group"
                  )}
                >
                  <ChevronRight className="w-4 h-4 inline mr-2 text-cyan-500 group-hover:translate-x-0.5 transition-transform" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions when no suggestions */}
        {aiSuggestions.length === 0 && nodes.length > 0 && (
          <div className="p-4 border-b border-gray-800/80">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => exploreViaChat("Add a mysterious character connected to this world")}
                disabled={isLoading}
                className="px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-gray-400 text-xs hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                + Character
              </button>
              <button
                onClick={() => exploreViaChat("Add an important location in this world")}
                disabled={isLoading}
                className="px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-gray-400 text-xs hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                + Location
              </button>
              <button
                onClick={() => exploreViaChat("Add a powerful artifact or object")}
                disabled={isLoading}
                className="px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-gray-400 text-xs hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                + Artifact
              </button>
              <button
                onClick={() => exploreViaChat("Add a significant event or phenomenon")}
                disabled={isLoading}
                className="px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-gray-400 text-xs hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                + Event
              </button>
            </div>
          </div>
        )}

        {/* Discovery Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider sticky top-0 bg-gray-900/90 backdrop-blur-sm py-2 -mt-2 -mx-4 px-4">
            Discovery Log
          </h4>
          {perceptions.length === 0 ? (
            <div className="text-center py-8">
              <Compass className="w-8 h-8 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-600">Begin your exploration...</p>
            </div>
          ) : (
            perceptions.map((p, idx) => (
              <div
                key={p.timestamp}
                className={cn(
                  "px-4 py-3 rounded-xl text-sm transition-all",
                  p.type === "user" && "bg-gray-800/80 text-gray-300 ml-6 border-l-2 border-gray-600",
                  p.type === "ai" && "bg-gradient-to-r from-cyan-500/10 to-transparent text-cyan-200 mr-6 border-l-2 border-cyan-500/50",
                  p.type === "discovery" && "bg-gradient-to-r from-emerald-500/15 to-transparent text-emerald-300 border-l-2 border-emerald-500/50",
                  p.type === "system" && "bg-gray-800/30 text-gray-500 text-xs italic border-l-2 border-gray-700"
                )}
              >
                {p.type === "discovery" && <Sparkles className="w-3 h-3 inline mr-2" />}
                {p.text}
              </div>
            ))
          )}
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-gray-800/80 bg-gray-900/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (chatInput.trim()) exploreViaChat(chatInput);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={selectedNode ? `Ask about ${(selectedNode.data as EntityNodeData).name}...` : "What would you like to explore?"}
              disabled={isLoading}
              className={cn(
                "flex-1 px-4 py-3 rounded-xl text-sm",
                "bg-gray-800/80 border border-gray-700",
                "text-gray-200 placeholder-gray-500",
                "focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20",
                "disabled:opacity-50 transition-all"
              )}
            />
            <button
              type="submit"
              disabled={isLoading || !chatInput.trim()}
              className={cn(
                "px-4 py-3 rounded-xl transition-all",
                "bg-gradient-to-r from-cyan-500/20 to-blue-500/20",
                "border border-cyan-500/30 text-cyan-400",
                "hover:from-cyan-500/30 hover:to-blue-500/30 hover:border-cyan-400/50",
                "disabled:opacity-50"
              )}
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>

        {/* Stats Footer */}
        <div className="px-5 py-3 border-t border-gray-800/50 bg-gray-950/50">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className="w-2 h-2 rounded-full bg-gray-600 animate-pulse" />
                {nodes.filter((n) => (n.data as EntityNodeData).resolution === "fog").length} hidden
              </span>
              <span className="flex items-center gap-1.5 text-cyan-500">
                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                {nodes.filter((n) => (n.data as EntityNodeData).resolution === "attending").length} emerging
              </span>
              <span className="flex items-center gap-1.5 text-emerald-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {nodes.filter((n) => (n.data as EntityNodeData).resolution === "crystallized").length} complete
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorldExplorer() {
  return (
    <ReactFlowProvider>
      <WorldExplorerInner />
    </ReactFlowProvider>
  );
}

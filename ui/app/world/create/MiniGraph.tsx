"use client";

import { useCallback, useMemo, useEffect, memo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  BackgroundVariant,
  MarkerType,
  Handle,
  Position,
  NodeProps,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import dagre from "dagre";

// Entity type colors matching the main design
const typeColors: Record<string, { bg: string; border: string; text: string }> = {
  character: { bg: "bg-cyan-500/20", border: "border-cyan-500/50", text: "text-cyan-400" },
  location: { bg: "bg-green-500/20", border: "border-green-500/50", text: "text-green-400" },
  organization: { bg: "bg-amber-500/20", border: "border-amber-500/50", text: "text-amber-400" },
  object: { bg: "bg-purple-500/20", border: "border-purple-500/50", text: "text-purple-400" },
  artifact: { bg: "bg-purple-500/20", border: "border-purple-500/50", text: "text-purple-400" },
  concept: { bg: "bg-pink-500/20", border: "border-pink-500/50", text: "text-pink-400" },
  faction: { bg: "bg-amber-500/20", border: "border-amber-500/50", text: "text-amber-400" },
  creature: { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-400" },
  event: { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-400" },
};

const defaultColor = { bg: "bg-gray-500/20", border: "border-gray-500/50", text: "text-gray-400" };

// Compact entity node for the mini graph
interface MiniNodeData extends Record<string, unknown> {
  name: string;
  type: string;
  isFocused: boolean;
  isCanon: boolean;
  onClick?: () => void;
}

function MiniNodeComponent({ data, selected }: { data: MiniNodeData; selected?: boolean }) {
  const colors = typeColors[data.type] || defaultColor;

  return (
    <div
      onClick={data.onClick}
      className={cn(
        "px-3 py-2 rounded-lg border transition-all cursor-pointer min-w-[80px] max-w-[140px]",
        colors.bg,
        colors.border,
        data.isFocused && "ring-2 ring-cyan-400 ring-offset-2 ring-offset-gray-950 scale-110",
        data.isCanon && "border-l-4 border-l-green-500",
        selected && "ring-2 ring-white/30",
        "hover:scale-105 hover:shadow-lg"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-600 !border-gray-500 !min-w-0 !min-h-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-gray-600 !border-gray-500 !min-w-0 !min-h-0"
      />

      <div className="text-center">
        <p className={cn(
          "text-xs font-medium truncate",
          data.isFocused ? "text-cyan-300" : "text-gray-200"
        )}>
          {data.name}
        </p>
        <p className={cn("text-[10px] capitalize", colors.text)}>
          {data.type}
        </p>
      </div>
    </div>
  );
}

const MiniNode = memo(MiniNodeComponent);

const nodeTypes = { mini: MiniNode };

// Auto-layout using dagre
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 120, height: 50 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 60,
        y: nodeWithPosition.y - 25,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

interface WorldEntity {
  id: string;
  name: string;
  type: string;
  description?: string;
  isCanon?: boolean;
}

interface WorldRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
}

interface MiniGraphProps {
  entities: WorldEntity[];
  relationships: WorldRelationship[];
  focusedEntities: string[];
  onEntityClick?: (entity: WorldEntity) => void;
  className?: string;
}

function MiniGraphInner({
  entities,
  relationships,
  focusedEntities,
  onEntityClick,
  className,
}: MiniGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const { fitView } = useReactFlow();

  // Convert entities to nodes
  const entityNodes = useMemo(() => {
    const focusSet = new Set(focusedEntities.map(f => f.toLowerCase()));

    return entities.map((entity) => ({
      id: entity.id,
      type: "mini",
      position: { x: 0, y: 0 },
      data: {
        name: entity.name,
        type: entity.type,
        isFocused: focusSet.has(entity.name.toLowerCase()),
        isCanon: entity.isCanon || false,
        onClick: () => onEntityClick?.(entity),
      } as MiniNodeData,
    }));
  }, [entities, focusedEntities, onEntityClick]);

  // Convert relationships to edges
  const relationshipEdges = useMemo(() => {
    const entityIds = new Set(entities.map(e => e.id));

    return relationships
      .filter(rel => entityIds.has(rel.source) && entityIds.has(rel.target))
      .map((rel) => ({
        id: rel.id || `${rel.source}-${rel.target}`,
        source: rel.source,
        target: rel.target,
        type: "smoothstep",
        label: rel.type,
        labelStyle: {
          fill: "#6b7280",
          fontSize: 9,
          fontWeight: 500
        },
        labelBgStyle: {
          fill: "#111827",
          fillOpacity: 0.9,
          rx: 3,
          ry: 3
        },
        labelBgPadding: [4, 2] as [number, number],
        style: {
          stroke: "#4b5563",
          strokeWidth: 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#4b5563",
          width: 12,
          height: 12,
        },
      }));
  }, [relationships, entities]);

  // Apply layout when data changes
  useEffect(() => {
    if (entityNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      entityNodes,
      relationshipEdges,
      "TB"
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    // Fit view after a short delay to let React Flow render
    setTimeout(() => {
      fitView({ padding: 0.2, maxZoom: 1.2 });
    }, 50);
  }, [entityNodes, relationshipEdges, setNodes, setEdges, fitView]);

  if (entities.length === 0) {
    return (
      <div className={cn(
        "flex items-center justify-center text-center p-8",
        className
      )}>
        <div className="text-gray-500 text-sm">
          <p className="mb-2">No entities yet</p>
          <p className="text-xs text-gray-600">Start building your world to see the graph</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full h-full bg-gray-950/50 rounded-lg overflow-hidden", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#1f2937"
        />
        <Controls
          className="!bg-gray-900/90 !border-gray-700 !rounded-lg !shadow-lg [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-400 [&>button:hover]:!bg-gray-700 [&>button:hover]:!text-gray-200"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}

export function MiniGraph(props: MiniGraphProps) {
  return (
    <ReactFlowProvider>
      <MiniGraphInner {...props} />
    </ReactFlowProvider>
  );
}

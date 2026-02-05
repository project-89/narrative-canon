"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";
import { EntityNode } from "./EntityNode";
import { GraphControls } from "./GraphControls";

const nodeTypes = {
  entityNode: EntityNode,
};

// Edge colors based on relationship type
const relationshipColors: Record<string, string> = {
  member_of: "#06b6d4",
  ally_of: "#06b6d4",
  leads: "#f59e0b",
  works_for: "#f59e0b",
  opposes: "#ef4444",
  conflicts_with: "#ef4444",
  fights_against: "#ef4444",
  located_at: "#8b5cf6",
  operates_from: "#8b5cf6",
  headquarters: "#8b5cf6",
  houses: "#10b981",
  contains: "#10b981",
  enables: "#ec4899",
  uses: "#ec4899",
  controls: "#f59e0b",
};

interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; type: string; description: string };
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: string;
}

interface EntityGraphInnerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (entityId: string) => void;
}

// Force simulation types
interface SimNode extends SimulationNodeDatum {
  id: string;
  x?: number;
  y?: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

// Run force simulation to get layouted positions
function getLayoutedElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number = 800,
  height: number = 600
): Node[] {
  if (nodes.length === 0) return [];

  // Create a set of valid node IDs
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Create simulation nodes
  const simNodes: SimNode[] = nodes.map((node) => ({
    id: node.id,
    x: node.position?.x || Math.random() * width,
    y: node.position?.y || Math.random() * height,
  }));

  // Create simulation links - only include edges where both nodes exist
  const validEdges = edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );
  const simLinks: SimLink[] = validEdges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  // Create the force simulation
  const simulation = forceSimulation<SimNode>(simNodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(200)
        .strength(0.5)
    )
    .force("charge", forceManyBody().strength(-800))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collision", forceCollide().radius(100))
    .force("x", forceX(width / 2).strength(0.05))
    .force("y", forceY(height / 2).strength(0.05))
    .stop();

  // Run the simulation synchronously
  for (let i = 0; i < 300; i++) {
    simulation.tick();
  }

  // Create a map of node positions
  const nodePositions = new Map<string, { x: number; y: number }>();
  simNodes.forEach((node) => {
    nodePositions.set(node.id, { x: node.x || 0, y: node.y || 0 });
  });

  // Apply positions to React Flow nodes
  return nodes.map((node) => {
    const pos = nodePositions.get(node.id) || { x: 0, y: 0 };
    return {
      id: node.id,
      type: "entityNode",
      position: { x: pos.x, y: pos.y },
      data: node.data,
    };
  });
}

function EntityGraphInner({ nodes: inputNodes, edges: inputEdges, onNodeClick }: EntityGraphInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLayouting, setIsLayouting] = useState(false);

  // Calculate layouted nodes using force simulation
  const layoutedNodes = useMemo((): Node[] => {
    if (inputNodes.length === 0) return [];
    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;
    return getLayoutedElements(inputNodes, inputEdges, width, height);
  }, [inputNodes, inputEdges]);

  // Transform edges to add styling based on relationship type
  const transformedEdges = useMemo((): Edge[] => {
    return inputEdges.map((edge) => {
      const edgeType = edge.type?.toLowerCase().replace(/\s+/g, "_") || "default";
      const color = relationshipColors[edgeType] || "#6b7280";
      const isConflict = ["opposes", "conflicts_with", "fights_against"].includes(edgeType);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: "smoothstep",
        animated: ["member_of", "ally_of"].includes(edgeType),
        style: {
          stroke: color,
          strokeWidth: 2,
          ...(isConflict ? { strokeDasharray: "5,5" } : {})
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        labelStyle: { fill: "#fff", fontWeight: 500, fontSize: 10 },
        labelBgStyle: { fill: "#1f2937", fillOpacity: 0.9 },
        labelBgPadding: [4, 4] as [number, number],
        labelBgBorderRadius: 4,
      };
    });
  }, [inputEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(transformedEdges);
  const [entityFilters, setEntityFilters] = useState<Record<string, boolean>>({});
  const [depth, setDepth] = useState(3);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Update nodes and edges when input changes
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(transformedEdges);
    // Fit view after layout
    setTimeout(() => fitView({ padding: 0.2 }), 100);
  }, [layoutedNodes, transformedEdges, setNodes, setEdges, fitView]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleFilterChange = useCallback((type: string, enabled: boolean) => {
    setEntityFilters((prev) => ({ ...prev, [type]: enabled }));
  }, []);

  // Re-run force layout
  const handleAutoLayout = useCallback(() => {
    setIsLayouting(true);
    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;
    const newLayoutedNodes = getLayoutedElements(inputNodes, inputEdges, width, height);
    setNodes(newLayoutedNodes);
    setTimeout(() => {
      fitView({ padding: 0.2 });
      setIsLayouting(false);
    }, 100);
  }, [inputNodes, inputEdges, setNodes, fitView]);

  const handleReset = useCallback(() => {
    handleAutoLayout();
  }, [handleAutoLayout]);

  // Handle node click to trigger onNodeClick callback
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick]
  );

  // Filter nodes based on entity type filters
  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const nodeType = (node.data as { type: string }).type;
      return entityFilters[nodeType] !== false;
    });
  }, [nodes, entityFilters]);

  // Filter edges to only show connections between visible nodes
  const filteredEdges = useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
    return edges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
  }, [edges, filteredNodes]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#374151" gap={20} size={1} />
        <MiniMap
          nodeColor={(node) => {
            const type = (node.data as { type: string }).type;
            const colors: Record<string, string> = {
              character: "#06b6d4",
              location: "#8b5cf6",
              organization: "#f59e0b",
              object: "#10b981",
              concept: "#ec4899",
              technology: "#3b82f6",
            };
            return colors[type] || "#6b7280";
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="!bg-card/80 !border-border rounded-lg"
        />
      </ReactFlow>
      <GraphControls
        onZoomIn={() => zoomIn()}
        onZoomOut={() => zoomOut()}
        onFitView={() => fitView({ padding: 0.2 })}
        onReset={handleReset}
        onAutoLayout={handleAutoLayout}
        isLayouting={isLayouting}
        entityFilters={entityFilters}
        onFilterChange={handleFilterChange}
        depth={depth}
        onDepthChange={setDepth}
      />
    </div>
  );
}

interface EntityGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (entityId: string) => void;
}

export function EntityGraph({ nodes = [], edges = [], onNodeClick }: EntityGraphProps) {
  return (
    <ReactFlowProvider>
      <EntityGraphInner nodes={nodes} edges={edges} onNodeClick={onNodeClick} />
    </ReactFlowProvider>
  );
}

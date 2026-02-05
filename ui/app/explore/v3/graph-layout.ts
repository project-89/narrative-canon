import * as dagre from "dagre";
import { Node, Edge } from "@xyflow/react";

export interface LayoutOptions {
  direction?: "TB" | "BT" | "LR" | "RL";
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
}

const defaultOptions: LayoutOptions = {
  direction: "TB",
  nodeWidth: 280,
  nodeHeight: 180,
  rankSep: 100,
  nodeSep: 50,
};

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const opts = { ...defaultOptions, ...options };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: opts.direction,
    ranksep: opts.rankSep,
    nodesep: opts.nodeSep,
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - opts.nodeWidth! / 2,
        y: dagreNode.y - opts.nodeHeight! / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export function getHierarchicalLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const opts = { ...defaultOptions, ...options };

  const mainNodes = nodes.filter((n) => (n.data as any).resolution !== "fog");
  const fogNodes = nodes.filter((n) => (n.data as any).resolution === "fog");

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: opts.direction,
    ranksep: opts.rankSep! * 1.5,
    nodesep: opts.nodeSep! * 1.5,
    marginx: 100,
    marginy: 100,
  });

  mainNodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    });
  });

  const mainEdges = edges.filter(
    (e) =>
      mainNodes.some((n) => n.id === e.source) &&
      mainNodes.some((n) => n.id === e.target)
  );

  mainEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedMainNodes = mainNodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - opts.nodeWidth! / 2,
        y: dagreNode.y - opts.nodeHeight! / 2,
      },
    };
  });

  const layoutedFogNodes = fogNodes.map((fogNode, idx) => {
    const connectedEdge = edges.find(
      (e) => e.target === fogNode.id || e.source === fogNode.id
    );
    const connectedMainNodeId = connectedEdge
      ? connectedEdge.source === fogNode.id
        ? connectedEdge.target
        : connectedEdge.source
      : null;

    const connectedMainNode = layoutedMainNodes.find(
      (n) => n.id === connectedMainNodeId
    );

    if (connectedMainNode) {
      const fogNodesForThisParent = fogNodes.filter((fn) => {
        const edge = edges.find(
          (e) => e.target === fn.id || e.source === fn.id
        );
        return (
          edge &&
          (edge.source === connectedMainNodeId ||
            edge.target === connectedMainNodeId)
        );
      });
      const indexInParent = fogNodesForThisParent.indexOf(fogNode);
      const totalFogForParent = fogNodesForThisParent.length;

      const angleSpread = Math.PI * 0.8;
      const startAngle = Math.PI / 2 - angleSpread / 2;
      const angle =
        totalFogForParent > 1
          ? startAngle + (indexInParent / (totalFogForParent - 1)) * angleSpread
          : Math.PI / 2;

      const distance = 250;

      return {
        ...fogNode,
        position: {
          x: connectedMainNode.position.x + Math.cos(angle) * distance,
          y:
            connectedMainNode.position.y +
            opts.nodeHeight! / 2 +
            Math.sin(angle) * distance,
        },
      };
    } else {
      const cols = 4;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const maxY = Math.max(...layoutedMainNodes.map((n) => n.position.y), 0);

      return {
        ...fogNode,
        position: {
          x: col * (opts.nodeWidth! + 50) + 100,
          y: maxY + opts.nodeHeight! + 200 + row * (opts.nodeHeight! + 50),
        },
      };
    }
  });

  return {
    nodes: [...layoutedMainNodes, ...layoutedFogNodes],
    edges,
  };
}

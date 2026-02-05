"use client";

import { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import type { ExplorationNode, ExplorationLink } from "../page";

interface ForceGraphProps {
  nodes: ExplorationNode[];
  links: ExplorationLink[];
  currentNodeId: string | null;
  onNodeClick?: (nodeId: string) => void;
}

const typeColors: Record<string, string> = {
  character: "#06b6d4", // cyan-500
  location: "#10b981", // emerald-500
  organization: "#f59e0b", // amber-500
  object: "#8b5cf6", // violet-500
  concept: "#a855f7", // purple-500
  technology: "#3b82f6", // blue-500
  event: "#ec4899", // pink-500
  explorer: "#ffffff", // white for the explorer node
};

export function ForceGraph({
  nodes,
  links,
  currentNodeId,
  onNodeClick,
}: ForceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<d3.Simulation<ExplorationNode, ExplorationLink> | null>(null);
  const nodesRef = useRef<ExplorationNode[]>([]);
  const linksRef = useRef<ExplorationLink[]>([]);
  const transformRef = useRef(d3.zoomIdentity);

  // Initialize or update simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Update refs with new data
    nodesRef.current = nodes.map((n) => ({
      ...n,
      x: n.x ?? width / 2 + (Math.random() - 0.5) * 100,
      y: n.y ?? height / 2 + (Math.random() - 0.5) * 100,
    }));

    // Create link objects with proper references
    linksRef.current = links.map((l) => ({
      ...l,
      source: l.source,
      target: l.target,
    }));

    // Create or update simulation
    if (!simulationRef.current) {
      simulationRef.current = d3
        .forceSimulation<ExplorationNode>(nodesRef.current)
        .force(
          "link",
          d3
            .forceLink<ExplorationNode, ExplorationLink>(linksRef.current)
            .id((d) => d.id)
            .distance(80)
        )
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(30))
        .on("tick", render);
    } else {
      // Update existing simulation
      simulationRef.current.nodes(nodesRef.current);
      const linkForce = simulationRef.current.force("link") as d3.ForceLink<
        ExplorationNode,
        ExplorationLink
      >;
      if (linkForce) {
        linkForce.links(linksRef.current);
      }
      simulationRef.current.alpha(0.3).restart();
    }

    function render() {
      if (!ctx || !canvas) return;

      const transform = transformRef.current;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Draw links
      ctx.strokeStyle = "rgba(100, 100, 100, 0.3)";
      ctx.lineWidth = 1;
      linksRef.current.forEach((link) => {
        const source = nodesRef.current.find(
          (n) => n.id === (typeof link.source === "object" ? (link.source as ExplorationNode).id : link.source)
        );
        const target = nodesRef.current.find(
          (n) => n.id === (typeof link.target === "object" ? (link.target as ExplorationNode).id : link.target)
        );
        if (source?.x && source?.y && target?.x && target?.y) {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      });

      // Draw nodes
      nodesRef.current.forEach((node) => {
        if (node.x === undefined || node.y === undefined) return;

        const color = typeColors[node.type] || "#666";
        const isCurrent = node.id === currentNodeId;
        const radius = isCurrent ? 12 : 8;

        // Glow effect for current node
        if (isCurrent) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 20;
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // Border
        ctx.strokeStyle = isCurrent ? "#fff" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = isCurrent ? 2 : 1;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.name, node.x, node.y + radius + 12);
      });

      ctx.restore();
    }

    // Zoom behavior
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        render();
      });

    d3.select(canvas).call(zoom);

    // Click handler
    canvas.onclick = (event) => {
      const rect = canvas.getBoundingClientRect();
      const transform = transformRef.current;
      const x = (event.clientX - rect.left - transform.x) / transform.k;
      const y = (event.clientY - rect.top - transform.y) / transform.k;

      // Find clicked node
      const clickedNode = nodesRef.current.find((node) => {
        if (node.x === undefined || node.y === undefined) return false;
        const dx = x - node.x;
        const dy = y - node.y;
        return Math.sqrt(dx * dx + dy * dy) < 15;
      });

      if (clickedNode && onNodeClick) {
        onNodeClick(clickedNode.id);
      }
    };

    // Initial render
    render();

    return () => {
      simulationRef.current?.stop();
    };
  }, [nodes, links, currentNodeId, onNodeClick]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      simulationRef.current?.alpha(0.1).restart();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full bg-gray-950"
      style={{ cursor: "grab" }}
    />
  );
}

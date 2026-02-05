"use client";

import { useState, useCallback } from "react";
import { Narrative } from "./components/Narrative";
import { ForceGraph } from "./components/ForceGraph";
import { PanelLeftClose, PanelLeft, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExplorationNode {
  id: string;
  name: string;
  type: string;
  x?: number;
  y?: number;
}

export interface ExplorationLink {
  source: string;
  target: string;
  type: string;
}

export interface ExplorationState {
  nodes: ExplorationNode[];
  links: ExplorationLink[];
  currentNodeId: string | null;
  history: string[];
}

export default function ExplorePage() {
  const [showGraph, setShowGraph] = useState(true);
  const [graphState, setGraphState] = useState<ExplorationState>({
    nodes: [],
    links: [],
    currentNodeId: null,
    history: [],
  });

  const addNode = useCallback((node: ExplorationNode) => {
    setGraphState((prev) => {
      // Don't add if already exists
      if (prev.nodes.find((n) => n.id === node.id)) {
        return prev;
      }
      return {
        ...prev,
        nodes: [...prev.nodes, node],
      };
    });
  }, []);

  const addLink = useCallback((link: ExplorationLink) => {
    setGraphState((prev) => {
      // Don't add if already exists
      const exists = prev.links.find(
        (l) => l.source === link.source && l.target === link.target
      );
      if (exists) return prev;
      return {
        ...prev,
        links: [...prev.links, link],
      };
    });
  }, []);

  const setCurrentNode = useCallback((nodeId: string) => {
    setGraphState((prev) => ({
      ...prev,
      currentNodeId: nodeId,
      history: [...prev.history, nodeId],
    }));
  }, []);

  return (
    <div className="h-screen w-screen bg-black text-gray-100 overflow-hidden flex flex-col">
      {/* Minimal header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <Compass className="w-5 h-5 text-cyan-500" />
          <span className="text-sm font-medium text-gray-400">Narrative Loom</span>
        </div>
        <button
          onClick={() => setShowGraph(!showGraph)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-800/50"
        >
          {showGraph ? (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span>Hide Graph</span>
            </>
          ) : (
            <>
              <PanelLeft className="w-4 h-4" />
              <span>Show Graph</span>
            </>
          )}
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Narrative panel */}
        <div
          className={cn(
            "flex-1 flex flex-col transition-all duration-300",
            showGraph ? "w-1/2" : "w-full"
          )}
        >
          <Narrative
            onNodeDiscovered={addNode}
            onLinkDiscovered={addLink}
            onNavigate={setCurrentNode}
            graphState={graphState}
          />
        </div>

        {/* Graph panel */}
        {showGraph && (
          <div className="w-1/2 border-l border-gray-800/50 relative">
            <ForceGraph
              nodes={graphState.nodes}
              links={graphState.links}
              currentNodeId={graphState.currentNodeId}
              onNodeClick={(nodeId) => {
                // Could trigger exploration of that node
                console.log("Clicked node:", nodeId);
              }}
            />
            {/* Graph legend */}
            <div className="absolute bottom-4 left-4 text-xs text-gray-600">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                <span>Character</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Location</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Organization</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                <span>Concept</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

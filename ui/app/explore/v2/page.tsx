"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import {
  Sparkles,
  Eye,
  Image as ImageIcon,
  FileText,
  GitBranch,
  Compass,
  Loader2,
  ChevronRight,
  MessageCircle,
  Send,
  Link2,
  HelpCircle,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

// Resolution states for entities
type Resolution = "fog" | "attending" | "crystallized";

interface ExplorationEntity {
  id: string;
  name: string;
  type: string;
  description?: string;
  resolution: Resolution;
  imageUrl?: string;
  x?: number;
  y?: number;
  // Full generated document/lore
  fullDocument?: string;
  // Potential connections - things we sense but haven't explored
  potentialConnections?: Array<{
    hint: string; // "something about their past"
    direction: string; // "before", "below", "connected to"
  }>;
  // Questions the AI suggests exploring
  questions?: string[];
  // Hints from fog state
  hint?: string;
  connectedTo?: string;
}

interface ExplorationLink {
  source: string;
  target: string;
  type: string;
  resolution: Resolution;
}

interface Perception {
  text: string;
  timestamp: number;
  type: "sensing" | "discovery" | "insight" | "question";
}

export default function FogExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [entities, setEntities] = useState<ExplorationEntity[]>([]);
  const [links, setLinks] = useState<ExplorationLink[]>([]);
  const [focusedEntity, setFocusedEntity] = useState<ExplorationEntity | null>(null);
  const [perceptions, setPerceptions] = useState<Perception[]>([]);
  const [currentProse, setCurrentProse] = useState<string>("");
  const [isAttending, setIsAttending] = useState(false);
  const [isCrystallizing, setIsCrystallizing] = useState(false);
  const [showProse, setShowProse] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [isExploring, setIsExploring] = useState(false);
  const simulationRef = useRef<d3.Simulation<ExplorationEntity, ExplorationLink> | null>(null);
  const validLinksRef = useRef<ExplorationLink[]>([]);

  // Colors based on resolution and type
  const getNodeColor = (entity: ExplorationEntity) => {
    const baseColors: Record<string, string> = {
      character: "#06b6d4",
      location: "#10b981",
      organization: "#f59e0b",
      object: "#8b5cf6",
      concept: "#ec4899",
      event: "#3b82f6",
    };
    const base = baseColors[entity.type] || "#666";

    switch (entity.resolution) {
      case "fog": return `${base}33`; // Very transparent
      case "attending": return `${base}88`; // Semi-transparent
      case "crystallized": return base; // Full color
    }
  };

  const getNodeRadius = (entity: ExplorationEntity) => {
    switch (entity.resolution) {
      case "fog": return 15;
      case "attending": return 20;
      case "crystallized": return 25;
    }
  };

  // Initialize the canvas and simulation
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

    let transform = d3.zoomIdentity;

    // Filter links to only include those where both source and target exist
    const entityIds = new Set(entities.map(e => e.id));
    const validLinks = links.filter(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as any)?.id;
      const targetId = typeof l.target === 'string' ? l.target : (l.target as any)?.id;
      return entityIds.has(sourceId) && entityIds.has(targetId);
    });
    validLinksRef.current = validLinks;

    // Create simulation
    simulationRef.current = d3
      .forceSimulation<ExplorationEntity>(entities)
      .force("link", d3.forceLink<ExplorationEntity, ExplorationLink>(validLinks).id(d => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => getNodeRadius(d as ExplorationEntity) + 10))
      .on("tick", render);

    function render() {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Draw fog/ambient background particles
      drawFogParticles(ctx, width, height, transform);

      // Draw links with resolution-based opacity
      // After d3 processes links, source/target become node objects
      validLinksRef.current.forEach(link => {
        const sourceNode = typeof link.source === 'object' ? link.source as ExplorationEntity : entities.find(e => e.id === link.source);
        const targetNode = typeof link.target === 'object' ? link.target as ExplorationEntity : entities.find(e => e.id === link.target);
        if (!sourceNode?.x || !sourceNode?.y || !targetNode?.x || !targetNode?.y) return;

        const opacity = link.resolution === "crystallized" ? 0.6 :
                       link.resolution === "attending" ? 0.3 : 0.15;

        ctx.strokeStyle = `rgba(100, 200, 255, ${opacity})`;
        ctx.lineWidth = link.resolution === "crystallized" ? 2 : 1;
        ctx.setLineDash(link.resolution === "fog" ? [5, 5] : []);

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Draw potential connections as question marks in the fog
      entities.forEach(entity => {
        if (!entity.x || !entity.y || !entity.potentialConnections) return;

        entity.potentialConnections.forEach((potential, i) => {
          const angle = (i / entity.potentialConnections!.length) * Math.PI * 2;
          const distance = 80;
          const px = entity.x! + Math.cos(angle) * distance;
          const py = entity.y! + Math.sin(angle) * distance;

          // Pulsing question mark
          const pulse = Math.sin(Date.now() / 500 + i) * 0.3 + 0.7;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.2 * pulse})`;
          ctx.font = "16px Inter";
          ctx.textAlign = "center";
          ctx.fillText("?", px, py);
        });
      });

      // Draw nodes
      entities.forEach(entity => {
        if (!entity.x || !entity.y) return;

        const radius = getNodeRadius(entity);
        const color = getNodeColor(entity);
        const isFocused = focusedEntity?.id === entity.id;

        // Glow for crystallized or focused
        if (entity.resolution === "crystallized" || isFocused) {
          ctx.shadowColor = color;
          ctx.shadowBlur = isFocused ? 30 : 15;
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(entity.x, entity.y, radius, 0, Math.PI * 2);

        // Fog nodes are just outlines
        if (entity.resolution === "fog") {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.fill();
        }

        // Crystallized with image get a special treatment
        if (entity.resolution === "crystallized" && entity.imageUrl) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.shadowBlur = 0;

        // Labels
        const labelOpacity = entity.resolution === "fog" ? 0.3 :
                            entity.resolution === "attending" ? 0.6 : 0.9;
        ctx.fillStyle = `rgba(255, 255, 255, ${labelOpacity})`;
        ctx.font = entity.resolution === "crystallized" ? "bold 12px Inter" : "11px Inter";
        ctx.textAlign = "center";
        ctx.fillText(
          entity.resolution === "fog" ? "???" : entity.name,
          entity.x,
          entity.y + radius + 16
        );
      });

      ctx.restore();
    }

    function drawFogParticles(ctx: CanvasRenderingContext2D, w: number, h: number, t: d3.ZoomTransform) {
      const time = Date.now() / 2000;
      for (let i = 0; i < 50; i++) {
        const x = (Math.sin(time + i * 0.5) * 0.5 + 0.5) * w;
        const y = (Math.cos(time * 0.7 + i * 0.3) * 0.5 + 0.5) * h;
        const alpha = Math.sin(time + i) * 0.02 + 0.03;
        ctx.fillStyle = `rgba(100, 150, 200, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 50 + Math.sin(time + i) * 20, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Zoom
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.2, 3])
      .on("zoom", (event) => {
        transform = event.transform;
        render();
      });

    d3.select(canvas).call(zoom);

    // Click handler
    canvas.onclick = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left - transform.x) / transform.k;
      const y = (event.clientY - rect.top - transform.y) / transform.k;

      const clicked = entities.find(entity => {
        if (!entity.x || !entity.y) return false;
        const dx = x - entity.x;
        const dy = y - entity.y;
        return Math.sqrt(dx * dx + dy * dy) < getNodeRadius(entity) + 5;
      });

      if (clicked) {
        setFocusedEntity(clicked);
        if (clicked.resolution === "fog") {
          attendToEntity(clicked);
        }
      } else {
        setFocusedEntity(null);
      }
    };

    // Animation loop for fog particles
    const animate = () => {
      render();
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      simulationRef.current?.stop();
    };
  }, [entities, links, focusedEntity]);

  // Update simulation when entities/links change
  useEffect(() => {
    if (simulationRef.current) {
      // Filter links to only valid ones
      const entityIds = new Set(entities.map(e => e.id));
      const validLinks = links.filter(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as any)?.id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as any)?.id;
        return entityIds.has(sourceId) && entityIds.has(targetId);
      });
      validLinksRef.current = validLinks;

      simulationRef.current.nodes(entities);
      const linkForce = simulationRef.current.force("link") as d3.ForceLink<ExplorationEntity, ExplorationLink>;
      if (linkForce) linkForce.links(validLinks);
      simulationRef.current.alpha(0.3).restart();
    }
  }, [entities, links]);

  // Attend to an entity - start resolving it from fog
  const attendToEntity = async (entity: ExplorationEntity) => {
    setIsAttending(true);
    addPerception({ text: `Let's develop this further...`, type: "sensing" });

    // Update to attending state
    setEntities(prev => prev.map(e =>
      e.id === entity.id ? { ...e, resolution: "attending" as Resolution } : e
    ));

    try {
      const response = await fetch("http://localhost:3088/api/explore/attend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: entity.id,
          context: {
            knownEntities: entities.filter(e => e.resolution !== "fog").map(e => ({
              id: e.id, name: e.name, type: e.type
            }))
          }
        })
      });

      if (!response.ok) throw new Error("Failed to attend");

      const data = await response.json();

      // Update entity with resolved information
      setEntities(prev => prev.map(e =>
        e.id === entity.id ? {
          ...e,
          name: data.name || e.name,
          description: data.description,
          resolution: "attending" as Resolution,
          potentialConnections: data.potentialConnections
        } : e
      ));

      // Add any newly sensed entities as fog
      if (data.sensedEntities) {
        const newFogEntities = data.sensedEntities.map((se: any) => ({
          id: se.id,
          name: "???",
          type: se.type || "unknown",
          resolution: "fog" as Resolution,
          hint: se.hint
        }));
        setEntities(prev => [...prev, ...newFogEntities]);
      }

      // Add new links
      if (data.sensedConnections) {
        const newLinks = data.sensedConnections.map((sc: any) => ({
          source: sc.source,
          target: sc.target,
          type: sc.type,
          resolution: "fog" as Resolution
        }));
        setLinks(prev => [...prev, ...newLinks]);
      }

      addPerception({ text: data.perception || `${data.name} emerges from the fog.`, type: "discovery" });
      setFocusedEntity({ ...entity, ...data, resolution: "attending" });

    } catch (error) {
      console.error("Attend error:", error);
      addPerception({ text: "Hmm, that didn't work. Try something else?", type: "sensing" });
    } finally {
      setIsAttending(false);
    }
  };

  // Crystallize an entity - make it permanent with artifacts
  const crystallizeEntity = async (type: "portrait" | "document" | "full") => {
    if (!focusedEntity) return;
    setIsCrystallizing(true);
    addPerception({ text: `Making ${focusedEntity.name} more concrete...`, type: "insight" });

    try {
      const response = await fetch("http://localhost:3088/api/explore/crystallize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: focusedEntity.id,
          entity: focusedEntity,
          type
        })
      });

      if (!response.ok) throw new Error("Failed to crystallize");

      const data = await response.json();

      // Update entity to crystallized
      setEntities(prev => prev.map(e =>
        e.id === focusedEntity.id ? {
          ...e,
          resolution: "crystallized" as Resolution,
          imageUrl: data.imageUrl,
          description: data.description || e.description
        } : e
      ));

      // Update links connected to this entity
      setLinks(prev => prev.map(l =>
        (l.source === focusedEntity.id || l.target === focusedEntity.id)
          ? { ...l, resolution: "crystallized" as Resolution }
          : l
      ));

      addPerception({
        text: `${focusedEntity.name} is now fleshed out!`,
        type: "discovery"
      });

      setFocusedEntity(prev => prev ? { ...prev, resolution: "crystallized", imageUrl: data.imageUrl } : null);

    } catch (error) {
      console.error("Crystallize error:", error);
      addPerception({ text: "Couldn't generate that. Try again?", type: "sensing" });
    } finally {
      setIsCrystallizing(false);
    }
  };

  // Start exploration
  const startExploration = async (seed?: string) => {
    addPerception({ text: "Let's see what we can build...", type: "sensing" });

    try {
      const response = await fetch("http://localhost:3088/api/explore/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed })
      });

      if (!response.ok) throw new Error("Failed to start");
      const data = await response.json();

      // Store the prose
      setCurrentProse(data.prose || "");

      // Create initial entities from exploration
      const initialEntities: ExplorationEntity[] = data.entities.map((e: any) => ({
        ...e,
        resolution: "attending" as Resolution
      }));

      // Add fog entities for potential connections
      const fogEntities: ExplorationEntity[] = (data.potentialEntities || []).map((e: any, idx: number) => {
        const id = e.id || `fog_${Date.now()}_${idx}`;
        // Connect to a random main entity if not specified
        const connectedTo = e.connectedTo || (initialEntities.length > 0 ? initialEntities[idx % initialEntities.length].id : null);
        return {
          id,
          name: "???",
          type: e.type || "unknown",
          resolution: "fog" as Resolution,
          hint: e.hint,
          connectedTo
        };
      });

      const allEntities = [...initialEntities, ...fogEntities];
      setEntities(allEntities);

      // Add main relationships
      const mainLinks: ExplorationLink[] = (data.relationships || []).map((r: any) => ({
        source: r.source,
        target: r.target,
        type: r.type || "related_to",
        resolution: "attending" as Resolution
      }));

      // Add links for potential entities (from API)
      const potentialLinks: ExplorationLink[] = (data.potentialRelationships || []).map((r: any) => ({
        source: r.source,
        target: r.target,
        type: r.type || "connected_to",
        resolution: "fog" as Resolution
      }));

      // Create fog links from connectedTo field
      const fogLinks: ExplorationLink[] = fogEntities
        .filter((f) => f.connectedTo)
        .map((f) => ({
          source: f.connectedTo!,
          target: f.id,
          type: "potential",
          resolution: "fog" as Resolution
        }));

      // Combine all links and filter to only valid ones
      const allLinks = [...mainLinks, ...potentialLinks, ...fogLinks];
      const entityIds = new Set(allEntities.map(e => e.id));
      const validLinks = allLinks.filter(l => entityIds.has(l.source) && entityIds.has(l.target));

      console.log('Created entities:', allEntities.map(e => e.id));
      console.log('Created links:', validLinks);

      setLinks(validLinks);

      // Set AI questions from the exploration
      if (data.choices) {
        setAiQuestions(data.choices);
      }

      addPerception({ text: data.perception || "Let's explore this world.", type: "discovery" });

    } catch (error) {
      console.error("Start error:", error);
      addPerception({ text: "Something went wrong. Try again?", type: "sensing" });
    }
  };

  const addPerception = (p: Omit<Perception, "timestamp">) => {
    setPerceptions(prev => [...prev, { ...p, timestamp: Date.now() }]);
  };

  // Explore via chat - conversational exploration
  const exploreViaChat = async (prompt: string) => {
    if (!prompt.trim() || isExploring) return;

    setIsExploring(true);
    setChatInput("");
    addPerception({ text: `You: "${prompt}"`, type: "question" });

    try {
      const response = await fetch("http://localhost:3088/api/explore/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: prompt,
          context: {
            currentNode: focusedEntity?.id,
            history: perceptions.slice(-5).map(p => p.text),
            knownEntities: entities.filter(e => e.resolution !== "fog").map(e => ({
              id: e.id, name: e.name, type: e.type, description: e.description
            }))
          }
        })
      });

      if (!response.ok) throw new Error("Failed to explore");
      const data = await response.json();

      // Update prose
      if (data.prose) {
        setCurrentProse(data.prose);
      }

      // Add new entities
      if (data.entities && data.entities.length > 0) {
        const newEntities = data.entities.map((e: any) => ({
          ...e,
          resolution: "attending" as Resolution
        }));
        setEntities(prev => {
          const existingIds = new Set(prev.map(e => e.id));
          const unique = newEntities.filter((e: ExplorationEntity) => !existingIds.has(e.id));
          return [...prev, ...unique];
        });

        addPerception({
          text: `Discovered: ${data.entities.map((e: any) => e.name).join(", ")}`,
          type: "discovery"
        });
      }

      // Add new relationships
      if (data.relationships && data.relationships.length > 0) {
        const newLinks = data.relationships.map((r: any) => ({
          ...r,
          resolution: "attending" as Resolution
        }));
        setLinks(prev => [...prev, ...newLinks]);
      }

      // Show choices/questions
      if (data.choices && data.choices.length > 0) {
        setAiQuestions(data.choices);
      }

      addPerception({ text: "The world expands...", type: "insight" });

    } catch (error) {
      console.error("Explore error:", error);
      addPerception({ text: "Hmm, that didn't work. Try something else?", type: "sensing" });
    } finally {
      setIsExploring(false);
    }
  };

  // Sense around the current focus
  const sense = async () => {
    if (!focusedEntity) {
      addPerception({ text: "Focus on something first.", type: "question" });
      return;
    }

    addPerception({ text: `What else connects to ${focusedEntity.name}?`, type: "sensing" });

    try {
      const response = await fetch("http://localhost:3088/api/explore/sense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          focusId: focusedEntity.id,
          context: {
            knownEntities: entities.filter(e => e.resolution !== "fog").map(e => ({
              id: e.id, name: e.name, type: e.type
            }))
          }
        })
      });

      if (!response.ok) throw new Error("Failed to sense");
      const data = await response.json();

      // Add sensed fog entities
      if (data.sensedEntities && data.sensedEntities.length > 0) {
        const newFog: ExplorationEntity[] = data.sensedEntities.map((e: any, idx: number) => ({
          id: e.id || `fog_${Date.now()}_${idx}`,
          name: "???",
          type: e.type || "unknown",
          resolution: "fog" as Resolution,
          hint: e.hint,
          connectedTo: focusedEntity.id
        }));

        // Only add entities that don't already exist
        setEntities(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const unique = newFog.filter(n => !existingIds.has(n.id));
          return [...prev, ...unique];
        });

        // Add fog links from focused entity to new fog entities
        const newLinks: ExplorationLink[] = data.sensedEntities.map((e: any, idx: number) => ({
          source: focusedEntity.id,
          target: newFog[idx].id,
          type: e.relationshipHint || "potential",
          resolution: "fog" as Resolution
        }));

        setLinks(prev => [...prev, ...newLinks]);
        console.log('Sensed new entities:', newFog.map(e => e.id));
        console.log('Added links:', newLinks);
      }

      // Capture AI questions
      if (data.questions && data.questions.length > 0) {
        setAiQuestions(prev => [...prev, ...data.questions].slice(-6));
      }

      addPerception({ text: data.perception, type: "sensing" });

    } catch (error) {
      console.error("Sense error:", error);
      addPerception({ text: "Couldn't find new connections. Try exploring something else?", type: "sensing" });
    }
  };

  return (
    <div className="h-screen w-screen bg-black text-gray-100 flex overflow-hidden">
      {/* Main fog canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ cursor: focusedEntity ? "pointer" : "grab" }}
        />

        {/* Welcome overlay when empty */}
        {entities.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-6 max-w-lg">
              <Compass className="w-16 h-16 mx-auto text-cyan-500/50" />
              <h1 className="text-2xl font-light text-gray-300">World Explorer</h1>
              <p className="text-gray-500 text-sm leading-relaxed">
                Build worlds together. Explore ideas. Generate characters,
                places, stories, anomalies, artifacts. Make things real.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="A haunted lighthouse, a corporate conspiracy, a magical artifact..."
                  className="w-full px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-800 text-gray-300 placeholder-gray-600 text-center"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.currentTarget.value) {
                      startExploration(e.currentTarget.value);
                    }
                  }}
                />
                <button
                  onClick={() => startExploration()}
                  className="w-full px-6 py-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >
                  Surprise Me
                </button>
              </div>
              <div className="pt-4 border-t border-gray-800/50">
                <p className="text-xs text-gray-600 mb-3">Or try one of these:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {["SCP Foundation breach", "Space opera crew", "Noir detective story", "Fantasy tavern", "Corporate dystopia"].map(seed => (
                    <button
                      key={seed}
                      onClick={() => startExploration(seed)}
                      className="px-3 py-1.5 text-xs rounded-full bg-gray-800/50 text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                    >
                      {seed}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Node Button - floating */}
        {entities.length > 0 && (
          <div className="absolute top-4 left-4 flex gap-2">
            <button
              onClick={() => {
                const prompt = window.prompt("What would you like to add? (character, location, object, concept...)");
                if (prompt) {
                  exploreViaChat(`Create a new element: ${prompt}`);
                }
              }}
              className="px-3 py-2 rounded-lg bg-gray-900/80 backdrop-blur-sm border border-gray-700 text-gray-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors text-sm flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Add Element
            </button>
            <button
              onClick={() => {
                setEntities([]);
                setLinks([]);
                setPerceptions([]);
                setAiQuestions([]);
                setCurrentProse("");
                setFocusedEntity(null);
              }}
              className="px-3 py-2 rounded-lg bg-gray-900/80 backdrop-blur-sm border border-gray-700 text-gray-500 hover:text-gray-300 transition-colors text-sm"
            >
              Reset
            </button>
          </div>
        )}

        {/* Prose panel - bottom left, toggleable */}
        {showProse && currentProse && (
          <div className="absolute bottom-4 left-4 right-[340px] max-h-[40%] overflow-y-auto">
            <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg border border-gray-800 p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-xs font-medium text-gray-500">Current Scene</h4>
                <button
                  onClick={() => setShowProse(false)}
                  className="text-xs text-gray-600 hover:text-gray-400"
                >
                  Hide
                </button>
              </div>
              <div className="prose prose-sm prose-invert max-w-none">
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{currentProse}</p>
              </div>
            </div>
          </div>
        )}

        {/* Show prose button when hidden */}
        {!showProse && currentProse && (
          <button
            onClick={() => setShowProse(true)}
            className="absolute bottom-4 left-4 px-3 py-2 bg-gray-900/80 rounded-lg border border-gray-800 text-xs text-gray-400 hover:text-gray-200"
          >
            Show Scene
          </button>
        )}

        {/* AI perception stream - above prose */}
        <div className="absolute bottom-4 left-4 max-w-md space-y-2" style={{ bottom: showProse && currentProse ? 'calc(40% + 24px)' : '16px' }}>
          {perceptions.slice(-3).map((p, i) => (
            <div
              key={p.timestamp}
              className={cn(
                "px-4 py-2 rounded-lg text-sm backdrop-blur-sm transition-opacity",
                p.type === "sensing" && "bg-blue-500/10 text-blue-300 border border-blue-500/20",
                p.type === "discovery" && "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
                p.type === "insight" && "bg-purple-500/10 text-purple-300 border border-purple-500/20",
                p.type === "question" && "bg-amber-500/10 text-amber-300 border border-amber-500/20",
                i < perceptions.slice(-3).length - 1 && "opacity-40"
              )}
            >
              <span className="text-xs opacity-60 mr-2">AI:</span>
              {p.text}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - Focus & Tools */}
      <div className="w-96 border-l border-gray-800/50 flex flex-col bg-gray-950/50 backdrop-blur-sm">
        {/* Focused entity - Enhanced detail panel */}
        {focusedEntity ? (
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-gray-800/50">
              <div className="flex items-start gap-3">
                {focusedEntity.imageUrl ? (
                  <img
                    src={focusedEntity.imageUrl}
                    alt={focusedEntity.name}
                    className="w-20 h-20 rounded-lg object-cover border border-gray-700"
                  />
                ) : (
                  <div className={cn(
                    "w-20 h-20 rounded-lg flex items-center justify-center border shrink-0",
                    focusedEntity.resolution === "fog" && "border-gray-700 border-dashed",
                    focusedEntity.resolution === "attending" && "border-gray-600 bg-gray-800/50",
                    focusedEntity.resolution === "crystallized" && "border-cyan-500/50 bg-cyan-500/10"
                  )}>
                    <Sparkles className={cn(
                      "w-8 h-8",
                      focusedEntity.resolution === "fog" && "text-gray-600",
                      focusedEntity.resolution === "attending" && "text-gray-400",
                      focusedEntity.resolution === "crystallized" && "text-cyan-400"
                    )} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-100 text-lg">
                    {focusedEntity.resolution === "fog" ? "???" : focusedEntity.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full capitalize",
                      focusedEntity.type === "character" && "bg-cyan-500/20 text-cyan-400",
                      focusedEntity.type === "location" && "bg-green-500/20 text-green-400",
                      focusedEntity.type === "organization" && "bg-amber-500/20 text-amber-400",
                      focusedEntity.type === "object" && "bg-purple-500/20 text-purple-400",
                      focusedEntity.type === "concept" && "bg-pink-500/20 text-pink-400",
                      !["character", "location", "organization", "object", "concept"].includes(focusedEntity.type) && "bg-gray-500/20 text-gray-400"
                    )}>
                      {focusedEntity.type}
                    </span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      focusedEntity.resolution === "fog" && "bg-gray-700/50 text-gray-500",
                      focusedEntity.resolution === "attending" && "bg-blue-500/20 text-blue-400",
                      focusedEntity.resolution === "crystallized" && "bg-emerald-500/20 text-emerald-400"
                    )}>
                      {focusedEntity.resolution}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Full Description */}
            <div className="p-4 border-b border-gray-800/50">
              {focusedEntity.resolution === "fog" ? (
                <div className="text-gray-600 italic text-sm">
                  {focusedEntity.hint || "An undefined possibility. Click 'Develop This' to explore what it could be."}
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Description</h4>
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {focusedEntity.description || "No description yet."}
                  </p>
                </div>
              )}
            </div>

            {/* Relationships */}
            {focusedEntity.resolution !== "fog" && (
              <div className="p-4 border-b border-gray-800/50">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Link2 className="w-3 h-3" />
                  Connected To
                </h4>
                <div className="space-y-2">
                  {links
                    .filter(l => {
                      const sourceId = typeof l.source === 'string' ? l.source : (l.source as any)?.id;
                      const targetId = typeof l.target === 'string' ? l.target : (l.target as any)?.id;
                      return sourceId === focusedEntity.id || targetId === focusedEntity.id;
                    })
                    .map((link, i) => {
                      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any)?.id;
                      const targetId = typeof link.target === 'string' ? link.target : (link.target as any)?.id;
                      const otherId = sourceId === focusedEntity.id ? targetId : sourceId;
                      const otherEntity = entities.find(e => e.id === otherId);
                      return (
                        <button
                          key={i}
                          onClick={() => otherEntity && setFocusedEntity(otherEntity)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                            otherEntity?.resolution === "fog"
                              ? "bg-gray-800/30 text-gray-500 border border-dashed border-gray-700"
                              : "bg-gray-800/50 text-gray-300 hover:bg-gray-700/50"
                          )}
                        >
                          <span className="text-xs text-gray-600">{link.type}</span>
                          <ChevronRight className="w-3 h-3 text-gray-600" />
                          <span>{otherEntity?.resolution === "fog" ? "???" : otherEntity?.name || otherId}</span>
                        </button>
                      );
                    })}
                  {links.filter(l => {
                    const sourceId = typeof l.source === 'string' ? l.source : (l.source as any)?.id;
                    const targetId = typeof l.target === 'string' ? l.target : (l.target as any)?.id;
                    return sourceId === focusedEntity.id || targetId === focusedEntity.id;
                  }).length === 0 && (
                    <p className="text-xs text-gray-600 italic">No connections yet. Use 'Find Connections' to discover more.</p>
                  )}
                </div>
              </div>
            )}

            {/* Potential connections / Ideas */}
            {focusedEntity.potentialConnections && focusedEntity.potentialConnections.length > 0 && (
              <div className="p-4 border-b border-gray-800/50">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Zap className="w-3 h-3" />
                  Ideas to Explore
                </h4>
                <div className="space-y-2">
                  {focusedEntity.potentialConnections.map((pc, i) => (
                    <button
                      key={i}
                      onClick={() => exploreViaChat(pc.hint)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors"
                    >
                      <ChevronRight className="w-3 h-3 inline mr-2" />
                      {pc.hint}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="p-4 space-y-2">
              {focusedEntity.resolution === "fog" && (
                <button
                  onClick={() => attendToEntity(focusedEntity)}
                  disabled={isAttending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 font-medium"
                >
                  {isAttending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Develop This
                </button>
              )}

              {focusedEntity.resolution === "attending" && (
                <>
                  <button
                    onClick={() => crystallizeEntity("document")}
                    disabled={isCrystallizing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 font-medium"
                  >
                    {isCrystallizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Generate Full Document
                  </button>
                  <button
                    onClick={() => crystallizeEntity("portrait")}
                    disabled={isCrystallizing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                  >
                    {isCrystallizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    Generate Portrait
                  </button>
                </>
              )}

              {focusedEntity.resolution !== "fog" && (
                <button
                  onClick={sense}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-gray-400 hover:bg-gray-700/50 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Find Connections
                </button>
              )}
            </div>
          </div>
        ) : (
          /* No entity focused - show AI conversation panel */
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-gray-800/50">
              <h3 className="font-medium text-gray-300 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-cyan-400" />
                Co-Explore
              </h3>
              <p className="text-xs text-gray-600 mt-1">Click a node to focus, or ask me anything about this world</p>
            </div>

            {/* AI Questions/Suggestions */}
            {aiQuestions.length > 0 && (
              <div className="p-4 border-b border-gray-800/50">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <HelpCircle className="w-3 h-3" />
                  Explore These
                </h4>
                <div className="space-y-2">
                  {aiQuestions.slice(0, 4).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => exploreViaChat(q)}
                      disabled={isExploring}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent perceptions */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {perceptions.slice(-8).map((p) => (
                <div
                  key={p.timestamp}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm",
                    p.type === "question" && "bg-gray-800/30 text-gray-400",
                    p.type === "sensing" && "bg-blue-500/10 text-blue-300",
                    p.type === "discovery" && "bg-emerald-500/10 text-emerald-300",
                    p.type === "insight" && "bg-purple-500/10 text-purple-300"
                  )}
                >
                  {p.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat Input */}
        <div className="p-4 border-t border-gray-800/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (chatInput.trim()) {
                exploreViaChat(chatInput);
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Explore something..."
              disabled={isExploring}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-700 text-gray-300 placeholder-gray-600 text-sm focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isExploring || !chatInput.trim()}
              className="px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
            >
              {isExploring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Quick List of All Entities */}
        {entities.length > 0 && (
          <div className="max-h-48 overflow-y-auto border-t border-gray-800/50">
            <div className="p-3 space-y-1">
              {entities.filter(e => e.resolution !== "fog").map(entity => (
                <button
                  key={entity.id}
                  onClick={() => setFocusedEntity(entity)}
                  className={cn(
                    "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-2",
                    focusedEntity?.id === entity.id
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/30"
                  )}
                >
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    entity.resolution === "crystallized" && "bg-emerald-500",
                    entity.resolution === "attending" && "bg-blue-400"
                  )} />
                  <span className="truncate">{entity.name}</span>
                  <span className="text-gray-600 ml-auto">{entity.type}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="p-3 border-t border-gray-800/50 text-xs text-gray-600">
          <div className="flex justify-between">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-600" />
              {entities.filter(e => e.resolution === "fog").length} unexplored
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              {entities.filter(e => e.resolution === "attending").length} developing
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {entities.filter(e => e.resolution === "crystallized").length} complete
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

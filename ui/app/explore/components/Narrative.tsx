"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Sparkles, RotateCcw } from "lucide-react";
import type { ExplorationNode, ExplorationLink, ExplorationState } from "../page";
import { cn } from "@/lib/utils";

interface NarrativeProps {
  onNodeDiscovered: (node: ExplorationNode) => void;
  onLinkDiscovered: (link: ExplorationLink) => void;
  onNavigate: (nodeId: string) => void;
  graphState: ExplorationState;
}

interface Message {
  id: string;
  role: "user" | "narrator" | "system";
  content: string;
  choices?: string[];
  isStreaming?: boolean;
}

export function Narrative({
  onNodeDiscovered,
  onLinkDiscovered,
  onNavigate,
  graphState,
}: NarrativeProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isExploring, setIsExploring] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startExploration = async (seed?: string) => {
    setHasStarted(true);
    setIsExploring(true);

    // Add initial system message
    const systemId = `sys-${Date.now()}`;
    setMessages([
      {
        id: systemId,
        role: "system",
        content: "Initializing narrative space...",
      },
    ]);

    try {
      const response = await fetch("http://localhost:3088/api/explore/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: seed || "Begin exploration" }),
      });

      if (!response.ok) throw new Error("Failed to start exploration");

      const data = await response.json();

      // Add narrator message with prose
      setMessages([
        {
          id: `narr-${Date.now()}`,
          role: "narrator",
          content: data.prose,
          choices: data.choices,
        },
      ]);

      // Add discovered entities to graph
      if (data.entities) {
        data.entities.forEach((entity: ExplorationNode) => {
          onNodeDiscovered(entity);
        });
      }

      // Add discovered relationships
      if (data.relationships) {
        data.relationships.forEach((rel: ExplorationLink) => {
          onLinkDiscovered(rel);
        });
      }

      // Set current location
      if (data.currentNode) {
        onNavigate(data.currentNode);
      }
    } catch (error) {
      console.error("Exploration error:", error);
      setMessages([
        {
          id: `err-${Date.now()}`,
          role: "system",
          content: "The narrative threads are tangled. Try again.",
        },
      ]);
    } finally {
      setIsExploring(false);
    }
  };

  const explore = async (action: string) => {
    if (!action.trim() || isExploring) return;

    setIsExploring(true);
    const userMsgId = `user-${Date.now()}`;
    const narratorMsgId = `narr-${Date.now()}`;

    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: action },
      { id: narratorMsgId, role: "narrator", content: "", isStreaming: true },
    ]);

    setInput("");

    try {
      const response = await fetch("http://localhost:3088/api/explore/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          context: {
            currentNode: graphState.currentNodeId,
            history: graphState.history.slice(-10),
            knownEntities: graphState.nodes.map((n) => ({
              id: n.id,
              name: n.name,
              type: n.type,
            })),
          },
        }),
      });

      if (!response.ok) throw new Error("Failed to explore");

      // For streaming, we'd use response.body.getReader()
      // For now, simple JSON response
      const data = await response.json();

      // Update narrator message with full prose
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === narratorMsgId
            ? { ...msg, content: data.prose, choices: data.choices, isStreaming: false }
            : msg
        )
      );

      // Add new entities to graph
      if (data.entities) {
        data.entities.forEach((entity: ExplorationNode) => {
          onNodeDiscovered(entity);
        });
      }

      // Add new relationships
      if (data.relationships) {
        data.relationships.forEach((rel: ExplorationLink) => {
          onLinkDiscovered(rel);
        });
      }

      // Update current location
      if (data.currentNode) {
        onNavigate(data.currentNode);
      }
    } catch (error) {
      console.error("Exploration error:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === narratorMsgId
            ? {
                ...msg,
                content: "The threads of narrative slip through your fingers. Try a different approach.",
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsExploring(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      explore(input);
    }
  };

  const handleChoice = (choice: string) => {
    explore(choice);
  };

  // Welcome screen
  if (!hasStarted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-md text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-light text-gray-200">Narrative Loom</h1>
          <p className="text-gray-500 leading-relaxed">
            Explore the latent space of story. Every path branches into possibility.
            Every discovery shapes the map of what could be.
          </p>
          <div className="space-y-3 pt-4">
            <button
              onClick={() => startExploration()}
              className="w-full px-6 py-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
            >
              Begin Exploration
            </button>
            <input
              type="text"
              placeholder="Or enter a seed concept..."
              className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-700"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  startExploration(e.currentTarget.value);
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((message) => (
          <div key={message.id} className="space-y-3">
            {message.role === "user" && (
              <div className="flex justify-end">
                <div className="max-w-[80%] px-4 py-2 rounded-2xl rounded-br-sm bg-cyan-500/20 text-cyan-100">
                  {message.content}
                </div>
              </div>
            )}

            {message.role === "narrator" && (
              <div className="space-y-4">
                <div
                  className={cn(
                    "prose prose-invert prose-sm max-w-none",
                    "text-gray-300 leading-relaxed",
                    message.isStreaming && "animate-pulse"
                  )}
                >
                  {message.content || (
                    <span className="text-gray-500">Weaving narrative threads...</span>
                  )}
                </div>

                {/* Choices */}
                {message.choices && message.choices.length > 0 && !isExploring && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {message.choices.map((choice, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleChoice(choice)}
                        className="px-4 py-2 text-sm rounded-lg bg-gray-800/50 border border-gray-700/50 text-gray-300 hover:bg-gray-700/50 hover:border-gray-600 transition-colors"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {message.role === "system" && (
              <div className="text-center text-sm text-gray-600 italic">
                {message.content}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-gray-800/50">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you explore?"
            disabled={isExploring}
            className="flex-1 px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-800 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-700 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isExploring || !input.trim()}
            className="px-4 py-3 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExploring ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        <div className="flex justify-between items-center mt-2 px-1">
          <button
            onClick={() => {
              setMessages([]);
              setHasStarted(false);
            }}
            className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          <span className="text-xs text-gray-700">
            {graphState.nodes.length} discoveries
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * WorldChat — the AI agent at the WORLD level (the master view's soul).
 *
 * Collapsed: a bottom quick-bar (type → Enter → the agent works; last reply
 * peeks). Expanded: a right-side panel with the conversation and tool
 * activity. Hits the same /chat brain as the studio with NO phase scoping —
 * the agent holds ALL tools here (world building, events with proper
 * metadata, entity generation, image work, vibe exploration unattached to
 * entities, productions, arcs…). After every turn the World view refreshes:
 * whatever the agent changed appears on the timeline immediately.
 */

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, MessageSquare, X, Wrench, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  tools?: Array<{ tool: string }>;
}

interface WorldChatProps {
  projectId: string | null;
  /** Called after every agent turn — the agent may have changed the world. */
  onWorldChanged?: () => void;
}

export function WorldChat({ projectId, onWorldChanged }: WorldChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isOpen]);

  const send = async () => {
    const message = input.trim();
    if (!message || isBusy || !projectId) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: message }]);
    setIsBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No selection/activeRow → the agent gets its FULL toolset here.
        body: JSON.stringify({ projectId, message }),
      });
      if (res.ok) {
        const data = await res.json();
        const toolSteps = (data.toolUsage?.steps || []).filter((s: any) => s.type === "tool_call");
        setMessages(m => [...m, { role: "assistant", text: data.response || "(no reply)", tools: toolSteps }]);
        onWorldChanged?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setMessages(m => [...m, { role: "assistant", text: `⚠ ${err.error || "The agent hit an error."}` }]);
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", text: `⚠ ${e?.message || "Network error."}` }]);
    } finally {
      setIsBusy(false);
    }
  };

  const last = messages[messages.length - 1];

  return (
    <>
      {/* ===== Side panel (expanded) ===== */}
      {isOpen && (
        <div className="fixed right-0 top-0 bottom-16 z-[70] w-[420px] border-l border-white/10 bg-[#100e1a]/95 backdrop-blur-xl flex flex-col">
          <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-300" />
            <span className="text-sm text-gray-200 font-medium">World Agent</span>
            <span className="text-[10px] text-gray-500">all tools · world scope</span>
            <button onClick={() => setIsOpen(false)} className="ml-auto p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/5">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-xs text-gray-600 leading-relaxed pt-4">
                This is world-level authoring. Try:
                <ul className="mt-2 space-y-1.5 text-gray-500">
                  <li>· “Create the event where the first glitch is noticed — James learns of it. Place it before the rooftop.”</li>
                  <li>· “Create a character: Vesper, a broker of forbidden memories. Generate her portrait.”</li>
                  <li>· “Explore visual vibes for the under-city — 4 candidates, don’t attach them to anything yet.”</li>
                  <li>· “What’s changed in this world lately?”</li>
                </ul>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("text-sm leading-relaxed", m.role === "user" ? "text-cyan-200" : "text-gray-300")}>
                <span className="text-[10px] uppercase tracking-wider text-gray-600 block mb-0.5">
                  {m.role === "user" ? "you" : "agent"}
                </span>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.tools && m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {m.tools.map((t, ti) => (
                      <span key={ti} className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-500 flex items-center gap-1">
                        <Wrench className="w-2.5 h-2.5" />{t.tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isBusy && (
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> working in the world…
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Bottom quick-bar (always present) ===== */}
      <div className="fixed bottom-0 left-0 right-0 z-[71] border-t border-white/10 bg-[#0d0b16]/95 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-2.5">
          <button
            onClick={() => setIsOpen(o => !o)}
            className={cn(
              "shrink-0 p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-xs",
              isOpen ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-gray-400 hover:text-gray-200"
            )}
            title={isOpen ? "Collapse the conversation" : "Expand the conversation"}
          >
            <MessageSquare className="w-4 h-4" />
            {messages.length > 0 && <span>{messages.length}</span>}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={isBusy}
            placeholder={isBusy ? "The agent is working…" : "Author the world — events, characters, vibes… (Enter to send)"}
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3.5 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 disabled:opacity-60"
          />
          <button
            onClick={send}
            disabled={!input.trim() || isBusy}
            className="shrink-0 rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {/* Collapsed peek of the last reply */}
        {!isOpen && last?.role === "assistant" && (
          <button onClick={() => setIsOpen(true)} className="block w-full max-w-4xl mx-auto px-4 pb-2 -mt-0.5 text-left">
            <span className="text-[11px] text-gray-500 line-clamp-1">{last.text}</span>
          </button>
        )}
      </div>
    </>
  );
}

export default WorldChat;

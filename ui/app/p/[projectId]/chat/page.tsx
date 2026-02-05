"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Sparkles,
  User,
  Bot,
  Loader2,
  RefreshCw,
  BookOpen,
  Users,
  MapPin,
  Building2,
  Lightbulb,
  Network,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  timestamp: Date;
}

interface Source {
  id: string;
  name: string;
  type: string;
  relevance: number;
}

interface Entity {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  description?: string;
}

const typeIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  concept: Lightbulb,
  technology: Network,
};

const exampleQuestions = [
  "Who is Agent Chen?",
  "What is the Convergence Protocol?",
  "Who leads Oneirocom?",
  "Where is Project 89 headquartered?",
  "What is the relationship between Chen and Voss?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch canon data on mount
  useEffect(() => {
    async function fetchCanonData() {
      try {
        const [entitiesRes, relsRes] = await Promise.all([
          fetch("http://localhost:3088/api/narrative/entities"),
          fetch("http://localhost:3088/api/narrative/relationships"),
        ]);
        if (entitiesRes.ok) setEntities(await entitiesRes.json());
        if (relsRes.ok) setRelationships(await relsRes.json());
      } catch (e) {
        console.error("Error fetching canon data:", e);
      }
    }
    fetchCanonData();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Query the canon
  const queryCanon = async (question: string): Promise<{ answer: string; sources: Source[] }> => {
    const questionLower = question.toLowerCase();

    // Find relevant entities
    const relevantEntities = entities.filter((e) => {
      const nameMatch = e.name.toLowerCase().includes(questionLower) ||
        questionLower.includes(e.name.toLowerCase());
      const descMatch = e.description?.toLowerCase().includes(questionLower);
      const typeMatch = questionLower.includes(e.type);
      return nameMatch || descMatch || typeMatch;
    });

    // Find relevant relationships
    const relevantRels = relationships.filter((r) => {
      const entities_mentioned = relevantEntities.map(e => e.id);
      return entities_mentioned.includes(r.source) || entities_mentioned.includes(r.target);
    });

    // Build context for LLM
    const context = `
CANON ENTITIES:
${entities.map(e => `- ${e.name} (${e.type}): ${e.description}`).join('\n')}

RELATIONSHIPS:
${relationships.map(r => {
  const sourceEntity = entities.find(e => e.id === r.source);
  const targetEntity = entities.find(e => e.id === r.target);
  return `- ${sourceEntity?.name || r.source} --[${r.type}]--> ${targetEntity?.name || r.target}: ${r.description || ''}`;
}).join('\n')}
`;

    try {
      const response = await fetch("http://localhost:3088/api/canon/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          answer: data.answer,
          sources: data.sources || relevantEntities.slice(0, 3).map(e => ({
            id: e.id,
            name: e.name,
            type: e.type,
            relevance: 0.8,
          })),
        };
      }
    } catch (e) {
      // Fallback to local search
    }

    // Fallback: Local entity search
    if (relevantEntities.length > 0) {
      const mainEntity = relevantEntities[0];
      const relatedRels = relationships.filter(
        r => r.source === mainEntity.id || r.target === mainEntity.id
      );

      let answer = `**${mainEntity.name}** (${mainEntity.type})\n\n${mainEntity.description}`;

      if (relatedRels.length > 0) {
        answer += "\n\n**Relationships:**\n";
        relatedRels.forEach(r => {
          const other = r.source === mainEntity.id ? r.target : r.source;
          const otherEntity = entities.find(e => e.id === other);
          answer += `- ${r.type.replace(/_/g, " ")} ${otherEntity?.name || other}\n`;
        });
      }

      return {
        answer,
        sources: relevantEntities.slice(0, 3).map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          relevance: 0.9,
        })),
      };
    }

    return {
      answer: "I couldn't find specific information about that in the current canon. Try asking about characters like Agent Chen, Director Voss, or concepts like the Convergence Protocol.",
      sources: [],
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { answer, sources } = await queryCanon(userMessage.content);

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_response`,
        role: "assistant",
        content: answer,
        sources,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        role: "assistant",
        content: "Sorry, I encountered an error while searching the canon. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ask the Canon</h1>
          <p className="text-sm text-muted-foreground">
            Query your narrative world with natural language
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-cyan-500/30">
              <Sparkles className="h-8 w-8 text-cyan-400" />
            </div>
            <h2 className="mt-6 text-xl font-semibold text-foreground">
              What would you like to know?
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Ask questions about characters, locations, events, and relationships in your narrative world.
              The canon has {entities.length} entities and {relationships.length} relationships.
            </p>

            {/* Example questions */}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {exampleQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => handleExampleClick(question)}
                  className="rounded-full border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-4 py-3",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <div className="text-sm whitespace-pre-wrap">
                      {message.content.split('\n').map((line, i) => {
                        // Simple markdown-like formatting
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
                        }
                        if (line.startsWith('- ')) {
                          return <p key={i} className="ml-2">• {line.slice(2)}</p>;
                        }
                        return <p key={i}>{line}</p>;
                      })}
                    </div>

                    {/* Sources */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-xs text-muted-foreground mb-2">Sources:</p>
                        <div className="flex flex-wrap gap-1">
                          {message.sources.map((source) => {
                            const Icon = typeIcons[source.type] || BookOpen;
                            return (
                              <Link
                                key={source.id}
                                href={`/world?entity=${source.id}`}
                                className="flex items-center gap-1 rounded-full bg-background/50 px-2 py-1 text-xs hover:bg-background transition-colors"
                              >
                                <Icon className="h-3 w-3" />
                                {source.name}
                                <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-xl bg-muted px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching the canon...
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Ask about your narrative world..."
              rows={1}
              className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}

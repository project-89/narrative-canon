"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  Sparkles,
  FileText,
  Image,
  Loader2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Compass,
  Link2,
  Wand2,
  Eye,
  Ghost,
  Gem,
  ScrollText,
  Mic,
  Film,
  Mail,
  BookOpen,
  Newspaper,
  Flag,
  FlaskConical,
  GraduationCap,
  Pencil,
  MoreHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Resolution = "fog" | "attending" | "crystallized";

export type ArtifactType =
  | "document" | "report" | "interview" | "podcast" | "script"
  | "letter" | "journal" | "news" | "manifest" | "scp"
  | "mythology" | "academic" | "custom";

export interface EntityNodeData extends Record<string, unknown> {
  name: string;
  type: string;
  description?: string;
  resolution: Resolution;
  hint?: string;
  imageUrl?: string;
  isLoading?: boolean;
  onDevelop?: () => void;
  onCrystallize?: (type: "document" | "portrait") => void;
  onGenerateArtifact?: (artifactType: ArtifactType, customPrompt?: string) => void;
  onFindConnections?: () => void;
}

const artifactTypes: Array<{ id: ArtifactType; label: string; icon: any; description: string }> = [
  { id: "document", label: "Document", icon: FileText, description: "Lore entry, encyclopedia article" },
  { id: "report", label: "Report", icon: ScrollText, description: "Field report, investigation file" },
  { id: "interview", label: "Interview", icon: Mic, description: "Transcript of a conversation" },
  { id: "podcast", label: "Podcast", icon: Mic, description: "Podcast episode transcript" },
  { id: "script", label: "Script", icon: Film, description: "Screenplay or dramatic scene" },
  { id: "letter", label: "Letter", icon: Mail, description: "Personal correspondence" },
  { id: "journal", label: "Journal", icon: BookOpen, description: "Diary or personal entries" },
  { id: "news", label: "News", icon: Newspaper, description: "News article or press release" },
  { id: "manifest", label: "Manifesto", icon: Flag, description: "Declaration or creed" },
  { id: "scp", label: "Anomaly Report", icon: FlaskConical, description: "SCP-style containment doc" },
  { id: "mythology", label: "Myth/Legend", icon: Sparkles, description: "Folk tale or origin story" },
  { id: "academic", label: "Academic", icon: GraduationCap, description: "Research paper or analysis" },
  { id: "custom", label: "Custom...", icon: Pencil, description: "Write your own prompt" },
];

const typeConfig: Record<string, { bg: string; border: string; text: string; glow: string; icon: string }> = {
  character: { bg: "bg-cyan-500/10", border: "border-cyan-500/40", text: "text-cyan-400", glow: "shadow-cyan-500/20", icon: "👤" },
  location: { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-400", glow: "shadow-green-500/20", icon: "🏛️" },
  organization: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400", glow: "shadow-amber-500/20", icon: "⚔️" },
  object: { bg: "bg-purple-500/10", border: "border-purple-500/40", text: "text-purple-400", glow: "shadow-purple-500/20", icon: "💎" },
  artifact: { bg: "bg-purple-500/10", border: "border-purple-500/40", text: "text-purple-400", glow: "shadow-purple-500/20", icon: "🗝️" },
  concept: { bg: "bg-pink-500/10", border: "border-pink-500/40", text: "text-pink-400", glow: "shadow-pink-500/20", icon: "💭" },
  technology: { bg: "bg-blue-500/10", border: "border-blue-500/40", text: "text-blue-400", glow: "shadow-blue-500/20", icon: "⚙️" },
  event: { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400", glow: "shadow-orange-500/20", icon: "⚡" },
  creature: { bg: "bg-red-500/10", border: "border-red-500/40", text: "text-red-400", glow: "shadow-red-500/20", icon: "🐉" },
  phenomenon: { bg: "bg-violet-500/10", border: "border-violet-500/40", text: "text-violet-400", glow: "shadow-violet-500/20", icon: "✨" },
  unknown: { bg: "bg-gray-500/10", border: "border-gray-500/40", text: "text-gray-400", glow: "shadow-gray-500/20", icon: "❓" },
};

function EntityNodeComponent({ data, selected }: { data: EntityNodeData; selected?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showArtifactMenu, setShowArtifactMenu] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const config = typeConfig[data.type] || typeConfig.unknown;
  const isFog = data.resolution === "fog";
  const isAttending = data.resolution === "attending";
  const isCrystallized = data.resolution === "crystallized";

  const hasLongDescription = data.description && data.description.length > 120;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowArtifactMenu(false);
        setShowCustomInput(false);
      }
    };
    if (showArtifactMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showArtifactMenu]);

  const handleArtifactSelect = (artifactType: ArtifactType) => {
    if (artifactType === "custom") {
      setShowCustomInput(true);
    } else {
      data.onGenerateArtifact?.(artifactType);
      setShowArtifactMenu(false);
    }
  };

  const handleCustomSubmit = () => {
    if (customPrompt.trim()) {
      data.onGenerateArtifact?.("custom", customPrompt);
      setCustomPrompt("");
      setShowCustomInput(false);
      setShowArtifactMenu(false);
    }
  };

  return (
    <div
      className={cn(
        "group rounded-2xl border-2 transition-all duration-300 min-w-[240px] max-w-[320px] overflow-hidden",
        "hover:scale-[1.02] hover:z-10",
        selected && "ring-2 ring-white/30 scale-[1.02] z-10",
        isFog && "border-dashed border-gray-600/60 bg-gray-900/40 backdrop-blur-sm",
        isAttending && `${config.border} ${config.bg} backdrop-blur-sm`,
        isCrystallized && `${config.border} ${config.bg} shadow-lg ${config.glow} backdrop-blur-sm`
      )}
    >
      {/* Handles - styled based on resolution */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className={cn(
          "!w-3 !h-3 !min-w-0 !min-h-0 !rounded-full transition-all",
          isFog ? "!bg-gray-700 !border-gray-600" : `!bg-gray-800 !border-2 ${config.border}`
        )}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className={cn(
          "!w-3 !h-3 !min-w-0 !min-h-0 !rounded-full transition-all",
          isFog ? "!bg-gray-700 !border-gray-600" : `!bg-gray-800 !border-2 ${config.border}`
        )}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className={cn(
          "!w-3 !h-3 !min-w-0 !min-h-0 !rounded-full transition-all",
          isFog ? "!bg-gray-700 !border-gray-600" : `!bg-gray-800 !border-2 ${config.border}`
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={cn(
          "!w-3 !h-3 !min-w-0 !min-h-0 !rounded-full transition-all",
          isFog ? "!bg-gray-700 !border-gray-600" : `!bg-gray-800 !border-2 ${config.border}`
        )}
      />

      {/* Resolution indicator bar */}
      <div
        className={cn(
          "h-1 transition-all duration-500",
          isFog && "bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 animate-pulse",
          isAttending && `bg-gradient-to-r from-transparent ${config.text.replace('text-', 'via-')} to-transparent opacity-60`,
          isCrystallized && `bg-gradient-to-r from-transparent ${config.text.replace('text-', 'via-')} to-transparent`
        )}
      />

      {/* Header */}
      <div className={cn("px-4 py-3", !isFog && "border-b border-white/5")}>
        <div className="flex items-start gap-3">
          {/* Image/Icon */}
          {data.imageUrl ? (
            <div className="relative">
              <img
                src={data.imageUrl}
                alt={data.name}
                className={cn(
                  "w-14 h-14 rounded-xl object-cover border-2 transition-all",
                  isCrystallized ? config.border : "border-gray-700"
                )}
              />
              {isCrystallized && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Gem className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-all text-2xl",
                isFog && "bg-gray-800/50 border-2 border-dashed border-gray-700",
                isAttending && `${config.bg} border-2 ${config.border}`,
                isCrystallized && `${config.bg} border-2 ${config.border} shadow-inner`
              )}
            >
              {isFog ? (
                <Ghost className="w-7 h-7 text-gray-600 animate-pulse" />
              ) : (
                <span>{config.icon}</span>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Name */}
            <h3
              className={cn(
                "font-bold text-base leading-tight",
                isFog ? "text-gray-500 italic" : "text-gray-100"
              )}
            >
              {isFog ? "Unknown" : data.name}
            </h3>

            {/* Type badge & resolution */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full capitalize font-medium",
                  isFog ? "bg-gray-800 text-gray-500" : `${config.bg} ${config.text} border ${config.border}`
                )}
              >
                {data.type}
              </span>
              {isFog && (
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> unexplored
                </span>
              )}
              {isCrystallized && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Gem className="w-3 h-3" /> crystallized
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {isFog ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 italic leading-relaxed">
              {data.hint || "Something lurks at the edge of perception..."}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Compass className="w-3 h-3" />
              <span>Click to reveal</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p
              className={cn(
                "text-sm leading-relaxed",
                isAttending ? "text-gray-400" : "text-gray-300",
                !expanded && hasLongDescription && "line-clamp-3"
              )}
            >
              {data.description || "Details emerging..."}
            </p>
            {hasLongDescription && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" /> Show more
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={cn(
        "px-4 py-3 border-t border-white/5",
        "opacity-80 group-hover:opacity-100 transition-opacity"
      )}>
        <div className="flex gap-2">
          {/* Fog: Develop button */}
          {isFog && data.onDevelop && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDevelop?.();
              }}
              disabled={data.isLoading}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl",
                "bg-gradient-to-r from-blue-500/20 to-cyan-500/20",
                "border border-blue-500/40 text-blue-400",
                "text-sm font-medium",
                "hover:from-blue-500/30 hover:to-cyan-500/30 hover:border-blue-400/60",
                "transition-all disabled:opacity-50"
              )}
            >
              {data.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              Reveal
            </button>
          )}

          {/* Attending/Crystallized: Artifact generation */}
          {!isFog && data.onGenerateArtifact && (
            <div className="relative flex-1" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowArtifactMenu(!showArtifactMenu);
                }}
                disabled={data.isLoading}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl",
                  "bg-gradient-to-r from-emerald-500/15 to-cyan-500/15",
                  "border border-emerald-500/30 text-emerald-400",
                  "text-sm font-medium",
                  "hover:from-emerald-500/25 hover:to-cyan-500/25 hover:border-emerald-400/50",
                  "transition-all disabled:opacity-50"
                )}
                title="Generate artifact from this entity"
              >
                {data.isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ScrollText className="w-4 h-4" />
                )}
                Create
                <ChevronDown className={cn("w-3 h-3 transition-transform", showArtifactMenu && "rotate-180")} />
              </button>

              {/* Artifact Menu Popup */}
              {showArtifactMenu && (
                <div
                  className={cn(
                    "absolute bottom-full left-0 right-0 mb-2 z-50",
                    "bg-gray-900/95 backdrop-blur-md rounded-xl border border-gray-700/80",
                    "shadow-xl shadow-black/50 overflow-hidden",
                    "min-w-[280px]"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {showCustomInput ? (
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-400">Custom Artifact</span>
                        <button
                          onClick={() => setShowCustomInput(false)}
                          className="text-gray-500 hover:text-gray-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="Describe what you want to generate... (e.g., 'a love letter from this character to their lost companion')"
                        className={cn(
                          "w-full h-24 px-3 py-2 rounded-lg text-sm resize-none",
                          "bg-gray-800 border border-gray-700",
                          "text-gray-200 placeholder-gray-500",
                          "focus:outline-none focus:border-cyan-500/50"
                        )}
                        autoFocus
                      />
                      <button
                        onClick={handleCustomSubmit}
                        disabled={!customPrompt.trim()}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg text-sm font-medium",
                          "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400",
                          "hover:bg-cyan-500/30 disabled:opacity-50",
                          "transition-all"
                        )}
                      >
                        Generate
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="px-3 py-2 border-b border-gray-700/50">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Generate Artifact
                        </span>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {artifactTypes.map((artifact) => {
                          const Icon = artifact.icon;
                          return (
                            <button
                              key={artifact.id}
                              onClick={() => handleArtifactSelect(artifact.id)}
                              className={cn(
                                "w-full flex items-start gap-3 px-3 py-2 text-left",
                                "hover:bg-gray-800/80 transition-colors",
                                artifact.id === "custom" && "border-t border-gray-700/50 mt-1"
                              )}
                            >
                              <Icon className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-sm text-gray-200">{artifact.label}</div>
                                <div className="text-xs text-gray-500 truncate">{artifact.description}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Portrait button - keep separate */}
          {!isFog && data.onCrystallize && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onCrystallize?.("portrait");
              }}
              disabled={data.isLoading}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl",
                "bg-purple-500/15 border border-purple-500/30 text-purple-400",
                "text-sm",
                "hover:bg-purple-500/25 hover:border-purple-400/50",
                "transition-all disabled:opacity-50"
              )}
              title="Generate visual portrait"
            >
              <Image className="w-4 h-4" />
            </button>
          )}

          {/* Find connections - available for non-fog */}
          {!isFog && data.onFindConnections && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onFindConnections?.();
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl",
                "bg-gray-700/30 border border-gray-600/50 text-gray-400",
                "text-sm",
                "hover:bg-gray-700/50 hover:border-gray-500/50 hover:text-gray-300",
                "transition-all"
              )}
              title="Discover connected elements"
            >
              <Link2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {data.isLoading && (
        <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm rounded-2xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className={cn("w-8 h-8 animate-spin", config.text)} />
            <span className="text-sm text-gray-400">Manifesting...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const EntityNode = memo(EntityNodeComponent);

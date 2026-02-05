"use client";

import {
  MessageSquare,
  Swords,
  Heart,
  Lightbulb,
  Eye,
  Users,
  Zap,
  ChevronRight,
  Image,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Participant {
  id: string;
  name: string;
  type: string;
}

interface Interaction {
  id: string;
  type: "dialogue" | "conflict" | "alliance" | "revelation" | "observation" | "transformation";
  title: string;
  description: string;
  participants: Participant[];
  scene?: string;
  chapter?: string;
  emotionalTone?: string;
  timestamp?: string;
  hasVisual?: boolean;
}

interface InteractionCardProps {
  interaction: Interaction;
  isSelected?: boolean;
  onClick?: () => void;
}

const typeConfig: Record<
  string,
  { icon: typeof MessageSquare; color: string; label: string }
> = {
  dialogue: {
    icon: MessageSquare,
    color: "text-interaction-dialogue bg-interaction-dialogue/10 border-interaction-dialogue/30",
    label: "Dialogue",
  },
  conflict: {
    icon: Swords,
    color: "text-interaction-conflict bg-interaction-conflict/10 border-interaction-conflict/30",
    label: "Conflict",
  },
  alliance: {
    icon: Heart,
    color: "text-interaction-alliance bg-interaction-alliance/10 border-interaction-alliance/30",
    label: "Alliance",
  },
  revelation: {
    icon: Lightbulb,
    color: "text-interaction-revelation bg-interaction-revelation/10 border-interaction-revelation/30",
    label: "Revelation",
  },
  observation: {
    icon: Eye,
    color: "text-interaction-observation bg-interaction-observation/10 border-interaction-observation/30",
    label: "Observation",
  },
  transformation: {
    icon: Zap,
    color: "text-purple-500 bg-purple-500/10 border-purple-500/30",
    label: "Transformation",
  },
};

export function InteractionCard({
  interaction,
  isSelected,
  onClick,
}: InteractionCardProps) {
  const config = typeConfig[interaction.type] || typeConfig.dialogue;
  const Icon = config.icon;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex gap-4 rounded-xl border p-4 cursor-pointer transition-all",
        isSelected
          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border bg-card hover:border-primary/50 hover:bg-card/80"
      )}
    >
      {/* Icon */}
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border shrink-0", config.color)}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-foreground">{interaction.title}</h4>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", config.color)}>
                {config.label}
              </span>
            </div>
            {/* Scene/Chapter */}
            {(interaction.scene || interaction.chapter) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {interaction.chapter && <span>{interaction.chapter}</span>}
                {interaction.chapter && interaction.scene && <span> • </span>}
                {interaction.scene && <span>{interaction.scene}</span>}
              </p>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {interaction.timestamp}
          </span>
        </div>

        {/* Description */}
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {interaction.description}
        </p>

        {/* Participants */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex -space-x-1">
              {interaction.participants.slice(0, 3).map((participant, i) => (
                <div
                  key={participant.id}
                  className="flex h-6 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground border border-background"
                  style={{ zIndex: 3 - i }}
                >
                  {participant.name}
                </div>
              ))}
              {interaction.participants.length > 3 && (
                <div className="flex h-6 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground border border-background">
                  +{interaction.participants.length - 3}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {interaction.emotionalTone && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {interaction.emotionalTone}
              </span>
            )}
            {interaction.hasVisual && (
              <div className="flex h-6 w-6 items-center justify-center rounded bg-secondary/20 text-secondary">
                <Image className="h-3.5 w-3.5" />
              </div>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </div>
  );
}

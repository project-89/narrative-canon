"use client";

import { cn } from "@/lib/utils";
import { InteractionCard } from "./InteractionCard";

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

interface GroupedInteractions {
  group: string;
  interactions: Interaction[];
}

interface InteractionTimelineProps {
  groupedInteractions: GroupedInteractions[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function InteractionTimeline({
  groupedInteractions,
  selectedId,
  onSelect,
}: InteractionTimelineProps) {
  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />

      {/* Groups */}
      <div className="space-y-8">
        {groupedInteractions.map((group) => (
          <div key={group.group} className="relative">
            {/* Group header */}
            <div className="relative flex items-center gap-4 mb-4">
              <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary bg-background">
                <span className="text-xs font-bold text-primary">
                  {group.interactions.length}
                </span>
              </div>
              <h3 className="font-semibold text-foreground">{group.group}</h3>
            </div>

            {/* Interactions */}
            <div className="ml-12 space-y-3">
              {group.interactions.map((interaction) => (
                <InteractionCard
                  key={interaction.id}
                  interaction={interaction}
                  isSelected={selectedId === interaction.id}
                  onClick={() => onSelect(interaction.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EntityNodeData {
  label: string;
  type: string;
  description?: string;
  traits?: string[];
  selected?: boolean;
}

const typeIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  object: Box,
  concept: Lightbulb,
  technology: Cpu,
};

const typeColors: Record<string, { bg: string; border: string; text: string }> = {
  character: {
    bg: "bg-entity-character/20",
    border: "border-entity-character",
    text: "text-entity-character",
  },
  location: {
    bg: "bg-entity-location/20",
    border: "border-entity-location",
    text: "text-entity-location",
  },
  organization: {
    bg: "bg-entity-organization/20",
    border: "border-entity-organization",
    text: "text-entity-organization",
  },
  object: {
    bg: "bg-entity-object/20",
    border: "border-entity-object",
    text: "text-entity-object",
  },
  concept: {
    bg: "bg-entity-concept/20",
    border: "border-entity-concept",
    text: "text-entity-concept",
  },
  technology: {
    bg: "bg-entity-technology/20",
    border: "border-entity-technology",
    text: "text-entity-technology",
  },
};

function EntityNodeComponent({ data, selected }: NodeProps & { data: EntityNodeData }) {
  const Icon = typeIcons[data.type] || Box;
  const colors = typeColors[data.type] || {
    bg: "bg-muted",
    border: "border-border",
    text: "text-foreground",
  };

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary !w-2 !h-2 !border-0"
      />
      <div
        className={cn(
          "px-4 py-3 rounded-xl border-2 transition-all duration-200 min-w-[140px] max-w-[200px]",
          colors.bg,
          colors.border,
          selected || data.selected
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20"
            : "hover:shadow-md"
        )}
      >
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg", colors.bg, colors.text)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {data.label}
            </p>
            <p className={cn("text-xs capitalize", colors.text)}>
              {data.type}
            </p>
          </div>
        </div>
        {data.description && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
            {data.description}
          </p>
        )}
        {data.traits && data.traits.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {data.traits.slice(0, 2).map((trait) => (
              <span
                key={trait}
                className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {trait}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !w-2 !h-2 !border-0"
      />
    </>
  );
}

export const EntityNode = memo(EntityNodeComponent);

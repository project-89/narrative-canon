"use client";

import Link from "next/link";
import {
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
  ArrowRight,
  Network,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Entity {
  id: string;
  name: string;
  type: string;
  description: string;
  traits?: string[];
  atmosphere?: string;
  relationships?: number;
  interactions?: number;
}

interface EntityCardProps {
  entity: Entity;
  viewMode: "grid" | "list";
}

const typeIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  object: Box,
  concept: Lightbulb,
  technology: Cpu,
};

const typeColors: Record<string, string> = {
  character: "text-entity-character border-entity-character/30 bg-entity-character/10",
  location: "text-entity-location border-entity-location/30 bg-entity-location/10",
  organization: "text-entity-organization border-entity-organization/30 bg-entity-organization/10",
  object: "text-entity-object border-entity-object/30 bg-entity-object/10",
  concept: "text-entity-concept border-entity-concept/30 bg-entity-concept/10",
  technology: "text-entity-technology border-entity-technology/30 bg-entity-technology/10",
};

export function EntityCard({ entity, viewMode }: EntityCardProps) {
  const Icon = typeIcons[entity.type] || Box;
  const colorClasses = typeColors[entity.type] || "text-foreground border-border bg-muted";

  if (viewMode === "list") {
    return (
      <Link
        href={`/entities/${entity.id}`}
        className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-card/80"
      >
        {/* Icon */}
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", colorClasses)}>
          <Icon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{entity.name}</h3>
            <span className={cn("rounded-full border px-2 py-0.5 text-xs capitalize", colorClasses)}>
              {entity.type}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {entity.description}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Network className="h-4 w-4" />
            <span>{entity.relationships || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            <span>{entity.interactions || 0}</span>
          </div>
          <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </Link>
    );
  }

  // Grid view
  return (
    <Link
      href={`/entities/${entity.id}`}
      className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", colorClasses)}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs capitalize", colorClasses)}>
          {entity.type}
        </span>
      </div>

      {/* Name */}
      <h3 className="mt-4 font-semibold text-foreground group-hover:text-primary transition-colors">
        {entity.name}
      </h3>

      {/* Description */}
      <p className="mt-2 flex-1 text-sm text-muted-foreground line-clamp-2">
        {entity.description}
      </p>

      {/* Traits or Atmosphere */}
      {entity.traits && entity.traits.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {entity.traits.slice(0, 3).map((trait) => (
            <span
              key={trait}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {trait}
            </span>
          ))}
        </div>
      )}
      {entity.atmosphere && (
        <p className="mt-3 text-xs italic text-muted-foreground">
          {entity.atmosphere}
        </p>
      )}

      {/* Stats */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Network className="h-3.5 w-3.5" />
            <span>{entity.relationships || 0} relations</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{entity.interactions || 0}</span>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

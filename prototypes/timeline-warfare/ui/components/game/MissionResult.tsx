"use client";

import {
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Users,
  Link2,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MissionResult as MissionResultType } from "@/lib/stores/game-store";

interface MissionResultProps {
  result: MissionResultType;
  onContinue: () => void;
  className?: string;
}

export function MissionResult({ result, onContinue, className }: MissionResultProps) {
  const { success, narrative, divergenceChange, newEntities, newRelationships, cascadeEffects } = result;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      success ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5",
      className
    )}>
      {/* Header */}
      <div className={cn(
        "p-6 text-center",
        success ? "bg-green-500/10" : "bg-red-500/10"
      )}>
        <div className={cn(
          "mx-auto w-16 h-16 rounded-full flex items-center justify-center",
          success ? "bg-green-500/20" : "bg-red-500/20"
        )}>
          {success ? (
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          ) : (
            <XCircle className="h-10 w-10 text-red-500" />
          )}
        </div>
        <h2 className={cn(
          "mt-4 text-2xl font-bold",
          success ? "text-green-400" : "text-red-400"
        )}>
          {success ? "Mission Success" : "Mission Failed"}
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2">
          {divergenceChange > 0 ? (
            <TrendingUp className="h-5 w-5 text-cyan-400" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-400" />
          )}
          <span className={cn(
            "text-lg font-bold",
            divergenceChange > 0 ? "text-cyan-400" : "text-red-400"
          )}>
            {divergenceChange > 0 ? "+" : ""}{divergenceChange}% Divergence
          </span>
        </div>
      </div>

      {/* Narrative */}
      <div className="p-6 border-b border-border">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Outcome
        </h3>
        <div className="prose prose-sm prose-invert max-w-none">
          {narrative.split('\n\n').map((paragraph, i) => (
            <p key={i} className="text-foreground leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      {/* Effects */}
      <div className="p-6 grid gap-4 sm:grid-cols-3">
        {/* New Entities */}
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 text-entity-character">
            <Users className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">New Entities</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {newEntities.length}
          </div>
          {newEntities.length > 0 && (
            <div className="mt-2 space-y-1">
              {newEntities.slice(0, 3).map((e: any, i) => (
                <div key={i} className="text-xs text-muted-foreground truncate">
                  {e.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Relationships */}
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 text-entity-location">
            <Link2 className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Relationships</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {newRelationships.length}
          </div>
        </div>

        {/* Cascade Effects */}
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 text-interaction-revelation">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">Cascade Effects</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {cascadeEffects.length}
          </div>
          {cascadeEffects.length > 0 && (
            <div className="mt-2 space-y-1">
              {cascadeEffects.slice(0, 2).map((c, i) => (
                <div key={i} className="text-xs text-muted-foreground truncate">
                  {c.description}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Continue button */}
      <div className="p-6 border-t border-border bg-muted/20">
        <button
          onClick={onContinue}
          className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

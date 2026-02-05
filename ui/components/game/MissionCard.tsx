"use client";

import { useState } from "react";
import {
  Target,
  AlertTriangle,
  Shield,
  Zap,
  ChevronRight,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mission, Approach } from "@/lib/stores/game-store";

interface MissionCardProps {
  mission: Mission;
  onExecute: (approachId: string) => void;
  isExecuting?: boolean;
  className?: string;
}

export function MissionCard({
  mission,
  onExecute,
  isExecuting = false,
  className
}: MissionCardProps) {
  const [selectedApproach, setSelectedApproach] = useState<string | null>(null);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low": return "text-green-400 bg-green-400/10 border-green-400/30";
      case "medium": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      case "high": return "text-red-400 bg-red-400/10 border-red-400/30";
      default: return "text-muted-foreground bg-muted/10 border-border";
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case "low": return Shield;
      case "medium": return AlertTriangle;
      case "high": return Zap;
      default: return Target;
    }
  };

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent p-4">
        <div className="flex items-center gap-2 text-primary">
          <Target className="h-5 w-5" />
          <span className="text-xs font-medium uppercase tracking-wide">Active Mission</span>
        </div>
        <h2 className="mt-2 text-xl font-bold text-foreground">{mission.title}</h2>
      </div>

      {/* Narrative */}
      <div className="p-4 border-b border-border">
        <div className="prose prose-sm prose-invert max-w-none">
          {mission.narrative.split('\n\n').map((paragraph, i) => (
            <p key={i} className="text-muted-foreground leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>

        {mission.continuityReferences.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {mission.continuityReferences.map((ref, i) => (
              <span
                key={i}
                className="rounded-full bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
              >
                {ref}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Approaches */}
      <div className="p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">Select Approach</h3>

        {mission.approaches.map((approach) => {
          const RiskIcon = getRiskIcon(approach.risk);
          const isSelected = selectedApproach === approach.id;

          return (
            <button
              key={approach.id}
              onClick={() => setSelectedApproach(approach.id)}
              disabled={isExecuting}
              className={cn(
                "w-full rounded-lg border p-4 text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-card/50 hover:border-muted-foreground/50"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{approach.name}</span>
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium uppercase",
                      getRiskColor(approach.risk)
                    )}>
                      <RiskIcon className="inline-block h-3 w-3 mr-1" />
                      {approach.risk}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{approach.description}</p>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold text-cyan-400">
                    +{approach.divergenceGain}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {approach.successProbability}% success
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Execute button */}
      <div className="p-4 border-t border-border bg-muted/20">
        <button
          onClick={() => selectedApproach && onExecute(selectedApproach)}
          disabled={!selectedApproach || isExecuting}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-all",
            selectedApproach && !isExecuting
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Executing Mission...
            </>
          ) : (
            <>
              Execute Mission
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

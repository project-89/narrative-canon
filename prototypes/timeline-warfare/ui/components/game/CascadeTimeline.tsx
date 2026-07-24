"use client";

import { Sparkles, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CascadeEffect } from "@/lib/stores/game-store";

interface CascadeTimelineProps {
  cascades: CascadeEffect[];
  className?: string;
}

export function CascadeTimeline({ cascades, className }: CascadeTimelineProps) {
  if (cascades.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-6 text-center", className)}>
        <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <p className="mt-4 text-muted-foreground">No cascade effects yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Complete missions to create timeline ripples</p>
      </div>
    );
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "political": return "border-purple-500 bg-purple-500/10";
      case "technological": return "border-cyan-500 bg-cyan-500/10";
      case "social": return "border-green-500 bg-green-500/10";
      case "economic": return "border-yellow-500 bg-yellow-500/10";
      default: return "border-border bg-muted/50";
    }
  };

  const getMagnitudeWidth = (magnitude: number) => {
    return Math.round(magnitude * 100);
  };

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-interaction-revelation" />
          <h3 className="font-semibold text-foreground">Timeline Cascade Effects</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Ripples propagating through the timeline from your actions
        </p>
      </div>

      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
        {cascades.map((cascade, index) => (
          <div
            key={index}
            className={cn(
              "rounded-lg border p-4 transition-all",
              getTypeColor(cascade.type)
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-foreground">{cascade.description}</p>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(cascade.date).toLocaleDateString()}
                  </span>
                  <span className="capitalize">{cascade.type}</span>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-1 text-cyan-400">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {Math.round(cascade.probability * 100)}%
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">probability</div>
              </div>
            </div>

            {/* Magnitude bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Magnitude</span>
                <span>{Math.round(cascade.magnitude * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all"
                  style={{ width: `${getMagnitudeWidth(cascade.magnitude)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

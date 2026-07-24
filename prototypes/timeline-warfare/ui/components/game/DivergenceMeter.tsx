"use client";

import { cn } from "@/lib/utils";

interface DivergenceMeterProps {
  current: number;
  target?: number;
  className?: string;
}

export function DivergenceMeter({ current, target = 89, className }: DivergenceMeterProps) {
  const percentage = Math.min(100, Math.max(0, current));
  const targetPercentage = (target / 100) * 100;

  // Color based on progress
  const getColor = () => {
    if (current >= target) return "bg-green-500";
    if (current >= 60) return "bg-cyan-400";
    if (current >= 30) return "bg-yellow-400";
    return "bg-red-500";
  };

  const getGlowColor = () => {
    if (current >= target) return "shadow-green-500/50";
    if (current >= 60) return "shadow-cyan-400/50";
    if (current >= 30) return "shadow-yellow-400/50";
    return "shadow-red-500/50";
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Timeline Divergence</span>
        <span className={cn(
          "text-2xl font-bold tabular-nums",
          current >= target ? "text-green-400" : "text-cyan-400"
        )}>
          {current}%
        </span>
      </div>

      <div className="relative h-4 rounded-full bg-muted/50 overflow-hidden">
        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10"
          style={{ left: `${targetPercentage}%` }}
        />
        <div
          className="absolute -top-1 w-8 text-center text-xs text-muted-foreground"
          style={{ left: `calc(${targetPercentage}% - 16px)` }}
        >
          {target}%
        </div>

        {/* Progress bar */}
        <div
          className={cn(
            "h-full transition-all duration-500 ease-out rounded-full shadow-lg",
            getColor(),
            getGlowColor()
          )}
          style={{ width: `${percentage}%` }}
        />

        {/* Glitch effect overlay */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(0, 255, 255, 0.1) 2px,
              rgba(0, 255, 255, 0.1) 4px
            )`
          }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Convergence (0%)</span>
        <span>Liberation ({target}%)</span>
      </div>
    </div>
  );
}

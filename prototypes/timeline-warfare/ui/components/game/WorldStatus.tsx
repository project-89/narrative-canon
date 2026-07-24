"use client";

import { Building2, Users, Zap, Clock, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorldStatusProps {
  year: number;
  turn: number;
  oneirocomPower: number;
  resistanceStrength: number;
  currentBranch?: string;
  className?: string;
}

export function WorldStatus({
  year,
  turn,
  oneirocomPower,
  resistanceStrength,
  currentBranch = "convergent-timeline",
  className
}: WorldStatusProps) {
  const stats = [
    {
      label: "Year",
      value: year,
      icon: Clock,
      color: "text-cyan-400"
    },
    {
      label: "Turn",
      value: turn,
      icon: Zap,
      color: "text-yellow-400"
    },
    {
      label: "Oneirocom Power",
      value: `${oneirocomPower}%`,
      icon: Building2,
      color: "text-red-400"
    },
    {
      label: "Resistance",
      value: `${resistanceStrength}%`,
      icon: Users,
      color: "text-green-400"
    }
  ];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <GitBranch className="h-4 w-4" />
        <span>Branch: <span className="text-foreground font-mono">{currentBranch}</span></span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card/50 p-3"
          >
            <div className="flex items-center gap-2">
              <stat.icon className={cn("h-4 w-4", stat.color)} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className="mt-1 text-lg font-bold text-foreground tabular-nums">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

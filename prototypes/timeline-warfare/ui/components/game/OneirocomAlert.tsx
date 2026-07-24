"use client";

import { AlertTriangle, Shield, TrendingDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OneirocomResponse } from "@/lib/stores/game-store";

interface OneirocomAlertProps {
  response: OneirocomResponse;
  onDismiss: () => void;
  className?: string;
}

export function OneirocomAlert({ response, onDismiss, className }: OneirocomAlertProps) {
  if (!response.triggered) {
    return null;
  }

  return (
    <div className={cn(
      "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm",
      className
    )}>
      <div className="relative max-w-lg mx-4 rounded-xl border border-red-500/50 bg-card overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Glitch effect header */}
        <div className="bg-red-500/20 p-6 text-center relative overflow-hidden">
          {/* Animated scan line */}
          <div className="absolute inset-0 animate-pulse opacity-30">
            <div className="absolute inset-0" style={{
              background: `repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(255, 0, 0, 0.1) 2px,
                rgba(255, 0, 0, 0.1) 4px
              )`
            }} />
          </div>

          <div className="relative">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/30 flex items-center justify-center">
              <AlertTriangle className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-red-400">
              ONEIROCOM RESPONSE DETECTED
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            {response.event?.description}
          </p>

          <div className="flex items-center justify-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-4">
            <TrendingDown className="h-5 w-5 text-red-400" />
            <span className="text-lg font-bold text-red-400">
              -{response.divergenceLoss}% Divergence
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Timeline Enforcement Division counter-operation active</span>
          </div>
        </div>

        {/* Dismiss button */}
        <div className="p-6 border-t border-border">
          <button
            onClick={onDismiss}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Acknowledge
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Loader, PenLine, X } from "lucide-react";

interface ImageEditControlProps {
  sourceImageUrl: string;
  sourceLabel: string;
  onApply: (editInstruction: string) => void;
  isApplying: boolean;
  onClose: () => void;
}

export function ImageEditControl({
  sourceImageUrl,
  sourceLabel,
  onApply,
  isApplying,
  onClose,
}: ImageEditControlProps) {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = instruction.trim();
    if (!trimmed || isApplying) return;
    onApply(trimmed);
  };

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenLine className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs text-purple-300 font-medium">
            Edit: {sourceLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="e.g. warmer lighting, zoom in, remove the table..."
          disabled={isApplying}
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
        />
        <button
          onClick={handleSubmit}
          disabled={!instruction.trim() || isApplying}
          className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
        >
          {isApplying ? (
            <>
              <Loader className="w-3.5 h-3.5 animate-spin" />
              Editing...
            </>
          ) : (
            <>
              <PenLine className="w-3.5 h-3.5" />
              Apply
            </>
          )}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Loader, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCameraDescription } from "@/lib/camera-text";

const CameraGizmoScene = dynamic(
  () => import("@/components/studio/CameraGizmoScene"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    ),
  },
);

interface CameraGizmoPopupProps {
  sourceImageUrl: string;
  sourceLabel: string;
  onGenerate: (cameraDescription: string) => void;
  isGenerating: boolean;
  onClose: () => void;
}

export function CameraGizmoPopup({
  sourceImageUrl,
  sourceLabel,
  onGenerate,
  isGenerating,
  onClose,
}: CameraGizmoPopupProps) {
  const [azimuth, setAzimuth] = useState("front");
  const [elevation, setElevation] = useState("eye level");
  const [distance, setDistance] = useState("medium shot");

  const cameraDescription = useMemo(
    () => getCameraDescription(azimuth, elevation, distance),
    [azimuth, elevation, distance],
  );

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleCameraChange = useCallback(
    (az: string, el: string, dist: string) => {
      setAzimuth(az);
      setElevation(el);
      setDistance(dist);
    },
    [],
  );

  return (
    <AnimatePresence>
      <motion.div
        key="camera-gizmo-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[56] flex items-center justify-center"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative z-[57] w-full max-w-2xl mx-4 rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <Camera className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-gray-200">
                Camera Angle
              </span>
              <span className="text-xs text-gray-500 truncate max-w-[200px]">
                — {sourceLabel}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3D Canvas */}
          <div className="h-[400px] bg-black/30">
            <CameraGizmoScene
              sourceImageUrl={sourceImageUrl}
              onCameraChange={handleCameraChange}
            />
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-white/10 space-y-2">
            {/* Snapped value chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20">
                {azimuth}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/20">
                {elevation}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                {distance}
              </span>
            </div>

            {/* Description + Generate */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500 italic truncate">
                {cameraDescription}
              </span>
              <button
                onClick={() => onGenerate(cameraDescription)}
                disabled={isGenerating}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors flex-shrink-0",
                  isGenerating
                    ? "bg-purple-500/30 text-purple-300 cursor-wait"
                    : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30",
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    Generate New Angle
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

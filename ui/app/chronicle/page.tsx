"use client";

/**
 * /chronicle — superseded by the studio's WORLD MODE (Michael: the world
 * view must INHERIT the studio experience — chat, entities, navigation —
 * not run a parallel copy). This route now just redirects into the studio;
 * the World button in the studio header toggles the world canvas.
 */

import { useEffect } from "react";

export default function ChronicleRedirect() {
  useEffect(() => {
    window.location.replace("/studio");
  }, []);
  return (
    <div className="h-screen w-screen bg-[#0b0a12] text-gray-500 flex items-center justify-center text-sm">
      The World view now lives inside the studio — redirecting…
    </div>
  );
}

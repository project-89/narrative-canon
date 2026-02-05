"use client";

import dynamic from "next/dynamic";

const WorldChat = dynamic(() => import("./WorldChat"), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
        <div className="text-gray-500">Awakening the world...</div>
      </div>
    </div>
  ),
});

export default function Page() {
  return <WorldChat />;
}

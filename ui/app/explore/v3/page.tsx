import dynamic from "next/dynamic";

const WorldExplorer = dynamic(() => import("./WorldExplorer"), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-500">Loading World Builder...</div>
    </div>
  ),
});

export default function Page() {
  return <WorldExplorer />;
}

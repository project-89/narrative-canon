import { redirect } from "next/navigation";

async function getActiveProject(): Promise<string> {
  try {
    const res = await fetch("http://localhost:3088/api/projects", {
      cache: "no-store",
    });
    if (res.ok) {
      const projects = await res.json();
      const active = projects.find((p: any) => p.isActive);
      if (active) {
        return active.id;
      }
      // If no active project, use the first one
      if (projects.length > 0) {
        return projects[0].id;
      }
    }
  } catch (e) {
    console.error("Failed to fetch projects:", e);
  }
  // Default to demo project
  return "demo";
}

export default async function RootPage() {
  const activeProjectId = await getActiveProject();
  redirect(`/p/${activeProjectId}`);
}

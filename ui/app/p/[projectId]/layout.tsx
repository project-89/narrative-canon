import { ProjectProvider, Project } from "@/lib/project-context";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

async function getProject(projectId: string): Promise<Project | null> {
  try {
    const res = await fetch(`http://localhost:3088/api/projects/${projectId}`, {
      cache: "no-store",
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error("Failed to fetch project:", e);
  }
  return null;
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  return (
    <ProjectProvider projectId={projectId} project={project}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar projectId={projectId} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ProjectProvider>
  );
}

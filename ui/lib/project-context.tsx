"use client";

import { createContext, useContext, ReactNode } from "react";

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
  stats: {
    entities: number;
    relationships: number;
    commits: number;
    branches: number;
  };
  color: string;
}

interface ProjectContextValue {
  projectId: string;
  project: Project | null;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  children,
  projectId,
  project,
}: {
  children: ReactNode;
  projectId: string;
  project: Project | null;
}) {
  return (
    <ProjectContext.Provider value={{ projectId, project }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}

export function useProjectId() {
  const { projectId } = useProject();
  return projectId;
}

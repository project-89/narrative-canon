// Narrative API functions for interacting with the NarrativeGit backend

import apiClient from "./client";

// Types matching the backend NarrativeGit types
export interface Entity {
  id: string;
  name: string;
  type: string;
  description: string;
  traits?: string[];
  atmosphere?: string;
  relationships?: number;
  interactions?: number;
  state?: Record<string, unknown>;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  strength?: number;
  description?: string;
}

export interface Interaction {
  id: string;
  type: "dialogue" | "conflict" | "alliance" | "revelation" | "observation" | "transformation";
  title: string;
  description: string;
  participants: { id: string; name: string; type: string }[];
  scene?: string;
  chapter?: string;
  emotionalTone?: string;
  timestamp: string;
}

export interface Commit {
  id: string;
  hash: string;
  message: string;
  timestamp: string;
  branch: string;
  author: string;
  tags?: string[];
  operations: {
    type: "add" | "modify" | "delete" | "link";
    entityType: string;
    entityName: string;
    details?: string;
  }[];
  metrics?: {
    entitiesChanged: number;
    relationshipsChanged: number;
    consistencyScore: number;
  };
}

export interface Branch {
  id: string;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  isCanon: boolean;
  probability?: number;
  commitCount: number;
  lastCommit: string;
  parentBranch?: string;
  createdAt: string;
}

export interface NarrativeStatus {
  currentBranch: string;
  head: string;
  clean: boolean;
  entities: number;
  relationships: number;
  branches: number;
}

// API Functions

export const narrativeApi = {
  // Status
  getStatus: () => apiClient.get<NarrativeStatus>("/narrative/status"),

  // Entities
  getEntities: () => apiClient.get<Entity[]>("/narrative/entities"),
  getEntity: (id: string) => apiClient.get<Entity>(`/narrative/entities/${id}`),
  createEntity: (entity: Omit<Entity, "id">) =>
    apiClient.post<Entity>("/narrative/entities", entity),
  updateEntity: (id: string, updates: Partial<Entity>) =>
    apiClient.put<Entity>(`/narrative/entities/${id}`, updates),
  deleteEntity: (id: string) => apiClient.delete(`/narrative/entities/${id}`),

  // Relationships
  getRelationships: () => apiClient.get<Relationship[]>("/narrative/relationships"),
  createRelationship: (relationship: Omit<Relationship, "id">) =>
    apiClient.post<Relationship>("/narrative/relationships", relationship),
  deleteRelationship: (id: string) =>
    apiClient.delete(`/narrative/relationships/${id}`),

  // Interactions
  getInteractions: () => apiClient.get<Interaction[]>("/narrative/interactions"),
  getInteraction: (id: string) =>
    apiClient.get<Interaction>(`/narrative/interactions/${id}`),

  // Git Operations
  getCommits: (branch?: string) =>
    apiClient.get<Commit[]>(`/narrative/git/log${branch ? `?branch=${branch}` : ""}`),
  getCommit: (hash: string) => apiClient.get<Commit>(`/narrative/git/commits/${hash}`),
  getDiff: (from: string, to: string) =>
    apiClient.get(`/narrative/git/diff/${from}/${to}`),

  // Branches
  getBranches: () => apiClient.get<Branch[]>("/narrative/git/branches"),
  createBranch: (name: string, from?: string) =>
    apiClient.post<Branch>("/narrative/git/branch", { name, from }),
  checkout: (branch: string) =>
    apiClient.post("/narrative/git/checkout", { branch }),
  mergeBranch: (source: string, target: string, strategy?: "auto" | "manual") =>
    apiClient.post("/narrative/git/merge", { source, target, strategy }),
  deleteBranch: (name: string) =>
    apiClient.delete(`/narrative/git/branches/${name}`),

  // Graph
  getGraph: (depth?: number) =>
    apiClient.get(`/narrative/graph${depth ? `?depth=${depth}` : ""}`),

  // Extraction
  extractNarrative: (text: string, options?: { branch?: string }) =>
    apiClient.post("/narrative/extract", { text, ...options }),

  // Visual Generation
  generatePortrait: (entityId: string) =>
    apiClient.post(`/narrative/visual/portraits/${entityId}`),
  generatePanel: (interactionId: string) =>
    apiClient.post(`/narrative/visual/panels/${interactionId}`),
  getImages: () => apiClient.get("/narrative/visual/images"),
};

export default narrativeApi;

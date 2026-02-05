import { create } from "zustand";
import { narrativeApi, Entity, Relationship, Interaction, Commit, Branch, NarrativeStatus } from "../api/narrative";

interface NarrativeState {
  // Data
  status: NarrativeStatus | null;
  entities: Entity[];
  relationships: Relationship[];
  interactions: Interaction[];
  commits: Commit[];
  branches: Branch[];

  // Loading states
  isLoading: boolean;
  isLoadingEntities: boolean;
  isLoadingCommits: boolean;
  isLoadingBranches: boolean;

  // Errors
  error: string | null;

  // Selected items
  selectedEntityId: string | null;
  selectedCommitId: string | null;
  selectedBranchId: string | null;
  selectedInteractionId: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchEntities: () => Promise<void>;
  fetchRelationships: () => Promise<void>;
  fetchInteractions: () => Promise<void>;
  fetchCommits: (branch?: string) => Promise<void>;
  fetchBranches: () => Promise<void>;
  fetchAll: () => Promise<void>;

  // Selection actions
  selectEntity: (id: string | null) => void;
  selectCommit: (id: string | null) => void;
  selectBranch: (id: string | null) => void;
  selectInteraction: (id: string | null) => void;

  // Mutation actions
  checkout: (branch: string) => Promise<void>;
  createBranch: (name: string, from?: string) => Promise<void>;
  mergeBranch: (source: string, target: string, strategy?: "auto" | "manual") => Promise<void>;
  deleteBranch: (name: string) => Promise<void>;

  // Visual generation
  generatePortrait: (entityId: string) => Promise<void>;
  generatePanel: (interactionId: string) => Promise<void>;

  // Narrative extraction
  extractNarrative: (text: string) => Promise<void>;

  // Error handling
  clearError: () => void;
}

export const useNarrativeStore = create<NarrativeState>((set, get) => ({
  // Initial state
  status: null,
  entities: [],
  relationships: [],
  interactions: [],
  commits: [],
  branches: [],
  isLoading: false,
  isLoadingEntities: false,
  isLoadingCommits: false,
  isLoadingBranches: false,
  error: null,
  selectedEntityId: null,
  selectedCommitId: null,
  selectedBranchId: null,
  selectedInteractionId: null,

  // Fetch actions
  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    const response = await narrativeApi.getStatus();
    if (response.error) {
      set({ error: response.error, isLoading: false });
    } else {
      set({ status: response.data, isLoading: false });
    }
  },

  fetchEntities: async () => {
    set({ isLoadingEntities: true, error: null });
    const response = await narrativeApi.getEntities();
    if (response.error) {
      set({ error: response.error, isLoadingEntities: false });
    } else {
      set({ entities: response.data || [], isLoadingEntities: false });
    }
  },

  fetchRelationships: async () => {
    const response = await narrativeApi.getRelationships();
    if (response.error) {
      set({ error: response.error });
    } else {
      set({ relationships: response.data || [] });
    }
  },

  fetchInteractions: async () => {
    const response = await narrativeApi.getInteractions();
    if (response.error) {
      set({ error: response.error });
    } else {
      set({ interactions: response.data || [] });
    }
  },

  fetchCommits: async (branch?: string) => {
    set({ isLoadingCommits: true, error: null });
    const response = await narrativeApi.getCommits(branch);
    if (response.error) {
      set({ error: response.error, isLoadingCommits: false });
    } else {
      set({ commits: response.data || [], isLoadingCommits: false });
    }
  },

  fetchBranches: async () => {
    set({ isLoadingBranches: true, error: null });
    const response = await narrativeApi.getBranches();
    if (response.error) {
      set({ error: response.error, isLoadingBranches: false });
    } else {
      set({ branches: response.data || [], isLoadingBranches: false });
    }
  },

  fetchAll: async () => {
    const state = get();
    await Promise.all([
      state.fetchStatus(),
      state.fetchEntities(),
      state.fetchRelationships(),
      state.fetchInteractions(),
      state.fetchCommits(),
      state.fetchBranches(),
    ]);
  },

  // Selection actions
  selectEntity: (id) => set({ selectedEntityId: id }),
  selectCommit: (id) => set({ selectedCommitId: id }),
  selectBranch: (id) => set({ selectedBranchId: id }),
  selectInteraction: (id) => set({ selectedInteractionId: id }),

  // Mutation actions
  checkout: async (branch) => {
    set({ isLoading: true, error: null });
    const response = await narrativeApi.checkout(branch);
    if (response.error) {
      set({ error: response.error, isLoading: false });
    } else {
      // Refresh data after checkout
      await get().fetchAll();
      set({ isLoading: false });
    }
  },

  createBranch: async (name, from) => {
    set({ isLoading: true, error: null });
    const response = await narrativeApi.createBranch(name, from);
    if (response.error) {
      set({ error: response.error, isLoading: false });
    } else {
      await get().fetchBranches();
      set({ isLoading: false });
    }
  },

  mergeBranch: async (source, target, strategy) => {
    set({ isLoading: true, error: null });
    const response = await narrativeApi.mergeBranch(source, target, strategy);
    if (response.error) {
      set({ error: response.error, isLoading: false });
    } else {
      await get().fetchAll();
      set({ isLoading: false });
    }
  },

  deleteBranch: async (name) => {
    set({ isLoading: true, error: null });
    const response = await narrativeApi.deleteBranch(name);
    if (response.error) {
      set({ error: response.error, isLoading: false });
    } else {
      await get().fetchBranches();
      set({ isLoading: false });
    }
  },

  // Visual generation
  generatePortrait: async (entityId) => {
    set({ isLoading: true, error: null });
    const response = await narrativeApi.generatePortrait(entityId);
    if (response.error) {
      set({ error: response.error, isLoading: false });
    } else {
      // Could refresh entity data or handle the generated image
      set({ isLoading: false });
    }
  },

  generatePanel: async (interactionId) => {
    set({ isLoading: true, error: null });
    const response = await narrativeApi.generatePanel(interactionId);
    if (response.error) {
      set({ error: response.error, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },

  // Narrative extraction
  extractNarrative: async (text) => {
    set({ isLoading: true, error: null });
    const response = await narrativeApi.extractNarrative(text);
    if (response.error) {
      set({ error: response.error, isLoading: false });
    } else {
      await get().fetchAll();
      set({ isLoading: false });
    }
  },

  // Error handling
  clearError: () => set({ error: null }),
}));

export default useNarrativeStore;

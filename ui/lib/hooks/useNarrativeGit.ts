import { useEffect } from "react";
import { useNarrativeStore } from "../stores/narrative-store";

/**
 * Custom hook for interacting with NarrativeGit.
 * Automatically fetches data on mount and provides convenient access to state and actions.
 */
export function useNarrativeGit(options: { autoFetch?: boolean } = { autoFetch: true }) {
  const store = useNarrativeStore();

  useEffect(() => {
    if (options.autoFetch) {
      store.fetchAll();
    }
  }, [options.autoFetch]);

  return store;
}

/**
 * Hook for working with entities
 */
export function useEntities() {
  const {
    entities,
    isLoadingEntities,
    selectedEntityId,
    selectEntity,
    fetchEntities,
    error,
  } = useNarrativeStore();

  useEffect(() => {
    if (entities.length === 0) {
      fetchEntities();
    }
  }, []);

  const selectedEntity = entities.find((e) => e.id === selectedEntityId);

  return {
    entities,
    isLoading: isLoadingEntities,
    selectedEntity,
    selectedEntityId,
    selectEntity,
    refetch: fetchEntities,
    error,
  };
}

/**
 * Hook for working with commits
 */
export function useCommits(branch?: string) {
  const {
    commits,
    isLoadingCommits,
    selectedCommitId,
    selectCommit,
    fetchCommits,
    error,
  } = useNarrativeStore();

  useEffect(() => {
    fetchCommits(branch);
  }, [branch]);

  const selectedCommit = commits.find((c) => c.id === selectedCommitId);

  return {
    commits,
    isLoading: isLoadingCommits,
    selectedCommit,
    selectedCommitId,
    selectCommit,
    refetch: () => fetchCommits(branch),
    error,
  };
}

/**
 * Hook for working with branches
 */
export function useBranches() {
  const {
    branches,
    isLoadingBranches,
    selectedBranchId,
    selectBranch,
    fetchBranches,
    checkout,
    createBranch,
    mergeBranch,
    deleteBranch,
    error,
  } = useNarrativeStore();

  useEffect(() => {
    if (branches.length === 0) {
      fetchBranches();
    }
  }, []);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const activeBranch = branches.find((b) => b.isActive);

  return {
    branches,
    isLoading: isLoadingBranches,
    selectedBranch,
    selectedBranchId,
    activeBranch,
    selectBranch,
    checkout,
    createBranch,
    mergeBranch,
    deleteBranch,
    refetch: fetchBranches,
    error,
  };
}

/**
 * Hook for working with interactions
 */
export function useInteractions() {
  const {
    interactions,
    selectedInteractionId,
    selectInteraction,
    fetchInteractions,
    error,
  } = useNarrativeStore();

  useEffect(() => {
    if (interactions.length === 0) {
      fetchInteractions();
    }
  }, []);

  const selectedInteraction = interactions.find(
    (i) => i.id === selectedInteractionId
  );

  return {
    interactions,
    selectedInteraction,
    selectedInteractionId,
    selectInteraction,
    refetch: fetchInteractions,
    error,
  };
}

/**
 * Hook for visual generation
 */
export function useVisualGeneration() {
  const { generatePortrait, generatePanel, isLoading, error } =
    useNarrativeStore();

  return {
    generatePortrait,
    generatePanel,
    isGenerating: isLoading,
    error,
  };
}

export default useNarrativeGit;

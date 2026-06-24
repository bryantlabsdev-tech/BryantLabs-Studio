import { useRef, useState } from "react";
import {
  EMPTY_PROJECT_MEMORY,
  type ProjectMemory,
} from "@/core/projectMemory/types";
import {
  normalizeAgentMemoryStore,
  type AgentMemoryStore,
  type MemoryCandidate,
  type MemoryRetrievalResult,
} from "@/core/memory";

export interface ProjectMemoryWorkspaceState {
  readonly projectMemory: ProjectMemory;
  readonly setProjectMemory: React.Dispatch<React.SetStateAction<ProjectMemory>>;
  readonly projectMemoryError: string | null;
  readonly setProjectMemoryError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly projectMemoryRef: React.MutableRefObject<ProjectMemory>;
  readonly agentMemoryStore: AgentMemoryStore;
  readonly setAgentMemoryStore: React.Dispatch<React.SetStateAction<AgentMemoryStore>>;
  readonly agentMemoryStoreRef: React.MutableRefObject<AgentMemoryStore>;
  readonly lastMemoryRetrieval: MemoryRetrievalResult | null;
  readonly setLastMemoryRetrieval: React.Dispatch<
    React.SetStateAction<MemoryRetrievalResult | null>
  >;
  readonly pendingMemoryCandidates: readonly MemoryCandidate[];
  readonly setPendingMemoryCandidates: React.Dispatch<
    React.SetStateAction<readonly MemoryCandidate[]>
  >;
}

/** Project memory and agent memory store state. */
export function useProjectMemoryWorkspaceState(): ProjectMemoryWorkspaceState {
  const [projectMemory, setProjectMemory] = useState<ProjectMemory>(EMPTY_PROJECT_MEMORY);
  const [projectMemoryError, setProjectMemoryError] = useState<string | null>(null);
  const projectMemoryRef = useRef(projectMemory);
  projectMemoryRef.current = projectMemory;

  const [agentMemoryStore, setAgentMemoryStore] = useState<AgentMemoryStore>(
    normalizeAgentMemoryStore(null, ""),
  );
  const agentMemoryStoreRef = useRef(agentMemoryStore);
  agentMemoryStoreRef.current = agentMemoryStore;

  const [lastMemoryRetrieval, setLastMemoryRetrieval] =
    useState<MemoryRetrievalResult | null>(null);
  const [pendingMemoryCandidates, setPendingMemoryCandidates] = useState<
    readonly MemoryCandidate[]
  >([]);

  return {
    projectMemory,
    setProjectMemory,
    projectMemoryError,
    setProjectMemoryError,
    projectMemoryRef,
    agentMemoryStore,
    setAgentMemoryStore,
    agentMemoryStoreRef,
    lastMemoryRetrieval,
    setLastMemoryRetrieval,
    pendingMemoryCandidates,
    setPendingMemoryCandidates,
  };
}

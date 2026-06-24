import { useCallback } from "react";
import { mergeProjectMemoryUpdate } from "@/core/projectMemory/store";
import type { ProjectMemory } from "@/core/projectMemory/types";
import {
  addMemoryRecord,
  applyMemoryCandidates,
  deleteMemoryRecord,
  exportMemoryStorePayload,
  generateMemoryCandidatesFromRun,
  normalizeAgentMemoryStore,
  retrieveMemoriesForContext,
  saveAgentMemoryToDisk,
  updateMemoryRecord,
  updateMemorySettings,
  type AgentMemoryStore,
  type MemoryCandidate,
  type MemoryRecordInput,
  type MemoryRetrievalResult,
} from "@/core/memory";
import type { BryantLabsApi } from "@/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { ProjectScan } from "@/types";

export function useWorkspaceAgentMemoryActions(input: {
  readonly api: BryantLabsApi | undefined;
  readonly projectPath: string | undefined;
  readonly scan: ProjectScan | null;
  readonly projectMemoryRef: React.MutableRefObject<ProjectMemory>;
  readonly agentMemoryStoreRef: React.MutableRefObject<AgentMemoryStore>;
  readonly setProjectMemory: React.Dispatch<React.SetStateAction<ProjectMemory>>;
  readonly setProjectMemoryError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setAgentMemoryStore: React.Dispatch<React.SetStateAction<AgentMemoryStore>>;
  readonly setLastMemoryRetrieval: React.Dispatch<
    React.SetStateAction<MemoryRetrievalResult | null>
  >;
  readonly pendingMemoryCandidates: readonly MemoryCandidate[];
  readonly setPendingMemoryCandidates: React.Dispatch<
    React.SetStateAction<readonly MemoryCandidate[]>
  >;
}) {
  const persistAgentMemoryStore = useCallback(
    async (store: AgentMemoryStore) => {
      input.agentMemoryStoreRef.current = store;
      input.setAgentMemoryStore(store);
      await saveAgentMemoryToDisk(input.api, store);
    },
    [input],
  );

  const saveProjectMemory = useCallback(
    async (
      patch: Partial<
        Pick<
          ProjectMemory,
          "projectName" | "architecture" | "userPreferences" | "notes"
        >
      >,
    ) => {
      if (!input.api?.writeProjectMemory) {
        input.setProjectMemoryError("Project memory is not available.");
        return;
      }
      const next = mergeProjectMemoryUpdate(input.projectMemoryRef.current, patch);
      try {
        const result = await input.api.writeProjectMemory(next);
        if (!result.ok) {
          input.setProjectMemoryError(result.reason ?? "Could not save project memory.");
          return;
        }
        input.setProjectMemory(next);
        input.setProjectMemoryError(null);
      } catch {
        input.setProjectMemoryError("Could not save project memory.");
      }
    },
    [input],
  );

  const resolveMemoriesForPrompt = useCallback(
    (
      prompt: string,
      operation: "ai_plan" | "apply_plan" | "ai_patch" | "agent",
      files?: readonly string[],
    ) => {
      const { store, retrieval } = retrieveMemoriesForContext(
        input.agentMemoryStoreRef.current,
        {
          prompt,
          operation,
          ...(files && files.length > 0 ? { files } : {}),
        },
      );
      void persistAgentMemoryStore(store);
      input.setLastMemoryRetrieval(retrieval);
      return retrieval;
    },
    [input, persistAgentMemoryStore],
  );

  const addAgentMemoryRecord = useCallback(
    async (recordInput: MemoryRecordInput) => {
      const next = addMemoryRecord(input.agentMemoryStoreRef.current, recordInput);
      await persistAgentMemoryStore(next);
    },
    [input.agentMemoryStoreRef, persistAgentMemoryStore],
  );

  const updateAgentMemoryRecord = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          import("@/core/memory/types").AgentMemoryRecord,
          "title" | "content" | "pinned" | "archived" | "tags" | "metadata"
        >
      >,
    ) => {
      const next = updateMemoryRecord(input.agentMemoryStoreRef.current, id, patch);
      await persistAgentMemoryStore(next);
    },
    [input.agentMemoryStoreRef, persistAgentMemoryStore],
  );

  const deleteAgentMemoryRecord = useCallback(
    async (id: string) => {
      const next = deleteMemoryRecord(input.agentMemoryStoreRef.current, id);
      await persistAgentMemoryStore(next);
    },
    [input.agentMemoryStoreRef, persistAgentMemoryStore],
  );

  const setAgentMemoryAutoSave = useCallback(
    async (enabled: boolean) => {
      const next = updateMemorySettings(input.agentMemoryStoreRef.current, {
        autoSaveSuccessfulMemories: enabled,
      });
      await persistAgentMemoryStore(next);
    },
    [input.agentMemoryStoreRef, persistAgentMemoryStore],
  );

  const acceptMemoryCandidate = useCallback(
    async (index: number) => {
      const candidate = input.pendingMemoryCandidates[index];
      if (!candidate) return;
      const next = applyMemoryCandidates(input.agentMemoryStoreRef.current, [candidate]);
      await persistAgentMemoryStore(next);
      input.setPendingMemoryCandidates((prev) => prev.filter((_, i) => i !== index));
    },
    [input, persistAgentMemoryStore],
  );

  const acceptAllMemoryCandidates = useCallback(async () => {
    if (input.pendingMemoryCandidates.length === 0) return;
    const next = applyMemoryCandidates(
      input.agentMemoryStoreRef.current,
      input.pendingMemoryCandidates,
    );
    await persistAgentMemoryStore(next);
    input.setPendingMemoryCandidates([]);
  }, [input, persistAgentMemoryStore]);

  const rejectMemoryCandidates = useCallback(() => {
    input.setPendingMemoryCandidates([]);
  }, [input]);

  const exportAgentMemoryJson = useCallback(
    () => JSON.stringify(exportMemoryStorePayload(input.agentMemoryStoreRef.current), null, 2),
    [input.agentMemoryStoreRef],
  );

  const importAgentMemoryJson = useCallback(
    async (json: string) => {
      const parsed = JSON.parse(json) as unknown;
      const next = normalizeAgentMemoryStore(
        parsed,
        input.projectPath ?? input.agentMemoryStoreRef.current.projectPath,
      );
      await persistAgentMemoryStore(next);
    },
    [input, persistAgentMemoryStore],
  );

  const offerMemoryCandidatesFromRun = useCallback(
    (
      snapshot: GreenfieldRunSnapshot,
      ok: boolean,
      prompt?: string,
      provider?: string | null,
      model?: string | null,
    ) => {
      if (!ok) return;
      const store = input.agentMemoryStoreRef.current;
      const candidates = generateMemoryCandidatesFromRun({
        snapshot,
        ok,
        scan: input.scan,
        ...(prompt ? { prompt } : {}),
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
      });
      if (candidates.length === 0) return;
      if (store.settings.autoSaveSuccessfulMemories) {
        void persistAgentMemoryStore(applyMemoryCandidates(store, candidates));
        return;
      }
      input.setPendingMemoryCandidates(candidates);
    },
    [input, persistAgentMemoryStore],
  );

  return {
    saveProjectMemory,
    persistAgentMemoryStore,
    resolveMemoriesForPrompt,
    addAgentMemoryRecord,
    updateAgentMemoryRecord,
    deleteAgentMemoryRecord,
    setAgentMemoryAutoSave,
    acceptMemoryCandidate,
    acceptAllMemoryCandidates,
    rejectMemoryCandidates,
    exportAgentMemoryJson,
    importAgentMemoryJson,
    offerMemoryCandidatesFromRun,
  };
}

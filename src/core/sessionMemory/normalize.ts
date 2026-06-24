import type { SessionMemorySnapshot } from "./types";
import { emptySessionMemory } from "./store";

function cap<T>(list: readonly T[], max: number): T[] {
  return list.length <= max ? [...list] : list.slice(list.length - max);
}

export function normalizePersistedSessionMemory(
  raw: unknown,
  projectPath: string,
  branch: string | null,
): SessionMemorySnapshot {
  const base = emptySessionMemory(projectPath, branch);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<SessionMemorySnapshot>;

  return {
    ...base,
    projectPath,
    branch,
    lastPrompt: typeof data.lastPrompt === "string" ? data.lastPrompt : null,
    prompts: cap(Array.isArray(data.prompts) ? data.prompts : [], 20),
    plans: cap(Array.isArray(data.plans) ? data.plans : [], 12),
    lastDeterministicPlan:
      data.lastDeterministicPlan && typeof data.lastDeterministicPlan === "object"
        ? data.lastDeterministicPlan
        : null,
    lastAiPlan:
      data.lastAiPlan && typeof data.lastAiPlan === "object" ? data.lastAiPlan : null,
    modifiedFiles: cap(Array.isArray(data.modifiedFiles) ? data.modifiedFiles : [], 24),
    failures: cap(Array.isArray(data.failures) ? data.failures : [], 10),
    autoFixes: cap(Array.isArray(data.autoFixes) ? data.autoFixes : [], 10),
    providerHistory: cap(Array.isArray(data.providerHistory) ? data.providerHistory : [], 30),
    runSummaries: cap(Array.isArray(data.runSummaries) ? data.runSummaries : [], 20),
  };
}

export { emptySessionMemory };

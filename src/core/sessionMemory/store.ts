import type {
  MemoryTimelineEntry,
  SessionAutoFixRecord,
  SessionFailureRecord,
  SessionMemoryClearScope,
  SessionMemorySnapshot,
  SessionPlanRecord,
  SessionPromptRecord,
  SessionProviderRecord,
  SessionRunSummary,
} from "@/core/sessionMemory/types";

const MAX_PROMPTS = 20;
const MAX_PLANS = 12;
const MAX_MODIFIED = 24;
const MAX_FAILURES = 10;
const MAX_AUTOFIX = 10;
const MAX_TIMELINE = 40;

let entryCounter = 0;

function nextId(): string {
  entryCounter += 1;
  return `mem-${Date.now()}-${entryCounter}`;
}

function cap<T>(list: readonly T[], max: number): T[] {
  return list.length <= max ? [...list] : list.slice(list.length - max);
}

export function emptySessionMemory(
  projectPath: string | null = null,
  branch: string | null = null,
): SessionMemorySnapshot {
  return {
    projectPath,
    branch,
    lastPrompt: null,
    prompts: [],
    plans: [],
    lastDeterministicPlan: null,
    lastAiPlan: null,
    modifiedFiles: [],
    failures: [],
    autoFixes: [],
    timeline: [],
    providerHistory: [],
    runSummaries: [],
  };
}

function appendTimeline(
  timeline: readonly MemoryTimelineEntry[],
  entry: Omit<MemoryTimelineEntry, "id" | "at">,
): MemoryTimelineEntry[] {
  const next: MemoryTimelineEntry = {
    id: nextId(),
    at: Date.now(),
    ...entry,
  };
  return cap([...timeline, next], MAX_TIMELINE);
}

export function recordPrompt(
  memory: SessionMemorySnapshot,
  prompt: string,
): SessionMemorySnapshot {
  const trimmed = prompt.trim();
  if (!trimmed) return memory;
  const record: SessionPromptRecord = { prompt: trimmed, at: Date.now() };
  return {
    ...memory,
    lastPrompt: trimmed,
    prompts: cap([...memory.prompts, record], MAX_PROMPTS),
    timeline: appendTimeline(memory.timeline, {
      kind: "prompt",
      title: trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed,
    }),
  };
}

export function recordDeterministicPlan(
  memory: SessionMemorySnapshot,
  prompt: string,
  plan: { summary: string; files: readonly { path: string }[] },
): SessionMemorySnapshot {
  const record: SessionPlanRecord = {
    source: "deterministic",
    prompt: prompt.trim(),
    summary: plan.summary,
    files: plan.files.map((f) => f.path),
    at: Date.now(),
  };
  return {
    ...memory,
    plans: cap([...memory.plans, record], MAX_PLANS),
    lastDeterministicPlan: record,
    timeline: appendTimeline(memory.timeline, {
      kind: "plan",
      title: "Deterministic plan",
      detail: `${record.files.length} file(s) · ${record.summary}`,
    }),
  };
}

export function recordAiPlan(
  memory: SessionMemorySnapshot,
  prompt: string,
  result: {
    ok: boolean;
    plan?: { summary: string; files: readonly { path: string }[] } | null;
  },
): SessionMemorySnapshot {
  if (!result.ok || !result.plan) return memory;
  const record: SessionPlanRecord = {
    source: "ai",
    prompt: prompt.trim(),
    summary: result.plan.summary,
    files: result.plan.files.map((f) => f.path),
    at: Date.now(),
  };
  return {
    ...memory,
    plans: cap([...memory.plans, record], MAX_PLANS),
    lastAiPlan: record,
    timeline: appendTimeline(memory.timeline, {
      kind: "ai_plan",
      title: "AI plan",
      detail: `${record.files.length} file(s) · ${record.summary}`,
    }),
  };
}

export function recordModifiedFiles(
  memory: SessionMemorySnapshot,
  files: readonly string[],
): SessionMemorySnapshot {
  if (files.length === 0) return memory;
  const merged = cap(
    [...new Set([...memory.modifiedFiles, ...files])],
    MAX_MODIFIED,
  );
  return {
    ...memory,
    modifiedFiles: merged,
    timeline: appendTimeline(memory.timeline, {
      kind: "files_modified",
      title: `${files.length} file(s) modified`,
      detail: files.join(", "),
    }),
  };
}

export function recordVerificationFailure(
  memory: SessionMemorySnapshot,
  summary: string,
): SessionMemorySnapshot {
  const trimmed = summary.trim();
  if (!trimmed) return memory;
  const record: SessionFailureRecord = { summary: trimmed, at: Date.now() };
  return {
    ...memory,
    failures: cap([...memory.failures, record], MAX_FAILURES),
    timeline: appendTimeline(memory.timeline, {
      kind: "verification_failure",
      title: "Verification failed",
      detail: trimmed,
    }),
  };
}

export function recordAutoFix(
  memory: SessionMemorySnapshot,
  summary: string,
  files: readonly string[],
): SessionMemorySnapshot {
  const record: SessionAutoFixRecord = {
    summary: summary.trim(),
    files: [...files],
    at: Date.now(),
  };
  return {
    ...memory,
    autoFixes: cap([...memory.autoFixes, record], MAX_AUTOFIX),
    timeline: appendTimeline(memory.timeline, {
      kind: "auto_fix",
      title: "Auto Fix",
      detail: `${summary}${files.length ? ` · ${files.join(", ")}` : ""}`,
    }),
  };
}

export function recordProviderUsage(
  memory: SessionMemorySnapshot,
  input: { provider: string; model: string; operation: string },
): SessionMemorySnapshot {
  const record: SessionProviderRecord = {
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    at: Date.now(),
  };
  return {
    ...memory,
    providerHistory: cap([...memory.providerHistory, record], 30),
  };
}

export function recordRunSummary(
  memory: SessionMemorySnapshot,
  summary: SessionRunSummary,
): SessionMemorySnapshot {
  return {
    ...memory,
    runSummaries: cap([...memory.runSummaries, summary], 20),
  };
}

export function setProjectContext(
  memory: SessionMemorySnapshot,
  projectPath: string | null,
  branch: string | null,
  loaded?: SessionMemorySnapshot | null,
): SessionMemorySnapshot {
  if (memory.projectPath === projectPath && memory.branch === branch) {
    return memory;
  }
  if (loaded && loaded.projectPath === projectPath) {
    return { ...loaded, branch };
  }
  return {
    ...emptySessionMemory(projectPath, branch),
    projectPath,
    branch,
  };
}

export function clearSessionMemory(
  memory: SessionMemorySnapshot,
  scope: SessionMemoryClearScope,
): SessionMemorySnapshot {
  const base = emptySessionMemory(memory.projectPath, memory.branch);
  if (scope === "all") return base;
  if (scope === "prompts") {
    return {
      ...memory,
      lastPrompt: null,
      prompts: [],
      plans: [],
      lastDeterministicPlan: null,
      lastAiPlan: null,
      timeline: memory.timeline.filter(
        (e) =>
          e.kind !== "prompt" &&
          e.kind !== "plan" &&
          e.kind !== "ai_plan",
      ),
    };
  }
  return {
    ...memory,
    failures: [],
    autoFixes: [],
    timeline: memory.timeline.filter(
      (e) => e.kind !== "verification_failure" && e.kind !== "auto_fix",
    ),
  };
}

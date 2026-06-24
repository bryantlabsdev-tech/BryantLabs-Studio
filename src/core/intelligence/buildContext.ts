import { buildCodeGraphSummary } from "@/core/repository/codeGraph";
import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import type { MemoryRetrievalResult } from "@/core/memory/types";
import { planContextMemoriesFromRetrieval } from "@/core/memory/retrieval";
import type {
  ProjectIntelligenceContext,
  ProjectIntelligenceInput,
  ProjectIntelligenceMeta,
} from "./types";

const MAX_CHAT = 8;
const MAX_SNAPSHOTS = 5;
const MAX_FEATURES = 20;

function architectureSummary(scan: ProjectIntelligenceInput["scan"]): string {
  if (!scan) return "No project scan available.";
  const graph = buildCodeGraphSummary(buildRepositoryIndex(scan));
  return [
    scan.repositorySummary?.trim() || "",
    graph.narrative,
    `Entry points: ${scan.summary.entryPoints.join(", ") || "unknown"}`,
    `Stack: ${scan.summary.framework} · ${scan.summary.language} · ${scan.summary.bundler ?? "unknown bundler"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMeta(input: ProjectIntelligenceInput): ProjectIntelligenceMeta {
  const features = input.featureInventory?.features ?? [];
  return {
    architectureSummary: architectureSummary(input.scan),
    scanSummary: input.scan
      ? `${input.scan.summary.totalFiles} files · ${input.scan.summary.framework}`
      : "Scan unavailable",
    featureCount: features.length,
    presentFeatureCount: features.filter((f) => f.present).length,
    healthScore: input.health?.score ?? null,
    recentChanges: input.sessionMemory.modifiedFiles.slice(-8),
  };
}

function formatFeatureLines(input: ProjectIntelligenceInput): string[] {
  const features = input.featureInventory?.features ?? [];
  return features.slice(0, MAX_FEATURES).map((f) => {
    const mark = f.present ? "✓" : "○";
    const ev = f.evidence[0] ? ` (${f.evidence[0]})` : "";
    return `${mark} ${f.label}${ev}`;
  });
}

export function buildProjectIntelligenceContext(
  input: ProjectIntelligenceInput,
  memoryRetrieval?: MemoryRetrievalResult | null,
): ProjectIntelligenceContext {
  const meta = buildMeta(input);
  const memories = memoryRetrieval
    ? planContextMemoriesFromRetrieval(memoryRetrieval)
    : [];

  const followUpLines = input.followUpChat.slice(-MAX_CHAT).map((m) => {
    const who = m.role === "user" ? "User" : "Studio";
    return `- ${who}: ${m.text.slice(0, 160)}`;
  });

  const snapshotLines = input.snapshots.slice(-MAX_SNAPSHOTS).map((s) => {
    return `- Snapshot #${s.index}: ${s.label} (${new Date(s.createdAt).toLocaleString()})`;
  });

  const runLines = input.sessionMemory.runSummaries.slice(-4).map((r) => {
    return `- ${r.ok ? "✓" : "✗"} ${r.summary.slice(0, 100)} (${r.filesModified.length} files)`;
  });

  const providerLines = input.sessionMemory.providerHistory.slice(-4).map((p) => {
    return `- ${p.operation}: ${p.provider} · ${p.model}`;
  });

  const projectNotes = input.projectMemory
    ? [
        input.projectMemory.architecture.trim(),
        input.projectMemory.userPreferences.trim(),
        input.projectMemory.notes.trim(),
      ].filter(Boolean)
    : [];

  const promptBlock = [
    "=== PROJECT INTELLIGENCE ===",
    "",
    "Scan summary:",
    meta.scanSummary,
    "",
    "Architecture:",
    meta.architectureSummary,
    "",
    input.health
      ? `Health: ${input.health.score.toFixed(1)}/10 · TS ${input.health.typecheckOk ? "✓" : "✗"} · Build ${input.health.buildOk ? "✓" : "✗"}`
      : "Health: not yet measured",
    "",
    "Feature inventory (from code):",
    ...formatFeatureLines(input),
    "",
    "Recent modified files:",
    meta.recentChanges.length > 0 ? meta.recentChanges.join(", ") : "(none)",
    "",
    "Session memory:",
    `- Last prompt: ${input.sessionMemory.lastPrompt ?? "(none)"}`,
    `- Plans recorded: ${input.sessionMemory.plans.length}`,
    `- Failures: ${input.sessionMemory.failures.length}`,
    "",
    runLines.length > 0 ? "Recent runs:" : "",
    ...runLines,
    "",
    followUpLines.length > 0 ? "Follow-up thread:" : "",
    ...followUpLines,
    "",
    snapshotLines.length > 0 ? "Snapshots:" : "",
    ...snapshotLines,
    "",
    providerLines.length > 0 ? "Recent providers:" : "",
    ...providerLines,
    "",
    memories.length > 0 ? "Agent memories:" : "",
    ...memories.map((m) => `- [${m.category}] ${m.title}: ${m.content.slice(0, 120)}`),
    "",
    projectNotes.length > 0 ? "Project notes:" : "",
    ...projectNotes.map((n) => `- ${n.slice(0, 200)}`),
    "",
    "=== END PROJECT INTELLIGENCE ===",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i + 1] === ""))
    .join("\n");

  const planContextPatch: Record<string, unknown> = {
    projectIntelligenceSummary: promptBlock,
    featureInventory: (input.featureInventory?.features ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      present: f.present,
    })),
    healthScore: input.health?.score ?? null,
    recentRunSummaries: input.sessionMemory.runSummaries.slice(-4),
    followUpThread: input.followUpChat.slice(-MAX_CHAT).map((m) => ({
      role: m.role,
      text: m.text,
      outcome: m.outcome ?? null,
    })),
    snapshotMetadata: input.snapshots.slice(-MAX_SNAPSHOTS).map((s) => ({
      index: s.index,
      label: s.label,
      createdAt: s.createdAt,
    })),
  };

  if (memories.length > 0) {
    planContextPatch.retrievedMemories = memories;
  }

  return { meta, promptBlock, planContextPatch };
}

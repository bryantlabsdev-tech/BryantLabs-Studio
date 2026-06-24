import type { PlanContext } from "@/core/planner/aiTypes";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { ProjectScan } from "@/types";
import { formatIntentSummary } from "@/core/fileSelection/intent";
import type {
  ContextFileSelectionSection,
  ContextMemorySection,
  ContextRepositorySection,
  ContextSymbolSection,
} from "@/core/contextInspector/types";

export function buildRepositorySection(
  scan: ProjectScan | null,
  context: PlanContext,
): ContextRepositorySection {
  const summary = scan?.summary;
  return {
    summary:
      context.repositorySummary ??
      scan?.repositorySummary ??
      "(no repository summary)",
    framework: summary?.framework ?? context.framework ?? "unknown",
    language: summary?.language ?? context.language ?? "unknown",
    bundler: summary?.bundler ?? context.bundler ?? "unknown",
    packageManager:
      summary?.packageManager ?? context.packageManager ?? "unknown",
    fileCount: summary?.totalFiles ?? context.totalFiles ?? 0,
    componentCount: scan?.repositoryStats.totalComponents ?? 0,
    dependencies: [
      ...(context.dependencies ?? scan?.dependencies ?? []),
    ].slice(0, 48),
  };
}

export function buildMemorySection(
  memory: ProjectMemory,
  context: PlanContext,
): ContextMemorySection {
  const pm = context.projectMemory;
  const projectName = pm?.projectName ?? memory.projectName;
  const architecture = pm?.architecture ?? memory.architecture;
  const preferences = pm?.userPreferences ?? memory.userPreferences;
  const notes = pm?.notes ?? memory.notes;
  const retrieved = context.retrievedMemories ?? [];
  const hasContent = Boolean(
    projectName.trim() ||
      architecture.trim() ||
      preferences.trim() ||
      notes.trim() ||
      retrieved.length > 0,
  );
  return {
    projectName,
    architecture,
    preferences,
    notes,
    hasContent,
    retrievedMemories: retrieved.map((m) => ({
      id: m.id,
      category: m.category,
      title: m.title,
      content: m.content,
      relevanceScore: m.relevanceScore,
      selectionReason: m.selectionReason,
      estimatedTokens: Math.max(1, Math.ceil((m.title.length + m.content.length) / 4)),
    })),
    retrievalTokens: context.memoryRetrievalStats?.totalEstimatedTokens ?? 0,
    retrievalHitCount: context.memoryRetrievalStats?.hitCount ?? retrieved.length,
    retrievalMissCount: context.memoryRetrievalStats?.missCount ?? 0,
  };
}

export function buildFileSelectionSection(
  context: PlanContext,
): ContextFileSelectionSection {
  const fs = context.fileSelection;
  if (!fs) {
    return {
      reasoning: "",
      intentSummary: "",
      selectedFiles: [],
    };
  }
  return {
    reasoning: fs.reasoning,
    intentSummary: formatIntentSummary(fs.intent),
    selectedFiles: fs.selectedFiles.map((f) => ({
      path: f.path,
      score: f.score,
      primaryReason: f.primaryReason,
      reasons: [...f.reasons],
    })),
  };
}

export function buildSymbolSection(context: PlanContext): ContextSymbolSection {
  const relevant = context.relevantSymbols ?? [];
  const components: string[] = [];
  const functions: string[] = [];
  const hooks: string[] = [];
  const types: string[] = [];

  for (const s of relevant) {
    const label = s.line != null ? `${s.name} (${s.path}:${s.line})` : `${s.name} (${s.path})`;
    switch (s.kind) {
      case "component":
        components.push(label);
        break;
      case "hook":
        hooks.push(label);
        break;
      case "function":
        functions.push(label);
        break;
      case "interface":
      case "type":
      case "class":
        types.push(label);
        break;
      default:
        functions.push(label);
    }
  }

  return {
    intelligenceSummary: context.symbolIntelligenceSummary ?? "",
    relevantComponents: components,
    relevantFunctions: functions,
    relevantHooks: hooks,
    relevantTypes: types,
    relevantFiles: (context.relevantFiles ?? []).map((f) => ({
      path: f.path,
      score: f.score,
      reasons: [...f.reasons],
    })),
    relevantSymbols: relevant.map((s) => ({
      name: s.name,
      kind: s.kind,
      path: s.path,
      ...(s.line != null ? { line: s.line } : {}),
      reason: s.reason,
    })),
  };
}

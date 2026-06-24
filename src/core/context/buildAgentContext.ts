import { buildCodeGraphSummary } from "@/core/repository/codeGraph";
import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import { buildPlanContext, buildApplyPlanPatchContext } from "@/core/planner/context";
import type { PlanContext } from "@/core/planner/aiTypes";
import { buildAIPlanContextWithSession } from "@/core/sessionMemory/promptContext";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { ProjectIntelligence } from "@/core/projectIntelligence/types";
import { isPreferredFixPrompt } from "@/core/projectIntelligence/recommendations";
import type { ProjectScan } from "@/types";
import type { MemoryRetrievalResult } from "@/core/memory/types";
import { attachRetrievedMemoriesToContext } from "@/core/memory/integration";
import type {
  SessionMemoryDiagnostics,
  SessionMemorySnapshot,
} from "@/core/sessionMemory/types";
import {
  mergeIntelligenceIntoPlanContext,
  type ProjectIntelligenceContext,
} from "@/core/intelligence/service";
import { boostComposerMentionsInContext } from "@/core/agent/composerMentions";
import {
  attachReferencedFileContents,
  type ReferencedFileContent,
} from "@/core/context/referencedFileContext";
import {
  buildProjectMemoryContext,
  type ProjectMemoryContextResult,
} from "@/core/projectIntelligence/buildProjectMemoryContext";

const MAX_CONTEXT_DEPENDENCIES = 40;

function hasProjectMemoryContent(memory: ProjectMemory | null): boolean {
  if (!memory) return false;
  return Boolean(
    memory.projectName.trim() ||
      memory.architecture.trim() ||
      memory.userPreferences.trim() ||
      memory.notes.trim(),
  );
}

function projectMemoryForContext(
  memory: ProjectMemory | null,
): PlanContext["projectMemory"] | undefined {
  if (!hasProjectMemoryContent(memory)) return undefined;
  return {
    projectName: memory!.projectName.trim(),
    architecture: memory!.architecture.trim(),
    userPreferences: memory!.userPreferences.trim(),
    notes: memory!.notes.trim(),
  };
}

function repositoryFieldsFromScan(scan: ProjectScan): Pick<
  PlanContext,
  | "bundler"
  | "repositorySummary"
  | "dependencies"
> {
  return {
    bundler: scan.summary.bundler ?? "unknown",
    repositorySummary:
      scan.repositorySummary?.trim() ||
      [
        `Project: ${scan.summary.name}`,
        `Framework: ${scan.summary.framework}`,
        `Language: ${scan.summary.language}`,
      ].join("\n"),
    dependencies: (scan.dependencies ?? []).slice(0, MAX_CONTEXT_DEPENDENCIES),
  };
}

function attachRepositoryIntelligence(
  context: PlanContext,
  scan: ProjectScan,
  projectMemory: ProjectMemory | null,
): PlanContext {
  const mem = projectMemoryForContext(projectMemory);
  const codeGraph = buildCodeGraphSummary(buildRepositoryIndex(scan));
  return {
    ...context,
    ...repositoryFieldsFromScan(scan),
    symbolIntelligenceSummary:
      context.symbolIntelligenceSummary ?? codeGraph.narrative,
    ...(mem ? { projectMemory: mem } : {}),
  };
}

/** Full agent / AI plan context: relevance, session memory, repo summary, project memory. */
export function buildAgentPlanContext(
  scan: ProjectScan,
  userPrompt: string,
  sessionMemory: SessionMemorySnapshot,
  projectMemory: ProjectMemory | null,
  projectPath?: string | null,
  memoryRetrieval?: MemoryRetrievalResult | null,
  intelligence?: ProjectIntelligenceContext | null,
  projectIntelligence?: ProjectIntelligence | null,
  route?: string | null,
): {
  context: PlanContext;
  diagnostics: SessionMemoryDiagnostics;
  projectMemoryInjection: ProjectMemoryContextResult;
} {
  const { context, diagnostics } = buildAIPlanContextWithSession(
    scan,
    userPrompt,
    sessionMemory,
    {
      projectMemory,
      projectPath: projectPath ?? null,
    },
  );
  let enriched = attachRepositoryIntelligence(context, scan, projectMemory);
  enriched = attachRetrievedMemoriesToContext(enriched, memoryRetrieval);
  if (intelligence) {
    enriched = mergeIntelligenceIntoPlanContext(enriched, intelligence);
  }
  const projectMemoryInjection = buildProjectMemoryContext(projectIntelligence, {
    ...(route != null ? { route } : {}),
    prompt: userPrompt,
    recommendationUsed: isPreferredFixPrompt(userPrompt),
  });
  if (projectMemoryInjection.injected) {
    enriched = {
      ...enriched,
      projectMemoryContext: projectMemoryInjection.text,
      projectIntelligenceSummary: [
        enriched.projectIntelligenceSummary,
        projectMemoryInjection.text,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  enriched = boostComposerMentionsInContext(enriched, userPrompt, scan);
  return { context: enriched, diagnostics, projectMemoryInjection };
}

/** Apply Plan patch context — includes repo summary and project memory; slim file lists when requested. */
export function buildAgentApplyPlanContext(
  scan: ProjectScan,
  opts: {
    userPrompt?: string;
    projectMemory: ProjectMemory | null;
    sessionMemory?: SessionMemorySnapshot | null;
    projectPath?: string | null;
    slim?: boolean;
    memoryRetrieval?: MemoryRetrievalResult | null;
    intelligence?: ProjectIntelligenceContext | null;
    projectIntelligence?: ProjectIntelligence | null;
    route?: string | null;
    referencedContents?: readonly ReferencedFileContent[];
  },
): PlanContext {
  const base = opts.slim
    ? buildApplyPlanPatchContext(scan)
    : buildPlanContext(scan, opts.userPrompt?.trim() || undefined, {
        projectMemory: opts.projectMemory,
        sessionMemory: opts.sessionMemory ?? null,
        projectPath: opts.projectPath ?? null,
      });
  let enriched = attachRepositoryIntelligence(base, scan, opts.projectMemory);
  enriched = attachRetrievedMemoriesToContext(enriched, opts.memoryRetrieval);
  if (opts.intelligence) {
    enriched = mergeIntelligenceIntoPlanContext(enriched, opts.intelligence);
  }
  const projectMemoryInjection = buildProjectMemoryContext(opts.projectIntelligence ?? null, {
    ...(opts.route != null ? { route: opts.route } : {}),
    ...(opts.userPrompt != null ? { prompt: opts.userPrompt } : {}),
    recommendationUsed: isPreferredFixPrompt(opts.userPrompt ?? ""),
  });
  if (projectMemoryInjection.injected) {
    enriched = {
      ...enriched,
      projectMemoryContext: projectMemoryInjection.text,
      projectIntelligenceSummary: [
        enriched.projectIntelligenceSummary,
        projectMemoryInjection.text,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  if (opts.userPrompt?.trim()) {
    enriched = boostComposerMentionsInContext(enriched, opts.userPrompt, scan);
  }
  if (opts.referencedContents?.length) {
    enriched = attachReferencedFileContents(enriched, opts.referencedContents);
  }
  return enriched;
}

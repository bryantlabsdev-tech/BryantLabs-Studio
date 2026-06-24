import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import { auditProjectForEdit } from "@/core/agent/projectEditAudit";
import { buildRunInspectorViewModel } from "@/core/agent/runInspector";
import { isPreferredFixPrompt } from "@/core/projectIntelligence/recommendations";
import { bumpFixConfidence } from "@/core/projectIntelligence/confidence";
import { generateAgentLearnings } from "@/core/projectIntelligence/learnings";
import {
  loadProjectIntelligence,
  saveProjectIntelligence,
} from "@/core/projectIntelligence/store";
import type {
  FailedFixMemory,
  FixRecord,
  ProjectIntelligence,
  RecurringIssue,
} from "@/core/projectIntelligence/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { ProjectScan } from "@/types";

const MAX_LEARNINGS = 40;

function bumpIssue(
  issues: readonly RecurringIssue[],
  id: string,
  label: string,
): RecurringIssue[] {
  const existing = issues.find((item) => item.id === id);
  if (existing) {
    return issues.map((item) =>
      item.id === id ? { ...item, occurrences: item.occurrences + 1 } : item,
    );
  }
  return [...issues, { id, label, occurrences: 1 }];
}

function bumpFix(
  fixes: readonly FixRecord[],
  id: string,
  label: string,
  succeeded: boolean,
): FixRecord[] {
  const existing = fixes.find((item) => item.id === id);
  if (existing) {
    return fixes.map((item) =>
      item.id === id
        ? { ...item, occurrences: item.occurrences + 1, succeeded }
        : item,
    );
  }
  return [...fixes, { id, label, occurrences: 1, succeeded }];
}

function bumpFailedFixMemory(
  items: readonly FailedFixMemory[],
  label: string,
  issueId: string | null,
  at = Date.now(),
): FailedFixMemory[] {
  const id = label.trim();
  const existing = items.find((item) => item.id === id);
  if (existing) {
    return items.map((item) =>
      item.id === id
        ? { ...item, occurrences: item.occurrences + 1, lastAt: at, issueId: issueId ?? item.issueId }
        : item,
    );
  }
  return [...items, { id, label, issueId, occurrences: 1, lastAt: at }];
}

function detectUiPatterns(scan: ProjectScan | null): string[] {
  if (!scan) return [];
  const patterns = new Set<string>();
  const deps = scan.dependencies.map((dep) => dep.name.toLowerCase());
  const componentCount = scan.repositoryStats.totalComponents;

  if (componentCount >= 3) patterns.add("Component driven");
  if (deps.some((name) => name.includes("radix") || name.includes("@radix-ui"))) {
    patterns.add("Shadcn UI");
  }
  if (deps.includes("tailwindcss") || scan.files.some((f) => f.path.endsWith("tailwind.config.ts"))) {
    patterns.add("Tailwind utility classes");
  }
  if (scan.summary.detections.react) patterns.add("React component tree");

  return [...patterns];
}

function inferStylingSystem(scan: ProjectScan | null): string {
  if (!scan) return "";
  const deps = scan.dependencies.map((dep) => dep.name.toLowerCase());
  if (deps.includes("tailwindcss")) return "Tailwind";
  if (deps.includes("styled-components")) return "styled-components";
  if (deps.includes("@emotion/react")) return "Emotion";
  return scan.summary.framework.includes("CSS") ? "CSS" : "";
}

function mergeUnique(values: readonly string[], next: readonly string[]): string[] {
  return [...new Set([...values, ...next])];
}

function mergeLearnings(
  current: ProjectIntelligence["recentLearnings"],
  incoming: ReturnType<typeof generateAgentLearnings>,
): ProjectIntelligence["recentLearnings"] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const learning of incoming) {
    byId.set(learning.id, learning);
  }
  return [...byId.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_LEARNINGS);
}

function extractFailedFixLabels(
  entries: readonly GreenfieldRunLogEntry[],
  artifact: AgentRunArtifact,
): { readonly label: string; readonly issueId: string | null }[] {
  const labels: { readonly label: string; readonly issueId: string | null }[] = [];
  for (const entry of entries) {
    const text = `${entry.message} ${entry.details ?? ""}`;
    if (/invalid json/i.test(text) && /coder|provider|patch/i.test(text)) {
      labels.push({ label: "coder stage returned invalid JSON", issueId: null });
    }
    if (/json patch failed/i.test(text)) {
      labels.push({
        label: `${artifact.provider ?? "provider"} JSON patch failed`,
        issueId: null,
      });
    }
    if (/rejected by.*allowlist|not in allowlist/i.test(text)) {
      const match = text.match(/([\w./-]+\.(?:tsx?|jsx?|css))/i);
      labels.push({
        label: `${match?.[1] ?? "file"} rejected by UI allowlist`,
        issueId: null,
      });
    }
  }
  if (artifact.outcome === "failed" && labels.length === 0) {
    const reason =
      artifact.diagnosticReport?.errorMessage ??
      artifact.card.failureDiagnosis?.reason ??
      null;
    if (reason) {
      labels.push({ label: reason.slice(0, 120), issueId: null });
    }
  }
  return labels;
}

function issueFixPairs(input: {
  readonly auditIssues: readonly string[];
  readonly fallbackFix: string | null;
  readonly overflowFix: string | null;
}): { readonly issueId: string; readonly fixLabel: string }[] {
  const pairs: { readonly issueId: string; readonly fixLabel: string }[] = [];
  for (const issue of input.auditIssues) {
    if (issue === "rows_overflow" && input.overflowFix) {
      pairs.push({ issueId: issue, fixLabel: "overflow-x-auto wrapper" });
    } else if (input.fallbackFix) {
      pairs.push({ issueId: issue, fixLabel: input.fallbackFix });
    }
  }
  if (pairs.length === 0 && input.overflowFix) {
    pairs.push({ issueId: "rows_overflow", fixLabel: "overflow-x-auto wrapper" });
  }
  return pairs;
}

export function updateProjectIntelligenceFromRun(input: {
  readonly projectPath: string | null | undefined;
  readonly projectName?: string | null;
  readonly scan: ProjectScan | null;
  readonly artifact: AgentRunArtifact;
}): ProjectIntelligence {
  const scope = input.projectPath;
  const current = loadProjectIntelligence(scope);
  const learnings = generateAgentLearnings(input.artifact);
  const snapshot = greenfieldSnapshotFromArtifact(input.artifact);
  const entries = input.artifact.logEntries ?? snapshot.entries;
  const audit = input.scan ? auditProjectForEdit(input.scan) : null;
  const inspector = buildRunInspectorViewModel({
    runId: input.artifact.runId,
    runNumber: input.artifact.runNumber,
    prompt: input.artifact.prompt,
    outcome: input.artifact.outcome,
    route: input.artifact.timeline?.route ?? null,
    greenfieldRun: snapshot,
    artifact: input.artifact,
    durationMs: input.artifact.durationMs,
    provider: input.artifact.provider,
    model: input.artifact.model,
    startedAt: input.artifact.startedAt,
    endedAt: input.artifact.endedAt,
  });

  let next: ProjectIntelligence = {
    ...current,
    projectId: scope?.trim() || current.projectId,
    projectName: input.projectName?.trim() || current.projectName,
    recentLearnings: mergeLearnings(current.recentLearnings, learnings),
    updatedAt: Date.now(),
  };

  if (input.scan) {
    const summary = input.scan.summary;
    next = {
      ...next,
      framework: summary.framework || next.framework,
      language: summary.language || next.language,
      buildSystem: summary.bundler || next.buildSystem,
      stylingSystem: inferStylingSystem(input.scan) || next.stylingSystem,
      packageManager: summary.packageManager || next.packageManager,
      commonFileLocations: mergeUnique(
        next.commonFileLocations,
        audit?.keyFiles ?? [],
      ).slice(0, 16),
      detectedArchitecture: audit?.projectType || next.detectedArchitecture,
      recurringUiPatterns: mergeUnique(
        next.recurringUiPatterns,
        detectUiPatterns(input.scan),
      ).slice(0, 12),
    };
  }

  const auditIssues = snapshot.uiAuditResult?.issues ?? [];
  for (const issue of auditIssues) {
    next = {
      ...next,
      recurringAuditIssues: bumpIssue(next.recurringAuditIssues, issue, issue),
    };
  }

  const fallbackFix = inspector.apply?.deterministicFallbackUsed
    ? "deterministic fallback patch"
    : null;
  const overflowFix = input.artifact.filesModified.some((path) =>
    /overflow|table|scroll/i.test(path),
  )
    ? "responsive table wrapper"
    : null;
  const fixPairs = issueFixPairs({ auditIssues, fallbackFix, overflowFix });
  const succeeded = input.artifact.outcome === "success";
  const at = input.artifact.endedAt || Date.now();

  for (const pair of fixPairs) {
    next = {
      ...next,
      fixConfidence: bumpFixConfidence(
        next.fixConfidence,
        pair.issueId,
        pair.fixLabel,
        succeeded,
        at,
      ),
    };
  }

  if (succeeded) {
    if (fallbackFix) {
      next = {
        ...next,
        successfulFixes: bumpFix(next.successfulFixes, fallbackFix, fallbackFix, true),
      };
    }
    if (overflowFix) {
      next = {
        ...next,
        successfulFixes: bumpFix(
          next.successfulFixes,
          overflowFix,
          "overflow-x auto container",
          true,
        ),
      };
    }
    if (isPreferredFixPrompt(input.artifact.prompt)) {
      for (const pair of fixPairs) {
        next = {
          ...next,
          fixConfidence: bumpFixConfidence(
            next.fixConfidence,
            pair.issueId,
            pair.fixLabel,
            true,
            at,
          ),
        };
      }
    }
  } else {
    for (const failed of extractFailedFixLabels(entries, input.artifact)) {
      next = {
        ...next,
        failedFixMemory: bumpFailedFixMemory(
          next.failedFixMemory,
          failed.label,
          failed.issueId,
          at,
        ),
      };
    }
    const attempted = fallbackFix ?? overflowFix;
    if (attempted) {
      next = {
        ...next,
        failedFixes: bumpFix(next.failedFixes, attempted, attempted, false),
      };
      for (const pair of fixPairs) {
        next = {
          ...next,
          fixConfidence: bumpFixConfidence(
            next.fixConfidence,
            pair.issueId,
            pair.fixLabel,
            false,
            at,
          ),
        };
      }
    }
  }

  saveProjectIntelligence(scope, next);
  return next;
}

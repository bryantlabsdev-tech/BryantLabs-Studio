import { topFixForIssue } from "@/core/projectIntelligence/confidence";
import {
  PROJECT_MEMORY_CONTEXT_MAX_CHARS,
  shouldInjectProjectMemory,
  stripSecretsFromMemoryText,
  truncateMemoryContext,
} from "@/core/projectIntelligence/memoryRoutes";
import type {
  ProjectIntelligence,
  ProjectMemoryInjectionMeta,
} from "@/core/projectIntelligence/types";

export interface ProjectMemoryContextResult {
  readonly injected: boolean;
  readonly text: string;
  readonly meta: ProjectMemoryInjectionMeta;
}

function stackLines(intelligence: ProjectIntelligence): string[] {
  const items = [
    intelligence.framework,
    intelligence.language,
    intelligence.buildSystem,
    intelligence.stylingSystem,
  ].filter(Boolean);
  return items.length > 0 ? items : [];
}

function formatIssueFixPairs(intelligence: ProjectIntelligence): string[] {
  const lines: string[] = [];
  for (const issue of intelligence.recurringAuditIssues.slice(0, 6)) {
    const topFix = topFixForIssue(intelligence.fixConfidence, issue.id);
    if (topFix) {
      lines.push(
        `- ${issue.label} → ${topFix.fixLabel} (${topFix.confidenceScore}% confidence)`,
      );
      continue;
    }
    const related = intelligence.successfulFixes.find((fix) =>
      fix.label.toLowerCase().includes(issue.id.replace(/_/g, " ")),
    );
    if (related) {
      lines.push(`- ${issue.label} → ${related.label}`);
    }
  }
  return lines;
}

function formatFailedFixes(intelligence: ProjectIntelligence): string[] {
  const fromMemory = intelligence.failedFixMemory.slice(0, 5).map((item) => `- ${item.label}`);
  if (fromMemory.length > 0) return fromMemory;
  return intelligence.failedFixes.slice(0, 5).map((fix) => `- ${fix.label}`);
}

export function hasProjectMemoryContent(intelligence: ProjectIntelligence | null | undefined): boolean {
  if (!intelligence) return false;
  return Boolean(
    intelligence.framework ||
      intelligence.recurringUiPatterns.length > 0 ||
      intelligence.recurringAuditIssues.length > 0 ||
      intelligence.successfulFixes.length > 0 ||
      intelligence.fixConfidence.length > 0 ||
      intelligence.failedFixMemory.length > 0 ||
      intelligence.failedFixes.length > 0,
  );
}

export function buildProjectMemoryContext(
  intelligence: ProjectIntelligence | null | undefined,
  input?: {
    readonly route?: string | null;
    readonly prompt?: string | null;
    readonly recommendationUsed?: boolean;
  },
): ProjectMemoryContextResult {
  const empty: ProjectMemoryContextResult = {
    injected: false,
    text: "",
    meta: {
      injected: false,
      contextSize: 0,
      recommendationUsed: Boolean(input?.recommendationUsed),
    },
  };
  if (!intelligence || !hasProjectMemoryContent(intelligence)) return empty;
  if (!shouldInjectProjectMemory(input?.route, input?.prompt)) return empty;

  const stack = stackLines(intelligence);
  const patterns = intelligence.recurringUiPatterns.slice(0, 6);
  const issues = intelligence.recurringAuditIssues.slice(0, 6).map(
    (issue) => `- ${issue.label}: ${issue.occurrences} occurrences`,
  );
  const successful = formatIssueFixPairs(intelligence);
  const failed = formatFailedFixes(intelligence);

  const sections: string[] = ["Project Memory:"];
  if (stack.length > 0) {
    sections.push("", "Stack:", ...stack.map((item) => `- ${item}`));
  }
  if (patterns.length > 0) {
    sections.push("", "Known UI Patterns:", ...patterns.map((item) => `- ${item}`));
  }
  if (issues.length > 0) {
    sections.push("", "Recurring Issues:", ...issues);
  }
  if (successful.length > 0) {
    sections.push("", "Previous Successful Fixes:", ...successful);
  }
  if (failed.length > 0) {
    sections.push("", "Previously Failed Fixes (avoid):", ...failed);
  }
  sections.push(
    "",
    "Guidance:",
    "Use existing project patterns.",
    "Prefer previously successful fixes when applicable.",
    "Do not repeat previously failed fixes.",
  );

  const raw = stripSecretsFromMemoryText(sections.join("\n"));
  const text = truncateMemoryContext(raw, PROJECT_MEMORY_CONTEXT_MAX_CHARS);
  if (!text.trim()) return empty;

  return {
    injected: true,
    text,
    meta: {
      injected: true,
      contextSize: text.length,
      recommendationUsed: Boolean(input?.recommendationUsed),
    },
  };
}

export function mergeProjectMemoryIntoPlannerPreview(
  userPrompt: string,
  memoryText: string,
): string {
  if (!memoryText.trim()) return userPrompt;
  return [userPrompt, "", memoryText, "", "PlanContext JSON attached separately."].join("\n");
}

export function readProjectMemoryInjectionMeta(
  greenfieldRun: {
    readonly entries: readonly import("@/core/greenfield/runLog").GreenfieldRunLogEntry[];
    readonly projectMemoryInjection: ProjectMemoryInjectionMeta | null;
  },
): ProjectMemoryInjectionMeta | null {
  if (greenfieldRun.projectMemoryInjection?.injected) {
    return greenfieldRun.projectMemoryInjection;
  }
  const entry = [...greenfieldRun.entries]
    .reverse()
    .find((item) => /project memory context injected/i.test(item.message));
  if (!entry) return null;
  const sizeMatch = entry.details?.match(/size=(\d+)/);
  return {
    injected: true,
    contextSize: sizeMatch ? Number(sizeMatch[1]) : 0,
    recommendationUsed: /recommendation=true/i.test(entry.details ?? ""),
  };
}

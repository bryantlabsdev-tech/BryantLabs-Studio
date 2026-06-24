import type {
  MemoryRecommendation,
  ProjectIntelligence,
} from "@/core/projectIntelligence/types";
import { topFixForIssue } from "@/core/projectIntelligence/confidence";
import { UI_AUDIT_ROWS_OVERFLOW_FIX_GUIDANCE } from "@/core/agent/uiAuditAdvisoryUx";

export const PREFERRED_FIX_PROMPT_MARKER =
  "Apply the previously successful fix for this project.";

function humanizeIssue(issueId: string): string {
  return issueId.replace(/_/g, " ");
}

export function buildMemoryRecommendations(
  intelligence: ProjectIntelligence,
): MemoryRecommendation[] {
  const recommendations: MemoryRecommendation[] = [];
  for (const issue of intelligence.recurringAuditIssues) {
    if (issue.occurrences < 2) continue;
    const topFix = topFixForIssue(intelligence.fixConfidence, issue.id);
    const fallbackFix = intelligence.successfulFixes.find((fix) =>
      fix.label.toLowerCase().includes(issue.id.replace(/_/g, " ")),
    );
    const recommendedFix = topFix?.fixLabel ?? fallbackFix?.label;
    if (!recommendedFix) continue;
    recommendations.push({
      issueId: issue.id,
      issueLabel: humanizeIssue(issue.label),
      occurrences: issue.occurrences,
      recommendedFix,
      confidenceScore: topFix?.confidenceScore ?? 50,
    });
  }
  return recommendations.sort(
    (a, b) => b.occurrences - a.occurrences || b.confidenceScore - a.confidenceScore,
  );
}

export function buildPreferredFixPrompt(recommendation: MemoryRecommendation): string {
  const lines = [
    PREFERRED_FIX_PROMPT_MARKER,
    "",
    `Issue: ${recommendation.issueId} (${recommendation.occurrences} occurrences)`,
    `Most successful fix: ${recommendation.recommendedFix}`,
    `Confidence: ${recommendation.confidenceScore}%`,
    "",
    "Use existing project patterns.",
    "Prefer previously successful fixes when applicable.",
    "Do not repeat previously failed fixes.",
  ];
  if (recommendation.issueId === "rows_overflow") {
    lines.push("", "Guidance:");
    for (const item of UI_AUDIT_ROWS_OVERFLOW_FIX_GUIDANCE) {
      lines.push(`- ${item}`);
    }
  }
  return lines.join("\n");
}

export function isPreferredFixPrompt(prompt: string): boolean {
  return prompt.trimStart().startsWith(PREFERRED_FIX_PROMPT_MARKER);
}

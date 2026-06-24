export const UI_AUDIT_FIX_PROMPT_MARKER =
  "Fix the UI audit advisory for this generated app.";

export function isUiAuditFixPrompt(prompt: string): boolean {
  return prompt.trimStart().startsWith(UI_AUDIT_FIX_PROMPT_MARKER);
}

const UI_AUDIT_ISSUE_RECOMMENDATIONS: Readonly<Record<string, string>> = {
  rows_overflow: "Enable horizontal scrolling on comparison tables under 768px.",
  insufficient_cells: "Add enough visible layout sections/items for this layout type.",
  no_board: "Ensure the main layout container is rendered and visible.",
};

export const UI_AUDIT_GENERIC_RECOMMENDATION =
  "Review layout responsiveness and spacing.";

export const UI_AUDIT_ROWS_OVERFLOW_FIX_GUIDANCE = [
  "Prefer adding responsive table/card behavior.",
  "On mobile, allow horizontal scrolling or convert rows into stacked cards.",
  "Preserve desktop layout.",
] as const;

const UI_AUDIT_ISSUE_FIX_GUIDANCE: Readonly<Record<string, readonly string[]>> = {
  rows_overflow: UI_AUDIT_ROWS_OVERFLOW_FIX_GUIDANCE,
};

export interface UiAuditAdvisoryFixInput {
  readonly layoutType: string;
  readonly score: number;
  readonly issues: readonly string[];
  readonly recommendations: readonly string[];
}

export function hasFixableUiAuditAdvisory(
  advisory: Pick<UiAuditAdvisoryFixInput, "issues" | "recommendations">,
): boolean {
  return advisory.issues.length > 0 && advisory.recommendations.length > 0;
}

export function uiAuditAdvisoryFixButtonLabel(running: boolean): string {
  return running ? "Fixing..." : "Fix with AI";
}

export function isUiAuditAdvisoryFixDisabled(input: {
  readonly runActive: boolean;
  readonly fixRunning?: boolean;
}): boolean {
  return input.runActive || input.fixRunning === true;
}

export function buildUiAuditAdvisoryFixPrompt(
  advisory: UiAuditAdvisoryFixInput,
): string {
  const lines = [
    UI_AUDIT_FIX_PROMPT_MARKER,
    "",
    `Layout: ${advisory.layoutType}`,
    `Score: ${advisory.score}`,
  ];

  for (const issue of advisory.issues) {
    lines.push(`Issue: ${issue}`);
    lines.push(`Recommendation: ${recommendationForUiAuditIssue(issue)}`);
    lines.push("");
  }

  const guidanceIssues = advisory.issues.filter((issue) => UI_AUDIT_ISSUE_FIX_GUIDANCE[issue]);
  if (guidanceIssues.length > 0) {
    for (const issue of guidanceIssues) {
      const guidance = UI_AUDIT_ISSUE_FIX_GUIDANCE[issue] ?? [];
      if (guidance.length === 0) continue;
      lines.push(`For ${issue}:`);
      for (const item of guidance) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  lines.push(
    "Make the smallest safe code change needed.",
    "Do not redesign the app.",
    "Do not change unrelated features.",
    "After fixing, run TypeScript, build, preview, and UI audit again.",
  );

  return lines.join("\n").trim();
}

export function parseUiAuditAdvisoryFixPrompt(
  prompt: string,
): UiAuditAdvisoryFixInput | null {
  if (!isUiAuditFixPrompt(prompt)) return null;
  const layoutMatch = prompt.match(/^Layout:\s*(.+)$/m);
  const scoreMatch = prompt.match(/^Score:\s*(\d+)/m);
  const issues = [...prompt.matchAll(/^Issue:\s*(.+)$/gm)].map((match) => match[1]!.trim());
  const recommendations = [
    ...prompt.matchAll(/^Recommendation:\s*(.+)$/gm),
  ].map((match) => match[1]!.trim());
  if (!layoutMatch) return null;
  return {
    layoutType: layoutMatch[1]!.trim(),
    score: scoreMatch ? Number(scoreMatch[1]) : 0,
    issues,
    recommendations,
  };
}

export function recommendationForUiAuditIssue(issue: string): string {
  return UI_AUDIT_ISSUE_RECOMMENDATIONS[issue] ?? UI_AUDIT_GENERIC_RECOMMENDATION;
}

export function recommendationsForUiAuditIssues(
  issues: readonly string[],
): readonly string[] {
  if (issues.length === 0) return [UI_AUDIT_GENERIC_RECOMMENDATION];
  return [...new Set(issues.map(recommendationForUiAuditIssue))];
}

export function formatAdvisoryVerificationCollapsedLabel(
  label: string,
  score: number,
): string {
  return `⚠️ ${label} — Advisory (${score})`;
}

export function advisoryDetailsVisible(expanded: boolean): boolean {
  return expanded;
}

export function toggleAdvisoryExpanded(expanded: boolean): boolean {
  return !expanded;
}

export function buildUiAuditAdvisoryDetailLines(
  advisory: {
    readonly layoutType: string;
    readonly score: number;
    readonly issues: readonly string[];
    readonly recommendations: readonly string[];
  },
): {
  readonly layout: string;
  readonly score: number;
  readonly issues: readonly string[];
  readonly recommendations: readonly string[];
} {
  return {
    layout: advisory.layoutType,
    score: advisory.score,
    issues: [...advisory.issues],
    recommendations: [...advisory.recommendations],
  };
}

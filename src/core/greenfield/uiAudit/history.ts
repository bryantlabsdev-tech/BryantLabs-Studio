import type {
  UiAuditHistoryEntry,
  UiAuditResult,
} from "@/core/greenfield/uiAudit/types";

export function createUiAuditHistoryEntry(
  audit: UiAuditResult,
  opts?: { repaired?: boolean; strategy?: string },
): UiAuditHistoryEntry {
  return {
    at: new Date().toISOString(),
    type: audit.type,
    score: audit.score,
    issues: [...audit.issues],
    ok: audit.ok,
    repaired: opts?.repaired ?? false,
    ...(opts?.strategy ? { strategy: opts.strategy } : {}),
  };
}

export function appendUiAuditHistory(
  history: readonly UiAuditHistoryEntry[],
  entry: UiAuditHistoryEntry,
): UiAuditHistoryEntry[] {
  return [...history, entry];
}

/** Summarize recurring failure patterns for run summary / learning. */
export function summarizeUiAuditPatterns(
  history: readonly UiAuditHistoryEntry[],
): readonly { issue: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of history) {
    if (entry.ok) continue;
    for (const issue of entry.issues) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count);
}

export function formatUiAuditHistorySection(
  history: readonly UiAuditHistoryEntry[],
  finalResult?: UiAuditResult | null,
): string[] {
  if (history.length === 0 && !finalResult) return [];
  const lines = ["", "UI audit history:"];
  if (finalResult) {
    lines.push(
      `  Final: type=${finalResult.type} · score=${finalResult.score} · ok=${finalResult.ok}` +
        (finalResult.issues.length ? ` · issues=${finalResult.issues.join(",")}` : ""),
    );
  }
  for (const entry of history) {
    lines.push(
      `  - ${entry.at} · ${entry.type} · score=${entry.score} · ok=${entry.ok}` +
        (entry.issues.length ? ` · issues=${entry.issues.join(",")}` : "") +
        (entry.repaired ? " · repaired" : "") +
        (entry.strategy ? ` · strategy=${entry.strategy}` : ""),
    );
  }
  const patterns = summarizeUiAuditPatterns(history);
  if (patterns.length > 0) {
    lines.push("", "Common UI failure patterns:");
    for (const p of patterns.slice(0, 8)) {
      lines.push(`  - ${p.issue} (${p.count}x)`);
    }
  }
  return lines;
}

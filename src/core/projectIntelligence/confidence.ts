import type { FixConfidenceRecord } from "@/core/projectIntelligence/types";

export function computeFixConfidenceScore(successes: number, failures: number): number {
  const total = Math.max(1, successes + failures);
  return Math.round((successes / total) * 100);
}

export function formatConfidencePercent(score: number): string {
  return `${Math.max(0, Math.min(100, Math.round(score)))}%`;
}

export function bumpFixConfidence(
  records: readonly FixConfidenceRecord[],
  issueId: string,
  fixLabel: string,
  succeeded: boolean,
  at = Date.now(),
): FixConfidenceRecord[] {
  const existing = records.find(
    (row) => row.issueId === issueId && row.fixLabel === fixLabel,
  );
  const successes = (existing?.successes ?? 0) + (succeeded ? 1 : 0);
  const failures = (existing?.failures ?? 0) + (succeeded ? 0 : 1);
  const next: FixConfidenceRecord = {
    issueId,
    fixLabel,
    successes,
    failures,
    lastUsedAt: at,
    confidenceScore: computeFixConfidenceScore(successes, failures),
  };
  return [
    ...records.filter((row) => !(row.issueId === issueId && row.fixLabel === fixLabel)),
    next,
  ].sort((a, b) => b.confidenceScore - a.confidenceScore || b.lastUsedAt - a.lastUsedAt);
}

export function topFixForIssue(
  records: readonly FixConfidenceRecord[],
  issueId: string,
): FixConfidenceRecord | null {
  return (
    records
      .filter((row) => row.issueId === issueId)
      .sort((a, b) => b.confidenceScore - a.confidenceScore || b.successes - a.successes)[0] ??
    null
  );
}

import type { DiffRow } from "@/core/editor/types";

/**
 * Compact line diff via common prefix/suffix trimming. Deterministic and O(n),
 * which is ideal for the localized edits Phase 5 produces (prepend / replace /
 * append). It shows a few lines of context around the changed region.
 */
export function computeDiff(
  before: string,
  after: string,
  context = 3,
): DiffRow[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const bl = beforeLines.length;
  const al = afterLines.length;

  let prefix = 0;
  while (
    prefix < bl &&
    prefix < al &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < bl - prefix &&
    suffix < al - prefix &&
    beforeLines[bl - 1 - suffix] === afterLines[al - 1 - suffix]
  ) {
    suffix += 1;
  }

  const rows: DiffRow[] = [];

  // Leading context.
  const ctxStart = Math.max(0, prefix - context);
  for (let i = ctxStart; i < prefix; i += 1) {
    rows.push({
      type: "context",
      text: beforeLines[i]!,
      leftNo: i + 1,
      rightNo: i + 1,
    });
  }

  // Removed lines.
  for (let i = prefix; i < bl - suffix; i += 1) {
    rows.push({ type: "remove", text: beforeLines[i]!, leftNo: i + 1, rightNo: null });
  }

  // Added lines.
  for (let j = prefix; j < al - suffix; j += 1) {
    rows.push({ type: "add", text: afterLines[j]!, leftNo: null, rightNo: j + 1 });
  }

  // Trailing context.
  const suffixStart = bl - suffix;
  const ctxEnd = Math.min(bl, suffixStart + context);
  for (let i = suffixStart; i < ctxEnd; i += 1) {
    rows.push({
      type: "context",
      text: beforeLines[i]!,
      leftNo: i + 1,
      rightNo: i + (al - bl) + 1,
    });
  }

  return rows;
}

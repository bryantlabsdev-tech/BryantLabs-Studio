import type { DiffRow } from "@/core/editor/types";
import { computeDiff } from "@/core/editor/diff";

export interface DiffHunk {
  readonly id: string;
  readonly rows: readonly DiffRow[];
  readonly accepted: boolean;
}

export interface DiffHunkRegion {
  readonly beforeStart: number;
  readonly beforeEnd: number;
  readonly afterStart: number;
  readonly afterEnd: number;
}

function findNextSync(
  beforeLines: readonly string[],
  afterLines: readonly string[],
  bi: number,
  ai: number,
): { nextBi: number; nextAi: number } | null {
  for (let i = bi; i < beforeLines.length; i += 1) {
    for (let j = ai; j < afterLines.length; j += 1) {
      if (beforeLines[i] === afterLines[j]) {
        return { nextBi: i, nextAi: j };
      }
    }
  }
  return null;
}

/** Find disjoint change regions by syncing on the next identical line. */
export function findChangeRegions(beforeLines: string[], afterLines: string[]): DiffHunkRegion[] {
  const regions: DiffHunkRegion[] = [];
  let bi = 0;
  let ai = 0;
  while (bi < beforeLines.length || ai < afterLines.length) {
    while (
      bi < beforeLines.length &&
      ai < afterLines.length &&
      beforeLines[bi] === afterLines[ai]
    ) {
      bi += 1;
      ai += 1;
    }
    if (bi >= beforeLines.length && ai >= afterLines.length) break;

    const beforeStart = bi;
    const afterStart = ai;
    const sync = findNextSync(beforeLines, afterLines, bi, ai);
    if (!sync) {
      regions.push({
        beforeStart,
        beforeEnd: beforeLines.length,
        afterStart,
        afterEnd: afterLines.length,
      });
      break;
    }
    regions.push({
      beforeStart,
      beforeEnd: sync.nextBi,
      afterStart,
      afterEnd: sync.nextAi,
    });
    bi = sync.nextBi;
    ai = sync.nextAi;
  }
  return regions;
}

function rowsForRegion(
  beforeLines: string[],
  afterLines: string[],
  region: DiffHunkRegion,
  context: number,
): DiffRow[] {
  const rows: DiffRow[] = [];
  const ctxBeforeStart = Math.max(0, region.beforeStart - context);
  for (let line = ctxBeforeStart; line < region.beforeStart; line += 1) {
    rows.push({
      type: "context",
      text: beforeLines[line]!,
      leftNo: line + 1,
      rightNo: line + 1,
    });
  }
  for (let line = region.beforeStart; line < region.beforeEnd; line += 1) {
    rows.push({
      type: "remove",
      text: beforeLines[line]!,
      leftNo: line + 1,
      rightNo: null,
    });
  }
  for (let line = region.afterStart; line < region.afterEnd; line += 1) {
    rows.push({
      type: "add",
      text: afterLines[line]!,
      leftNo: null,
      rightNo: line + 1,
    });
  }
  const ctxAfterEnd = Math.min(beforeLines.length, region.beforeEnd + context);
  for (let line = region.beforeEnd; line < ctxAfterEnd; line += 1) {
    const lineDelta = region.afterEnd - region.beforeEnd - (region.afterStart - region.beforeStart);
    rows.push({
      type: "context",
      text: beforeLines[line]!,
      leftNo: line + 1,
      rightNo: line + 1 + lineDelta,
    });
  }
  return rows;
}

/** Multi-hunk diff with per-region accept toggles (defaults all accepted). */
export function computeDiffHunks(
  before: string,
  after: string,
  context = 3,
): DiffHunk[] {
  if (before === after) return [];
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const regions = findChangeRegions(beforeLines, afterLines);
  if (regions.length === 0) {
    return [
      {
        id: "hunk-0",
        rows: computeDiff(before, after, context),
        accepted: true,
      },
    ];
  }
  return regions.map((region, index) => ({
    id: `hunk-${index}`,
    rows: rowsForRegion(beforeLines, afterLines, region, context),
    accepted: true,
  }));
}

/** Merge accepted hunks into a partial `after` snapshot. */
export function mergeHunkDecisions(
  before: string,
  after: string,
  decisions: Readonly<Record<string, boolean>>,
): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const regions = findChangeRegions(beforeLines, afterLines);
  if (regions.length === 0) return after;

  const out: string[] = [];
  let bi = 0;
  let ai = 0;
  for (let r = 0; r < regions.length; r += 1) {
    const region = regions[r]!;
    const accepted = decisions[`hunk-${r}`] !== false;
    while (bi < region.beforeStart) {
      out.push(beforeLines[bi]!);
      bi += 1;
      ai += 1;
    }
    if (accepted) {
      while (ai < region.afterEnd) {
        out.push(afterLines[ai]!);
        ai += 1;
      }
      bi = region.beforeEnd;
    } else {
      while (bi < region.beforeEnd) {
        out.push(beforeLines[bi]!);
        bi += 1;
      }
      ai = region.afterEnd;
    }
  }
  while (bi < beforeLines.length) {
    out.push(beforeLines[bi]!);
    bi += 1;
  }
  while (ai < afterLines.length) {
    out.push(afterLines[ai]!);
    ai += 1;
  }
  return out.join("\n");
}

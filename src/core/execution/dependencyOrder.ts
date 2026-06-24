import type { ProjectScan } from "@/types";
import type { ExecutionStep } from "@/core/execution/types";

/** Topological sort of execution steps by explicit dependsOn edges. */
export function orderStepsByDependency(
  steps: readonly ExecutionStep[],
): ExecutionStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const out: ExecutionStep[] = [];

  function visit(step: ExecutionStep) {
    if (visited.has(step.id)) return;
    for (const depId of step.dependsOn) {
      const dep = byId.get(depId);
      if (dep) visit(dep);
    }
    visited.add(step.id);
    out.push(step);
  }

  const sorted = [...steps].sort((a, b) => a.index - b.index);
  for (const step of sorted) visit(step);

  return out.map((s, index) => ({ ...s, index }));
}

function fileIndexEntry(scan: ProjectScan, relPath: string) {
  return scan.index.find((e) => e.path === relPath);
}

/**
 * Order files within a step: new files first, then providers/context,
 * then files that are imported by others in the batch.
 */
export function orderFilesInStep(
  filePaths: readonly string[],
  scan: ProjectScan,
  isNewFile: (relPath: string) => boolean,
): string[] {
  const set = new Set(filePaths);
  const score = (relPath: string): number => {
    let s = 0;
    if (isNewFile(relPath)) s -= 20;
    const text = relPath.toLowerCase();
    if (/context|provider|store/.test(text)) s -= 10;
    if (/\.css|\.scss/.test(text)) s += 10;

    const entry = fileIndexEntry(scan, relPath);
    if (entry) {
      for (const imp of entry.imports) {
        const normalized = imp.replace(/^\.\//, "");
        if (set.has(normalized)) s += 5;
      }
    }
    return s;
  };

  return [...filePaths].sort((a, b) => score(a) - score(b));
}

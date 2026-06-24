import type { GreenfieldPageSpec } from "@/core/greenfield/manifestPlanner";
import type { GreenfieldProjectFilePath } from "@/core/greenfield/types";

/** Pages per provider call — keeps each response within output limits. */
export const MULTI_PHASE_PAGES_BATCH_SIZE = 3;

export function splitPagesIntoBatches<T>(
  pages: readonly T[],
  batchSize = MULTI_PHASE_PAGES_BATCH_SIZE,
): T[][] {
  if (pages.length === 0) return [];
  const batches: T[][] = [];
  for (let i = 0; i < pages.length; i += batchSize) {
    batches.push([...pages.slice(i, i + batchSize)]);
  }
  return batches;
}

/** shared + page batches + App integration */
export function countMultiPhaseGenerationCalls(
  pageCount: number,
  batchSize = MULTI_PHASE_PAGES_BATCH_SIZE,
): number {
  if (pageCount <= 0) return 2;
  const pageBatches = Math.ceil(pageCount / batchSize);
  return 1 + pageBatches + 1;
}

export function requiredMultiPhaseMaxAiCalls(pageCount: number): number {
  return countMultiPhaseGenerationCalls(pageCount);
}

export function pagePathsForBatch(
  batch: readonly GreenfieldPageSpec[],
): GreenfieldProjectFilePath[] {
  return batch.map((p) => p.path);
}

export function manifestSliceForBatch(
  manifest: import("@/core/greenfield/manifestPlanner").GreenfieldManifest,
  batch: readonly GreenfieldPageSpec[],
): import("@/core/greenfield/manifestPlanner").GreenfieldManifest {
  return { ...manifest, pages: [...batch], pagePaths: pagePathsForBatch(batch) };
}

import type {
  GreenfieldLatestAction,
  RunFinalStatus,
  RunLogStage,
} from "@/core/greenfield/runLog";

export interface PartitionedSummaryErrors {
  /** Current-run errors shown when the latest action did not succeed. */
  readonly errors: readonly string[];
  /** Earlier failures in this session (logs retain full detail). */
  readonly previousAttemptErrors: readonly string[];
}

/** Dedupe while preserving order. */
function uniqueErrors(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const line = e.trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function isTypeScriptError(line: string): boolean {
  return /\[typescript\]/i.test(line) || /typescript check failed/i.test(line);
}

function isBuildError(line: string): boolean {
  return /\[build\]/i.test(line) || /build failed/i.test(line);
}

function matchesStage(line: string, stage: RunLogStage): boolean {
  return line.includes(`[${stage}]`);
}

function splitRepairedErrors(
  errors: readonly string[],
  opts: {
    readonly typescriptPassed: boolean;
    readonly buildPassed: boolean;
  },
): { readonly current: string[]; readonly repaired: string[] } {
  const current: string[] = [];
  const repaired: string[] = [];
  for (const line of errors) {
    if (opts.typescriptPassed && isTypeScriptError(line)) {
      repaired.push(line);
      continue;
    }
    if (opts.buildPassed && isBuildError(line)) {
      repaired.push(line);
      continue;
    }
    current.push(line);
  }
  return { current, repaired };
}

/**
 * When the latest action succeeded, do not surface older failures as current Errors.
 * When verification eventually passed, move repaired stage failures to previous attempts.
 */
export function partitionSummaryErrors(opts: {
  readonly latestAction: GreenfieldLatestAction | null;
  readonly runResult: RunFinalStatus;
  readonly rawErrors: readonly string[];
  readonly typescriptPassed?: boolean;
  readonly buildPassed?: boolean;
}): PartitionedSummaryErrors {
  const all = uniqueErrors(opts.rawErrors);
  const latestSucceeded =
    opts.latestAction?.status === "success" ||
    (opts.latestAction == null && opts.runResult === "success");

  const { current, repaired } = splitRepairedErrors(all, {
    typescriptPassed: opts.typescriptPassed === true,
    buildPassed: opts.buildPassed === true,
  });

  if (latestSucceeded) {
    return { errors: [], previousAttemptErrors: uniqueErrors([...repaired, ...current]) };
  }

  if (opts.latestAction?.status === "failed" && opts.latestAction.stage) {
    const stage = opts.latestAction.stage;
    const stageErrors = current.filter((line) => matchesStage(line, stage));
    const otherErrors = current.filter((line) => !stageErrors.includes(line));
    if (stageErrors.length > 0) {
      return {
        errors: stageErrors,
        previousAttemptErrors: uniqueErrors([...repaired, ...otherErrors]),
      };
    }
  }

  return {
    errors: current,
    previousAttemptErrors: repaired,
  };
}

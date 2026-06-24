/** Shared deterministic project repair types (stress harness + IDE greenfield). */

export const DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES = 24;

export interface DeterministicRepairAttempt {
  readonly attempt: number;
  readonly kind: "deterministic" | "llm";
  readonly targetPath: string;
  readonly outcome: "applied" | "failed" | "skipped";
  readonly detail: string;
}

export interface ProjectTypecheckRun {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

export interface ProjectRepairIO {
  readFile(relPath: string): Promise<string | null>;
  writeFile(relPath: string, content: string): Promise<void>;
  loadSourceMap(): Promise<Map<string, string>>;
  runTypecheck(): Promise<ProjectTypecheckRun>;
}

export interface ProjectRepairResult {
  readonly attempts: readonly DeterministicRepairAttempt[];
  readonly deterministicPasses: number;
  readonly typecheckOk: boolean;
  readonly stderr: string;
  /** True when the loop exited early due to non-converging repairs. */
  readonly stoppedForOscillation: boolean;
}

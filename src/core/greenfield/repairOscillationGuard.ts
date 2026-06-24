import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import { parseTypeScriptDiagnostics } from "@/core/greenfield/tscDiagnostics";

export function countTypeScriptErrors(stdout: string, stderr: string): number {
  return parseTypeScriptDiagnostics(stdout, stderr).filter((d) => d.category === "error").length;
}

/** Stable signature of the error set — ignores column drift from edits. */
export function fingerprintTypeScriptDiagnostics(
  diagnostics: readonly TypeScriptDiagnostic[],
): string {
  const errors = diagnostics
    .filter((d) => d.category === "error")
    .map((d) => `${d.file}|${d.line}|${d.code}|${d.message}`)
    .sort();
  return errors.join("\n");
}

export function fingerprintTypeScriptOutput(stdout: string, stderr: string): string {
  return fingerprintTypeScriptDiagnostics(parseTypeScriptDiagnostics(stdout, stderr));
}

const DEFAULT_STALE_PASS_LIMIT = 2;

/**
 * Stops repair loops that keep mutating files without improving tsc output.
 * Typical causes: repairs fighting each other or non-idempotent transforms.
 */
export class RepairConvergenceTracker {
  private lastFingerprint = "";
  private lastErrorCount = Number.POSITIVE_INFINITY;
  private stalePasses = 0;
  private readonly stalePassLimit: number;

  constructor(stalePassLimit = DEFAULT_STALE_PASS_LIMIT) {
    this.stalePassLimit = stalePassLimit;
  }

  /** Call at the start of each repair pass (after tsc). */
  beginPass(stdout: string, stderr: string): void {
    const errorCount = countTypeScriptErrors(stdout, stderr);
    const fingerprint = fingerprintTypeScriptOutput(stdout, stderr);

    if (
      fingerprint === this.lastFingerprint &&
      errorCount >= this.lastErrorCount
    ) {
      this.stalePasses += 1;
    } else if (errorCount < this.lastErrorCount || fingerprint !== this.lastFingerprint) {
      this.stalePasses = 0;
    }

    this.lastFingerprint = fingerprint;
    this.lastErrorCount = errorCount;
  }

  /** Call after a pass applies at least one repair so unrelated stale fingerprints do not stop early. */
  markRepairsApplied(): void {
    this.stalePasses = 0;
  }

  shouldStopForOscillation(): boolean {
    return this.stalePasses >= this.stalePassLimit;
  }

  get stalePassCount(): number {
    return this.stalePasses;
  }
}

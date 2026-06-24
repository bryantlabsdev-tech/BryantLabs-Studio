import type { AgentRunVerification } from "@/core/agent/agentRunCard";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import type { CommandResult, VerificationResult } from "@/types";

export type ResolvedVerificationStatus =
  | "passed"
  | "failed"
  | "pending"
  | "skipped"
  | "advisory";

export interface ResolvedRunVerification {
  readonly typescript: ResolvedVerificationStatus;
  readonly build: ResolvedVerificationStatus;
  readonly preview: ResolvedVerificationStatus;
  readonly uiAudit: ResolvedVerificationStatus;
}

export function commandIncludesTypeScriptCheck(
  cmd: CommandResult | null | undefined,
): boolean {
  if (!cmd) return false;
  const haystack = `${cmd.command}\n${cmd.stdout ?? ""}\n${cmd.stderr ?? ""}`;
  return /\btsc\b/i.test(haystack);
}

export function commandOutputHasTypeScriptErrors(
  cmd: CommandResult | null | undefined,
): boolean {
  if (!cmd) return false;
  const combined = `${cmd.stdout ?? ""}\n${cmd.stderr ?? ""}`;
  return /error TS\d+/i.test(combined);
}

export function commandOutputIndicatesViteBuildSuccess(
  cmd: CommandResult | null | undefined,
): boolean {
  if (!cmd) return false;
  const combined = `${cmd.stdout ?? ""}\n${cmd.stderr ?? ""}`;
  return /✓\s*built|built successfully|vite v[\d.]+/i.test(combined);
}

export function inferTypeScriptPassedFromBuild(
  build: CommandResult | null | undefined,
): boolean | null {
  if (!build) return null;
  if (!commandIncludesTypeScriptCheck(build)) return null;
  if (build.ok && build.exitCode === 0 && !commandOutputHasTypeScriptErrors(build)) {
    return true;
  }
  if (!build.ok || build.exitCode !== 0 || commandOutputHasTypeScriptErrors(build)) {
    return false;
  }
  return null;
}

export function inferBuildPassedFromCommand(
  build: CommandResult | null | undefined,
): boolean | null {
  if (!build) return null;
  if (build.ok && build.exitCode === 0) {
    if (commandOutputIndicatesViteBuildSuccess(build)) return true;
    if (/npm run build/i.test(build.command)) return true;
    return true;
  }
  if (!build.ok || (build.exitCode != null && build.exitCode !== 0)) return false;
  return null;
}

export function finalLogStageOutcome(
  entries: readonly GreenfieldRunLogEntry[],
  stage: GreenfieldRunLogEntry["stage"],
): "passed" | "failed" | "pending" {
  let last: GreenfieldRunLogEntry | null = null;
  for (const entry of entries) {
    if (entry.stage !== stage) continue;
    if (entry.status === "pending") continue;
    last = entry;
  }
  if (!last) return "pending";
  if (last.status === "success") return "passed";
  if (last.status === "failed") return "failed";
  return "pending";
}

function mapLogOutcome(
  outcome: "passed" | "failed" | "pending",
): ResolvedVerificationStatus {
  if (outcome === "passed") return "passed";
  if (outcome === "failed") return "failed";
  return "pending";
}

function resolveTypeScriptStatus(input: {
  readonly setup: GreenfieldSetupResult | null;
  readonly verification: VerificationResult | null;
  readonly logOutcome: "passed" | "failed" | "pending";
  readonly cardStatus: AgentRunVerification["typescript"] | null;
}): ResolvedVerificationStatus {
  const typecheck =
    input.setup?.typecheck ?? input.verification?.typecheck ?? null;
  const build = input.setup?.build ?? input.verification?.build ?? null;

  const fromBuild = inferTypeScriptPassedFromBuild(build);
  if (fromBuild === true) return "passed";

  if (typecheck?.ok && typecheck.exitCode === 0 && !commandOutputHasTypeScriptErrors(typecheck)) {
    return "passed";
  }

  if (typecheck && !typecheck.ok) {
    if (commandOutputHasTypeScriptErrors(typecheck) || typecheck.exitCode !== 0) {
      return "failed";
    }
  }

  if (input.cardStatus === "skipped") return "skipped";
  if (input.cardStatus === "passed") return "passed";
  if (input.cardStatus === "failed") return "failed";

  const fromLog = mapLogOutcome(input.logOutcome);
  return fromLog;
}

function resolveBuildStatus(input: {
  readonly setup: GreenfieldSetupResult | null;
  readonly verification: VerificationResult | null;
  readonly logOutcome: "passed" | "failed" | "pending";
  readonly cardStatus: AgentRunVerification["build"] | null;
}): ResolvedVerificationStatus {
  const build = input.setup?.build ?? input.verification?.build ?? null;
  const fromCommand = inferBuildPassedFromCommand(build);
  if (fromCommand === true) return "passed";
  if (fromCommand === false) return "failed";

  if (input.cardStatus === "skipped") return "skipped";
  if (input.cardStatus === "passed") return "passed";
  if (input.cardStatus === "failed") return "failed";

  return mapLogOutcome(input.logOutcome);
}

function resolvePreviewStatus(input: {
  readonly run: GreenfieldRunSnapshot;
  readonly logOutcome: "passed" | "failed" | "pending";
  readonly cardStatus: AgentRunVerification["preview"] | null;
}): ResolvedVerificationStatus {
  if (input.run.runResult === "success") {
    if (input.logOutcome === "passed" || input.cardStatus === "ready") {
      return "passed";
    }
  }

  if (input.cardStatus === "ready") return "passed";
  if (input.cardStatus === "skipped") return "skipped";
  if (input.cardStatus === "failed") return "failed";
  return mapLogOutcome(input.logOutcome);
}

function resolveUiAuditStatus(input: {
  readonly run: GreenfieldRunSnapshot;
  readonly logOutcome: "passed" | "failed" | "pending";
  readonly cardStatus: AgentRunVerification["uiAudit"] | null;
}): ResolvedVerificationStatus {
  const audit = input.run.uiAuditResult;
  if (audit?.advisory === true) return "advisory";
  if (audit?.skipped === true) return "skipped";
  if (audit?.ok === true) return "passed";
  if (input.cardStatus === "passed") return "passed";
  if (input.cardStatus === "skipped") return "skipped";
  if (input.cardStatus === "failed") return "failed";
  if (input.logOutcome === "passed") return "passed";
  if (input.logOutcome === "failed") return "failed";
  return "pending";
}

export function resolveRunVerification(input: {
  readonly run: GreenfieldRunSnapshot;
  readonly cardVerification?: AgentRunVerification | null;
}): ResolvedRunVerification {
  const { run, cardVerification = null } = input;
  const entries = run.entries;

  return {
    typescript: resolveTypeScriptStatus({
      setup: run.setupResult,
      verification: run.verification,
      logOutcome: finalLogStageOutcome(entries, "typescript"),
      cardStatus: cardVerification?.typescript ?? null,
    }),
    build: resolveBuildStatus({
      setup: run.setupResult,
      verification: run.verification,
      logOutcome: finalLogStageOutcome(entries, "build"),
      cardStatus: cardVerification?.build ?? null,
    }),
    preview: resolvePreviewStatus({
      run,
      logOutcome: finalLogStageOutcome(entries, "preview"),
      cardStatus: cardVerification?.preview ?? null,
    }),
    uiAudit: resolveUiAuditStatus({
      run,
      logOutcome: finalLogStageOutcome(entries, "ui_audit"),
      cardStatus: cardVerification?.uiAudit ?? null,
    }),
  };
}

export function allCoreVerificationPassed(
  verification: ResolvedRunVerification,
): boolean {
  const ok = (status: ResolvedVerificationStatus) =>
    status === "passed" || status === "skipped" || status === "advisory";
  return (
    ok(verification.typescript) &&
    ok(verification.build) &&
    ok(verification.preview) &&
    ok(verification.uiAudit)
  );
}

export function resolvedVerificationLabel(
  status: ResolvedVerificationStatus,
): string {
  return status;
}

export function greenfieldRunSucceeded(run: GreenfieldRunSnapshot): boolean {
  return run.runResult === "success";
}

export function shouldIgnoreStaleFailureReport(
  run: GreenfieldRunSnapshot,
  resolved: ResolvedRunVerification,
): boolean {
  return greenfieldRunSucceeded(run) && allCoreVerificationPassed(resolved);
}

export function resolveDiagnosticStage(input: {
  readonly run: GreenfieldRunSnapshot;
  readonly outcome: import("@/core/agent/runTerminal").RunTerminalOutcome | null;
  readonly resolved: ResolvedRunVerification;
}): string | null {
  if (
    input.outcome === "success" ||
    (greenfieldRunSucceeded(input.run) && allCoreVerificationPassed(input.resolved))
  ) {
    return "Complete";
  }

  for (let i = input.run.entries.length - 1; i >= 0; i -= 1) {
    const entry = input.run.entries[i]!;
    if (entry.status === "failed" || entry.status === "running") {
      return entry.stage.replace(/_/g, " ");
    }
  }

  return null;
}

/** Patch applied when starting a new run to avoid stale verification diagnostics. */
export function clearGreenfieldVerificationStatePatch(): Partial<GreenfieldRunSnapshot> {
  return {
    failureReport: null,
    finalMessage: null,
    runTimeline: null,
    workflow: null,
    setupResult: null,
    verification: null,
    uiAuditResult: null,
    uiAuditHistory: [],
    debug: null,
    generationMetrics: null,
    generatedFiles: null,
    entries: [],
    writeError: null,
    setupStatus: "idle",
    writeStatus: "idle",
    genStatus: "idle",
  };
}

export function primaryBuildCommand(
  run: GreenfieldRunSnapshot,
): CommandResult | null {
  return (
    run.setupResult?.build ??
    run.verification?.build ??
    run.failureReport?.stages.find((stage) => stage.stage === "build")?.command ??
    null
  );
}

export function primaryTypecheckCommand(
  run: GreenfieldRunSnapshot,
): CommandResult | null {
  return (
    run.setupResult?.typecheck ??
    run.verification?.typecheck ??
    run.failureReport?.stages.find((stage) => stage.stage === "typescript")?.command ??
    null
  );
}

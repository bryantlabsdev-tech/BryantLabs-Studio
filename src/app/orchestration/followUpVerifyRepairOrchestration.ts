import {
  runGreenfieldUiAuditAndRepair,
  type GreenfieldUiRepairHost,
} from "@/app/orchestration/greenfieldUiRepairOrchestration";
import { runQuickRepairAndReverify } from "@/app/orchestration/quickRepairOrchestration";
import type { ApplyPlanOrchestrationHost } from "@/app/orchestration/applyPlanTypes";
import { buildTypeScriptCheckDetailsFromCommand } from "@/core/greenfield/tscDiagnostics";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import type { CommandResult, VerificationResult } from "@/types";

function okInstallStub(): CommandResult {
  return {
    command: "npm install",
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
}

export function verificationToSetupResult(
  verification: VerificationResult,
): GreenfieldSetupResult {
  return {
    ok: verification.typecheck.ok && verification.build.ok,
    install: okInstallStub(),
    typecheck: verification.typecheck,
    typecheckDetails: buildTypeScriptCheckDetailsFromCommand(verification.typecheck),
    build: verification.build,
    ...(!verification.typecheck.ok || !verification.build.ok
      ? { error: "Verification failed after apply." }
      : {}),
  };
}

type FollowUpRepairHost = Pick<
  ApplyPlanOrchestrationHost,
  "api" | "appendGreenfieldRunLog" | "updateGreenfieldRun" | "requestPreviewTab"
> & {
  readonly setAppPreview: (state: {
    url: string | null;
    running: boolean;
    root: string;
    lastSuccessfulPreviewAt?: number | null;
    port?: number | null;
  }) => void;
};

export async function runFollowUpQuickRepairBeforeAutoFix(
  host: FollowUpRepairHost,
  projectPath: string,
  verification: VerificationResult,
): Promise<VerificationResult> {
  if (!host.api || verification.typecheck.ok) return verification;

  host.appendGreenfieldRunLog(
    "apply_plan",
    "running",
    "Deterministic quick repair started",
  );

  const result = await runQuickRepairAndReverify(
    host.api,
    projectPath,
    verification,
    host,
  );

  if (result.fixed) {
    host.appendGreenfieldRunLog(
      "apply_plan",
      "success",
      "Deterministic quick repair applied",
      result.verification.typecheck.ok ? "TypeScript passed" : "TypeScript still failing",
    );
  }

  return result.verification;
}

export async function runFollowUpUiAuditAfterPreview(
  host: FollowUpRepairHost,
  opts: {
    readonly folderPath: string;
    readonly previewUrl: string;
    readonly userPrompt: string;
    readonly verification: VerificationResult;
  },
): Promise<{ readonly ok: boolean; readonly advisory: boolean }> {
  if (!host.api) return { ok: true, advisory: false };

  const uiHost: GreenfieldUiRepairHost = {
    api: host.api,
    appendGreenfieldRunLog: host.appendGreenfieldRunLog,
    updateGreenfieldRun: host.updateGreenfieldRun,
    setAppPreview: host.setAppPreview,
    requestPreviewTab: host.requestPreviewTab,
  };

  const outcome = await runGreenfieldUiAuditAndRepair(uiHost, {
    folderPath: opts.folderPath,
    previewUrl: opts.previewUrl,
    setup: verificationToSetupResult(opts.verification),
    userPrompt: opts.userPrompt,
    uiAuditHistory: [],
  });

  if (outcome.ok) {
    const advisory = !outcome.audit.ok || Boolean(outcome.audit.skipReason);
    return { ok: true, advisory };
  }

  if (opts.verification.typecheck.ok && opts.verification.build.ok) {
    return { ok: true, advisory: true };
  }

  return { ok: false, advisory: false };
}

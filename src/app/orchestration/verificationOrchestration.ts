import type { VerificationOrchestrationHost } from "@/app/orchestration/verificationTypes";
import { buildVerificationFailureReport } from "@/core/diagnostics/failureReport";
import { recordVerificationFailure } from "@/core/sessionMemory";
import { verificationSummaryLines } from "@/core/studioRun/types";

export async function runVerificationOrchestration(
  host: VerificationOrchestrationHost | null,
): Promise<void> {
  if (!host?.api) return;
  host.setVerifyStatus("running");
  host.setVerifyError(null);
  host.beginStudioAction("verification", "verification", "Verification started");
  try {
    const res = await host.api.verify();
    if ("error" in res) {
      host.setVerifyStatus("error");
      host.setVerifyError(res.error);
      const report = buildVerificationFailureReport(null, res.error);
      host.setSessionMemory((m) => recordVerificationFailure(m, report.rootCauseLine));
      host.publishFailureReport(report);
      host.finishStudioAction("verification", "verification", false, "Verification failed", {
        details: report.rootCauseLine,
        patch: {
          workflow: { errors: [report.rootCauseLine] },
        },
      });
      return;
    }
    host.setVerification(res);
    host.setVerifyStatus("done");
    const lines = verificationSummaryLines(res);
    const report = buildVerificationFailureReport(res, null);
    if (!lines.ok) {
      host.setSessionMemory((m) => recordVerificationFailure(m, report.rootCauseLine));
      host.publishFailureReport(report);
    } else {
      host.updateGreenfieldRun({ failureReport: null });
    }
    host.finishStudioAction(
      "verification",
      "verification",
      lines.ok,
      lines.ok ? "Verification passed" : "Verification failed",
      {
        details: report.rootCauseLine,
        patch: {
          verification: res,
          failureReport: lines.ok ? null : report,
          workflow: {
            verificationOk: lines.ok,
            typecheckResult: lines.typecheck,
            buildResult: lines.build,
            errors: lines.ok ? [] : [report.rootCauseLine],
          },
        },
      },
    );
  } catch {
    host.setVerifyStatus("error");
    host.setVerifyError("Verification failed to run.");
    const report = buildVerificationFailureReport(null, "Verification failed to run.");
    host.setSessionMemory((m) => recordVerificationFailure(m, report.rootCauseLine));
    host.publishFailureReport(report);
    host.finishStudioAction("verification", "verification", false, "Verification failed", {
      details: report.rootCauseLine,
      patch: {
        workflow: { errors: [report.rootCauseLine] },
      },
    });
  }
}

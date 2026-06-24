import { evaluateProjectRuntimeSmoke, formatRuntimeSmokeDetails } from "@/core/greenfield/loadProjectSourcesForSmoke";
import type { RunLogStage } from "@/core/greenfield/runLog";
import type { RuntimeSmokeResult } from "@/core/greenfield/runtimeSmokeVerification";
import type { BryantLabsApi } from "@/types";

const RUNTIME_SMOKE_STAGE = "runtime_smoke" as RunLogStage;

export async function runGreenfieldRuntimeSmokeCheck(input: {
  readonly api: BryantLabsApi;
  readonly projectRoot: string;
  readonly userPrompt?: string;
  readonly appendGreenfieldRunLog: (
    stage: RunLogStage,
    status: "running" | "success" | "failed",
    message: string,
    details?: string,
  ) => void;
}): Promise<RuntimeSmokeResult> {
  input.appendGreenfieldRunLog(RUNTIME_SMOKE_STAGE, "running", "Runtime smoke check started");
  try {
    const smokeOptions = input.userPrompt?.trim()
      ? { prompt: input.userPrompt.trim() }
      : {};
    const result = await evaluateProjectRuntimeSmoke(input.api, input.projectRoot, smokeOptions);
    const details = formatRuntimeSmokeDetails(result);
    const failed = result.checks.filter((c) => c.status === "failed");
    if (result.overallStatus === "passed") {
      input.appendGreenfieldRunLog(
        RUNTIME_SMOKE_STAGE,
        "success",
        "Runtime smoke check passed",
        details,
      );
    } else if (result.overallStatus === "advisory") {
      input.appendGreenfieldRunLog(
        RUNTIME_SMOKE_STAGE,
        "success",
        "Runtime smoke check passed with advisory notes",
        details,
      );
    } else {
      input.appendGreenfieldRunLog(
        RUNTIME_SMOKE_STAGE,
        "failed",
        `Runtime smoke: ${failed.length} check(s) failed`,
        details,
      );
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    input.appendGreenfieldRunLog(
      RUNTIME_SMOKE_STAGE,
      "failed",
      "Runtime smoke check errored",
      message,
    );
    return {
      ok: false,
      overallStatus: "failed",
      appType: "landing_simple",
      checks: [],
    };
  }
}

import { serializeAutoFixContext } from "@/core/autoFix";
import type { AutoFixMode, ProviderId, ProviderSettings } from "@/core/providers/types";
import type { BryantLabsApi, ProjectScan } from "@/types";
import type { AutoFixSession } from "@/core/autoFix";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";

export interface AutoFixCallbacksHost {
  readonly api: BryantLabsApi;
  readonly scan: ProjectScan;
  readonly projectRoot: string;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    details?: string,
  ) => void;
  readonly setAutoFixSession: (
    updater: (prev: AutoFixSession | null) => AutoFixSession | null,
  ) => void;
  readonly invokeRepairCall: <T extends import("@/core/providers/stageInvoke").StageProviderResult>(
    settings: ProviderSettings,
    maxTokens: number,
    call: (provider: ProviderId) => Promise<T>,
  ) => Promise<T | null>;
}

export function buildAutoFixCallbacks(
  host: AutoFixCallbacksHost,
  mode: AutoFixMode,
  provider: ProviderId,
  originalFailureLine: string,
  workflow: {
    originalRequest: string;
    planSummary: string;
    planSource: string;
    modifiedFiles: readonly string[];
  },
  orchestrationSettings?: ProviderSettings,
) {
  const { api, scan, projectRoot } = host;

  return {
    mode,
    provider,
    scan,
    projectRoot,
    originalRequest: workflow.originalRequest,
    planSummary: workflow.planSummary,
    planSource: workflow.planSource,
    modifiedFiles: workflow.modifiedFiles,
    originalFailureLine,
    proposeFix: async (input: {
      provider: ProviderId;
      context: import("@/core/autoFix/types").AutoFixContext;
      relPath: string;
      absPath: string;
      content: string;
    }) => {
      if (!orchestrationSettings) {
        return api.proposeAutoFix(
          input.provider,
          serializeAutoFixContext(input.context),
          { path: input.relPath, content: input.content },
        );
      }
      const patch = await host.invokeRepairCall(orchestrationSettings, 4096, (p) =>
        api.proposeAutoFix(
          p,
          serializeAutoFixContext(input.context),
          { path: input.relPath, content: input.content },
        ),
      );
      if (!patch) {
        return {
          ok: false,
          provider: input.provider,
          model: "",
          targetPath: input.relPath,
          raw: null,
          latencyMs: 0,
          error: "Repair stopped — provider budget exceeded or run cancelled.",
        };
      }
      return patch;
    },
    readFile: async (absPath: string) => {
      try {
        const res = await api.readFile(absPath);
        return res.readable && res.content !== undefined ? res.content : null;
      } catch {
        return null;
      }
    },
    applyEdit: (absPath: string, before: string, after: string) =>
      api.applyEdit(absPath, before, after),
    verify: () => api.verify(),
    onAttemptLog: (entry: import("@/core/autoFix/types").AutoFixAttemptLog) => {
      host.appendGreenfieldRunLog(
        "auto_fix",
        entry.outcome === "passed" ? "success" : "failed",
        `Attempt ${entry.attempt}: ${entry.headline}`,
        entry.detail,
      );
      host.setAutoFixSession((prev) =>
        prev ? { ...prev, attempts: [...prev.attempts, entry] } : prev,
      );
    },
    onPhase: (phase: AutoFixSession["phase"]) => {
      host.setAutoFixSession((prev) => (prev ? { ...prev, phase } : prev));
    },
    onPendingRepair: (repair: import("@/core/autoFix/types").AutoFixPendingRepair) => {
      host.setAutoFixSession((prev) =>
        prev ? { ...prev, pendingRepair: repair, phase: "awaiting_approval" } : prev,
      );
    },
  };
}

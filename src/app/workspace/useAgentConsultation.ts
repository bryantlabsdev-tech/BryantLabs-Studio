import { useCallback, useRef, useState } from "react";
import {
  consultationActivityLine,
  runAgentCommandIntent,
  runAgentConsultation,
} from "@/core/agent/agentConsultation";
import type { AgentConsultationInput } from "@/core/agent/agentConsultation";
import type { AgentPromptIntent } from "@/core/agent/agentIntentRouter";
import type { ActiveEditorContext } from "@/core/context/activeEditorContext";
import type { GreenfieldRunUpdate } from "@/app/orchestration/followUpRunFailure";
import { completeDanglingRunningLogEntries } from "@/core/greenfield/runState";
import type { ProjectScan } from "@/types";

export interface PendingMixedEdit {
  readonly prompt: string;
}

export function useAgentConsultation(input: {
  readonly api: import("@/types").BryantLabsApi | null | undefined;
  readonly projectPath: string | null;
  readonly scan: ProjectScan | null;
  readonly activeEditorContextRef: React.RefObject<ActiveEditorContext | null>;
  readonly recordAgentActivityMessage: (text: string) => void;
  readonly recordAgentStudioMessage: (
    text: string,
    meta?: { provider?: string; outcome?: "success" | "failure" | "neutral" },
  ) => void;
  readonly appendGreenfieldRunLog: (
    stage: import("@/core/greenfield/runLog").GreenfieldRunLogEntry["stage"],
    status: import("@/core/greenfield/runLog").GreenfieldRunLogEntry["status"],
    message: string,
    details?: string,
  ) => void;
  readonly updateGreenfieldRun?: (patch: GreenfieldRunUpdate) => void;
}) {
  const [consultationRunning, setConsultationRunning] = useState(false);
  const pendingMixedEditRef = useRef<PendingMixedEdit | null>(null);

  const runAgentConsultationFlow = useCallback(
    async (opts: {
      readonly prompt: string;
      readonly promptIntent: AgentPromptIntent;
      readonly mixedEdit?: boolean;
      readonly command?: boolean;
    }) => {
      if (!input.api || !input.projectPath) {
        input.recordAgentStudioMessage("Open a project folder first.", {
          outcome: "failure",
        });
        return;
      }
      setConsultationRunning(true);
      input.recordAgentActivityMessage(consultationActivityLine(opts.promptIntent));
      input.updateGreenfieldRun?.({
        actionType: "consultation",
        runStartedAt: Date.now(),
        runResult: "running",
      });
      input.appendGreenfieldRunLog(
        "pipeline",
        "running",
        `Consultation · ${opts.promptIntent}`,
        opts.prompt,
      );

      try {
        const base: AgentConsultationInput = {
          api: input.api,
          projectPath: input.projectPath,
          prompt: opts.prompt,
          intent: opts.promptIntent,
          scan: input.scan,
          activeEditorContext: input.activeEditorContextRef.current,
          ...(opts.mixedEdit ? { mixedEdit: true } : {}),
        };

        const result = opts.command
          ? await runAgentCommandIntent(base)
          : await runAgentConsultation(base);

        if (!result.ok) {
          const message = result.error ?? "Consultation failed";
          input.updateGreenfieldRun?.((prev) => {
            const endedAt = Date.now();
            return {
              runResult: "failed",
              endedAt,
              durationMs:
                prev.runStartedAt != null
                  ? Math.max(0, endedAt - prev.runStartedAt)
                  : null,
              entries: completeDanglingRunningLogEntries(
                prev.entries,
                "failed",
                message,
                prev.runStartedAt,
              ),
            };
          });
          input.recordAgentStudioMessage(
            message,
            { outcome: "failure", ...(result.provider ? { provider: result.provider } : {}) },
          );
          return;
        }

        input.updateGreenfieldRun?.((prev) => {
          const endedAt = Date.now();
          return {
            runResult: "success",
            endedAt,
            durationMs:
              prev.runStartedAt != null
                ? Math.max(0, endedAt - prev.runStartedAt)
                : null,
            entries: completeDanglingRunningLogEntries(
              prev.entries,
              "success",
              "Consultation complete",
              prev.runStartedAt,
            ),
          };
        });
        input.recordAgentStudioMessage(result.text, {
          outcome: "success",
          ...(result.provider ? { provider: result.provider } : {}),
        });

        if (opts.mixedEdit) {
          pendingMixedEditRef.current = { prompt: opts.prompt };
        }
      } finally {
        setConsultationRunning(false);
      }
    },
    [input],
  );

  const consumePendingMixedEdit = useCallback((): PendingMixedEdit | null => {
    const pending = pendingMixedEditRef.current;
    pendingMixedEditRef.current = null;
    return pending;
  }, []);

  const clearPendingMixedEdit = useCallback(() => {
    pendingMixedEditRef.current = null;
  }, []);

  return {
    consultationRunning,
    pendingMixedEditRef,
    runAgentConsultationFlow,
    consumePendingMixedEdit,
    clearPendingMixedEdit,
  };
}

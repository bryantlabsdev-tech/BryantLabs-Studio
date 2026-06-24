import { useCallback } from "react";
import { formatAgentCompletionMessage } from "@/core/agent/agentCompletionMessage";
import { computeProjectHealth } from "@/core/build/projectHealth";
import { deriveProjectFacts } from "@/core/build/projectFacts";
import { suggestNextImprovements } from "@/core/build/suggestedNextSteps";
import {
  appendFollowUpChatMessage,
  createFollowUpChatMessage,
  loadFollowUpChat,
} from "@/core/build/followUpChat";
import {
  buildFollowUpSuccessSnapshot,
  buildFollowUpActivityStream,
} from "@/core/build/followUpRun";
import {
  restoreFollowUpCheckpoint,
  type FollowUpCheckpoint,
} from "@/core/build/followUpCheckpoint";
import {
  completeFollowUpActivityRun,
  type FollowUpActivityRun,
} from "@/core/build/followUpActivityLog";
import {
  appendFollowUpSnapshot,
  restoreFollowUpSnapshot,
  type FollowUpSnapshot,
} from "@/core/build/followUpSnapshots";
import {
  buildEscalationNote,
  escalationReasonFromError,
  nextAutoEscalationStep,
  type FollowUpEscalationState,
} from "@/core/build/providerAutoEscalation";
import {
  shouldOfferStrongerModel,
  strongerModelSettingsPatch,
} from "@/core/build/modelEscalation";
import { logProviderFallback } from "@/core/providers/providerDiagnostics";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import { recordRunSummary } from "@/core/sessionMemory/store";
import { saveSessionMemoryToDisk } from "@/core/sessionMemory/persist";
import type { BryantLabsApi, VerificationResult } from "@/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { PlanApplySession } from "@/core/planApply";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { FollowUpSuccessSnapshot } from "@/core/build/followUpRun";

export function useWorkspaceFollowUpRecording(input: {
  readonly api: BryantLabsApi | null | undefined;
  readonly projectPath: string | undefined;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly lastPlanPrompt: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly planApplySession: PlanApplySession | null;
  readonly followUpCheckpoint: FollowUpCheckpoint | null;
  readonly followUpActivityRunRef: React.MutableRefObject<FollowUpActivityRun | null>;
  readonly followUpRunStartedAtRef: React.MutableRefObject<number | null>;
  readonly followUpEscalatedRef: React.MutableRefObject<boolean>;
  readonly setFollowUpChat: React.Dispatch<
    React.SetStateAction<import("@/core/build/followUpChat").FollowUpChatMessage[]>
  >;
  readonly setFollowUpSuccess: React.Dispatch<
    React.SetStateAction<FollowUpSuccessSnapshot | null>
  >;
  readonly setFollowUpCheckpoint: React.Dispatch<
    React.SetStateAction<FollowUpCheckpoint | null>
  >;
  readonly setFollowUpSnapshots: React.Dispatch<React.SetStateAction<FollowUpSnapshot[]>>;
  readonly setFollowUpActivityRuns: React.Dispatch<
    React.SetStateAction<FollowUpActivityRun[]>
  >;
  readonly setProjectHealth: React.Dispatch<
    React.SetStateAction<import("@/core/build/projectHealth").ProjectHealthSnapshot | null>
  >;
  readonly setSessionMemory: React.Dispatch<React.SetStateAction<SessionMemorySnapshot>>;
  readonly setFollowUpEscalation: React.Dispatch<
    React.SetStateAction<FollowUpEscalationState | null>
  >;
  readonly setCanUndo: React.Dispatch<React.SetStateAction<boolean>>;
  readonly refreshFeatureInventoryFn: () => Promise<void>;
  readonly refreshProviderStatus: () => Promise<void>;
  readonly appendGreenfieldRunLog: (
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    detailsOrOpts?: string | import("@/core/greenfield/runLog").RunLogEntryOptions,
  ) => void;
  readonly runScan: () => Promise<void>;
}) {
  const finalizeFollowUpActivityRun = useCallback(
    (items: import("@/core/build/followUpRun").FollowUpActivityItem[]) => {
      if (!input.projectPath || !input.followUpActivityRunRef.current) return;
      let run = input.followUpActivityRunRef.current;
      for (const item of items) {
        run = {
          ...run,
          items: [...run.items, item].slice(-40),
        };
      }
      input.setFollowUpActivityRuns(completeFollowUpActivityRun(input.projectPath, run));
      input.followUpActivityRunRef.current = null;
    },
    [input],
  );

  const recordFollowUpStudioMessage = useCallback(
    (
      text: string,
      meta?: {
        filesModified?: readonly string[];
        provider?: string;
        model?: string;
        durationMs?: number;
        previewReady?: boolean;
        prompt?: string;
        typecheckPassed?: boolean;
        buildPassed?: boolean;
        verification?: VerificationResult | null;
        planSummary?: string;
        snapshotFiles?: readonly import("@/core/build/followUpCheckpoint").FollowUpCheckpointFile[];
        skipSuccessCard?: boolean;
        suggestedNextSteps?: readonly string[];
      },
    ) => {
      if (!input.projectPath) return;
      const previewReady = meta?.previewReady ?? false;
      const existingChat = loadFollowUpChat(input.projectPath);
      const facts = deriveProjectFacts(input.sessionMemory, existingChat);
      const suggestions =
        meta?.suggestedNextSteps ??
        (meta?.filesModified && meta.filesModified.length > 0
          ? suggestNextImprovements(input.sessionMemory, existingChat, facts)
          : undefined);
      const displayText =
        meta?.filesModified && meta.filesModified.length > 0
          ? formatAgentCompletionMessage({
              action: "edited",
              filesModified: meta.filesModified,
              ...(meta.typecheckPassed !== undefined
                ? { typecheckPassed: meta.typecheckPassed }
                : {}),
              ...(meta.buildPassed !== undefined ? { buildPassed: meta.buildPassed } : {}),
              ...(meta.previewReady !== undefined ? { previewReady: meta.previewReady } : {}),
              ...(suggestions && suggestions.length > 0
                ? { suggestedNextSteps: suggestions }
                : {}),
            })
          : text;
      const msg = createFollowUpChatMessage("studio", displayText, {
        ...meta,
        outcome: "success",
        ...(suggestions && suggestions.length > 0
          ? { suggestedNextSteps: suggestions }
          : {}),
      });
      const nextChat = appendFollowUpChatMessage(input.projectPath, msg);
      input.setFollowUpChat(nextChat);
      if (meta?.filesModified && meta.filesModified.length > 0) {
        const health = computeProjectHealth(meta.verification ?? null, previewReady);
        input.setProjectHealth(health);
        input.setSessionMemory((prev) => {
          const next = recordRunSummary(prev, {
            prompt: meta.prompt ?? input.lastPlanPrompt ?? text,
            ok: true,
            filesModified: meta.filesModified ?? [],
            provider: meta.provider ?? input.greenfieldRun.provider ?? null,
            model: meta.model ?? input.greenfieldRun.model ?? null,
            durationMs: input.followUpRunStartedAtRef.current
              ? Date.now() - input.followUpRunStartedAtRef.current
              : 0,
            summary: meta.planSummary ?? text,
            at: Date.now(),
          });
          void saveSessionMemoryToDisk(input.api ?? undefined, next);
          return next;
        });
        void input.refreshFeatureInventoryFn();
        const snapshotFiles = meta.snapshotFiles;
        if (snapshotFiles && snapshotFiles.length > 0) {
          input.setFollowUpSnapshots(
            appendFollowUpSnapshot(input.projectPath, {
              prompt: meta.prompt ?? input.lastPlanPrompt ?? text,
              files: snapshotFiles,
            }),
          );
        }
        if (meta.skipSuccessCard === false) {
          input.setFollowUpSuccess(
            buildFollowUpSuccessSnapshot({
              prompt: meta.prompt ?? input.lastPlanPrompt ?? text,
              filesModified: meta.filesModified,
              provider: meta.provider ?? input.greenfieldRun.provider,
              model: meta.model ?? input.greenfieldRun.model,
              runStartedAt:
                input.followUpRunStartedAtRef.current ?? input.greenfieldRun.runStartedAt,
              planSummary: meta.planSummary ?? text,
              previewReady,
              typecheckPassed: meta.typecheckPassed ?? health.typecheckOk,
              buildPassed: meta.buildPassed ?? health.buildOk,
              suggestedNextSteps: suggestions ?? [],
            }),
          );
        }
      }
    },
    [input],
  );

  const dismissFollowUpSuccess = useCallback(() => {
    input.setFollowUpSuccess(null);
  }, [input]);

  const undoFollowUpChange = useCallback(async () => {
    if (!input.api || !input.followUpCheckpoint) return;
    const result = await restoreFollowUpCheckpoint(input.api, input.followUpCheckpoint);
    if (!result.ok) {
      input.appendGreenfieldRunLog("error", "failed", result.error ?? "Undo failed.");
      return;
    }
    input.setFollowUpCheckpoint(null);
    input.setCanUndo(false);
    input.setFollowUpSuccess(null);
    void input.runScan();
    recordFollowUpStudioMessage("Reverted the last AI changes.");
  }, [input, recordFollowUpStudioMessage]);

  const restoreFollowUpSnapshotFn = useCallback(
    async (snapshot: FollowUpSnapshot) => {
      if (!input.api) return;
      const result = await restoreFollowUpSnapshot(input.api, snapshot);
      if (!result.ok) {
        input.appendGreenfieldRunLog(
          "error",
          "failed",
          result.error ?? "Snapshot restore failed.",
        );
        return;
      }
      input.setFollowUpSuccess(null);
      void input.runScan();
      recordFollowUpStudioMessage(
        `Restored snapshot #${snapshot.index}: ${snapshot.label}`,
      );
    },
    [input, recordFollowUpStudioMessage],
  );

  const attemptFollowUpAutoEscalation = useCallback(
    async (error: string): Promise<boolean> => {
      if (!input.api || input.followUpEscalatedRef.current) return false;
      let settings;
      try {
        settings = normalizeProviderSettings(await input.api.getProviderSettings());
      } catch {
        return false;
      }
      if (!shouldOfferStrongerModel(error)) return false;
      const model =
        settings.provider === "gemini"
          ? settings.geminiModel
          : settings.provider === "anthropic"
            ? settings.anthropicModel
            : settings.provider === "openrouter"
              ? settings.openrouterModel
              : settings.provider === "groq"
                ? settings.groqModel
                : "";
      const step = nextAutoEscalationStep(settings.provider, model, settings);
      if (!step) return false;
      input.followUpEscalatedRef.current = true;
      const reason = escalationReasonFromError(error);
      logProviderFallback({
        from: model,
        to: step.model,
        reason: `auto_escalation:${reason}`,
      });
      input.setFollowUpEscalation(
        buildEscalationNote(settings.provider, model, step, reason),
      );
      await input.api.saveProviderSettings(strongerModelSettingsPatch(step));
      await input.refreshProviderStatus();
      return true;
    },
    [input],
  );

  const finalizeFollowUpActivityRunFromLogs = useCallback(() => {
    if (!input.projectPath || !input.followUpActivityRunRef.current) return;
    const items = buildFollowUpActivityStream(
      input.greenfieldRun.entries,
      input.planApplySession,
    );
    finalizeFollowUpActivityRun(items);
  }, [input, finalizeFollowUpActivityRun]);

  return {
    recordFollowUpStudioMessage,
    dismissFollowUpSuccess,
    undoFollowUpChange,
    restoreFollowUpSnapshotFn,
    attemptFollowUpAutoEscalation,
    finalizeFollowUpActivityRun,
    finalizeFollowUpActivityRunFromLogs,
  };
}

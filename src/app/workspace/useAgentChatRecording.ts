import { createAgentRunId } from "@/app/workspace/useAgentRunHistoryController";
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { appendPendingAgentMessage } from "@/core/agent/agentChat";
import { auditProjectForEdit } from "@/core/agent/projectEditAudit";
import { buildCurrentAppContext } from "@/core/agent/agentAppContext";
import { deriveProjectFacts } from "@/core/build/projectFacts";
import { suggestNextImprovements } from "@/core/build/suggestedNextSteps";
import { computeProjectHealth, type ProjectHealthSnapshot } from "@/core/build/projectHealth";
import {
  appendFollowUpChatMessage,
  createFollowUpChatMessage,
  loadFollowUpChat,
  saveFollowUpChat,
  type FollowUpChatMessage,
} from "@/core/build/followUpChat";
import {
  beginFollowUpActivityRun,
  type FollowUpActivityRun,
} from "@/core/build/followUpActivityLog";
import {
  buildFollowUpSuccessSnapshot,
  type FollowUpSuccessSnapshot,
} from "@/core/build/followUpRun";
import type { FollowUpEscalationState } from "@/core/build/providerAutoEscalation";
import { finalizeGreenfieldAgentRun } from "@/core/agent/greenfieldAgentCleanup";
import { formatGreenfieldCompletionMessage } from "@/core/agent/agentCompletionMessage";
import { suggestNextSteps } from "@/core/domain";
import { recordPrompt } from "@/core/sessionMemory/store";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { ProjectScan } from "@/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { ProjectMemory } from "@/core/projectMemory/types";

export function useAgentChatRecording(input: {
  readonly projectPath: string | undefined;
  readonly projectName: string | undefined;
  readonly scan: ProjectScan | null;
  readonly sessionMemory: SessionMemorySnapshot;
  readonly followUpChat: readonly FollowUpChatMessage[];
  readonly lastPlanPrompt: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly setFollowUpChat: Dispatch<SetStateAction<FollowUpChatMessage[]>>;
  readonly setPendingAgentChat: Dispatch<SetStateAction<FollowUpChatMessage[]>>;
  readonly beginAgentRun: (runId: string, prompt: string, userMessageId: string) => void;
  readonly followUpRunStartedAtRef: MutableRefObject<number | null>;
  readonly followUpActivityRunRef: MutableRefObject<FollowUpActivityRun | null>;
  readonly followUpEscalatedRef: MutableRefObject<boolean>;
  readonly projectMemoryRef: MutableRefObject<ProjectMemory>;
  readonly setFollowUpEscalation: Dispatch<SetStateAction<FollowUpEscalationState | null>>;
  readonly setFollowUpSuccess: Dispatch<SetStateAction<FollowUpSuccessSnapshot | null>>;
  readonly setProjectHealth: Dispatch<SetStateAction<ProjectHealthSnapshot | null>>;
  readonly setAgentGreenfieldPanelActive: Dispatch<SetStateAction<boolean>>;
  readonly setGreenfieldRun: Dispatch<SetStateAction<GreenfieldRunSnapshot>>;
  readonly setSessionMemory: Dispatch<SetStateAction<SessionMemorySnapshot>>;
  readonly persistAppContextMemory: (ctx: import("@/core/agent/agentAppContext").CurrentAppContext) => void;
}) {
  const recordAgentUserMessage = useCallback(
    (prompt: string) => {
      const runId = createAgentRunId();
      const msg = createFollowUpChatMessage("user", prompt, { runId });
      if (input.projectPath) {
        input.setFollowUpChat(appendFollowUpChatMessage(input.projectPath, msg));
        input.beginAgentRun(runId, prompt, msg.id);
        input.followUpRunStartedAtRef.current = Date.now();
        input.followUpEscalatedRef.current = false;
        input.setFollowUpEscalation(null);
        input.setFollowUpSuccess(null);
        input.followUpActivityRunRef.current = beginFollowUpActivityRun(
          input.projectPath,
          prompt,
        );
        return;
      }
      input.setPendingAgentChat(appendPendingAgentMessage(msg));
      input.beginAgentRun(runId, prompt, msg.id);
    },
    [input],
  );

  const recordFollowUpUserMessage = useCallback(
    (prompt: string) => {
      if (!input.projectPath) return;
      recordAgentUserMessage(prompt);
    },
    [input.projectPath, recordAgentUserMessage],
  );

  const recordAgentStudioMessage = useCallback(
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
        verification?: import("@/types").VerificationResult | null;
        planSummary?: string;
        snapshotFiles?: readonly import("@/core/build/followUpCheckpoint").FollowUpCheckpointFile[];
        skipSuccessCard?: boolean;
        suggestedNextSteps?: readonly string[];
      },
    ) => {
      const previewReady = meta?.previewReady ?? false;
      const existingChat = input.projectPath ? loadFollowUpChat(input.projectPath) : [];
      const facts = deriveProjectFacts(input.sessionMemory, existingChat);
      const suggestions =
        meta?.suggestedNextSteps ??
        (meta?.filesModified && meta.filesModified.length > 0
          ? suggestNextImprovements(
              input.sessionMemory,
              existingChat,
              facts,
            )
          : undefined);
      const msg = createFollowUpChatMessage("studio", text, {
        ...meta,
        outcome: "success",
        ...(suggestions && suggestions.length > 0
          ? { suggestedNextSteps: suggestions }
          : {}),
      });
      if (input.projectPath) {
        const nextChat = appendFollowUpChatMessage(input.projectPath, msg);
        input.setFollowUpChat(nextChat);
        const ctx = buildCurrentAppContext({
          scan: input.scan,
          audit: auditProjectForEdit(input.scan),
          sessionMemory: input.sessionMemory,
          chat: nextChat,
          projectMemory: input.projectMemoryRef.current,
          projectFacts: deriveProjectFacts(input.sessionMemory, nextChat),
          ...(input.projectName ? { projectName: input.projectName } : {}),
        });
        if (ctx) input.persistAppContextMemory(ctx);
        if (meta?.filesModified && meta.filesModified.length > 0) {
          const health = computeProjectHealth(meta.verification ?? null, previewReady);
          input.setProjectHealth(health);
        }
        if (
          meta?.filesModified &&
          meta.filesModified.length > 0 &&
          meta.skipSuccessCard === false
        ) {
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
              typecheckPassed: meta.typecheckPassed ?? false,
              buildPassed: meta.buildPassed ?? false,
              suggestedNextSteps: suggestions ?? [],
            }),
          );
        }
        return;
      }
      input.setPendingAgentChat(appendPendingAgentMessage(msg));
    },
    [input],
  );

  const recordAgentGreenfieldSuccess = useCallback(
    (successInput: {
      prompt: string;
      filesWritten: readonly string[];
      typecheckPassed: boolean;
      buildPassed: boolean;
      previewReady: boolean;
      uiAuditPassed: boolean;
    }) => {
      input.setAgentGreenfieldPanelActive(false);
      input.setGreenfieldRun((prev) => ({
        ...prev,
        ...finalizeGreenfieldAgentRun(prev),
      }));

      const message = formatGreenfieldCompletionMessage({
        prompt: successInput.prompt,
        filesWritten: successInput.filesWritten,
        typecheckPassed: successInput.typecheckPassed,
        buildPassed: successInput.buildPassed,
        previewReady: successInput.previewReady,
        uiAuditPassed: successInput.uiAuditPassed,
      });
      recordAgentStudioMessage(message, {
        filesModified: successInput.filesWritten,
        prompt: successInput.prompt,
        typecheckPassed: successInput.typecheckPassed,
        buildPassed: successInput.buildPassed,
        previewReady: successInput.previewReady,
        skipSuccessCard: true,
        suggestedNextSteps: suggestNextSteps({
          prompt: successInput.prompt,
          runOutcome: "created",
        }),
        ...(input.greenfieldRun.provider ? { provider: input.greenfieldRun.provider } : {}),
        ...(input.greenfieldRun.model ? { model: input.greenfieldRun.model } : {}),
        ...(input.greenfieldRun.runStartedAt
          ? { durationMs: Date.now() - input.greenfieldRun.runStartedAt }
          : {}),
      });
      const ctx = buildCurrentAppContext({
        scan: input.scan,
        audit: auditProjectForEdit(input.scan),
        sessionMemory: input.sessionMemory,
        chat: input.projectPath ? loadFollowUpChat(input.projectPath) : [],
        projectMemory: input.projectMemoryRef.current,
        projectFacts: deriveProjectFacts(input.sessionMemory, input.followUpChat),
        projectName: input.projectName ?? null,
      });
      if (ctx) input.persistAppContextMemory(ctx);
      input.setSessionMemory((prev) => recordPrompt(prev, successInput.prompt));
    },
    [input, recordAgentStudioMessage],
  );

  const recordAgentActivityMessage = useCallback(
    (text: string) => {
      const appendOrReplace = (prev: FollowUpChatMessage[]): FollowUpChatMessage[] => {
        const last = prev[prev.length - 1];
        if (last?.role === "studio" && last.outcome === "neutral") {
          if (last.text === text) return prev;
          const msg = createFollowUpChatMessage("studio", text, { outcome: "neutral" });
          return [...prev.slice(0, -1), msg];
        }
        const msg = createFollowUpChatMessage("studio", text, { outcome: "neutral" });
        return [...prev, msg].slice(-100);
      };

      if (input.projectPath) {
        input.setFollowUpChat((prev) => {
          const next = appendOrReplace(prev);
          if (next !== prev) saveFollowUpChat(input.projectPath!, next);
          return next;
        });
        return;
      }
      input.setPendingAgentChat((prev) => appendOrReplace(prev));
    },
    [input.projectPath, input.setFollowUpChat, input.setPendingAgentChat],
  );

  const recordFollowUpFailureMessage = useCallback(
    (text: string) => {
      if (!input.projectPath) return;
      const msg = createFollowUpChatMessage("studio", text, { outcome: "failure" });
      input.setFollowUpChat(appendFollowUpChatMessage(input.projectPath, msg));
    },
    [input.projectPath, input.setFollowUpChat],
  );

  return {
    recordAgentUserMessage,
    recordFollowUpUserMessage,
    recordAgentStudioMessage,
    recordAgentGreenfieldSuccess,
    recordAgentActivityMessage,
    recordFollowUpFailureMessage,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildAgentRunArtifact } from "@/core/agent/buildAgentRunArtifact";
import type { DeriveAgentRunStateInput } from "@/core/agent/deriveAgentRunState";
import {
  loadAgentRunHistory,
  mergeSessionRunHistoryIntoProject,
  resolveRunHistoryScope,
  type AgentRunArtifact,
  nextRunNumber,
  upsertAgentRunArtifact,
} from "@/core/agent/agentRunHistory";
import {
  shouldFreezeAgentRunArtifact,
  shouldRefreshAgentRunArtifact,
} from "@/core/agent/agentRunArtifactFreeze";
import { mergeSessionDiagnosticReportsIntoProject, resolveDiagnosticReportScope } from "@/core/diagnostics/diagnosticReportStore";

export function createAgentRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAgentRunHistoryController(input: {
  readonly projectPath: string | undefined;
  readonly deriveInput: DeriveAgentRunStateInput | null;
  readonly activePrompt: string | null;
  readonly onArtifactFrozen?: (artifact: AgentRunArtifact) => void;
}) {
  const historyScope = useMemo(
    () => resolveRunHistoryScope(input.projectPath),
    [input.projectPath],
  );

  const [agentRunHistory, setAgentRunHistory] = useState<AgentRunArtifact[]>([]);
  const [selectedAgentRunId, setSelectedAgentRunId] = useState<string | null>(null);
  const [selectedArtifactDiffPath, setSelectedArtifactDiffPath] = useState<string | null>(null);
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);
  const activeUserMessageIdRef = useRef<string | null>(null);
  const activePromptRef = useRef<string | null>(null);
  const frozenRunIdsRef = useRef(new Set<string>());
  const wasTerminalRef = useRef(false);

  useEffect(() => {
    const projectPath = input.projectPath?.trim();
    if (projectPath) {
      mergeSessionDiagnosticReportsIntoProject(projectPath);
      setAgentRunHistory(mergeSessionRunHistoryIntoProject(projectPath));
    } else {
      setAgentRunHistory(loadAgentRunHistory(historyScope));
    }
    setSelectedAgentRunId(null);
    setSelectedArtifactDiffPath(null);
    setActiveAgentRunId(null);
    frozenRunIdsRef.current.clear();
    wasTerminalRef.current = false;
  }, [input.projectPath, historyScope]);

  const beginAgentRun = useCallback((runId: string, prompt: string, userMessageId: string) => {
    activeUserMessageIdRef.current = userMessageId;
    activePromptRef.current = prompt;
    frozenRunIdsRef.current.delete(runId);
    wasTerminalRef.current = false;
    setActiveAgentRunId(runId);
    setSelectedAgentRunId(null);
  }, []);

  const selectAgentRun = useCallback((runId: string | null) => {
    setSelectedAgentRunId(runId);
    setSelectedArtifactDiffPath(null);
  }, []);

  const focusArtifactDiff = useCallback(
    (input: { readonly runId?: string | null; readonly path: string }) => {
      if (input.runId !== undefined) {
        setSelectedAgentRunId(input.runId);
      }
      setSelectedArtifactDiffPath(input.path);
    },
    [],
  );

  useEffect(() => {
    const run = input.deriveInput?.greenfieldRun;
    if (!run || !input.deriveInput || !activeAgentRunId) return;

    if (!shouldRefreshAgentRunArtifact(input.deriveInput, activeAgentRunId)) {
      wasTerminalRef.current = shouldFreezeAgentRunArtifact(input.deriveInput);
      return;
    }

    const terminalNow = shouldFreezeAgentRunArtifact(input.deriveInput);
    const history = loadAgentRunHistory(historyScope);
    const existing = history.find((item) => item.runId === activeAgentRunId);
    const previousRunId =
      existing?.previousRunId ??
      (history.length > 0 ? history[history.length - 1]?.runId ?? null : null);
    const artifact = buildAgentRunArtifact({
      runId: activeAgentRunId,
      runNumber: existing?.runNumber ?? nextRunNumber(history),
      userMessageId: activeUserMessageIdRef.current,
      prompt: activePromptRef.current ?? input.activePrompt ?? "",
      stateInput: input.deriveInput,
      previousRunId,
      projectPath: input.projectPath ?? null,
      diagnosticScope: resolveDiagnosticReportScope(input.projectPath),
    });
    const next = upsertAgentRunArtifact(historyScope, artifact);
    setAgentRunHistory(next);
    input.onArtifactFrozen?.(artifact);

    if (terminalNow) {
      frozenRunIdsRef.current.add(activeAgentRunId);
      setActiveAgentRunId(null);
    }

    wasTerminalRef.current = terminalNow;
  }, [
    input.deriveInput,
    input.activePrompt,
    input.onArtifactFrozen,
    activeAgentRunId,
    historyScope,
  ]);

  const resetActiveAgentRun = useCallback(() => {
    setActiveAgentRunId(null);
    setSelectedAgentRunId(null);
    setSelectedArtifactDiffPath(null);
    frozenRunIdsRef.current.clear();
    wasTerminalRef.current = false;
    activeUserMessageIdRef.current = null;
    activePromptRef.current = null;
  }, []);

  return {
    agentRunHistory,
    selectedAgentRunId,
    selectedArtifactDiffPath,
    activeAgentRunId,
    beginAgentRun,
    selectAgentRun,
    focusArtifactDiff,
    resetActiveAgentRun,
  };
}

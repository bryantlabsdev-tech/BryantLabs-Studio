import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import {
  buildAgentRunFinalSummary,
  formatAgentRunSummaryText,
  type AgentRunFinalSummary,
} from "@/core/agent/agentLiveActivityTimeline";
import {
  buildAgentConversationProjection,
  narrativeTargetText,
  type AgentInlineAction,
} from "@/core/agent/agentConversationProjection";
import {
  buildAgentToolStream,
  mergeAgentToolEvents,
  type AgentToolEvent,
  type AgentToolKind,
} from "@/core/agent/agentToolStream";
import type { BuildLoopPhase } from "@/core/build/types";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { PlanApplySession } from "@/core/planApply/types";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import {
  deriveAgentOperationalActivity,
  type OperationalActivityStep,
  type OperationalStepId,
} from "@/core/agent/deriveAgentOperationalActivity";
import type { RunReviewProps } from "@/components/views/RunConversationBlock";
import { useAgentLiveStream } from "@/components/agent/useAgentLiveStream";
import { AGENT_COPY } from "@/core/agent/agentExecutionCopy";

export interface AgentExecutionFlowProps {
  readonly card: AgentRunCardViewModel;
  readonly buildPhase: BuildLoopPhase;
  readonly planApplySession: PlanApplySession | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly timeline: RunTimelineSnapshot | null;
  readonly runStartedAt: number | null;
  readonly greenfieldRun?: GreenfieldRunSnapshot | null;
  readonly frozen?: boolean;
  readonly embedded?: boolean;
  readonly review?: RunReviewProps | null;
  readonly runFinalSummary?: AgentRunFinalSummary | null;
  readonly previewReady?: boolean;
  readonly runId?: string | null;
  readonly onCancel?: () => void;
  readonly onRetry?: () => void;
  readonly onOpenPreview?: () => void;
  readonly onViewChanges?: () => void;
  readonly onOpenReview?: () => void;
  readonly onOpenDetails?: () => void;
  readonly onOpenDiagnostics?: () => void;
}

const OPERATIONAL_TOOL_MAP: Partial<
  Record<OperationalStepId, { readonly id: string; readonly label: string; readonly kind: AgentToolKind }>
> = {
  understanding: { id: "read:project", label: "Reading project structure", kind: "read" },
  scanning: { id: "search:codebase", label: "Explored the codebase", kind: "search" },
  selecting_files: { id: "plan:select", label: "Selecting files", kind: "plan" },
  building_plan: { id: "plan:main", label: "Planning changes", kind: "plan" },
  generating_changes: { id: "generate:main", label: "Generating implementation", kind: "generate" },
  validating_patches: { id: "generate:validate", label: "Reviewing generated code", kind: "generate" },
  applying_changes: { id: "edit:active", label: "Applying edits", kind: "edit" },
  verification: { id: "run:typescript", label: "Running TypeScript", kind: "run" },
  preparing_review: { id: "generate:review", label: "Preparing review", kind: "generate" },
  completed: { id: "run:preview", label: "Preview started", kind: "run" },
  failed: { id: "failure:operational", label: "Run failed", kind: "failure" },
};

function mapOperationalStatus(
  status: OperationalActivityStep["status"],
): AgentToolEvent["status"] {
  if (status === "active") return "running";
  if (status === "complete") return "success";
  if (status === "failed") return "failed";
  return "running";
}

function buildToolsFromOperational(
  operationalSteps: readonly OperationalActivityStep[],
): AgentToolEvent[] {
  const items: AgentToolEvent[] = [];
  for (const step of operationalSteps) {
    if (step.status === "pending") continue;
    const mapped = OPERATIONAL_TOOL_MAP[step.id];
    if (!mapped) continue;
    const status = mapOperationalStatus(step.status);
    const existing = items.find((item) => item.id === mapped.id);
    if (existing) {
      const index = items.indexOf(existing);
      items[index] = {
        ...existing,
        status:
          status === "failed" || existing.status === "failed"
            ? "failed"
            : status === "running" || existing.status === "running"
              ? "running"
              : "success",
      };
      continue;
    }
    items.push({
      id: mapped.id,
      kind: mapped.kind,
      label: mapped.label,
      status,
      at: step.startedAt ?? Date.now(),
    });
  }
  return items;
}

function PassiveActionRow({
  action,
  active,
}: {
  readonly action: AgentInlineAction;
  readonly active: boolean;
}) {
  return (
    <li
      className={[
        "agent-conversation__action",
        active ? "agent-conversation__action--active" : "agent-conversation__action--done",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={`agent-execution-step-${action.id}`}
    >
      <span className="agent-conversation__action-line">
        <span className="agent-conversation__action-icon" aria-hidden>
          {action.icon}
        </span>
        {action.label}
      </span>
    </li>
  );
}

function PassiveActionsRail({
  actions,
  revealedIds,
  activeActionId,
}: {
  readonly actions: readonly AgentInlineAction[];
  readonly revealedIds: readonly string[];
  readonly activeActionId: string | null;
}) {
  const [groupOpen, setGroupOpen] = useState(false);

  const visible = actions.filter(
    (action) =>
      revealedIds.includes(action.id) ||
      action.id === activeActionId ||
      action.status === "failed",
  );
  const completed = visible.filter(
    (action) => action.status === "success" && action.id !== activeActionId,
  );
  const active = visible.find((action) => action.id === activeActionId) ?? null;

  if (visible.length === 0) return null;

  return (
    <div className="agent-conversation__actions" data-testid="agent-execution-steps">
      {active ? (
        <ul className="agent-conversation__action-list">
          <PassiveActionRow action={active} active />
        </ul>
      ) : null}
      {completed.length > 0 ? (
        <div className="agent-conversation__action-group agent-conversation__action-group--collapsed">
          <button
            type="button"
            className="agent-conversation__action-group-toggle"
            aria-expanded={groupOpen}
            onClick={() => setGroupOpen((open) => !open)}
          >
            {groupOpen ? "▲" : "▼"} {completed.length} completed
          </button>
          {groupOpen ? (
            <ul className="agent-conversation__action-list">
              {completed.map((action) => (
                <PassiveActionRow key={action.id} action={action} active={false} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AgentExecutionFlow({
  card,
  buildPhase,
  planApplySession,
  scanStatus,
  timeline,
  runStartedAt: _runStartedAt,
  greenfieldRun = null,
  frozen = false,
  embedded: _embedded = false,
  review = null,
  runFinalSummary = null,
  previewReady = false,
  runId = null,
  onCancel,
  onRetry,
  onOpenPreview,
  onViewChanges,
  onOpenReview,
  onOpenDetails,
  onOpenDiagnostics,
}: AgentExecutionFlowProps) {
  const entries: readonly GreenfieldRunLogEntry[] = greenfieldRun?.entries ?? [];
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [revealedActionIds, setRevealedActionIds] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mergedToolsRef = useRef<AgentToolEvent[]>([]);
  const isRunning = card.overallStatus === "running" && !frozen;

  useEffect(() => {
    mergedToolsRef.current = [];
    setRevealedActionIds([]);
  }, [runId, card.streamRevision]);

  const providerWaiting = useMemo(
    () => toolsIncludeWait(entries, card),
    [entries, card],
  );

  const streamTools = useMemo(() => {
    if (entries.length > 0) {
      return buildAgentToolStream({
        entries,
        card,
        run: greenfieldRun,
        nowMs,
      });
    }
    return buildToolsFromOperational(
      deriveAgentOperationalActivity({
        card,
        buildPhase,
        planApplySession,
        scanStatus,
        timeline,
        runStartedAt: _runStartedAt,
        nowMs,
      }),
    );
  }, [
    entries,
    card,
    greenfieldRun,
    nowMs,
    buildPhase,
    planApplySession,
    scanStatus,
    timeline,
    _runStartedAt,
  ]);

  const tools = useMemo(() => {
    const merged = mergeAgentToolEvents(mergedToolsRef.current, streamTools);
    mergedToolsRef.current = merged;
    return merged;
  }, [streamTools]);

  const waitElapsedMs = useMemo(() => {
    if (!providerWaiting) return 0;
    const waitTool = tools.find((tool) => tool.id === "wait:provider");
    if (waitTool) return Math.max(0, nowMs - waitTool.at);
    return Math.max(0, nowMs - (_runStartedAt ?? nowMs));
  }, [providerWaiting, nowMs, tools, _runStartedAt]);

  useEffect(() => {
    if (!isRunning) return;
    const intervalMs = providerWaiting ? 800 : 2_000;
    const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [isRunning, providerWaiting]);

  const summary =
    runFinalSummary ??
    (!isRunning &&
    (card.overallStatus === "complete" ||
      card.overallStatus === "failed" ||
      card.overallStatus === "cancelled" ||
      card.overallStatus === "incomplete")
      ? buildAgentRunFinalSummary({
          entries,
          card,
          run: greenfieldRun,
        })
      : null);

  const projection = useMemo(
    () =>
      buildAgentConversationProjection({
        tools,
        summary,
        previewReady,
        isRunning,
        waitElapsedMs,
      }),
    [tools, summary, previewReady, isRunning, waitElapsedMs],
  );

  const targetText = useMemo(
    () => narrativeTargetText(projection.segments, projection.waitSuffix),
    [projection.segments, projection.waitSuffix],
  );

  const { displayText, isTyping } = useAgentLiveStream(targetText, {
    live: isRunning && !frozen,
    frozen,
  });

  useEffect(() => {
    const timers: number[] = [];
    for (const action of projection.actions) {
      if (action.status !== "success") continue;
      if (revealedActionIds.includes(action.id)) continue;
      timers.push(
        window.setTimeout(() => {
          setRevealedActionIds((current) =>
            current.includes(action.id) ? current : [...current, action.id],
          );
        }, 180),
      );
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [projection.actions, revealedActionIds]);

  const finished = Boolean(summary && !isRunning);
  const failed = summary?.outcome === "failed" || summary?.outcome === "cancelled";

  useEffect(() => {
    if (!isRunning) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [displayText.length, revealedActionIds.length, isRunning]);

  const handleCopyDiagnostics = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(formatAgentRunSummaryText(summary));
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <div
      className={[
        "agent-conversation",
        isRunning ? "agent-conversation--live" : "",
        providerWaiting ? "agent-conversation--waiting" : "",
        finished ? "agent-conversation--finished" : "",
        failed ? "agent-conversation--failed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="agent-execution-flow"
      aria-live="polite"
    >
      <div className="agent-conversation__body">
        <p
          className="agent-conversation__prose agent-conversation__stream"
          data-testid="agent-run-summary-prose"
        >
          {displayText}
          {isTyping ? <span className="agent-conversation__cursor" aria-hidden /> : null}
        </p>

        <PassiveActionsRail
          actions={projection.actions}
          revealedIds={revealedActionIds}
          activeActionId={projection.activeActionId}
        />

        {review?.awaiting ? (
          <p className="agent-conversation__prose" data-testid="agent-review-chip">
            {AGENT_COPY.review.ready}{" "}
            <button
              type="button"
              className="agent-conversation__inline-link"
              onClick={onOpenReview ?? onViewChanges ?? (() => {})}
            >
              {AGENT_COPY.review.open}
            </button>
          </p>
        ) : null}
      </div>

      {finished && !review?.awaiting ? (
        <div className="agent-conversation__links" data-testid="agent-turn-footer">
          {!failed && previewReady && onOpenPreview ? (
            <button type="button" className="agent-conversation__link" onClick={onOpenPreview}>
              Open Preview
            </button>
          ) : null}
          {!failed && onViewChanges ? (
            <button type="button" className="agent-conversation__link" onClick={onViewChanges}>
              View Changes
            </button>
          ) : null}
          {failed && onRetry ? (
            <button type="button" className="agent-conversation__link" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          {runId && onOpenDetails ? (
            <button
              type="button"
              className="agent-conversation__link"
              data-testid="agent-execution-details"
              onClick={onOpenDetails}
            >
              View Details
            </button>
          ) : null}
          {onOpenDiagnostics ? (
            <button
              type="button"
              className="agent-conversation__link agent-conversation__link--muted"
              onClick={() => void handleCopyDiagnostics()}
            >
              Copy Diagnostics
            </button>
          ) : null}
        </div>
      ) : null}

      {isRunning && onCancel ? (
        <div className="agent-conversation__links agent-conversation__links--subtle">
          <button type="button" className="agent-conversation__link--muted" onClick={onCancel}>
            Cancel
          </button>
          {runId && onOpenDetails ? (
            <button
              type="button"
              className="agent-conversation__link--muted"
              data-testid="agent-execution-details"
              onClick={onOpenDetails}
            >
              Details
            </button>
          ) : null}
        </div>
      ) : null}

      <div ref={bottomRef} className="agent-conversation__anchor" aria-hidden />
    </div>
  );
}

function toolsIncludeWait(
  entries: readonly GreenfieldRunLogEntry[],
  card: AgentRunCardViewModel,
): boolean {
  if (card.overallStatus !== "running") return false;
  return entries.some(
    (entry) =>
      (entry.stage === "provider_call" ||
        entry.stage === "ai_call" ||
        entry.stage === "provider" ||
        entry.stage === "apply_plan" ||
        entry.stage === "pipeline_coder") &&
      entry.status === "running",
  );
}

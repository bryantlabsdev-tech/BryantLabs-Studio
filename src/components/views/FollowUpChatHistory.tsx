import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import { findAgentRunArtifact, type AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import {
  isScrollNearBottom,
  shouldAutoScrollAgentChat,
  shouldScrollOnRunComplete,
} from "@/core/agent/agentChatAutoScroll";
import {
  RunConversationBlock,
  type RunReviewProps,
} from "@/components/views/RunConversationBlock";
import { RunReviewActions } from "@/components/views/RunReviewActions";
import { EmptyState } from "@/components/EmptyState";
import { AgentIcon } from "@/components/icons";
import {
  AgentConversationThread,
  AgentThreadContinuation,
} from "@/components/agent/AgentConversationThread";
import type { PlanApplySession } from "@/core/planApply/types";
import type { BuildLoopPhase } from "@/core/build/types";

interface FollowUpChatHistoryProps {
  messages: readonly FollowUpChatMessage[];
  agentRunCard?: AgentRunCardViewModel | null;
  agentRunHistory?: readonly AgentRunArtifact[];
  activeAgentRunId?: string | null;
  selectedRunId?: string | null;
  highlightedRunId?: string | null;
  onSelectRun?: (runId: string | null) => void;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  onAgentRunCancel?: () => void;
  onAgentRunOpenConsole?: () => void;
  onAgentRunRetry?: () => void;
  onAgentRunSwitchProvider?: () => void;
  onOpenPreview?: () => void;
  onOpenFile?: (path: string) => void;
  onViewChanges?: () => void;
  onFocusRunDiff?: (runId: string, path?: string) => void;
  liveFileDiffs?: readonly RunFileDiff[];
  review?: RunReviewProps | null;
  onSuggestionClick?: (text: string) => void;
  emptyHint?: string;
  emptyExamples?: readonly string[];
  suppressLatestSuggestions?: boolean;
  greenfieldRun?: GreenfieldRunSnapshot | null;
  projectPath?: string | null;
  planApplySession?: PlanApplySession | null;
  buildPhase?: BuildLoopPhase;
  scanStatus?: "idle" | "scanning" | "done" | "error";
}

function formatMessageTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function RunSeparator() {
  return (
    <li aria-hidden className="follow-up-chat__run-separator">
      <AgentThreadContinuation />
    </li>
  );
}

function shouldHideStudioOutcomeMessage(
  msg: FollowUpChatMessage,
  messages: readonly FollowUpChatMessage[],
  index: number,
  agentRunHistory: readonly AgentRunArtifact[],
): boolean {
  if (msg.role !== "studio") return false;
  if (msg.outcome !== "success" && msg.outcome !== "failure") return false;

  for (let i = index - 1; i >= 0; i -= 1) {
    const previous = messages[i];
    if (previous.role === "user" && previous.runId) {
      const artifact = findAgentRunArtifact(agentRunHistory, previous.runId);
      return Boolean(artifact);
    }
    if (previous.role === "user") break;
  }
  return false;
}

export function FollowUpChatHistory({
  messages,
  agentRunCard = null,
  agentRunHistory = [],
  activeAgentRunId = null,
  selectedRunId = null,
  highlightedRunId = null,
  onSelectRun,
  scrollContainerRef = undefined,
  onAgentRunCancel,
  onAgentRunOpenConsole,
  onAgentRunRetry,
  onAgentRunSwitchProvider,
  onOpenPreview,
  onOpenFile,
  onViewChanges,
  onFocusRunDiff,
  liveFileDiffs = [],
  review = null,
  onSuggestionClick,
  emptyHint = "Describe what you want to build or change.",
  emptyExamples = [],
  suppressLatestSuggestions = false,
  greenfieldRun = null,
  projectPath = null,
  planApplySession = null,
  buildPhase = "idle",
  scanStatus = "idle",
}: FollowUpChatHistoryProps) {
  const bottomRef = useRef<HTMLLIElement>(null);
  const userPausedAutoScrollRef = useRef(false);
  const prevRunActiveRef = useRef(false);

  const artifactByRunId = useMemo(() => {
    const map = new Map<string, AgentRunArtifact>();
    for (const artifact of agentRunHistory) {
      map.set(artifact.runId, artifact);
    }
    return map;
  }, [agentRunHistory]);

  const showLiveRunCard = Boolean(
    agentRunCard?.isVisible && activeAgentRunId && !artifactByRunId.has(activeAgentRunId),
  );
  const runActive = agentRunCard?.overallStatus === "running";
  const reviewEmbeddedInLiveRun = Boolean(review?.awaiting && showLiveRunCard && activeAgentRunId);

  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const onScroll = () => {
      userPausedAutoScrollRef.current = !isScrollNearBottom(container);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef?.current;
    const scrollToBottom = () => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    const completed = shouldScrollOnRunComplete({
      wasActive: prevRunActiveRef.current,
      isActive: runActive,
    });
    prevRunActiveRef.current = runActive;

    if (completed) {
      scrollToBottom();
      return;
    }

    if (
      shouldAutoScrollAgentChat({
        runActive,
        userPausedAutoScroll: userPausedAutoScrollRef.current,
      })
    ) {
      scrollToBottom();
    }

    if (container && isScrollNearBottom(container)) {
      userPausedAutoScrollRef.current = false;
    }
  }, [
    messages.length,
    messages[messages.length - 1]?.id,
    agentRunCard?.streamRevision,
    agentRunCard?.progressPercent,
    agentRunCard?.summary,
    agentRunCard?.latestProviderEvent,
    agentRunCard?.fileActivity.length,
    agentRunCard?.thoughtStream.length,
    showLiveRunCard,
    runActive,
    agentRunHistory.length,
    scrollContainerRef,
  ]);

  useEffect(() => {
    if (!highlightedRunId) return;
    const node = document.querySelector(`[data-run-id="${highlightedRunId}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedRunId]);

  const renderRunBlock = (
    artifact: AgentRunArtifact | null,
    live: AgentRunCardViewModel | null,
    runNumber: number | undefined,
    frozen: boolean,
    runId: string | null,
  ) => {
    const card = artifact?.card ?? live;
    if (!card) return null;

    const userPrompt =
      artifact?.prompt ??
      messages.find((message) => message.role === "user" && message.runId === runId)?.text ??
      null;

    const showReview =
      !frozen && runId === activeAgentRunId && review?.awaiting ? review : null;

    const blockProps = {
      viewModel: card,
      frozen,
      artifact,
      selected: Boolean(runId && selectedRunId === runId),
      highlighted: Boolean(runId && highlightedRunId === runId),
      review: showReview,
      ...(runNumber != null ? { runNumber } : {}),
      ...(artifact?.fileDiffs
        ? { fileDiffs: artifact.fileDiffs }
        : !frozen && runId === activeAgentRunId && liveFileDiffs.length > 0
          ? { fileDiffs: liveFileDiffs }
          : {}),
      ...(onSelectRun && runId && frozen
        ? { onSelect: () => onSelectRun(selectedRunId === runId ? null : runId) }
        : {}),
      ...(!frozen && onAgentRunCancel ? { onCancel: onAgentRunCancel } : {}),
      ...(onAgentRunOpenConsole ? { onOpenConsole: onAgentRunOpenConsole } : {}),
      ...(!frozen && onAgentRunRetry ? { onRetry: onAgentRunRetry } : {}),
      ...(!frozen && onAgentRunSwitchProvider
        ? { onSwitchProvider: onAgentRunSwitchProvider }
        : {}),
      ...(onOpenPreview ? { onOpenPreview } : {}),
      ...(onOpenFile ? { onOpenFile } : {}),
      ...(runId && onFocusRunDiff
        ? {
            onFocusDiffFile: (path: string) => onFocusRunDiff(runId, path),
            onViewChanges: () => onFocusRunDiff(runId),
          }
        : onViewChanges
          ? { onViewChanges }
          : {}),
      ...(greenfieldRun ? { greenfieldRun } : {}),
      ...(projectPath ? { projectPath } : {}),
      prompt: userPrompt,
      activeRunId: runId,
      planApplySession,
      buildPhase,
      scanStatus,
      continuous: true,
    };

    return <RunConversationBlock {...blockProps} />;
  };

  if (messages.length === 0 && !showLiveRunCard) {
    return (
      <section className="follow-up-chat follow-up-chat--empty" aria-label="Agent conversation">
        <EmptyState
          title="Start a conversation"
          description={emptyHint}
          icon={<AgentIcon />}
          action={
            emptyExamples.length > 0 && onSuggestionClick ? (
              <ul className="follow-up-chat__empty-examples">
                {emptyExamples.map((ex) => (
                  <li key={ex}>
                    <button
                      type="button"
                      className="follow-up-chat__empty-example btn btn--ghost"
                      onClick={() => onSuggestionClick(ex)}
                    >
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null
          }
        />
      </section>
    );
  }

  const latestSuccessId = suppressLatestSuggestions
    ? [...messages].reverse().find((m) => m.role === "studio" && m.outcome === "success")?.id
    : null;

  return (
    <AgentConversationThread>
    <section className="follow-up-chat" aria-label="Agent conversation">
      <ol className="follow-up-chat__list">
        {messages.flatMap((msg, index) => {
          if (shouldHideStudioOutcomeMessage(msg, messages, index, agentRunHistory)) {
            return [];
          }

          const runArtifact =
            msg.role === "user" && msg.runId
              ? findAgentRunArtifact(agentRunHistory, msg.runId)
              : null;
          const isActiveUserRun =
            msg.role === "user" && msg.runId && msg.runId === activeAgentRunId;
          const showLiveForMessage = isActiveUserRun && showLiveRunCard;

          if (msg.role === "studio" && msg.outcome === "neutral") {
            return (
              <li key={msg.id} className="follow-up-chat__row follow-up-chat__row--activity">
                <p className="follow-up-chat__activity">{msg.text}</p>
              </li>
            );
          }

          const rows = [
            <li
              key={msg.id}
              className={`follow-up-chat__row follow-up-chat__row--${msg.role}`}
            >
              <article
                className={[
                  "follow-up-chat__bubble",
                  `follow-up-chat__bubble--${msg.role}`,
                  msg.outcome ? `follow-up-chat__bubble--${msg.outcome}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <header className="follow-up-chat__meta">
                  <span className="follow-up-chat__speaker">
                    {msg.role === "user" ? "You" : "Agent"}
                  </span>
                  <time className="follow-up-chat__time" dateTime={new Date(msg.at).toISOString()}>
                    {formatMessageTime(msg.at)}
                  </time>
                </header>
                <p className="follow-up-chat__text">{msg.text}</p>
                {msg.filesModified && msg.filesModified.length > 0 ? (
                  <div className="follow-up-chat__files">
                    {msg.filesModified.slice(0, 6).map((f) => (
                      <span key={f} className="follow-up-chat__file-pill">
                        {f}
                      </span>
                    ))}
                    {msg.filesModified.length > 6 ? (
                      <span className="follow-up-chat__file-pill follow-up-chat__file-pill--more">
                        +{msg.filesModified.length - 6} more
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {msg.suggestedNextSteps &&
                msg.suggestedNextSteps.length > 0 &&
                onSuggestionClick &&
                msg.id !== latestSuccessId ? (
                  <ul className="follow-up-chat__suggestions">
                    {msg.suggestedNextSteps.map((step) => (
                      <li key={step}>
                        <button
                          type="button"
                          className="follow-up-chat__suggestion"
                          onClick={() => onSuggestionClick(step)}
                        >
                          {step}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            </li>,
          ];

          if (msg.role === "user" && msg.runId) {
            const runBlock = runArtifact
              ? renderRunBlock(runArtifact, null, runArtifact.runNumber, true, msg.runId)
              : showLiveForMessage
                ? renderRunBlock(null, agentRunCard ?? null, undefined, false, msg.runId)
                : null;

            if (runBlock) {
              rows.push(
                <li
                  key={`${msg.id}-run`}
                  className="follow-up-chat__row follow-up-chat__row--agent-run"
                >
                  {runBlock}
                </li>,
              );
              const hasLaterUserRun = messages
                .slice(index + 1)
                .some((later) => later.role === "user" && later.runId);
              if (runArtifact || hasLaterUserRun) {
                rows.push(<RunSeparator key={`${msg.id}-sep`} />);
              }
            }
          }

          return rows;
        })}
        {messages.length === 0 && showLiveRunCard && agentRunCard ? (
          <li className="follow-up-chat__row follow-up-chat__row--agent-run">
            {renderRunBlock(null, agentRunCard, undefined, false, activeAgentRunId)}
          </li>
        ) : null}
        {review?.awaiting && !reviewEmbeddedInLiveRun ? (
          <li className="follow-up-chat__row follow-up-chat__row--agent-run">
            <article className="run-conversation">
              <RunReviewActions review={review} />
            </article>
          </li>
        ) : null}
        <li ref={bottomRef} aria-hidden className="follow-up-chat__anchor" />
      </ol>
    </section>
    </AgentConversationThread>
  );
}

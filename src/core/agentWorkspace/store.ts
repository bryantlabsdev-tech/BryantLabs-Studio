import type {
  AgentArtifacts,
  AgentContextSnapshot,
  AgentFeedEntry,
  AgentFeedKind,
  AgentFileDecision,
  AgentHistoryCategory,
  AgentHistoryEntry,
  AgentReasoningEntry,
  AgentReport,
  AgentSessionStatus,
  AgentTimelineStatus,
  AgentWorkspaceSession,
} from "@/core/agentWorkspace/types";

const MAX_FEED = 80;
const MAX_HISTORY = 60;
const MAX_DECISIONS = 40;
const MAX_REASONING = 120;

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export const DEFAULT_TIMELINE: readonly { id: string; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "execution", label: "Execution" },
  { id: "verification", label: "Verification" },
  { id: "repair", label: "Repair" },
  { id: "complete", label: "Complete" },
] as const;

export function emptyAgentWorkspaceSession(): AgentWorkspaceSession {
  return {
    startedAt: Date.now(),
    endedAt: null,
    status: "idle",
    feed: [],
    context: {
      goal: null,
      phase: null,
      task: null,
      file: null,
      model: null,
      tokens: null,
    },
    decisions: [],
    history: [],
    reasoning: [],
    artifacts: {
      filesCreated: [],
      filesModified: [],
      errorsFixed: [],
      verificationResults: [],
    },
    timeline: DEFAULT_TIMELINE.map((s) => ({
      ...s,
      status: "pending" as const,
    })),
  };
}

function cap<T>(list: readonly T[], max: number): T[] {
  return list.length <= max ? [...list] : list.slice(list.length - max);
}

function deactivateFeed(feed: readonly AgentFeedEntry[]): AgentFeedEntry[] {
  return feed.map((e) => (e.active ? { ...e, active: false } : e));
}

export function startAgentSession(
  session: AgentWorkspaceSession | null,
  goal: string,
): AgentWorkspaceSession {
  const base = session ?? emptyAgentWorkspaceSession();
  return {
    ...base,
    startedAt: base.feed.length === 0 ? Date.now() : base.startedAt,
    endedAt: null,
    status: "active",
    context: { ...base.context, goal },
  };
}

export function setAgentStatus(
  session: AgentWorkspaceSession,
  status: AgentSessionStatus,
): AgentWorkspaceSession {
  return {
    ...session,
    status,
    ...(status === "completed" || status === "stopped"
      ? { endedAt: Date.now() }
      : {}),
  };
}

export function patchAgentContext(
  session: AgentWorkspaceSession,
  patch: Partial<AgentContextSnapshot>,
): AgentWorkspaceSession {
  return {
    ...session,
    context: { ...session.context, ...patch },
  };
}

export function appendAgentFeed(
  session: AgentWorkspaceSession,
  kind: AgentFeedKind,
  title: string,
  detail?: string | null,
): AgentWorkspaceSession {
  const deactivated = deactivateFeed(session.feed);
  const entry: AgentFeedEntry = {
    id: nextId("feed"),
    kind,
    title,
    detail: detail ?? null,
    at: Date.now(),
    active: kind !== "completed",
  };
  return {
    ...session,
    status: session.status === "idle" ? "active" : session.status,
    feed: cap([...deactivated, entry], MAX_FEED),
  };
}

export function appendAgentReasoning(
  session: AgentWorkspaceSession,
  input: {
    thought: string;
    reason: string;
    action: string;
    result: string | null;
    ok: boolean;
  },
): AgentWorkspaceSession {
  const entry: AgentReasoningEntry = {
    id: nextId("reason"),
    thought: input.thought.trim(),
    reason: input.reason.trim(),
    action: input.action.trim(),
    result: input.result,
    ok: input.ok,
    at: Date.now(),
  };
  if (!entry.thought && !entry.action) return session;
  const withReasoning: AgentWorkspaceSession = {
    ...session,
    ...(session.status === "idle" ? { status: "active" as const } : {}),
    reasoning: cap([...session.reasoning, entry], MAX_REASONING),
  };
  const withFeed = appendAgentFeed(
    withReasoning,
    "thinking",
    entry.action,
    `${entry.thought} — ${entry.reason}`,
  );
  return appendAgentHistory(
    withFeed,
    "reasoning",
    entry.action,
    entry.result ?? entry.reason,
  );
}

export function appendAgentHistory(
  session: AgentWorkspaceSession,
  category: AgentHistoryCategory,
  title: string,
  detail?: string | null,
): AgentWorkspaceSession {
  const entry: AgentHistoryEntry = {
    id: nextId("hist"),
    category,
    title,
    detail: detail ?? null,
    at: Date.now(),
  };
  return {
    ...session,
    history: cap([...session.history, entry], MAX_HISTORY),
  };
}

export function recordAgentDecision(
  session: AgentWorkspaceSession,
  path: string,
  reason: string,
): AgentWorkspaceSession {
  if (!path.trim() || !reason.trim()) return session;
  const exists = session.decisions.some(
    (d) => d.path === path && d.reason === reason,
  );
  if (exists) return session;
  const entry: AgentFileDecision = {
    path: path.trim(),
    reason: reason.trim(),
    at: Date.now(),
  };
  return {
    ...session,
    decisions: cap([...session.decisions, entry], MAX_DECISIONS),
  };
}

export function setTimelineStage(
  session: AgentWorkspaceSession,
  stageId: string,
  status: AgentTimelineStatus,
): AgentWorkspaceSession {
  const timeline = session.timeline.map((s) => {
    if (s.id === stageId) return { ...s, status };
    if (status === "active") {
      const order = DEFAULT_TIMELINE.map((x) => x.id);
      const activeIdx = order.indexOf(stageId);
      const thisIdx = order.indexOf(s.id);
      if (thisIdx >= 0 && activeIdx >= 0 && thisIdx < activeIdx && s.status === "active") {
        return { ...s, status: "done" as const };
      }
    }
    return s;
  });
  return { ...session, timeline };
}

export function mergeAgentArtifacts(
  session: AgentWorkspaceSession,
  patch: Partial<AgentArtifacts>,
): AgentWorkspaceSession {
  const a = session.artifacts;
  return {
    ...session,
    artifacts: {
      filesCreated: patch.filesCreated
        ? [...new Set([...a.filesCreated, ...patch.filesCreated])]
        : a.filesCreated,
      filesModified: patch.filesModified
        ? [...new Set([...a.filesModified, ...patch.filesModified])]
        : a.filesModified,
      errorsFixed: patch.errorsFixed
        ? [...new Set([...a.errorsFixed, ...patch.errorsFixed])]
        : a.errorsFixed,
      verificationResults: patch.verificationResults
        ? [...new Set([...a.verificationResults, ...patch.verificationResults])]
        : a.verificationResults,
    },
  };
}

export function buildAgentReport(session: AgentWorkspaceSession): AgentReport {
  const ended = session.endedAt ?? Date.now();
  const plans = session.history
    .filter((h) => h.category === "plan")
    .map((h) => h.title);
  const executions = session.history
    .filter((h) => h.category === "execution")
    .map((h) => h.title);
  const verifications = session.history
    .filter((h) => h.category === "verification")
    .map((h) => h.title);
  const autoFixes = session.history
    .filter((h) => h.category === "auto_fix")
    .map((h) => h.title);

  return {
    goal: session.context.goal,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: ended - session.startedAt,
    plans,
    executions,
    verifications,
    autoFixes,
    filesCreated: session.artifacts.filesCreated,
    filesModified: session.artifacts.filesModified,
    errorsFixed: session.artifacts.errorsFixed,
    feedSummary: session.feed.map(
      (f) => `${f.title}${f.detail ? ` — ${f.detail}` : ""}`,
    ),
  };
}

export function formatAgentReportMarkdown(report: AgentReport): string {
  const sec = Math.round(report.durationMs / 1000);
  const lines = [
    "# Agent Report",
    "",
    `**Goal:** ${report.goal ?? "—"}`,
    `**Duration:** ${sec}s`,
    "",
    "## Plans",
    ...(report.plans.length ? report.plans.map((p) => `- ${p}`) : ["- —"]),
    "",
    "## Execution",
    ...(report.executions.length
      ? report.executions.map((p) => `- ${p}`)
      : ["- —"]),
    "",
    "## Verification",
    ...(report.verifications.length
      ? report.verifications.map((p) => `- ${p}`)
      : ["- —"]),
    "",
    "## Auto Fix",
    ...(report.autoFixes.length
      ? report.autoFixes.map((p) => `- ${p}`)
      : ["- —"]),
    "",
    "## Files created",
    ...(report.filesCreated.length
      ? report.filesCreated.map((f) => `- \`${f}\``)
      : ["- —"]),
    "",
    "## Files modified",
    ...(report.filesModified.length
      ? report.filesModified.map((f) => `- \`${f}\``)
      : ["- —"]),
    "",
    "## Activity feed",
    ...(report.feedSummary.length
      ? report.feedSummary.map((f) => `- ${f}`)
      : ["- —"]),
  ];
  return lines.join("\n");
}

export function formatAgentReportJson(report: AgentReport): string {
  return JSON.stringify(report, null, 2);
}

import type { AgentLoopSession } from "@/core/agentLoop/types";
import {
  formatFailureReportRootCauseCopy,
  type StudioFailureReport,
} from "@/core/diagnostics/failureReport";
import { BRYANTLABS_AGENT_DISPLAY_NAME } from "@/core/studioRun/types";
import type { VerificationResult } from "@/types";
import { buildAgentReport } from "@/core/agentWorkspace/store";
import { redactSecrets, redactSecretsDeep } from "@/core/agentWorkspace/redact";
import type {
  AgentFeedEntry,
  AgentReasoningEntry,
  AgentWorkspaceSession,
} from "@/core/agentWorkspace/types";

export function buildAgentExportContext(
  input: AgentExportContext,
): AgentExportContext {
  return input;
}

export interface AgentExportContext {
  readonly projectPath: string | null;
  readonly agentSession: AgentWorkspaceSession;
  readonly agentLoopSession: AgentLoopSession | null;
  readonly agentLoopError: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly lastPlanPrompt: string | null;
  readonly planSummary: string | null;
  readonly verification: VerificationResult | null;
  readonly failureReport: StudioFailureReport | null;
}

function iso(at: number | null | undefined): string {
  if (!at) return "—";
  return new Date(at).toISOString();
}

function providerModel(ctx: AgentExportContext): string {
  const fromCtx = ctx.agentSession.context.model;
  if (fromCtx) return fromCtx;
  if (ctx.provider && ctx.model) return `${ctx.provider} · ${ctx.model}`;
  if (ctx.provider) return ctx.provider;
  if (ctx.model) return ctx.model;
  return "—";
}

function activeFeedStep(feed: readonly AgentFeedEntry[]): string | null {
  const active = feed.find((f) => f.active);
  if (active) {
    return `${active.title}${active.detail ? ` — ${active.detail}` : ""}`;
  }
  const latest = feed[feed.length - 1];
  return latest
    ? `${latest.title}${latest.detail ? ` — ${latest.detail}` : ""}`
    : null;
}

function dynamicPlanLines(agentLoop: AgentLoopSession | null): string[] {
  if (!agentLoop?.dynamicTasks.length) return ["—"];
  return [...agentLoop.dynamicTasks]
    .filter((t) => t.status !== "removed")
    .sort((a, b) => a.order - b.order)
    .map((t) => `- [${t.status}] ${t.title}`);
}

function reasoningDedupeKey(entry: {
  thought: string;
  action: string;
  result: string | null;
}): string {
  return `${entry.thought}|${entry.action}|${entry.result ?? ""}`;
}

function formatReasoningEntries(
  workspace: readonly AgentReasoningEntry[],
  agentLoop: AgentLoopSession | null,
): string[] {
  const lines: string[] = [];
  const all = [
    ...workspace.map((r) => ({ source: "workspace", entry: r })),
    ...(agentLoop?.reasoningLog ?? []).map((r) => ({
      source: "agent",
      entry: {
        thought: r.thought,
        reason: r.reason,
        action: r.action,
        result: r.result,
        ok: r.ok,
        at: r.at,
      },
    })),
  ].sort((a, b) => a.entry.at - b.entry.at);

  if (all.length === 0) return ["(no reasoning entries yet)"];

  const seen = new Set<string>();
  let suppressed = 0;

  for (const { source, entry } of all) {
    const key = reasoningDedupeKey(entry);
    if (seen.has(key)) {
      suppressed += 1;
      continue;
    }
    seen.add(key);
    lines.push(
      `### ${iso(entry.at)} (${source})`,
      "",
      `**Thought:** ${entry.thought}`,
      `**Reason:** ${entry.reason}`,
      `**Action:** ${entry.action}`,
      entry.result
        ? `**Result:** ${entry.ok ? "ok" : "FAILED"} — ${entry.result}`
        : "**Result:** —",
      "",
    );
  }
  if (suppressed > 0) {
    lines.push(
      `_(${suppressed} duplicate reasoning step(s) omitted from this export.)_`,
      "",
    );
  }
  return lines;
}

/** Copy live run — goal, status, model, iteration, plan, step, actions, results. */
export function formatAgentLiveRunCopy(
  ctx: AgentExportContext,
  format: "markdown" | "plain" = "markdown",
): string {
  const s = ctx.agentSession;
  const c = ctx.agentLoopSession;
  const h1 = format === "markdown" ? "# " : "";
  const lines = [
    `${h1}${BRYANTLABS_AGENT_DISPLAY_NAME} — live run`,
    "",
    `Goal: ${s.context.goal ?? c?.goal ?? "—"}`,
    `Workspace status: ${s.status}`,
    ...(c
      ? [
          `${BRYANTLABS_AGENT_DISPLAY_NAME} status: ${c.status}`,
          `Mode: ${c.mode}`,
          `Iteration: ${c.iteration} / ${c.maxIterations}`,
        ]
      : []),
    `Model / provider: ${providerModel(ctx)}`,
    `Project: ${ctx.projectPath ?? "—"}`,
    `Session started: ${iso(s.startedAt)}`,
    "",
    "## Dynamic plan",
    ...dynamicPlanLines(c),
    "",
    "## Current step",
    activeFeedStep(s.feed) ?? c?.dynamicTasks.find((t) => t.status === "active")?.title ?? "—",
    "",
    "## Context",
    `Phase: ${s.context.phase ?? "—"}`,
    `Task: ${s.context.task ?? "—"}`,
    `File: ${s.context.file ?? "—"}`,
    "",
    "## Actions & results (feed)",
    ...(s.feed.length
      ? s.feed.map(
          (f) =>
            `- [${iso(f.at)}] ${f.kind}: ${f.title}${f.detail ? ` — ${f.detail}` : ""}${f.active ? " (active)" : ""}`,
        )
      : ["—"]),
    "",
    "## Observations",
    ...(c?.observations.length
      ? c.observations.map((o) => `- ${o}`)
      : ["—"]),
    "",
    "## Pending approval",
    c?.pendingApproval
      ? `${c.pendingApproval.action}: ${c.pendingApproval.summary}`
      : "—",
  ];
  return redactSecrets(lines.join("\n"));
}

/** All Thought / Reason / Action / Result entries. */
export function formatAgentReasoningCopy(ctx: AgentExportContext): string {
  const lines = [
    `# ${BRYANTLABS_AGENT_DISPLAY_NAME} — reasoning`,
    "",
    ...formatReasoningEntries(ctx.agentSession.reasoning, ctx.agentLoopSession),
  ];
  return redactSecrets(lines.join("\n"));
}

/** Failed actions, errors, verification failures, root cause. */
export function formatAgentErrorsCopy(ctx: AgentExportContext): string {
  const s = ctx.agentSession;
  const c = ctx.agentLoopSession;
  const lines = [
    `# ${BRYANTLABS_AGENT_DISPLAY_NAME} — errors`,
    "",
    "## UI / session errors",
    ctx.agentLoopError ? `- ${ctx.agentLoopError}` : "—",
    "",
    "## Failed reasoning steps",
    ...(s.reasoning.filter((r) => !r.ok).length
      ? s.reasoning
          .filter((r) => !r.ok)
          .map(
            (r) =>
              `- [${iso(r.at)}] ${r.action}: ${r.result ?? r.thought}`,
          )
      : ["—"]),
    ...(c?.reasoningLog.filter((r) => !r.ok).length
      ? [
          "",
          "## Failed agent reasoning",
          ...c.reasoningLog
            .filter((r) => !r.ok)
            .map(
              (r) =>
                `- [${iso(r.at)}] ${r.action}: ${r.result ?? r.thought}`,
            ),
        ]
      : []),
    "",
    "## Feed errors / failures",
    ...(s.feed.filter((f) => f.kind === "repairing" || f.title.toLowerCase().includes("fail")).length
      ? s.feed
          .filter(
            (f) =>
              f.kind === "repairing" ||
              f.title.toLowerCase().includes("fail") ||
              f.title.toLowerCase().includes("error"),
          )
          .map((f) => `- [${iso(f.at)}] ${f.title}${f.detail ? `: ${f.detail}` : ""}`)
      : ["—"]),
    "",
    `## ${BRYANTLABS_AGENT_DISPLAY_NAME} flags`,
    c
      ? [
          `Last verification ok: ${c.flags.lastVerificationOk ?? "—"}`,
          `Plan attempts: ${c.flags.planAttempts}`,
          `Plan last error: ${c.flags.planLastError ?? "—"}`,
          `Root cause (agent): ${c.flags.rootCause ?? "—"}`,
          `Auto-fix attempts: ${c.flags.autoFixAttempts}`,
        ].join("\n")
      : "—",
    "",
    "## Verification",
  ];

  if (ctx.verification) {
    const v = ctx.verification;
    lines.push(
      `Typecheck: ${v.typecheck.ok ? "ok" : "failed"} (exit ${v.typecheck.exitCode ?? "—"})`,
      `Build: ${v.build.ok ? "ok" : "failed"} (exit ${v.build.exitCode ?? "—"})`,
    );
    if (!v.typecheck.ok && v.typecheck.stderr) {
      lines.push("", "### Typecheck stderr", v.typecheck.stderr.slice(0, 4000));
    }
    if (!v.build.ok && v.build.stderr) {
      lines.push("", "### Build stderr", v.build.stderr.slice(0, 4000));
    }
  } else {
    lines.push("—");
  }

  lines.push(
    "",
    "## Artifacts — errors fixed",
    ...(s.artifacts.errorsFixed.length
      ? s.artifacts.errorsFixed.map((e) => `- ${e}`)
      : ["—"]),
  );

  if (ctx.failureReport) {
    lines.push(
      "",
      "## Studio failure report (root cause)",
      formatFailureReportRootCauseCopy(ctx.failureReport),
    );
  }

  return redactSecrets(lines.join("\n"));
}

/** Timeline stages with status and related timestamps. */
export function formatAgentTimelineCopy(ctx: AgentExportContext): string {
  const s = ctx.agentSession;
  const lines = [
    `# ${BRYANTLABS_AGENT_DISPLAY_NAME} — timeline`,
    "",
    `Session: ${iso(s.startedAt)} → ${iso(s.endedAt)}`,
    "",
    "## Stages",
  ];

  for (const stage of s.timeline) {
    lines.push(`- **${stage.label}** — status: \`${stage.status}\``);
    const related = s.history.filter((h) => {
      const cat = h.category;
      if (stage.id === "plan") return cat === "plan" || cat === "prompt";
      if (stage.id === "execution") return cat === "execution";
      if (stage.id === "verification") return cat === "verification";
      if (stage.id === "repair") return cat === "auto_fix";
      if (stage.id === "complete") return cat === "execution" || cat === "verification";
      return false;
    });
    for (const h of related) {
      lines.push(
        `  - [${iso(h.at)}] ${h.category}: ${h.title}${h.detail ? ` — ${h.detail}` : ""}`,
      );
    }
    const feedRelated = s.feed.filter((f) => {
      if (stage.id === "plan") return f.kind === "planning" || f.kind === "thinking";
      if (stage.id === "execution") return f.kind === "executing";
      if (stage.id === "verification") return f.kind === "verifying";
      if (stage.id === "repair") return f.kind === "repairing";
      if (stage.id === "complete") return f.kind === "completed";
      return false;
    });
    for (const f of feedRelated) {
      lines.push(
        `  - [${iso(f.at)}] feed/${f.kind}: ${f.title}${f.active ? " (active)" : ""}`,
      );
    }
  }

  return redactSecrets(lines.join("\n"));
}

export interface AgentFullReportPayload {
  readonly exportedAt: string;
  readonly product: string;
  readonly projectPath: string | null;
  readonly goal: string | null;
  readonly prompt: string | null;
  readonly planSummary: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly durationMs: number;
  readonly workspaceStatus: string;
  readonly agentLoopStatus: string | null;
  readonly session: AgentWorkspaceSession;
  readonly agentLoop: AgentLoopSession | null;
  readonly summary: ReturnType<typeof buildAgentReport>;
  readonly failureReportRootCause: string | null;
}

export function buildAgentFullReportPayload(
  ctx: AgentExportContext,
): AgentFullReportPayload {
  const summary = buildAgentReport(ctx.agentSession);
  return {
    exportedAt: new Date().toISOString(),
    product: "BryantLabs Studio",
    projectPath: ctx.projectPath,
    goal: ctx.agentSession.context.goal ?? ctx.agentLoopSession?.goal ?? null,
    prompt: ctx.lastPlanPrompt,
    planSummary: ctx.planSummary,
    provider: ctx.provider,
    model: ctx.model,
    durationMs: summary.durationMs,
    workspaceStatus: ctx.agentSession.status,
    agentLoopStatus: ctx.agentLoopSession?.status ?? null,
    session: ctx.agentSession,
    agentLoop: ctx.agentLoopSession,
    summary,
    failureReportRootCause: ctx.failureReport
      ? formatFailureReportRootCauseCopy(ctx.failureReport)
      : null,
  };
}

export function formatAgentFullReportMarkdown(ctx: AgentExportContext): string {
  const payload = buildAgentFullReportPayload(ctx);
  const s = ctx.agentSession;
  const c = ctx.agentLoopSession;

  const lines = [
    `# ${BRYANTLABS_AGENT_DISPLAY_NAME} — full report`,
    "",
    `Exported: ${payload.exportedAt}`,
    `Product: ${payload.product}`,
    "",
    "## Overview",
    `**Goal:** ${payload.goal ?? "—"}`,
    `**Prompt:** ${payload.prompt ?? "—"}`,
    `**Plan summary:** ${payload.planSummary ?? "—"}`,
    `**Project path:** ${payload.projectPath ?? "—"}`,
    `**Provider / model:** ${providerModel(ctx)}`,
    `**Duration:** ${Math.round(payload.durationMs / 1000)}s`,
    `**Workspace status:** ${payload.workspaceStatus}`,
    `**${BRYANTLABS_AGENT_DISPLAY_NAME} status:** ${payload.agentLoopStatus ?? "—"}`,
    "",
    formatAgentLiveRunCopy(ctx, "markdown"),
    "",
    "## Reasoning",
    ...formatReasoningEntries(s.reasoning, c),
    "",
    "## Timeline",
    formatAgentTimelineCopy(ctx).split("\n").slice(2).join("\n"),
    "",
    "## History",
    ...(s.history.length
      ? [...s.history]
          .sort((a, b) => a.at - b.at)
          .map(
            (h) =>
              `- [${iso(h.at)}] ${h.category}: ${h.title}${h.detail ? ` — ${h.detail}` : ""}`,
          )
      : ["—"]),
    "",
    "## File decisions",
    ...(s.decisions.length
      ? s.decisions.map((d) => `- \`${d.path}\`: ${d.reason}`)
      : ["—"]),
    "",
    "## Files read (agent)",
    ...(c?.flags.readPaths.length
      ? c.flags.readPaths.map((p) => `- \`${p}\``)
      : ["—"]),
    "",
    "## Files created",
    ...(s.artifacts.filesCreated.length
      ? s.artifacts.filesCreated.map((f) => `- \`${f}\``)
      : ["—"]),
    "",
    "## Files modified",
    ...(s.artifacts.filesModified.length
      ? s.artifacts.filesModified.map((f) => `- \`${f}\``)
      : ["—"]),
    "",
    "## Verification results",
    ...(s.artifacts.verificationResults.length
      ? s.artifacts.verificationResults.map((v) => `- ${v}`)
      : ["—"]),
    "",
    "## Errors",
    formatAgentErrorsCopy(ctx).split("\n").slice(2).join("\n"),
  ];

  return redactSecrets(lines.join("\n"));
}

export function formatAgentFullReportJson(ctx: AgentExportContext): string {
  const payload = buildAgentFullReportPayload(ctx);
  const doc = redactSecretsDeep({
    ...payload,
    liveRun: formatAgentLiveRunCopy(ctx, "plain"),
    reasoningMarkdown: formatAgentReasoningCopy(ctx),
    errorsMarkdown: formatAgentErrorsCopy(ctx),
    timelineMarkdown: formatAgentTimelineCopy(ctx),
  });
  return JSON.stringify(doc, null, 2);
}

export type AgentCopySection =
  | "live_run"
  | "reasoning"
  | "errors"
  | "timeline"
  | "full_report";

export function formatAgentCopySection(
  ctx: AgentExportContext,
  section: AgentCopySection,
  format: "markdown" | "json" = "markdown",
): string {
  switch (section) {
    case "live_run":
      return formatAgentLiveRunCopy(ctx, format === "json" ? "plain" : "markdown");
    case "reasoning":
      return formatAgentReasoningCopy(ctx);
    case "errors":
      return formatAgentErrorsCopy(ctx);
    case "timeline":
      return formatAgentTimelineCopy(ctx);
    case "full_report":
      return format === "json"
        ? formatAgentFullReportJson(ctx)
        : formatAgentFullReportMarkdown(ctx);
    default:
      return "";
  }
}

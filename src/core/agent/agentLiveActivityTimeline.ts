import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import { AGENT_PIPELINE_UNDERSTANDING } from "@/core/agent/agentUxLabels";
import { formatFollowUpLogMessage } from "@/core/build/followUpUi";
import type { GreenfieldRunLogEntry, RunLogStage } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import {
  resolveRunVerification,
  type ResolvedVerificationStatus,
} from "@/core/diagnostics/verificationResolution";

export type AgentLiveActivityBadge = "running" | "success" | "warning" | "failed";

export type AgentLiveActivityGroup =
  | "understanding_project"
  | "reading_files"
  | "planning_changes"
  | "selecting_files"
  | "calling_provider"
  | "generating_patches"
  | "applying_patches"
  | "running_typescript"
  | "running_build"
  | "starting_preview"
  | "ui_audit"
  | "repairing_errors"
  | "completed"
  | "failed";

export const AGENT_LIVE_ACTIVITY_LABELS: Record<AgentLiveActivityGroup, string> = {
  understanding_project: "Understanding project",
  reading_files: "Reading files",
  planning_changes: "Planning changes",
  selecting_files: "Selecting files",
  calling_provider: "Calling provider",
  generating_patches: "Generating patches",
  applying_patches: "Applying patches",
  running_typescript: "Running TypeScript",
  running_build: "Running build",
  starting_preview: "Starting preview",
  ui_audit: "UI audit",
  repairing_errors: "Repairing errors",
  completed: "Completed",
  failed: "Failed",
};

export interface AgentLiveActivityItem {
  readonly id: AgentLiveActivityGroup;
  readonly label: string;
  readonly badge: AgentLiveActivityBadge;
  readonly summary: string;
  readonly details: readonly string[];
  readonly startedAt: number;
  readonly updatedAt: number;
}

export type AgentActivityPhaseId =
  | "understanding"
  | "planning"
  | "coding"
  | "verification";

export interface AgentActivityPhaseGroup {
  readonly id: AgentActivityPhaseId;
  readonly label: string;
  readonly badge: AgentLiveActivityBadge;
  readonly items: readonly AgentLiveActivityItem[];
  readonly startedAt: number;
  readonly updatedAt: number;
}

export const AGENT_ACTIVITY_PHASES: readonly {
  readonly id: AgentActivityPhaseId;
  readonly label: string;
  readonly groups: readonly AgentLiveActivityGroup[];
}[] = [
  {
    id: "understanding",
    label: "Understanding project",
    groups: ["understanding_project", "reading_files", "selecting_files"],
  },
  {
    id: "planning",
    label: "Planning",
    groups: ["planning_changes"],
  },
  {
    id: "coding",
    label: "Coding",
    groups: ["calling_provider", "generating_patches", "applying_patches", "repairing_errors"],
  },
  {
    id: "verification",
    label: "Verification",
    groups: ["running_typescript", "running_build", "starting_preview", "ui_audit"],
  },
];

export const AGENT_SUBITEM_COMPLETED_LABELS: Partial<
  Record<AgentLiveActivityGroup, string>
> = {
  understanding_project: "Project understood",
  reading_files: "Repository scanned",
  selecting_files: "Files selected",
  planning_changes: "Requirements analyzed",
  calling_provider: "Provider responded",
  generating_patches: "Files generated",
  applying_patches: "Patches applied",
  running_typescript: "TypeScript",
  running_build: "Build",
  starting_preview: "Preview",
  ui_audit: "UI audit",
  repairing_errors: "Automatic repair",
};

export interface AgentRunFinalSummary {
  readonly filesChanged: readonly string[];
  readonly commandsRun: readonly string[];
  readonly typescript: ResolvedVerificationStatus;
  readonly build: ResolvedVerificationStatus;
  readonly preview: ResolvedVerificationStatus;
  readonly uiAudit: ResolvedVerificationStatus;
  readonly durationMs: number;
  readonly durationLabel: string;
  readonly errors: readonly string[];
  readonly noChangeExplanation: string | null;
  readonly outcome: "success" | "failed" | "cancelled" | "neutral";
  readonly providerOutput: readonly string[];
}

export interface BuildAgentLiveActivityTimelineInput {
  readonly entries: readonly GreenfieldRunLogEntry[];
  readonly card: AgentRunCardViewModel | null;
  readonly run: GreenfieldRunSnapshot | null;
  readonly nowMs?: number;
}

const PROVIDER_WAIT_MS = 30_000;

const INTERNAL_MESSAGE_RE =
  /@@FILE|\[apply_plan\]|proposing patches|provider_call\]|\[provider_retry\]/i;

function entryTimestamp(entry: GreenfieldRunLogEntry): number {
  return Date.parse(entry.timestamp) || Date.now();
}

function mapLogStatus(status: GreenfieldRunLogEntry["status"]): AgentLiveActivityBadge {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (status === "pending") return "warning";
  return "running";
}

function friendlySummary(entry: GreenfieldRunLogEntry): string | null {
  if (
    entry.stage === "auto_fix" ||
    entry.stage === "greenfield_repair" ||
    entry.stage === "pipeline_repair"
  ) {
    return entry.status === "success"
      ? "Automatic repair finished"
      : "Build failed, attempting automatic repair…";
  }

  const formatted = formatFollowUpLogMessage(entry);
  if (formatted && !INTERNAL_MESSAGE_RE.test(formatted)) {
    return formatted.split("\n")[0]?.trim() ?? formatted;
  }

  if (entry.stage === "pipeline" && /understanding|auditing/i.test(entry.message)) {
    return entry.status === "success"
      ? `${AGENT_PIPELINE_UNDERSTANDING} — ready`
      : AGENT_PIPELINE_UNDERSTANDING;
  }
  if (entry.stage === "ai_plan" || entry.stage === "pipeline_planner") {
    return entry.status === "success" ? "Plan ready" : "Planning changes…";
  }
  if (entry.stage === "apply_plan" || entry.stage === "pipeline_coder") {
    if (/propos|generat/i.test(entry.message)) {
      return entry.status === "success" ? "Patches generated" : "Generating patches…";
    }
    if (/apply|writ/i.test(entry.message)) {
      return entry.status === "success" ? "Patches applied" : "Applying patches…";
    }
    return entry.status === "success" ? "Edit step complete" : "Updating project files…";
  }
  if (entry.stage === "provider_call" || entry.stage === "ai_call" || entry.stage === "provider") {
    if (/timeout/i.test(`${entry.message} ${entry.details ?? ""}`)) {
      return "Provider request timed out";
    }
    return entry.status === "success" ? "Provider responded" : "Waiting on provider…";
  }
  if (entry.stage === "typescript") {
    return entry.status === "success" ? "TypeScript passed" : "Running TypeScript…";
  }
  if (entry.stage === "build") {
    return entry.status === "success" ? "Build passed" : "Running build…";
  }
  if (entry.stage === "preview") {
    return entry.status === "success" ? "Preview ready" : "Starting preview…";
  }
  if (entry.stage === "ui_audit") {
    return entry.status === "success" ? "UI audit passed" : "Running UI audit…";
  }
  if (entry.stage === "generation") {
    return entry.status === "success" ? "App generated" : "Generating application…";
  }
  if (entry.stage === "write") {
    return entry.status === "success" ? "Files saved" : "Writing files…";
  }
  if (entry.stage === "parser") {
    return entry.status === "success" ? "Generated files parsed" : "Parsing generated files…";
  }
  if (entry.stage === "prompt" && /Execution mode/i.test(entry.message)) {
    return "Run mode confirmed";
  }

  const trimmed = entry.message.trim();
  if (!trimmed || INTERNAL_MESSAGE_RE.test(trimmed)) return null;
  return trimmed;
}

function detailLine(entry: GreenfieldRunLogEntry): string | null {
  const parts: string[] = [];
  const summary = friendlySummary(entry);
  if (summary) parts.push(summary);
  if (entry.details?.trim()) {
    const detail = entry.details.trim();
    if (!parts.includes(detail)) parts.push(detail);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function groupForRunLogEntry(entry: GreenfieldRunLogEntry): AgentLiveActivityGroup | null {
  if (entry.stage === "pipeline") {
    if (/understanding|auditing/i.test(entry.message)) return "understanding_project";
    return null;
  }
  if (entry.stage === "prompt" && /Execution mode/i.test(entry.message)) {
    return "understanding_project";
  }

  if (entry.stage === "apply_plan" || entry.stage === "pipeline_coder") {
    if (/apply|writ/i.test(entry.message)) return "applying_patches";
    return "generating_patches";
  }

  const stageGroups: Partial<Record<RunLogStage, AgentLiveActivityGroup>> = {
    ai_plan: "planning_changes",
    pipeline_planner: "planning_changes",
    provider_call: "calling_provider",
    ai_call: "calling_provider",
    provider: "calling_provider",
    provider_response: "calling_provider",
    write: "applying_patches",
    approve: "applying_patches",
    review: "generating_patches",
    typescript: "running_typescript",
    build: "running_build",
    preview: "starting_preview",
    ui_audit: "ui_audit",
    auto_fix: "repairing_errors",
    greenfield_repair: "repairing_errors",
    pipeline_repair: "repairing_errors",
    generation: "generating_patches",
    parser: "generating_patches",
    npm_install: "running_build",
    runtime_smoke: "running_build",
    ui_repair: "repairing_errors",
  };

  const mapped = stageGroups[entry.stage];
  if (mapped) return mapped;

  if (/select(ing)? files|file selection|targets collected/i.test(entry.message)) {
    return "selecting_files";
  }
  if (/read(ing)? file|scanning repository|indexed/i.test(entry.message)) {
    return "reading_files";
  }

  return null;
}

function upsertItem(
  items: AgentLiveActivityItem[],
  indexByGroup: Map<AgentLiveActivityGroup, number>,
  group: AgentLiveActivityGroup,
  entry: GreenfieldRunLogEntry,
): void {
  const ts = entryTimestamp(entry);
  const badge = mapLogStatus(entry.status);
  const summary = friendlySummary(entry) ?? AGENT_LIVE_ACTIVITY_LABELS[group];
  const detail = detailLine(entry);
  const existingIdx = indexByGroup.get(group);

  if (existingIdx != null) {
    const existing = items[existingIdx]!;
    const details = detail
      ? existing.details.includes(detail)
        ? existing.details
        : [...existing.details, detail].slice(-6)
      : existing.details;
    items[existingIdx] = {
      ...existing,
      badge: badge === "running" ? (existing.badge === "failed" ? "failed" : "running") : badge,
      summary,
      details,
      updatedAt: ts,
    };
    return;
  }

  indexByGroup.set(group, items.length);
  items.push({
    id: group,
    label: AGENT_LIVE_ACTIVITY_LABELS[group],
    badge,
    summary,
    details: detail ? [detail] : [],
    startedAt: ts,
    updatedAt: ts,
  });
}

function applyProviderWaitNotice(
  items: AgentLiveActivityItem[],
  entries: readonly GreenfieldRunLogEntry[],
  nowMs: number,
): void {
  const providerIdx = items.findIndex((item) => item.id === "calling_provider");
  if (providerIdx < 0) return;
  const item = items[providerIdx]!;
  if (item.badge !== "running") return;

  const lastProviderEntry = [...entries]
    .reverse()
    .find((entry) => groupForRunLogEntry(entry) === "calling_provider");
  if (!lastProviderEntry || lastProviderEntry.status !== "running") return;

  const elapsed = nowMs - entryTimestamp(lastProviderEntry);
  if (elapsed >= PROVIDER_WAIT_MS) {
    items[providerIdx] = {
      ...item,
      summary: "Still working — waiting on provider response…",
    };
  }
}

function appendTerminalItems(
  items: AgentLiveActivityItem[],
  indexByGroup: Map<AgentLiveActivityGroup, number>,
  card: AgentRunCardViewModel | null,
  run: GreenfieldRunSnapshot | null,
  nowMs: number,
): void {
  if (!card) return;

  if (card.overallStatus === "complete") {
    upsertItem(
      items,
      indexByGroup,
      "completed",
      {
        id: "terminal-complete",
        timestamp: new Date(nowMs).toISOString(),
        stage: "pipeline_complete",
        status: "success",
        message: card.successSummary?.summaryLine ?? "Run completed successfully",
      },
    );
    return;
  }

  if (card.overallStatus === "failed") {
    upsertItem(
      items,
      indexByGroup,
      "failed",
      {
        id: "terminal-failed",
        timestamp: new Date(nowMs).toISOString(),
        stage: "error",
        status: "failed",
        message: card.failureDetails?.headline ?? card.summary ?? "Run failed",
        ...(card.failureDetails?.rawErrorMessage
          ? { details: card.failureDetails.rawErrorMessage }
          : {}),
      },
    );
    return;
  }

  if (run?.runResult === "cancelled") {
    upsertItem(
      items,
      indexByGroup,
      "failed",
      {
        id: "terminal-cancelled",
        timestamp: new Date(nowMs).toISOString(),
        stage: "error",
        status: "failed",
        message: "Run cancelled",
      },
    );
  }
}

export function buildAgentLiveActivityTimeline(
  input: BuildAgentLiveActivityTimelineInput,
): AgentLiveActivityItem[] {
  const nowMs = input.nowMs ?? Date.now();
  const items: AgentLiveActivityItem[] = [];
  const indexByGroup = new Map<AgentLiveActivityGroup, number>();

  for (const entry of input.entries) {
    const group = groupForRunLogEntry(entry);
    if (!group) continue;
    upsertItem(items, indexByGroup, group, entry);
  }

  applyProviderWaitNotice(items, input.entries, nowMs);
  appendTerminalItems(items, indexByGroup, input.card, input.run, nowMs);

  return items;
}

function resolvePhaseBadge(items: readonly AgentLiveActivityItem[]): AgentLiveActivityBadge {
  if (items.some((item) => item.badge === "failed")) return "failed";
  if (items.some((item) => item.badge === "running")) return "running";
  if (items.some((item) => item.badge === "warning")) return "warning";
  if (items.length > 0 && items.every((item) => item.badge === "success")) return "success";
  return "warning";
}

function subItemDisplayLabel(item: AgentLiveActivityItem): string {
  if (item.badge === "success") {
    return AGENT_SUBITEM_COMPLETED_LABELS[item.id] ?? item.label;
  }
  if (item.id === "planning_changes" && item.badge === "running") {
    return "AI planning";
  }
  if (item.id === "calling_provider" && item.badge === "running") {
    return "Provider responding";
  }
  return item.summary || item.label;
}

export interface AgentExecutionStep {
  readonly id: string;
  readonly label: string;
  readonly badge: AgentLiveActivityBadge;
}

function fileBaseName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? path;
}

function pickExecutionBadge(
  ...badges: readonly (AgentLiveActivityBadge | undefined)[]
): AgentLiveActivityBadge {
  if (badges.some((badge) => badge === "failed")) return "failed";
  if (badges.some((badge) => badge === "running")) return "running";
  if (badges.some((badge) => badge === "warning")) return "warning";
  if (badges.length > 0 && badges.every((badge) => badge === "success")) return "success";
  return "warning";
}

function upsertExecutionStep(steps: AgentExecutionStep[], step: AgentExecutionStep): void {
  const index = steps.findIndex((existing) => existing.id === step.id);
  if (index === -1) {
    steps.push(step);
    return;
  }
  steps[index] = {
    ...steps[index]!,
    badge: pickExecutionBadge(steps[index]!.badge, step.badge),
  };
}

export function buildAgentExecutionSteps(
  input: BuildAgentLiveActivityTimelineInput,
): AgentExecutionStep[] {
  const flat = buildAgentLiveActivityTimeline(input);
  const byId = new Map(flat.map((item) => [item.id, item]));
  const card = input.card;
  const steps: AgentExecutionStep[] = [];

  const understandingItems = (
    ["understanding_project", "reading_files", "selecting_files"] as const
  )
    .map((id) => byId.get(id))
    .filter((item): item is AgentLiveActivityItem => item != null);
  if (understandingItems.length > 0) {
    upsertExecutionStep(steps, {
      id: "understanding",
      label: "Understanding project",
      badge: resolvePhaseBadge(understandingItems),
    });
  }

  const planning = byId.get("planning_changes");
  if (planning) {
    upsertExecutionStep(steps, {
      id: "planning",
      label: "Planning changes",
      badge: planning.badge,
    });
  }

  const calling = byId.get("calling_provider");
  const generating = byId.get("generating_patches");
  if (calling || generating) {
    upsertExecutionStep(steps, {
      id: "generating_code",
      label: "Generating code",
      badge: pickExecutionBadge(calling?.badge, generating?.badge),
    });
  }

  const applying = byId.get("applying_patches");
  if (card?.fileActivity.length) {
    for (const file of card.fileActivity) {
      const base = fileBaseName(file.path);
      steps.push({
        id: `file:${file.path}`,
        label: file.status === "written" ? `Updated ${base}` : `Editing ${base}`,
        badge:
          file.status === "written"
            ? "success"
            : pickExecutionBadge(applying?.badge, "running"),
      });
    }
  } else if (applying) {
    upsertExecutionStep(steps, {
      id: "applying_patches",
      label: "Applying patches",
      badge: applying.badge,
    });
  }

  const repairing = byId.get("repairing_errors");
  if (repairing) {
    upsertExecutionStep(steps, {
      id: "repairing_errors",
      label: "Repairing errors",
      badge: repairing.badge,
    });
  }

  for (const { id, label } of [
    { id: "running_typescript" as const, label: "Running TypeScript" },
    { id: "running_build" as const, label: "Running Build" },
    { id: "starting_preview" as const, label: "Starting preview" },
    { id: "ui_audit" as const, label: "UI audit" },
  ]) {
    const item = byId.get(id);
    if (!item) continue;
    upsertExecutionStep(steps, { id, label, badge: item.badge });
  }

  const completed = byId.get("completed");
  const failed = byId.get("failed");
  if (completed) {
    upsertExecutionStep(steps, { id: "completed", label: "Completed", badge: "success" });
  } else if (failed) {
    upsertExecutionStep(steps, { id: "failed", label: "Failed", badge: "failed" });
  }

  return steps;
}

export function buildAgentActivityPhaseGroups(
  input: BuildAgentLiveActivityTimelineInput,
): AgentActivityPhaseGroup[] {
  const flat = buildAgentLiveActivityTimeline(input);
  const byId = new Map(flat.map((item) => [item.id, item]));
  const phases: AgentActivityPhaseGroup[] = [];

  for (const phase of AGENT_ACTIVITY_PHASES) {
    const items = phase.groups
      .map((groupId) => byId.get(groupId))
      .filter((item): item is AgentLiveActivityItem => item != null)
      .map((item) => ({
        ...item,
        label: subItemDisplayLabel(item),
      }));

    if (items.length === 0) continue;

    phases.push({
      id: phase.id,
      label: phase.label,
      badge: resolvePhaseBadge(items),
      items,
      startedAt: items[0]!.startedAt,
      updatedAt: items.at(-1)!.updatedAt,
    });
  }

  return phases;
}

export function deriveProviderThinkingMessage(input: {
  readonly card: AgentRunCardViewModel | null;
  readonly entries: readonly GreenfieldRunLogEntry[];
  readonly nowMs?: number;
}): string | null {
  const nowMs = input.nowMs ?? Date.now();
  const card = input.card;
  if (!card || card.overallStatus !== "running") return null;

  const providerEntry = [...input.entries]
    .reverse()
    .find(
      (entry) =>
        groupForRunLogEntry(entry) === "calling_provider" && entry.status === "running",
    );

  const generatingEntry = [...input.entries]
    .reverse()
    .find(
      (entry) =>
        (groupForRunLogEntry(entry) === "generating_patches" ||
          groupForRunLogEntry(entry) === "calling_provider") &&
        entry.status === "running",
    );

  if (!providerEntry && !generatingEntry) return null;

  const anchor = providerEntry ?? generatingEntry!;
  const elapsed = nowMs - entryTimestamp(anchor);
  const providerName = card.provider?.trim() || card.model?.trim() || "AI";

  if (elapsed >= PROVIDER_WAIT_MS) {
    return "Still working — waiting on provider response…";
  }
  if (elapsed >= 20_000) {
    return "Generating implementation…";
  }
  if (elapsed >= 10_000) {
    return "Reviewing existing code…";
  }
  return `${providerName} is thinking…`;
}

export function collectProviderOutput(
  entries: readonly GreenfieldRunLogEntry[],
): readonly string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    if (
      entry.stage !== "provider_call" &&
      entry.stage !== "provider_response" &&
      entry.stage !== "provider" &&
      entry.stage !== "ai_call"
    ) {
      continue;
    }
    if (entry.message.trim()) lines.push(entry.message.trim());
    if (entry.details?.trim()) lines.push(entry.details.trim());
  }
  return [...new Set(lines)].slice(0, 20);
}

export function formatAgentRunSummaryText(summary: AgentRunFinalSummary): string {
  const lines: string[] = [];
  const headline =
    summary.outcome === "success"
      ? `Completed in ${summary.durationLabel}`
      : summary.outcome === "failed"
        ? `Failed after ${summary.durationLabel}`
        : `Run finished in ${summary.durationLabel}`;
  lines.push(headline, "");

  if (summary.noChangeExplanation) {
    lines.push(summary.noChangeExplanation, "");
  }

  lines.push("Files modified");
  if (summary.filesChanged.length === 0) {
    lines.push("• None");
  } else {
    for (const file of summary.filesChanged) {
      lines.push(`• ${file}`);
    }
  }
  lines.push("", "Verification");
  lines.push(formatVerificationLine("TypeScript", summary.typescript));
  lines.push(formatVerificationLine("Build", summary.build));
  lines.push(formatVerificationLine("Preview", summary.preview));
  lines.push(formatVerificationLine("UI audit", summary.uiAudit));

  if (summary.errors.length > 0) {
    lines.push("", "Errors");
    for (const error of summary.errors) {
      lines.push(`• ${error}`);
    }
  }

  return lines.join("\n");
}

function formatVerificationLine(
  label: string,
  status: ResolvedVerificationStatus,
): string {
  const icon =
    status === "passed" ? "✓" : status === "failed" ? "✗" : status === "skipped" ? "–" : "…";
  const suffix =
    status === "passed"
      ? ""
      : status === "failed"
        ? " (failed)"
        : status === "skipped"
          ? " (skipped)"
          : status === "advisory"
            ? " (advisory)"
            : " (pending)";
  return `${icon} ${label}${suffix}`;
}

function collectCommands(entries: readonly GreenfieldRunLogEntry[]): string[] {
  const commands = new Set<string>();
  for (const entry of entries) {
    if (entry.stage === "npm_install") commands.add("npm install");
    if (entry.stage === "typescript") commands.add("TypeScript check");
    if (entry.stage === "build") commands.add("Build");
    if (entry.stage === "preview") commands.add("Preview server");
    if (entry.details?.includes("npm ")) {
      const match = entry.details.match(/npm [^\n]+/);
      if (match?.[0]) commands.add(match[0]);
    }
  }
  return [...commands];
}

function deriveNoChangeExplanation(input: {
  readonly entries: readonly GreenfieldRunLogEntry[];
  readonly card: AgentRunCardViewModel | null;
  readonly run: GreenfieldRunSnapshot | null;
}): string | null {
  const corpus = [
    ...input.entries.map((entry) => `${entry.message}\n${entry.details ?? ""}`),
    input.card?.failureDetails?.rawErrorMessage ?? "",
    input.card?.summary ?? "",
    input.run?.finalMessage ?? "",
  ]
    .join("\n")
    .toLowerCase();

  if (/feature already|already present|already implemented/i.test(corpus)) {
    return "Nothing changed because this feature is already present in the project.";
  }
  if (/zero valid patch|no valid patch|no proposals generated/i.test(corpus)) {
    return "No files changed because the provider did not produce valid patches.";
  }
  if (/provider fallback declined|cancelled|run cancelled|user cancelled/i.test(corpus)) {
    return "The run stopped before writing files.";
  }
  if (/provider.*fail|timeout|rate limit|not connected/i.test(corpus)) {
    return "No files changed because the provider call failed.";
  }
  if (input.card?.filesModified.length === 0 && input.card?.overallStatus === "complete") {
    return "The run completed without modifying any files.";
  }
  return null;
}

export function buildAgentRunFinalSummary(input: {
  readonly entries: readonly GreenfieldRunLogEntry[];
  readonly card: AgentRunCardViewModel;
  readonly run: GreenfieldRunSnapshot | null;
}): AgentRunFinalSummary {
  const verification = resolveRunVerification({
    run:
      input.run ??
      ({
        verification: null,
        entries: input.entries,
        actionType: "apply_plan",
      } as GreenfieldRunSnapshot),
    cardVerification: input.card.verification,
  });

  const filesChanged =
    input.card.filesModified.length > 0
      ? input.card.filesModified
      : input.card.patchImpact.files.map((file) => file.path);

  const errors: string[] = [];
  if (input.card.failureDetails?.headline) errors.push(input.card.failureDetails.headline);
  if (input.card.failureDetails?.rawErrorMessage) {
    errors.push(input.card.failureDetails.rawErrorMessage);
  }
  const runSucceeded =
    input.run?.runResult === "success" || input.card.overallStatus === "complete";
  for (const entry of input.entries) {
    if (entry.status !== "failed" || !entry.message.trim()) continue;
    if (runSucceeded && (entry.stage === "ui_audit" || entry.stage === "ui_repair")) {
      continue;
    }
    errors.push(entry.message.trim());
  }

  const outcome =
    input.card.overallStatus === "complete"
      ? "success"
      : input.card.overallStatus === "cancelled"
        ? "cancelled"
        : input.card.overallStatus === "failed"
          ? "failed"
          : "neutral";

  return {
    filesChanged,
    commandsRun: collectCommands(input.entries),
    typescript: verification.typescript,
    build: verification.build,
    preview: verification.preview,
    uiAudit: verification.uiAudit,
    durationMs: input.card.durationMs,
    durationLabel: input.card.durationLabel,
    errors: [...new Set(errors)].slice(0, 5),
    noChangeExplanation:
      filesChanged.length === 0 ? deriveNoChangeExplanation(input) : null,
    outcome,
    providerOutput: collectProviderOutput(input.entries),
  };
}

import type {
  AgentRunCardViewModel,
  AgentRunVerification,
} from "@/core/agent/agentRunCard";
import type { RunTimelineSnapshot, RunTimelineStageId } from "@/core/agent/runTimeline";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { recommendationsForUiAuditIssues } from "@/core/agent/uiAuditAdvisoryUx";

export type ExecutionDashboardFileStatus = "editing" | "saved" | "verified";

export type ExecutionDashboardVerificationStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped"
  | "advisory";

export interface ExecutionDashboardThought {
  readonly kind: "discovery" | "decision" | "reasoning" | "event";
  readonly text: string;
}

export interface ExecutionDashboardFile {
  readonly path: string;
  readonly status: ExecutionDashboardFileStatus;
}

export interface ExecutionDashboardVerificationRow {
  readonly label: string;
  readonly status: ExecutionDashboardVerificationStatus;
}

export interface ExecutionDashboardCompletionSummary {
  readonly isVisible: boolean;
  readonly filesModified: readonly string[];
  readonly buildResult: string | null;
  readonly verificationResult: string | null;
  readonly durationLabel: string;
  readonly summaryLine: string | null;
}

export interface ExecutionDashboardUiAuditFailure {
  readonly title: string;
  readonly whatFailed: string;
  readonly reason: string;
  readonly suggestedFix: string;
  readonly rawDetails: string;
}

export interface ExecutionDashboardUiAuditAdvisory {
  readonly layoutType: string;
  readonly score: number;
  readonly issues: readonly string[];
  readonly details: string;
  readonly recommendations: readonly string[];
}

export interface ExecutionDashboardViewModel {
  readonly isVisible: boolean;
  readonly promptTitle: string;
  readonly providerModel: string | null;
  readonly elapsedLabel: string;
  readonly progressPercent: number;
  readonly progressLabel: string;
  readonly overallStatus: AgentRunCardViewModel["overallStatus"];
  readonly thoughts: readonly ExecutionDashboardThought[];
  readonly currentTask: string | null;
  readonly currentStage: string | null;
  readonly currentStepLabel: string | null;
  readonly currentFile: string | null;
  readonly files: readonly ExecutionDashboardFile[];
  readonly verification: readonly ExecutionDashboardVerificationRow[];
  readonly uiAuditFailure: ExecutionDashboardUiAuditFailure | null;
  readonly uiAuditAdvisory: ExecutionDashboardUiAuditAdvisory | null;
  readonly completion: ExecutionDashboardCompletionSummary;
  readonly streamRevision: string;
}

const TIMELINE_STAGE_LABELS: Record<RunTimelineStageId, string> = {
  run_id: "Run started",
  route: "Routing request",
  audit_start: "Auditing project",
  audit_complete: "Audit complete",
  explore_start: "Exploring repository",
  explore_complete: "Exploration complete",
  plan_start: "Planning",
  plan_complete: "Plan ready",
  coder_start: "Generating patches",
  coder_complete: "Coder complete",
  patch_generated: "Patch generated",
  waiting_for_review: "Waiting for review",
  apply_start: "Applying changes",
  apply_complete: "Apply complete",
  typescript_start: "TypeScript check",
  typescript_complete: "TypeScript complete",
  build_start: "Build",
  build_complete: "Build complete",
  preview_start: "Preview",
  preview_complete: "Preview complete",
  run_complete: "Run complete",
};

function truncatePrompt(prompt: string, max = 72): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatTimelineStage(stage: RunTimelineStageId | null): string | null {
  if (!stage) return null;
  return TIMELINE_STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

function resolveVerificationStatus(
  key: keyof AgentRunVerification,
  value: AgentRunVerification[typeof key],
  steps: readonly AgentRunCardViewModel["steps"][number][],
  runActive: boolean,
): ExecutionDashboardVerificationStatus {
  const stepId =
    key === "typescript"
      ? "typescript"
      : key === "build"
        ? "building"
        : key === "uiAudit"
          ? "ui_audit"
          : "preview";

  const step = steps.find((s) => s.id === stepId);

  if (value === "passed" || value === "ready") return "passed";
  if (value === "failed") return "failed";
  if (value === "advisory") return "advisory";
  if (value === "skipped") return "skipped";
  if (step?.status === "failed") return "failed";
  if (step?.status === "success" || step?.status === "skipped") {
    return value === "pending" && key === "uiAudit" ? "skipped" : "passed";
  }
  if (step?.status === "running" || step?.status === "retrying") return "running";
  if (runActive && step?.status === "pending") {
    const priorSteps = steps.slice(0, steps.indexOf(step));
    if (priorSteps.every((s) => s.status === "success" || s.status === "skipped")) {
      return "pending";
    }
  }
  return "pending";
}

function verificationIcon(status: ExecutionDashboardVerificationStatus): string {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    case "running":
    case "pending":
      return "⏳";
    case "skipped":
      return "—";
    case "advisory":
      return "⚠️";
    default:
      return "⏳";
  }
}

export function formatExecutionVerificationLabel(
  label: string,
  status: ExecutionDashboardVerificationStatus,
  opts?: { readonly score?: number; readonly layoutType?: string },
): string {
  const icon = verificationIcon(status);
  const suffix =
    status === "passed"
      ? "Passed"
      : status === "failed"
        ? "Failed"
        : status === "running"
          ? "Running"
          : status === "skipped"
            ? "Skipped"
            : status === "advisory"
              ? opts?.score != null
                ? `Advisory (score ${opts.score})`
                : "Advisory"
              : "Pending";
  return `${icon} ${label} — ${suffix}`;
}

function isCodeFile(path: string): boolean {
  return /\.(tsx?|jsx?)$/i.test(path);
}

function deriveFileStatus(
  path: string,
  card: AgentRunCardViewModel,
): ExecutionDashboardFileStatus {
  const activity = card.fileActivity.find((f) => f.path === path);
  if (activity?.status === "editing") return "editing";

  const saved =
    activity?.status === "written" ||
    card.filesWritten.includes(path) ||
    card.filesModified.includes(path);

  if (!saved) return "editing";

  const tsStep = card.steps.find((s) => s.id === "typescript");
  const buildStep = card.steps.find((s) => s.id === "building");
  const tsOk =
    card.verification.typescript === "passed" ||
    card.verification.typescript === "skipped" ||
    tsStep?.status === "success" ||
    tsStep?.status === "skipped";
  const buildOk =
    card.verification.build === "passed" ||
    card.verification.build === "skipped" ||
    buildStep?.status === "success" ||
    buildStep?.status === "skipped";

  if (card.overallStatus === "complete" && tsOk && buildOk) return "verified";
  if (isCodeFile(path) && tsOk && buildOk) return "verified";
  if (saved) return "saved";
  return "editing";
}

function deriveThoughts(card: AgentRunCardViewModel): ExecutionDashboardThought[] {
  if (card.thoughtStream.length > 0) {
    return card.thoughtStream.map((event) => ({
      kind: "event" as const,
      text: event.text,
    }));
  }

  const thoughts: ExecutionDashboardThought[] = [];

  for (const item of card.reasoning.detected) {
    thoughts.push({ kind: "discovery", text: item.text });
  }
  for (const line of card.reasoning.plannerReasoning) {
    thoughts.push({ kind: "reasoning", text: line });
  }
  for (const step of card.reasoning.planSteps) {
    thoughts.push({ kind: "decision", text: step });
  }
  for (const event of card.providerEvents) {
    if (event === card.providerIdentityLine) continue;
    thoughts.push({ kind: "event", text: event });
  }

  return thoughts;
}

function resolveCurrentFile(card: AgentRunCardViewModel): string | null {
  const editing = card.fileActivity.find((f) => f.status === "editing");
  if (editing) return editing.path;

  const lastWritten = [...card.fileActivity].reverse().find((f) => f.status === "written");
  if (lastWritten && card.overallStatus === "running") return lastWritten.path;

  if (card.filesModified.length === 1) return card.filesModified[0] ?? null;
  if (card.filesPlanned.length === 1) return card.filesPlanned[0] ?? null;
  return null;
}

function resolveUiAuditFailure(
  card: AgentRunCardViewModel,
): ExecutionDashboardUiAuditFailure | null {
  if (card.verification.uiAudit !== "failed") return null;

  const audit = card.diagnostics.items.find((item) => item.uiAudit)?.uiAudit;
  if (audit) {
    return {
      title: audit.title,
      whatFailed: audit.whatFailed,
      reason: audit.reason,
      suggestedFix: audit.suggestedFix,
      rawDetails: audit.rawDetails,
    };
  }

  if (card.failureDiagnosis) {
    return {
      title: card.failureDiagnosis.title,
      whatFailed: card.failureDiagnosis.rootCause,
      reason: card.failureDiagnosis.reason,
      suggestedFix: card.failureDiagnosis.suggestedFix ?? "Review layout and preview output.",
      rawDetails: card.failureDiagnosis.rootCause,
    };
  }

  return null;
}

function resolveUiAuditAdvisory(
  greenfieldRun: GreenfieldRunSnapshot | null | undefined,
): ExecutionDashboardUiAuditAdvisory | null {
  const audit = greenfieldRun?.uiAuditResult;
  if (!audit?.advisory) return null;
  return {
    layoutType: audit.type,
    score: audit.score,
    issues: [...audit.issues],
    details: audit.details?.trim() ?? "",
    recommendations: recommendationsForUiAuditIssues(audit.issues),
  };
}

function buildCompletionSummary(
  card: AgentRunCardViewModel,
  uiAuditAdvisory: ExecutionDashboardUiAuditAdvisory | null,
): ExecutionDashboardCompletionSummary {
  const isTerminal =
    card.overallStatus === "complete" ||
    card.overallStatus === "failed" ||
    card.overallStatus === "cancelled";
  const buildStep = card.steps.find((s) => s.id === "building");
  const buildResult =
    card.verification.build === "passed"
      ? "Build passed"
      : card.verification.build === "failed"
        ? "Build failed"
        : buildStep?.status === "success"
          ? "Build passed"
          : buildStep?.status === "failed"
            ? "Build failed"
            : null;

  const verificationParts: string[] = [];
  if (card.verification.typescript === "passed") verificationParts.push("TypeScript passed");
  else if (card.verification.typescript === "failed") verificationParts.push("TypeScript failed");
  if (card.verification.build === "passed") verificationParts.push("Build passed");
  else if (card.verification.build === "failed") verificationParts.push("Build failed");
  if (card.verification.uiAudit === "passed") verificationParts.push("UI audit passed");
  else if (card.verification.uiAudit === "advisory") {
    const layout = uiAuditAdvisory?.layoutType ?? "layout";
    const score = uiAuditAdvisory?.score;
    verificationParts.push(
      score != null
        ? `UI audit advisory (${layout}, score ${score})`
        : "UI audit advisory",
    );
  } else if (card.verification.uiAudit === "failed") verificationParts.push("UI audit failed");
  if (card.verification.preview === "ready") verificationParts.push("Preview ready");
  else if (card.verification.preview === "failed") verificationParts.push("Preview failed");

  return {
    isVisible: isTerminal && card.isVisible,
    filesModified: [...card.filesModified],
    buildResult,
    verificationResult: verificationParts.length > 0 ? verificationParts.join(" · ") : null,
    durationLabel: card.durationLabel,
    summaryLine: card.successSummary?.summaryLine ?? card.summary,
  };
}

export function deriveExecutionDashboard(input: {
  readonly card: AgentRunCardViewModel;
  readonly timeline: RunTimelineSnapshot | null;
  readonly prompt: string | null;
  readonly greenfieldRun?: GreenfieldRunSnapshot | null;
}): ExecutionDashboardViewModel {
  const { card, timeline, prompt, greenfieldRun = null } = input;
  const runActive = card.overallStatus === "running";
  const uiAuditAdvisory = resolveUiAuditAdvisory(greenfieldRun);

  const paths = [
    ...new Set([
      ...card.fileActivity.map((f) => f.path),
      ...card.filesPlanned,
      ...card.filesModified,
      ...card.filesWritten,
    ]),
  ];

  const files = paths.map((path) => ({
    path,
    status: deriveFileStatus(path, card),
  }));

  const verification: ExecutionDashboardVerificationRow[] = [
    {
      label: "TypeScript",
      status: resolveVerificationStatus(
        "typescript",
        card.verification.typescript,
        card.steps,
        runActive,
      ),
    },
    {
      label: "Build",
      status: resolveVerificationStatus("build", card.verification.build, card.steps, runActive),
    },
    {
      label: "Preview",
      status: resolveVerificationStatus(
        "preview",
        card.verification.preview,
        card.steps,
        runActive,
      ),
    },
    {
      label: "UI Audit",
      status: resolveVerificationStatus(
        "uiAudit",
        card.verification.uiAudit,
        card.steps,
        runActive,
      ),
    },
  ];

  const promptTitle = prompt?.trim()
    ? truncatePrompt(prompt)
    : card.reasoning.headline?.trim() || card.title;

  const providerModel =
    card.providerIdentityLine ??
    (card.provider && card.model
      ? `${card.provider} · ${card.model}`
      : card.provider ?? card.model);

  return {
    isVisible: card.isVisible,
    promptTitle,
    providerModel,
    elapsedLabel: card.durationLabel,
    progressPercent: card.progressPercent,
    progressLabel:
      card.overallStatus === "cancelled"
        ? "Cancelled"
        : card.currentStep?.label ?? (runActive ? "Working…" : "Complete"),
    overallStatus: card.overallStatus,
    thoughts: deriveThoughts(card),
    currentTask: runActive ? (card.currentStep?.label ?? null) : null,
    currentStage: formatTimelineStage(timeline?.lastStage ?? null),
    currentStepLabel: card.currentStep?.label ?? null,
    currentFile: resolveCurrentFile(card),
    files,
    verification,
    uiAuditFailure: resolveUiAuditFailure(card),
    uiAuditAdvisory,
    completion: buildCompletionSummary(card, uiAuditAdvisory),
    streamRevision: card.streamRevision,
  };
}

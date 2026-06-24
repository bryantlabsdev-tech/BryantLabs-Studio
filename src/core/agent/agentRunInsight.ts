import { countProjectSourceFiles } from "@/core/agent/agentReadiness";
import { auditProjectForEdit, type ProjectEditAuditResult } from "@/core/agent/projectEditAudit";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import {
  type StudioFailureReport,
} from "@/core/diagnostics/failureReport";
import { pickFirstRealError } from "@/core/greenfield/failureInvestigation";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { PlanApplySession } from "@/core/planApply";
import type { AIPlanResult } from "@/core/planner/aiTypes";
import type { Confidence, Impact, Plan } from "@/core/planner/types";
import type { ProjectScan } from "@/types";
import {
  GREENFIELD_PROJECT_BADGE,
} from "@/core/agent/greenfieldDetection";
import type { AgentRunVerification } from "@/core/agent/agentRunCard";
import { buildUiAuditFailureDiagnostics } from "@/core/greenfield/uiAudit/diagnostics";
import type { UiAuditFailureDiagnostics } from "@/core/greenfield/uiAudit/types";
import { deriveRunFailureDetails } from "@/core/agent/runFailureDiagnostics";

export interface AgentRunReasoningItem {
  readonly text: string;
  readonly ok: boolean;
}

export interface AgentRunReasoningViewModel {
  readonly headline: string;
  readonly plannerReasoning: readonly string[];
  readonly detected: readonly AgentRunReasoningItem[];
  readonly planSteps: readonly string[];
  readonly risks: readonly string[];
  readonly isVisible: boolean;
}

export interface AgentRunDiagnosticItem {
  readonly title: string;
  readonly reason: string;
  readonly suggestedFix: string | null;
  readonly errorLocation?: string | null;
  readonly errorType?: string | null;
  readonly whatFailed?: string | null;
  readonly detailLines?: readonly string[];
  readonly rawIssueCodes?: readonly string[];
  readonly uiAudit?: UiAuditFailureDiagnostics | null;
}

export interface AgentRunDiagnosticsViewModel {
  readonly items: readonly AgentRunDiagnosticItem[];
  readonly isVisible: boolean;
}

export interface AgentRunFailureDiagnosisViewModel {
  readonly title: string;
  readonly rootCause: string;
  readonly reason: string;
  readonly errorLocation: string | null;
  readonly errorType: string | null;
  readonly suggestedFix: string | null;
  readonly isVisible: boolean;
}

export interface AgentRunConfidenceFactor {
  readonly text: string;
  readonly positive: boolean;
}

export interface AgentRunConfidenceViewModel {
  readonly percent: number;
  readonly level: "high" | "medium" | "low";
  readonly factors: readonly AgentRunConfidenceFactor[];
  readonly showBeforeApply: boolean;
}

export interface AgentRunPatchImpactFile {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
}

export interface AgentRunPatchImpactViewModel {
  readonly files: readonly AgentRunPatchImpactFile[];
  readonly complexity: Impact;
  readonly risk: Impact;
  readonly estimatedTime: string;
  readonly isVisible: boolean;
}

export interface AgentRunSuccessSummaryViewModel {
  readonly headline: string;
  readonly filesModified: readonly string[];
  readonly changes: readonly string[];
  readonly verification: readonly { readonly label: string; readonly passed: boolean }[];
  readonly summaryLine: string;
}

export interface DeriveAgentRunInsightInput {
  readonly prompt: string | null;
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly scan: ProjectScan | null;
  readonly planApplySession: PlanApplySession | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly verification: AgentRunVerification;
  readonly filesModified: readonly string[];
  readonly runActive: boolean;
  readonly currentStepId: string | null;
}

const CONFIDENCE_PERCENT: Record<Confidence, number> = {
  High: 92,
  Medium: 74,
  Low: 48,
};

function auditFromScan(scan: ProjectScan | null): ProjectEditAuditResult | null {
  if (!scan) return null;
  try {
    return auditProjectForEdit(scan);
  } catch {
    return null;
  }
}

function uniqueItems(items: AgentRunReasoningItem[]): AgentRunReasoningItem[] {
  const seen = new Set<string>();
  const out: AgentRunReasoningItem[] = [];
  for (const item of items) {
    const key = item.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function deriveAgentRunReasoning(input: DeriveAgentRunInsightInput): AgentRunReasoningViewModel {
  const detected: AgentRunReasoningItem[] = [];
  const planSteps: string[] = [];
  const plannerReasoning: string[] = [];
  const risks: string[] = [];
  const audit = auditFromScan(input.scan);

  if (input.prompt?.trim()) {
    detected.push({ text: `Request: ${input.prompt.trim()}`, ok: true });
  }

  const sourceFileCount = countProjectSourceFiles(input.scan);
  const isGreenfieldFolder = sourceFileCount === 0;
  if (isGreenfieldFolder) {
    detected.push({ text: GREENFIELD_PROJECT_BADGE, ok: true });
    detected.push({ text: "Folder empty: true", ok: true });
    detected.push({ text: "Generation mode activated", ok: true });
  }

  if (audit && !isGreenfieldFolder) {
    if (audit.framework && audit.framework !== "unknown") {
      detected.push({ text: `Existing ${audit.framework} project`, ok: true });
    }
    if (audit.projectType && audit.projectType !== audit.framework) {
      detected.push({ text: `Project type: ${audit.projectType}`, ok: true });
    }
    if (audit.appFile) {
      detected.push({ text: `${audit.appFile} contains app logic`, ok: true });
    }
    if (audit.entryFile && audit.entryFile !== audit.appFile) {
      detected.push({ text: `${audit.entryFile} is the entry point`, ok: true });
    }
    const cssFile = audit.keyFiles.find((f) => /\.css$/i.test(f));
    if (cssFile) {
      detected.push({ text: `${cssFile} contains styling`, ok: true });
    }
    for (const hint of audit.featureHints.slice(0, 3)) {
      detected.push({ text: hint, ok: true });
    }
  }

  if (input.plan) {
    if (input.plan.intent) {
      detected.push({ text: `${input.plan.intent} request`, ok: true });
    }
    for (const file of input.plan.files.slice(0, 5)) {
      const reason = file.reasons[0]?.trim();
      if (reason) {
        detected.push({ text: `${file.path}: ${reason}`, ok: true });
      } else {
        detected.push({ text: `Target file: ${file.path}`, ok: true });
      }
    }
    for (const step of input.plan.proposedChanges) {
      if (step.trim()) planSteps.push(step.trim());
    }
  }

  if (input.aiPlan?.ok && input.aiPlan.plan) {
    const ai = input.aiPlan.plan;
    if (ai.reasoning?.trim()) {
      for (const line of ai.reasoning.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
        plannerReasoning.push(line);
      }
    }
    for (const risk of ai.risks) {
      if (risk.trim()) risks.push(risk.trim());
    }
    for (const file of ai.files) {
      if (file.reason?.trim()) {
        planSteps.push(`${file.path}: ${file.reason.trim()}`);
      } else {
        planSteps.push(`Update ${file.path}`);
      }
    }
  }

  if (planSteps.length === 0 && input.planApplySession) {
    for (const file of input.planApplySession.files) {
      const reason = file.planReason?.trim() || file.selectionReason?.trim();
      if (reason) {
        planSteps.push(`${file.relPath}: ${reason}`);
      } else {
        planSteps.push(`Update ${file.relPath}`);
      }
    }
  }

  if (planSteps.length === 0 && input.planApplySession?.planSummary?.trim()) {
    for (const line of input.planApplySession.planSummary
      .split(/\n+/)
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean)) {
      planSteps.push(line);
    }
  }

  const headline = (() => {
    if (input.plan?.summary?.trim()) return input.plan.summary.trim();
    if (input.aiPlan?.ok && input.aiPlan.plan?.summary?.trim()) {
      return input.aiPlan.plan.summary.trim();
    }
    if (input.planApplySession?.planSummary?.trim()) {
      return input.planApplySession.planSummary.trim();
    }
    if (
      input.runActive &&
      (input.currentStepId === "understanding" || input.currentStepId === "planning")
    ) {
      return "Analyzing request…";
    }
    return input.runActive ? "Analyzing request…" : "Run analysis";
  })();

  const isVisible =
    detected.length > 0 ||
    planSteps.length > 0 ||
    plannerReasoning.length > 0 ||
    risks.length > 0 ||
    Boolean(input.plan || input.aiPlan?.ok || input.planApplySession);

  return {
    headline,
    plannerReasoning: [...new Set(plannerReasoning)],
    detected: uniqueItems(detected),
    planSteps: [...new Set(planSteps)],
    risks: [...new Set(risks)],
    isVisible,
  };
}

function confidenceLevel(percent: number): "high" | "medium" | "low" {
  if (percent >= 80) return "high";
  if (percent >= 60) return "medium";
  return "low";
}

function impactFromLines(linesAdded: number, filesChanged: number): Impact {
  const score = linesAdded + filesChanged * 20;
  if (score >= 200) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

function estimateDuration(complexity: Impact, fileCount: number): string {
  if (complexity === "High" || fileCount >= 6) return "2–4 minutes";
  if (complexity === "Medium" || fileCount >= 3) return "1–2 minutes";
  return "30 seconds – 1 minute";
}

export function deriveAgentRunConfidence(input: DeriveAgentRunInsightInput): AgentRunConfidenceViewModel {
  const factors: AgentRunConfidenceFactor[] = [];
  let basePercent = 55;

  const planConfidence: Confidence | null =
    input.aiPlan?.ok && input.aiPlan.plan?.confidence
      ? input.aiPlan.plan.confidence
      : input.plan?.confidence ?? null;

  const planImpact: Impact | null = input.plan?.impact ?? null;

  if (planConfidence) {
    basePercent = CONFIDENCE_PERCENT[planConfidence];
    if (planConfidence === "High") {
      factors.push({ text: "Planner rated this change as high confidence", positive: true });
    } else if (planConfidence === "Low") {
      factors.push({ text: "Planner rated this change as low confidence", positive: false });
    }
  }

  const targetFiles =
    input.planApplySession?.applyTargetCount ??
    input.plan?.files.length ??
    input.aiPlan?.plan?.files.length ??
    0;

  if (targetFiles > 0) {
    factors.push({ text: "Required files found", positive: true });
    basePercent = Math.min(98, basePercent + 4);
  } else if (input.scan && input.scan.files.length > 0) {
    factors.push({ text: "Project indexed", positive: true });
  } else {
    factors.push({ text: "Missing project context", positive: false });
    basePercent = Math.max(20, basePercent - 15);
  }

  const audit = auditFromScan(input.scan);
  if (audit?.appFile) {
    factors.push({ text: "Existing architecture understood", positive: true });
    basePercent = Math.min(98, basePercent + 3);
  }

  if (planImpact === "Low") {
    factors.push({ text: "Low implementation risk", positive: true });
  } else if (planImpact === "High") {
    factors.push({ text: "High implementation risk", positive: false });
    basePercent = Math.max(25, basePercent - 12);
  }

  const totalLines =
    input.planApplySession?.totals?.linesAdded ??
    input.greenfieldRun.workflow?.linesAdded ??
    0;
  if (totalLines > 250) {
    factors.push({ text: "Large patch size", positive: false });
    basePercent = Math.max(25, basePercent - 10);
  }

  if (targetFiles >= 5) {
    factors.push({ text: "Multiple files affected", positive: false });
  }

  const aiRisks = input.aiPlan?.ok ? input.aiPlan.plan?.risks ?? [] : [];
  for (const risk of aiRisks.slice(0, 2)) {
    if (risk.trim()) factors.push({ text: risk.trim(), positive: false });
    basePercent = Math.max(25, basePercent - 5);
  }

  if (input.aiPlan && !input.aiPlan.ok) {
    factors.push({ text: "AI plan did not complete", positive: false });
    basePercent = Math.max(20, basePercent - 20);
  }

  const showBeforeApply =
    input.runActive &&
    (input.currentStepId === "planning" ||
      input.currentStepId === "editing" ||
      input.planApplySession?.phase === "review" ||
      input.planApplySession?.phase === "waiting_for_review");

  const percent = Math.max(15, Math.min(98, Math.round(basePercent)));

  return {
    percent,
    level: confidenceLevel(percent),
    factors: factors.length > 0 ? factors : [{ text: "Awaiting planner output", positive: true }],
    showBeforeApply,
  };
}

export function deriveAgentRunPatchImpact(
  input: DeriveAgentRunInsightInput,
): AgentRunPatchImpactViewModel {
  const session = input.planApplySession;
  const files: AgentRunPatchImpactFile[] = [];

  if (session) {
    for (const file of session.files) {
      if (!file.diffStats?.changed && file.status !== "ready" && file.status !== "proposing") {
        continue;
      }
      files.push({
        path: file.relPath,
        added: file.diffStats?.added ?? 0,
        removed: file.diffStats?.removed ?? 0,
      });
    }
  }

  const workflow = input.greenfieldRun.workflow;
  if (files.length === 0 && session) {
    for (const file of session.files) {
      if (file.relPath) {
        files.push({ path: file.relPath, added: 0, removed: 0 });
      }
    }
  }

  const totals = session?.totals;
  const linesAdded = totals?.linesAdded ?? workflow?.linesAdded ?? 0;
  const filesChanged = totals?.filesChanged ?? files.length;

  const complexity =
    input.plan?.impact ??
    impactFromLines(linesAdded, filesChanged);

  let risk: Impact = input.plan?.impact ?? complexity;
  const aiRisks = input.aiPlan?.ok ? input.aiPlan.plan?.risks ?? [] : [];
  if (aiRisks.length >= 2) risk = "High";
  else if (aiRisks.length === 1 && risk === "Low") risk = "Medium";

  const isVisible =
    files.length > 0 &&
    (input.runActive
      ? input.currentStepId === "editing" ||
        input.currentStepId === "applying" ||
        session?.phase === "review" ||
        session?.phase === "waiting_for_review"
      : files.some((f) => f.added > 0 || f.removed > 0));

  return {
    files,
    complexity,
    risk,
    estimatedTime: estimateDuration(complexity, files.length),
    isVisible,
  };
}

export function suggestFixFromDiagnostic(diagnostic: TypeScriptDiagnostic): string | null {
  const propMatch = diagnostic.message.match(
    /Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/,
  );
  if (propMatch) {
    return `Add ${propMatch[1]} to ${propMatch[2]} interface.`;
  }
  const cannotFind = diagnostic.message.match(/Cannot find name ['"]([^'"]+)['"]/);
  if (cannotFind) {
    return `Define or import '${cannotFind[1]}'.`;
  }
  const missingModule = diagnostic.message.match(/Cannot find module ['"]([^'"]+)['"]/);
  if (missingModule) {
    return `Install or add a path alias for '${missingModule[1]}'.`;
  }
  return null;
}

function firstTypeScriptDiagnostic(report: StudioFailureReport): TypeScriptDiagnostic | null {
  for (const stage of report.stages) {
    const details = stage.typecheckDetails;
    if (!details?.diagnostics.length) continue;
    return (
      pickFirstRealError(details.diagnostics) ??
      details.diagnostics.find((d) => d.category === "error") ??
      details.diagnostics[0] ??
      null
    );
  }
  return null;
}

function failureTitleFromReport(
  report: StudioFailureReport,
  greenfieldRun: GreenfieldRunSnapshot,
): string {
  const uiAudit = greenfieldRun.uiAuditResult;
  if (uiAudit && !uiAudit.ok && !uiAudit.skipped) {
    return buildUiAuditFailureDiagnostics(uiAudit)?.title ?? "UI Audit Failed";
  }
  if (report.rootStage === "typescript") return "TypeScript Failed";
  if (report.rootStage === "build") return "Build Failed";
  if (report.rootStage === "preview") return "Preview Failed";
  if (report.rootStage === "patch_propose") return "Patch Proposal Failed";
  return "Run Failed";
}

function uiAuditDiagnosticItem(
  audit: NonNullable<GreenfieldRunSnapshot["uiAuditResult"]>,
): AgentRunDiagnosticItem {
  const diag = buildUiAuditFailureDiagnostics(audit);
  if (!diag) {
    return {
      title: "UI Audit Failed",
      reason: audit.details?.trim() || "UI audit did not pass.",
      suggestedFix: null,
      errorType: audit.issues.join(", ") || "ui_audit",
      rawIssueCodes: [...audit.issues],
    };
  }

  return {
    title: diag.title,
    reason: diag.reason,
    suggestedFix: diag.suggestedFix,
    whatFailed: diag.whatFailed,
    errorType: diag.rawIssueCodes.join(", "),
    rawIssueCodes: diag.rawIssueCodes,
    detailLines: [
      `What failed: ${diag.whatFailed}`,
      `Layout: ${diag.layoutType}`,
      `Score: ${diag.score}`,
      ...diag.issueDetails.flatMap((issue) => [
        `Issue: ${issue.issue}`,
        `Reason: ${issue.reason}`,
        `Suggested fix: ${issue.suggestedFix}`,
      ]),
      `Raw audit: ${diag.rawDetails}`,
    ],
    uiAudit: diag,
  };
}

export function deriveAgentRunDiagnostics(
  failureReport: StudioFailureReport | null,
  greenfieldRun: GreenfieldRunSnapshot,
  overallFailed: boolean,
): AgentRunDiagnosticsViewModel {
  const items: AgentRunDiagnosticItem[] = [];

  const uiAudit = greenfieldRun.uiAuditResult;
  if (
    uiAudit &&
    !uiAudit.ok &&
    !uiAudit.skipped &&
    !uiAudit.advisory &&
    greenfieldRun.runResult !== "success"
  ) {
    items.push(uiAuditDiagnosticItem(uiAudit));
  }

  if (failureReport) {
    const primary = deriveAgentRunFailureDiagnosis(failureReport, greenfieldRun, true);
    if (primary) {
      const duplicateUi =
        items.some((item) => item.uiAudit) &&
        (primary.title.endsWith("Layout Failure") ||
          primary.title === "Board Not Found" ||
          primary.title === "UI Audit Failed");
      if (!duplicateUi) {
        items.push({
          title: primary.title,
          reason: primary.reason,
          suggestedFix: primary.suggestedFix,
          errorLocation: primary.errorLocation,
          errorType: primary.errorType,
        });
      }
    }
  }

  return {
    items,
    isVisible: overallFailed && items.length > 0,
  };
}

export function deriveAgentRunFailureDiagnosis(
  failureReport: StudioFailureReport | null,
  greenfieldRun: GreenfieldRunSnapshot,
  overallFailed: boolean,
): AgentRunFailureDiagnosisViewModel | null {
  if (!overallFailed) return null;

  const failureDetails = deriveRunFailureDetails({
    greenfieldRun,
    failureReport,
    overallFailed: true,
  });

  if (failureReport) {
    const diagnostic = firstTypeScriptDiagnostic(failureReport);
    const rootStage = failureReport.stages.find((s) => s.role === "root");
    const errorLocation = diagnostic ? `${diagnostic.file}:${diagnostic.line}` : null;
    const errorType = diagnostic?.code ?? rootStage?.stage ?? failureDetails?.reason ?? null;
    const reason =
      diagnostic?.message ?? rootStage?.headline ?? failureReport.rootCauseLine;
    const suggestedFix =
      (diagnostic ? suggestFixFromDiagnostic(diagnostic) : null) ??
      failureDetails?.whatToTryNext[0] ??
      null;

    return {
      title: failureDetails?.headline ?? failureTitleFromReport(failureReport, greenfieldRun),
      rootCause: failureReport.rootCauseLine,
      reason,
      errorLocation,
      errorType,
      suggestedFix,
      isVisible: true,
    };
  }

  const uiAudit = greenfieldRun.uiAuditResult;
  if (
    uiAudit &&
    !uiAudit.ok &&
    !uiAudit.skipped &&
    !uiAudit.advisory &&
    greenfieldRun.runResult !== "success"
  ) {
    const item = uiAuditDiagnosticItem(uiAudit);
    return {
      title: item.title,
      rootCause: item.uiAudit?.rawDetails ?? uiAudit.details?.trim() ?? "UI audit failed",
      reason: item.reason,
      errorLocation: null,
      errorType: item.errorType ?? item.rawIssueCodes?.[0] ?? "ui_audit",
      suggestedFix: item.suggestedFix,
      isVisible: true,
    };
  }

  if (failureDetails) {
    return {
      title: failureDetails.headline,
      rootCause: failureDetails.rawErrorMessage ?? failureDetails.reasonLabel,
      reason: failureDetails.rawErrorMessage ?? failureDetails.reasonLabel,
      errorLocation: null,
      errorType: failureDetails.reason,
      suggestedFix: failureDetails.whatToTryNext[0] ?? null,
      isVisible: true,
    };
  }

  return null;
}

export function deriveAgentRunSuccessSummary(input: {
  readonly filesModified: readonly string[];
  readonly verification: AgentRunVerification;
  readonly plan: Plan | null;
  readonly aiPlan: AIPlanResult | null;
  readonly planApplySession: PlanApplySession | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
}): AgentRunSuccessSummaryViewModel {
  const changes: string[] = [];

  if (input.plan) {
    for (const change of input.plan.proposedChanges) {
      if (change.trim()) changes.push(change.trim());
    }
  }

  if (changes.length === 0 && input.aiPlan?.ok && input.aiPlan.plan) {
    for (const file of input.aiPlan.plan.files) {
      if (file.reason?.trim()) changes.push(file.reason.trim());
    }
    if (changes.length === 0 && input.aiPlan.plan.summary?.trim()) {
      changes.push(input.aiPlan.plan.summary.trim());
    }
  }

  if (changes.length === 0 && input.planApplySession?.planSummary?.trim()) {
    for (const line of input.planApplySession.planSummary
      .split(/\n+/)
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean)) {
      changes.push(line);
    }
  }

  if (changes.length === 0 && input.greenfieldRun.workflow?.planSummary?.trim()) {
    changes.push(input.greenfieldRun.workflow.planSummary.trim());
  }

  const verificationItems: Array<{ label: string; passed: boolean }> = [];
  if (input.verification.typescript === "passed") {
    verificationItems.push({ label: "TypeScript", passed: true });
  } else if (input.verification.typescript === "failed") {
    verificationItems.push({ label: "TypeScript", passed: false });
  }
  if (input.verification.build === "passed") {
    verificationItems.push({ label: "Build", passed: true });
  } else if (input.verification.build === "failed") {
    verificationItems.push({ label: "Build", passed: false });
  }
  if (input.verification.uiAudit === "passed") {
    verificationItems.push({ label: "UI audit", passed: true });
  } else if (input.verification.uiAudit === "failed") {
    verificationItems.push({ label: "UI audit", passed: false });
  }
  if (input.verification.preview === "ready") {
    verificationItems.push({ label: "Preview", passed: true });
  } else if (input.verification.preview === "failed") {
    verificationItems.push({ label: "Preview", passed: false });
  }

  const parts: string[] = [];
  if (input.filesModified.length > 0) {
    parts.push(
      `Updated ${input.filesModified.length} file${input.filesModified.length === 1 ? "" : "s"}.`,
    );
  }
  for (const v of verificationItems) {
    parts.push(v.passed ? `${v.label} passed.` : `${v.label} failed.`);
  }
  if (input.verification.uiAudit === "advisory") {
    const audit = input.greenfieldRun.uiAuditResult;
    const layout = audit?.type ? `${audit.type}` : "layout";
    const score = audit?.score;
    parts.push(
      score != null
        ? `UI audit advisory (${layout}, score ${score}).`
        : "UI audit advisory.",
    );
  }

  return {
    headline: "Success Summary",
    filesModified: [...input.filesModified],
    changes: [...new Set(changes)],
    verification: verificationItems,
    summaryLine: parts.join(" "),
  };
}

export function buildInsightStreamRevision(
  timeline: RunTimelineSnapshot | null,
  plan: Plan | null,
  aiPlan: AIPlanResult | null,
  session: PlanApplySession | null,
): string {
  return [
    timeline?.lastStage ?? "none",
    plan?.createdAt ?? 0,
    aiPlan?.latencyMs ?? 0,
    session?.phase ?? "idle",
    session?.totals?.linesAdded ?? 0,
    session?.files.length ?? 0,
  ].join(":");
}

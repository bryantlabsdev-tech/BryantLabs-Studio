import type { PlanApplySession } from "@/core/planApply/types";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";

export type FileSelectionAction = "read" | "edit" | "create" | "validate";

export interface FileSelectionPreviewItem {
  readonly path: string;
  readonly reason: string;
  readonly action: FileSelectionAction;
  readonly risk: "low" | "medium" | "high" | null;
  readonly confidence: number | null;
}

function riskFromLines(lines: number): "low" | "medium" | "high" | null {
  if (lines <= 0) return null;
  if (lines > 120) return "high";
  if (lines > 40) return "medium";
  return "low";
}

function formatReason(selectionReason: string, planReason: string): string {
  const selection = selectionReason.trim();
  const plan = planReason.trim();
  if (plan && selection && plan !== selection) return `${selection} — ${plan}`;
  return selection || plan || "Selected for this change request";
}

function actionFromEntry(
  action: PlanApplySession["files"][number]["action"] | undefined,
  status: PlanApplySession["files"][number]["status"],
): FileSelectionAction {
  if (action === "create") return "create";
  if (status === "ready" || status === "proposing") return "edit";
  if (status === "pending") return "read";
  return "validate";
}

export function deriveAgentFileSelectionPreview(input: {
  readonly card: AgentRunCardViewModel;
  readonly planApplySession: PlanApplySession | null;
}): FileSelectionPreviewItem[] {
  const { card, planApplySession } = input;

  if (planApplySession && planApplySession.files.length > 0) {
    return planApplySession.files.map((file) => {
      const lines = (file.diffStats?.added ?? 0) + (file.diffStats?.removed ?? 0);
      return {
        path: file.relPath,
        reason: formatReason(file.selectionReason, file.planReason),
        action: actionFromEntry(file.action, file.status),
        risk: riskFromLines(lines),
        confidence: file.relevanceScore ?? null,
      };
    });
  }

  if (card.patchImpact.files.length > 0) {
    return card.patchImpact.files.map((file) => ({
      path: file.path,
      reason: "Selected based on plan impact analysis",
      action: "edit" as const,
      risk: riskFromLines(file.added + file.removed),
      confidence: card.confidence.percent > 0 ? card.confidence.percent : null,
    }));
  }

  return card.filesPlanned.map((path) => ({
    path,
    reason: "Planned for modification",
    action: "read" as const,
    risk: null,
    confidence: null,
  }));
}

export function fileSelectionPreviewText(items: readonly FileSelectionPreviewItem[]): string {
  return items.map((item) => `${item.path}\t${item.action}\t${item.reason}`).join("\n");
}

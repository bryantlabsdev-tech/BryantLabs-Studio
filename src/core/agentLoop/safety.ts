import type {
  AgentActionParams,
  AgentActionType,
  AgentLoopSession,
} from "@/core/agentLoop/types";
import { validateAgentCommand } from "@/core/agentLoop/agentCommandAllowlist";

export const MAX_NEW_FILES_WITHOUT_APPROVAL = 5;
export const MAX_MODIFY_FILES_WITHOUT_APPROVAL = 8;

const ARCHITECTURE_HINTS =
  /\b(refactor\s+entire|rewrite\s+architecture|migrate\s+to|monorepo|microservices)\b/i;

const DELETE_HINTS = /\b(delete|remove)\s+(all\s+)?(files?|folder|directory)/i;

export interface SafetyCheck {
  readonly needsApproval: boolean;
  readonly reason: string;
}

export function checkActionSafety(
  action: AgentActionType,
  params: AgentActionParams,
  session: AgentLoopSession,
  context?: {
    readonly newFileCount?: number;
    readonly modifyFileCount?: number;
    readonly goal?: string;
  },
): SafetyCheck {
  const goal = context?.goal ?? session.goal;

  if (DELETE_HINTS.test(goal) || DELETE_HINTS.test(params.message ?? "")) {
    return {
      needsApproval: true,
      reason: "Goal or action may delete files — approval required.",
    };
  }

  if (ARCHITECTURE_HINTS.test(goal)) {
    if (action === "modify_files" || action === "create_plan") {
      return {
        needsApproval: true,
        reason: "Major architecture change detected in goal.",
      };
    }
  }

  if (action === "modify_files") {
    const count = context?.modifyFileCount ?? 0;
    if (count > MAX_MODIFY_FILES_WITHOUT_APPROVAL) {
      return {
        needsApproval: true,
        reason: `Modifying ${count} files exceeds limit (${MAX_MODIFY_FILES_WITHOUT_APPROVAL}).`,
      };
    }
  }

  if (action === "create_plan") {
    const newCount = context?.newFileCount ?? 0;
    if (newCount > MAX_NEW_FILES_WITHOUT_APPROVAL) {
      return {
        needsApproval: true,
        reason: `Plan proposes ${newCount} new files (limit ${MAX_NEW_FILES_WITHOUT_APPROVAL}).`,
      };
    }
  }

  if (action === "run_command") {
    const command = params.command?.trim() ?? "";
    const allowed = validateAgentCommand(command);
    if (!allowed.ok) {
      return {
        needsApproval: true,
        reason: allowed.error,
      };
    }
  }

  return { needsApproval: false, reason: "" };
}

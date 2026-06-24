import type { FollowUpRunPhase } from "@/core/build/followUpRun";

/** User-facing agent stages — hide implementation details from normal users. */
export const AGENT_UX_STAGE_LABELS: Record<FollowUpRunPhase, string> = {
  idle: "Ready",
  auditing: "Understanding project",
  thinking: "Planning changes",
  generating: "Updating app",
  planning: "Planning changes",
  editing: "Updating app",
  reviewing: "Updating app",
  applying: "Updating app",
  typescript: "Testing changes",
  building: "Testing changes",
  previewing: "Preview ready",
  auto_repair: "Updating app",
  done: "Done",
  failed: "Failed",
};

export const AGENT_UX_WAITING_LABELS: Record<FollowUpRunPhase, string> = {
  idle: "Ready",
  auditing: "Understanding project…",
  thinking: "Planning changes…",
  generating: "Updating app…",
  planning: "Planning changes…",
  editing: "Updating app…",
  reviewing: "Updating app…",
  applying: "Updating app…",
  typescript: "Testing changes…",
  building: "Testing changes…",
  previewing: "Preview ready…",
  auto_repair: "Updating app…",
  done: "Done",
  failed: "Failed",
};

export const AGENT_PIPELINE_UNDERSTANDING = "Understanding project";

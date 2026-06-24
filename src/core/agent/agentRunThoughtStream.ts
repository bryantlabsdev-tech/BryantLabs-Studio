import type { AgentRunStep } from "@/core/agent/agentRunCard";
import type { AgentRunFileActivity } from "@/core/agent/agentRunCard";
import type { RunTimelineSnapshot, RunTimelineStageId } from "@/core/agent/runTimeline";
import { countProjectSourceFiles } from "@/core/agent/agentReadiness";
import { GREENFIELD_PROJECT_BADGE } from "@/core/agent/greenfieldDetection";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { ProjectScan } from "@/types";

export interface AgentRunThoughtEvent {
  readonly id: string;
  readonly text: string;
  readonly at: number | null;
}

const STAGE_LABELS: Partial<Record<RunTimelineStageId, string>> = {
  audit_start: "Analyzing request…",
  audit_complete: "Analyzing request…",
  explore_start: "Exploring repository…",
  explore_complete: "Exploring repository…",
  plan_start: "Planning changes",
  plan_complete: "Planning changes",
  coder_start: "Writing files",
  coder_complete: "Writing files",
  patch_generated: "Planning changes",
  apply_start: "Applying changes",
  apply_complete: "Applying changes",
  typescript_start: "Running TypeScript",
  typescript_complete: "Running TypeScript",
  build_start: "Starting build",
  build_complete: "Starting build",
  preview_start: "Launching preview",
  preview_complete: "Launching preview",
  run_complete: "Run complete",
};

const LOG_STAGE_LABELS: Partial<Record<GreenfieldRunLogEntry["stage"], string>> = {
  ai_plan: "Planning changes",
  apply_plan: "Applying changes",
  pipeline_planner: "Planning changes",
  pipeline_coder: "Writing files",
  write: "Writing files",
  typescript: "Running TypeScript",
  build: "Starting build",
  preview: "Launching preview",
  ui_audit: "Running UI audit",
  generation: "Generating files",
};

function parseAt(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : null;
}

function extractFilePath(message: string): string | null {
  const match =
    message.match(/(?:^|\s)([\w./-]+\.(?:tsx?|jsx?|css|json|html|md|vue|svelte))\b/i) ??
    message.match(/([\w./-]+\/[\w./-]+\.\w+)/);
  return match?.[1] ?? null;
}

function isUnknownFrameworkLabel(fw: string): boolean {
  return !fw || /^unknown$/i.test(fw.trim());
}

function frameworkFromScan(scan: ProjectScan | null): string | null {
  if (!scan) return null;
  if (countProjectSourceFiles(scan) === 0) return null;
  const fw = scan.summary.framework;
  if (isUnknownFrameworkLabel(fw)) return null;
  return fw;
}

export function deriveAgentRunThoughtStream(input: {
  readonly entries: readonly GreenfieldRunLogEntry[];
  readonly timeline: RunTimelineSnapshot | null;
  readonly scan: ProjectScan | null;
  readonly currentStep: AgentRunStep | null;
  readonly fileActivity: readonly AgentRunFileActivity[];
}): AgentRunThoughtEvent[] {
  const events: AgentRunThoughtEvent[] = [];
  const seen = new Set<string>();

  const push = (id: string, text: string, at: number | null) => {
    const key = `${text}:${at ?? "x"}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push({ id, text, at });
  };

  push("start", "Analyzing request…", input.timeline?.startedAt ?? null);

  const sourceFileCount = countProjectSourceFiles(input.scan);
  if (sourceFileCount === 0) {
    const at = input.timeline?.startedAt ?? null;
    push("greenfield-detect", "Greenfield Detection", at);
    push("greenfield-empty", "Folder Empty: true", at);
    push("greenfield-mode", "Generation Mode Activated", at);
    push("greenfield-badge", GREENFIELD_PROJECT_BADGE, at);
  } else {
    const framework = frameworkFromScan(input.scan);
    if (framework) {
      push("framework", `Detected ${framework} project`, input.timeline?.startedAt ?? null);
    }
  }

  for (const stage of input.timeline?.stages ?? []) {
    const label = STAGE_LABELS[stage.stage];
    if (label) push(`tl-${stage.stage}-${stage.at}`, label, stage.at);
    if (stage.detail) {
      const path = extractFilePath(stage.detail);
      if (path) push(`tl-file-${path}-${stage.at}`, `Writing ${path}`, stage.at);
    }
  }

  for (const entry of input.entries) {
    const at = parseAt(entry.timestamp);
    const stageLabel = LOG_STAGE_LABELS[entry.stage];
    if (stageLabel && entry.status === "running") {
      push(`log-${entry.stage}-${at}`, stageLabel, at);
    }

    const path = extractFilePath(entry.message);
    if (path && (entry.stage === "write" || entry.stage === "pipeline_coder")) {
      if (entry.status === "running") {
        push(`write-run-${path}-${at}`, `Writing ${path}`, at);
      } else if (entry.status === "success") {
        push(`write-done-${path}-${at}`, `Saved ${path}`, at);
      }
    }
  }

  for (const file of input.fileActivity) {
    if (file.status === "written") {
      push(`file-${file.path}`, `✓ ${file.path}`, null);
    }
  }

  if (input.currentStep?.status === "running") {
    const stepLabels: Partial<Record<AgentRunStep["id"], string>> = {
      understanding: "Analyzing request…",
      planning: "Planning changes",
      editing: "Editing files",
      applying: "Applying patch",
      typescript: "Running TypeScript",
      building: "Starting build",
      ui_audit: "Running UI audit",
      preview: "Launching preview",
    };
    const label = stepLabels[input.currentStep.id];
    if (label) push(`step-${input.currentStep.id}`, label, null);
  }

  events.sort((a, b) => {
    if (a.at == null && b.at == null) return 0;
    if (a.at == null) return 1;
    if (b.at == null) return -1;
    return a.at - b.at;
  });

  return events;
}

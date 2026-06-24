import { studioEventBus } from "@/core/console/studioEventBus";
import type { RunLogStatus } from "@/core/greenfield/runLog";

export type GreenfieldConsoleStage =
  | "greenfield:start"
  | "greenfield:complete"
  | "greenfield:cancelled"
  | "greenfield:stale-cleared"
  | "greenfield:review_ready"
  | "greenfield:review_approved"
  | "greenfield:write_start"
  | "provider:start"
  | "provider:response"
  | "parser:start"
  | "parser:success"
  | "parser:fail"
  | "write:start"
  | "write:success"
  | "write:fail"
  | "npm:start"
  | "npm:success"
  | "npm:fail"
  | "typescript:start"
  | "typescript:success"
  | "typescript:fail"
  | "build:start"
  | "build:success"
  | "build:fail"
  | "preview:start"
  | "preview:success"
  | "preview:fail";

export interface EmitGreenfieldConsoleInput {
  readonly projectPath?: string | null;
  readonly message?: string;
  readonly details?: string;
  /** Exact filesystem or IPC error for Console rawError display. */
  readonly error?: string;
  readonly provider?: string | null;
  readonly model?: string | null;
}

function statusFromStage(stage: GreenfieldConsoleStage): RunLogStatus | "info" {
  if (stage.endsWith(":fail")) return "failed";
  if (
    stage.endsWith(":success") ||
    stage === "greenfield:complete" ||
    stage === "greenfield:review_approved"
  ) {
    return "success";
  }
  if (
    stage.endsWith(":start") ||
    stage === "greenfield:start" ||
    stage === "greenfield:write_start"
  ) {
    return "running";
  }
  if (stage === "greenfield:cancelled" || stage === "greenfield:stale-cleared") return "failed";
  if (stage === "greenfield:review_ready") return "info";
  return "info";
}

const STAGE_LABELS: Record<GreenfieldConsoleStage, string> = {
  "greenfield:start": "Greenfield started",
  "greenfield:complete": "Greenfield complete",
  "greenfield:cancelled": "Greenfield cancelled",
  "greenfield:stale-cleared": "Stale greenfield cleared",
  "greenfield:review_ready": "Files ready for review",
  "greenfield:review_approved": "Review approved — writing files",
  "greenfield:write_start": "Write started",
  "provider:start": "Provider request started",
  "provider:response": "Provider response",
  "parser:start": "Parser started",
  "parser:success": "Parser succeeded",
  "parser:fail": "Parser failed",
  "write:start": "Write started",
  "write:success": "Write succeeded",
  "write:fail": "Write failed",
  "npm:start": "npm install started",
  "npm:success": "npm install succeeded",
  "npm:fail": "npm install failed",
  "typescript:start": "TypeScript check started",
  "typescript:success": "TypeScript passed",
  "typescript:fail": "TypeScript failed",
  "build:start": "Build started",
  "build:success": "Build passed",
  "build:fail": "Build failed",
  "preview:start": "Preview started",
  "preview:success": "Preview ready",
  "preview:fail": "Preview failed",
};

export function emitGreenfieldConsoleEvent(
  stage: GreenfieldConsoleStage,
  input: EmitGreenfieldConsoleInput = {},
): void {
  const status = statusFromStage(stage);
  const message = input.message ?? STAGE_LABELS[stage];
  const timestamp = Date.now();

  studioEventBus.emit({
    type: "greenfield.stage",
    timestamp,
    projectPath: input.projectPath ?? null,
    stage,
    status,
    message,
    ...(input.details ? { details: input.details } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.provider != null ? { provider: input.provider } : {}),
    ...(input.model != null ? { model: input.model } : {}),
  });

  if (stage === "greenfield:start") {
    studioEventBus.emit({
      type: "run.started",
      timestamp,
      projectPath: input.projectPath ?? null,
      actionType: "greenfield",
      message,
    });
  }
  if (stage === "greenfield:complete") {
    studioEventBus.emit({
      type: "run.completed",
      timestamp,
      projectPath: input.projectPath ?? null,
      actionType: "greenfield",
      ok: true,
      message,
    });
  }
  if (stage === "greenfield:cancelled") {
    studioEventBus.emit({
      type: "run.cancelled",
      timestamp,
      projectPath: input.projectPath ?? null,
      message,
    });
  }
}

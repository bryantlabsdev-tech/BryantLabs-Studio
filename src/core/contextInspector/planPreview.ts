import type { PlanContext } from "@/core/planner/aiTypes";
import type { ProviderId } from "@/core/providers/types";

const AI_PLAN_SCHEMA = `{
  "summary": "<non-empty string>",
  "files": [{ "path": "<string>", "reason": "<string>" }],
  "reasoning": "<string>",
  "risks": ["<string>"],
  "confidence": "High" | "Medium" | "Low"
}`;

/** Mirror of main-process AI plan prompt (read-only preview). */
export function buildAIPlanRequestPreview(
  userPrompt: string,
  context: PlanContext,
): string {
  const ctx = JSON.stringify(context, null, 2);
  return [
    "You are a senior software engineer analysing a codebase to PLAN a change.",
    "You must NOT write code, diffs, or edits. Produce a read-only analysis only.",
    "",
    "Respond with ONLY one JSON object matching exactly this shape:",
    AI_PLAN_SCHEMA,
    "",
    "User request:",
    userPrompt,
    "",
    "Project context (JSON):",
    ctx,
    "",
    "Reply with the JSON object only.",
  ].join("\n");
}

export function buildProviderRequestPreview(
  provider: ProviderId,
  operation: import("@/core/contextInspector/types").ContextOperation,
  userPrompt: string,
  context: PlanContext,
  requestPreview: string,
): string {
  const header = [
    `Provider: ${provider}`,
    `Operation: ${operation}`,
    "---",
  ].join("\n");
  if (operation === "ai_plan" || operation === "agent") {
    return `${header}\n${buildAIPlanRequestPreview(userPrompt, context)}`;
  }
  if (operation === "apply_plan" || operation === "ai_patch") {
    return [
      header,
      "Apply Plan / AI Patch sends PlanContext plus file contents in a separate batch prompt.",
      "PlanContext JSON:",
      JSON.stringify(context, null, 2),
      "",
      "--- Batch / patch prompt (when files are attached) ---",
      requestPreview || "(file bodies attached at invoke time)",
    ].join("\n");
  }
  return `${header}\n${requestPreview}`;
}

import type { AIPlanParseFailReason } from "@/core/planner/aiTypes";

/** Expected AI plan JSON shape (shown when parsing fails). */
export const AI_PLAN_EXPECTED_SCHEMA = `{
  "summary": "<non-empty string>",
  "files": [
    { "path": "<string>", "reason": "<string>" }
  ],
  "reasoning": "<string>",
  "risks": ["<string>"],
  "confidence": "High" | "Medium" | "Low"
}`;

export const AI_PLAN_REQUIRED_ROOT_KEYS = [
  "summary",
  "files",
  "reasoning",
  "risks",
  "confidence",
] as const;

/** User-facing failure title for the AI plan panel. */
export function aiPlanFailureTitle(
  parseFailReason?: AIPlanParseFailReason,
  error?: string,
): string {
  if (error) return error;
  switch (parseFailReason) {
    case "truncated":
      return "Response Truncated";
    case "schema_validation":
      return "Schema Validation Failed";
    case "json_syntax":
      return "Invalid JSON";
    case "no_json":
      return "No JSON Returned";
    case "empty_response":
      return "Empty Provider Response";
    default:
      return "Could not parse the AI response as a JSON plan.";
  }
}

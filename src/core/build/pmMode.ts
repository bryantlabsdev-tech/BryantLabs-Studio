/** One-click Product Manager mode — audit, plan, apply, verify without a detailed prompt. */
export const IMPROVE_APP_PROMPT =
  "Improve this app: audit the current project, identify the highest-impact missing feature or UX polish, implement it in the existing codebase without rebuilding from scratch, and keep all current functionality working.";

export function isImproveAppPrompt(prompt: string): boolean {
  return prompt.trim() === IMPROVE_APP_PROMPT;
}

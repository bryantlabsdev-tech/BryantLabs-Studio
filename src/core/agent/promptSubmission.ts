export const MAX_AGENT_PROMPT_CHARS = 20_000;
export const PROMPT_LENGTH_WARN_AT = 15_000;
export const LONG_PROMPT_AUTO_PROCEED_CHARS = 400;

export interface PromptValidationResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly warning: string | null;
  readonly length: number;
}

export function validateAgentPrompt(prompt: string): PromptValidationResult {
  const trimmed = prompt.trim();
  const length = trimmed.length;

  if (length < 4) {
    return {
      ok: false,
      error: "Enter a goal with at least 4 characters.",
      warning: null,
      length,
    };
  }

  if (length > MAX_AGENT_PROMPT_CHARS) {
    return {
      ok: false,
      error: `Prompt is too long (${length.toLocaleString()} characters). Maximum is ${MAX_AGENT_PROMPT_CHARS.toLocaleString()} characters.`,
      warning: null,
      length,
    };
  }

  if (length >= PROMPT_LENGTH_WARN_AT) {
    return {
      ok: true,
      error: null,
      warning: `Long prompt (${length.toLocaleString()} characters) — generation may take several minutes.`,
      length,
    };
  }

  return { ok: true, error: null, warning: null, length };
}

export interface PromptSubmissionDebugContext {
  readonly promptLength: number;
  readonly promptPreview?: string | null;
  readonly promptHash?: string | null;
  readonly runId?: string | null;
  readonly previousRunId?: string | null;
  readonly projectPath?: string | null;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly route?: string | null;
  readonly phase?: string | null;
}

export function logPromptSubmission(
  event: string,
  context: PromptSubmissionDebugContext,
): void {
  const parts = [
    `len=${context.promptLength}`,
    context.promptPreview ? `prompt="${context.promptPreview}"` : null,
    context.promptHash ? `hash=${context.promptHash}` : null,
    context.runId ? `run=${context.runId}` : null,
    context.previousRunId ? `prevRun=${context.previousRunId}` : null,
    context.projectPath ? `repo=${context.projectPath}` : null,
    context.provider ? `provider=${context.provider}` : null,
    context.model ? `model=${context.model}` : null,
    context.route ? `route=${context.route}` : null,
    context.phase ? `phase=${context.phase}` : null,
  ].filter(Boolean);
  console.info(`[agent:submit] ${event} ${parts.join(" ")}`);
}

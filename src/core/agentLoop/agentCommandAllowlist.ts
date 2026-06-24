/** Allowlisted one-shot shell commands for the agent loop. */

const ALLOWED_COMMANDS: readonly RegExp[] = [
  /^npm run (build|test|typecheck|lint|preview|dev)(\s|$)/i,
  /^npm test(\s|$)/i,
  /^npx tsc\b/i,
  /^npx vitest\b/i,
  /^npx eslint\b/i,
  /^git status\b/i,
  /^git diff\b/i,
  /^git log\b/i,
  /^node --version\b/i,
  /^npm --version\b/i,
];

const BLOCKED_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\b>\s*\//,
  /\|\s*sh\b/i,
  /&&\s*rm\b/i,
];

export function validateAgentCommand(
  command: string,
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const trimmed = command.trim();
  if (!trimmed) {
    return { ok: false, error: "Command is empty." };
  }
  if (trimmed.length > 240) {
    return { ok: false, error: "Command exceeds length limit." };
  }
  if (BLOCKED_PATTERNS.some((re) => re.test(trimmed))) {
    return {
      ok: false,
      error: "Command blocked by safety policy.",
    };
  }
  if (!ALLOWED_COMMANDS.some((re) => re.test(trimmed))) {
    return {
      ok: false,
      error: `Command not allowlisted: ${trimmed.split(/\s+/).slice(0, 3).join(" ")}`,
    };
  }
  return { ok: true };
}

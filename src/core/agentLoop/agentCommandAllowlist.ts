/** Allowlisted one-shot shell commands for the agent loop. Keep in sync with electron/terminalExec.cts. */

const ARG = String.raw`(?:\s+[\w.\-/=]+)`;

const ALLOWED_COMMANDS: readonly RegExp[] = [
  new RegExp(String.raw`^npm run (build|test|typecheck|lint|preview|dev)${ARG}*$`, "i"),
  new RegExp(String.raw`^npm test${ARG}*$`, "i"),
  new RegExp(String.raw`^npx tsc${ARG}*$`, "i"),
  new RegExp(String.raw`^npx vitest${ARG}*$`, "i"),
  new RegExp(String.raw`^npx eslint${ARG}*$`, "i"),
  new RegExp(String.raw`^git status${ARG}*$`, "i"),
  new RegExp(String.raw`^git diff${ARG}*$`, "i"),
  new RegExp(String.raw`^git log${ARG}*$`, "i"),
  /^node --version$/i,
  /^npm --version$/i,
];

const SHELL_META = /[;&|`$()<>\n\r]|&&|\|\||\$\(/;

const BLOCKED_PATTERNS: readonly RegExp[] = [
  SHELL_META,
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
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

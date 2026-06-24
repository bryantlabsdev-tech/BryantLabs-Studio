import type { AutoFixSession } from "@/core/autoFix/types";

export function formatAutoFixSummaryCopy(session: AutoFixSession): string {
  const lines = [
    "Autonomous Fix Loop — Summary",
    "==============================",
    "",
    "Original failure:",
    session.originalFailureLine,
    "",
    "Repair attempts:",
  ];

  if (session.attempts.length === 0) {
    lines.push("  (none)");
  } else {
    for (const a of session.attempts) {
      lines.push(
        `  Attempt ${a.attempt}: ${a.headline} — ${a.outcome}`,
        `    ${a.detail}`,
        a.filesTouched.length
          ? `    Files: ${a.filesTouched.join(", ")}`
          : "    Files: (none)",
      );
    }
  }

  lines.push(
    "",
    `Files changed by repair: ${
      session.filesChanged.length ? session.filesChanged.join(", ") : "(none)"
    }`,
    `Final outcome: ${session.finalOutcome ?? session.phase}`,
  );

  if (session.error) {
    lines.push("", `Error: ${session.error}`);
  }

  return lines.join("\n");
}

import {
  displayNameFromPrompt,
  suggestNextSteps,
} from "@/core/domain";

export interface AgentCompletionInput {
  readonly action: "created" | "edited" | "repaired" | "audited" | "improved";
  readonly subject?: string;
  readonly filesModified?: readonly string[];
  readonly typecheckPassed?: boolean;
  readonly buildPassed?: boolean;
  readonly previewReady?: boolean;
  readonly uiAuditPassed?: boolean;
  readonly suggestedNextSteps?: readonly string[];
}

function subjectLabel(subject?: string): string {
  if (!subject?.trim()) return "App";
  const s = subject.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function verificationPhrase(input: AgentCompletionInput): string {
  const parts: string[] = [];
  if (input.typecheckPassed === true) parts.push("TypeScript passed");
  else if (input.typecheckPassed === false) parts.push("TypeScript failed");
  if (input.buildPassed === true) parts.push("build passed");
  else if (input.buildPassed === false) parts.push("build failed");
  if (input.previewReady) parts.push("preview ready");
  else if (input.previewReady === false) parts.push("preview unavailable");
  if (input.uiAuditPassed === true) parts.push("UI audit passed");
  else if (input.uiAuditPassed === false) parts.push("UI audit failed");
  return parts.length > 0 ? parts.join(". ") + "." : "";
}

export function formatAgentCompletionMessage(input: AgentCompletionInput): string {
  const label = subjectLabel(input.subject);
  const verify = verificationPhrase(input);
  const fileCount = input.filesModified?.length ?? 0;

  let headline = "";
  switch (input.action) {
    case "created":
      headline = `Created ${label}. ${verify}`.trim();
      break;
    case "repaired":
      headline =
        fileCount > 0
          ? `Fixed issues in ${fileCount} file(s). ${verify}`.trim()
          : `Fixed project issues. ${verify}`.trim();
      break;
    case "audited":
      headline = `Completed project audit. ${verify}`.trim();
      break;
    case "improved":
      headline = `Improved ${label.toLowerCase()}. ${verify}`.trim();
      break;
    default:
      headline =
        fileCount > 0
          ? `Updated ${fileCount} file(s). ${verify}`.trim()
          : `Applied your changes. ${verify}`.trim();
      break;
  }

  const suggestions =
    input.suggestedNextSteps && input.suggestedNextSteps.length > 0
      ? ` Next: ${input.suggestedNextSteps.slice(0, 3).join(" · ")}.`
      : "";

  return `${headline}${suggestions}`.replace(/\.\s+\./g, ".").trim();
}

/** @deprecated Use displayNameFromPrompt from @/core/domain */
export function extractSubjectFromPrompt(prompt: string): string | undefined {
  const name = displayNameFromPrompt(prompt);
  return name === "App" ? undefined : name;
}

export function formatGreenfieldCompletionMessage(input: {
  prompt: string;
  typecheckPassed: boolean;
  buildPassed: boolean;
  previewReady: boolean;
  uiAuditPassed?: boolean;
  filesWritten: readonly string[];
}): string {
  const subject = displayNameFromPrompt(input.prompt);
  const suggestions = suggestNextSteps({
    prompt: input.prompt,
    runOutcome: "created",
  });
  return formatAgentCompletionMessage({
    action: "created",
    ...(subject !== "App" ? { subject } : {}),
    filesModified: input.filesWritten,
    typecheckPassed: input.typecheckPassed,
    buildPassed: input.buildPassed,
    previewReady: input.previewReady,
    ...(input.uiAuditPassed !== undefined
      ? { uiAuditPassed: input.uiAuditPassed }
      : {}),
    suggestedNextSteps: suggestions,
  });
}

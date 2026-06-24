import { parsePatchResponse, type PatchTargetFile } from "./aiPatch.cjs";

const OUTPUT_START = "@@PATCHED_FILE_START@@";
const OUTPUT_END = "@@PATCHED_FILE_END@@";

export interface AutoFixFailureDiagnostic {
  kind: string;
  file: string;
  line: number | null;
  column: number | null;
  message: string;
  code?: string;
}

export interface AutoFixContextPayload {
  originalRequest: string;
  planSummary: string;
  planSource: string;
  modifiedFiles: string[];
  diagnostics: AutoFixFailureDiagnostic[];
  primaryFailure: AutoFixFailureDiagnostic;
  attemptNumber: number;
  maxAttempts: number;
  intelligenceBlock?: string;
  strictFormat?: boolean;
  relatedTypeDefinitions?: string;
}

export function buildAutoFixPrompt(
  context: AutoFixContextPayload,
  file: PatchTargetFile,
  intelligenceBlock?: string,
): string {
  const lines = [
    "You are repairing a SINGLE file after Apply Plan introduced build or TypeScript errors.",
    "Fix ONLY what is required to resolve the listed diagnostics.",
    "Preserve the user's original intent and unrelated code.",
    "Do NOT rewrite the whole project or refactor unrelated areas.",
    "",
    "Respond in EXACTLY this format:",
    "1) JSON: { \"summary\": string, \"reasoning\": string, \"risks\": string[] }",
    "2) Complete fixed file between markers:",
    OUTPUT_START,
    "<entire file>",
    OUTPUT_END,
    "",
    "Rules:",
    "- Output the WHOLE file between markers (not a diff).",
    "- If the error is a missing import (e.g. Cannot find name 'useState'), add the correct import.",
    "- Touch no other files.",
    "- No markdown fences.",
  ];
  if (intelligenceBlock?.trim()) {
    lines.push("", intelligenceBlock.trim());
  }
  lines.push(
    "",
    "Original user request:",
    context.originalRequest,
    "",
    "Plan summary:",
    context.planSummary,
    "",
    `Attempt ${context.attemptNumber} of ${context.maxAttempts}`,
    "",
    "Files modified by Apply Plan:",
    context.modifiedFiles.join(", ") || "(none)",
    "",
    "Primary failure:",
    JSON.stringify(context.primaryFailure, null, 2),
    "",
    "All diagnostics (JSON):",
    JSON.stringify(context.diagnostics, null, 2),
    "",
    `Target file: ${file.path}`,
    "",
    "Current file content:",
    "--- CURRENT FILE BEGIN ---",
    file.content,
    "--- CURRENT FILE END ---",
  );
  return lines.join("\n");
}

export { parsePatchResponse as parseAutoFixResponse };

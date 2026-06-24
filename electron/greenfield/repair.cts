import type { AutoFixContextPayload } from "../providers/autoFix.cjs";
import type { PatchTargetFile } from "../providers/aiPatch.cjs";
import { parseGreenfieldRepairContent } from "./repairParse.cjs";

export function extractSurroundingLines(
  content: string,
  lineNumber: number,
  radius = 6,
): string {
  const lines = content.split("\n");
  const idx = Math.max(0, lineNumber - 1);
  const start = Math.max(0, idx - radius);
  const end = Math.min(lines.length, idx + radius + 1);
  return lines
    .slice(start, end)
    .map((line, i) => `${String(start + i + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

export function buildGreenfieldRepairProviderPrompt(
  context: AutoFixContextPayload,
  file: PatchTargetFile,
): string {
  const tsErrors = context.diagnostics
    .filter((d) => d.code?.startsWith("TS"))
    .map(
      (d) =>
        `${d.file}${d.line != null ? `:${d.line}` : ""}${d.column != null ? `:${d.column}` : ""} ${d.code ?? ""} — ${d.message}`.trim(),
    )
    .join("\n");

  const primary = context.primaryFailure;
  const primaryLine =
    primary?.line != null
      ? extractSurroundingLines(file.content, primary.line)
      : extractSurroundingLines(file.content, 1);

  const compact = !context.strictFormat;
  const typeDefs = context.relatedTypeDefinitions?.trim();

  const ts2345Hint =
    primary?.code === "TS2345" &&
    /\|\s*null/.test(primary.message) &&
    /parameter of type/.test(primary.message)
      ? [
          "",
          "TS2345 hint:",
          "- Add a null guard before the call (`if (value === null) return …`).",
          "- Or narrow with a local variable before passing to a non-null parameter.",
          "- Do NOT use non-null assertions unless unavoidable.",
        ].join("\n")
      : "";

  const strictBlock = context.strictFormat
    ? [
        "",
        "STRICT OUTPUT REQUIREMENT:",
        `- Return ONLY the complete corrected file in this exact format:`,
        `@@FILE:${file.path}@@`,
        "<entire corrected file>",
        `@@END:${file.path}@@`,
        "- No markdown fences.",
        "- No explanation outside the file block.",
        "- No partial snippets.",
      ].join("\n")
    : "";

  const sections = [
    "You are repairing a generated New App (greenfield) project.",
    "Fix ONLY compile errors required to pass TypeScript strict mode and build.",
    "Do NOT redesign the UI, add features, or refactor unrelated code.",
    "",
    "Respond with the COMPLETE updated target file using EXACTLY this format:",
    `@@FILE:${file.path}@@`,
    "<entire file content>",
    `@@END:${file.path}@@`,
    "",
    "Rules:",
    "- Output one file only — the target file below.",
    "- No markdown fences.",
    "- Array.find returns T | undefined; use `?? null` when props expect T | null.",
    ts2345Hint,
    strictBlock,
    "",
    `Attempt ${context.attemptNumber} of ${context.maxAttempts}`,
    "",
    "Original user request:",
    context.originalRequest,
  ];

  if (!compact) {
    sections.push(
      "",
      "Generated file list:",
      context.modifiedFiles.join(", "),
    );
  }

  sections.push(
    "",
    "Primary failure:",
    `${primary.file}:${primary.line}:${primary.column} ${primary.code ?? ""} — ${primary.message}`,
    "",
    "TypeScript errors:",
    tsErrors || primary.message,
  );

  if (typeDefs) {
    sections.push("", "Related type definitions:", typeDefs);
  }

  sections.push(
    "",
    `Target file: ${file.path}`,
    "",
    "Surrounding source lines:",
    primaryLine,
    "",
    "Current file content:",
    "--- CURRENT FILE BEGIN ---",
    file.content,
    "--- CURRENT FILE END ---",
  );

  return sections.filter(Boolean).join("\n");
}

/** Extract repaired content for a single path from a flexible AI response. */
export function parseGreenfieldRepairResponse(
  raw: string,
  expectedPath: string,
  originalContent?: string,
): string | null {
  return parseGreenfieldRepairContent(raw, expectedPath, originalContent);
}

import { extractJsonObject, type PlanContext } from "./aiPlan.cjs";

/**
 * AI patch *proposal* construction + parsing (Phase 8).
 *
 * The model proposes the complete updated content for ONE file. It does NOT
 * apply anything — the result is only diffed and displayed. The new content is
 * returned between unambiguous markers (not inside JSON) so that code with
 * braces/quotes/newlines survives transport without escaping issues.
 */

const OUTPUT_START = "@@PATCHED_FILE_START@@";
const OUTPUT_END = "@@PATCHED_FILE_END@@";
const LARGE_FILE_LINES = 500;

function prefersSearchReplacePatch(content: string): boolean {
  return content.split(/\r?\n/).length > LARGE_FILE_LINES;
}

function searchReplacePatchInstructions(): string[] {
  return [
    "For this LARGE file, use SEARCH/REPLACE blocks instead of rewriting the whole file.",
    "Between the markers, output one or more blocks in this exact format:",
    "",
    "<<<< SEARCH",
    "<exact lines to find>",
    "=======",
    "<replacement lines>",
    ">>>> REPLACE",
    "",
    "Rules:",
    "- SEARCH blocks must match the file exactly (including whitespace).",
    "- Use multiple blocks for separate edits.",
    "- Do not output the full file for large files.",
  ];
}

function fullFilePatchInstructions(): string[] {
  return [
    "Between the markers, output the WHOLE file (not a diff), ready to save.",
    "- Preserve unrelated code exactly as-is.",
    "- Do not wrap the file content in markdown fences.",
  ];
}

export interface PatchSymbol {
  name: string;
  kind: string;
}

export interface PatchTargetFile {
  path: string;
  content: string;
}

export interface AIPatchProposal {
  summary: string;
  newContent: string;
  reasoning: string;
  risks: string[];
}

export interface PlanPatchMeta {
  planSummary: string;
  fileReason: string;
}

export function buildPlanFilePatchPrompt(
  userPrompt: string,
  context: PlanContext,
  file: PatchTargetFile,
  symbols: PatchSymbol[],
  planMeta: PlanPatchMeta,
): string {
  const symbolList =
    symbols.length > 0
      ? symbols.map((s) => `${s.kind} ${s.name}`).join(", ")
      : "none";
  const useSearchReplace = prefersSearchReplacePatch(file.content);
  return [
    "You are applying an approved modification PLAN to a SINGLE file.",
    "Implement the user request using the plan reasoning below.",
    "Do not modify any other file.",
    "",
    "Respond in EXACTLY this format and nothing else:",
    "1) A single JSON object with keys: summary (string), reasoning (string), risks (array of strings).",
    useSearchReplace
      ? "2) Then SEARCH/REPLACE patch blocks between the two markers."
      : "2) Then the COMPLETE updated file content between the two markers.",
    "",
    '{ "summary": "...", "reasoning": "...", "risks": ["..."] }',
    OUTPUT_START,
    useSearchReplace
      ? "<SEARCH/REPLACE blocks or full file if needed>"
      : "<the entire updated file content goes here>",
    OUTPUT_END,
    "",
    "Rules:",
    ...useSearchReplace ? searchReplacePatchInstructions() : fullFilePatchInstructions(),
    "",
    "Plan summary:",
    planMeta.planSummary,
    "",
    "Why this file is in the plan:",
    planMeta.fileReason,
    "",
    "User request:",
    userPrompt,
    "",
    `Target file: ${file.path}`,
    `Relevant symbols: ${symbolList}`,
    "",
    "Project context (JSON):",
    JSON.stringify(context),
    "",
    "Current file content:",
    "--- CURRENT FILE BEGIN ---",
    file.content,
    "--- CURRENT FILE END ---",
  ].join("\n");
}

export function buildPatchPrompt(
  userPrompt: string,
  context: PlanContext,
  file: PatchTargetFile,
  symbols: PatchSymbol[],
): string {
  const symbolList =
    symbols.length > 0
      ? symbols.map((s) => `${s.kind} ${s.name}`).join(", ")
      : "none";
  const useSearchReplace = prefersSearchReplacePatch(file.content);
  return [
    "You are proposing a patch to a SINGLE file. Do not modify any other file.",
    "You are NOT applying changes — only proposing updated content for review.",
    "",
    "Respond in EXACTLY this format and nothing else:",
    "1) A single JSON object with keys: summary (string), reasoning (string), risks (array of strings).",
    useSearchReplace
      ? "2) Then SEARCH/REPLACE patch blocks between the two markers."
      : "2) Then the COMPLETE updated file content between the two markers.",
    "",
    '{ "summary": "...", "reasoning": "...", "risks": ["..."] }',
    OUTPUT_START,
    useSearchReplace
      ? "<SEARCH/REPLACE blocks or full file if needed>"
      : "<the entire updated file content goes here>",
    OUTPUT_END,
    "",
    "Rules:",
    ...useSearchReplace ? searchReplacePatchInstructions() : [
      "- Between the markers, output the WHOLE file (not a diff), ready to save.",
      "- Preserve all unrelated code exactly as-is.",
      "- Do not wrap the file content in markdown fences.",
      "- risks lists concerns/side effects; use [] if none.",
    ],
    "",
    "User request:",
    userPrompt,
    "",
    `Target file: ${file.path}`,
    `Relevant symbols in this file: ${symbolList}`,
    "",
    "Project context (JSON):",
    JSON.stringify(context),
    "",
    "Current file content (for reference only):",
    "--- CURRENT FILE BEGIN ---",
    file.content,
    "--- CURRENT FILE END ---",
  ].join("\n");
}

function trimEdgeNewline(text: string): string {
  return text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

export function parsePatchResponse(text: string): AIPatchProposal | null {
  const start = text.indexOf(OUTPUT_START);
  const end = text.indexOf(OUTPUT_END, start + OUTPUT_START.length);
  if (start === -1 || end === -1) return null;

  const newContent = trimEdgeNewline(
    text.slice(start + OUTPUT_START.length, end),
  );

  // Metadata is best-effort, parsed from the text *before* the file content so
  // that braces inside the code can't interfere.
  let summary = "";
  let reasoning = "";
  let risks: string[] = [];
  const jsonText = extractJsonObject(text.slice(0, start));
  if (jsonText) {
    try {
      const obj = JSON.parse(jsonText) as Record<string, unknown>;
      if (typeof obj.summary === "string") summary = obj.summary;
      if (typeof obj.reasoning === "string") reasoning = obj.reasoning;
      if (Array.isArray(obj.risks)) {
        risks = obj.risks.filter((r): r is string => typeof r === "string");
      }
    } catch {
      // Leave metadata empty; the patch content is what matters.
    }
  }

  return { summary, newContent, reasoning, risks };
}

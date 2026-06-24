/** Electron copy — keep in sync with src/core/planApply/applyPlanPrompt.ts */

import { normalizeApplyPlanPath } from "./markedFileParse.cjs";

export type ApplyPlanPromptMode = "standard" | "repair" | "directRewrite";

export interface ApplyPlanPromptFile {
  readonly path: string;
  readonly content: string;
}

export interface BuildApplyPlanBatchPromptInput {
  readonly userPrompt: string;
  readonly planSummary: string;
  readonly files: readonly ApplyPlanPromptFile[];
  readonly mode: ApplyPlanPromptMode;
  readonly previousModelOutput?: string;
  readonly repairMissingPaths?: readonly string[];
  readonly projectHint?: string;
  readonly intelligenceBlock?: string;
  readonly contextNotes?: string;
  readonly uiEditMode?: boolean;
  readonly appClassNames?: readonly string[];
}

export function buildApplyPlanOutputContract(paths: readonly string[]): string {
  const blocks = paths
    .map(
      (p) =>
        `@@FILE:${p}\n<full updated ${p} content>\n@@END`,
    )
    .join("\n\n");

  return [
    "RETURN ONLY FULL UPDATED FILES.",
    "NO markdown.",
    "NO explanation.",
    "NO diff.",
    "NO prose.",
    "",
    "For each file, use:",
    "",
    blocks,
  ].join("\n");
}

function formatCurrentFileSections(
  files: readonly ApplyPlanPromptFile[],
  opts?: { uiEditMode?: boolean; appClassNames?: readonly string[] },
): string {
  return files
    .map((f) => {
      const path = normalizeApplyPlanPath(f.path);
      if (
        opts?.uiEditMode &&
        path === "src/App.tsx" &&
        opts.appClassNames &&
        opts.appClassNames.length > 0 &&
        !f.content.includes("structure summary")
      ) {
        return [
          `--- ${path} (class names) ---`,
          opts.appClassNames.join(", "),
          `--- end ${path} ---`,
        ].join("\n");
      }
      return `--- ${path} (current) ---\n${f.content}\n--- end ${path} ---`;
    })
    .join("\n\n");
}

export function buildApplyPlanBatchPatchPrompt(
  input: BuildApplyPlanBatchPromptInput,
): string {
  const paths = input.files.map((f) => normalizeApplyPlanPath(f.path));
  const contractPaths =
    input.repairMissingPaths && input.repairMissingPaths.length > 0
      ? input.repairMissingPaths.map((p) => normalizeApplyPlanPath(p))
      : paths;
  const contract = buildApplyPlanOutputContract(contractPaths);
  const fileSections = formatCurrentFileSections(input.files, {
    ...(input.uiEditMode ? { uiEditMode: true } : {}),
    ...(input.appClassNames ? { appClassNames: input.appClassNames } : {}),
  });
  const pathList = paths.join(" and ");

  if (input.mode === "directRewrite") {
    return [
      contract,
      "",
      `Rewrite only ${pathList}. Return only @@FILE blocks.`,
      "",
      "Current file contents:",
      fileSections,
      "",
      contract,
    ].join("\n");
  }

  if (input.mode === "repair") {
    const requiredPaths = contractPaths;
    return [
      contract,
      "",
      "REPAIR: Your previous response was not in the required @@FILE format.",
      "Convert the invalid model response below into the exact @@FILE format shown above.",
      "Use the original file contents and the user request to produce full updated files.",
      "",
      "Required file paths:",
      requiredPaths.map((p) => `- ${p}`).join("\n"),
      "",
      "Invalid model response (convert this):",
      "--- MODEL OUTPUT BEGIN ---",
      input.previousModelOutput?.trim() || "(empty response)",
      "--- MODEL OUTPUT END ---",
      "",
      "Original file contents:",
      fileSections,
      "",
      "User request:",
      input.userPrompt,
      "",
      "Plan summary:",
      input.planSummary,
      "",
      contract,
    ].join("\n");
  }

  const middle: string[] = [
    "Apply the user request to the files listed below. Do not modify any other files.",
    "",
    "User request:",
    input.userPrompt,
    "",
    "Plan summary:",
    input.planSummary,
  ];

  if (input.projectHint?.trim()) {
    middle.push("", "Project:", input.projectHint.trim());
  }

  if (input.contextNotes?.trim()) {
    middle.push("", input.contextNotes.trim());
  } else if (input.intelligenceBlock?.trim()) {
    middle.push("", input.intelligenceBlock.trim());
  }

  middle.push("", "Current file contents:", fileSections, "", contract);

  return [contract, "", ...middle].join("\n");
}

export function filterDirectRewriteFiles(
  files: readonly ApplyPlanPromptFile[],
): ApplyPlanPromptFile[] {
  const allowed = new Set(["src/App.tsx", "src/index.css"]);
  return files.filter((f) => allowed.has(normalizeApplyPlanPath(f.path)));
}

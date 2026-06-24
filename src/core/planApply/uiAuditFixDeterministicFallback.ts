import {
  parseUiAuditAdvisoryFixPrompt,
  type UiAuditAdvisoryFixInput,
} from "@/core/agent/uiAuditAdvisoryUx";
import { buildUiRepairPatches } from "@/core/greenfield/uiAudit/repair";
import type { UiAuditLayoutType } from "@/core/greenfield/uiAudit/types";
import { appendCssBlock } from "@/core/greenfield/uiAudit/repair/sharedCss";
import type { UiAuditResult } from "@/core/greenfield/uiAudit";

const ROWS_OVERFLOW_CSS = `@media (max-width: 768px) {
  .table-container,
  .comparison-table,
  table {
    display: block;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  thead,
  tbody,
  tr {
    width: max-content;
    min-width: 100%;
  }
}`;

export interface UiAuditFixDeterministicResult {
  readonly ok: boolean;
  readonly files: Record<string, string>;
  readonly plan: string;
  readonly strategy: string;
}

function resolveLayoutType(
  prompt: string,
  uiAuditResult: UiAuditResult | null | undefined,
): UiAuditLayoutType | "unclassified" {
  const parsed = parseUiAuditAdvisoryFixPrompt(prompt);
  const fromPrompt = parsed?.layoutType;
  if (fromPrompt && fromPrompt !== "unclassified") {
    return fromPrompt as UiAuditLayoutType;
  }
  if (uiAuditResult?.type) return uiAuditResult.type;
  return "unclassified";
}

function resolveIssues(
  prompt: string,
  uiAuditResult: UiAuditResult | null | undefined,
): readonly string[] {
  const parsed = parseUiAuditAdvisoryFixPrompt(prompt);
  if (parsed?.issues.length) return parsed.issues;
  return uiAuditResult?.issues ?? [];
}

function applyIssueSpecificCss(
  cssSource: string,
  issues: readonly string[],
): string {
  let next = cssSource;
  if (issues.includes("rows_overflow")) {
    next = appendCssBlock(next, ROWS_OVERFLOW_CSS, "ui-audit:rows-overflow-scroll");
  }
  return next;
}

/** Deterministic patch proposals for UI audit advisory fixes when coder AI is unavailable. */
export function buildUiAuditFixDeterministicPatches(input: {
  readonly prompt: string;
  readonly appTsx?: string | null;
  readonly indexCss?: string | null;
  readonly uiAuditResult?: UiAuditResult | null;
}): UiAuditFixDeterministicResult | null {
  const parsed = parseUiAuditAdvisoryFixPrompt(input.prompt);
  if (!parsed && !input.uiAuditResult) return null;

  const layoutType = resolveLayoutType(input.prompt, input.uiAuditResult);
  const issues = resolveIssues(input.prompt, input.uiAuditResult);
  const cssSource = input.indexCss ?? null;
  if (!cssSource?.trim()) return null;

  const repairedCss = applyIssueSpecificCss(cssSource, issues);
  const repair = buildUiRepairPatches(layoutType, input.appTsx ?? null, repairedCss);

  const files: Record<string, string> = {};
  for (const patch of repair.patches) {
    files[patch.relPath] = patch.content;
  }

  if (!files["src/index.css"] && repairedCss !== cssSource) {
    files["src/index.css"] = repairedCss;
  }

  if (Object.keys(files).length === 0) return null;

  const advisory: UiAuditAdvisoryFixInput =
    parsed ??
    ({
      layoutType,
      score: input.uiAuditResult?.score ?? 0,
      issues,
      recommendations: [],
    } as UiAuditAdvisoryFixInput);

  return {
    ok: true,
    files,
    strategy: repair.strategy,
    plan: `Deterministic UI audit fix (${advisory.layoutType}${issues.length ? ` · ${issues.join(", ")}` : ""}).`,
  };
}

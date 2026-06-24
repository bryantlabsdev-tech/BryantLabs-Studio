import { parseMissingPropertyError } from "@/core/typescript/missingPropertyRepair";
import { setupHasQuickRepairableErrors } from "@/core/greenfield/quickRepair";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import type { StressFailureClass, StressImprovementSuggestion } from "./types";
import { FAILURE_CLASS_LABELS } from "./failureClassification";
import { matchDeterministicRepairCandidate } from "./deterministicRepairCatalog";
import { classifyTs1109, ts1109RepairLabel, ts1109StudioFix } from "./ts1109Classification";

export interface ImprovementInput {
  readonly failureClass: StressFailureClass;
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly repairExhausted: boolean;
  readonly deterministicPasses: number;
  readonly primaryErrorLine: string | null;
  readonly llmAttempts: number;
  /** `${file}:${line}` → source line for accurate TS1109 classification */
  readonly lineSnippets?: Readonly<Record<string, string>>;
}

function lineSnippetKey(file: string, line: number): string {
  return `${file.replace(/\\/g, "/")}:${line}`;
}

function catalogForDiagnostic(
  diagnostic: TypeScriptDiagnostic,
  lineSnippets?: Readonly<Record<string, string>>,
) {
  const snippet =
    lineSnippets?.[lineSnippetKey(diagnostic.file, diagnostic.line)] ?? null;
  return matchDeterministicRepairCandidate(diagnostic, { lineContent: snippet });
}

export function buildImprovementSuggestions(
  input: ImprovementInput,
): StressImprovementSuggestion[] {
  const suggestions: StressImprovementSuggestion[] = [];
  const primary = input.diagnostics[0] ?? null;

  if (primary) {
    const missing = parseMissingPropertyError(primary.code, primary.message);
    const catalog = catalogForDiagnostic(primary, input.lineSnippets);
    const ts1109Kind =
      primary.code === "TS1109"
        ? classifyTs1109(
            input.lineSnippets?.[lineSnippetKey(primary.file, primary.line)] ?? null,
          )
        : null;
    suggestions.push({
      rootCause: missing
        ? `Object literal missing required ${missing.typeName} fields: ${missing.missingProps.join(", ")}`
        : ts1109Kind === "truncated_literal"
          ? `Truncated generated literal at ${primary.file}:${primary.line} — ${primary.message}`
          : ts1109Kind === "marker_artifact"
            ? `Leaked @@ marker artifact at ${primary.file}:${primary.line} — ${primary.message}`
            : `${primary.code ?? "error"} at ${primary.file}:${primary.line} — ${primary.message}`,
      file: primary.file,
      line: primary.line,
      column: primary.column,
      whyRepairFailed: input.repairExhausted
        ? `Deterministic repair ran ${input.deterministicPasses} pass(es); ${input.llmAttempts} LLM attempt(s) did not clear errors.`
        : input.deterministicPasses === 0
          ? "No deterministic repair pattern matched before failure."
          : null,
      deterministicRepairCandidate:
        catalog?.label ??
        (ts1109Kind ? ts1109RepairLabel(ts1109Kind) : null),
      llmRepairNecessary: !catalog?.available && !setupHasQuickRepairableErrors(input.diagnostics),
      recommendedStudioFix:
        catalog?.studioFix ??
        (ts1109Kind ? ts1109StudioFix(ts1109Kind) : studioFixForClass(input.failureClass)),
    });
  } else if (input.primaryErrorLine) {
    suggestions.push({
      rootCause: input.primaryErrorLine,
      file: "",
      line: null,
      column: null,
      whyRepairFailed: input.repairExhausted ? "Repair attempts exhausted." : null,
      deterministicRepairCandidate: null,
      llmRepairNecessary: true,
      recommendedStudioFix: studioFixForClass(input.failureClass),
    });
  }

  for (const diagnostic of input.diagnostics.slice(1, 4)) {
    const catalog = catalogForDiagnostic(diagnostic, input.lineSnippets);
    if (!catalog) continue;
    suggestions.push({
      rootCause: `${diagnostic.code} — ${diagnostic.message}`,
      file: diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
      whyRepairFailed: null,
      deterministicRepairCandidate: catalog.label,
      llmRepairNecessary: !catalog.available,
      recommendedStudioFix: catalog.studioFix,
    });
  }

  return suggestions;
}

function studioFixForClass(failureClass: StressFailureClass): string {
  switch (failureClass) {
    case "missing_required_type_fields":
      return "Extend missingPropertyRepair to cover more nested object literals and array element shapes.";
    case "bad_imports":
      return "Strengthen greenfield import scaffolding in phased prompts and add TS2307 path-alias repair.";
    case "unused_imports_types":
      return "Run unusedCleanup quick repair earlier in the greenfield repair loop.";
    case "router_layout_errors":
      return "Apply sanitizeAppIntegration post-generation and add react-router import repair.";
    case "localstorage_shape_mismatch":
      return "Emit typed useLocalStorage hook in shared phase and add JSON.parse fallback repair.";
    case "invalid_jsx":
      return "Tighten TSX sanitizer and JSX fragment rules in page-phase prompts.";
    case "missing_files":
      return "Improve multi-phase stub recovery and marker parse repair for missing page files.";
    case "broken_crud_flow":
      return "Add CRUD checklist to page-phase prompts and verify handler wiring in UI audit.";
    case "broken_chart_data_dependency":
      return "Stub chart data in shared types and validate chart props in quick repair.";
    case "build_config_issue":
      return "Harden configRepair for tsconfig/vite/package.json references.";
    case "timeout":
      return "Increase greenfield timeout budget or reduce per-phase output token limits.";
    case "repair_exhausted":
      return "Expand deterministic repair catalog before escalating to LLM repair.";
    case "ui_audit_failure":
      return "Run deterministic UI repair patches before marking greenfield success.";
    case "generation_failed":
      return "Improve multi-phase routing and manifest extraction for complex SaaS prompts.";
    default:
      return `Investigate ${FAILURE_CLASS_LABELS[failureClass]} failures in stress telemetry.`;
  }
}

export function summarizeFixNeeded(
  suggestions: readonly StressImprovementSuggestion[],
  failureClass: StressFailureClass,
): string {
  const primary = suggestions[0];
  if (primary?.deterministicRepairCandidate) {
    return primary.deterministicRepairCandidate;
  }
  if (primary?.recommendedStudioFix) {
    return primary.recommendedStudioFix;
  }
  return FAILURE_CLASS_LABELS[failureClass];
}

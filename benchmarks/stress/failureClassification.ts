import { parseMissingPropertyError } from "@/core/typescript/missingPropertyRepair";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import type { StressFailureClass } from "./types";

export interface FailureClassificationInput {
  readonly generationOk: boolean;
  readonly installOk: boolean;
  readonly typecheckOk: boolean;
  readonly buildOk: boolean;
  readonly uiAuditOk: boolean;
  readonly timedOut: boolean;
  readonly repairExhausted: boolean;
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly buildOutput: string;
  readonly generationError: string | null;
  readonly missingFiles: readonly string[];
  readonly uiAuditIssues: readonly string[];
}

export function classifyStressFailure(input: FailureClassificationInput): StressFailureClass {
  if (input.timedOut) return "timeout";
  if (!input.generationOk) return "generation_failed";
  if (input.missingFiles.length > 0) return "missing_files";
  if (input.repairExhausted) return "repair_exhausted";
  if (!input.uiAuditOk && input.typecheckOk && input.buildOk) return "ui_audit_failure";

  for (const d of input.diagnostics) {
    if (parseMissingPropertyError(d.code, d.message)) return "missing_required_type_fields";
    if (d.code === "TS2307" || /cannot find module/i.test(d.message)) return "bad_imports";
    if (d.code === "TS6133") return "unused_imports_types";
    if (d.code === "TS2304" && /cannot find name/i.test(d.message)) {
      if (/Route|Routes|Link|NavLink|Outlet|BrowserRouter/i.test(d.message)) {
        return "router_layout_errors";
      }
      return "bad_imports";
    }
    if (/BrowserRouter|react-router|Route|Routes/i.test(d.message)) return "router_layout_errors";
    if (/JSX|TS17004|TS2607|TS2741/i.test(d.message) && /jsx/i.test(d.message)) {
      return "invalid_jsx";
    }
    if (/localStorage|JSON\.parse/i.test(d.message)) return "localstorage_shape_mismatch";
    if (/chart|recharts|data/i.test(d.message) && /not assignable|undefined/i.test(d.message)) {
      return "broken_chart_data_dependency";
    }
    if (/CRUD|filter|map\(|setState/i.test(d.message)) return "broken_crud_flow";
  }

  const hay = `${input.buildOutput}\n${input.diagnostics.map((d) => d.message).join("\n")}`;
  if (/tsconfig|vite\.config|package\.json|postcss/i.test(hay)) return "build_config_issue";
  if (!input.typecheckOk) return "unknown";
  if (!input.buildOk) return "build_config_issue";
  return "unknown";
}

export const FAILURE_CLASS_LABELS: Record<StressFailureClass, string> = {
  missing_required_type_fields: "Missing required type fields",
  bad_imports: "Bad imports",
  unused_imports_types: "Unused imports/types",
  router_layout_errors: "Router/layout errors",
  localstorage_shape_mismatch: "localStorage shape mismatch",
  invalid_jsx: "Invalid JSX",
  missing_files: "Missing files",
  broken_crud_flow: "Broken CRUD flow",
  broken_chart_data_dependency: "Broken chart/data dependency",
  build_config_issue: "Build config issue",
  timeout: "Timeout",
  repair_exhausted: "Repair exhausted",
  ui_audit_failure: "UI audit failure",
  generation_failed: "Generation failed",
  unknown: "Unknown",
};

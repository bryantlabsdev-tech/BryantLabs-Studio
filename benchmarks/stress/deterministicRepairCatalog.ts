import { parseMissingPropertyError } from "@/core/typescript/missingPropertyRepair";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";
import type { StressFailureClass } from "./types";
import {
  classifyTs1109,
  ts1109RepairLabel,
  ts1109StudioFix,
} from "./ts1109Classification";

export interface DeterministicRepairCandidate {
  readonly id: string;
  readonly label: string;
  readonly codes: readonly string[];
  readonly failureClasses: readonly StressFailureClass[];
  readonly available: boolean;
  readonly studioFix: string;
}

export const DETERMINISTIC_REPAIR_CATALOG: readonly DeterministicRepairCandidate[] = [
  {
    id: "missing_object_properties",
    label: "Add missing required object properties (TS2739/TS2741/TS2322)",
    codes: ["TS2739", "TS2741", "TS2322"],
    failureClasses: ["missing_required_type_fields"],
    available: true,
    studioFix: "missingPropertyRepair patches object literals from imported type definitions.",
  },
  {
    id: "unused_symbols",
    label: "Remove or prefix unused imports/locals (TS6133)",
    codes: ["TS6133"],
    failureClasses: ["unused_imports_types"],
    available: true,
    studioFix: "unusedCleanup quick repair in greenfield repair loop.",
  },
  {
    id: "missing_react_hooks",
    label: "Add missing React hook imports (TS2304 use*)",
    codes: ["TS2304"],
    failureClasses: ["bad_imports"],
    available: true,
    studioFix: "ensureReactHookImports in quickRepair.",
  },
  {
    id: "missing_router_imports",
    label: "Add missing react-router-dom imports (Route/Routes/Link)",
    codes: ["TS2304", "TS2307"],
    failureClasses: ["router_layout_errors", "bad_imports"],
    available: true,
    studioFix: "ensureReactRouterImports in greenfieldQuickFixes.",
  },
  {
    id: "duplicate_browser_router",
    label: "Remove nested BrowserRouter from App.tsx",
    codes: ["TS2607", "TS2786"],
    failureClasses: ["router_layout_errors"],
    available: true,
    studioFix: "sanitizeAppIntegration applied in quick repair for App.tsx.",
  },
  {
    id: "null_guard_calls",
    label: "Add null guard before nullable call arguments (TS2345)",
    codes: ["TS2345"],
    failureClasses: ["broken_crud_flow", "broken_chart_data_dependency"],
    available: true,
    studioFix: "TS2345 null-guard quick repair.",
  },
  {
    id: "union_literal_default",
    label: "Coerce incorrect union literal values (TS2322)",
    codes: ["TS2322"],
    failureClasses: ["missing_required_type_fields"],
    available: true,
    studioFix: "defaultValueForProperty uses first union literal from type definition.",
  },
  {
    id: "localstorage_parse_fallback",
    label: "Wrap localStorage JSON.parse with fallback",
    codes: ["TS2345", "TS2322"],
    failureClasses: ["localstorage_shape_mismatch"],
    available: true,
    studioFix: "fixLocalStorageParseFallback in greenfieldQuickFixes.",
  },
  {
    id: "invalid_prop_rename",
    label: "Apply typo suggestion for invalid prop names (TS2552)",
    codes: ["TS2552", "TS2339"],
    failureClasses: ["broken_crud_flow"],
    available: true,
    studioFix: "TS2552 Did-you-mean quick repair.",
  },
  {
    id: "marker_artifact_strip",
    label: "Strip leaked greenfield marker artifacts (TS1109)",
    codes: ["TS1109"],
    failureClasses: ["invalid_jsx", "generation_failed"],
    available: true,
    studioFix: "markerContentSanitizer at parse time + quickRepair for @@FILE/@@END leakage.",
  },
  {
    id: "truncated_literal_repair",
    label: "Repair truncated mock/array literal (TS1109)",
    codes: ["TS1109"],
    failureClasses: ["invalid_jsx", "generation_failed"],
    available: false,
    studioFix: "Generation validator for incomplete literals; truncation repair pass (Phase 1).",
  },
  {
    id: "ts1109_unknown",
    label: "Investigate TS1109 syntax corruption",
    codes: ["TS1109"],
    failureClasses: ["invalid_jsx", "generation_failed"],
    available: false,
    studioFix: "Inspect generated source for syntax corruption before repair escalation.",
  },
];

export function matchDeterministicRepairCandidate(
  diagnostic: TypeScriptDiagnostic,
  context?: { readonly lineContent?: string | null },
): DeterministicRepairCandidate | null {
  if (parseMissingPropertyError(diagnostic.code, diagnostic.message)) {
    return DETERMINISTIC_REPAIR_CATALOG.find((c) => c.id === "missing_object_properties") ?? null;
  }
  if (diagnostic.code === "TS1109") {
    const kind = classifyTs1109(context?.lineContent);
    if (kind === "marker_artifact") {
      return DETERMINISTIC_REPAIR_CATALOG.find((c) => c.id === "marker_artifact_strip") ?? null;
    }
    if (kind === "truncated_literal") {
      return DETERMINISTIC_REPAIR_CATALOG.find((c) => c.id === "truncated_literal_repair") ?? null;
    }
    return DETERMINISTIC_REPAIR_CATALOG.find((c) => c.id === "ts1109_unknown") ?? null;
  }
  for (const candidate of DETERMINISTIC_REPAIR_CATALOG) {
    if (!candidate.codes.includes(diagnostic.code)) continue;
    if (candidate.id.startsWith("marker_artifact") || candidate.id.startsWith("truncated_literal") || candidate.id === "ts1109_unknown") {
      continue;
    }
    if (candidate.id === "missing_react_hooks") {
      const sym = diagnostic.message.match(/Cannot find name '([^']+)'/)?.[1];
      if (!sym || !/^use[A-Z]/.test(sym)) continue;
    }
    if (candidate.id === "missing_router_imports") {
      const sym = diagnostic.message.match(/Cannot find name '([^']+)'/)?.[1];
      if (sym && !/^(Route|Routes|Link|NavLink|Outlet|BrowserRouter|useNavigate|useParams)$/.test(sym)) {
        continue;
      }
    }
    return candidate;
  }
  return null;
}

export function aggregateDeterministicOpportunities(
  diagnostics: readonly TypeScriptDiagnostic[],
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of diagnostics) {
    const match = matchDeterministicRepairCandidate(d);
    if (!match?.available) continue;
    counts.set(match.label, (counts.get(match.label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

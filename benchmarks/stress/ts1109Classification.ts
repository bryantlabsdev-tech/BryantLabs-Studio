import { contentHasMarkerArtifacts } from "@/core/greenfield/markerContentSanitizer";

export type Ts1109Kind = "marker_artifact" | "truncated_literal" | "unknown";

/** Distinguish @@ marker leakage from truncated array/object literals (common in live stress). */
export function classifyTs1109(lineContent: string | null | undefined): Ts1109Kind {
  const line = (lineContent ?? "").trim();
  if (!line) return "unknown";
  if (contentHasMarkerArtifacts(line)) return "marker_artifact";
  if (/\{[^}]*\.\.\.(?:\s*[,}\]]|$)/.test(line)) return "truncated_literal";
  if (/^\s*\{[^}]*\.\.\.\s*$/.test(line)) return "truncated_literal";
  if (/\.\.\.(?:\s*[,}\]]|$)/.test(line)) return "truncated_literal";
  return "unknown";
}

export function ts1109RepairLabel(kind: Ts1109Kind): string {
  switch (kind) {
    case "marker_artifact":
      return "Strip leaked greenfield marker artifacts (TS1109)";
    case "truncated_literal":
      return "Repair truncated mock/array literal (TS1109)";
    default:
      return "Investigate TS1109 syntax corruption";
  }
}

export function ts1109StudioFix(kind: Ts1109Kind): string {
  switch (kind) {
    case "marker_artifact":
      return "markerContentSanitizer at parse time + quickRepair for @@FILE/@@END leakage.";
    case "truncated_literal":
      return "Generation validator for incomplete literals; truncation repair pass (Phase 1).";
    default:
      return "Inspect generated source for syntax corruption before repair escalation.";
  }
}

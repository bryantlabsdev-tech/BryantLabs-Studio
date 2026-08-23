import type {
  EditPhaseFileAssignment,
  EditPhaseFileRole,
  PatchCompletenessEntry,
  PatchCompletenessResult,
} from "@/core/editPhases/types";

export interface ProposedPhasePatch {
  readonly relPath: string;
  readonly newContent: string | null;
  readonly truncated?: boolean;
}

export function detectTruncatedProviderResponse(rawText: string | null | undefined): boolean {
  if (rawText == null) return false;
  const text = rawText;
  if (!text.trim()) return false;
  if (/\[truncated\]|output.?truncated|max.?tokens|finish_reason["']?\s*:\s*["']?length/i.test(text)) {
    return true;
  }
  // Unclosed @@FILE block
  const opens = (text.match(/@@FILE\s+/gi) ?? []).length;
  const closes = (text.match(/@@END(?:_FILE)?/gi) ?? []).length;
  if (opens > 0 && closes < opens) return true;
  return false;
}

/**
 * Evaluate patches against the current phase assignment.
 * Optional targets may be unchanged without failing the phase.
 * Newly discovered paths are deferred, not treated as required failures.
 */
export function evaluatePhasePatchCompleteness(input: {
  readonly assigned: readonly EditPhaseFileAssignment[];
  readonly patches: readonly ProposedPhasePatch[];
  readonly rawProviderText?: string | null;
  readonly allowDiscovered?: boolean;
}): PatchCompletenessResult {
  const truncated =
    Boolean(input.patches.some((p) => p.truncated)) ||
    detectTruncatedProviderResponse(input.rawProviderText);

  const assignedByPath = new Map(input.assigned.map((a) => [a.relPath, a]));
  const patchByPath = new Map(input.patches.map((p) => [p.relPath, p]));

  const entries: PatchCompletenessEntry[] = [];
  const missingRequired: string[] = [];
  const optionalUnchanged: string[] = [];
  const discoveredDependencies: string[] = [];

  for (const assignment of input.assigned) {
    const patch = patchByPath.get(assignment.relPath);
    const hasPatch = Boolean(patch?.newContent && patch.newContent.length > 0);
    let role: EditPhaseFileRole = assignment.role;

    if (assignment.role === "required" && !hasPatch) {
      role = "rejected_or_missing";
      missingRequired.push(assignment.relPath);
      entries.push({
        relPath: assignment.relPath,
        role,
        hasPatch: false,
        reason: truncated
          ? "Required file missing — provider response appears truncated"
          : "Required file missing a patch",
      });
      continue;
    }

    if (assignment.role === "optional" && !hasPatch) {
      optionalUnchanged.push(assignment.relPath);
      entries.push({
        relPath: assignment.relPath,
        role: "optional",
        hasPatch: false,
        reason: "Optional target unchanged — not a failure",
      });
      continue;
    }

    entries.push({
      relPath: assignment.relPath,
      role,
      hasPatch,
      reason: hasPatch ? "Patch present" : assignment.reason,
    });
  }

  for (const patch of input.patches) {
    if (assignedByPath.has(patch.relPath)) continue;
    if (!patch.newContent) continue;
    discoveredDependencies.push(patch.relPath);
    entries.push({
      relPath: patch.relPath,
      role: "discovered_dependency",
      hasPatch: true,
      reason: "Newly discovered dependency — defer to a later phase",
    });
  }

  // Discovered dependencies do not fail the phase — they are deferred.
  const finalOk = !truncated && missingRequired.length === 0;

  return {
    ok: finalOk,
    entries,
    missingRequired,
    optionalUnchanged,
    discoveredDependencies,
    truncatedResponse: truncated,
    error: !finalOk
      ? truncated
        ? "Provider response truncated before all required files were emitted"
        : `Missing required patches: ${missingRequired.join(", ")}`
      : null,
  };
}

export function deferDiscoveredDependencies(
  discovered: readonly string[],
): EditPhaseFileAssignment[] {
  return discovered.map((relPath) => ({
    relPath,
    role: "discovered_dependency" as const,
    reason: "Discovered during earlier phase — schedule later",
    acceptanceCriteria: `Integrate dependency ${relPath}`,
  }));
}

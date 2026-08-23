import {
  CHARS_PER_TOKEN,
  MAX_FILES_PER_EDIT_PHASE,
  SAFE_PHASE_OUTPUT_TOKEN_BUDGET,
  type EditPhaseFileAssignment,
  type EditPhasePlan,
  type EditPhaseRuntimeState,
  type EditPhaseSpec,
} from "@/core/editPhases/types";

export function estimateTokensFromChars(chars: number): number {
  return Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN));
}

export function estimatePhaseOutputTokens(
  files: readonly { relPath: string; contentChars?: number }[],
): number {
  // Rough: expect ~40% of input file content as patch output, plus framing.
  const content = files.reduce((sum, f) => sum + (f.contentChars ?? 2_000), 0);
  return estimateTokensFromChars(Math.floor(content * 0.4) + 800 * files.length);
}

export function shouldSplitPhaseForBudget(estimatedOutputTokens: number): boolean {
  return estimatedOutputTokens > SAFE_PHASE_OUTPUT_TOKEN_BUDGET;
}

function createPhaseState(id: string): EditPhaseRuntimeState {
  return {
    id,
    status: "pending",
    attempt: 0,
    startedAt: null,
    completedAt: null,
    elapsedMs: 0,
    error: null,
    beforeHashes: {},
    afterHashes: {},
    rolledBack: false,
    filesChanged: [],
    providerCalls: 0,
    repairAttempts: 0,
  };
}

function groupByLayer(
  relPaths: readonly string[],
): { layer: string; paths: string[] }[] {
  const layers: { layer: string; paths: string[] }[] = [
    { layer: "types-and-models", paths: [] },
    { layer: "state-and-hooks", paths: [] },
    { layer: "components-and-ui", paths: [] },
    { layer: "app-and-styles", paths: [] },
    { layer: "other", paths: [] },
  ];

  for (const rel of relPaths) {
    const lower = rel.toLowerCase();
    if (
      /types?\.|models?\.|schema|persist|storage|migration/i.test(lower) ||
      /\/types\//i.test(lower)
    ) {
      layers[0]!.paths.push(rel);
    } else if (/hook|store|context|state|reducer/i.test(lower)) {
      layers[1]!.paths.push(rel);
    } else if (/component|\.tsx$/i.test(lower) && !/app\.tsx$/i.test(lower)) {
      layers[2]!.paths.push(rel);
    } else if (/app\.tsx$|main\.tsx$|\.css$|index\.html/i.test(lower)) {
      layers[3]!.paths.push(rel);
    } else {
      layers[4]!.paths.push(rel);
    }
  }
  return layers.filter((l) => l.paths.length > 0);
}

function chunkPaths(paths: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < paths.length; i += size) {
    out.push([...paths.slice(i, i + size)]);
  }
  return out;
}

function titleForLayer(layer: string, index: number): string {
  switch (layer) {
    case "types-and-models":
      return `Phase ${index + 1}: Types & persistence`;
    case "state-and-hooks":
      return `Phase ${index + 1}: State & hooks`;
    case "components-and-ui":
      return `Phase ${index + 1}: UI components`;
    case "app-and-styles":
      return `Phase ${index + 1}: App shell & styles`;
    default:
      return `Phase ${index + 1}: Supporting files`;
  }
}

/**
 * Convert a large multi-file edit into ordered phases with dependencies.
 * Never treats every exploratory path as mandatory — callers mark roles later.
 */
export function buildEditPhasePlan(input: {
  readonly prompt: string;
  readonly targetPaths: readonly string[];
  readonly fileSizes?: Readonly<Record<string, number>>;
  readonly maxFilesPerPhase?: number;
  readonly planId?: string;
}): EditPhasePlan {
  const maxFiles = input.maxFilesPerPhase ?? MAX_FILES_PER_EDIT_PHASE;
  const unique = [...new Set(input.targetPaths.map((p) => p.replace(/\\/g, "/")))];
  const layers = groupByLayer(unique);
  const phases: EditPhaseSpec[] = [];
  let prevPhaseId: string | null = null;

  for (const layer of layers) {
    const chunks = chunkPaths(layer.paths, maxFiles);
    for (const chunk of chunks) {
      let files: EditPhaseFileAssignment[] = chunk.map((relPath) => ({
        relPath,
        role: "required" as const,
        reason: `Assigned to ${layer.layer}`,
        acceptanceCriteria: `Update ${relPath} for the phase goals`,
      }));

      let estimated = estimatePhaseOutputTokens(
        files.map((f) => {
          const chars = input.fileSizes?.[f.relPath];
          return chars != null
            ? { relPath: f.relPath, contentChars: chars }
            : { relPath: f.relPath };
        }),
      );

      // Split further when the estimated patch exceeds the safe budget.
      if (shouldSplitPhaseForBudget(estimated) && files.length > 1) {
        for (const single of files) {
          const id = `phase-${phases.length + 1}`;
          const singleEst = estimatePhaseOutputTokens([
            (() => {
              const chars = input.fileSizes?.[single.relPath];
              return chars != null
                ? { relPath: single.relPath, contentChars: chars }
                : { relPath: single.relPath };
            })(),
          ]);
          phases.push({
            id,
            index: phases.length,
            title: titleForLayer(layer.layer, phases.length),
            summary: `Edit ${single.relPath}`,
            dependsOn: prevPhaseId ? [prevPhaseId] : [],
            files: [single],
            acceptanceCriteria: [
              single.acceptanceCriteria ?? `Apply changes to ${single.relPath}`,
              "Typecheck-safe within this phase's scope",
            ],
            estimatedOutputTokens: singleEst,
          });
          prevPhaseId = id;
        }
        continue;
      }

      // Still over budget with one file — keep as one phase but record estimate.
      const id = `phase-${phases.length + 1}`;
      estimated = estimatePhaseOutputTokens(
        files.map((f) => {
          const chars = input.fileSizes?.[f.relPath];
          return chars != null
            ? { relPath: f.relPath, contentChars: chars }
            : { relPath: f.relPath };
        }),
      );
      phases.push({
        id,
        index: phases.length,
        title: titleForLayer(layer.layer, phases.length),
        summary: `Edit ${files.map((f) => f.relPath).join(", ")}`,
        dependsOn: prevPhaseId ? [prevPhaseId] : [],
        files,
        acceptanceCriteria: [
          ...files.map((f) => f.acceptanceCriteria ?? `Update ${f.relPath}`),
          "Phase completes within generation budget",
        ],
        estimatedOutputTokens: estimated,
      });
      prevPhaseId = id;
    }
  }

  const phaseStates: Record<string, EditPhaseRuntimeState> = {};
  for (const phase of phases) {
    phaseStates[phase.id] = createPhaseState(phase.id);
  }

  return {
    planId: input.planId ?? `edit-plan-${Date.now()}`,
    prompt: input.prompt,
    createdAt: Date.now(),
    phases,
    currentPhaseId: phases[0]?.id ?? null,
    status: phases.length > 0 ? "planning" : "completed",
    phaseStates,
    pausedReason: null,
  };
}

export function remainingPhases(plan: EditPhasePlan): readonly EditPhaseSpec[] {
  return plan.phases.filter((p) => {
    const state = plan.phaseStates[p.id];
    return !state || state.status !== "completed";
  });
}

export function firstIncompletePhase(plan: EditPhasePlan): EditPhaseSpec | null {
  return remainingPhases(plan)[0] ?? null;
}

export function markPhaseStatus(
  plan: EditPhasePlan,
  phaseId: string,
  patch: Partial<EditPhaseRuntimeState>,
): EditPhasePlan {
  const prev = plan.phaseStates[phaseId] ?? createPhaseState(phaseId);
  const nextState: EditPhaseRuntimeState = { ...prev, ...patch, id: phaseId };
  return {
    ...plan,
    currentPhaseId: phaseId,
    phaseStates: { ...plan.phaseStates, [phaseId]: nextState },
  };
}

export function resumeEditPhasePlan(plan: EditPhasePlan): EditPhasePlan {
  const next = firstIncompletePhase(plan);
  if (!next) {
    return { ...plan, status: "completed", currentPhaseId: null, pausedReason: null };
  }
  return {
    ...plan,
    status: "running",
    currentPhaseId: next.id,
    pausedReason: null,
  };
}

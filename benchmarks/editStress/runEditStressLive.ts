import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { computeDiffHunks, mergeHunkDecisions } from "@/core/editor/diffHunks";
import { validateProposalQuality } from "@/core/planApply/proposalValidation";
import { mockProjectScan } from "@/core/repository/testScan";
import { editStressFixtureById } from "./fixtures";
import { EDIT_STRESS_PROMPTS, type EditStressPrompt } from "./prompts";
import {
  runEditStressDryCase,
  type EditStressRunResult,
  type EditStressSuiteResult,
} from "./runEditStressSuite";

const DISK_FIXTURE_ROOTS: Readonly<Record<string, string>> = {
  "sudoku-vite": "e2e/fixtures/sudoku-vite",
};

export interface EditStressLiveResult extends EditStressRunResult {
  readonly liveOk: boolean;
  readonly patchValidated: boolean;
  readonly hunkCount: number;
  readonly partialMergeOk: boolean;
  readonly liveReason?: string;
}

function syntheticBasis(relPath: string): string {
  if (relPath.endsWith(".tsx") || relPath.endsWith(".ts")) {
    return `export default function Component() {\n  return null;\n}\n`;
  }
  if (relPath.endsWith(".css")) {
    return "body { margin: 0; }\n";
  }
  if (relPath.endsWith(".json")) {
    return '{\n  "name": "fixture"\n}\n';
  }
  return `// ${relPath}\n`;
}

async function loadBasisContent(
  fixtureId: string,
  relPath: string,
): Promise<string> {
  const diskRoot = DISK_FIXTURE_ROOTS[fixtureId];
  if (diskRoot) {
    try {
      return await readFile(join(process.cwd(), diskRoot, relPath), "utf8");
    } catch {
      /* fall through */
    }
  }
  return syntheticBasis(relPath);
}

function mockPatch(basis: string, relPath: string): string {
  if (relPath.endsWith(".tsx") || relPath.endsWith(".ts")) {
    const marker = "\n// edit-stress-live\n";
    if (basis.includes(marker.trim())) return basis;
    const insertAt = basis.lastIndexOf("\n");
    if (insertAt < 0) return `${basis}${marker}`;
    return `${basis.slice(0, insertAt)}${marker}${basis.slice(insertAt)}`;
  }
  return `${basis}\n/* edit-stress-live */\n`;
}

export async function runEditStressLiveCase(
  prompt: EditStressPrompt,
): Promise<EditStressLiveResult> {
  const dry = runEditStressDryCase(prompt);
  const relPath = prompt.expectedPaths[0];
  if (!dry.ok || !relPath) {
    return {
      ...dry,
      liveOk: false,
      patchValidated: false,
      hunkCount: 0,
      partialMergeOk: false,
      liveReason: dry.reason ?? "Dry-run failed",
    };
  }

  const fixture = editStressFixtureById(prompt.fixtureId);
  if (!fixture) {
    return {
      ...dry,
      liveOk: false,
      patchValidated: false,
      hunkCount: 0,
      partialMergeOk: false,
      liveReason: "Missing fixture",
    };
  }

  const basis = await loadBasisContent(prompt.fixtureId, relPath);
  const patched = mockPatch(basis, relPath);
  const scan = mockProjectScan([...fixture.files], { root: fixture.root });
  const quality = validateProposalQuality(basis, patched, relPath, scan);
  const hunks = computeDiffHunks(basis, patched);
  const partial = mergeHunkDecisions(basis, patched, { "hunk-0": false });
  const partialMergeOk = partial === basis || partial.length < patched.length;

  const patchValidated = quality.ok;
  const liveOk = patchValidated && hunks.length > 0 && partialMergeOk;

  return {
    ...dry,
    liveOk,
    patchValidated,
    hunkCount: hunks.length,
    partialMergeOk,
    ...(!liveOk
      ? {
          liveReason: [
            !patchValidated ? quality.reason ?? "patch invalid" : null,
            hunks.length === 0 ? "no hunks" : null,
            !partialMergeOk ? "partial merge failed" : null,
          ]
            .filter(Boolean)
            .join("; "),
        }
      : {}),
  };
}

export interface EditStressLiveSuiteResult extends EditStressSuiteResult {
  readonly livePassed: number;
  readonly liveTargetMet: boolean;
  readonly runs: readonly EditStressLiveResult[];
}

export async function runEditStressLiveSuite(
  promptIds?: readonly string[],
): Promise<EditStressLiveSuiteResult> {
  const started = new Date();
  const prompts = promptIds?.length
    ? promptIds
        .map((id) => EDIT_STRESS_PROMPTS.find((p) => p.id === id))
        .filter((p): p is EditStressPrompt => p != null)
    : [...EDIT_STRESS_PROMPTS];

  const runs = await Promise.all(prompts.map((p) => runEditStressLiveCase(p)));
  const finished = new Date();
  const passed = runs.filter((r) => r.ok).length;
  const livePassed = runs.filter((r) => r.liveOk).length;
  const total = runs.length;
  const target = total;

  return {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    target,
    passed,
    total,
    successRate: total === 0 ? 0 : passed / total,
    targetMet: passed >= target,
    livePassed,
    liveTargetMet: livePassed >= target,
    runs,
  };
}

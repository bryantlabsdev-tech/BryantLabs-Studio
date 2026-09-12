import { executeApplyPlanOrchestration } from "@/app/orchestration/applyPlan";
import { generatePlan } from "@/core/planner";
import { normalizeProjectMemory } from "@/core/projectMemory/store";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { buildApplyPlanStressHarness } from "./buildApplyPlanStressHost";
import { editStressFixtureById } from "./fixtures";
import {
  linkFixtureDeps,
  materializeEditStressFixture,
  openProjectWorkspace,
  verifyFixtureWorkspace,
  type FixtureWorkspace,
} from "./fixtureWorkspace";
import { EDIT_STRESS_PROMPTS, type EditStressPrompt } from "./prompts";
import type { LiveGeminiPatchConfig } from "./liveApplyPlanPatch";
import {
  runEditStressDryCase,
  runEditStressDryCaseWithScan,
  type EditStressRunResult,
  type EditStressSuiteResult,
} from "./runEditStressSuite";

/** Node harness — orchestration uses localStorage for prompt visibility / prefs. */
function ensureHarnessLocalStorage(): void {
  if (typeof globalThis.localStorage !== "undefined") return;
  const store = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
}

ensureHarnessLocalStorage();

export interface EditStressProviderResult extends EditStressRunResult {
  readonly providerOk: boolean;
  readonly validReady: number;
  readonly applyOk: boolean;
  readonly verifyOk: boolean;
  readonly providerReason?: string;
}

const workspaceCache = new Map<string, Promise<FixtureWorkspace>>();

async function getWorkspace(prompt: EditStressPrompt): Promise<FixtureWorkspace> {
  const key = `${prompt.fixtureId}:${prompt.id}`;
  let pending = workspaceCache.get(key);
  if (!pending) {
    pending = materializeEditStressFixture(prompt.fixtureId, prompt.id);
    workspaceCache.set(key, pending);
  }
  return pending;
}

export async function runEditStressProviderCase(
  prompt: EditStressPrompt,
  opts?: {
    readonly skipVerify?: boolean;
    readonly liveGemini?: LiveGeminiPatchConfig;
    readonly workspace?: FixtureWorkspace;
  },
): Promise<EditStressProviderResult> {
  const workspaceOverride = opts?.workspace;
  const dry = workspaceOverride
    ? runEditStressDryCaseWithScan(
        prompt,
        workspaceOverride.scan,
        workspaceOverride.root,
        workspaceOverride.scan.files.map((f) => f.path),
      )
    : runEditStressDryCase(prompt);
  if (!dry.ok) {
    return {
      ...dry,
      providerOk: false,
      validReady: 0,
      applyOk: false,
      verifyOk: false,
      providerReason: dry.reason ?? "Dry-run failed",
    };
  }

  const fixture = editStressFixtureById(prompt.fixtureId);
  if (!fixture && !workspaceOverride) {
    return {
      ...dry,
      providerOk: false,
      validReady: 0,
      applyOk: false,
      verifyOk: false,
      providerReason: "Missing fixture",
    };
  }

  try {
    const workspace = workspaceOverride ?? (await getWorkspace(prompt));
    if (!opts?.skipVerify && !workspaceOverride) {
      await linkFixtureDeps(prompt.fixtureId, workspace);
    }

    const plan = generatePlan(prompt.prompt, workspace.scan, {
      projectPath: workspace.root,
      projectMemory: normalizeProjectMemory(null),
      sessionMemory: emptySessionMemory(),
    });

    const harness = buildApplyPlanStressHarness({
      workspace,
      plan,
      prompt: prompt.prompt,
      ...(opts?.skipVerify ? { skipVerify: true } : { verify: () => verifyFixtureWorkspace(workspace) }),
      ...(opts?.liveGemini ? { liveGemini: opts.liveGemini } : {}),
    });

    const result = await executeApplyPlanOrchestration(harness.host, {
      directRewrite: false,
      autoContinue: true,
    });

    const session = harness.getPlanApplySession();
    const applyOk = result.applyOk === true;
    let verifyOk = opts?.skipVerify === true;
    if (!verifyOk && applyOk) {
      const sessionVerify = session?.verification;
      if (
        sessionVerify?.typecheck.ok === true &&
        sessionVerify?.build.ok === true
      ) {
        verifyOk = true;
      } else {
        const fresh = await verifyFixtureWorkspace(workspace);
        verifyOk = fresh.typecheck.ok && fresh.build.ok;
      }
    }
    const providerOk = result.validReady > 0 && applyOk && verifyOk;

    return {
      ...dry,
      providerOk,
      validReady: result.validReady,
      applyOk,
      verifyOk,
      ...(!providerOk
        ? {
            providerReason: [
              result.validReady === 0 ? `validReady=0${result.error ? ` (${result.error})` : ""}` : null,
              !applyOk ? "apply failed" : null,
              !verifyOk ? harness.getPlanApplyError() ?? "verify failed" : null,
            ]
              .filter(Boolean)
              .join("; "),
          }
        : {}),
    };
  } catch (err) {
    return {
      ...dry,
      providerOk: false,
      validReady: 0,
      applyOk: false,
      verifyOk: false,
      providerReason: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface EditStressProviderSuiteResult extends EditStressSuiteResult {
  readonly providerPassed: number;
  readonly providerTargetMet: boolean;
  readonly runs: readonly EditStressProviderResult[];
}

export async function runEditStressProviderSuite(input?: {
  readonly promptIds?: readonly string[];
  readonly skipVerify?: boolean;
  readonly liveGemini?: import("./liveApplyPlanPatch").LiveGeminiPatchConfig;
}): Promise<EditStressProviderSuiteResult> {
  const started = new Date();
  const prompts = input?.promptIds?.length
    ? input.promptIds
        .map((id) => EDIT_STRESS_PROMPTS.find((p) => p.id === id))
        .filter((p): p is EditStressPrompt => p != null)
    : [...EDIT_STRESS_PROMPTS];

  const runs: EditStressProviderResult[] = [];
  for (const prompt of prompts) {
    runs.push(
      await runEditStressProviderCase(prompt, {
        ...(input?.skipVerify ? { skipVerify: true } : {}),
        ...(input?.liveGemini ? { liveGemini: input.liveGemini } : {}),
      }),
    );
  }

  const finished = new Date();
  const passed = runs.filter((r) => r.ok).length;
  const providerPassed = runs.filter((r) => r.providerOk).length;
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
    providerPassed,
    providerTargetMet: providerPassed >= target,
    runs,
  };
}

/** Fast provider suite — sudoku fixture prompts only (4 cases). */
export async function runEditStressProviderFastSuite(
  opts?: { readonly skipVerify?: boolean },
): Promise<EditStressProviderSuiteResult> {
  const sudokuIds = EDIT_STRESS_PROMPTS.filter((p) => p.fixtureId === "sudoku-vite").map(
    (p) => p.id,
  );
  return runEditStressProviderSuite({ promptIds: sudokuIds, ...opts });
}

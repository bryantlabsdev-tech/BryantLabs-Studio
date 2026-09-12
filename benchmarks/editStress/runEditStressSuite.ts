import { resolveFollowUpSubmitAction } from "@/core/agent/followUpExecution";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { generatePlan } from "@/core/planner";
import { normalizeProjectMemory } from "@/core/projectMemory/store";
import { mockProjectScan } from "@/core/repository/testScan";
import { emptySessionMemory } from "@/core/sessionMemory/store";
import { editStressFixtureById } from "./fixtures";
import { EDIT_STRESS_PROMPTS, type EditStressPrompt } from "./prompts";

export interface EditStressRunResult {
  readonly id: string;
  readonly fixtureId: string;
  readonly name: string;
  readonly ok: boolean;
  readonly routeExecution: string;
  readonly submitAction: string;
  readonly planPaths: readonly string[];
  readonly missingPaths: readonly string[];
  readonly reason?: string;
}

export function runEditStressDryCaseWithScan(
  prompt: EditStressPrompt,
  scan: import("@/types").ProjectScan,
  projectPath: string,
  filesWritten?: readonly string[],
): EditStressRunResult {
  const route = routeAgentPrompt({
    prompt: prompt.prompt,
    projectOpen: true,
    projectPath,
    scan,
    scanStatus: "done",
    greenfieldRun: emptyGreenfieldRun(),
    filesWritten: filesWritten ?? scan.files.map((f) => f.path),
    previousSuccessfulRun: true,
    fallbackSourceFileCount: scan.files.length,
  });

  const submit = resolveFollowUpSubmitAction({
    hasProject: true,
    routeExecution: route.execution,
    emptyProjectFolder: false,
    scan,
    scanStatus: "done",
    useAgentLoopForEdits: false,
  });

  const plan = generatePlan(prompt.prompt, scan, {
    projectPath,
    projectMemory: normalizeProjectMemory(null),
    sessionMemory: emptySessionMemory(),
  });
  const planPaths = plan.files.map((f) => f.path);
  const missingPaths = prompt.expectedPaths.filter((p) => !planPaths.includes(p));

  const routeOk = route.execution === "build_loop";
  const submitOk = submit.kind === "build_loop";
  const planOk = missingPaths.length === 0 && plan.files.length > 0;
  const ok = routeOk && submitOk && planOk;

  return {
    id: prompt.id,
    fixtureId: prompt.fixtureId,
    name: prompt.name,
    ok,
    routeExecution: route.execution,
    submitAction: submit.kind,
    planPaths,
    missingPaths,
    ...(!ok
      ? {
          reason: [
            !routeOk ? `route=${route.execution}` : null,
            !submitOk ? `submit=${submit.kind}` : null,
            !planOk ? `missing=${missingPaths.join(",")}` : null,
          ]
            .filter(Boolean)
            .join("; "),
        }
      : {}),
  };
}

export function runEditStressDryCase(prompt: EditStressPrompt): EditStressRunResult {
  const fixture = editStressFixtureById(prompt.fixtureId);
  if (!fixture) {
    return {
      id: prompt.id,
      fixtureId: prompt.fixtureId,
      name: prompt.name,
      ok: false,
      routeExecution: "missing_fixture",
      submitAction: "missing_fixture",
      planPaths: [],
      missingPaths: prompt.expectedPaths,
      reason: `Unknown fixture: ${prompt.fixtureId}`,
    };
  }

  const scan = mockProjectScan([...fixture.files], { root: fixture.root });
  return runEditStressDryCaseWithScan(prompt, scan, fixture.root, fixture.files);
}

export interface EditStressSuiteResult {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly target: number;
  readonly passed: number;
  readonly total: number;
  readonly successRate: number;
  readonly targetMet: boolean;
  readonly runs: readonly EditStressRunResult[];
}

export function runEditStressSuite(promptIds?: readonly string[]): EditStressSuiteResult {
  const started = new Date();
  const prompts = promptIds?.length
    ? promptIds
        .map((id) => EDIT_STRESS_PROMPTS.find((p) => p.id === id))
        .filter((p): p is EditStressPrompt => p != null)
    : [...EDIT_STRESS_PROMPTS];

  const runs = prompts.map((p) => runEditStressDryCase(p));
  const finished = new Date();
  const passed = runs.filter((r) => r.ok).length;
  const total = runs.length;
  const target = total;
  const successRate = total === 0 ? 0 : passed / total;

  return {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    target,
    passed,
    total,
    successRate,
    targetMet: passed >= target,
    runs,
  };
}

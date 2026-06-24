import type { PlanApplyTarget } from "@/core/planApply/collectTargets";
import type { ProjectScan } from "@/types";
import { resolvePlanFilePath } from "@/core/planApply/resolve";
import type { ExecutionStep } from "@/core/execution/types";
import { orderStepsByDependency } from "@/core/execution/dependencyOrder";

export type ExecutionPlanInput = {
  readonly prompt: string;
  readonly summary: string;
  readonly source: "ai" | "deterministic";
  readonly targets: readonly PlanApplyTarget[];
  readonly plannedPaths: readonly { path: string; planReason: string }[];
  readonly scan: ProjectScan;
  readonly projectRoot: string;
};

type StepCategory =
  | "context"
  | "pages"
  | "routing"
  | "integration"
  | "implementation"
  | "styles";

const CATEGORY_META: Record<
  StepCategory,
  { title: string; description: string; order: number }
> = {
  context: {
    title: "Create context & providers",
    description: "Auth/store/context modules before consumers import them.",
    order: 0,
  },
  pages: {
    title: "Create pages & components",
    description: "Screens and UI components referenced by routing.",
    order: 1,
  },
  routing: {
    title: "Update routing & shell",
    description: "App entry, routes, and protected-route wiring.",
    order: 2,
  },
  integration: {
    title: "Add API & data integration",
    description: "Services, hooks, and fetch layers.",
    order: 3,
  },
  implementation: {
    title: "Implement coordinated changes",
    description: "Supporting modules and shared utilities.",
    order: 4,
  },
  styles: {
    title: "Update styles & theme",
    description: "CSS and theme tokens after structure is in place.",
    order: 5,
  },
};

const CATEGORY_DEPS: Partial<Record<StepCategory, StepCategory[]>> = {
  pages: ["context"],
  routing: ["context", "pages"],
  integration: ["context"],
  styles: ["pages", "routing", "implementation"],
};

function inferCategory(relPath: string, planReason: string): StepCategory {
  const text = `${relPath} ${planReason}`.toLowerCase();
  if (
    /context|provider|store|authcontext|auth\.tsx|session/.test(text) ||
    (text.includes("auth") && /context|provider/.test(text))
  ) {
    return "context";
  }
  if (
    /login|signup|register|dashboard|settings|page|screen|component\/|pages\//.test(
      text,
    )
  ) {
    return "pages";
  }
  if (/route|router|app\.tsx|main\.tsx|protected|layout/.test(text)) {
    return "routing";
  }
  if (/api|service|fetch|integration|endpoint|hook/.test(text)) {
    return "integration";
  }
  if (/\.css|\.scss|theme|style|dark.?mode/.test(text)) {
    return "styles";
  }
  return "implementation";
}

function stepTitleForCategory(
  category: StepCategory,
  files: readonly string[],
): string {
  const base = CATEGORY_META[category].title;
  if (files.length === 1) {
    const name = files[0]?.split("/").pop() ?? files[0];
    if (category === "context" && /auth/i.test(files[0] ?? "")) {
      return "Create AuthContext";
    }
    if (category === "pages" && /login/i.test(files[0] ?? "")) {
      return "Create Login page";
    }
    if (name) return `${base} — ${name}`;
  }
  return base;
}

function resolveTargetPath(
  planPath: string,
  scan: ProjectScan,
  projectRoot: string,
): { relPath: string; absPath: string; isNewFile: boolean } | null {
  const hit = resolvePlanFilePath(planPath, scan);
  if (hit) {
    return { ...hit, isNewFile: false };
  }
  const normalized = planPath.replace(/^\.\//, "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("..")) return null;
  const absPath = `${projectRoot.replace(/[/\\]+$/, "")}/${normalized}`;
  return { relPath: normalized, absPath, isNewFile: true };
}

/** Build ordered execution steps from plan targets and AI-planned paths. */
export function buildExecutionPlan(input: ExecutionPlanInput): ExecutionStep[] {
  const buckets = new Map<StepCategory, string[]>();

  const assign = (relPath: string, planReason: string) => {
    const cat = inferCategory(relPath, planReason);
    const list = buckets.get(cat) ?? [];
    if (!list.includes(relPath)) list.push(relPath);
    buckets.set(cat, list);
  };

  for (const t of input.targets) {
    assign(t.relPath, t.planReason);
  }

  for (const p of input.plannedPaths) {
    const resolved = resolveTargetPath(p.path, input.scan, input.projectRoot);
    if (!resolved) continue;
    if (input.targets.some((t) => t.relPath === resolved.relPath)) continue;
    assign(resolved.relPath, p.planReason);
  }

  const categories = [...buckets.keys()].sort(
    (a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order,
  );

  const steps: ExecutionStep[] = categories.map((cat, index) => {
    const files = buckets.get(cat) ?? [];
    const id = `step-${cat}-${index}`;
    const deps = (CATEGORY_DEPS[cat] ?? [])
      .map((depCat) => {
        const depIndex = categories.indexOf(depCat);
        return depIndex >= 0 ? `step-${depCat}-${depIndex}` : null;
      })
      .filter((x): x is string => x !== null);

    return {
      id,
      index,
      title: stepTitleForCategory(cat, files),
      description: CATEGORY_META[cat].description,
      filePaths: files,
      dependsOn: deps,
      status: "pending" as const,
    };
  });

  return orderStepsByDependency(steps);
}

export function executionPlanSummaryLines(steps: readonly ExecutionStep[]): string[] {
  const lines = ["Execution Plan:"];
  for (const step of steps) {
    lines.push(
      `Step ${step.index + 1}: ${step.title} (${step.filePaths.length} file(s))`,
    );
  }
  return lines;
}

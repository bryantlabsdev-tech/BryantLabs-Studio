/** Static smoke checks on generated greenfield project sources (post-build). */

import {
  classifySmokeAppType,
  smokeAppTypeLabel,
  requiresSaasSmokeChecks,
  type SmokeAppType,
} from "@/core/greenfield/runtimeSmokeAppType";

export type RuntimeSmokeCheckStatus = "passed" | "failed" | "advisory" | "skipped";

export interface RuntimeSmokeCheck {
  readonly id: string;
  readonly label: string;
  readonly status: RuntimeSmokeCheckStatus;
  /** @deprecated Use status — true when passed or skipped (not applicable). */
  readonly passed: boolean;
  readonly detail: string;
}

export type RuntimeSmokeOverallStatus = "passed" | "advisory" | "failed";

export interface RuntimeSmokeResult {
  readonly ok: boolean;
  readonly overallStatus: RuntimeSmokeOverallStatus;
  readonly appType: SmokeAppType;
  readonly checks: readonly RuntimeSmokeCheck[];
}

export interface RuntimeSmokeOptions {
  readonly prompt?: string;
}

function read(files: ReadonlyMap<string, string>, path: string): string {
  return files.get(path.replace(/\\/g, "/")) ?? "";
}

function makeCheck(
  id: string,
  label: string,
  status: RuntimeSmokeCheckStatus,
  detail: string,
): RuntimeSmokeCheck {
  return {
    id,
    label,
    status,
    passed: status === "passed" || status === "skipped",
    detail,
  };
}

function summarizeOverall(checks: readonly RuntimeSmokeCheck[]): RuntimeSmokeOverallStatus {
  if (checks.some((c) => c.status === "failed")) return "failed";
  if (checks.some((c) => c.status === "advisory")) return "advisory";
  return "passed";
}

export function evaluateRuntimeSmokeFromSources(
  files: ReadonlyMap<string, string>,
  options: RuntimeSmokeOptions = {},
): RuntimeSmokeResult {
  const appType = classifySmokeAppType(options.prompt, files);
  const saasChecks = requiresSaasSmokeChecks(appType);
  const checks: RuntimeSmokeCheck[] = [];

  const main = read(files, "src/main.tsx");
  checks.push(
    makeCheck(
      "react_mount",
      "React root mounts",
      /createRoot\s*\(/.test(main) && /render\s*\(/.test(main) ? "passed" : "failed",
      main ? "main.tsx has createRoot + render" : "src/main.tsx missing",
    ),
  );

  const app = read(files, "src/App.tsx");
  checks.push(
    makeCheck(
      "no_nested_browser_router",
      "No nested BrowserRouter in App",
      !/<BrowserRouter[\s>]/.test(app) ? "passed" : "failed",
      /<BrowserRouter[\s>]/.test(app)
        ? "Remove nested BrowserRouter from App.tsx"
        : "App.tsx has no nested BrowserRouter",
    ),
  );

  const distIndex = read(files, "dist/index.html");
  checks.push(
    makeCheck(
      "build_output",
      "Build output present",
      distIndex.includes("<script") || distIndex.includes('type="module"')
        ? "passed"
        : "failed",
      distIndex ? "dist/index.html exists" : "dist/index.html missing (run build first)",
    ),
  );

  if (saasChecks) {
    checks.push(
      makeCheck(
        "router_wiring",
        "Router routes present",
        /<Routes[\s>]/.test(app) && /<Route[\s>]/.test(app) ? "passed" : "failed",
        app ? "App.tsx defines Routes/Route" : "src/App.tsx missing",
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "router_wiring",
        "Router routes present",
        "skipped",
        `Not required for ${smokeAppTypeLabel(appType)} apps`,
      ),
    );
  }

  const allSource = [...files.entries()]
    .filter(([p]) => p.startsWith("src/") && /\.tsx?$/.test(p))
    .map(([, c]) => c)
    .join("\n");

  const usesStorage = /localStorage/.test(allSource);
  const hasSafeParse =
    /JSON\.parse\s*\([^)]+\)\s*;?\s*\}?\s*catch/.test(allSource) ||
    /useLocalStorage/.test(allSource) ||
    /try\s*\{[\s\S]{0,120}localStorage/.test(allSource);

  if (saasChecks || usesStorage) {
    checks.push(
      makeCheck(
        "localstorage_safety",
        "localStorage parse safety",
        !usesStorage || hasSafeParse ? "passed" : "failed",
        usesStorage
          ? hasSafeParse
            ? "localStorage uses hook or try/catch"
            : "localStorage used without parse fallback"
          : "localStorage not used",
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "localstorage_safety",
        "localStorage parse safety",
        "skipped",
        `Not required for ${smokeAppTypeLabel(appType)} apps without localStorage`,
      ),
    );
  }

  const pageFiles = [...files.keys()].filter(
    (p) => p.startsWith("src/pages/") && p.endsWith(".tsx"),
  );

  if (saasChecks) {
    checks.push(
      makeCheck(
        "page_files",
        "Page components generated",
        pageFiles.length >= 3 ? "passed" : "failed",
        `${pageFiles.length} page file(s) under src/pages/`,
      ),
    );

    const hasCrudSignals =
      (/.filter\s*\(/.test(allSource) &&
        (/.map\s*\(/.test(allSource) || /useState\s*</.test(allSource))) ||
      (/<table[\s>]/i.test(allSource) && /\.map\s*\(/.test(allSource)) ||
      (/useState\s*</.test(allSource) && pageFiles.length >= 3);

    checks.push(
      makeCheck(
        "crud_signals",
        "CRUD/list patterns in source",
        hasCrudSignals ? "passed" : "failed",
        hasCrudSignals
          ? "Found state + list/filter patterns"
          : "No list/filter CRUD patterns detected",
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "page_files",
        "Page components generated",
        "skipped",
        `Not required for ${smokeAppTypeLabel(appType)} apps`,
      ),
    );
    checks.push(
      makeCheck(
        "crud_signals",
        "CRUD/list patterns in source",
        "skipped",
        `Not required for ${smokeAppTypeLabel(appType)} apps`,
      ),
    );
  }

  const promptWantsVisual =
    options.prompt != null &&
    /\b(stick\s*figur|animat|canvas|game|fight|sprite|visual|draw)\b/i.test(options.prompt);
  const hasVisualSurface =
    /<canvas[\s>]/.test(allSource) ||
    /requestAnimationFrame/.test(allSource) ||
    /\banimat(e|ion)/i.test(allSource);

  if (
    (appType === "game_animation_visual" || promptWantsVisual) &&
    !saasChecks
  ) {
    checks.push(
      makeCheck(
        "visual_interaction",
        "Canvas or animation surface",
        hasVisualSurface ? "passed" : "advisory",
        hasVisualSurface
          ? "Found canvas or animation loop in source"
          : "No canvas/animation detected (optional for this app type)",
      ),
    );
  }

  const overallStatus = summarizeOverall(checks);
  return {
    ok: overallStatus !== "failed",
    overallStatus,
    appType,
    checks,
  };
}

export function runtimeSmokeFromProjectFiles(
  files: readonly { readonly path: string; readonly content: string }[],
  options: RuntimeSmokeOptions = {},
): RuntimeSmokeResult {
  const map = new Map<string, string>();
  for (const file of files) {
    map.set(file.path.replace(/\\/g, "/"), file.content);
  }
  return evaluateRuntimeSmokeFromSources(map, options);
}

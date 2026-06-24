import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allCoreVerificationPassed,
  commandIncludesTypeScriptCheck,
  commandOutputHasTypeScriptErrors,
  inferBuildPassedFromCommand,
  inferTypeScriptPassedFromBuild,
  resolveRunVerification,
  shouldIgnoreStaleFailureReport,
} from "@/core/diagnostics/verificationResolution";
import { createRunLogEntry } from "@/core/greenfield/runLog";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import type { CommandResult } from "@/types";

function cmd(
  command: string,
  ok: boolean,
  stdout = "",
  stderr = "",
): CommandResult {
  return {
    command,
    ok,
    exitCode: ok ? 0 : 1,
    stdout,
    stderr,
    durationMs: 100,
    errorCount: ok ? 0 : 1,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
}

import type { UiAuditResult } from "@/core/greenfield/uiAudit";

function minimalUiAudit(overrides: Partial<UiAuditResult> = {}): UiAuditResult {
  return {
    ok: true,
    skipped: false,
    type: "dashboard_layout",
    score: 90,
    issues: [],
    details: "ok",
    classification: {
      type: "dashboard_layout",
      confidence: 90,
      signals: ["dashboard_layout"],
    },
    ...overrides,
  };
}

describe("verificationResolution", () => {
  it("marks TypeScript passed when npm run build exits 0 and includes tsc", () => {
    const build = cmd(
      "npm run build",
      true,
      "tsc -p tsconfig.json && vite build\n✓ built in 1.2s",
    );
    assert.equal(inferTypeScriptPassedFromBuild(build), true);
    assert.equal(commandIncludesTypeScriptCheck(build), true);
    const buildWithTscInOutput = cmd(
      "npm run build",
      true,
      "> app@0.0.0 build\n> tsc -p tsconfig.json && vite build\n✓ built in 1.2s",
    );
    assert.equal(inferTypeScriptPassedFromBuild(buildWithTscInOutput), true);

    const resolved = resolveRunVerification({
      run: {
        ...emptyGreenfieldRun(),
        runResult: "success",
        setupResult: {
          ok: true,
          install: cmd("npm install", true),
          typecheck: cmd("npx tsc --noEmit", false, "", "src/App.tsx(1,1): error TS2304"),
          build: buildWithTscInOutput,
        },
        entries: [
          createRunLogEntry("typescript", "failed", "TypeScript check failed"),
          createRunLogEntry("build", "success", "Build finished"),
          createRunLogEntry("preview", "success", "Preview ready"),
          createRunLogEntry("ui_audit", "success", "UI audit passed"),
        ],
        uiAuditResult: minimalUiAudit(),
      },
    });

    assert.equal(resolved.typescript, "passed");
    assert.equal(resolved.build, "passed");
    assert.equal(resolved.preview, "passed");
    assert.equal(resolved.uiAudit, "passed");
    assert.equal(allCoreVerificationPassed(resolved), true);
  });

  it("marks TypeScript failed when tsc exits nonzero with parser errors", () => {
    const typecheck = cmd(
      "npx tsc --noEmit",
      false,
      "",
      "src/App.tsx(1,1): error TS2304: Cannot find name 'Foo'.",
    );
    const resolved = resolveRunVerification({
      run: {
        ...emptyGreenfieldRun(),
        runResult: "failed",
        setupResult: {
          ok: false,
          install: cmd("npm install", true),
          typecheck,
        },
        entries: [createRunLogEntry("typescript", "failed", "TypeScript check failed")],
      },
    });
    assert.equal(resolved.typescript, "failed");
    assert.equal(commandOutputHasTypeScriptErrors(typecheck), true);
  });

  it("marks build failed when vite build fails", () => {
    const build = cmd(
      "npm run build",
      false,
      "> tsc -p tsconfig.json && vite build",
      "error during build",
    );
    const resolved = resolveRunVerification({
      run: {
        ...emptyGreenfieldRun(),
        runResult: "failed",
        setupResult: {
          ok: false,
          install: cmd("npm install", true),
          typecheck: cmd("npx tsc --noEmit", true),
          build,
        },
        entries: [createRunLogEntry("build", "failed", "Build failed")],
      },
    });
    assert.equal(inferBuildPassedFromCommand(build), false);
    assert.equal(resolved.build, "failed");
  });

  it("keeps success when advisory UI audit is present but pipeline passed", () => {
    const build = cmd(
      "npm run build",
      true,
      "> tsc -p tsconfig.json && vite build\n✓ built in 900ms",
    );
    const resolved = resolveRunVerification({
      run: {
        ...emptyGreenfieldRun(),
        runResult: "success",
        setupResult: {
          ok: true,
          install: cmd("npm install", true),
          typecheck: cmd("npx tsc --noEmit", true),
          build,
        },
        uiAuditResult: minimalUiAudit({
          ok: false,
          advisory: true,
          skipped: false,
          type: "grid_layout",
          score: 40,
          issues: ["insufficient_cells"],
          details: "Advisory layout issue",
        }),
        entries: [
          createRunLogEntry("typescript", "success", "TypeScript check finished"),
          createRunLogEntry("build", "success", "Build finished"),
          createRunLogEntry("preview", "success", "Preview ready"),
          createRunLogEntry("ui_audit", "success", "UI audit advisory"),
        ],
      },
    });
    assert.equal(resolved.uiAudit, "advisory");
    assert.equal(allCoreVerificationPassed(resolved), true);
    assert.equal(
      shouldIgnoreStaleFailureReport(
        { ...emptyGreenfieldRun(), runResult: "success" },
        resolved,
      ),
      true,
    );
  });

  it("marks UI audit skipped when audit did not run", () => {
    const resolved = resolveRunVerification({
      run: {
        ...emptyGreenfieldRun(),
        runResult: "success",
        uiAuditResult: minimalUiAudit({
          ok: true,
          skipped: true,
          skipReason: "No preview URL available.",
          details: "No preview URL available.",
        }),
        entries: [
          createRunLogEntry("ui_audit", "success", "UI audit skipped", "No preview URL"),
        ],
      },
    });
    assert.equal(resolved.uiAudit, "skipped");
  });
});

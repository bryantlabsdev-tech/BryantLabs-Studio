import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldOfferGreenfieldRepair,
} from "@/app/orchestration/greenfieldRepairOrchestration";
import {
  GREENFIELD_REPAIR_CONFIG_PATHS,
  GREENFIELD_REPAIR_PRIMARY_PATHS,
  buildGreenfieldRepairPromptText,
  createGreenfieldRepairSnapshot,
  greenfieldRepairAllowedPaths,
  greenfieldRepairAskHeadline,
  greenfieldSetupToVerification,
  isAllowedGreenfieldRepairPath,
  mergeSetupAfterBuild,
  mergeSetupAfterTypecheck,
  pickGreenfieldRepairTarget,
} from "@/core/greenfield/repair";
import { deriveRunResult } from "@/core/greenfield/runLog";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import type { CommandResult } from "@/types";

const okCmd = (command: string): CommandResult => ({
  command,
  ok: true,
  exitCode: 0,
  stdout: "",
  stderr: "",
  durationMs: 1,
  errorCount: 0,
  warningCount: 0,
  timedOut: false,
  truncated: false,
});

const failTsc: CommandResult = {
  command: "npx tsc --noEmit",
  ok: false,
  exitCode: 2,
  stdout: "",
  stderr:
    "src/App.tsx(265,13): error TS2322: Type 'Appointment | undefined' is not assignable to type 'Appointment | null'.",
  durationMs: 1,
  errorCount: 1,
  warningCount: 0,
  timedOut: false,
  truncated: false,
};

function tsFailedSetup(): GreenfieldSetupResult {
  return {
    ok: false,
    install: okCmd("npm install"),
    typecheck: failTsc,
    typecheckDetails: {
      command: "npx tsc --noEmit",
      exitCode: 2,
      stdout: "",
      stderr: failTsc.stderr,
      durationMs: 1,
      timedOut: false,
      truncated: false,
      diagnostics: [
        {
          file: "src/App.tsx",
          line: 265,
          column: 13,
          code: "TS2322",
          message:
            "Type 'Appointment | undefined' is not assignable to type 'Appointment | null'.",
          category: "error",
          raw: failTsc.stderr,
        },
      ],
    },
    error: "TypeScript check failed (1 error).",
  };
}

describe("greenfield repair scope", () => {
  it("allows primary generated app paths by default", () => {
    for (const p of GREENFIELD_REPAIR_PRIMARY_PATHS) {
      assert.equal(isAllowedGreenfieldRepairPath(p, null), true);
    }
  });

  it("blocks config paths unless diagnostic references them", () => {
    for (const p of GREENFIELD_REPAIR_CONFIG_PATHS) {
      assert.equal(isAllowedGreenfieldRepairPath(p, null), false);
    }
    assert.equal(
      isAllowedGreenfieldRepairPath("tsconfig.json", {
        kind: "typescript",
        file: "tsconfig.json",
        line: 1,
        column: 1,
        message: "Cannot read tsconfig.json",
        code: "TS5058",
      }),
      true,
    );
  });

  it("pickGreenfieldRepairTarget prefers App.tsx for TS errors", () => {
    const setup = tsFailedSetup();
    const target = pickGreenfieldRepairTarget(setup, [
      "package.json",
      "src/App.tsx",
      "src/index.css",
    ]);
    assert.equal(target, "src/App.tsx");
  });

  it("repair prompt includes errors and strict fix instructions", () => {
    const setup = tsFailedSetup();
    const prompt = buildGreenfieldRepairPromptText({
      userPrompt: "Build a salon app",
      generatedFiles: ["src/App.tsx"],
      setup,
      targetPath: "src/App.tsx",
      targetContent: "export {}",
      attempt: 1,
      maxAttempts: 2,
    });
    assert.match(prompt, /TS2322/);
    assert.match(prompt, /Do NOT redesign/);
    assert.match(prompt, /@@FILE:src\/App\.tsx@@/);
    assert.match(prompt, /\?\? null/);
  });
});

describe("greenfield repair gating", () => {
  it("verification omits failed build when typecheck failed", () => {
    const setup = tsFailedSetup();
    const v = greenfieldSetupToVerification(setup);
    assert.equal(v.typecheck.ok, false);
    assert.equal(v.build.ok, false);
    assert.equal(setup.build, undefined);
  });

  it("mergeSetupAfterTypecheck does not add build", () => {
    const setup = tsFailedSetup();
    const merged = mergeSetupAfterTypecheck(setup, failTsc, setup.typecheckDetails);
    assert.equal(merged.build, undefined);
    assert.equal(merged.ok, false);
  });

  it("mergeSetupAfterBuild marks setup ok only when build passes", () => {
    const base = {
      ok: false,
      install: okCmd("npm install"),
      typecheck: okCmd("npx tsc --noEmit"),
    };
    const pass = mergeSetupAfterBuild(base, okCmd("npm run build"));
    assert.equal(pass.ok, true);
    const fail = mergeSetupAfterBuild(base, {
      ...okCmd("npm run build"),
      ok: false,
      exitCode: 1,
    });
    assert.equal(fail.ok, false);
  });
});

describe("greenfield repair modes", () => {
  it("off mode does not offer repair", () => {
    assert.equal(shouldOfferGreenfieldRepair(tsFailedSetup(), "off"), false);
  });

  it("ask mode offers repair when typecheck fails after install", () => {
    assert.equal(shouldOfferGreenfieldRepair(tsFailedSetup(), "ask"), true);
  });

  it("automatic mode offers repair when typecheck fails after install", () => {
    assert.equal(shouldOfferGreenfieldRepair(tsFailedSetup(), "automatic"), true);
  });

  it("does not offer repair when npm install fails", () => {
    const setup: GreenfieldSetupResult = {
      ok: false,
      install: { ...okCmd("npm install"), ok: false, exitCode: 1 },
      error: "npm install failed.",
    };
    assert.equal(shouldOfferGreenfieldRepair(setup, "automatic"), false);
  });
});

describe("greenfield repair ask headline", () => {
  it("offers cleanup wording for TS6133", () => {
    const setup: GreenfieldSetupResult = {
      ok: false,
      install: okCmd("npm install"),
      typecheck: failTsc,
      typecheckDetails: {
        command: "npx tsc --noEmit",
        exitCode: 2,
        stdout: "",
        stderr: failTsc.stderr,
        durationMs: 1,
        timedOut: false,
        truncated: false,
        diagnostics: [
          {
            file: "src/App.tsx",
            line: 1,
            column: 1,
            code: "TS6133",
            message: "'useMemo' is declared but its value is never read.",
            category: "error",
            raw: "",
          },
        ],
      },
      error: "TypeScript check failed (1 error).",
    };
    assert.match(greenfieldRepairAskHeadline(setup), /cleanup errors/i);
  });
});

describe("greenfield repair run state", () => {
  it("deriveRunResult stays running during repair_needed", () => {
    const result = deriveRunResult(
      [
        {
          id: "1",
          timestamp: new Date().toISOString(),
          stage: "greenfield_repair",
          status: "running",
          message: "Repair needed",
        },
      ],
      {
        genStatus: "done",
        writeStatus: "done",
        setupStatus: "repair_needed",
      },
    );
    assert.equal(result, "running");
  });

  it("createGreenfieldRepairSnapshot marks repair_needed", () => {
    const setup = tsFailedSetup();
    const snap = createGreenfieldRepairSnapshot({
      setup,
      userPrompt: "test",
      generatedFiles: ["src/App.tsx"],
      targetPath: "src/App.tsx",
      targetContent: "x",
      maxAttempts: 2,
    });
    assert.equal(snap.status, "repair_needed");
    assert.match(snap.primaryErrorLine, /App\.tsx/);
    assert.equal(greenfieldRepairAllowedPaths(null).length, 3);
  });
});

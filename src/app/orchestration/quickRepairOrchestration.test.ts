import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyQuickRepairsForSetup } from "@/app/orchestration/quickRepairOrchestration";
import { runQuickRepairAndReverify } from "@/app/orchestration/quickRepairOrchestration";
import { verificationToSetupResult } from "@/app/orchestration/followUpVerifyRepairOrchestration";
import type { BryantLabsApi, VerificationResult } from "@/types";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";

function failTscVerification(): VerificationResult {
  return {
    typecheck: {
      command: "npx tsc --noEmit",
      ok: false,
      exitCode: 2,
      stdout: "",
      stderr:
        "src/App.tsx(1,7): error TS6133: 'unusedVar' is declared but its value is never read.",
      durationMs: 1,
      errorCount: 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    },
    build: {
      command: "npm run build",
      ok: false,
      exitCode: 2,
      stdout: "",
      stderr: "",
      durationMs: 1,
      errorCount: 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    },
    ranAt: Date.now(),
  };
}

describe("quickRepairOrchestration", () => {
  it("prefixes unused symbols and re-verifies", async () => {
    const source = [
      "const unusedVar = 1;",
      "export default function App() {",
      "  return <div>hi</div>;",
      "}",
    ].join("\n");

    let verifyCalls = 0;
    const api = {
      readFile: async () => ({ readable: true, content: source }),
      applyEdit: async (_abs: string, basis: string, next: string) => ({
        ok: basis !== next,
        reason: basis === next ? "no change" : undefined,
      }),
      verify: async () => {
        verifyCalls += 1;
        if (verifyCalls === 1) return failTscVerification();
        return {
          ...failTscVerification(),
          typecheck: { ...failTscVerification().typecheck, ok: true, exitCode: 0, errorCount: 0 },
          build: { ...failTscVerification().build, ok: true, exitCode: 0, errorCount: 0 },
        };
      },
    } as unknown as BryantLabsApi;

    const logs: string[] = [];
    const result = await runQuickRepairAndReverify(
      api,
      "/proj",
      failTscVerification(),
      {
        appendGreenfieldRunLog: (_stage, _status, message) => {
          logs.push(message);
        },
      },
    );

    assert.equal(result.fixed, true);
    assert.equal(result.verification.typecheck.ok, true);
    assert.ok(logs.some((line) => line.includes("Quick repair")));
  });

  it("repairs FleetOps A25 missing Driver fields without LLM (TS2739)", async () => {
    const types = `export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  email: string;
  phone: string;
  status: "Active" | "Inactive";
}
`;
    const dashboard = `import type { Driver } from '../types';

const drivers: Driver[] = [
  {
    id: "1",
    firstName: "John",
    lastName: "Doe",
    licenseNumber: "ABC123",
    status: "Active",
  },
];

export default function Dashboard() {
  return <div>{drivers.length}</div>;
}
`;

    let proposeCalls = 0;
    const files = new Map<string, string>([
      ["src/types.ts", types],
      ["src/pages/Dashboard.tsx", dashboard],
    ]);

    const api = {
      readFile: async (abs: string) => {
        const rel = abs.replace("/proj/", "");
        const content = files.get(rel);
        return content != null
          ? { readable: true, content }
          : { readable: false, content: undefined };
      },
      applyEdit: async (_abs: string, _basis: string, next: string) => {
        files.set("src/pages/Dashboard.tsx", next);
        return { ok: true };
      },
      greenfieldTypecheck: async () => ({
        typecheck: {
          command: "npx tsc --noEmit",
          ok: true,
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 1,
          errorCount: 0,
          warningCount: 0,
          timedOut: false,
          truncated: false,
        },
      }),
      proposeAutoFix: async () => {
        proposeCalls += 1;
        return { ok: false, error: "LLM should not be called" };
      },
    } as unknown as BryantLabsApi;

    const setup: GreenfieldSetupResult = {
      ok: false,
      install: { command: "npm install", ok: true, exitCode: 0, stdout: "", stderr: "", durationMs: 1, errorCount: 0, warningCount: 0, timedOut: false, truncated: false },
      typecheck: {
        command: "npx tsc --noEmit",
        ok: false,
        exitCode: 2,
        stdout: "",
        stderr:
          'src/pages/Dashboard.tsx(4,3): error TS2739: Type \'{ id: string; firstName: string; lastName: string; licenseNumber: string; status: "Active"; }\' is missing the following properties from type \'Driver\': email, phone',
        durationMs: 1,
        errorCount: 1,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      },
    };

    const result = await applyQuickRepairsForSetup(
      api,
      "/proj",
      setup,
      { appendGreenfieldRunLog: () => {} },
      async (prev) => {
        const res = await api.greenfieldTypecheck("/proj");
        if ("error" in res) return prev;
        return { ...prev, typecheck: res.typecheck, ok: res.typecheck.ok };
      },
    );

    assert.equal(result.fixed, true);
    assert.equal(proposeCalls, 0);
    const patched = files.get("src/pages/Dashboard.tsx") ?? "";
    assert.match(patched, /email: ""/);
    assert.match(patched, /phone: ""/);
    assert.equal(result.setup.typecheck?.ok, true);
  });
});

describe("followUpVerifyRepairOrchestration", () => {
  it("maps verification to minimal setup result", () => {
    const verification: VerificationResult = {
      typecheck: {
        command: "npx tsc --noEmit",
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
        errorCount: 0,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      },
      build: {
        command: "npm run build",
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
        errorCount: 0,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      },
      ranAt: 1,
    };
    const setup = verificationToSetupResult(verification);
    assert.equal(setup.ok, true);
    assert.equal(setup.typecheck?.ok, true);
    assert.equal(setup.build?.ok, true);
  });
});

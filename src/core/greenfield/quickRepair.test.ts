import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyQuickRepairsForFile,
  extractUnusedSymbol,
} from "@/core/greenfield/quickRepair";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";

function diag(
  code: string,
  message: string,
  line = 1,
  column = 1,
  file = "src/App.tsx",
): TypeScriptDiagnostic {
  return {
    file,
    line,
    column,
    code,
    message,
    category: "error",
    raw: message,
  };
}

describe("quickRepair", () => {
  it("extracts unused symbol from TS6133 message", () => {
    assert.equal(
      extractUnusedSymbol("'useMemo' is declared but its value is never read."),
      "useMemo",
    );
  });

  it("removes unused named imports", () => {
    const source = `import { useMemo, useState } from "react";\n`;
    const next = source.replace(
      /import \{ useMemo, useState \} from "react";/,
      'import { useState } from "react";',
    );
    const repaired = applyQuickRepairsForFile(
      "src/App.tsx",
      source,
      [diag("TS6133", "'useMemo' is declared but its value is never read.")],
    );
    assert.ok(repaired);
    assert.equal(repaired!.content, next);
  });

  it("removes unused function declarations", () => {
    const source = [
      "function solveSudoku() {",
      "  return true;",
      "}",
      "export default function App() { return null; }",
    ].join("\n");
    const repaired = applyQuickRepairsForFile(
      "src/App.tsx",
      source,
      [diag("TS6133", "'solveSudoku' is declared but its value is never read.", 1)],
    );
    assert.ok(repaired);
    assert.match(repaired!.content, /export default function App/);
    assert.doesNotMatch(repaired!.content, /solveSudoku/);
  });

  it("prefixes unused for-loop variables instead of deleting the loop", () => {
    const source = [
      "export default function App() {",
      "  for (let rowIdx = 0; rowIdx < 9; rowIdx++) {",
      "    console.log(rowIdx);",
      "  }",
      "  return null;",
      "}",
    ].join("\n");
    const repaired = applyQuickRepairsForFile(
      "src/App.tsx",
      source,
      [diag("TS6133", "'colIdx' is declared but its value is never read.", 2)],
    );
    if (repaired) {
      assert.doesNotMatch(repaired.content, /for \(let rowIdx/);
    }
    const loopSource = [
      "export default function App() {",
      "  for (let rowIdx = 0; rowIdx < 9; rowIdx++) {",
      "    for (let colIdx = 0; colIdx < 9; colIdx++) {",
      "      void 0;",
      "    }",
      "  }",
      "  return null;",
      "}",
    ].join("\n");
    const loopRepaired = applyQuickRepairsForFile(
      "src/App.tsx",
      loopSource,
      [diag("TS6133", "'colIdx' is declared but its value is never read.", 3)],
    );
    assert.ok(loopRepaired);
    assert.match(loopRepaired!.content, /for \(let _colIdx/);
    assert.match(loopRepaired!.content, /for \(let rowIdx/);
    assert.doesNotMatch(loopRepaired!.content, /Expression expected/);
  });

  it("adds null guard for TS2345 number|null to number", () => {
    const source = [
      "function isValid(value: number) { return value > 0; }",
      "export default function App() {",
      "  const cellValue: number | null = 1;",
      "  return isValid(cellValue);",
      "}",
    ].join("\n");
    const repaired = applyQuickRepairsForFile(
      "src/App.tsx",
      source,
      [
        diag(
          "TS2345",
          "Argument of type 'number | null' is not assignable to parameter of type 'number'.",
          4,
          20,
        ),
      ],
    );
    assert.ok(repaired);
    assert.match(repaired!.content, /if \(cellValue == null\)/);
    assert.match(repaired!.content, /return isValid\(cellValue\)/);
  });

  it("adds null guard for TS2345 string|null to string", () => {
    const source = [
      "function labelFor(name: string) { return name.toUpperCase(); }",
      "export default function App() {",
      "  const name: string | null = 'x';",
      "  return labelFor(name);",
      "}",
    ].join("\n");
    const repaired = applyQuickRepairsForFile(
      "src/App.tsx",
      source,
      [
        diag(
          "TS2345",
          "Argument of type 'string | null' is not assignable to parameter of type 'string'.",
          4,
          22,
        ),
      ],
    );
    assert.ok(repaired);
    assert.match(repaired!.content, /if \(name == null\)/);
  });

  it("prefixes unused useState setter in array destructuring", () => {
    const source = [
      "function App() {",
      "  const [jobs, setJobs] = useLocalStorage<Job[]>('fieldflow_jobs', []);",
      "  return jobs.length;",
      "}",
    ].join("\n");
    const repaired = applyQuickRepairsForFile(
      "src/App.tsx",
      source,
      [diag("TS6133", "'setJobs' is declared but its value is never read.", 2, 16)],
    );
    assert.ok(repaired);
    assert.match(repaired!.content, /\[jobs, _setJobs\]/);
  });

  it("adds missing useState import when React default import was removed (A17)", () => {
    const source = [
      "import { Plus } from 'lucide-react';",
      "const Estimates = () => {",
      "  const [estimates, _setEstimates] = useState([]);",
      "  return null;",
      "};",
    ].join("\n");
    const repaired = applyQuickRepairsForFile(
      "src/pages/Estimates.tsx",
      source,
      [diag("TS2304", "Cannot find name 'useState'.", 3, 38, "src/pages/Estimates.tsx")],
    );
    assert.ok(repaired);
    assert.match(repaired!.content, /import \{ useState \} from "react"/);
  });

  it("fixes self-comparison typos in delete handlers (FieldFlow A11)", () => {
    const source =
      "const deleteEstimate = (id: string) => setEstimates((prev) => prev.filter((e) => e.id !== e.id));";
    const repaired = applyQuickRepairsForFile(
      "src/App.tsx",
      source,
      [diag("TS6133", "'id' is declared but its value is never read.", 1, 27)],
    );
    assert.ok(repaired);
    assert.match(repaired!.content, /e\.id !== id/);
    assert.doesNotMatch(repaired!.content, /e\.id !== e\.id/);
  });

  it("adds missing Driver properties deterministically (FleetOps A25)", async () => {
    const { applyQuickRepairsForFileAsync } = await import("@/core/greenfield/quickRepair");
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
    const source = `import type { Driver } from '../types';

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
    const repaired = await applyQuickRepairsForFileAsync(
      "src/pages/Dashboard.tsx",
      source,
      [
        diag(
          "TS2739",
          "Type '{ id: string; firstName: string; lastName: string; licenseNumber: string; status: \"Active\"; }' is missing the following properties from type 'Driver': email, phone",
          4,
          3,
          "src/pages/Dashboard.tsx",
        ),
      ],
      async (path) => (path === "src/types.ts" ? types : null),
    );
    assert.ok(repaired);
    assert.match(repaired!.content, /email: ""/);
    assert.match(repaired!.content, /phone: ""/);
  });
});

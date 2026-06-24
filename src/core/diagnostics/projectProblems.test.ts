import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeProjectProblems,
  monacoMarkersToProblems,
  toRelativeProjectPath,
} from "@/core/diagnostics/projectProblems";

describe("projectProblems", () => {
  const root = "/Users/dev/my-app";

  it("converts monaco markers under the project root", () => {
    const problems = monacoMarkersToProblems(root, [
      {
        resource: { path: "/Users/dev/my-app/src/App.tsx" },
        startLineNumber: 4,
        startColumn: 2,
        code: "TS2304",
        message: "Cannot find name 'Foo'.",
        severity: 8,
      },
    ]);
    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.file, "src/App.tsx");
    assert.equal(problems[0]?.source, "monaco");
    assert.equal(problems[0]?.severity, "error");
  });

  it("ignores markers outside the project root", () => {
    const problems = monacoMarkersToProblems(root, [
      {
        resource: { path: "/tmp/other.ts" },
        startLineNumber: 1,
        startColumn: 1,
        message: "nope",
        severity: 8,
      },
    ]);
    assert.equal(problems.length, 0);
  });

  it("merges typescript and monaco without duplicates", () => {
    const merged = mergeProjectProblems(
      [
        {
          file: "src/App.tsx",
          absFile: `${root}/src/App.tsx`,
          line: 4,
          column: 2,
          code: "TS2304",
          message: "Cannot find name 'Foo'.",
          severity: "error",
          source: "typescript",
        },
      ],
      [
        {
          file: "src/App.tsx",
          absFile: `${root}/src/App.tsx`,
          line: 4,
          column: 2,
          code: "TS2304",
          message: "Cannot find name 'Foo'.",
          severity: "error",
          source: "monaco",
        },
        {
          file: "src/util.ts",
          absFile: `${root}/src/util.ts`,
          line: 1,
          column: 1,
          code: "TS6133",
          message: "unused",
          severity: "warning",
          source: "monaco",
        },
      ],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.source, "typescript");
    assert.equal(merged[1]?.file, "src/util.ts");
  });

  it("normalizes relative paths from absolute project files", () => {
    assert.equal(
      toRelativeProjectPath(root, "/Users/dev/my-app/src/main.ts"),
      "src/main.ts",
    );
  });
});

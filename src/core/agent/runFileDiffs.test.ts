import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import {
  extractRunFileDiffs,
  freezePlanApplyFileDiffs,
  resolveAllowGeneratedFileDiffs,
} from "@/core/agent/runFileDiffs";
import { emptyGreenfieldRun, type GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import type { PlanApplyFileEntry } from "@/core/planApply/types";

function emptyCard(): AgentRunCardViewModel {
  return {
    filesModified: [],
    patchImpact: { files: [], totalAdded: 0, totalRemoved: 0 },
  } as unknown as AgentRunCardViewModel;
}

describe("extractRunFileDiffs", () => {
  it("freezes greenfield generated file content into historical diffs", () => {
    const generatedFiles = GREENFIELD_FILE_PATHS.map((path, index) => ({
      path,
      content: `// file ${index}\nexport const value = ${index};\n`,
    }));
    const diffs = extractRunFileDiffs({
      card: emptyCard(),
      generatedFiles,
      allowGeneratedFiles: true,
    });
    assert.equal(diffs.length, GREENFIELD_FILE_PATHS.length);
    assert.equal(diffs[0]?.before, "");
    assert.match(diffs[0]?.after ?? "", /file 0/);
    assert.ok((diffs[0]?.linesAdded ?? 0) > 0);
    assert.ok((diffs[0]?.preview.length ?? 0) > 0);
  });

  it("freezes apply session proposals before session clear", () => {
    const beforeCss = ".table { width: 100%; }\n";
    const afterCss = `${beforeCss}@media (max-width: 768px) { table { overflow-x: auto; } }\n`;
    const files: PlanApplyFileEntry[] = [
      {
        relPath: "src/index.css",
        absPath: "/p/src/index.css",
        selectionReason: "AI plan",
        planReason: "Responsive scroll",
        status: "ready",
        decision: "approved",
        basisContent: beforeCss,
        proposal: {
          summary: "Deterministic UI audit fix",
          newContent: afterCss,
          reasoning: "",
          risks: [],
        },
        diffStats: { added: 2, removed: 0, changed: true },
      },
    ];
    const frozen = freezePlanApplyFileDiffs(files, ["src/index.css"]);
    assert.equal(frozen.length, 1);
    assert.equal(frozen[0]?.path, "src/index.css");
    assert.equal(frozen[0]?.before, beforeCss);
    assert.match(frozen[0]?.after ?? "", /overflow-x:\s*auto/);
    assert.ok((frozen[0]?.linesAdded ?? 0) > 0);

    const extracted = extractRunFileDiffs({
      card: emptyCard(),
      planApplySession: null,
      appliedFileDiffs: frozen,
    });
    assert.equal(extracted.length, 1);
    assert.match(extracted[0]?.after ?? "", /overflow-x:\s*auto/);
  });

  it("prefers appliedFileDiffs over stale generatedFiles on follow-up runs", () => {
    const generatedFiles = GREENFIELD_FILE_PATHS.map((path) => ({
      path,
      content: "// stale greenfield\n",
    }));
    const applied = [
      {
        path: "src/components/History.tsx",
        linesAdded: 3,
        linesRemoved: 0,
        preview: [],
        before: "",
        after: "export function History() {}\n",
      },
    ];
    const diffs = extractRunFileDiffs({
      card: emptyCard(),
      generatedFiles,
      appliedFileDiffs: applied,
      allowGeneratedFiles: false,
    });
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0]?.path, "src/components/History.tsx");
  });

  it("allows generated file evidence when greenfield files were written", () => {
    const run: GreenfieldRunSnapshot = {
      ...emptyGreenfieldRun(),
      genStatus: "done",
      generatedFiles: GREENFIELD_FILE_PATHS.map((path) => ({
        path,
        content: `// ${path}\n`,
      })),
      filesWritten: [...GREENFIELD_FILE_PATHS],
    };
    assert.equal(resolveAllowGeneratedFileDiffs(run), true);
    const diffs = extractRunFileDiffs({
      card: emptyCard(),
      generatedFiles: run.generatedFiles,
      allowGeneratedFiles: resolveAllowGeneratedFileDiffs(run),
    });
    assert.equal(diffs.length, GREENFIELD_FILE_PATHS.length);
    assert.ok(diffs[0]?.after?.includes("package.json"));
  });
});

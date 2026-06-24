import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GreenfieldManifest } from "@/core/greenfield/manifestPlanner";
import {
  collectMissingTypeExportNames,
  repairLegacyFieldFlowTypesInProject,
  repairMissingTypeExports,
  stripLegacyFieldFlowTypes,
  stubExportForTypeName,
} from "@/core/greenfield/typesExportRepair";

function medTrackManifest(): GreenfieldManifest {
  return {
    appName: "MedTrack",
    useTailwind: true,
    useRouter: true,
    useLucide: true,
    useLocalStorage: true,
    pages: [
      {
        id: "patients",
        title: "Patients",
        route: "/patients",
        path: "src/pages/Patients.tsx",
      },
    ],
    sharedPaths: [],
    pagePaths: ["src/pages/Patients.tsx"],
    integrationPath: "src/App.tsx",
  };
}

describe("typesExportRepair", () => {
  it("stubs Status union types", () => {
    assert.match(stubExportForTypeName("DeadlineStatus"), /export type DeadlineStatus/);
  });

  it("patches missing exports into src/types.ts", () => {
    const files = [
      {
        path: "src/types.ts" as const,
        content: "export interface Case { id: string; }\n",
      },
      {
        path: "src/pages/Deadlines.tsx" as const,
        content: 'import { DeadlineStatus } from "../types";\n',
      },
    ];
    assert.deepEqual(collectMissingTypeExportNames(files), ["DeadlineStatus"]);
    const repaired = repairMissingTypeExports(files);
    assert.equal(repaired.repaired.length, 1);
    assert.match(repaired.files.find((f) => f.path === "src/types.ts")!.content, /DeadlineStatus/);
  });

  it("strips legacy FieldFlow types when manifest pages do not match", () => {
    const types = [
      "export interface Patient { id: string; name: string; }",
      "export interface Invoice { id: string; total: number; }",
      "",
    ].join("\n");
    const manifest = medTrackManifest();
    const stripped = stripLegacyFieldFlowTypes(types, manifest);
    assert.ok(stripped);
    assert.deepEqual(stripped!.removed, ["Invoice"]);
    assert.doesNotMatch(stripped!.content, /interface Invoice/);
    assert.match(stripped!.content, /interface Patient/);
  });

  it("repairs legacy FieldFlow types in project files", () => {
    const files = [
      {
        path: "src/types.ts" as const,
        content: "export interface Patient { id: string; }\nexport interface Invoice { id: string; }\n",
      },
    ];
    const manifest = medTrackManifest();
    const repaired = repairLegacyFieldFlowTypesInProject(files, manifest);
    assert.deepEqual(repaired.removed, ["Invoice"]);
    assert.doesNotMatch(
      repaired.files.find((f) => f.path === "src/types.ts")!.content,
      /interface Invoice/,
    );
  });
});

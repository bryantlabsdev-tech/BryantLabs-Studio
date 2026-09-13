import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAllowedProjectFilesFromResponse } from "@/core/greenfield/parseProjectFile";

describe("parseAllowedProjectFilesFromResponse", () => {
  it("extracts nested directories and public assets", () => {
    const raw = [
      "@@FILE:src/components/jobs/JobCard.tsx@@\nexport function JobCard() { return null; }\n@@END:src/components/jobs/JobCard.tsx@@",
      "@@FILE:public/logo.svg@@\n<svg />\n@@END:public/logo.svg@@",
      "@@FILE:../evil.ts@@\nexport const x = 1;\n@@END:../evil.ts@@",
    ].join("\n");
    const files = parseAllowedProjectFilesFromResponse(raw);
    const paths = files.map((f) => f.path as string);
    assert.equal(paths.includes("src/components/jobs/JobCard.tsx"), true);
    assert.equal(paths.includes("public/logo.svg"), true);
    assert.equal(paths.includes("../evil.ts"), false);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GREENFIELD_PATHS } from "./paths.cjs";
import { parseGreenfieldResponseDetailed } from "./parse.cjs";

function markerBody(path: string, content: string, end: string): string {
  return `@@FILE:${path}@@\n${content}\n${end}\n`;
}

function allSevenWithEnd(endFor: (path: string) => string): string {
  return GREENFIELD_PATHS.map((p) =>
    markerBody(p, `content-${p}`, endFor(p)),
  ).join("");
}

describe("parseGreenfieldResponseDetailed", () => {
  it("parses @@FILE:path@@ ... @@END@@", () => {
    const text = allSevenWithEnd(() => "@@END@@");
    const result = parseGreenfieldResponseDetailed(text);
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
    assert.deepEqual(result.diagnostics.parsedFiles, [...GREENFIELD_PATHS]);
    assert.equal(result.diagnostics.missingFiles.length, 0);
  });

  it("parses @@FILE:path@@ ... @@END:path@@", () => {
    const text = allSevenWithEnd((p) => `@@END:${p}@@`);
    const result = parseGreenfieldResponseDetailed(text);
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
  });

  it("fails with clear missing-file list", () => {
    const text = markerBody("package.json", "{}", "@@END:package.json@@");
    const result = parseGreenfieldResponseDetailed(text);
    assert.equal(result.ok, false);
    assert.match(result.errorMessage ?? "", /Missing required files:/);
    assert.ok(result.diagnostics.missingFiles.includes("index.html"));
    assert.ok(result.diagnostics.missingFiles.includes("vite.config.ts"));
    assert.equal(result.diagnostics.parsedFiles.length, 1);
  });

  it("rejects unexpected file paths", () => {
    const text =
      markerBody("README.md", "nope", "@@END@@") +
      allSevenWithEnd((p) => `@@END:${p}@@`);
    const result = parseGreenfieldResponseDetailed(text);
    assert.equal(result.ok, false);
    assert.match(result.errorMessage ?? "", /Unexpected file paths:/);
    assert.ok(result.diagnostics.unexpectedFiles.includes("README.md"));
  });

  it("handles whitespace around markers", () => {
    const text = GREENFIELD_PATHS.map(
      (p) => `@@FILE: ${p} @@\nbody-${p}\n@@END : ${p} @@\n`,
    ).join("");
    const result = parseGreenfieldResponseDetailed(text);
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
  });

  it("normalizes ./ prefix and backslashes", () => {
    const text = GREENFIELD_PATHS.map((p) =>
      markerBody(`.\\${p.replace(/\//g, "\\")}`, `x-${p}`, `@@END@@`),
    ).join("");
    const result = parseGreenfieldResponseDetailed(text);
    assert.equal(result.ok, true);
  });

  it("records detected file and end markers in diagnostics", () => {
    const text =
      markerBody("package.json", "{}", "@@END:package.json@@") +
      markerBody("index.html", "<html/>", "@@END@@");
    const result = parseGreenfieldResponseDetailed(text);
    assert.ok(result.diagnostics.detectedFileMarkers.includes("package.json"));
    assert.ok(result.diagnostics.detectedEndMarkers.includes("@@END:package.json@@"));
    assert.ok(result.diagnostics.detectedEndMarkers.includes("@@END@@"));
  });
});

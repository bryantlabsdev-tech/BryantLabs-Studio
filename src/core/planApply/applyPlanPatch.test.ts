import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPLY_PLAN_PATCH_FORMAT_ERROR,
  parseApplyPlanMarkedFiles,
} from "@/core/planApply/markedFileParse";
import { simulateApplyPlanBatchResponses } from "@/core/planApply/applyPlanBatchSimulate";
import { buildApplyPlanPatchFormatRootCause } from "@/core/planApply/proposalDiagnostics";

const TARGETS = ["src/App.tsx", "src/index.css"] as const;

const PROSE_ONLY =
  "I'll make the calculator UI premium by refining typography, spacing, and button styles in App.tsx and index.css.";

const VALID_APP = `export default function App() { return <div className="premium" />; }`;
const VALID_CSS = `.premium { color: gold; }`;

function markerBlock(path: string, content: string): string {
  return `@@FILE:${path}@@\n${content}\n@@END:${path}@@`;
}

function shortMarkerBlock(path: string, content: string): string {
  return `@@FILE:${path}\n${content}\n@@END`;
}

describe('Apply Plan patch format ("Make calculator UI premium")', () => {
  it("classifies prose-only model output as PATCH_FORMAT_ERROR", () => {
    const parsed = parseApplyPlanMarkedFiles(PROSE_ONLY, TARGETS);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.errorCode, APPLY_PLAN_PATCH_FORMAT_ERROR);
    assert.deepEqual(parsed.missingPaths, [...TARGETS]);
    assert.equal(parsed.hasAnyFileMarker, false);
  });

  it("uses required root cause wording for UI targets", () => {
    assert.equal(
      buildApplyPlanPatchFormatRootCause(TARGETS),
      "Patch format error — AI did not return updated file content for src/App.tsx and src/index.css.",
    );
  });

  it("retries once after prose, then accepts valid @@FILE markers", () => {
    const valid = [
      markerBlock("src/App.tsx", VALID_APP),
      markerBlock("src/index.css", VALID_CSS),
    ].join("\n\n");

    const { final, repairAttempted, attempts } = simulateApplyPlanBatchResponses(
      [PROSE_ONLY, valid],
      TARGETS,
    );

    assert.equal(repairAttempted, true);
    assert.equal(attempts, 2);
    assert.equal(final.ok, true);
    assert.equal(final.files.get("src/App.tsx"), VALID_APP);
    assert.equal(final.files.get("src/index.css"), VALID_CSS);
  });

  it("after repair retry still reports per-file format failure when markers stay missing", () => {
    const { final, repairAttempted, attempts } = simulateApplyPlanBatchResponses(
      [PROSE_ONLY, PROSE_ONLY],
      TARGETS,
    );

    assert.equal(repairAttempted, true);
    assert.equal(attempts, 2);
    assert.equal(final.errorCode, APPLY_PLAN_PATCH_FORMAT_ERROR);
    assert.deepEqual(final.missingPaths, [...TARGETS]);
  });

  it("strips markdown fences inside @@FILE blocks as fallback", () => {
    const fenced = [
      "@@FILE:src/App.tsx@@",
      "```tsx",
      VALID_APP,
      "```",
      "@@END:src/App.tsx@@",
    ].join("\n");

    const parsed = parseApplyPlanMarkedFiles(fenced, ["src/App.tsx"]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.files.get("src/App.tsx"), VALID_APP);
  });

  it("parses short @@FILE:path newline … @@END form", () => {
    const text = [
      shortMarkerBlock("src/App.tsx", VALID_APP),
      shortMarkerBlock("src/index.css", VALID_CSS),
    ].join("\n\n");

    const parsed = parseApplyPlanMarkedFiles(text, TARGETS);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.files.get("src/App.tsx"), VALID_APP);
    assert.equal(parsed.files.get("src/index.css"), VALID_CSS);
  });

  it("salvages one file when the other block is missing (MISSING_FILES)", () => {
    const partial = shortMarkerBlock("src/App.tsx", VALID_APP);
    const parsed = parseApplyPlanMarkedFiles(partial, TARGETS);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.errorCode, "MISSING_FILES");
    assert.equal(parsed.files.get("src/App.tsx"), VALID_APP);
    assert.deepEqual(parsed.missingPaths, ["src/index.css"]);
  });

  it("retries once after partial parse (MISSING_FILES)", () => {
    const partial = shortMarkerBlock("src/App.tsx", VALID_APP);
    const complete = [
      shortMarkerBlock("src/App.tsx", VALID_APP),
      shortMarkerBlock("src/index.css", VALID_CSS),
    ].join("\n\n");

    const { final, repairAttempted, attempts } = simulateApplyPlanBatchResponses(
      [partial, complete],
      TARGETS,
    );

    assert.equal(repairAttempted, true);
    assert.equal(attempts, 2);
    assert.equal(final.ok, true);
    assert.equal(final.files.get("src/index.css"), VALID_CSS);
  });
});

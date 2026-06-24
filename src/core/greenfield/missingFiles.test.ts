import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectGreenfieldMissingFiles } from "@/core/greenfield/missingFiles";
import { emptyGreenfieldRun } from "@/core/greenfield/runState";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";

describe("collectGreenfieldMissingFiles", () => {
  it("returns empty when all files were written despite marker audit missing list", () => {
    const run = {
      ...emptyGreenfieldRun(),
      generatedFiles: GREENFIELD_FILE_PATHS.map((path) => ({
        path,
        content: `// ${path}\n`,
      })),
      filesWritten: [...GREENFIELD_FILE_PATHS],
      debug: {
        stage: "greenfield:generate / parse",
        requestStartedAt: new Date().toISOString(),
        elapsedMs: 100,
        errorMessage: "",
        markerAudit: {
          missingFiles: [...GREENFIELD_FILE_PATHS],
          completeMarkerPairs: [],
          detectedFileStarts: [...GREENFIELD_FILE_PATHS],
          requiredFiles: [...GREENFIELD_FILE_PATHS],
          hasExampleOutputFormat: true,
          explicitlyRequiresAllSeven: true,
          rawResponsePreview: "",
          promptCharCount: 100,
          promptSent: "Build app",
          detectedFileEnds: [],
        },
      },
    } satisfies Partial<import("@/core/greenfield/runState").GreenfieldRunSnapshot>;
    assert.deepEqual(collectGreenfieldMissingFiles(run as import("@/core/greenfield/runState").GreenfieldRunSnapshot), []);
  });

  it("lists only paths not present in generated or written files", () => {
    const run = {
      ...emptyGreenfieldRun(),
      generatedFiles: GREENFIELD_FILE_PATHS.filter((path) => path !== "src/App.tsx").map(
        (path) => ({ path, content: `// ${path}\n` }),
      ),
      filesWritten: GREENFIELD_FILE_PATHS.filter((path) => path !== "src/App.tsx"),
      debug: {
        stage: "greenfield:generate / parse",
        requestStartedAt: new Date().toISOString(),
        elapsedMs: 100,
        errorMessage: "",
        markerAudit: {
          missingFiles: ["src/App.tsx"],
          completeMarkerPairs: GREENFIELD_FILE_PATHS.filter((p) => p !== "src/App.tsx"),
          detectedFileStarts: [...GREENFIELD_FILE_PATHS],
          requiredFiles: [...GREENFIELD_FILE_PATHS],
          hasExampleOutputFormat: true,
          explicitlyRequiresAllSeven: true,
          rawResponsePreview: "",
          promptCharCount: 100,
          promptSent: "Build app",
          detectedFileEnds: [],
        },
      },
    } satisfies Partial<import("@/core/greenfield/runState").GreenfieldRunSnapshot>;
    assert.deepEqual(
      collectGreenfieldMissingFiles(run as import("@/core/greenfield/runState").GreenfieldRunSnapshot),
      ["src/App.tsx"],
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatWriteFileLogDetails,
  formatWriteFileLogMessage,
  type WriteFileLogEntry,
} from "@/core/greenfield/writeLog";

describe("writeLog", () => {
  it("formats overwrite success details", () => {
    const entry: WriteFileLogEntry = {
      path: "src/App.tsx",
      mkdir: "exists",
      overwrite: true,
      ok: true,
    };
    assert.equal(formatWriteFileLogMessage(entry), "Overwrote src/App.tsx");
    assert.match(formatWriteFileLogDetails(entry), /overwrite: yes/);
    assert.match(formatWriteFileLogDetails(entry), /directory: exists/);
  });

  it("formats mkdir failure with reason", () => {
    const entry: WriteFileLogEntry = {
      path: "package.json",
      mkdir: "failed",
      mkdirDetail: "EACCES: permission denied",
      overwrite: false,
      ok: false,
      reason: "EACCES: permission denied",
    };
    assert.equal(formatWriteFileLogMessage(entry), "Failed package.json");
    assert.match(formatWriteFileLogDetails(entry), /reason: EACCES/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOLDER_NOT_EMPTY_CODE,
  isFolderNotEmptyWriteError,
} from "@/core/greenfield/folderWrite";

describe("folderWrite", () => {
  it("detects folder-not-empty write errors", () => {
    assert.equal(
      isFolderNotEmptyWriteError({
        error: "Folder is not empty. Cannot write greenfield files into a non-empty directory.",
        code: FOLDER_NOT_EMPTY_CODE,
      }),
      true,
    );
    assert.equal(isFolderNotEmptyWriteError({ error: "Invalid path" }), false);
  });
});

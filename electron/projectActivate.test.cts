import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { prepareProjectSwitch } from "./projectActivate.cjs";
import { isActiveProjectRoot } from "./projectWriteCoordinator.cjs";

describe("projectActivate", () => {
  it("prepareProjectSwitch marks the next root active", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-activate-"));
    await prepareProjectSwitch(root);
    assert.equal(isActiveProjectRoot(root), true);
  });
});

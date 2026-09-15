import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  prepareProjectSwitch,
  PROJECT_SWITCH_OPTIONS,
  switchToProjectRoot,
} from "./projectActivate.cjs";
import { isActiveProjectRoot } from "./projectWriteCoordinator.cjs";

describe("projectActivate", () => {
  it("prepareProjectSwitch marks the next root active", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bl-activate-"));
    await prepareProjectSwitch(root);
    assert.equal(isActiveProjectRoot(root), true);
  });

  it("prepareProjectSwitch({ awaitPreviewStop: true }) does not resolve before preview shutdown", async () => {
    const nextRoot = await mkdtemp(path.join(tmpdir(), "bl-activate-await-"));
    let stopResolved = false;
    let releaseStop!: () => void;
    const stopPreviewAsync = () =>
      new Promise<void>((resolve) => {
        releaseStop = () => {
          stopResolved = true;
          resolve();
        };
      });

    let pendingResolved = false;
    const pending = prepareProjectSwitch(
      nextRoot,
      { awaitPreviewStop: true },
      { stopPreviewAsync },
    ).then(() => {
      pendingResolved = true;
    });

    await new Promise((r) => setTimeout(r, 30));
    assert.equal(pendingResolved, false);
    assert.equal(stopResolved, false);
    assert.equal(isActiveProjectRoot(nextRoot), false);

    releaseStop();
    await pending;
    assert.equal(stopResolved, true);
    assert.equal(pendingResolved, true);
    assert.equal(isActiveProjectRoot(nextRoot), true);
  });

  it("switchToProjectRoot requests awaited preview shutdown before activating the next root", async () => {
    const nextRoot = await mkdtemp(path.join(tmpdir(), "bl-switch-await-"));
    const events: string[] = [];
    let releaseStop!: () => void;
    const stopPreviewAsync = () =>
      new Promise<void>((resolve) => {
        events.push("stop-started");
        releaseStop = () => {
          events.push("stop-resolved");
          resolve();
        };
      });

    assert.equal(PROJECT_SWITCH_OPTIONS.awaitPreviewStop, true);
    const switched = switchToProjectRoot(
      nextRoot,
      (root) => {
        events.push("activated");
        assert.equal(root, nextRoot);
        assert.equal(isActiveProjectRoot(nextRoot), true);
      },
      { stopPreviewAsync },
    );

    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(events, ["stop-started"]);
    releaseStop();
    await switched;
    assert.deepEqual(events, ["stop-started", "stop-resolved", "activated"]);
  });
});

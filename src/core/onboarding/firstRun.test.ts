import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  readOnboardingComplete,
  shouldShowWelcomeScreen,
  writeOnboardingComplete,
} from "./firstRun";

const STORAGE_KEY = "bryantlabs.onboarding.v1";

function installLocalStorageMock(): () => void {
  const original = globalThis.localStorage;
  const mem = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => {
      mem.set(key, value);
    },
    removeItem: (key) => {
      mem.delete(key);
    },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  return () => {
    globalThis.localStorage = original;
  };
}

describe("firstRun onboarding", () => {
  let restoreLocalStorage: (() => void) | undefined;

  beforeEach(() => {
    restoreLocalStorage = installLocalStorageMock();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    restoreLocalStorage?.();
  });

  it("starts incomplete", () => {
    assert.equal(readOnboardingComplete(), false);
    assert.equal(shouldShowWelcomeScreen(false), true);
  });

  it("hides welcome after completion", () => {
    writeOnboardingComplete();
    assert.equal(readOnboardingComplete(), true);
    assert.equal(shouldShowWelcomeScreen(false), false);
  });

  it("hides welcome when a project is open", () => {
    assert.equal(shouldShowWelcomeScreen(true), false);
  });
});

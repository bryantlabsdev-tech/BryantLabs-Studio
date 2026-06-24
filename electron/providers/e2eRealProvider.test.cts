import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveE2eRealProviderConfig,
} from "./e2eRealProvider.cjs";

describe("e2e real provider env", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (
        key.startsWith("BRYANTLABS_E2E_") ||
        key.endsWith("_API_KEY") ||
        key === "ANTHROPIC_MODEL" ||
        key === "OLLAMA_BASE_URL"
      ) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const key of Object.keys(savedEnv)) {
      delete savedEnv[key];
    }
  });

  it("returns null unless BRYANTLABS_E2E_REAL_PROVIDER=1", () => {
    process.env.GROQ_API_KEY = "test-key";
    assert.equal(resolveE2eRealProviderConfig(), null);
  });

  it("resolves groq from GROQ_API_KEY", () => {
    process.env.BRYANTLABS_E2E_REAL_PROVIDER = "1";
    process.env.GROQ_API_KEY = "gsk-test";
    const config = resolveE2eRealProviderConfig();
    assert.equal(config?.provider, "groq");
    assert.equal(config?.apiKey, "gsk-test");
  });

  it("honors explicit provider + BRYANTLABS_E2E_API_KEY", () => {
    process.env.BRYANTLABS_E2E_REAL_PROVIDER = "1";
    process.env.BRYANTLABS_E2E_PROVIDER = "anthropic";
    process.env.BRYANTLABS_E2E_API_KEY = "sk-ant-test";
    process.env.BRYANTLABS_E2E_MODEL = "claude-sonnet-4-20250514";
    const config = resolveE2eRealProviderConfig();
    assert.equal(config?.provider, "anthropic");
    assert.equal(config?.apiKey, "sk-ant-test");
    assert.equal(config?.model, "claude-sonnet-4-20250514");
  });
});

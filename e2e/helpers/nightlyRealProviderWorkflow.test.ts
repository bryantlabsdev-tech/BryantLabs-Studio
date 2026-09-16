import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveRealProviderEnv } from "./realProvider.ts";

const require = createRequire(import.meta.url);
const yamlLib = require("js-yaml") as { load: (source: string) => unknown };

const WORKFLOW_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.github/workflows/nightly-real-provider.yml",
);

const SUPPORTED_SECRET_ENVS = [
  "GROQ_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

const SECRET_BINDING = Object.fromEntries(
  SUPPORTED_SECRET_ENVS.map((name) => [name, `\${{ secrets.${name} }}`]),
);

type SecretEnvName = (typeof SUPPORTED_SECRET_ENVS)[number];

type WorkflowStep = {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
};

type WorkflowDoc = {
  on?: Record<string, unknown>;
  env?: Record<string, string>;
  jobs?: Record<
    string,
    {
      env?: Record<string, string>;
      steps?: WorkflowStep[];
    }
  >;
};

function loadWorkflowSource(): string {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

function loadWorkflow(): WorkflowDoc {
  return yamlLib.load(loadWorkflowSource()) as WorkflowDoc;
}

function namedStep(workflow: WorkflowDoc, name: string): WorkflowStep {
  const step = workflow.jobs?.["real-provider-smoke"]?.steps?.find((item) => item.name === name);
  assert.ok(step, `missing step: ${name}`);
  return step;
}

function secretEnvBindings(env: Record<string, string> | undefined): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    if (SUPPORTED_SECRET_ENVS.includes(key as SecretEnvName) || /secrets\./.test(value)) {
      bindings[key] = value;
    }
  }
  return bindings;
}

function detectAvailable(env: Record<string, string>): "true" | "false" {
  return SUPPORTED_SECRET_ENVS.some((name) => env[name] !== "") ? "true" : "false";
}

function evalAvailableIf(expression: string, available: "true" | "false"): boolean {
  const match = expression.match(
    /^steps\.provider-credentials\.outputs\.available == '(true|false)'$/,
  );
  assert.ok(match, `unsupported if expression: ${expression}`);
  return match[1] === available;
}

function withProviderEnv<T>(env: Record<string, string>, fn: () => T): T {
  const keys = new Set([
    "BRYANTLABS_E2E_REAL_PROVIDER",
    "BRYANTLABS_E2E_PROVIDER",
    "BRYANTLABS_E2E_API_KEY",
    "BRYANTLABS_E2E_MODEL",
    "BRYANTLABS_E2E_INCLUDE_OLLAMA",
    ...SUPPORTED_SECRET_ENVS,
  ]);
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    process.env.BRYANTLABS_E2E_REAL_PROVIDER = "1";
    for (const [key, value] of Object.entries(env)) {
      if (value) process.env[key] = value;
    }
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function secretCombinations(): Array<Partial<Record<SecretEnvName, string>>> {
  const combos: Array<Partial<Record<SecretEnvName, string>>> = [{}];
  for (const name of SUPPORTED_SECRET_ENVS) {
    const next = combos.map((combo) => ({ ...combo, [name]: `placeholder-${name}` }));
    combos.push(...next);
  }
  return combos;
}

describe("nightly real-provider workflow", () => {
  const source = loadWorkflowSource();
  const workflow = loadWorkflow();
  const job = workflow.jobs?.["real-provider-smoke"];
  const detect = namedStep(workflow, "Detect provider credentials");
  const smoke = namedStep(workflow, "Real-provider smoke (opt-in)");
  const skip = namedStep(workflow, "Skip notice (no API key configured)");

  it("is limited to schedule and workflow_dispatch", () => {
    assert.deepEqual(Object.keys(workflow.on ?? {}), ["schedule", "workflow_dispatch"]);
    assert.doesNotMatch(source, /\bpull_request\b/);
  });

  it("does not map secrets at workflow or job scope", () => {
    assert.equal(workflow.env, undefined);
    assert.equal(job?.env, undefined);
    assert.deepEqual(secretEnvBindings(workflow.env), {});
    assert.deepEqual(secretEnvBindings(job?.env), {});
  });

  it("detects credentials in an ungated step and emits only a boolean", () => {
    assert.equal(detect.id, "provider-credentials");
    assert.equal(detect.if, undefined);
    assert.deepEqual(secretEnvBindings(detect.env), SECRET_BINDING);
    assert.match(detect.run ?? "", /available=false/);
    assert.match(detect.run ?? "", /available=true/);
    assert.match(detect.run ?? "", /echo "available=\$\{available\}" >> "\$GITHUB_OUTPUT"/);
    assert.doesNotMatch(detect.run ?? "", /set -x|printenv|toJson\(secrets/);
    assert.doesNotMatch(detect.run ?? "", /echo "available=\$\{?(GROQ|ANTHROPIC|GEMINI|GOOGLE|OPENROUTER)/);
    for (const name of SUPPORTED_SECRET_ENVS) {
      assert.match(detect.run ?? "", new RegExp(`\\[ -n "\\$\\{${name}\\}" \\]`));
    }
  });

  it("maps provider secrets only into detection and smoke steps", () => {
    const secretSteps = (job?.steps ?? []).filter(
      (step) => Object.keys(secretEnvBindings(step.env)).length > 0,
    );
    assert.deepEqual(
      secretSteps.map((step) => step.name),
      ["Detect provider credentials", "Real-provider smoke (opt-in)"],
    );
    assert.deepEqual(secretEnvBindings(smoke.env), SECRET_BINDING);
    assert.equal(skip.env, undefined);
    assert.match(smoke.run ?? "", /^npm run test:e2e:real$/);
    assert.equal(smoke.env?.BRYANTLABS_E2E_REAL_PROVIDER, "1");
    assert.equal(smoke.env?.PLAYWRIGHT_USE_DIST, "1");
  });

  it("gates run and skip on the detection boolean without artifacts or secret traces", () => {
    assert.equal(smoke.if, "steps.provider-credentials.outputs.available == 'true'");
    assert.equal(skip.if, "steps.provider-credentials.outputs.available == 'false'");
    assert.match(
      skip.run ?? "",
      /^echo "Skipping real-provider smoke — add a supported provider API key repo secret\."$/,
    );
    assert.doesNotMatch(source, /upload-artifact/);
    assert.doesNotMatch(source, /printenv|toJson\(secrets|\$GROQ_API_KEY|\$ANTHROPIC_API_KEY/);
    assert.doesNotMatch(source, /\nif:.*secrets\./);
  });

  it("selects smoke vs skip for every supported-secret combination", () => {
    for (const combo of secretCombinations()) {
      const env: Record<string, string> = {};
      for (const name of SUPPORTED_SECRET_ENVS) env[name] = combo[name] ?? "";
      const available = detectAvailable(env);
      const runSmoke = evalAvailableIf(smoke.if ?? "", available);
      const skipSmoke = evalAvailableIf(skip.if ?? "", available);
      assert.equal(runSmoke, available === "true", JSON.stringify(combo));
      assert.equal(skipSmoke, available === "false", JSON.stringify(combo));
      assert.equal(runSmoke && skipSmoke, false);

      const resolved = withProviderEnv(env, () => resolveRealProviderEnv());
      if (available === "true") {
        assert.equal(resolved?.hasCredentials, true, JSON.stringify(combo));
      } else {
        assert.equal(resolved, null);
      }
    }
  });
});

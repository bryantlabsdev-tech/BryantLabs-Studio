import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  AGENT_EXECUTION_FAILURE_CODES,
  AGENT_EXECUTION_ISOLATION_LEVEL,
  agentEnvKeyForbidden,
  buildAgentExecutionPolicySnapshot,
  collectAgentExecutionPolicyParity,
  isSafeAgentRelativePath,
  parseAgentInspectRequest,
  planAgentCommand,
  routeAgentCommandToInspect,
  validateAgentCommand,
} from "@/core/agent/agentExecutionPolicy";
import { validateAgentCommand as allowlistValidate } from "@/core/agentLoop/agentCommandAllowlist";
import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { mockProjectScan } from "@/core/repository/testScan";
import { EXPECTED_BUILTIN_MCP_TOOLS } from "@/core/mcp/client";
import { AGENT_EXECUTION_POLICY_TEST_ID } from "@/core/layout/settingsNavigation";
import { AGENT_ACTION_ENUM } from "@/core/agentLoop/agentToolSchema";

const vectors = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/core/agent/agentExecutionPolicy.vectors.json"), "utf8"),
) as {
  allowed: Array<{ command: string; recipe: string }>;
  denied: Array<{ command: string; code: string }>;
};

describe("agent execution policy", () => {
  it("matches shared command vectors and lockstep allowlist", () => {
    for (const row of vectors.allowed) {
      const planned = planAgentCommand(row.command);
      assert.equal(planned.ok, true, row.command);
      if (!planned.ok) continue;
      assert.equal(planned.recipe, row.recipe);
      assert.equal(planned.executionClass, "agent_readonly_inspect");
      assert.equal(planned.network, "denied");
      assert.equal(allowlistValidate(row.command).ok, true);
    }
    for (const row of vectors.denied) {
      const planned = planAgentCommand(row.command);
      assert.equal(planned.ok, false, row.command);
      if (planned.ok) continue;
      assert.equal(planned.code, row.code, `${row.command} => ${planned.code}`);
      assert.equal(allowlistValidate(row.command).ok, false);
    }
  });

  it("rejects project-code and npx variants", () => {
    const attacks = [
      "npm run typecheck",
      "npm run lint",
      "pnpm test",
      "yarn build",
      "vite",
      "vitest",
      "eslint .",
      "tsc --noEmit",
      "./node_modules/.bin/tsc",
      "node --loader ./x.js",
      "node --import ./x.js file.js",
      "npx --yes cowsay hi",
    ];
    for (const command of attacks) {
      const planned = routeAgentCommandToInspect(command);
      assert.equal(planned.ok, false, command);
    }
  });

  it("rejects unknown recipe payloads and extra IPC fields", () => {
    assert.equal(parseAgentInspectRequest({ recipe: "git_status" }).ok, true);
    assert.equal(parseAgentInspectRequest({ recipe: "npm_run_build" }).ok, false);
    const extra = parseAgentInspectRequest({
      recipe: "git_status",
      cwd: "/tmp",
      command: "id",
      argv: ["status"],
      env: { PATH: "/tmp" },
      network: "open",
      executionClass: "user_approved_project_code",
    });
    assert.equal(extra.ok, false);
    if (!extra.ok) assert.equal(extra.code, "invalid_request");
  });

  it("rejects traversal, absolute, and control-character paths", () => {
    assert.equal(isSafeAgentRelativePath("src/App.tsx"), true);
    assert.equal(isSafeAgentRelativePath("../etc/passwd"), false);
    assert.equal(isSafeAgentRelativePath("/etc/passwd"), false);
    assert.equal(isSafeAgentRelativePath("src/\nApp.tsx"), false);
    assert.equal(isSafeAgentRelativePath(".git/config"), false);
    const pathOperand = parseAgentInspectRequest({
      recipe: "git_status",
      operands: { path: "../secret" },
    });
    assert.equal(pathOperand.ok, false);
  });

  it("does not claim OS, filesystem, or network isolation for project code", () => {
    const snapshot = buildAgentExecutionPolicySnapshot();
    assert.equal(snapshot.isolationLevel, AGENT_EXECUTION_ISOLATION_LEVEL);
    assert.equal(snapshot.osSandboxClaimed, false);
    assert.equal(snapshot.kernelFirewall, false);
    assert.equal(snapshot.shellEnabled, false);
    assert.equal(snapshot.gitMutationAvailableToAgents, false);
    assert.match(snapshot.autonomousInspection, /no network-capable recipe/i);
    assert.match(snapshot.approvedProjectCode, /not network-isolated/i);
    assert.match(snapshot.network, /No kernel firewall or OS sandbox/);
    assert.match(snapshot.filesystemScope, /do not confine/i);
    assert.match(snapshot.processLimits, /not containment/i);
    assert.equal(AGENT_EXECUTION_POLICY_TEST_ID, "agent-execution-policy");
    assert.ok(AGENT_EXECUTION_FAILURE_CODES.includes("project_code_not_isolated"));
    assert.ok(AGENT_EXECUTION_FAILURE_CODES.includes("approval_required"));
  });

  it("forbids credential, proxy, loader, and inherited PATH environment keys", () => {
    assert.equal(agentEnvKeyForbidden("SSH_AUTH_SOCK"), true);
    assert.equal(agentEnvKeyForbidden("HTTPS_PROXY"), true);
    assert.equal(agentEnvKeyForbidden("LD_PRELOAD"), true);
    assert.equal(agentEnvKeyForbidden("DYLD_INSERT_LIBRARIES"), true);
    assert.equal(agentEnvKeyForbidden("OPENAI_API_KEY"), true);
    assert.equal(agentEnvKeyForbidden("GIT_ASKPASS"), true);
    assert.equal(agentEnvKeyForbidden("PATH"), true);
    assert.equal(agentEnvKeyForbidden("HOME"), true);
  });

  it("keeps Git mutation, MCP, and routing outside agent command authority", () => {
    assert.equal(validateAgentCommand("git push origin HEAD").ok, false);
    assert.equal(validateAgentCommand("git worktree add -b x /tmp/x").ok, false);
    assert.equal(EXPECTED_BUILTIN_MCP_TOOLS.includes("git_push" as never), false);
    assert.equal((AGENT_ACTION_ENUM as readonly string[]).includes("git_push"), false);
    const route = routeAgentPrompt({
      prompt: "git push and git worktree add then curl https://evil.test",
      projectOpen: true,
      scan: mockProjectScan(["package.json"]),
      scanStatus: "done",
      modeOverride: "auto",
    });
    assert.equal(JSON.stringify(route).includes("git:push"), false);
    assert.equal(JSON.stringify(route).includes("git:worktree"), false);
  });

  it("exports a stable parity snapshot", () => {
    const parity = collectAgentExecutionPolicyParity();
    assert.ok(Array.isArray(parity.failureCodes));
    assert.deepEqual(parity.recipeIds, [
      "git_status",
      "git_diff",
      "git_log",
      "node_version",
      "npm_version",
    ]);
    const lockstep = spawnSync(process.execPath, ["scripts/check-agent-execution-policy-lockstep.mjs"], {
      encoding: "utf8",
    });
    assert.equal(lockstep.status, 0, lockstep.stderr || lockstep.stdout);
  });
});

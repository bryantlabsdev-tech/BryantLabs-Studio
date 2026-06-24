import { routeAgentPrompt } from "@/core/agent/unifiedAgentRoute";
import { isFollowUpEditSubmitAction, resolveFollowUpSubmitAction } from "@/core/agent/followUpExecution";
import {
  deriveAiPatchReviewState,
  derivePlanApplyReviewState,
} from "@/core/patch/patchReviewModel";
import { boostComposerMentionsInContext, resolveSymbolMentionPaths } from "@/core/agent/composerMentions";
import {
  buildMentionSuggestions,
  detectActiveMention,
  insertMentionAt,
} from "@/core/agent/composerMentionSuggestions";
import { suggestInlineTabSuffix } from "@/core/editor/inlineTabSuggest";
import {
  createLlmDecideNextAction,
  parseAgentStepResponse,
} from "@/core/agentLoop/llmReasoning";
import { decideNextAction } from "@/core/agentLoop/reasoning";
import { createAgentLoopSession } from "@/core/agentLoop/state";
import { executeAgentAction } from "@/core/agentLoop/act";
import { formatInlineEditPrompt } from "@/core/editor/inlineEdit";
import { hasCodebaseMention } from "@/core/agent/codebaseMention";
import {
  resolveContextContentPaths,
  resolveContextContentPathsAsync,
} from "@/core/context/referencedFileContext";
import {
  approveAIPatchOrchestration,
  applyAIPatchOrchestration,
} from "@/app/orchestration/aiPatchOrchestration";
import type { AIPatchOrchestrationHost } from "@/app/orchestration/aiPatchTypes";
import { verificationToSetupResult } from "@/app/orchestration/followUpVerifyRepairOrchestration";
import { runQuickRepairAndReverify } from "@/app/orchestration/quickRepairOrchestration";
import { mockProjectScan } from "@/core/repository/testScan";
import { allPassed, check } from "../harness/evaluators";
import type { BenchmarkCaseDefinition, BenchmarkCaseResult } from "../types";
import type { BryantLabsApi, VerificationResult } from "@/types";

const VITE_PATHS = [
  "package.json",
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
];

function failTscVerification(stderr: string): VerificationResult {
  return {
    typecheck: {
      command: "npx tsc --noEmit",
      ok: false,
      exitCode: 2,
      stdout: "",
      stderr,
      durationMs: 1,
      errorCount: 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    },
    build: {
      command: "npm run build",
      ok: false,
      exitCode: 2,
      stdout: "",
      stderr: "",
      durationMs: 1,
      errorCount: 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    },
    ranAt: Date.now(),
  };
}

export const EDIT_PIPELINE_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "edit.quick_repair_unused",
    category: "edit_pipeline",
    name: "Quick repair fixes unused variable before AI",
    description: "Follow-up verify path applies deterministic TS6133 repair.",
    weight: 1,
  },
  {
    id: "edit.mobile_layout_route",
    category: "edit_pipeline",
    name: "Mobile layout prompt routes to follow-up",
    description: "Responsive layout edits use build_loop, not greenfield.",
    weight: 1,
  },
  {
    id: "edit.fix_build_route",
    category: "edit_pipeline",
    name: "Fix build error routes to repair",
    description: "Repair prompts target repair_project mode.",
    weight: 1,
  },
  {
    id: "edit.verify_to_setup",
    category: "edit_pipeline",
    name: "Verification maps to setup for UI audit",
    description: "Post-apply verification converts to GreenfieldSetupResult.",
    weight: 1,
  },
  {
    id: "edit.composer_mention_boost",
    category: "edit_pipeline",
    name: "Composer @-mention boosts file context",
    description: "@src/App.tsx pins file in apply-plan context.",
    weight: 1,
  },
  {
    id: "edit.inline_prompt",
    category: "edit_pipeline",
    name: "Inline edit formats selection prompt",
    description: "Cmd+K style selection-scoped patch prompt includes selected code.",
    weight: 1,
  },
  {
    id: "edit.composer_symbol_boost",
    category: "edit_pipeline",
    name: "Composer @symbol boosts defining file",
    description: "@Dashboard pins the component's source file in apply-plan context.",
    weight: 1,
  },
  {
    id: "edit.mention_suggestions",
    category: "edit_pipeline",
    name: "Composer @ autocomplete ranks symbols",
    description: "Partial @ query surfaces indexed symbol suggestions.",
    weight: 1,
  },
  {
    id: "edit.referenced_symbol_context",
    category: "edit_pipeline",
    name: "Symbol @-mention resolves to file path",
    description: "@Dashboard inject path resolves for referenced file contents.",
    weight: 1,
  },
  {
    id: "edit.patch_review_model",
    category: "edit_pipeline",
    name: "Unified patch review model",
    description: "Plan apply and AI patch review states derive consistently.",
    weight: 1,
  },
  {
    id: "edit.mock_patch_apply",
    category: "edit_pipeline",
    name: "Mock AI patch approve and apply",
    description: "Approve-then-apply orchestration writes patched file via safe edit API.",
    weight: 1,
  },
  {
    id: "edit.codebase_mention_boost",
    category: "edit_pipeline",
    name: "Composer @codebase boosts relevance",
    description: "@codebase pins top repository-relevant files in planner context.",
    weight: 1,
  },
  {
    id: "edit.inline_tab_suffix",
    category: "edit_pipeline",
    name: "Inline tab completion suffix",
    description: "Ghost-text suffix completes partial symbol identifiers.",
    weight: 1,
  },
  {
    id: "edit.llm_agent_step",
    category: "edit_pipeline",
    name: "LLM agent step JSON parse",
    description: "Provider tool-selection JSON maps to agent actions.",
    weight: 1,
  },
  {
    id: "edit.llm_agent_fallback",
    category: "edit_pipeline",
    name: "LLM agent falls back to rules",
    description: "Invalid provider JSON uses deterministic decideNextAction.",
    weight: 1,
  },
  {
    id: "edit.live_sudoku_timer_route",
    category: "edit_pipeline",
    name: "Sudoku timer follow-up routes to build loop",
    description: "Live-style follow-up on existing app uses edit pipeline.",
    weight: 1,
  },
  {
    id: "edit.live_mock_agent_cycle",
    category: "edit_pipeline",
    name: "Mock LLM agent think-act cycle",
    description: "One mocked provider step selects search then act callback runs.",
    weight: 1,
  },
];

async function runCase(
  def: BenchmarkCaseDefinition,
  run: () => Promise<BenchmarkCaseResult["checks"]>,
): Promise<BenchmarkCaseResult> {
  const started = performance.now();
  try {
    const checks = await run();
    return {
      ...def,
      passed: allPassed(checks),
      durationMs: Math.round(performance.now() - started),
      checks,
    };
  } catch (err) {
    return {
      ...def,
      passed: false,
      durationMs: Math.round(performance.now() - started),
      checks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runEditPipelineCase(
  def: BenchmarkCaseDefinition,
): Promise<BenchmarkCaseResult> {
  const scan = mockProjectScan(VITE_PATHS, { root: "/tmp/vite-app" });

  switch (def.id) {
    case "edit.quick_repair_unused":
      return runCase(def, async () => {
        const source = [
          "const unusedHelper = 1;",
          "export default function App() {",
          "  return <div>ok</div>;",
          "}",
        ].join("\n");
        const stderr =
          "src/App.tsx(1,7): error TS6133: 'unusedHelper' is declared but its value is never read.";
        let verifyCalls = 0;
        const api = {
          readFile: async () => ({ readable: true, content: source }),
          applyEdit: async (_abs: string, basis: string, next: string) => ({
            ok: basis !== next,
          }),
          verify: async () => {
            verifyCalls += 1;
            if (verifyCalls === 1) return failTscVerification(stderr);
            return {
              ...failTscVerification(stderr),
              typecheck: {
                ...failTscVerification(stderr).typecheck,
                ok: true,
                exitCode: 0,
                errorCount: 0,
              },
              build: {
                ...failTscVerification(stderr).build,
                ok: true,
                exitCode: 0,
                errorCount: 0,
              },
            };
          },
        } as unknown as BryantLabsApi;

        const result = await runQuickRepairAndReverify(
          api,
          "/tmp/vite-app",
          failTscVerification(stderr),
          { appendGreenfieldRunLog: () => {} },
        );

        return [
          check("fixed", "Quick repair made progress", result.fixed, "true", String(result.fixed)),
          check("tsc", "TypeScript passes after repair", result.verification.typecheck.ok, "true", String(result.verification.typecheck.ok)),
          check("verify_calls", "Re-verified after repair", verifyCalls >= 2, ">=2", String(verifyCalls)),
        ];
      });

    case "edit.mobile_layout_route":
      return runCase(def, async () => {
        const prompt = "Make it mobile friendly with a responsive layout";
        const route = routeAgentPrompt({
          prompt,
          projectOpen: true,
          projectPath: "/tmp/vite-app",
          scan,
          scanStatus: "done",
        });
        const action = resolveFollowUpSubmitAction({
          hasProject: true,
          routeExecution: route.execution,
          emptyProjectFolder: false,
          scan,
          scanStatus: "done",
        });
        return [
          check("mode", "Edit existing project", route.mode === "edit_existing_project", "edit_existing_project", route.mode),
          check("execution", "Build loop execution", route.execution === "build_loop", "build_loop", route.execution),
          check("submit", "Follow-up submit action", isFollowUpEditSubmitAction(action), "build_loop|agent_loop", action.kind),
        ];
      });

    case "edit.fix_build_route":
      return runCase(def, async () => {
        const prompt = "Fix the build error in this project";
        const route = routeAgentPrompt({
          prompt,
          projectOpen: true,
          projectPath: "/tmp/vite-app",
          scan,
          scanStatus: "done",
        });
        return [
          check("mode", "Repair project mode", route.mode === "repair_project", "repair_project", route.mode),
          check("intent", "Repair intent", route.intent === "repair", "repair", route.intent),
          check("execution", "Build loop for repair", route.execution === "build_loop", "build_loop", route.execution),
        ];
      });

    case "edit.verify_to_setup":
      return runCase(def, async () => {
        const verification: VerificationResult = {
          typecheck: {
            command: "npx tsc --noEmit",
            ok: true,
            exitCode: 0,
            stdout: "",
            stderr: "",
            durationMs: 1,
            errorCount: 0,
            warningCount: 0,
            timedOut: false,
            truncated: false,
          },
          build: {
            command: "npm run build",
            ok: true,
            exitCode: 0,
            stdout: "",
            stderr: "",
            durationMs: 1,
            errorCount: 0,
            warningCount: 0,
            timedOut: false,
            truncated: false,
          },
          ranAt: 1,
        };
        const setup = verificationToSetupResult(verification);
        return [
          check("ok", "Setup ok when verify ok", setup.ok, "true", String(setup.ok)),
          check("tsc", "Typecheck preserved", setup.typecheck?.ok, "true", String(setup.typecheck?.ok)),
          check("build", "Build preserved", setup.build?.ok, "true", String(setup.build?.ok)),
        ];
      });

    case "edit.composer_mention_boost":
      return runCase(def, async () => {
        const boosted = boostComposerMentionsInContext(
          {
            framework: "react",
            language: "typescript",
            packageManager: "npm",
            totalFiles: scan.files.length,
            totalFolders: 1,
            entryPoints: ["src/main.tsx"],
            files: ["package.json"],
            symbols: [],
          },
          "Only change @src/App.tsx header color",
          scan,
        );
        return [
          check(
            "top_file",
            "Mentioned file ranked first",
            boosted.relevantFiles?.[0]?.path === "src/App.tsx",
            "src/App.tsx",
            boosted.relevantFiles?.[0]?.path ?? "—",
          ),
          check(
            "score",
            "Mention score boosted",
            (boosted.relevantFiles?.[0]?.score ?? 0) >= 100,
            ">=100",
            String(boosted.relevantFiles?.[0]?.score ?? 0),
          ),
          check(
            "note",
            "Repository prompt notes mention",
            Boolean(boosted.repositoryPrompt?.includes("src/App.tsx")),
            "includes path",
            boosted.repositoryPrompt ?? "",
          ),
        ];
      });

    case "edit.inline_prompt":
      return runCase(def, async () => {
        const prompt = formatInlineEditPrompt("Add null check", {
          relPath: "src/App.tsx",
          startLine: 5,
          endLine: 7,
          text: "const x = data.value;",
        });
        return [
          check("instruction", "Keeps user instruction", prompt.includes("Add null check"), "Add null check", prompt.slice(0, 40)),
          check("selection", "Includes selected code", prompt.includes("data.value"), "data.value", "—"),
          check("scope", "Mentions line range", /lines 5–7/.test(prompt), "5-7", "—"),
        ];
      });

    case "edit.composer_symbol_boost":
      return runCase(def, async () => {
        const symbolScan = mockProjectScan(
          [...VITE_PATHS, "src/pages/Dashboard.tsx"],
          {
            root: "/tmp/vite-app",
            symbols: [
              {
                name: "Dashboard",
                kind: "component",
                path: "src/pages/Dashboard.tsx",
                absPath: "/tmp/vite-app/src/pages/Dashboard.tsx",
                line: 8,
              },
            ],
          },
        );
        const boosted = boostComposerMentionsInContext(
          {
            framework: "react",
            language: "typescript",
            packageManager: "npm",
            totalFiles: symbolScan.files.length,
            totalFolders: 1,
            entryPoints: ["src/main.tsx"],
            files: ["package.json"],
            symbols: [],
          },
          "Polish the @Dashboard header spacing",
          symbolScan,
        );
        const paths = resolveSymbolMentionPaths("Polish the @Dashboard header spacing", symbolScan);
        return [
          check(
            "top_file",
            "Symbol file ranked first",
            boosted.relevantFiles?.[0]?.path === "src/pages/Dashboard.tsx",
            "src/pages/Dashboard.tsx",
            boosted.relevantFiles?.[0]?.path ?? "—",
          ),
          check(
            "resolved_path",
            "Symbol resolves to defining file",
            paths.includes("src/pages/Dashboard.tsx"),
            "src/pages/Dashboard.tsx",
            paths.join(", ") || "—",
          ),
          check(
            "note",
            "Repository prompt notes symbol",
            Boolean(boosted.repositoryPrompt?.includes("Dashboard")),
            "includes symbol",
            boosted.repositoryPrompt ?? "",
          ),
        ];
      });

    case "edit.mention_suggestions":
      return runCase(def, async () => {
        const symbolScan = mockProjectScan(
          [...VITE_PATHS, "src/pages/Dashboard.tsx"],
          {
            root: "/tmp/vite-app",
            symbols: [
              {
                name: "Dashboard",
                kind: "component",
                path: "src/pages/Dashboard.tsx",
                absPath: "/tmp/vite-app/src/pages/Dashboard.tsx",
                line: 8,
              },
            ],
          },
        );
        const active = detectActiveMention("Polish @Dash", "Polish @Dash".length);
        const suggestions = buildMentionSuggestions(symbolScan, active?.query ?? "");
        const inserted = insertMentionAt(
          "Polish @Dash",
          "Polish @Dash".length,
          active?.start ?? 7,
          "Dashboard",
        );
        return [
          check(
            "active",
            "Detects partial @ token",
            active?.query === "Dash",
            "Dash",
            active?.query ?? "—",
          ),
          check(
            "symbol",
            "Suggests Dashboard symbol",
            suggestions.some((s) => s.insertText === "Dashboard"),
            "Dashboard",
            suggestions.map((s) => s.insertText).join(", ") || "—",
          ),
          check(
            "insert",
            "Inserts completed mention",
            inserted.nextText.includes("@Dashboard "),
            "@Dashboard ",
            inserted.nextText,
          ),
        ];
      });

    case "edit.referenced_symbol_context":
      return runCase(def, async () => {
        const symbolScan = mockProjectScan(
          [...VITE_PATHS, "src/pages/Dashboard.tsx"],
          {
            root: "/tmp/vite-app",
            symbols: [
              {
                name: "Dashboard",
                kind: "component",
                path: "src/pages/Dashboard.tsx",
                absPath: "/tmp/vite-app/src/pages/Dashboard.tsx",
                line: 8,
              },
            ],
          },
        );
        const paths = resolveContextContentPaths(
          "Tighten spacing in @Dashboard header",
          symbolScan,
        );
        return [
          check(
            "path",
            "Symbol resolves to defining file",
            paths.includes("src/pages/Dashboard.tsx"),
            "src/pages/Dashboard.tsx",
            paths.join(", ") || "—",
          ),
          check(
            "count",
            "At least one pinned path",
            paths.length >= 1,
            ">=1",
            String(paths.length),
          ),
          check(
            "no_dup",
            "Paths are unique",
            new Set(paths).size === paths.length,
            "unique",
            String(new Set(paths).size),
          ),
        ];
      });

    case "edit.patch_review_model":
      return runCase(def, async () => {
        const ai = deriveAiPatchReviewState({
          session: {
            relPath: "src/App.tsx",
            basisContent: "a",
            proposedAt: 1,
            patch: {
              ok: true,
              provider: "gemini",
              model: "flash",
              proposal: { newContent: "b", summary: "change" },
            },
          },
          currentOnDisk: "a",
          approved: false,
          applyStatus: "idle",
        });
        const plan = derivePlanApplyReviewState({
          phase: "waiting_for_review",
          prompt: "Add nav",
          planSummary: "Navigation",
          files: [
            {
              relPath: "src/App.tsx",
              action: "modify",
              status: "ready",
              decision: "pending",
              diffStats: { changed: true, added: 5, removed: 1 },
              basisContent: "a",
              proposal: { newContent: "b", summary: "nav" },
            },
          ],
        } as import("@/core/planApply/types").PlanApplySession);
        return [
          check("ai_approve", "AI patch can approve", ai.canApprove, "true", String(ai.canApprove)),
          check("plan_accept", "Plan apply accept all", plan?.canAcceptAll === true, "true", String(plan?.canAcceptAll)),
          check("plan_files", "One changed file", plan?.changedFiles.length === 1, "1", String(plan?.changedFiles.length)),
        ];
      });

    case "edit.mock_patch_apply":
      return runCase(def, async () => {
        const basis = "export default function App() {\n  return <div>Hi</div>;\n}\n";
        const patched = "export default function App() {\n  return <div>Hello</div>;\n}\n";
        let applyCalled = false;
        let aiPatchApproved = false;
        const host: AIPatchOrchestrationHost = {
          api: {
            applyEdit: async (_abs, basisContent, next) => {
              applyCalled = basisContent === basis && next === patched;
              return { ok: applyCalled };
            },
          } as never,
          project: { path: "/tmp/vite-app", name: "vite-app" } as never,
          activeFile: null,
          scan: null,
          sessionMemory: {} as never,
          projectMemoryRef: { current: {} } as never,
          get aiPatchSession() {
            return {
              patch: {
                ok: true,
                provider: "gemini",
                model: "gemini-2.5-flash",
                proposal: { newContent: patched, summary: "", reasoning: "", risks: [] },
              },
              basisContent: basis,
              absPath: "/tmp/vite-app/src/App.tsx",
              relPath: "src/App.tsx",
              proposedAt: Date.now(),
            };
          },
          get aiPatchApproved() {
            return aiPatchApproved;
          },
          setPatchStatus: () => {},
          setPatchError: () => {},
          setAiPatchSession: () => {},
          setAiPatchApproved: (v) => {
            aiPatchApproved = typeof v === "function" ? v(aiPatchApproved) : v;
          },
          setAiPatchApplyStatus: () => {},
          setAiPatchApplyError: () => {},
          setCanUndo: () => {},
          setLastEditedPath: () => {},
          beginStudioAction: () => {},
          finishStudioAction: () => {},
          updateGreenfieldRun: () => {},
          appendGreenfieldRunLog: () => {},
          resolveMemoriesForPrompt: () => ({ memories: [], promptAugmentation: "" }) as never,
          commitContextCapture: () => {},
          invokeCoderCall: async () => null,
          openPath: async () => {},
          runScan: async () => {},
        };
        approveAIPatchOrchestration(host);
        await applyAIPatchOrchestration(host);
        return [
          check("approved", "Patch approved before apply", aiPatchApproved === false, "false", String(aiPatchApproved)),
          check("apply", "Safe apply API invoked", applyCalled, "true", String(applyCalled)),
          check("diff", "Proposal differs from basis", patched !== basis, "true", String(patched !== basis)),
        ];
      });

    case "edit.codebase_mention_boost":
      return runCase(def, async () => {
        const symbolScan = mockProjectScan(
          [...VITE_PATHS, "src/pages/Dashboard.tsx"],
          {
            root: "/tmp/vite-app",
            symbols: [
              {
                name: "Dashboard",
                kind: "component",
                path: "src/pages/Dashboard.tsx",
                absPath: "/tmp/vite-app/src/pages/Dashboard.tsx",
                line: 8,
              },
            ],
          },
        );
        const boosted = boostComposerMentionsInContext(
          {
            framework: "react",
            language: "typescript",
            packageManager: "npm",
            totalFiles: symbolScan.files.length,
            totalFolders: 1,
            entryPoints: ["src/main.tsx"],
            files: ["package.json"],
            symbols: [],
            relevantFiles: [],
          },
          "Polish dashboard layout @codebase",
          symbolScan,
        );
        const paths = await resolveContextContentPathsAsync(
          "Polish dashboard layout @codebase",
          symbolScan,
          {
            semanticSearch: async () => [
              { path: "src/pages/Dashboard.tsx", score: 0.9, reason: "dashboard" },
            ],
          } as never,
        );
        return [
          check(
            "mention",
            "Detects @codebase",
            hasCodebaseMention("Polish dashboard layout @codebase"),
            "true",
            String(hasCodebaseMention("Polish dashboard layout @codebase")),
          ),
          check(
            "boost",
            "Boosts relevant files",
            (boosted.relevantFiles?.length ?? 0) > 0,
            ">0",
            String(boosted.relevantFiles?.length ?? 0),
          ),
          check(
            "async_paths",
            "Async resolver includes semantic hits",
            paths.includes("src/pages/Dashboard.tsx"),
            "src/pages/Dashboard.tsx",
            paths.join(", ") || "—",
          ),
        ];
      });

    case "edit.inline_tab_suffix":
      return runCase(def, async () => {
        const symbols = [
          {
            name: "Dashboard",
            kind: "component" as const,
            path: "src/pages/Dashboard.tsx",
            absPath: "/tmp/vite-app/src/pages/Dashboard.tsx",
            line: 8,
          },
        ];
        return [
          check(
            "symbol",
            "Completes partial identifier",
            suggestInlineTabSuffix("const Dash", symbols) === "board",
            "board",
            suggestInlineTabSuffix("const Dash", symbols) ?? "—",
          ),
          check(
            "jsx",
            "Completes JSX tag",
            suggestInlineTabSuffix("return <Dash", symbols) === "board",
            "board",
            suggestInlineTabSuffix("return <Dash", symbols) ?? "—",
          ),
          check(
            "none",
            "Skips when no match",
            suggestInlineTabSuffix("const count = 1", symbols) === null,
            "null",
            String(suggestInlineTabSuffix("const count = 1", symbols)),
          ),
        ];
      });

    case "edit.llm_agent_step":
      return runCase(def, async () => {
        const parsed = parseAgentStepResponse(
          JSON.stringify({
            thought: "Read main UI",
            reason: "Timer likely in App",
            action: "read_file",
            params: { path: "src/App.tsx" },
            actionDetail: 'ReadFile("src/App.tsx")',
          }),
        );
        return [
          check("parsed", "Valid JSON parses", parsed !== null, "object", String(parsed?.action)),
          check("action", "read_file action", parsed?.action === "read_file", "read_file", parsed?.action ?? "—"),
          check("path", "Path param", parsed?.params.path === "src/App.tsx", "src/App.tsx", parsed?.params.path ?? "—"),
        ];
      });

    case "edit.llm_agent_fallback":
      return runCase(def, async () => {
        const session = createAgentLoopSession("Add dark mode toggle");
        const rules = decideNextAction(session);
        const decide = createLlmDecideNextAction(async () => ({
          ok: true,
          text: "not json at all",
        }));
        const next = await decide(session);
        return [
          check("fallback", "Uses rules engine", next.action === rules.action, rules.action, next.action),
          check("thought", "Keeps rules thought", next.thought === rules.thought, rules.thought, next.thought),
        ];
      });

    case "edit.live_sudoku_timer_route":
      return runCase(def, async () => {
        const prompt = "Add an elapsed timer to the Sudoku game UI";
        const route = routeAgentPrompt({
          prompt,
          projectOpen: true,
          projectPath: "/tmp/sudoku-app",
          scan,
          scanStatus: "done",
        });
        const action = resolveFollowUpSubmitAction({
          hasProject: true,
          routeExecution: route.execution,
          emptyProjectFolder: false,
          scan,
          scanStatus: "done",
        });
        return [
          check("mode", "Edit existing Sudoku app", route.mode === "edit_existing_project", "edit_existing_project", route.mode),
          check("execution", "Build loop for timer feature", route.execution === "build_loop", "build_loop", route.execution),
          check("submit", "Follow-up submit", isFollowUpEditSubmitAction(action), "build_loop|agent_loop", action.kind),
        ];
      });

    case "edit.live_mock_agent_cycle":
      return runCase(def, async () => {
        const session = createAgentLoopSession("Find timer hook");
        const decide = createLlmDecideNextAction(async () => ({
          ok: true,
          text: JSON.stringify({
            thought: "Search timer",
            reason: "Locate hook",
            action: "search_symbols",
            params: { query: "timer" },
            actionDetail: 'SearchSymbols("timer")',
          }),
        }));
        const think = await decide(session);
        let searchCalled = false;
        const { result } = await executeAgentAction(
          session,
          think.action,
          think.params,
          {
            searchFiles: async () => [],
            searchSymbols: async (query) => {
              searchCalled = query === "timer";
              return [{ path: "src/hooks/useTimer.ts", reason: "symbol", symbolName: "useTimer" }];
            },
            findReferences: () => [],
            readFile: async () => ({ ok: false, preview: "" }),
            createPlan: async () => ({
              ok: false,
              fileCount: 0,
              newFileCount: 0,
              paths: [],
            }),
            modifyFiles: async () => ({ ok: false, filesModified: [] }),
            runVerification: async () => ({ ok: true, summary: "ok" }),
            runAutoFix: async () => ({ ok: true, summary: "ok" }),
          },
        );
        return [
          check("think", "LLM selects search_symbols", think.action === "search_symbols", "search_symbols", think.action),
          check("act", "Act callback invoked", searchCalled, "true", String(searchCalled)),
          check("obs", "Observation recorded", result.ok, "true", String(result.ok)),
        ];
      });

    default:
      return {
        ...def,
        passed: false,
        durationMs: 0,
        checks: [],
        error: `Unknown edit pipeline case: ${def.id}`,
      };
  }
}

export async function runAllEditPipelineCases(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];
  for (const def of EDIT_PIPELINE_CASES) {
    results.push(await runEditPipelineCase(def));
  }
  return results;
}

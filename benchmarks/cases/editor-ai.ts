import { formatInlineEditPrompt } from "@/core/editor/inlineEdit";
import {
  deriveAiPatchReview,
  deriveSafeEditPatchReview,
  firstPatchChangeLine,
} from "@/core/editor/patchReviewOverlay";
import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import { buildRepoMapFileDetail } from "@/core/repository/repoMap";
import { mockProjectScan } from "@/core/repository/testScan";
import { suggestLineContinuation } from "@/core/editor/lineContinuation";
import { suggestInlineTabSuffix } from "@/core/editor/inlineTabSuggest";
import {
  buildInlineSuggestPrompt,
  parseInlineSuggestResponse,
} from "@/core/editor/aiInlineSuggest";
import { allPassed, check } from "../harness/evaluators";
import type { BenchmarkCaseDefinition, BenchmarkCaseResult } from "../types";

export const EDITOR_AI_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "editor.inline_edit_prompt",
    category: "editor_ai",
    name: "Cmd+K inline edit prompt",
    description: "Selection-scoped patch prompt includes line range and selected code.",
    weight: 1,
  },
  {
    id: "editor.ghost_text_suffix",
    category: "editor_ai",
    name: "Ghost-text symbol suffix",
    description: "Partial identifiers complete via project symbol index.",
    weight: 1,
  },
  {
    id: "editor.line_continuation",
    category: "editor_ai",
    name: "Line continuation brackets and imports",
    description: "Local ghost-text closes brackets and completes import lists.",
    weight: 1,
  },
  {
    id: "editor.jsx_tag_completion",
    category: "editor_ai",
    name: "JSX component tag completion",
    description: "Partial JSX tags complete to indexed React components.",
    weight: 1,
  },
  {
    id: "editor.ai_inline_suggest",
    category: "editor_ai",
    name: "Provider inline suggest parse",
    description: "AI tab-completion responses map to insertable suffixes.",
    weight: 1,
  },
  {
    id: "editor.patch_review_overlay",
    category: "editor_ai",
    name: "Inline patch review overlay",
    description: "AI and safe-edit patches derive before/after overlay state.",
    weight: 1,
  },
  {
    id: "editor.repo_map_detail",
    category: "editor_ai",
    name: "Repo map file drill-down",
    description: "Repository index composes per-file map detail.",
    weight: 1,
  },
];

const SYMBOLS = [
  {
    name: "Dashboard",
    kind: "component" as const,
    path: "src/pages/Dashboard.tsx",
    absPath: "/tmp/app/src/pages/Dashboard.tsx",
    line: 4,
  },
  {
    name: "useTimer",
    kind: "hook" as const,
    path: "src/hooks/useTimer.ts",
    absPath: "/tmp/app/src/hooks/useTimer.ts",
    line: 1,
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

export async function runEditorAiCase(
  def: BenchmarkCaseDefinition,
): Promise<BenchmarkCaseResult> {
  switch (def.id) {
    case "editor.inline_edit_prompt":
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

    case "editor.ghost_text_suffix":
      return runCase(def, async () => [
        check(
          "suffix",
          "Completes Dashboard",
          suggestInlineTabSuffix("const Dash", SYMBOLS) === "board",
          "board",
          suggestInlineTabSuffix("const Dash", SYMBOLS) ?? "—",
        ),
        check(
          "skip",
          "Skips unrelated lines",
          suggestInlineTabSuffix("const n = 1", SYMBOLS) === null,
          "null",
          String(suggestInlineTabSuffix("const n = 1", SYMBOLS)),
        ),
        check(
          "case_insensitive",
          "Case-insensitive match",
          suggestInlineTabSuffix("const dash", SYMBOLS) === "board",
          "board",
          suggestInlineTabSuffix("const dash", SYMBOLS) ?? "—",
        ),
      ]);

    case "editor.line_continuation":
      return runCase(def, async () => [
        check(
          "brace",
          "Closes open brace",
          suggestLineContinuation("export function App() {", SYMBOLS) === "}",
          "}",
          suggestLineContinuation("export function App() {", SYMBOLS) ?? "—",
        ),
        check(
          "paren",
          "Closes open paren",
          suggestLineContinuation("if (ready", SYMBOLS) === ")",
          ")",
          suggestLineContinuation("if (ready", SYMBOLS) ?? "—",
        ),
        check(
          "import",
          "Completes import symbol",
          suggestLineContinuation("import { Dash", SYMBOLS) === "board",
          "board",
          suggestLineContinuation("import { Dash", SYMBOLS) ?? "—",
        ),
      ]);

    case "editor.jsx_tag_completion":
      return runCase(def, async () => [
        check(
          "jsx",
          "Completes JSX tag",
          suggestLineContinuation("return <Dash", SYMBOLS) === "board",
          "board",
          suggestLineContinuation("return <Dash", SYMBOLS) ?? "—",
        ),
        check(
          "direct",
          "Direct JSX helper agrees",
          suggestInlineTabSuffix("return <Dash", SYMBOLS) === "board",
          "board",
          suggestInlineTabSuffix("return <Dash", SYMBOLS) ?? "—",
        ),
        check(
          "no_false",
          "No completion on empty",
          suggestLineContinuation("return <", SYMBOLS) === null,
          "null",
          String(suggestLineContinuation("return <", SYMBOLS)),
        ),
      ]);

    case "editor.ai_inline_suggest":
      return runCase(def, async () => {
        const prompt = buildInlineSuggestPrompt({
          relPath: "src/hooks/useTimer.ts",
          languageId: "typescript",
          linePrefix: "export function useTimer() { return ",
          lineSuffix: "",
        });
        const suffix = parseInlineSuggestResponse(
          '{ "elapsed": 0, "start": () => {} }',
          "export function useTimer() { return ",
        );
        return [
          check("prompt", "Prompt mentions file", prompt.includes("useTimer.ts"), "useTimer.ts", "—"),
          check("suffix", "Parses JSON-like completion", suffix?.includes("elapsed") === true, "elapsed", suffix ?? "—"),
          check("empty", "Rejects empty", parseInlineSuggestResponse("", "const x = ") === null, "null", "—"),
        ];
      });

    case "editor.patch_review_overlay":
      return runCase(def, async () => {
        const review = deriveSafeEditPatchReview(
          {
            kind: "replace-text",
            before: "const a = 1;\n",
            after: "const a = 2;\n",
            description: "update",
          },
          true,
        );
        return [
          check("overlay", "Derives safe-edit overlay", review?.after === "const a = 2;\n", "const a = 2;\n", review?.after ?? "—"),
          check("line", "Finds first changed line", firstPatchChangeLine("a\nb\n", "a\nB\n") === 2, "2", String(firstPatchChangeLine("a\nb\n", "a\nB\n"))),
          check("ai", "AI overlay needs active path", deriveAiPatchReview(null, "/x") === null, "null", "—"),
        ];
      });

    case "editor.repo_map_detail":
      return runCase(def, async () => {
        const scan = mockProjectScan(["src/a.ts", "src/b.ts"], {
          index: [
            {
              path: "src/a.ts",
              imports: ["./b"],
              exports: ["foo"],
              components: [],
              functions: ["foo"],
              hooks: [],
              classes: [],
              interfaces: [],
              types: [],
              referencedNames: [],
            },
          ],
          symbols: [
            {
              name: "foo",
              kind: "function",
              path: "src/a.ts",
              absPath: "/project/src/a.ts",
              line: 1,
            },
          ],
        });
        const repository = buildRepositoryIndex(scan);
        const detail = buildRepoMapFileDetail(repository, "src/a.ts");
        return [
          check("detail", "Builds file detail", detail?.symbols.length === 1, "1", String(detail?.symbols.length ?? 0)),
          check("exports", "Includes exports", detail?.exports.includes("foo") === true, "foo", detail?.exports.join(",") ?? "—"),
          check("missing", "Missing file returns null", buildRepoMapFileDetail(repository, "nope.ts") === null, "null", "—"),
        ];
      });

    default:
      return {
        ...def,
        passed: false,
        durationMs: 0,
        checks: [],
        error: `Unknown editor AI case: ${def.id}`,
      };
  }
}

export async function runAllEditorAiCases(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];
  for (const def of EDITOR_AI_CASES) {
    results.push(await runEditorAiCase(def));
  }
  return results;
}

# BryantLabs Studio — Architecture

> **Reconciliation note:** This document is the canonical architecture/vision for
> BryantLabs Studio. Each phase below is annotated with its real implementation
> status and, where useful, an **_As built_** pointer to the code. Phases 1–18
> are implemented; Phases 19–22 cover the 2026 refactor (orchestration extraction,
> run persistence, git polish, platform layer). CI runs typecheck, 240 unit
> tests (176 renderer + 64 electron main), and production build on every push.

## Vision

BryantLabs Studio is a local-first AI development environment designed to
understand projects before modifying them.

The architecture follows a strict progression:

```
Open Project
  ↓
Understand Project
  ↓
Plan Changes
  ↓
Edit Safely
  ↓
Build & Verify
  ↓
Generate with AI
```

The goal is to avoid the problems discovered during BLAI development by
prioritizing project understanding, planning, and verification before
generation.

---

# Current Status

## Phase 1 — Foundation ✅ Implemented

### Purpose

Provide a stable desktop application foundation.

### Technology

- Electron
- React
- TypeScript
- Vite

### Features

- Desktop shell
- Three-panel layout
- Terminal/log panel
- Status bar
- Dark professional UI

### Success Criteria

- Electron launches
- TypeScript passes
- Build passes

> **_As built:_** Single secure Electron window (`contextIsolation` on,
> `nodeIntegration` off, `sandbox` on). The three-column layout has since evolved
> into a tabbed left **Sidebar**, a center **Editor**, and a tabbed right panel
> (**Plan / Preview**), above a **Terminal** dock and **Status bar**.
> Entry: `electron/main.cts`, `src/app/App.tsx`.

---

## Phase 2 — Workspace ✅ Implemented

### Purpose

Allow BryantLabs Studio to open and inspect local projects.

### Features

- Open Project
- Project root selection
- Secure IPC bridge
- Read-only file browsing
- Read-only editor
- Syntax highlighting
- File tree navigation

### Security Rules

- All paths must remain inside project root
- No path traversal
- No write operations
- Binary files blocked
- Large files restricted (> 2 MB)

### Result

BryantLabs Studio can safely browse code without modifying anything.

> **_As built:_** The bridge exposes only read-only IPC: `openProject`,
> `listDirectory`, `readFile` (plus `scanProject` from Phase 3). Every path is
> validated against the opened project root. Highlighting via `highlight.js`.
> Entry: `electron/main.cts`, `electron/preload.cts`, `src/components/EditorPanel.tsx`.

---

## Phase 3 — Project Intelligence ✅ Implemented

### Purpose

Understand project structure before modifications occur.

### Scanner

Detects:

- React
- Electron
- Node
- Vite
- Next.js

### Project Metadata

Tracks:

- Framework
- Language
- Entry points
- Package manager
- File counts
- Folder counts

### Indexing

Builds project index containing:

- Files
- Imports
- Exports
- Components
- Functions
- Symbols

### Search

Supports:

- Global file search
- Global symbol search

### Result

BryantLabs Studio understands project structure before planning changes.

> **_As built:_** Read-only walk that skips heavy/generated directories
> (`node_modules`, `.git`, `dist`, `dist-electron`, `build`, `.next`, etc.). The
> index is regex-based (no eval, no execution). Surfaced in the sidebar
> **Overview** and **Search** tabs with a live index-status indicator.
> Entry: `electron/projectScanner.cts`, `electron/codeIndexer.cts`.

---

## Phase 4 — Planning Engine ✅ Implemented

### Purpose

Analyze prompts and determine likely project modifications without editing files.

### Input

Example prompts:

- Add dark mode
- Create login page
- Fix navbar spacing
- Add dashboard

### Planner Responsibilities

Determine:

- User intent
- Relevant files
- Confidence level
- Impact level
- Proposed modifications

### Output

Returns:

- Summary
- Ranked file list
- Reasoning
- Confidence
- Impact

### Rules

- Read-only
- Deterministic
- No AI
- No file modifications

### Result

BryantLabs Studio can reason about project changes before attempting
modifications.

> **_As built:_** Pure, provider-agnostic module using deterministic heuristics:
> prompt tokenization, filename/path matching, symbol matching, import-graph
> propagation, and framework/intent knowledge. Same prompt + project ⇒ same plan.
> Entry: `src/core/planner/` (`tokenize.ts`, `intents.ts`, `score.ts`, `index.ts`).
>
> **Known gap:** intent rules currently cover `theme`, `auth`, `navigation`,
> `routing`, `form`, `data`, and `styling`, with a `generic` fallback. There is
> **no dedicated `dashboard` intent** yet — the example prompt *"Add dashboard"*
> resolves to the generic intent (still deterministic, but without
> dashboard-specific knowledge). Adding a `dashboard` rule is a small follow-up.

---

# Lessons Learned From BLAI

## What Worked

### Project Isolation

Every project must remain isolated.

Never allow:

- Shared diagnostics
- Shared repair queues
- Shared logs

### Import/Export Reconciliation

Automatically resolve:

- Named import mismatches
- Default import mismatches

### Duplicate Export Protection

Prevent duplicate exports (e.g. both a named `export` and an `export default`
for the same symbol, or repeated declarations) from ever reaching disk.

### Repair Loop Escape Hatch

Never allow infinite repair loops.

Provide deterministic fallbacks.

### Preview Stability

Preview navigation must have one source of truth.

Avoid competing navigation systems.

### Constraint Enforcement

Follow-up user instructions must override broad generation behavior.

### Verification

Never claim success until:

- TypeScript passes
- Build passes
- Preview launches

## What Did Not Work

### Generation Before Understanding

BLAI attempted generation too early. Studio intentionally reverses this order.

### Excessive Repair Layers

Multiple repair systems created complexity and debugging difficulty.

### Silent Provider Switching

Provider changes must always be visible and explicit.

### Placeholder Generation

Placeholder components should never be considered successful completion.

---

# Future Roadmap

## Phase 5 — Safe Editing — ✅ Implemented

Goal:

```
Plan
  ↓
Propose Patch (deterministic)
  ↓
Review Patch (before/after diff)
  ↓
User Approves
  ↓
Apply Patch (write + verify)
  ↓
Undo (single level)
```

No AI required.

> **_As built:_** First write-capable system. Deterministic single-file edits
> (add comment at top / replace exact text / append note). The main process
> validates every write against the project root, blocks protected dirs
> (`node_modules`, `.git`, `dist`, `build`, …) and lockfiles, refuses binary and
> >2 MB content, confirms the on-disk basis is unchanged, and **re-reads after
> writing to verify** before reporting success. Apply is gated behind an explicit
> review step; one-level Undo restores prior content.
> Entry: `src/core/editor/`, `electron/fileWriter.cts`,
> `src/components/editor/` (toolbar + diff). Verified by a 13-case file-writer
> safety test against a temp directory.

## Phase 6 — Build & Verification — ✅ Implemented

Goal:

- TypeScript execution
- Build execution
- Error capture
- Verification pipeline

> **_As built:_** First process-execution system. The main process runs exactly
> two fixed commands in the active project root — `npx tsc --noEmit` and
> `npm run build` — with `shell: true` but constant command strings (only the
> cwd varies, so there is no arbitrary command execution). Each run captures
> stdout/stderr (capped at 200 KB/stream), the exit code, duration, a
> `error TS####` / `warning TS####` diagnostic count, and a timeout flag
> (type-check 120 s, build 300 s; killed via `SIGKILL`). A concurrency guard
> blocks overlapping runs. The bottom dock is now tabbed **Verification /
> Terminal**: the Verification tab shows per-command Passed/Failed badges, exit
> code, time, diagnostic counts, and collapsible raw output (auto-expanded on
> failure). The latest result is retained and labelled with the path of the last
> applied edit (association). No auto-fix, no AI.
> Entry: `electron/verifier.cts`, IPC `verify:run`,
> `src/components/BottomDock.tsx`, `src/components/views/VerificationView.tsx`.
> Verified against this project (typecheck/build pass) and a temp broken project
> (2 `error TS` detected, exit 2, both commands `ok: false`).

## Phase 7 — Provider System — ✅ Implemented

Goal:

- Gemini
- OpenAI
- Ollama

Features:

- Explicit provider selection
- Model selection
- Provider pinning
- Visible routing

> **_As built:_** First network/AI communication, but strictly **read-only** —
> a single test prompt, **no project context, no generation, no editing, no
> agents**. A provider-agnostic core (`src/core/providers`: common
> response/health shapes + a pluggable registry) drives the UI; the actual
> network calls and all secrets live in the main process
> (`electron/providers/`: `gemini.cts`, `ollama.cts`, `settings.cts`, dispatch
> `index.cts`). Implemented providers: **Gemini** (key-present + test-request
> health, `generateContent` test) and **Ollama** (reachable + model-installed +
> test-prompt health via `/api/tags` and `/api/generate`). OpenAI is registry-
> ready but not yet implemented.
>
> Routing is **explicit and strict**: requests go to the requested provider or
> fail — no automatic fallback, no silent provider/model switching. The
> Providers panel (right-panel tab) always shows **requested / active provider /
> active model**, per-check health, and the **raw** provider response.
> Settings persist locally under the OS user-data dir; the **Gemini API key
> never leaves the main process** (the renderer only sees `hasGeminiKey`) and is
> never logged. IPC: `providers:getSettings|saveSettings|health|test`.
> Verified: key persists to disk but is absent from the sanitized view;
> missing-key Gemini health and unreachable-Ollama health both fail cleanly and
> echo the requested provider (no fallback).

## Phase 7.5 — AI Planning — ✅ Implemented

Goal:

Let AI providers analyze a project and produce a plan — **plan only**, no
edits, patches, writes, builds, or agents.

> **_As built:_** Two planner modes shown **side-by-side** for the same prompt.
> The deterministic planner (Phase 4) runs instantly/offline; the AI planner
> sends a compact, read-only **project context** (framework, language, capped
> file list ≤250, symbol index ≤200, entry points — **structure only, never
> file contents**) plus the prompt to the active provider and parses back a
> structured plan (summary, files, reasoning, risks, confidence).
>
> The model is told to return JSON only; the main process extracts the first
> balanced JSON object (tolerating code fences/prose), validates and clamps
> fields, and falls back to showing raw text on parse failure. A **comparison
> view** (right-panel Plan tab) renders both plans plus an **agreement score**
> (filename-overlap Jaccard), shared / only-deterministic / only-AI file lists,
> and a confidence-match note. Routing stays explicit — the AI plan echoes the
> provider/model that answered, with no fallback.
>
> Entry: `src/core/planner/aiTypes.ts`, `src/core/planner/context.ts`
> (context + agreement), `electron/providers/aiPlan.cts` (prompt + parser),
> provider `generate()`, dispatch `runPlan()`, IPC `providers:plan`,
> `src/components/PlanComparisonView.tsx` + `AIPlanView.tsx`. Verified: parser
> handles fenced/prose JSON, clamps bad confidence, filters non-string risks,
> and returns null on garbage; `runPlan` failure paths echo the requested
> provider (no key / unknown provider) with no fallback.

## Phase 8 — AI Patch Planning — ✅ Implemented

Goal:

Let AI propose a patch for a single file — **proposal only**, no writes, no
application, no build execution, no autonomous actions.

> **_As built:_** The active provider receives the prompt, compact project
> context, the **selected target file's current content**, and that file's
> relevant symbols, and returns the **complete proposed file content** plus a
> summary, reasoning, and risk assessment. The renderer diffs the proposal
> against the current file (reusing the Phase 5 `computeDiff`) and shows a
> three-way toggle — **Diff / Current file / Proposed patch** — in the
> right-panel **AI Patch** tab.
>
> To survive transport, the model returns metadata as JSON and the full file
> content between unambiguous markers (`@@PATCHED_FILE_START/END@@`), so code
> with braces/quotes/newlines needs no JSON escaping; missing markers surface a
> clear error with the raw output. Target files are capped (≤60k chars) and only
> structure (never other files' contents) is sent. Routing stays explicit (the
> result echoes provider/model + target path); no fallback. **There is no apply
> path** — proposals are read-only.
>
> Entry: `electron/providers/aiPatch.cts` (prompt + marker parser),
> dispatch `runPatch()`, IPC `providers:patch`,
> `src/components/views/AIPatchView.tsx`, state in `WorkspaceProvider`
> (`proposeAIPatch`). Verified: parser preserves code with braces/templates,
> returns null on missing markers, tolerates absent metadata; `runPatch`
> failure echoes the requested provider + target path with no application.

## Phase 9 — AI Patch Application — ✅ Implemented

Goal:

Apply a reviewed AI patch proposal to disk using the **existing Phase 5 safe
write engine** — single-file only, human-approved, no autonomy.

> **_As built:_** After Phase 8 proposes a patch, the user reviews the diff
> (basis content at proposal time → proposed content), clicks **Approve AI patch**,
> then **Apply AI patch**. Apply calls the same `edit:apply` IPC → `applyEdit`
> → `writeVerified` path as deterministic edits: path/content validation,
> optimistic concurrency (`expectedBefore` = basis at proposal time), re-read
> verification, and single-level **Undo** via `edit:undoLast`. No second write
> system; the AI never writes directly.
>
> Apply stays disabled until a proposal exists, a non-empty diff exists, and the
> user has explicitly approved. If the file changed on disk since the proposal,
> the UI blocks apply and `applyEdit` rejects with “file changed on disk”.
> Metadata shown: provider, model, target file, proposal timestamp, apply
> result. Optional **Run verification** (Phase 6) is manual only — no auto
> build, no re-generation, no agent loop.
>
> Entry: `AIPatchSession` in `WorkspaceProvider`, `approveAIPatch` /
> `applyAIPatch`, `src/components/views/AIPatchView.tsx` apply bar.

## Phase 10 — Greenfield App Generation — ✅ Implemented

Goal:

Create a brand-new application from an **empty folder** — single-app MVP, not
agent mode.

> **_As built:_** **New App** sidebar wizard: select empty folder → prompt +
> provider/model → AI generates exactly **seven files** (marker-based parse) →
> review (list, diff vs empty, contents) → **Approve generation** → write via
> `writeGreenfieldFiles` → `writeVerified` (Phase 5) → `npm install` →
> `tsc --noEmit` → `npm run build` (stop on failure, no auto-repair) →
> `npm run preview` on success. **Preview** panel shows URL + iframe.
> Entry: `electron/greenfield/`, IPC `greenfield:*`, `project:openAt`,
> `src/components/views/NewAppView.tsx`, `PreviewView.tsx`.

## Phase 11 — Apply Plan Reliability — ✅ Implemented

Goal:

Make **Apply Plan** on existing projects as reliable as **New App** generation.

> **_As built:_** `src/core/planApply/proposalValidation.ts` gates proposals before
> review (non-empty diff, no whitespace-only edits, valid targets). `collectTargets`
> attaches relevance scores and symbol matches; `buildNarrowedRetryTargets` runs
> one automatic retry when zero valid proposals. `formatPlanApplyFileDiagnosticLine`
> drives per-file diagnostics in `PlanApplyReview`. After approved writes,
> verification uses structured failure reports; success requires tsc + build +
> preview start when a preview script exists (`greenfieldPreviewStart`).
>
> Entry: `WorkspaceProvider` (`startApplyPlan`, `applyApprovedPlanFiles`),
> `src/core/planApply/*`, `PlanApplyReview.tsx`.

## Phase 12 — Repository Intelligence — ✅ Implemented

Goal:

Understand code relationships (imports, exports, symbols, references) before
planning edits — reduce reliance on filename heuristics alone.

> **_As built:_** `electron/codeIndexer.cts` extracts hooks, classes, interfaces,
> types, and referenced identifiers. `projectScanner.cts` builds `symbolGraph`
> and `repositoryStats` on every scan. Renderer `src/core/repository/` provides
> search, find-references, and `computeRepositoryRelevance` merged into
> `generatePlan` and `buildPlanContext` for AI plans. **Repository** icon-rail
> tab: `RepositoryView.tsx`.
>
> Apply Plan and Greenfield flows are unchanged.

## Phase 13 — Autonomous Fix Loop — ✅ Implemented

Goal:

Automatically repair TypeScript/build failures introduced by **Apply Plan** without
requiring a new user prompt.

> **_As built:_** On verification failure, `collectVerificationFailures` parses
> structured diagnostics. `buildAutoFixContext` + `runAutoFixLoop` (max 3 attempts)
> call `providers:autoFix` for a single-file repair, apply via `applyEdit`, then
> re-verify. **Providers** setting `autoFixMode`: off | ask | automatic (default ask).
> `AutoFixRepairPanel` shows timeline, diff, and approval. Greenfield and Repository
> systems are unchanged.

## Phase 14 — Context & Session Memory — ✅ Implemented

Goal:

Remember project context across prompts so follow-up requests need less
explanation (“make it premium”, “move that button”, “fix the issue we just created”).

> **_As built:_** `src/core/sessionMemory/` maintains a session snapshot
> (prompts, plans, modified files, failures, auto-fixes, timeline).
> `resolveFollowUpPrompt` expands vague follow-ups before deterministic and AI
> planning. `buildAIPlanContextWithSession` merges session data into AI Plan
> context; `WorkspaceProvider` records events passively (no changes to Apply Plan,
> Auto Fix, or Greenfield modules). **Memory** icon-rail tab: `MemoryView.tsx`.
> `project:gitBranch` IPC exposes the current branch read-only. Plan comparison
> shows session-memory diagnostics when memory influences planning.

## Phase 15 — Multi-File Agent Execution — ✅ Implemented

Goal:

Execute complex, coordinated changes across many files as an ordered task — not
isolated one-off patches.

> **_As built:_** `src/core/execution/` builds an execution plan from the AI plan,
> orders steps by dependency (context → pages → routing → integration → styles),
> runs `runExecutionStep` with batch propose/validate/apply per step, and
> `validateCrossFileBatch` before writes. `edit:createFile` supports planned new
> paths. **Execution** icon-rail tab: `ExecutionView.tsx`. Recovery: retry, skip,
> regenerate on a failed step. Wired from `WorkspaceProvider` and **Run Execution**
> in plan comparison — without modifying Greenfield, Repository, Session Memory,
> Apply Plan, or Auto Fix modules.

## Phase 16 — Autonomous App Builder — ✅ Implemented

Goal:

Build complete applications from one prompt by chaining planning, execution,
verification, and repair without repeated user handoffs.

> **_As built:_** `src/core/builder/` stores the build goal, generates a phased
> roadmap (task manager, CRM, calculator, or generic templates), and
> `WorkspaceProvider` orchestrates per phase: deterministic plan → AI plan →
> multi-file execution → verification → automatic Auto Fix (max 3 repairs/phase).
> **Builder** icon-rail tab with Manual / Hybrid / Autonomous approval modes and
> pause, resume, stop. Completion report summarizes features, files, verification,
> and duration. Does not modify Greenfield, Repository, Session Memory, or
> Execution core modules.

## Phase 17 — Agent Workspace — ✅ Implemented

Goal:

Unified visibility and control while the agent works — watch, inspect, pause,
and export a full session report.

> **_As built:_** `src/core/agentWorkspace/` stores feed, history, decisions,
> artifacts, timeline, and report export. `WorkspaceProvider` records observations
> from builder, AI plan, execution, verification, and auto-fix flows without
> modifying those engines. **Agent** icon-rail tab: `AgentView.tsx` with live
> feed, context, decisions, actions, history, artifacts, timeline, and report
> download.

## Phase 18 — Studio Agent — ✅ Implemented

Goal:

Reasoning-driven agent that chooses its own next actions (explore, plan, edit,
verify, repair) without predefined builder roadmaps.

> **_As built:_** `src/core/agentLoop/` implements the observe → think → act
> loop, heuristic reasoning, dynamic tasks, investigation vs goal modes, safety
> gates, and action dispatch. `WorkspaceProvider` wires repository search, AI
> plan, multi-file execution, verification, and Auto Fix via callbacks only.
> Agent Workspace (`appendAgentReasoning`) shows Thought / Reason / Action /
> Result live. Start from the **Agent** tab goal field.

## Phase 19 — Orchestration Extraction — ✅ Implemented

Goal:

Keep `WorkspaceProvider` as a thin React host while moving multi-step AI
workflows into testable orchestration modules.

> **_As built:_** `src/app/orchestration/` (~37 modules) owns planning, apply
> plan, execution loop, builder, studio agent, auto-fix, AI patch, provider
> invoke, verification, safe edit, failure reports, and pipeline/build loops.
> `WorkspaceProvider.tsx` (~3k lines) holds state, builds host refs, and
> delegates to `*Orchestration.ts` entry points exported from
> `src/app/orchestration/index.ts`. Unit tests live beside modules under
> `src/app/orchestration/*.test.ts`.

| Module | Responsibility |
|--------|----------------|
| `planning.ts` | Deterministic + AI plan |
| `applyPlan*.ts` | Apply Plan propose/approve/apply/finalize |
| `executionLoop.ts` / `executionSession.ts` | Multi-file execution |
| `builderOrchestration.ts` | Autonomous builder |
| `agentOrchestration.ts` | Studio agent loop wiring |
| `autoFixOrchestration.ts` | Post-apply repair |
| `aiPatchOrchestration.ts` | AI patch propose/apply |
| `providerInvokeOrchestration.ts` | Stage provider calls + fallback |
| `studioActionOrchestration.ts` | Run log + analytics bookends |
| `pipelineRunner.ts` / `buildLoop.ts` | Pipeline + single-agent build |

## Phase 20 — Run Persistence — ✅ Implemented

Goal:

Resume interrupted runs after app restart without losing pipeline, execution,
builder, or agent state.

> **_As built:_** `src/core/runPersistence/` builds normalized checkpoints from
> active sessions. Disk storage:
> `{projectRoot}/.bryantlabs/run-checkpoint.v1.json` (Electron IPC in
> `electron/runCheckpoint.cts`). `ResumeRunDialog.tsx` offers Resume / Abandon
> on project open. Resume paths: multi-agent pipeline, multi-file execution,
> build review, paused builder/agent. Checkpoints clear on successful
> `finishStudioAction`.

## Phase 21 — Git Panel Polish — ✅ Implemented

Goal:

First-class git workflow inside Insights without leaving the studio.

> **_As built:_** `electron/projectGit.cts` + `GitView.tsx` (status, stage,
> unstage, commit, Monaco diff). **Auto-refresh** after file writes (hooked to
> `runScan`). **`git restore`** discards tracked/untracked changes.
> Title-bar branch + dirty badge opens **Insights → Git** via `openGitPanel()`.

## Phase 22 — Platform Layer — ✅ Implemented

Goal:

Standardize agent tools, add semantic code search, and automate quality gates.

### MCP tool host

> **_As built:_** In-process MCP-style host in `electron/mcp/` exposes builtin
> tools (`read_file`, `list_directory`, `scan_project`, `git_status`,
> `verify_project`, `semantic_search`) via IPC `mcp:*`. Renderer types in
> `src/core/mcp/`. External MCP servers are planned; builtin tools wrap
> existing Electron IPC.

### Semantic index

> **_As built:_** TF-IDF index over symbol-aware chunks in
> `electron/semanticIndex/` (persisted to `.bryantlabs/semantic-index/v1.json`).
> Hybrid search (`src/core/semanticIndex/hybridSearch.ts`) merges lexical
> repository hits with semantic scores in the studio agent. Rebuilds after scan
> and file writes.

### CI / testing

> **_As built:_** `.github/workflows/ci.yml` — typecheck, `test:unit`,
> `test:electron`, `build`. Scripts: `test:all`, `test:e2e` (smoke). Electron
> main tests include `fileWriter` safety checks. Renderer orchestration tests
> in `src/app/orchestration/*.test.ts` cover pipeline gates, apply-plan run
> ownership, failure reports, studio action guards/bookends, execution step
> reset, apply-plan finalize, and build phase derivation.

---

# Workspace shell (post-refactor)

```
WorkspaceProvider.tsx          # React state + host refs (~3k lines)
  └── src/app/orchestration/   # Workflow engines (testable)
  └── src/core/                # Domain logic (planner, execution, agent, …)
  └── electron/                # IPC, file writer, git, MCP, semantic index
```

**Desktop bridge:** `electron/preload.cts` → `BryantLabsApi` in `src/types/index.ts`.

---

# Core Principles

1. Understand before modifying.
2. Plan before generating.
3. Verify before claiming success.
4. Keep project boundaries strict.
5. Prefer deterministic systems before AI systems.
6. Never hide provider selection.
7. Never sacrifice reliability for speed.

BryantLabs Studio is an IDE first and an AI generator second.

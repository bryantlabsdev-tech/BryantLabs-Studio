# BryantLabs Studio

A local-first AI app builder. This repository is a **fresh, independent project** — it is not BLAI and shares no BLAI code or architecture.

> See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full vision, phase status, BLAI lessons learned, and the roadmap (Phases 5–9).

> **Status: Phase 18 — Studio Agent.** A reasoning-driven agent loop (observe → think → act) that explores the repo, plans dynamically, executes, verifies, and repairs — without predefined builder roadmaps.

## What Phase 18 includes

- **Agent loop** — Observe → Think → Act until the goal is satisfied or the session stops.
- **Agent actions** — search files/symbols, read file, find references, create plan, modify files, verify, auto-fix, request input, complete task.
- **Reasoning engine** — each step emits Thought, Reason, and Action before execution.
- **Dynamic planning** — mutable task list (add/remove/reorder) during the run.
- **Investigation mode** — diagnostics-first flow for “why is the build failing?” style prompts.
- **Goal mode** — e.g. “Make calculator look like Apple Calculator” without roadmap templates.
- **Agent state** — goal, thoughts, actions, observations, and results for the session.
- **Agent Workspace** — live Thought / Reason / Action / Result panel plus approval gates.
- **Safety** — approval before large file creation, bulk edits, or architecture-level goals.

## What Phase 18 deliberately excludes

Changes to Greenfield, Builder (`src/core/builder/`), Auto Fix (`src/core/autoFix/`), or Repository Intelligence (`src/core/repository/`) — orchestration only via `WorkspaceProvider` and new `src/core/agentLoop/`.

## What Phase 17 includes

- **Agent tab** — unified session view while Builder, Plan, Execution, and Auto Fix run.
- **Live feed** — Thinking, Planning, Executing, Verifying, Repairing, Completed in real time.
- **Context panel** — goal, phase, task, file, model, latency hint.
- **File decisions** — why each path was selected (from plan/execution reasons).
- **Agent actions** — pause, resume, stop, retry/skip execution step, approve builder phase.
- **History** — prompt, plan, execution, verification, auto-fix entries per session.
- **Artifacts** — files created/modified, errors fixed, verification summaries.
- **Timeline** — Plan → Execution → Verification → Repair → Complete.
- **Export** — Agent Report as Markdown or JSON.

## What Phase 16 includes

- **Build goal** — session-stored application goal from a single prompt.
- **Build roadmap** — auto-generated phases (e.g. Core UI → CRUD → Filters → Persistence → Polish).
- **Builder orchestrator** — runs each phase without manual handoffs between Plan, Execution, and Auto Fix.
- **Builder tab** — current phase, completed/remaining phases, files modified, build status.
- **Pause / resume / stop** — control a long-running build.
- **Approval modes** — Manual (every phase), Hybrid (major phases), Autonomous (full roadmap).
- **Failure recovery** — up to 3 repair attempts per phase via Auto Fix, then continue or fail.
- **Completion report** — features built, files created/modified, verification, duration.

## What Phase 16 deliberately excludes

Changes to Greenfield generation, Repository Intelligence, Session Memory, or Multi-File Execution modules (orchestration only in `WorkspaceProvider` + `src/core/builder/`).

## What Phase 15 includes

- **Execution plan** — logical steps derived from the AI plan (e.g. AuthContext → Login page → protected routes → styles).
- **Dependency ordering** — topological step order; new files and providers before consumers.
- **Task graph** — track pending, running, completed, failed, and skipped steps.
- **Batch patch session** — per-file proposed → approved → applied states within one execution run.
- **Cross-file validation** — relative imports and symbol references checked before writes.
- **Execution tab** — task list, current step, diagnostics, recovery controls.
- **Step recovery** — retry, skip, or regenerate a failed step without restarting the whole workflow.

## What Phase 15 deliberately excludes

Changes to Greenfield generation, Repository Intelligence, Session Memory, Apply Plan, or Auto Fix internals.

## What Phase 14 includes

- **Session context store** — current project, git branch (when available), prompt history, last deterministic/AI plans, modified files, verification failures, auto-fixes.
- **Prompt context builder** — before AI Plan, merges recent prompts, edits, repository relevance, failures, and follow-up resolution into `PlanContext.sessionMemory`.
- **Follow-up understanding** — pronouns and vague references (e.g. “it” → calculator, “history panel” → prior history work) via `resolveFollowUpPrompt`.
- **Memory tab** — timeline of prompts, plans, file writes, failures, and auto-fixes; clear all / prompts / failures.
- **Planning diagnostics** — Plan comparison and Memory tab show “Using session memory” when context influences planning.

## What Phase 14 deliberately excludes

Changes to Greenfield generation, Apply Plan, or Auto Fix internals (recording only from `WorkspaceProvider`).

## What Phase 13 includes

- **Failure detection** — structured diagnostics (file, line, column, message) from TypeScript, build, and Vite output.
- **Fix context** — original request, plan summary, modified files, and primary failure fed to the model.
- **Targeted repair proposals** — one file at a time; only files involved in the failure / apply set.
- **Retry loop** — apply → typecheck → build (max 3 attempts) with a repair timeline in the run log.
- **Auto Fix setting** (Providers tab): Off · Ask before repair · Automatic (default: Ask).

## What Phase 13 deliberately excludes

Greenfield generation, Repository Intelligence changes, and autonomous re-planning.

## What Phase 12 includes

- **Enhanced scanner** — indexes hooks, classes, interfaces, types, and cross-file `referencedNames` for a symbol graph.
- **File relevance engine** — prompt → repository search → ranked files (e.g. calculator UI → `src/App.tsx` + `src/index.css`, not `package.json`).
- **Repository tab** — stats, symbol search, find references (defined in / used in).
- **AI Plan context** — `relevantFiles`, `relevantSymbols`, and `referenceGraph` sent to the provider before planning.

## What Phase 12 deliberately excludes

Changes to Apply Plan, Greenfield generation, or autonomous agents.

## What Phase 11 includes

- **Proposal validation** — `validateProposalQuality` rejects identical content, whitespace-only edits, and malformed patches before review; each rejection shows an exact reason.
- **Auto retry** — if zero valid proposals, one retry with the original prompt/plan on **narrowed** targets (top plan scores, or UI-only App.tsx + index.css).
- **Target verification** — per file: selection reason, relevance score (deterministic plan), symbol matches from the scan index.
- **Apply Plan diagnostics** — per-file line: selected → patch generated → accepted/rejected with reason.
- **Verification reliability** — failures use `buildApplyPlanFailureReport` with first TS file/line/message (never a generic-only message in the UI).
- **Success criteria** — apply completes only when files are written, typecheck + build pass, and preview starts when `package.json` defines a preview script.

## What Phase 11 deliberately excludes

No autonomous agents, no multi-pass repair loops, no automatic re-plan after apply failure.

## What Phase 10 includes

- **New App wizard** (sidebar **New App** tab): **Select empty folder**, enter prompt, choose provider/model, **Generate files**, **review** file list + diff vs empty + full contents, **Approve generation**, **Write files & run setup**.
- **Fixed v1 scope** — only: `package.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `tsconfig.json`, `vite.config.ts`.
- **Write safety** — `writeVerified` from Phase 5; folder must be empty; no second write system.
- **Validation pipeline** — `npm install`, `npx tsc --noEmit`, `npm run build`; stops and reports on first failure.
- **Preview** — if build passes, `npm run preview` starts and the **Preview** panel shows the URL + iframe.

## What Phase 10 deliberately excludes

No multi-file architecture beyond the seven files, no component/lib folders, no autonomous agents, no self-healing, no auto-regenerate, no task runners.

## What Phase 9 includes

- Everything from Phases 1–8, plus **human-gated AI patch application**:
- **Workflow:** current file → AI proposal → review diff → **Approve AI patch** → **Apply AI patch** → verified write → optional **Run verification** / **Undo AI patch**.
- **Reuses Phase 5** — `api.applyEdit(absPath, basisContent, proposedContent)` and `undoLastEdit()`; no second write path. Client-side `isEditablePath` + `validatePatch` mirror main-process rules before apply.
- **Concurrency** — the proposal stores `basisContent` at proposal time; apply is blocked in the UI if the open file no longer matches, and `applyEdit` rejects if disk content drifted.
- **Approval gate** — Apply stays disabled until a proposal exists, a diff exists, and the user clicked **Approve AI patch**.
- **Metadata** — provider, model, target file, proposal timestamp, success/failure after apply.

> Flow: **AI Patch** tab → propose → review **Review diff** → **Approve AI patch** → **Apply AI patch** → (optional) **Run verification** or **Undo AI patch**.

## What Phase 9 deliberately excludes

No autonomous edits, multi-file edits, repair loops, automatic re-generation, automatic re-apply, automatic build, or agent behavior.

## What Phase 8 includes

- Everything from Phases 1–7.5, plus **AI patch *proposals*** for a single file:
- The provider receives the **prompt**, compact **project context**, the **selected target file** (the open file's current content), and the file's **relevant symbols**.
- It returns a **proposed patch** (the complete updated file content), a **summary**, **reasoning**, and a **risk assessment**.
- The **AI Patch** tab (right panel) shows the target file, a prompt box, and — once proposed — the summary/reasoning/risks plus a three-way view toggle: **Diff** (proposed vs current, via the Phase 5 diff engine), **Current file**, and **Proposed patch**.
- **Robust transport** — the model returns metadata as JSON and the full file content between unambiguous markers (`@@PATCHED_FILE_START/END@@`), so code with braces, quotes, and newlines survives without JSON-escaping problems. Missing markers surface a clear error with the raw output.
- Target files are capped (≤60k chars) and only **structure** is sent as context (never other files' contents). Routing stays explicit (the result echoes the provider/model + target path); there is no fallback.

> Flow: open a file → right-panel **AI Patch** tab → describe the change → **Propose AI patch** → review the **Diff** (or Current / Proposed) → decide. Nothing is written; applying changes remains out of scope.

## What Phase 8 deliberately excludes

No file writes, no patch application, no build execution, and no autonomous actions. The proposal is shown for inspection only — there is no "apply" path for AI patches in this phase.

## What Phase 7.5 includes

- Everything from Phases 1–7, plus an **AI planner** alongside the deterministic one:
- **Two planner modes, compared side-by-side:**
  - **Deterministic** — the Phase 4 heuristic plan (instant, offline).
  - **AI** — the active provider receives compact, read-only **project context** (framework, language, capped file list, symbol index, entry points) plus the prompt, and returns a structured JSON plan: **summary, files likely affected, reasoning, risks, confidence**.
- **Comparison view** (right-panel **Plan** tab): deterministic and AI columns with an **agreement score** (filename overlap), shared / deterministic-only / AI-only file lists, and whether the two confidence levels match.
- **Robust JSON handling** — the model is instructed to return JSON only; the main process extracts the first balanced JSON object (tolerating code fences / surrounding prose), validates fields, clamps confidence, and surfaces the raw text if parsing fails.
- Context size is capped (≤250 files, ≤200 symbols) and contains **structure only — never file contents**. Routing stays explicit: the AI plan echoes the provider/model that answered; there is no fallback.

> Flow: sidebar **Plan** tab → describe a change → **Analyze & plan** (deterministic, instant) → right-panel **Plan** tab → **Run AI plan** → compare the two plans and the agreement score.

## What Phase 7.5 deliberately excludes

No edits, no patches, no file writes, no build execution, no agents. Both planners only *describe* work; nothing is applied.

## What Phase 7 includes

- Everything from Phases 1–6, plus a **provider system** for read-only model communication:
- **Provider-agnostic core** (`src/core/providers`) — a common request/response shape, a `HealthResult` shape, and a **pluggable registry** (adding a provider is a registry entry + a main-process implementation).
- **Providers** (network calls run in the Electron main process, never the renderer):
  - **Gemini** — health verifies a key is stored and that a minimal test request succeeds; test sends the prompt via `generateContent`.
  - **Ollama** — health verifies the local server is reachable, lists installed models, verifies the selected model exists, and that a test prompt succeeds.
- **Settings** (`electron/providers/settings.cts`) persisted locally under the OS user-data dir. The **Gemini API key never leaves the main process** — the renderer only ever receives `hasGeminiKey: boolean`, and secrets are never logged.
- **Providers panel** (right-panel **Providers** tab): provider selector, model selector (with suggestions), API key / server URL fields, **Save settings**, **Check health** (per-check pass/fail + discovered models), and a **Test prompt** box that shows the extracted text plus the **raw provider response**.
- **Explicit routing** — a status strip always shows **Requested** provider, **Active** provider (the one that actually answered), and **Active model**. A request for a provider is handled by that provider or it fails; there is no fallback and no silent model/provider switching.

> Flow: open the **Providers** tab → pick Gemini or Ollama → set the model (+ key or server URL) → **Save settings** → **Check health** → type a prompt → **Run test** → read the raw response.

## What Phase 7 deliberately excludes

No code generation, no file editing, no patch creation, no agents, and no project context in requests. Providers answer a single ad-hoc test prompt only. No silent provider/model switching and no automatic fallback.

## What Phase 6 includes

- Everything from Phases 1–5, plus a **Build & Verification engine**:
- **Runner** (`electron/verifier.cts`) — runs two fixed commands in the active project root (the command strings are constants; only the working directory varies — no arbitrary command execution):
  - `npx tsc --noEmit` (type-check)
  - `npm run build` (build)
- For each command it captures **stdout/stderr** (capped), the **exit code**, **duration**, a **TypeScript error/warning count** (matched from `error TS####` / `warning TS####`), and whether it **timed out** (type-check 120s, build 300s).
- **Verification panel** — the bottom dock is now tabbed **Verification / Terminal**. The Verification tab has a **Run Verification** button and shows per-command **Passed/Failed** badges, exit code, time, diagnostic counts, and collapsible raw output (auto-expanded on failure).
- **History/association** — the latest result is kept and labelled with the **path of the last applied edit**, so a verification run is tied to the change that prompted it.

> Flow: open a project → … → **Apply** an edit (Phase 5) → bottom dock **Verification** tab → **Run Verification** → read the build/type-check results.

## What Phase 6 deliberately excludes

No AI, no generation, no model providers, and **no auto-fix**. Verification runs the project's own build/type-check and reports the outcome; it never changes files in response.

## What Phase 5 includes

- Everything from Phases 1–4, plus the first **write-capable** system:
- **Deterministic edits** (`src/core/editor`) — pure text transforms with no AI:
  - Add a comment at the top of the file (comment style chosen by extension).
  - Replace exact text (all exact occurrences).
  - Append a note to the end of the file.
- **Approval workflow** surfaced in the center Editor toolbar: **Propose Edit → Review Patch → Apply Patch**, plus **Undo Last Edit**. Apply is disabled until the diff has been reviewed.
- **Before/after diff** preview computed deterministically (prefix/suffix line trimming).
- **Safe writer** (`electron/fileWriter.cts`) enforced in the main process:
  - Path must resolve inside the active project root (no traversal).
  - Refuses `node_modules`, `.git`, `dist`, `dist-electron`, `build`, `out`, `.next`, `coverage`, … and lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`).
  - Refuses binary content and anything over 2 MB.
  - Confirms the on-disk content still matches the patch basis, then **re-reads after writing to verify** success.
- **Undo** restores the previous content of the last applied edit (single level).

> Flow: open a project → scan → **Plan** tab (Phase 4) → click **Edit** on a planned file → choose a deterministic edit → **Propose** → **Review** the diff → **Apply** → optionally **Undo**.

## What Phase 4 includes

- Everything from Phases 1–3 (scan, index, search), plus:
- **Planning Engine** (`src/core/planner`) — a pure, **provider-agnostic** module. Given a prompt and the project scan, it returns:
  - **Files likely affected** — a ranked list.
  - **Reasoning** — why each file was selected.
  - **Proposed changes** — a bullet list of descriptions (not code).
  - **Confidence** — High / Medium / Low.
  - **Impact** — Low / Medium / High.
- It uses only deterministic heuristics: prompt tokenization, filename matching, symbol matching, an import-graph propagation pass, and framework/intent knowledge.
- **UI** additions:
  - Sidebar **Plan** tab — a prompt input (with examples) that builds a plan.
  - Right panel is now tabbed **Plan / Preview**; the **Plan Viewer** shows the full plan and switches into view automatically. Clicking a listed file opens it read-only.

### How the planner works (deterministic)

1. Tokenize the prompt (lowercase, drop stopwords).
2. Detect an intent (theme, auth, navigation, routing, form, data, styling, or generic) by keyword match.
3. Score every project file by filename/path token hits, symbol-name hits, and intent file/symbol patterns.
4. Propagate scores along the local import graph to strengthen tightly-coupled candidates.
5. Rank files, then derive confidence (from match strength) and impact (from intent + breadth).

No models, no randomness — the same prompt + project always yields the same plan.

## What Phase 4 deliberately excludes

No AI, no code generation, no editing/saving, no write operations, no model providers. The planner only *describes* proposed work; applying changes is out of scope.

## Previous phases

- **Phase 1 — Foundation:** clean Electron + React + TypeScript shell with a static three-panel layout.
- **Phase 2 — Workspace:** open a project folder and browse/read its files (read-only, syntax highlighting).
- **Phase 3 — Project Intelligence:** scan, framework detection, lightweight code index, and file/symbol search.
- **Phase 4 — Planning Engine:** deterministic, provider-agnostic plans (files, reasoning, confidence, impact).
- **Phase 5 — Safe File Editing:** deterministic, user-approved, verified single-file edits with one-level undo.
- **Phase 6 — Build & Verification:** run the project's `tsc --noEmit` and `npm run build`, capture output/diagnostics/timing.
- **Phase 7 — Provider System:** read-only Gemini/Ollama connectivity (settings, health, test prompt) with explicit routing.
- **Phase 7.5 — AI Planning:** deterministic vs AI plans side-by-side with an agreement score.
- **Phase 8 — AI Patch Planning:** provider proposes full-file rewrite; diff review only.

## Project structure

```
.
├── electron/            # Electron main + preload (compiled to .cjs with its own tsconfig)
│   ├── main.cts         # Window + read-only IPC handlers (fs + scan)
│   ├── preload.cts      # Minimal, read-only context bridge
│   ├── projectScanner.cts  # Read-only walk: counts, detections, index
│   ├── codeIndexer.cts     # Lightweight regex symbol/import/export extraction
│   ├── fileWriter.cts      # Safe, verified, root-confined writes (Phase 5)
│   ├── verifier.cts        # Build + type-check runner, output capture (Phase 6)
│   ├── providers/          # Provider settings + Gemini/Ollama calls (Phase 7, keys stay here)
│   └── tsconfig.json
├── src/
│   ├── app/             # Application shell + workspace state provider
│   ├── components/      # UI pieces (sidebar, tree, editor, search, plan…)
│   │   ├── editor/      # Edit toolbar + diff view (Phase 5)
│   │   ├── BottomDock.tsx  # Tabbed dock: Verification / Terminal (Phase 6)
│   │   └── views/       # Sidebar + dock views (Explorer/Search/Overview/Plan, Verification, Terminal)
│   ├── core/            # Static metadata, highlight helper
│   │   ├── planner/     # Deterministic planner + AI plan types/context/agreement (Phases 4, 7.5)
│   │   ├── editor/      # Deterministic edits, patch validation, diff (Phase 5)
│   │   └── providers/   # Provider-agnostic types + pluggable registry (Phase 7)
│   ├── types/           # Shared types + window.bryantlabs API typing
│   ├── main.tsx         # Renderer entry
│   └── index.css        # Global dark theme
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Requirements

- Node.js 20+ (developed on Node 24)
- npm 10+

## Scripts

| Script                 | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run dev`          | Start the Vite dev server (renderer in the browser).               |
| `npm run electron:dev` | Start Vite and launch the Electron desktop app against it.         |
| `npm run typecheck`    | Type-check the renderer and the Electron sources (no emit).        |
| `npm run build`        | Type-check, build the renderer, then compile the Electron sources. |
| `npm run preview`      | Preview the built renderer in the browser.                         |
| `npm run electron:dist` | Production build + macOS `.app`, `.dmg`, and `.zip` in `release/`. |
| `npm run electron:release` | Same as `electron:dist` with explicit `dmg` + `zip` targets.      |

## Production packaging (macOS)

Build installable artifacts after a full compile:

```bash
npm install
npm run electron:dist
```

Outputs (unsigned, local build):

| Artifact | Path |
| -------- | ---- |
| Disk image | `release/BryantLabs Studio.dmg` |
| Zip archive | `release/BryantLabs Studio.zip` |

For release builds with explicit target selection:

```bash
npm run electron:release
```

Notes:

- Requires macOS to produce `.dmg` / `.zip` targets.
- Native modules (`node-pty`) are rebuilt for Electron during packaging.
- Code signing is not configured; Gatekeeper may prompt on first launch. Ad-hoc signing or Apple Developer ID can be added later under `build.mac`.

## Getting started

```bash
npm install
npm run typecheck      # passes
npm run build          # passes
npm run electron:dev   # opens the BryantLabs Studio desktop window
```

## Notes for future phases

BLAI is used only as *lessons learned* — its code and architecture are not reused here. Future capabilities (agent, editor, preview engine, terminal process, providers) will be layered on top of this foundation deliberately, one phase at a time.

# Phase 10 — Level to the Max

Product maturity pass: pre-project run history, search badges, CSS modularization, bundle splitting.

## Pre-project run history

Greenfield / no-folder runs now persist under `SESSION_RUN_HISTORY_SCOPE` in `localStorage`. When a project opens, `mergeSessionRunHistoryIntoProject` moves session artifacts into the project store (deduped by `runId`).

Files: `agentRunHistory.ts`, `useAgentRunHistoryController.ts`

## Run search outcome badges

`RunHistorySearch` shows **Complete**, **Cancelled**, or **Failed** badges per result via `runHistoryOutcomeLabel`.

## CSS modules

Extracted from `App.css` → `src/styles/workflow-panels.css` (~2,879 lines):

- Plan apply, AI patch, New App wizard
- Preview panels
- Providers, Agent Dashboard, Pipeline, Dev Console

`App.css` is now ~4,047 lines (down from ~6,923).

## Bundle splitting

`vite.config.ts` manual chunks:

- `monaco` — monaco-editor + @monaco-editor/react
- `react-vendor` — react / react-dom / scheduler

## Real-provider E2E (Phase 10 cont.)

Gated smoke: `npm run test:e2e:real` / `test:e2e:real:dist` (see prior session).

## Verification

```bash
npm run typecheck
npm run test:unit
npm run test:electron
npm run test:e2e:dist
```

Optional (requires API key):

```bash
export BRYANTLABS_E2E_REAL_PROVIDER=1
export GROQ_API_KEY=...
npm run test:e2e:real:dist
```

## Remaining for 8.5+/10

- Further `App.css` split (workspace shell, editor, repository)
- `WorkspaceProvider` slimming (~3,915 lines)
- Rolldown lazy routes for heavy workflow views

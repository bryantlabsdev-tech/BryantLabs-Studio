# Phase 11 — Provider Slim + App.css Split

## Goals

1. Move E2E / provider smoke test hooks out of `WorkspaceProvider.tsx`.
2. Split remaining `App.css` into focused stylesheets.

## Changes

### Provider slimming

- **`src/app/workspace/useWorkspaceStudioTestHooks.ts`** (~210 lines)
  - `getPatchPipelineState`, `simulatePatchReadyForReview`, `simulatePreviewReady`
  - `getProviderSmokeState`, `checkConfiguredProviderHealth`, `runProviderSmokeTest`
  - Registers hooks via existing `useStudioTestHooks`
- **`WorkspaceProvider.tsx`**: ~3,915 → **~3,784** lines (−131)

### CSS split

| File | Lines | Content |
|------|-------|---------|
| `src/styles/workspace-shell.css` | ~743 | Title bar, workspace shell, dock, status bar |
| `src/styles/editor.css` | ~397 | File tree, editor, terminal, edit toolbar, diff |
| `src/styles/sidebar-panels.css` | ~2,817 | Center summary, verification, repository, session memory, search, plan tools |
| `src/app/App.css` | **~90** | App root + dock panel shell (residual) |

Imports added in `src/app/App.tsx` after `./App.css`.

## Metrics (post Phase 11)

| Asset | Before | After |
|-------|--------|-------|
| `WorkspaceProvider.tsx` | ~3,915 | ~3,784 |
| `App.css` | ~4,047 | ~90 |
| CSS modules total | 8 | **11** |

## Remaining opportunities

- `syncOrchestrationHosts` call object (~130 lines) → grouped `buildOrchestrationSyncInput` helper
- `useAgentRunWorkspaceContext` for `agentRunDeriveInput` / `projectFacts` / `currentAppContext`
- Lazy-load heavy workflow views (BuildView, GreenfieldPanel)
- Real-provider E2E in nightly CI (opt-in with API key)

## Verification

```bash
npm run typecheck
npm run test:unit
npm run test:electron
npm run test:e2e:dist
```

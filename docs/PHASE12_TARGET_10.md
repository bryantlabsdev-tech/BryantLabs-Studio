# Phase 12 — Target 10/10

Final maturity pass: provider decomposition, lazy workflow views, bundle optimization, nightly real-provider CI.

## Provider slimming

| Module | Purpose |
|--------|---------|
| `useAgentRunWorkspaceContext.ts` | Run history, derive input, project facts, app context |
| `buildOrchestrationSyncInput.ts` | Grouped bridge/refs/setters/actions for sync call |
| `useWorkspaceStudioTestHooks.ts` | E2E + provider smoke hooks (Phase 11) |

**`WorkspaceProvider.tsx`**: ~3,915 → **~3,743** lines (−172 from Phase 10 baseline)

## Lazy-loaded views

- `src/components/lazyViews.ts` — `React.lazy` for all workflow + center tabs
- `src/components/ViewSuspense.tsx` — shared loading fallback
- **AgentPanel**, **WorkflowPanel**, **CenterWorkbench**, **BottomDock** (console)

## Bundle impact

| Chunk | Size (gzip) | Notes |
|-------|-------------|-------|
| `index.js` | **~394 kB** (~102 kB gzip) | Down from ~1.2 MB pre–Phase 10 |
| `build-view.js` | ~634 kB (~181 kB gzip) | Lazy — loads with Agent panel |
| `monaco.js` | ~4.2 MB | Unchanged, on-demand editor |
| Per-view chunks | 3–25 kB each | Load when rail tool selected |

Vite manual chunks: `monaco`, `react-vendor`, `build-view`, `greenfield-view`, `execution-dashboard`.

## CI

- **`.github/workflows/nightly-real-provider.yml`** — daily 06:00 UTC + manual dispatch
- Runs `test:e2e:real` when `GROQ_API_KEY` or `ANTHROPIC_API_KEY` secret is set
- Skips gracefully when no key configured

## CSS (Phase 11 recap)

| File | Lines |
|------|-------|
| `App.css` | ~90 |
| `workspace-shell.css` | ~743 |
| `editor.css` | ~397 |
| `sidebar-panels.css` | ~2,817 |
| `workflow-panels.css` | ~2,879 |

## Scorecard (~10/10)

| Criterion | Status |
|-----------|--------|
| Architecture — provider decomposed | ✅ 22+ workspace hooks, sync extracted |
| Agent UX — Cursor-style streaming | ✅ Phases 1–8 |
| Test coverage | ✅ 486 unit + 106 electron + 9 E2E mock |
| Real-provider E2E | ✅ Local + nightly CI |
| CSS maintainability | ✅ 11 modules, App.css minimal |
| Bundle size | ✅ ~394 kB main chunk |
| Type safety | ✅ typecheck clean |

## Verification

```bash
npm run typecheck
npm run test:unit
npm run test:electron
npm run test:e2e:dist
npm run build   # inspect dist/assets/index-*.js size
```

Optional real provider:

```bash
export BRYANTLABS_E2E_REAL_PROVIDER=1
export GROQ_API_KEY=...
npm run test:e2e:real:dist
```

## Remaining (optional polish)

- Extract `useWorkspaceContextValue` (~450-line value `useMemo`)
- Split `workflow-panels.css` / `sidebar-panels.css` further
- Rolldown route-based splitting for greenfield wizard steps

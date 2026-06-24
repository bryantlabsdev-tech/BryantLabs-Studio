# Phase 5 — Level Up

Targets the top blockers from the post–Phase 4 audit: E2E reliability, historical run replay, and stronger inline diffs.

## 1. E2E dist build fixed

`e2e/global-setup.ts` now builds with `VITE_BRYANTLABS_E2E=1` so `__studioTestHooks` register in production bundles.

`waitForPostPatchProgress` polls test hooks and `run-review-actions` UI — not only `console.log` markers.

Follow-up review spec is isolated with a fresh app + fixture per describe.

## 2. Historical run replay

| Surface | Behavior when a run is selected in chat |
|---------|----------------------------------------|
| Summary | Replays artifact snapshot via `useEffectiveGreenfieldRun` |
| Logs | Same — log entries frozen on artifact or synthetic from steps |
| Generated Files | Shows `filesModified` for historical runs |
| Execution | Already followed selected artifact (Phase 2) |

New modules:
- `artifactObservability.ts` — `greenfieldSnapshotFromArtifact()`
- `useEffectiveGreenfieldRun.ts` — workspace hook
- `HistoricalRunBanner.tsx` — “Viewing Run #N” + Back to live

Artifacts now store `logEntries` at freeze time.

## 3. Inline diff upgrade

`RunFileDiff` captures `before` / `after` at freeze. `RunConversationBlock` uses full `DiffRowsView` when available.

## Verification

```bash
npm run typecheck      # pass
npm run test:unit      # 478 pass
npm run test:electron  # 103 pass
npm run test:e2e:dist  # 8 pass (after Phase 5)
```

## Remaining

- `WorkspaceProvider` monolith (~4.3k lines)
- Follow-up mock runs may still fail on slow CI — investigate mock apply pipeline
- Visual token migration (`App.css` ~10k lines)

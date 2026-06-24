# Phase 6 — Next Level

Closes the historical-run loop: selecting a past run now replays diffs in the workbench, not only in chat.

## Historical Diff tab

When `selectedAgentRunId` is set and the frozen artifact has `fileDiffs` or `filesModified`:

- **More → Diff** shows `ArtifactDiffView`
- File list with +/− stats
- Full `DiffRowsView` when `before`/`after` were captured at freeze
- Mini preview fallback for older artifacts

Live review diffs still take priority (`pendingPatch`, `planApplySession`).

## Run search → diff workflow

Selecting a run from **Search runs** scrolls to the chat block and opens the **Diff** tab when the artifact has file changes.

## Workspace hygiene

- `useSelectedAgentArtifact` — single source for selected frozen run
- `useEffectiveGreenfieldRun` refactored to use it
- `useStudioTestHooks` — E2E hook registration extracted from `WorkspaceProvider`

## Modules

| File | Role |
|------|------|
| `artifactDiffView.ts` | Diffable file list from artifact |
| `ArtifactDiffView.tsx` | Workbench diff panel for historical runs |
| `useSelectedAgentArtifact.ts` | Shared selected artifact hook |
| `useStudioTestHooks.ts` | Test hook registration |

## Verification

```bash
npm run typecheck
npm run test:unit
npm run test:electron
npm run test:e2e:dist
```

## Remaining for 7+/10

- Split `WorkspaceProvider` orchestration host (still ~4.2k lines)
- `App.css` → tokenized modules
- Mock follow-up pipeline reliability on slow machines
- Auto-sync Diff tab file selection with chat “View changes” expand state

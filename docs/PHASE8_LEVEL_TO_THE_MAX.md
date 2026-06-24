# Phase 8 — Level to the Max

Closes the live-run diff gap and continues slimming `WorkspaceProvider`.

## Live run diff workbench

While a run is active (including review), **More → Diff** shows `LiveRunDiffView`:

- Full multi-file diff from `planApplySession` when proposals exist
- File list + stats from `extractRunFileDiffs` during the run
- Syncs with chat via `selectedArtifactDiffPath`
- Transitions to frozen `ArtifactDiffView` when the run completes and the artifact is saved

Chat run blocks receive `liveFileDiffs` so inline and workbench diffs match during the run.

## Shared diff workbench

`RunDiffWorkbenchView` — shared file list + `DiffRowsView` / preview panel used by:

- `ArtifactDiffView` (historical)
- `LiveRunDiffView` (active run)

## Workspace extractions

| Hook | Role |
|------|------|
| `useAgentChatRecording` | User/studio/activity/greenfield chat recording (~220 lines out of provider) |
| `useLiveRunDiffs` | Live diff list for workbench |

`WorkspaceProvider` reduced by ~250 lines; chat recording logic is testable in isolation.

## Helpers

| Function | Role |
|----------|------|
| `diffableFilesFromRunDiffs` | Map live `RunFileDiff[]` to workbench file views |
| `resolveSelectedDiffPath` | Chat ↔ workbench file selection sync |

## Verification

```bash
npm run typecheck
npm run test:unit
npm run test:electron
npm run test:e2e:dist
```

## Remaining for 8+/10

- Orchestration host factory extraction from `WorkspaceProvider`
- `App.css` design-token module split
- E2E spec for live-run → diff tab navigation

# Phase 7 — Next Level Up

Syncs chat and workbench diff navigation, and begins slimming `WorkspaceProvider`.

## Chat ↔ Diff tab sync

Clicking **View changes**, a modified file name, or **Build passed → View changes** in a run block:

1. Selects the run (`focusArtifactDiff({ runId, path })`)
2. Opens **More → Diff**
3. Highlights the chosen file in `ArtifactDiffView`

Run search with diff content follows the same path (first changed file).

`ArtifactDiffView` reads `selectedArtifactDiffPath` from workspace context so chat and workbench stay aligned.

## Workspace extractions

| Hook | Role |
|------|------|
| `useFollowUpChatState` | `followUpChat`, pending merge, `agentChat` — wired into provider |
| `useAgentRunHistoryController` | Adds `selectedArtifactDiffPath`, `focusArtifactDiff` |

Removed duplicate chat merge `useEffect` from `WorkspaceProvider`.

## Styles

Agent conversation + artifact diff CSS moved from `polish.css` → `agent-conversation.css`.

## Modules

| File | Change |
|------|--------|
| `RunConversationBlock.tsx` | `onFocusDiffFile`; file links open workbench diff |
| `FollowUpChatHistory.tsx` | `onFocusRunDiff` per run |
| `BuildView.tsx` | `handleFocusRunDiff`, search scroll sets diff path |
| `ArtifactDiffView.tsx` | Syncs with `selectedArtifactDiffPath` |

## Verification

```bash
npm run typecheck
npm run test:unit
npm run test:electron
npm run test:e2e:dist
```

## Remaining for 7+/10

- Split `WorkspaceProvider` orchestration host (~4.2k lines)
- `App.css` token migration
- Live-run diff focus before artifact freeze (no `fileDiffs` yet)

# Phase 4 — Conversation-First Agent Architecture

Workflow-only phase: no orchestration refactors, no shell redesign. Chat becomes the primary workspace; each agent run is an immutable conversation artifact.

## Conversation model

```
User message (prompt)
  └── RunConversationBlock (Agent)
        ├── Headline (Created app / Modified files)
        ├── Modified files (expandable, inline)
        ├── View changes (mini diff, expandable)
        ├── Review actions (live run, awaiting review)
        ├── Failure card | Success card
        └── Footer actions (Cancel, Retry, Console)
```

Frozen runs are stored in `AgentRunArtifact` (`agentRunHistory.ts`) and never mutate. Live runs render the same block shape from `useAgentRunViewModel` until terminal freeze in `useAgentRunHistoryController`.

## New / changed modules

| Module | Role |
|--------|------|
| `RunConversationBlock.tsx` | Chat-native run artifact UI |
| `runConversation.ts` | Headline, success/failure narrative derivation |
| `runFileDiffs.ts` | Capture per-file diff stats + mini preview at freeze |
| `searchAgentRuns.ts` | Prompt/file search over frozen history |
| `RunHistorySearch.tsx` | Search input in chat thread header |
| `ProjectMemoryPanel.tsx` | “What agent knows” — stack, key files, recent prompts |

## Artifact extension

`AgentRunArtifact` now includes `fileDiffs: RunFileDiff[]`, populated in `buildAgentRunArtifact` from `planApplySession` (basis + proposal) or `AgentRunCardViewModel.patchImpact` fallback.

## Review in chat

When `awaitingReview`, `BuildView` passes `runReview` into `FollowUpChatHistory`. Approve / Reject / Retry live inside the active `RunConversationBlock`. The compact `FollowUpReviewPanel` was removed from the composer overlay.

## Chat-centered secondary tools

Summary, Generated Files, and Logs remain in **Center workbench → More ▾** (Phase 3) and are also linked from **Build → More** advanced drawer so users rarely leave chat.

## Run search

`RunHistorySearch` in the thread header filters `agentRunHistory` by prompt or modified file path. Selecting a result highlights and scrolls to the matching `data-run-id` block.

## Studio message deduplication

Success/failure studio bubbles are suppressed when a frozen run artifact exists for the preceding user message — the run block carries the outcome.

## Remaining gaps vs Cursor

| Cursor | BryantLabs Studio (after Phase 4) |
|--------|-----------------------------------|
| Full inline diff with syntax highlighting in thread | Mini diff (+/− lines, capped preview); full diff still in Diff tab |
| @-mentions, file attachments in composer | Text prompt only |
| Multi-agent / subagent threads | Single agent run per user message |
| Edit run instructions mid-flight | Cancel + new prompt |
| Semantic search across run content | Keyword search on prompt + file paths |
| Dashboard follows selected historical run in Summary/Logs | Execution dashboard syncs; Summary/Logs tabs still use live run state when a historical run is selected |

## Screenshots (manual)

Capture after `npm run electron:dev`:

1. **Sudoku run** — user bubble + Agent block with Modified files, Build passed, Preview ready
2. **Dark mode run** — second separator, inline file list + View changes expanded
3. **Review state** — Approve / Reject / Retry inside live run block
4. **Search** — “dark mode” → Run #N dropdown
5. **Project memory** — stack + recent changes panel above chat

## Verification

```bash
npm run typecheck
npm run test:unit
npm run test:electron
```

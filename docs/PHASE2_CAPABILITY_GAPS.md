# Phase 2 — Remaining Capability Gaps

| Reference capability | BryantLabs status | Gap |
|-----------------|-------------------|-----|
| Per-prompt run blocks in thread | ✅ Implemented | — |
| Immutable completed runs | ✅ Frozen artifacts | — |
| Live file list with checkmarks | ✅ Collapsed card + stream | Expanded tab still has legacy “updated” wording |
| Real-time thought stream | ✅ From logs/timeline only | No MCP/tool-call granularity yet |
| Failure what/why/fix | ✅ `RunBlockFailure` + diagnostics | Cancelled runs still show as failed in card |
| Run history sidebar | ✅ `AgentRunHistoryPanel` | Not in center panel tabs |
| Click run → all panels sync | ✅ Dashboard + selection | Summary/Logs tabs still use live `greenfieldRun` only |
| Pre-project / greenfield-only runs | ⚠ Partial | History requires `project.path` |
| Diff per run | ❌ | No per-run diff view |
| Branch/fork from run | ❌ | Out of scope |
| Composer @-mentions / attachments | ❌ | Out of scope |
| Subagent/tool call tree | ❌ | Out of scope |

## Recommended Phase 3 follow-ups

1. Wire Summary/Logs center tabs to `selectedAgentRunId` artifact snapshot.
2. Add `cancelled` to `AgentRunOverallStatus` for accurate history badges.
3. Persist run history for pre-project greenfield sessions.
4. Capture product screenshots after manual QA pass (`npm run electron:dev`).

## Expected UX (manual verification)

```
You: Build Sudoku

Run #1
✓ Planning changes
✓ Editing files
✓ src/App.tsx
✓ Build passed
────────────────

You: Add dark mode

Run #2  [selected → Execution tab syncs]
…
```

Screenshots: capture from running Electron app — Build panel thread + Execution dashboard with a selected historical run.

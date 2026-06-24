# Phase 1 — Architecture Findings

Audit date: 2026-06-09. Stability-only pass; no feature or UI workflow changes.

## Run state ownership (after Phase 1)

```
greenfieldRun (WorkspaceProvider)
        │
        ▼
deriveAgentRunState()  ← canonical pure function
        │
        ├── runStatus (unified: progress/duration/active from card)
        ├── agentRunCard
        ├── dashboard
        └── terminal
        │
        ▼
useAgentRunViewModel()  ← single React hook
        │
        ├── BuildView → AgentRunCard
        └── CenterWorkbench → ExecutionDashboard
```

Summary / Logs use `buildStudioRunSummary()` which shares `getRunDurationMs` and `resolveRunTerminalState` from `runTerminal.ts`.

## Component dependencies

| Module | Depends on | Owns |
|--------|------------|------|
| `WorkspaceProvider` | orchestration, greenfield, build, plan apply | `greenfieldRun`, build sessions, chat |
| `deriveAgentRunState` | `agentRunStatus`, `agentRunCard`, `executionDashboard`, `runTerminal` | unified VM (no React) |
| `useAgentRunViewModel` | workspace + `deriveAgentRunState` | tick for live duration only |
| `AgentRunCard` | card VM props only | presentation |
| `ExecutionDashboard` | dashboard VM props only | presentation |
| `RunTimeline` / `runTerminal` | snapshot fields | terminal outcome, frozen duration |

## Circular dependencies

No new cycles introduced. Existing soft coupling:

- `agentRunStatus` → `followUpRun` → `runTerminal`
- `agentRunCard` → `agentRunStatus` output + `runTerminal`
- `executionDashboard` → `agentRunCard` VM (one-way)

`WorkspaceProvider` still imports many orchestration modules; splitting it remains future work.

## Duplicate state ownership (resolved vs remaining)

| Issue | Status |
|-------|--------|
| BuildView + hook both derived run state | **Fixed** — BuildView uses `useAgentRunViewModel` |
| Multiple progress percent sources | **Fixed** — UI uses `agentRunCard.progressPercent`; hook syncs `runStatus` |
| Duration tick after terminal | **Fixed** — tick stops when `isRunTerminal` or card not running |
| Summary vs card status | **Aligned** — both use `runTerminal` + stored `durationMs` |
| Cancelled shown as failed in card | **Known** — `AgentRunOverallStatus` has no `cancelled`; terminal tracks it |

## Remaining technical debt

1. **`WorkspaceProvider` (~4k lines)** — god object; orchestration should stay out of React.
2. **`AgentRunOverallStatus`** — no explicit `cancelled`; maps to `failed` in UI.
3. **`PROGRESS_BY_PHASE`** — legacy internal map; greenfield path still computes interim percent before card merge.
4. **Zero component tests** — only core derivation unit tests.
5. **`App.css` size / dual tokens** — out of Phase 1 scope.

## Risk assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Hook/options mismatch between BuildView and dashboard | Low | Same `deriveAgentRunState`; BuildView passes `agentIntent` + `greenfieldMode` |
| Quarantined files imported elsewhere | Low | Grep verified zero imports before move |
| Summary runResult vs card on edge cancel | Medium | Terminal detects cancel; summary uses terminal; card shows failed |
| Provider type regressions | Low | Typecheck + CI gate |
| Timer drift on slow machines | Low | Stored `endedAt`/`durationMs` preferred over live tick |

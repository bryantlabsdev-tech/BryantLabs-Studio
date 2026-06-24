# Phase 2 — Run Architecture

## Overview

Each user prompt creates an immutable **AgentRunArtifact** when the run reaches a terminal state. Live runs still flow through `deriveAgentRunState`; completed runs are frozen and never updated.

```
User prompt
    │
    ▼
recordAgentUserMessage()
    ├── runId on chat message
    └── beginAgentRun(runId, prompt, messageId)
    │
    ▼
Live: deriveAgentRunState() ──► AgentRunCard (streaming)
    │
    ▼ (terminal transition)
buildAgentRunArtifact() ──► localStorage per project
    │
    ▼
FollowUpChatHistory renders frozen Run #N blocks
    │
    ▼
selectAgentRun(id) ──► Execution Dashboard (historical VM)
```

## Core types

### `AgentRunArtifact` (`agentRunHistory.ts`)

| Field | Purpose |
|-------|---------|
| `runId` | Stable key (matches chat message `runId`) |
| `runNumber` | Display index (Run #1, #2, …) |
| `prompt` | User prompt for this run |
| `card` | Frozen `AgentRunCardViewModel` |
| `dashboard` | Frozen `ExecutionDashboardViewModel` |
| `outcome` | `success` \| `failed` \| `cancelled` |
| `filesModified` | Quick history list |
| `durationMs`, `provider`, `model` | History metadata |

Persistence: `localStorage` key `bryantlabs.agentRunHistory.{projectPath}` (max 50 runs).

### `AgentRunThoughtEvent` (`agentRunThoughtStream.ts`)

Short labels derived from **real** sources only:

- Timeline stages (`plan_start`, `typescript_start`, …)
- Log entries (`write`, `build`, `typescript`, …)
- Scan framework detection
- File activity (written paths)

No synthetic planner prose in the thought stream.

## UI surfaces

| Surface | Data source |
|---------|-------------|
| Chat run blocks | Frozen artifacts + live card for `activeAgentRunId` |
| Run history panel | `agentRunHistory` list |
| Execution dashboard | `selectedAgentRunId` → artifact VM; else live |
| Agent card collapsed | Steps, inline files, thoughts, failure narrative |

## Selection rules

- **Chat** always shows live state for the active run (`selectedAgentRunId: null` in BuildView hook).
- **Execution dashboard** follows `selectedAgentRunId` from workspace (history panel or clicking a frozen run block).
- **Live** button clears selection and returns dashboard to the current run.

## Files

| File | Role |
|------|------|
| `agentRunHistory.ts` | Persistence + lookup |
| `buildAgentRunArtifact.ts` | Freeze helper |
| `agentRunThoughtStream.ts` | Real-event thought derivation |
| `useAgentRunHistoryController.ts` | Terminal watcher + selection state |
| `useAgentRunViewModel.ts` | Live vs selected artifact routing |
| `FollowUpChatHistory.tsx` | Per-run conversation blocks |
| `AgentRunHistoryPanel.tsx` | Cursor-style run list |
| `AgentRunCard.tsx` | Inline files, thoughts, failure narrative |

# Phase 1 — Dead Code Report

Audit date: 2026-06-09. Orphan components had **zero imports** anywhere under `src/`.

## Removed (quarantined)

Moved to `src/components/_deprecated/` — not referenced by the app; safe to delete after one release cycle.

| File | Former location | Reason |
|------|-----------------|--------|
| `FollowUpTimeline.tsx` | `views/` | Superseded by `AgentRunCard` step rail |
| `FollowUpStatusBar.tsx` | `views/` | Superseded by `AgentRunCard` / Execution Dashboard |
| `FollowUpActivityStream.tsx` | `views/` | Activity now in card + dashboard |
| `FollowUpSuccessCard.tsx` | `views/` | Success summary in `AgentRunCard` tabs |
| `GreenfieldLiveStatusCard.tsx` | `views/` | Replaced by agent run surfaces |
| `Sidebar.tsx` | `components/` | Legacy layout; app uses `WorkflowPanel` |
| `RightPanel.tsx` | `components/` | Legacy layout |
| `UtilityPanel.tsx` | `components/` | Legacy layout |

## Deprecated (still referenced internally, not for UI)

| Symbol | Location | Notes |
|--------|----------|-------|
| `PROGRESS_BY_PHASE` | `followUpRun.ts` | Internal phase estimate only; UI must use `agentRunCard.progressPercent` |
| `deriveFollowUpRunStatus().progressPercent` | `followUpRun.ts` | Overwritten by `deriveAgentRunState` for UI consumers |
| `deriveGreenfieldRunProgress` step percent | `greenfieldRunProgress.ts` | Used only while greenfield panel is active; unified via card |

## Still referenced (active)

| Surface | State source |
|---------|----------------|
| `AgentRunCard` | `useAgentRunViewModel` → `deriveAgentRunState` |
| `ExecutionDashboard` | same |
| `BuildView` / chat | same |
| `GreenfieldSummaryView` | `buildStudioRunSummary` + `getRunDurationMs` |
| `GreenfieldLogsView` | same summary helper |
| `FollowUpChatHistory` | receives `agentRunCard` from BuildView |
| `FollowUpErrorBanner` | BuildView error surface |
| `FollowUpReviewPanel` | BuildView review flow |

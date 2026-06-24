# Deprecated components

These files were quarantined during Phase 1 (Trust & Stability) because nothing in `src/` imported them.

Do not re-wire without a deliberate product decision. Safe to delete after one release cycle if still unused.

See `docs/PHASE1_DEAD_CODE_REPORT.md`.

## Phase 10 (2026-06-09)

| File | Former location | Reason |
|------|-----------------|--------|
| `AgentRunCard.tsx` | `views/` | Superseded by `RunConversationBlock` |
| `AgentRunHistoryPanel.tsx` | `views/` | Superseded by `RunHistorySearch` in BuildView |
| `FollowUpReviewPanel.tsx` | `views/` | Superseded by `RunReviewActions` in run block |

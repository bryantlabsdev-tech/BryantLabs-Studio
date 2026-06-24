# Phase 9 — Level Up

Orchestration ref hygiene, workbench CSS module, and E2E for chat → diff navigation.

## Orchestration host refs

`useOrchestrationHostRefs` centralizes all 13 orchestration host refs previously declared inline in `WorkspaceProvider`. Host assignment logic remains in the provider for now (next step: `syncOrchestrationHosts`).

## E2E: chat → live diff

`simulatePatchReadyForReview` now:

1. Creates a user chat message with `runId`
2. Calls `beginAgentRun` so `activeAgentRunId` is set
3. Seeds `planApplySession` in `waiting_for_review`

New spec **view changes opens live diff in workbench** clicks **View changes** in the run block and asserts `live-run-diff-view` with `src/App.tsx`.

## Styles

Workbench shell CSS extracted from `App.css` → `src/styles/workbench.css`:

- Center panel layout
- Tab bar + overflow menu
- Diff panel shell (`.center-diff`)

## Verification

```bash
npm run typecheck
npm run test:unit
npm run test:electron
npm run test:e2e:dist
```

## Remaining for 8+/10

- `syncOrchestrationHosts.ts` — move ~360-line host assignment block
- `App.css` build-view / follow-up-chat module split
- Token alias cleanup (`--surface-raised`, `--border-subtle` → tokens.css)

# BryantLabs Studio — Long Prompt Submission Test Guide

## What was broken

1. **Silent greenfield auto-start** — `autoStartedRef` was set before `generate()` ran. If generation returned early (missing provider, stale run lock, empty folder), auto-start never retried and the UI showed no activity.
2. **No immediate run feedback** — Submitting a greenfield prompt only flipped internal mode flags. Logs/timeline often stayed empty until IPC returned, so long prompts looked idle for 30–120+ seconds.
3. **Feasibility gate on long edit prompts** — SaaS-style prompts in an existing project routed to follow-up edit and stopped at the feasibility confirmation gate with no visible run card.
4. **Stale run locks** — A previous `runResult: "running"` snapshot blocked new submissions with a small muted message and no recovery affordance.
5. **No prompt length UX** — No character count, no max-length guard, no warning before provider calls.

## What was fixed

| Area | Fix |
|------|-----|
| Auto-start | Only mark auto-start complete when `generate()` actually begins; surface errors via `onSubmissionError` |
| Submission UX | Immediate activity message, greenfield log entry, timeline panel, lifecycle phase badge |
| Long edit prompts | Prompts ≥ 400 chars auto-proceed past feasibility gate with a visible activity note |
| Recovery | **Reset agent state** + **Cancel run** in timeline; clears stale locks and in-flight work |
| Validation | 20,000 char max, live counter, warning at 15,000+ chars |
| Watchdog | After 15s with no events: *"Run started but no agent events have been received yet."* |
| Debug | `[agent:submit]` console logs with prompt length, run id, repo path, provider, route, phase |

## Manual test flows

### Prerequisites

- BryantLabs Studio desktop app running (`npm run electron:dev`)
- Mock provider **or** configured API key in Settings
- DevTools open (View → Toggle Developer Tools) to watch `[agent:submit]` logs

### 1. Short prompt (greenfield)

**Prompt**

```text
Create a simple counter app.
```

**Steps**

1. Open an **empty project folder** (or use Agent with empty folder open).
2. Paste prompt into Agent composer.
3. Press Send.

**Expected**

- Agent status moves from **Idle → Queued → Starting → Running**
- Timeline shows: *Prompt submitted*, *Run created*, *Repo selected*, *Generation started*
- Run conversation card appears with stepper progress
- Logs tab receives greenfield entries within a few seconds
- Files generate, npm install runs, preview eventually loads or shows a clear setup error

### 2. Medium prompt (greenfield)

**Prompt**

```text
Create a React TypeScript app with a dashboard, sidebar, cards, and a settings page.
```

**Expected**

- Same visible lifecycle as short prompt
- Character count shows in composer footer (~90 chars)
- No silent idle state; provider call may take 1–3 minutes but timeline/logs update

### 3. Long prompt (2,000+ chars SaaS spec)

**Prompt**

Use a 2,000+ character SaaS description (auth, billing, dashboard, settings, analytics, etc.).

**Expected**

- Prompt accepted (under 20,000 chars)
- Warning appears if length ≥ 15,000 chars
- For **empty folder / greenfield route**: run starts immediately with timeline activity
- For **existing project / edit route**: auto-proceeds past feasibility gate (≥ 400 chars) with activity message — no invisible stall
- If provider is slow, 15s watchdog message may appear, then clears once generation logs arrive
- On failure: red error banner with real message (not blank UI)

### 4. Stale lock recovery

**Steps**

1. Start a run, then force-quit mid-generation **or** leave a stuck `running` snapshot.
2. Submit a new prompt.

**Expected**

- Block message explains active/stale run
- Click **Reset agent state**
- Submit again — run starts with fresh timeline

### 5. Over-limit prompt

**Prompt**

Paste 20,001+ characters.

**Expected**

- Send blocked
- Error: *Prompt is too long… Maximum is 20,000 characters.*
- Nothing sent to provider

## Logs you should see

### Browser/Electron console

```text
[agent:submit] submit.accepted len=2341 run=run-… repo=/path/to/project route=greenfield phase=queued
[agent:submit] greenfield.generate.start len=2341 repo=/path/to/project provider=… model=… route=greenfield phase=starting
[agent:route] mode=create_new_app reason=empty_folder projectPath=…
[run:run_id] run_id=run-… elapsed_ms=… stage_duration_ms=…
```

### Agent timeline panel (composer)

- Prompt submitted — `N characters`
- Run created — run id
- Repo selected — folder path
- Generation started / Provider responded / npm install / etc.

### Greenfield run log (Logs tab)

- `Prompt submitted — N chars`
- `Generation started`
- `Provider response received` or explicit failure line

## Automated tests added

- `src/core/agent/promptSubmission.test.ts` — length validation
- `src/core/agent/agentRunLifecycle.test.ts` — lifecycle + timeline event building

Run:

```bash
npm run typecheck
npm run test:unit
npm run test:electron
npm run test:e2e:dist
```

## Known remaining limits

- Very long prompts increase provider latency and token usage; Studio surfaces activity but cannot speed up the model.
- Greenfield still generates the standard 7-file Vite scaffold — long prompts influence `App.tsx` content, not project topology.
- True 10/10 observability would add dedicated E2E tests that assert timeline DOM updates for 2,000+ char submissions.

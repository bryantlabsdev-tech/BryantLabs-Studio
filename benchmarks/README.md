# BryantLabs Studio Benchmark Suite

Objective pass/fail benchmarks for tracking Studio quality over time.

## Categories

| Category | What it measures |
|----------|------------------|
| **App Creation** | Greenfield parse, validation, reliability pipeline, skeleton blocking |
| **Feature Addition** | Agent routing, planner file selection, create-file validation |
| **Bug Fixing** | Proposal quality gates for real fixes vs no-ops |
| **Refactoring** | Export preservation, helper extraction, import validation |
| **Requirement Satisfaction** | Requirement checklist scoring, outcome downgrade, post-apply advisory |
| **Edit Pipeline** | Follow-up quick repair, routing, UI-audit setup mapping, @-mentions |

## Run benchmarks

```bash
# Full suite (fast, deterministic, no Electron)
npm run bench

# Single category
npm run bench -- --suite app_creation
npm run bench -- --suite requirement_satisfaction

# JSON output only (for CI parsing)
npm run bench:json
```

## Greenfield stress tests (10 hard SaaS prompts)

Repeatable stress harness for difficult multi-page app generation. Dry-run validates routing/manifest (CI-safe). Live mode generates, verifies TypeScript/build, applies deterministic repairs, and writes a markdown report.

```bash
# Dry run — all 10 prompts, manifest/routing only (no API key)
npm run greenfield:stress

# Single prompt dry run
npm run greenfield:stress -- --prompt fleetops-pro

# Live — full generation + verify + deterministic repair (requires Gemini key)
# Writes to ~/Desktop/studiotest/stress/live/ (does not touch frozen replay corpus)
npm run greenfield:stress:live

# Fast live validation — 5 curated prompts, target 4/5 (~half the runtime)
npm run greenfield:stress:live:5

# Lock live output into frozen replay corpus (run after live to refresh repair fixtures)
npm run greenfield:stress:lock-replay
npm run greenfield:stress:lock-replay -- --from-legacy   # one-time migration from flat stress/

# Repair-only replay on frozen corpus (independent of live score)
npm run greenfield:stress:replay
npm run greenfield:stress:replay:legacy

# Refresh committed CI fixtures from Desktop corpus (after lock-replay)
npm run greenfield:stress:sync-fixtures

# Live single prompt
npm run greenfield:stress:live -- --prompt fleetops-pro
```

**Corpus layout**

| Path | Purpose |
|------|---------|
| `~/Desktop/studiotest/stress/live/` | Live generation output (overwritten each run) |
| `~/Desktop/studiotest/stress/replay-frozen/` | Locked snapshots for repair replay (5 fast-suite ids) |
| `benchmarks/fixtures/stress/` | Committed CI replay snapshots (sync with `greenfield:stress:sync-fixtures`) |

Live reports include a **Frozen replay corpus** section (independent health check). Replay target: **4/5** on frozen snapshots locally; **5/5 + 10/10** in CI (`BRYANTLABS_STRESS_REPLAY_STRICT=1`).

Reports: `benchmarks/results/stress-latest.md`, `stress-fast-latest.md`, `repair-replay-latest.md`

Unit tests: `npm run bench:unit` (includes `benchmarks/stress/stress.test.ts`)

## Brownfield edit stress (10 follow-up prompts)

Dry-run validates routing (`build_loop`), submit action, and deterministic planner file selection on brownfield fixtures — CI-safe, no API key.

```bash
npm run edit:stress
npm run edit:stress -- --prompt sudoku-gameplay
npm run edit:stress -- --json
```

Reports: `benchmarks/results/edit-stress-latest.md`

### Live mock patch validation (`edit:stress:live`)

Extends dry-run with `validateProposalQuality`, hunk splitting, and partial-merge checks on fixture file content (reads `e2e/fixtures/sudoku-vite` when available).

```bash
npm run edit:stress:live
npm run edit:stress:live -- --prompt sudoku-gameplay
npm run edit:stress:live -- --json
```

Reports: `benchmarks/results/edit-stress-live-latest.md`

### Mock provider pipeline (`edit:stress:provider`)

Full headless path: deterministic plan → `executeApplyPlanOrchestration` (mock `proposeApplyPlanPatches`) → auto-apply → optional `npm run typecheck` + build.

```bash
npm run edit:stress:provider:fast    # 4 sudoku prompts (CI default)
npm run edit:stress:provider         # all 10 prompts
npm run edit:stress:provider -- --skip-verify
npm run edit:stress:provider -- --prompt sudoku-gameplay
```

Reports: `benchmarks/results/edit-stress-provider-latest.md`

## Scorecard output

Each run writes:

- `benchmarks/results/latest.json` — machine-readable scorecard
- `benchmarks/results/latest.md` — human-readable report
- `benchmarks/results/scorecard-<timestamp>.json` — archived run
- `benchmarks/results/history.jsonl` — append-only history for trend comparison

### Scorecard schema

```json
{
  "version": 1,
  "suite": "all",
  "overallScore": 92,
  "overallPass": true,
  "categories": [
    { "category": "app_creation", "score": 100, "passRate": 1, "casesPassed": 5, "casesTotal": 5 }
  ],
  "cases": [
    { "id": "create.parse_complete", "passed": true, "checks": [...] }
  ]
}
```

**Overall score** = weighted average of category pass rates (equal weight across six categories).

**Overall pass** = every case in the suite passed.

Runs also include a **Trend vs Previous Run** section when history exists.

## CI integration

Exit code `0` when all cases pass, `1` otherwise. Parse `latest.json` for dashboards:

```bash
npm run bench:json | jq '.overallScore, .overallPass'
```

**Repair replay regression** (`.github/workflows/repair-replay.yml`): runs frozen (5/5) and legacy (10/10) repair replay on committed fixtures under `benchmarks/fixtures/stress/`. Refresh fixtures after locking new snapshots:

```bash
npm run greenfield:stress:lock-replay
npm run greenfield:stress:sync-fixtures
```

## Agent acceptance pilot (manual, no providers)

Five-task scorecard harness for evaluating Studio and an independently selected reference tool against the same acceptance criteria. It creates temporary project fixtures, prints a shared prompt, and evaluates the resulting tree. It does not launch either tool or call paid providers.

```bash
npm run bench:acceptance -- help
```

Operator steps: `benchmarks/agentAcceptancePilot/README.md`

## Adding cases

1. Add a `BenchmarkCaseDefinition` in the relevant `benchmarks/cases/*.ts` file.
2. Implement the runner branch in the same file.
3. Run `npm run bench` and verify the scorecard.

Cases should use deterministic inputs (mock provider responses, fixture diffs) so results are reproducible without API keys.

## Future tiers

- **Tier 2:** Electron mock-provider E2E benchmarks (`BRYANTLABS_MOCK_PROVIDER=1`)
- **Tier 3:** Real-provider greenfield bench (see `scripts/greenfield-calculator-bench.mjs`)

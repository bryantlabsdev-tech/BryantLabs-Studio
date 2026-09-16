# Cursor parity pilot harness

Temporary-repository fixtures, shared prompts, and machine-checkable scorecards for a five-task BryantLabs Studio vs Cursor comparison. This harness does not launch either product, read provider keys, or call a model.

Trials live under `os.tmpdir()`. Do not open or modify the product git clone during a trial.

Canonical prompts are byte-identical for Studio and Cursor (`prompt --task <id>` has no product parameter).

## Tasks

| ID | Task | Shared fixture + overlay |
| --- | --- | --- |
| G1 | Greenfield calculator | Calculator scaffold, `g1` placeholder `App.tsx` |
| R1 | History refactor | Calculator + `r1` History overlay |
| D1 | Planted TypeScript error | Calculator + `d1` `math.ts` overlay |
| U1 | Partial approval | Calculator only |
| F1 | Symlink escape | Calculator; `src` linked outside at trial create |

## Commands

```bash
npm run bench:pilot -- create-trial --task G1 --product studio
npm run bench:pilot -- prompt --task G1
npm run bench:pilot -- evaluate --trial "$TRIAL"
npm run bench:pilot -- record-scorecard --trial "$TRIAL" --model MODEL --wall-time-ms 120000 --run-ref "$REF"
npm run bench:pilot -- validate-scorecard --entry "$TRIAL/scorecard.json"
npm run bench:pilot -- summarize --dir "$RESULTS_DIR"
npm run bench:pilot -- cleanup --trial "$TRIAL"
```

Typecheck and build use this checkout's `node_modules` (linked into the trial), not a globally installed `tsc` or `vite`. Omit token/call flags when unknown; they are stored as `unavailable`, never as `0`.

## Operator procedure

Create a fresh trial per product per task. Open only `openPath`. Paste the exact prompt. For U1, accept History and reject the timer in both products. For F1, pass means `SENTINEL.txt` and the outside snapshot stay unchanged. Cleanup deletes only directories listed on that trial's sealed manifest, without following replaced symlinks.

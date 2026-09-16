# Replacement record: legacy E2E fixtures (2026-09-16)

This is an engineering provenance record, not a legal authorship, ownership, license-grant, or clearance claim. It is not legal advice. It does **not** mark `PROVENANCE.md` **Verified**. Inventory `evidence_reference` remains `none`.

This record covers **only** the two E2E fixture app trees listed below. Stress snapshot trees under `benchmarks/fixtures/stress/` and replay-frozen edit-stress corpora were not changed.

## Operator and tools

- Date: 2026-09-16
- Human operator / requester: Ferris Bryant
- AI-assisted implementation tool: Cursor
- Model: Grok 4.6 (stated identity of this Cursor agent session; not read from Cursor `settings.json`)
- App-generation provider/model: none (no Gemini, Anthropic, OpenAI, or other live provider API calls)
- Method: Independently authored Vite/React/TypeScript fixture sources from in-repo consumer contracts, with Cursor assistance. Lockfiles generated with `npm install --package-lock-only` from the declared `package.json` dependencies in isolated directories. Not sole human authorship.

## Specifications used (inputs)

- `src/core/greenfield/types.ts` (`GREENFIELD_FILE_PATHS`: `package.json`, `index.html`, `src/main.tsx`, `tsconfig.json`, `vite.config.ts`, `src/index.css`, `src/App.tsx`)
- `src/core/greenfield/fileValidation.ts` (`dev`/`build`/`typecheck`/`preview` scripts, `#root`, `/src/main.tsx`, App import from `./App`, `createRoot`/`render`)
- `e2e/helpers/studio.ts` (`emptyProjectFixturePath`, `sudokuFixturePath`, `resetEmptyProjectFixture` preserves `.gitkeep` / `.bryantlabs`)
- `e2e/reopen-then-edit-proposal-zero-validated.mock.spec.ts` (copies `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/index.css`; does not copy `src/vite-env.d.ts`. `src/main.tsx` therefore includes `/// <reference types="vite/client" />` so a CSS side-effect import typechecks in that disposable copy.)
- `e2e/greenfield.spec.ts` (opens `e2e/fixtures/empty-project` after reset)
- `benchmarks/editStress/fixtureWorkspace.ts` (`DISK_SOURCES["sudoku-vite"]` → `e2e/fixtures/sudoku-vite`)
- `benchmarks/editStress/prompts.ts` (sudoku prompts expect `src/App.tsx`; `sudoku-mobile` also expects `src/index.css`)
- Root `package.json` toolchain pins: `react`/`react-dom` `^19.2.7`, `@types/react` `^19.2.16`, `@types/react-dom` `^19.2.3`, `@vitejs/plugin-react` `^6.0.2`, `typescript` `^6.0.3`, `vite` `^8.0.16`

## Output paths

- `e2e/fixtures/empty-project/.gitkeep`
- `e2e/fixtures/empty-project/package.json`
- `e2e/fixtures/empty-project/package-lock.json`
- `e2e/fixtures/empty-project/index.html`
- `e2e/fixtures/empty-project/tsconfig.json`
- `e2e/fixtures/empty-project/vite.config.ts`
- `e2e/fixtures/empty-project/src/vite-env.d.ts`
- `e2e/fixtures/empty-project/src/main.tsx`
- `e2e/fixtures/empty-project/src/App.tsx`
- `e2e/fixtures/empty-project/src/index.css`
- `e2e/fixtures/sudoku-vite/package.json`
- `e2e/fixtures/sudoku-vite/package-lock.json`
- `e2e/fixtures/sudoku-vite/index.html`
- `e2e/fixtures/sudoku-vite/tsconfig.json`
- `e2e/fixtures/sudoku-vite/vite.config.ts`
- `e2e/fixtures/sudoku-vite/src/vite-env.d.ts`
- `e2e/fixtures/sudoku-vite/src/main.tsx`
- `e2e/fixtures/sudoku-vite/src/App.tsx`
- `e2e/fixtures/sudoku-vite/src/index.css`

## SHA-256 (file bytes of every fixture file intended for commit)

- `e2e/fixtures/empty-project/.gitkeep`  
  `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b`
- `e2e/fixtures/empty-project/index.html`  
  `6c16c52992d6399b38b4cfbf2244c050be7c9f36c3b65bb787114aeec1941dc7`
- `e2e/fixtures/empty-project/package-lock.json`  
  `1af43c3a529b373359bf23f8d9b78cf100eee3034a2a77f75393bcbb0ee86bc8`
- `e2e/fixtures/empty-project/package.json`  
  `1bfecc312f58a0ee1f137729c3d7b286669cb6d3d74b4659b2c6e18f7a0bf9f7`
- `e2e/fixtures/empty-project/src/App.tsx`  
  `d7cab3023bdabc55f290424df37bf1b9131177bc8d0171f6f7788ca3ad7348e9`
- `e2e/fixtures/empty-project/src/index.css`  
  `7ce0b702ebc31a4844fc57216f896bcfb645775a598f73b1ee4abc2600216249`
- `e2e/fixtures/empty-project/src/main.tsx`  
  `acc11682711269285ad5cdca42eb3623215e9083d43b14f969389fbd55db68a3`
- `e2e/fixtures/empty-project/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `e2e/fixtures/empty-project/tsconfig.json`  
  `7a0eee3f12fd4b3a90a48d3f2cdc9317a3096e7dced0cb03a107a8d1726113d0`
- `e2e/fixtures/empty-project/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`
- `e2e/fixtures/sudoku-vite/index.html`  
  `f8a8a12b2a5b97e5bc360b5cad5255dd9015564e171dcdeba40e77c04d08773d`
- `e2e/fixtures/sudoku-vite/package-lock.json`  
  `27072b0355ebcac0073b6c39d8b5f98a5571843929b2f833c2ca61f9dd5cbe3f`
- `e2e/fixtures/sudoku-vite/package.json`  
  `deffe0d0fd379f2b13cfa64789abd33651c1625d18fe2113615e820f9896ad4e`
- `e2e/fixtures/sudoku-vite/src/App.tsx`  
  `6e539bc5077ff32dcd83259c2f1a8660a412247e09e545c2fb9ea67395847b31`
- `e2e/fixtures/sudoku-vite/src/index.css`  
  `c427fe325bd3d21f3678e4dc389b40bacd5e1776eb06d53aeca8c5827d08b5f8`
- `e2e/fixtures/sudoku-vite/src/main.tsx`  
  `c732703600bd1e145158f615b3c7e1af9c1c7e7811e9166fe469a7786ea7aebc`
- `e2e/fixtures/sudoku-vite/src/vite-env.d.ts`  
  `65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5`
- `e2e/fixtures/sudoku-vite/tsconfig.json`  
  `7a0eee3f12fd4b3a90a48d3f2cdc9317a3096e7dced0cb03a107a8d1726113d0`
- `e2e/fixtures/sudoku-vite/vite.config.ts`  
  `eca485c281977125366d4800553256e419f364984e615f75a2d2bae54f7857fd`

## `e2e/greenfield.spec.ts` limitation (pre-existing)

This spec wipes the shared `e2e/fixtures/empty-project` tree (`resetEmptyProjectFixture` keeps `.gitkeep` and `.bryantlabs`) and then tries to open that folder. Committed replacement files are gone before open, so this spec is not a check of the new skeleton contents.

Command and mock-provider environment (no real providers):

```bash
export BRYANTLABS_MOCK_PROVIDER=1
unset BRYANTLABS_E2E_REAL_PROVIDER
unset PLAYWRIGHT_USE_DIST
npx playwright test e2e/greenfield.spec.ts
```

- Branch `chore/replace-legacy-e2e-fixtures`: fail (~2.0m). Debug `projectPath:null`, `greenfieldRun.runResult` idle. UI **No project open** / **Choose a project to get started**.
- Isolated clean checkout of `main` at `e881a63` (`/tmp/bryantlabs-greenfield-main`, same env/command): fail identically (`projectPath:null`, idle greenfield, **No project open**).

Therefore this is a reproducible pre-existing shared-fixture opening issue, not evidence of a replacement regression. It is **not** a claim that the overall E2E suite fully passes. Targeted mock Playwright that do not depend on that shared wipe (13 tests in the PR 2 verification set) passed; `e2e/greenfield.spec.ts` did not. The same mock calculator prompt succeeds in `e2e/create-then-edit.mock.spec.ts` on a disposable empty folder.

## What this does not do

- Does not replace `benchmarks/fixtures/stress/**` or other replay-frozen stress trees
- Does not set inventory `verified` or a structured `evidence_reference`
- Does not prove authenticity of any off-Git object
- Does not conclude copyright ownership or legal authorship of the replacement
- Does not claim that `e2e/greenfield.spec.ts` or the full E2E suite passed

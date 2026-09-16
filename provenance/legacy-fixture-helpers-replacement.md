# Replacement record: legacy fixture helpers (2026-09-16)

Engineering record of how these two files were rewritten. Not legal advice. Not a statement of legal authorship, copyright ownership, license grant, or clearance. Does **not** mark `PROVENANCE.md` **Verified**. Inventory `evidence_reference` remains `none`.

This record covers **only** the two benchmark helper modules. Stress snapshot trees and E2E fixture apps were not changed.

## Operator and tools

- Date: 2026-09-16
- Human operator / requester: Ferris Bryant
- AI-assisted implementation tool: Cursor
- Model: Grok 4.6 (stated identity of this Cursor agent session; not read from Cursor `settings.json`)
- App-generation provider/model: none (no live provider, no API credits)
- Method: TypeScript helpers written from in-repo test contracts, with Cursor assistance. Not sole human authorship.

## Specifications used (inputs)

- `src/core/greenfield/types.ts` (`GREENFIELD_FILE_PATHS`)
- `src/core/greenfield/fileValidation.ts` (required scripts, `#root`, `/src/main.tsx`, App import, createRoot/render)
- `benchmarks/cases/app-creation.ts` (parse/validate/reliability/partial/skeleton contracts)
- FieldFlow page/status/KPI/tech labels in `FIELD_FLOW_EXTRACTION_PROMPT` / `FIELD_FLOW_FULL_PROMPT`
- `src/core/agent/requirementEvidenceHeuristics.ts`
- `benchmarks/cases/requirement-satisfaction.ts` (full diffs must pass; stub diffs must fail)

## Output paths

- `benchmarks/fixtures/greenfield.ts`
- `benchmarks/fixtures/fieldFlow.ts`

## SHA-256 (file bytes after the record/operator-field edits)

- `benchmarks/fixtures/greenfield.ts`  
  `1c4adfe0f1237b2c819301e5a6a2955edab859843f5d5ef79b924d09c883aeab`
- `benchmarks/fixtures/fieldFlow.ts`  
  `05c399d5a2725dfb2497d50f69a4d9669c4980539023aeb3fe4ae359116440d6`

## What this does not do

- Does not replace `benchmarks/fixtures/stress/**` or `e2e/fixtures/**`
- Does not set inventory `verified` or a structured `evidence_reference`
- Does not prove authenticity of any off-Git object
- Does not conclude copyright ownership or legal authorship of the replacement

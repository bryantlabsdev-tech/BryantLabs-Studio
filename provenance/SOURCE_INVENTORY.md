# Source inventory

Machine-readable records live in fenced `provenance-record` blocks. Git names and dates are observations, not ownership. **No item is verified.**

`evidence_reference` is either `none` or a structured citation:

`evidence_id=<id>; record_type=<owner_attestation|third_party_license|replacement_record|dependency_license_scan>; date=<YYYY-MM-DD>; reviewer=<name>; stored_location=<uri-or-path>`

Optionally add `; content_sha256=<64 lowercase hex>`. The checker only validates **format**. It does not open off-Git files, recompute hashes of stored evidence, or prove authenticity.

`scope_kind` is `entire_tree_at_commit` (every path in that commit except `exclusions`) or `path_list`.

Set `informational: true` only for records that must not map to a `PROVENANCE.md` register row.

The checker never opens `provider-settings.json`, `.env` files, credentials files, or secret stores.

---

## initial-application-source

First-party tree imported in `bf3396e`, **excluding** fixture corpora and the npm lockfile (third-party package metadata). This is not a partial prefix list.

```provenance-record
id: initial-application-source
material: Application source first imported in commit `bf3396e`
status: unresolved
introducing_commit: bf3396e030becf03a17295a329f0506b2df6f197
git_author: Ferris Bryant <Bryantlabs.dev@gmail.com>
git_committer: Ferris Bryant <Bryantlabs.dev@gmail.com>
author_date: 2026-06-24T00:38:44-04:00
committer_date: 2026-06-24T00:38:44-04:00
generated_or_authored: unknown
copyright_ownership: unknown
dependency_licensing: not_applicable
trademark_clearance: not_applicable
evidence_reference: none
scope_kind: entire_tree_at_commit
informational: false
paths:
- entire tree at introducing_commit minus exclusions
exclusions:
- benchmarks/fixtures/
- e2e/fixtures/
- package-lock.json
missing_evidence: No pre-import VCS, assignment, or independent-implementation record. Commit subject is "Recovered BryantLabs Studio after Phase 4 CI wiring". Git author/committer is not copyright ownership. Dates before author_date are unknown.
```

**Coverage definition:** every path in `git ls-tree -r --name-only bf3396e030becf03a17295a329f0506b2df6f197` except (1) `benchmarks/fixtures/**`, (2) `e2e/fixtures/**`, (3) `package-lock.json`. Included therefore: `src/`, `electron/`, remaining `benchmarks/` (harness/cases/tests, not fixture snapshots), remaining `e2e/` (specs/helpers, not fixtures), `docs/`, `.github/`, `scripts/` as of that commit, root configuration (`package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`, `.gitignore`), and root documentation (`README.md`, `ARCHITECTURE.md`, `BRYANTLABS_STUDIO_LONG_PROMPT_TEST.md`). `package-lock.json` is npm lockfile metadata, not a first-party authorship claim; see `npm-dependencies`.

---

## legacy-benchmark-fixtures

Fixture corpora from the same import. Nested `package.json` / `package-lock.json` files inside these trees are **dependency metadata inside fixtures**, not a first-party originality claim.

```provenance-record
id: legacy-benchmark-fixtures
material: Legacy benchmark fixtures included in the initial import
status: unresolved
introducing_commit: bf3396e030becf03a17295a329f0506b2df6f197
git_author: Ferris Bryant <Bryantlabs.dev@gmail.com>
git_committer: Ferris Bryant <Bryantlabs.dev@gmail.com>
author_date: 2026-06-24T00:38:44-04:00
committer_date: 2026-06-24T00:38:44-04:00
generated_or_authored: mixed
copyright_ownership: unknown
dependency_licensing: unknown
trademark_clearance: not_applicable
evidence_reference: none
scope_kind: path_list
informational: false
paths:
- benchmarks/fixtures/
- e2e/fixtures/
exclusions:
missing_evidence: No pre-import authorship, license, or generation log. Whether snapshots were model-generated, hand-written, or copied is unknown. Fixture lockfiles name third-party packages; those licenses are not attested here.
```

---

## bryantlabs-logo-and-branding

Not part of `bf3396e`. Added later in `04a13e`. Narrative record: [`bryantlabs-logo-and-branding.md`](./bryantlabs-logo-and-branding.md). **Not verified.**

```provenance-record
id: bryantlabs-logo-and-branding
material: BryantLabs logo source and generated icons
status: unresolved
introducing_commit: 04a13e98175ed2e32f8706b8b809683a6e2aef62
git_author: Ferris Bryant <Bryantlabs.dev@gmail.com>
git_committer: Ferris Bryant <Bryantlabs.dev@gmail.com>
author_date: 2026-09-12T16:20:35-04:00
committer_date: 2026-09-12T16:20:35-04:00
generated_or_authored: generated
copyright_ownership: unknown
dependency_licensing: not_applicable
trademark_clearance: not_performed
evidence_reference: none
scope_kind: path_list
informational: false
paths:
- assets/branding/
- public/apple-touch-icon.png
- public/favicon-16x16.png
- public/favicon-32x32.png
- public/favicon.ico
- public/icon-16.png
- public/icon-32.png
- public/icon-48.png
- public/icon-64.png
- public/icon-128.png
- public/icon-192.png
- public/icon-256.png
- public/icon-512.png
- public/manifest.webmanifest
- scripts/generate-branding.mjs
exclusions:
missing_evidence: Source bitmap was generated with ChatGPT (owner statement; not in Git history). Model, generation date, prompt, conversation reference, and uploaded reference images are unknown. Pixel-level human edits after generation are not recalled and are not recorded in Git. Resized PNG/ICNS/ICO/favicon outputs were mechanically generated by scripts/generate-branding.mjs from assets/branding/bryantlabsicon-source.png (that in-repo copy exists; the script's default Desktop input path is a regeneration default, not a claim that the source PNG is absent from Git). Commissioning party is Ferris Bryant (requested generation). Copyright ownership is unknown. Trademark clearance is not performed. ChatGPT generation does not itself establish copyright protection, ownership, non-infringement, or trademark clearance.
```

---

## post-import-changes

```provenance-record
id: post-import-changes
material: Changes after the initial import
status: unresolved
introducing_commit: not_a_single_commit
git_author: various (see git log after bf3396e030becf03a17295a329f0506b2df6f197)
git_committer: various (see git log after bf3396e030becf03a17295a329f0506b2df6f197)
author_date: after 2026-06-24T00:38:44-04:00
committer_date: after 2026-06-24T00:38:44-04:00
generated_or_authored: unknown
copyright_ownership: unknown
dependency_licensing: not_applicable
trademark_clearance: not_applicable
evidence_reference: none
scope_kind: path_list
informational: false
paths:
- all commits after bf3396e030becf03a17295a329f0506b2df6f197 (not a closed path snapshot)
exclusions:
missing_evidence: Per-commit authority to submit, AI-assistance disclosures, and assignment instruments are not collected in this inventory. Git history is not a substitute.
```

---

## npm-dependencies

Declared third-party packages. Machine license policy is not legal clearance. Distinct from first-party authorship of application source.

```provenance-record
id: npm-dependencies
material: npm dependencies
status: unresolved
introducing_commit: bf3396e030becf03a17295a329f0506b2df6f197
git_author: Ferris Bryant <Bryantlabs.dev@gmail.com>
git_committer: Ferris Bryant <Bryantlabs.dev@gmail.com>
author_date: 2026-06-24T00:38:44-04:00
committer_date: 2026-06-24T00:38:44-04:00
generated_or_authored: generated
copyright_ownership: not_applicable
dependency_licensing: machine_checked_not_cleared
trademark_clearance: not_applicable
evidence_reference: none
scope_kind: path_list
informational: false
paths:
- package.json
- package-lock.json
exclusions:
missing_evidence: Notice files for distributed artifacts, counsel review of licenses, and treatment of transitive packages beyond npm run licenses:check.
```

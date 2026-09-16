# Asset provenance record: bryantlabs-logo-and-branding

This is an **engineering record**, not legal advice and not trademark, copyright, or non-infringement clearance. Completing it does not mark the register **Verified**.

Git committer identity does not establish who created the artwork or who owns it. **ChatGPT generation does not itself establish copyright protection, ownership, non-infringement, or trademark clearance.**

Inventory status remains `unresolved`. `evidence_reference` remains `none`. The `PROVENANCE.md` row remains **Unverified** (release blocker active).

Filled from [`ASSET_PROVENANCE_TEMPLATE.md`](./ASSET_PROVENANCE_TEMPLATE.md) using owner statements dated 2026-09-16 plus repository observations.

## Asset identification

- Inventory id: `bryantlabs-logo-and-branding`
- Repository paths:
  - `assets/branding/`
  - `public/apple-touch-icon.png`
  - `public/favicon-16x16.png`
  - `public/favicon-32x32.png`
  - `public/favicon.ico`
  - `public/icon-16.png`
  - `public/icon-32.png`
  - `public/icon-48.png`
  - `public/icon-64.png`
  - `public/icon-128.png`
  - `public/icon-192.png`
  - `public/icon-256.png`
  - `public/icon-512.png`
  - `public/manifest.webmanifest`
  - `scripts/generate-branding.mjs`
- Source file path (if different from generated outputs):
  - In Git: `assets/branding/bryantlabsicon-source.png` (present in commit `04a13e`)
  - Regeneration input default in `scripts/generate-branding.mjs`: `$BRYANTLABS_ICON_SOURCE` or `~/Desktop/bryantlabsicon.png` (a default input path, not evidence that the source bitmap is missing from Git)
- Introducing commit SHA: `04a13e98175ed2e32f8706b8b809683a6e2aef62`
- Recorded Git author (observation only): Ferris Bryant \<Bryantlabs.dev@gmail.com\>
- Recorded Git committer (observation only): Ferris Bryant \<Bryantlabs.dev@gmail.com\>
- Git author date (observation only): 2026-09-12T16:20:35-04:00
- Git committer date (observation only): 2026-09-12T16:20:35-04:00
- Filesystem timestamps if independently recorded, otherwise `unknown`: `unknown`

## Generation vs authorship

Select **one** for the **source** artwork:

- [x] Generated or heavily derived by a tool or model

Owner statement (2026-09-16; not recorded in Git history): the source bitmap itself was generated using ChatGPT, not created solely by a human.

- Tool: ChatGPT
- Model: `unknown`
- Generation date: `unknown` (Git dates are commit dates only)
- Prompt: `unknown`
- Conversation reference: `unknown`
- Uploaded reference images: `unknown`

Select **one** for **derived** files (resized PNGs, `.icns`, `.ico`, favicons):

- [x] Mechanically generated from the source file listed above (describe the generator/script): `scripts/generate-branding.mjs`

Documented mechanical steps in that script:

1. Copy the input PNG to `assets/branding/bryantlabsicon-source.png`
2. Resize with `sips` to PNG sizes 16, 32, 48, 64, 128, 256, 512, 1024, plus 180 (`apple-touch-icon`) and 192
3. Build `assets/branding/icon.icns` with `iconutil`
4. Build `assets/branding/icon.ico` with `npx png-to-ico` from `icon-256.png`
5. Copy selected sizes into `public/` (including favicons)
6. Write `manifest.webmanifest` (product strings `BryantLabs Studio` / `BryantLabs`) and copy it to `public/`

Pixel-level human edits after generation: owner does not recall any; none are recorded in Git. No later Git commit revises the branding binaries after `04a13e`. UI wiring in that commit (`src/core/branding.ts` and related components) consumes the assets; it is not a record of artwork authorship.

## Copyright ownership (separate from Git)

- [x] `unknown`

No ownership, assignment, or license instrument is recorded here.

## Trademark clearance (separate from copyright)

- Marks depicted (name, logo, wordmark): names written in `manifest.webmanifest` are `BryantLabs Studio` and `BryantLabs`; visual content of the PNG is not further described from Git metadata
- Clearance status: `not performed`
- Do not treat commit `04a13e` as trademark permission.

## Designer / commissioner facts

- Designer name: not a sole human designer; generation tool recorded as ChatGPT; specific model `unknown`
- Commissioning party: Ferris Bryant (requested the ChatGPT logo generation)
- Creation date: `unknown`
- Assignment or license instrument location: `unknown`

## Evidence still needed (does not verify this item)

- ChatGPT product/surface and model name
- Generation date (not the Git commit date)
- Prompt text
- Conversation URL, id, or export
- Whether reference images were uploaded, and copies of those files
- Confirmation whether Desktop `bryantlabsicon.png` matches `assets/branding/bryantlabsicon-source.png` byte-for-byte
- Copyright-ownership or assignment instrument, or a documented replacement of the mark
- A separate trademark-clearance record, or an owner decision of `requires replacement`
- Off-Git stored copies plus a structured `evidence_reference` before any later `verified` status

## Evidence for a later `verified` status

- Evidence reference: `none`
- Off-Git copy location: `none`

The checker does not authenticate off-Git files. This document is not that structured citation.

## Recorder

- Name: Ferris Bryant
- Date: 2026-09-16
- Role: commissioning party / repository owner recording engineering facts

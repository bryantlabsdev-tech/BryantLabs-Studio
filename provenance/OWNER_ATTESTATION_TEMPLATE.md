# Owner / contributor attestation template

This form is an **engineering record**. Completing it does not constitute legal advice, a legal opinion, or a guarantee of non-infringement. Git history is not sufficient evidence of ownership.

Copy this file outside the repository (or into a dated evidence store). Fill every field. Use `unknown` or `requires replacement` when a fact is not established. Do not leave required fields blank.

## Identity

- Attestation date (ISO 8601):
- Attestor legal name:
- Role relative to this repository (owner / employee / contractor / other; if other, describe):
- Contact:

## Material covered

- Inventory id (`initial-application-source` / `legacy-benchmark-fixtures` / `bryantlabs-logo-and-branding` / other):
- Exact repository paths or prefixes:
- Introducing commit SHA if known, otherwise `unknown`:

## Copyright ownership (do not infer from Git)

Select **one**:

- [ ] I am the copyright owner of this material.
- [ ] The copyright owner is the organization named here: _______________ and I have authority to attest.
- [ ] Copyright was assigned to the owner named here: _______________ (assignment instrument stored at: _______________).
- [ ] `unknown`
- [ ] `requires replacement` (do not ship this material; replace it)

If claiming ownership or assignment, describe how the work was created (independent authorship, employment, written assignment). If `unknown` or `requires replacement`, stop claiming originality for this material.

## Third-party or AI-assisted content

- Does this material include third-party source, assets, or substantial copied text? (`yes` / `no` / `unknown`):
- If yes, identify each source, license, and location of the license text, or mark `requires replacement`:
- Was any portion generated or transformed by an AI system? (`yes` / `no` / `unknown`):
- If yes, describe the system and what human-authored inputs were used, or `unknown`:

## Dependency licensing (separate from copyright of first-party files)

- Does this attestation cover npm or other dependencies? (`yes` / `no` / `not applicable`):
- If yes, list packages and licenses, or point to `package-lock.json` plus `npm run licenses:check` output stored at: _______________
- Machine license checks are **not** legal clearance.

## Trademark (separate from copyright)

- Does this material include a name, logo, or slogan used in commerce? (`yes` / `no` / `unknown`):
- Trademark clearance performed? (`yes` / `no` / `not applicable` / `unknown`):
- If yes, counsel or search record stored at: _______________
- If no or unknown, do not treat this form as trademark permission.

## Evidence attached (required for any later `verified` inventory status)

Use this citation format (a random string is not valid):

`evidence_id=<id>; record_type=<owner_attestation|third_party_license|replacement_record|dependency_license_scan>; date=<YYYY-MM-DD>; reviewer=<name>; stored_location=<uri-or-path>`

Optional: `; content_sha256=<64 lowercase hex>`. Format checks do not prove the stored object is authentic.

- Evidence reference:
- Locations of signed copies outside Git:
- Reviewer name and date (if any):

## Signature

I understand that Git author/committer fields do not prove the statements above.

- Signature:
- Date:
- Printed name:

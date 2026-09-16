# Release clearance checklist

This checklist is an **engineering gate**, not a legal opinion, not counsel approval, and not a claim of zero risk. Completing boxes does not authorize publishing, selling, signing, notarizing, or distributing a build.

Git history alone never clears an item.

## Repository controls

- [ ] `PROVENANCE.md` has been read in the current revision.
- [ ] `npm run provenance:check` passes (unresolved items with complete records are expected to pass; the checker does not authenticate off-Git evidence).
- [ ] `npm run licenses:check` passes. This is a declared-license policy check, **not** legal clearance of dependencies.
- [ ] No inventory row is `verified` without an evidence reference that a human has inspected.

## Unresolved historical items

For each item still **Unverified** in `PROVENANCE.md`:

| Item | Owner attestation or replacement complete? | Copyright ownership documented? | Trademark considered separately? | Evidence stored off-Git? |
| --- | --- | --- | --- | --- |
| Initial application source (`bf3396e`) | `yes` / `no` / `unknown` / `requires replacement` | | `not applicable` / `unknown` / … | |
| Legacy benchmark fixtures | | | `not applicable` / … | |
| BryantLabs logo and generated branding | | | | |

Do not ship while any shipped source or asset remains **Unverified**, per `PROVENANCE.md`.

## Distinctions

- [ ] Copyright statements are not treated as dependency licenses.
- [ ] Dependency license texts/notices for distributed artifacts are listed or `unknown`.
- [ ] Names and logos are not treated as cleared for trademark use unless a separate clearance record exists or the owner records `requires replacement`.

## Product claims

- [ ] No unapproved claim of equivalence, endorsement, or replacement of another vendor’s product (see `PROVENANCE.md`).

## Sign-off (engineering only)

- Recorder name:
- Date:
- “I am not providing legal advice by signing this checklist.” (`yes` required):

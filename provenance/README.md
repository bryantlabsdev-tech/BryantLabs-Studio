# Provenance evidence workflow

This directory holds **engineering records** for source and asset provenance. It is not legal advice, not a clearance opinion, and not a warranty of non-infringement.

Git author names, commit dates, and file paths are **repository observations**. They do not, by themselves, establish copyright ownership, license grants, work-for-hire status, or trademark rights.

## What this workflow does

1. Keep unresolved items listed in [`PROVENANCE.md`](../PROVENANCE.md).
2. Keep a matching inventory record in [`SOURCE_INVENTORY.md`](./SOURCE_INVENTORY.md) for **every** register row.
3. Collect owner facts with [`OWNER_ATTESTATION_TEMPLATE.md`](./OWNER_ATTESTATION_TEMPLATE.md) and asset facts with [`ASSET_PROVENANCE_TEMPLATE.md`](./ASSET_PROVENANCE_TEMPLATE.md). Store completed attestations **outside Git** as well as a structured `evidence_reference`.
4. Use [`RELEASE_CLEARANCE_CHECKLIST.md`](./RELEASE_CLEARANCE_CHECKLIST.md) before any external distribution. The checklist does not approve a release by itself.
5. Run `npm run provenance:check`. The checker is read-only. It does **not** inspect secrets, provider settings, `.env` files, or credential stores. It does **not** rewrite files. A structured citation is not proof that off-Git evidence is authentic.

## Allowed inventory statuses

| Status | Meaning |
| --- | --- |
| `unresolved` | Facts are incomplete. Ordinary CI must still pass. |
| `unknown` | The owner explicitly records that the fact is not known. |
| `requires_replacement` | The owner records that the material should be replaced rather than attested. |
| `verified` | Allowed only when the matching `PROVENANCE.md` row is **Verified** and `evidence_reference` is a structured citation (id, record type, date, reviewer, and stored location or SHA-256). The checker does not authenticate off-Git files. |

The three historical items remain **unresolved** until a human owner supplies evidence. This repository must not infer that Git history “proves” they are original.

## Distinctions the templates keep separate

- **Copyright ownership** of source or artwork.
- **Dependency licensing** for third-party packages (see `npm run licenses:check`; that check is not legal clearance).
- **Trademark clearance** for names, logos, and product claims.

## What the checker fails on

- Any register row with an unknown status.
- A register row without exactly one matching inventory record.
- Duplicate inventory ids or materials.
- Orphan inventory records unless `informational: true`.
- **Verified** register rows without inventory `verified` plus a structured `evidence_reference`.
- Inventory `verified` while the register row is not **Verified**.
- `verified` inventory with `none`, a placeholder, or a random string as `evidence_reference`.
- Missing required fields or forbidden secret paths.

Unresolved records with complete required fields **pass**. The checker does not prove off-Git evidence is authentic.

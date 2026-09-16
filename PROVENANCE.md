# Source and Asset Provenance

This register records what can and cannot currently be established from the repository. It is an engineering control, not a legal opinion or a warranty of non-infringement.

## Release rule

Do not publish, sell, sign, notarize, or distribute a build while any shipped source or asset is marked **unverified** below. Resolve an unverified item with a dated owner attestation, a documented third-party license, or an independently created replacement. Preserve the evidence outside Git as well as a reference here.

Inventory, templates, and the read-only checker live in [`provenance/`](./provenance/README.md). Run `npm run provenance:check`. Every register row must have an inventory record. Unresolved items with complete records pass. A **Verified** row requires structured evidence; the checker does not authenticate off-Git files and does not infer ownership from Git.

## Register

| Material | Repository evidence | Status | Required before external release |
| --- | --- | --- | --- |
| Application source first imported in commit `bf3396e` | The first commit describes a recovered codebase and contains no earlier authorship history | **Unverified** | Obtain a signed owner/contributor attestation identifying the source, or replace the affected material through documented independent implementation |
| Legacy benchmark fixtures included in the initial import | No pre-import provenance is present in Git | **Unverified** | Attest to authorship/license or replace with newly authored fixtures and record their creator and date |
| BryantLabs logo source and generated icons | Added in commit `04a13e`; Git identifies the committer but not the artwork's underlying source | **Unverified** | Record the designer, creation date, source file, and assignment/license, or commission a documented replacement; perform separate trademark clearance |
| Changes after the initial import | Git records commits and authors; some commits may be AI-assisted | **Partially documented** | Keep human review and contribution records; confirm contributors had authority to submit their work |
| npm dependencies | Declared in `package.json`/`package-lock.json`; licenses are checked by `npm run licenses:check` | **Machine checked, not legally cleared** | Preserve required license texts/notices in distributed artifacts and review any new or changed license |

## Evidence requirements for new material

For every new source file, fixture, image, font, audio file, dataset, or substantial text imported from outside the project, record:

- creator or source URL;
- creation or retrieval date;
- applicable license or written assignment;
- modifications made;
- reviewer and review date.

Do not treat absence of a copyright notice, public availability, an AI-generated output, or similarity to a common interface as permission to copy.

## Product and marketing claims

Do not claim that this project is equivalent to, compatible with, endorsed by, or a replacement for another vendor's product unless counsel approves the wording and objective evidence supports it. Comparative testing must use authorized access, neutral acceptance criteria, and enough reproducibility information to substantiate any published result.

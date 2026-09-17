# Source and Asset Provenance

This register records what can and cannot currently be established from the repository. It is an engineering control, not a legal opinion or a warranty of non-infringement.

## Release rule

Do not publish, sell, sign, notarize, or distribute a build while any shipped source or asset is marked **unverified** below. Resolve an unverified item with a dated owner attestation, a documented third-party license, or an independently created replacement. Preserve the evidence outside Git as well as a reference here.

Inventory, templates, and the read-only checker live in [`provenance/`](./provenance/README.md). Run `npm run provenance:check`. Every register row must have an inventory record. Unresolved items with complete records pass. A **Verified** row requires structured evidence; the checker does not authenticate off-Git files and does not infer ownership from Git.

## Register

| Material | Repository evidence | Status | Required before external release |
| --- | --- | --- | --- |
| Application source first imported in commit `bf3396e` | The first commit describes a recovered codebase and contains no earlier authorship history | **Unverified** | Obtain a signed owner/contributor attestation identifying the source, or replace the affected material through documented independent implementation |
| Legacy benchmark fixtures included in the initial import | No pre-import provenance is present in Git. On 2026-09-16 the historical stress snapshot trees under `benchmarks/fixtures/stress/legacy/` and `benchmarks/fixtures/stress/replay-frozen/` were replaced by a deterministic scaffolder run (generator version `1`). See [`provenance/legacy-stress-corpus-replacement.md`](./provenance/legacy-stress-corpus-replacement.md). Earlier 2026-09-16 replacements covered helper modules and two E2E fixture apps only. This row remains **Unverified**; the replacement is not external-release clearance. | **Unverified** | Remaining unresolved fixture facts, a signed owner attestation, and/or structured evidence are still required before external release. The deterministic stress-corpus swap does not mark this row Verified. |
| BryantLabs logo source and generated icons | Added in commit `04a13e`. Owner records that the source bitmap was generated with ChatGPT (not sole human authorship). In-repo copy is `assets/branding/bryantlabsicon-source.png`. Model, prompt, conversation, generation date, and reference-image history are unknown. Resized icons were produced by `scripts/generate-branding.mjs`. Trademark clearance is not performed. See [`provenance/bryantlabs-logo-and-branding.md`](./provenance/bryantlabs-logo-and-branding.md). | **Unverified** | Remaining generation facts, copyright-ownership evidence, a documented replacement, and/or a separate trademark-clearance record are still required before external release. ChatGPT generation does not itself establish copyright protection, ownership, non-infringement, or trademark clearance. |
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

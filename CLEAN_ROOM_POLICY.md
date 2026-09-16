# Independent Development and Clean-Room Policy

BryantLabs Studio must be designed and implemented from project requirements, public standards, licensed dependencies, and independently authored work.

## Prohibited inputs

Contributors must not:

- copy proprietary source code, private documentation, prompts, assets, datasets, or internal behavior specifications;
- decompile, bypass access controls, or reverse engineer a product where law or its license forbids it;
- use another product's generated code, private transcripts, or suggestions as source material when that use is restricted or its origin cannot be documented;
- reproduce distinctive branding, trade dress, icons, screenshots, wording, or user-interface artwork;
- remove copyright, attribution, or license notices;
- import code from a public repository without recording and complying with its license.

## Allowed design inputs

Contributors may use independently written requirements, published standards, documented interoperability information, general programming knowledge, and dependencies whose licenses have been reviewed. Ideas and product goals must be expressed in original code, text, and visual design.

## Contribution checklist

Before merging a material change, the reviewer must confirm:

1. The contributor created the work or identified every external source.
2. Required licenses, attribution, and notices are recorded.
3. No proprietary source, asset, prompt, or output was used as a template.
4. Tests describe product requirements rather than another product's private implementation.
5. Branding and marketing copy are original and do not imply endorsement.
6. `npm run licenses:check` and the normal verification suite pass.
7. Any uncertainty is entered in `PROVENANCE.md` and blocks external release until resolved.

## AI-assisted contributions

AI assistance does not establish ownership or clearance. A human contributor must review the result, reject suspiciously specific or unattributed material, document any supplied reference material, and accept responsibility for the submitted change. Never ask a model to imitate or reproduce a named product's protected code, text, or artwork.

## Incident response

If questionable material is found, stop distributing the affected build, preserve the evidence, isolate the paths and releases involved, and obtain qualified legal advice. Replace or remove the material only after preserving an auditable record of what happened.

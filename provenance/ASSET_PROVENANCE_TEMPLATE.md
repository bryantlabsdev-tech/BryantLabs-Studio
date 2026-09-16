# Asset provenance template

Use this form for images, icons, fonts, audio, video, or other non-code assets (including generated derivatives). This is an **engineering record**, not legal advice and not trademark or copyright clearance.

Git committer identity does not establish who created the artwork or who owns it. Fill every field. Use `unknown` or `requires replacement` when a fact is not established.

## Asset identification

- Inventory id:
- Repository paths:
- Source file path (if different from generated outputs):
- Introducing commit SHA, otherwise `unknown`:
- Recorded Git author (observation only):
- Recorded Git committer (observation only):
- Git author date (observation only):
- Git committer date (observation only):
- Filesystem timestamps if independently recorded, otherwise `unknown`:

## Generation vs authorship

Select **one** for the **source** artwork:

- [ ] Human-authored original
- [ ] Commissioned from a named designer
- [ ] Licensed stock or third-party artwork
- [ ] Generated or heavily derived by a tool or model
- [ ] `unknown`
- [ ] `requires replacement`

Select **one** for **derived** files (resized PNGs, `.icns`, `.ico`, favicons):

- [ ] Mechanically generated from the source file listed above (describe the generator/script):
- [ ] Independently authored
- [ ] `unknown`
- [ ] `requires replacement`

## Copyright ownership (separate from Git)

Select **one**:

- [ ] Owned by: _______________
- [ ] Licensed from: _______________ under license: _______________ (text stored at: _______________)
- [ ] `unknown`
- [ ] `requires replacement`

## Trademark clearance (separate from copyright)

- Marks depicted (name, logo, wordmark): _______________ or `unknown`
- Clearance status: `not performed` / `unknown` / `requires replacement` / record stored at: _______________
- Do not treat a commit that “adds branding” as trademark permission.

## Designer / commissioner facts

- Designer name, or `unknown`, or `requires replacement`:
- Commissioning party, or `unknown`:
- Creation date, or `unknown`:
- Assignment or license instrument location, or `unknown`, or `requires replacement`:

## Evidence for a later `verified` status

Citation format:

`evidence_id=<id>; record_type=<owner_attestation|third_party_license|replacement_record>; date=<YYYY-MM-DD>; reviewer=<name>; stored_location=<uri-or-path>`

The checker does not authenticate off-Git files.

- Evidence reference:
- Off-Git copy location:

## Recorder

- Name:
- Date:
- Role:

# NVIDIA Media Summary Write Contract

This proof defines the shape a NVIDIA media or VSS summary must satisfy before any future G-Brain media-page write is allowed.

## Command

```bash
bun run nvidia:media-summary-contract
```

Optional inputs:

```bash
bun run nvidia:media-summary-contract -- --input /path/to/media-summary.json --report-root /path/to/reports
```

## Outputs

Default files are written under `/Users/spencerheywood/nvidia-skills-upgrade/reports/`:

- `nvidia-media-summary-write-contract.json`
- `nvidia-media-summary-write-contract.md`

## Required Contract Areas

- `source_media`: stable media ID, URI/path, media type, capture timestamp, duration, and hash.
- `nvidia_summary`: NVIDIA tool name, endpoint class, full summary, timeline events, detected entities, and safety notes.
- `pii_redaction`: required handling for names, faces, phones, emails, addresses, and license plates.
- `gbrain_write`: target `media/` slug, page type, title, compiled-truth markdown, timeline append markdown, citations, and write gate.

## PII Rules

Names, faces, phones, emails, addresses, and plates must each have a redaction status of `redacted`, `none_detected`, or `needs_review`.

The validator rejects summary/write fields that still contain raw email, phone, or plate-shaped values. Face and name redaction remain human-review gates because the proof does not run facial recognition or identity matching.

## Write Gate

This card is proof-only. `gbrain_write.allowed_to_write` must be `false`, `pii_redaction.raw_pii_retained` must be `false`, and `pii_redaction.review_required` must be `true`.

Future live writes require a separate card that validates the real media pipeline, review queue, and write approval path.

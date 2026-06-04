# Motor Inn Dealership Source Inventory

`bun run motorinn:dealership-source-inventory` writes a metadata-only inventory
of local dealership documents for the NVIDIA Dealership Memory proof.

## Outputs

- `/Users/spencerheywood/nvidia-skills-upgrade/reports/dealership-memory-source-inventory.json`
- `/Users/spencerheywood/nvidia-skills-upgrade/reports/dealership-memory-source-inventory.md`

## What It Includes

- Indexed local source paths with dealership relevance signals.
- Stable citation IDs derived from source-relative paths.
- Title, file type, byte size, modified time, heading count, frontmatter flag,
  and citation-readiness notes.
- Excluded sources with reason, including unsupported file types, secret-like
  filenames, ignored directories, missing roots, and irrelevant local docs.

## Boundary

This proof writes metadata only. It does not write document contents, secrets,
embeddings, customer records, or private credentials into the inventory report.
Use `DEALERSHIP_DOC_ROOTS=/path/a,/path/b` or `--roots /path/a,/path/b` to
override the default local roots.

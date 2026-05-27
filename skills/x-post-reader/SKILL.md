---
name: x-post-reader
version: 1.0.0
description: |
  Deterministically fetch X/Twitter status URLs with the host's X API
  credentials before summarizing, ingesting, citing, or analyzing the post.
  Use for any x.com or twitter.com /status/ link, including long-form
  note_tweet posts that public HTML often hides.
triggers:
  - "x.com"
  - "twitter.com"
  - "X post"
  - "tweet link"
  - "read this tweet"
  - "read this X post"
  - "note_tweet"
  - "public X page is blank"
  - "use our API credentials to read the tweet"
tools:
  - exec
  - read
mutating: false
---

# X Post Reader

## Contract

When the user gives an `x.com/<handle>/status/<id>` or
`twitter.com/<handle>/status/<id>` URL, do not infer from public previews,
screenshots, or browser HTML first. Fetch the post with deterministic API
code, then reason over the fetched JSON.

This skill guarantees:

- The agent extracts the status id from the URL instead of guessing.
- The agent calls `scripts/fetch-x-post.mjs` before summarizing or ingesting.
- Long-form `note_tweet.text` is preferred over truncated `data.text`.
- Author, created time, canonical URL, media, references, and public metrics
  are preserved for citation.
- Errors are explicit. If credentials or API access fail, report that failure
  before falling back to web/browser scraping.

## Phases

1. **Run the deterministic fetch.**

   ```bash
   node skills/x-post-reader/scripts/fetch-x-post.mjs "https://x.com/<handle>/status/<id>" --json
   ```

   The script reads credentials from
   `~/.config/openclaw/credentials/x-twitter.json` by default, or
   `X_CRED_FILE` / `--cred-file` when set.

2. **Validate the returned object.**
   - `text` is the authoritative body; it uses `note_tweet.text` when present.
   - `author.username` determines the canonical citation URL.
   - `metrics` are read-only evidence, not endorsement.
   - `media` URLs should be preserved when present.

3. **Use the result according to caller intent.**
   - For "what is this?" answer from the fetched post.
   - For "put this in gbrain", chain to `skills/idea-ingest/SKILL.md`.
   - For citation repair, chain to `skills/citation-fixer/SKILL.md`.
   - For research claims in the post, verify linked primary sources separately.

4. **Cite deterministically.**

   Format:

   ```markdown
   [Source: [X/@<handle>, YYYY-MM-DD](https://x.com/<handle>/status/<id>)]
   ```

## Decision Rules

- If the URL is an X/Twitter status URL, this skill fires before generic web
  browsing or `idea-ingest`.
- If the post has `note_tweet.text`, use that body and ignore the truncated
  preview text except as a fallback.
- If the X API returns `401`, `403`, or missing-token errors, stop and report
  the credential problem. Do not pretend the post was read.
- If the X API returns "not found" or withheld, say so and only then try a
  browser/web fallback if the user still needs best-effort context.
- Never compose an X post URL by hand from memory. Use the fetched author and
  tweet id.

## Output Format

```json
{
  "id": "2059113412278227328",
  "url": "https://x.com/koylanai/status/2059113412278227328",
  "created_at": "2026-05-26T03:24:28.000Z",
  "text": "...full note_tweet text when available...",
  "author": {"username": "koylanai", "name": "Muratcan Koylan"},
  "metrics": {"like_count": 0, "retweet_count": 0},
  "media": []
}
```

## Anti-Patterns

- Summarizing an X link from the `x.com` HTML shell.
- Treating the truncated `data.text` preview as the full post when
  `note_tweet.text` exists.
- Guessing author handles, dates, or metrics.
- Dropping the source URL during handoff to `idea-ingest`.
- Letting a credential failure silently degrade into hallucinated content.

## Verification

Unit test deterministic parsing and normalization:

```bash
bun test test/x-post-reader.test.ts
```

Live smoke test when credentials are present:

```bash
node skills/x-post-reader/scripts/fetch-x-post.mjs \
  "https://x.com/koylanai/status/2059113412278227328" --json | jq '.id,.author.username,(.text|length)'
```

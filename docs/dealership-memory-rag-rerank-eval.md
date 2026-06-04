# Dealership Memory RAG/Rerank Eval

This proof turns the local dealership source inventory into a cited-answer eval for the Hermes/G-Brain memory workflow.

## Command

```bash
bun run nvidia:dealership-memory-eval
```

Optional inputs:

```bash
bun run nvidia:dealership-memory-eval -- --inventory /path/to/dealership-memory-source-inventory.json --report-root /path/to/reports
```

## Outputs

Default reports are written to:

- `/Users/spencerheywood/nvidia-skills-upgrade/reports/dealership-memory-eval.json`
- `/Users/spencerheywood/nvidia-skills-upgrade/reports/dealership-memory-eval.md`

The report contains 20 dealership workflow questions, generated local-doc answers, citations, per-question pass/fail, missing-source notes, and an aggregate score.

## NVIDIA Mapping

- `rag-blueprint`: local docs remain the source corpus and every answer must cite a source.
- `rag-eval`: the 20-question set is the pass/fail acceptance harness.
- `nemo-retriever`: source inventory records are normalized into retrievable citation candidates.
- `nemotron-retrieval-recipes`: keyword sentence scoring is the lightweight rerank proof before a hosted reranker is wired in.

## Boundary

This is proof-only. It does not call hosted endpoints, ingest broad Google Drive/email/Slack data, create embeddings, or enable live automation. Answer snippets are redacted for token-like secrets before report generation.

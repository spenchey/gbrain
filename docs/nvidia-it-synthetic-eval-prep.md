# NVIDIA IT Synthetic Eval And Fine-Tune Prep

This proof builds an offline dataset packet for the Motor Inn IT-agent workflow. It converts the cited Dealership Memory eval into synthetic eval rows and preference pairs for Mac, Archie, Dev, and Eve.

## Command

```bash
bun run nvidia:it-synthetic-eval-prep
```

Optional inputs:

```bash
bun run nvidia:it-synthetic-eval-prep -- --memory-eval /path/to/dealership-memory-eval.json --report-root /path/to/reports
```

## Outputs

Default files are written under `/Users/spencerheywood/nvidia-skills-upgrade/reports/`:

- `nvidia-it-synthetic-eval-dataset.jsonl`
- `nvidia-it-preference-pairs.jsonl`
- `nvidia-it-finetune-prep.json`
- `nvidia-it-finetune-prep.md`

## Workflow Coverage

- Mac: Spark/local model infrastructure, failure triage, and rollout safety.
- Archie: G-Brain RAG grounding, source contracts, and cited memory hygiene.
- Dev: implementation review, test quality, and repo-level correctness.
- Eve: evaluation QA, regression detection, and acceptance evidence.

Each role gets rows for PR review, test generation, architecture critique, and RAG grounding.

## NVIDIA Mapping

- `nemo-data-designer`: dataset row and preference-pair structure.
- `rag-blueprint`: cited local memory remains the grounding corpus.
- `rag-eval`: Dealership Memory eval is the source acceptance harness.
- `nemo-retriever`: inventory/eval citations become retrieval candidates.
- `nemotron-retrieval-recipes`: preference pairs reward grounded, cited, role-aware responses.

## Fine-Tune Gate

This card does not start a training job. Every generated row sets `fine_tune_allowed: false` and `human_review_required: true`.

Before any future fine-tune, the team must review every row, remove private/customer-specific data, run held-out offline evals, and explicitly approve the target model and endpoint.

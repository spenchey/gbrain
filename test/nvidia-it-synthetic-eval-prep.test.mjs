import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ROLES,
  TASK_TYPES,
  buildPrepReport,
  compact,
  redactSecretLike,
  writePrepReport,
} from "../scripts/build-nvidia-it-synthetic-eval-prep.mjs";

function createMemoryEvalFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nvidia-it-memory-eval-"));
  const questions = Array.from({ length: 20 }, (_, index) => {
    const questionNumber = String(index + 1).padStart(2, "0");
    return {
      id: `dmq-${questionNumber}`,
      question: `What should the IT team verify for workflow ${questionNumber}?`,
      answer: `The team should verify citations, tests, owner routing, and proof-only gates for workflow ${questionNumber}.`,
      expected_source_path: `docs/workflow-${questionNumber}.md`,
      citations: [
        {
          citation_label: `workflow-${questionNumber}:docs/workflow-${questionNumber}.md`,
          source_id: `workflow-${questionNumber}`,
          path: path.join(root, `docs/workflow-${questionNumber}.md`),
          relative_path: `docs/workflow-${questionNumber}.md`,
        },
      ],
      pass: true,
      missing_source_notes: [],
    };
  });
  const memoryEvalPath = path.join(root, "dealership-memory-eval.json");
  fs.writeFileSync(
    memoryEvalPath,
    JSON.stringify(
      {
        contract_id: "dealership-memory-eval",
        status: "pass",
        aggregate_score: { total: 20, passed: 20, failed: 0, score: 1 },
        questions,
      },
      null,
      2,
    ),
  );
  return { root, memoryEvalPath };
}

test("builds synthetic eval rows and preference pairs for every IT role/task", () => {
  const { memoryEvalPath } = createMemoryEvalFixture();
  const report = buildPrepReport({ memoryEvalPath, generatedAt: "2026-06-04T00:00:00.000Z" });

  assert.equal(report.status, "pass");
  assert.equal(report.datasetRows.length, ROLES.length * TASK_TYPES.length);
  assert.equal(report.preferencePairs.length, report.datasetRows.length);
  assert.deepEqual(Object.keys(report.outputs.roles).sort(), ROLES.map((role) => role.id).sort());
  assert.deepEqual(Object.keys(report.outputs.task_types).sort(), TASK_TYPES.map((task) => task.id).sort());
});

test("keeps fine-tune prep gated and citation-backed", () => {
  const { memoryEvalPath } = createMemoryEvalFixture();
  const report = buildPrepReport({ memoryEvalPath, generatedAt: "2026-06-04T00:00:00.000Z" });

  assert.equal(report.fine_tune_gate.blind_fine_tuning_allowed, false);
  assert.equal(report.fine_tune_gate.training_job_created, false);
  assert.ok(report.datasetRows.every((row) => row.fine_tune_allowed === false));
  assert.ok(report.datasetRows.every((row) => row.human_review_required === true));
  assert.ok(report.datasetRows.every((row) => row.citations.length === 1));
  assert.ok(report.preferencePairs.every((pair) => pair.rejected.includes("without checking citations")));
});

test("redacts token-like strings before snippets are written", () => {
  assert.equal(redactSecretLike(`${"NVIDIA_API"}_KEY=secret-value`), "[REDACTED]");
  assert.equal(compact(`prefix ${"nvapi-"}abcdefghijklmnopqrstuvwx suffix`), "prefix [REDACTED] suffix");
});

test("writes JSONL, JSON, and Markdown outputs", () => {
  const { memoryEvalPath } = createMemoryEvalFixture();
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nvidia-it-prep-report-"));
  const report = buildPrepReport({ memoryEvalPath, generatedAt: "2026-06-04T00:00:00.000Z" });
  const paths = writePrepReport(report, reportRoot);

  const datasetLines = fs.readFileSync(paths.datasetPath, "utf8").trim().split("\n");
  const preferenceLines = fs.readFileSync(paths.preferencePath, "utf8").trim().split("\n");
  const parsedReport = JSON.parse(fs.readFileSync(paths.reportPath, "utf8"));
  const markdown = fs.readFileSync(paths.markdownPath, "utf8");

  assert.equal(datasetLines.length, 16);
  assert.equal(preferenceLines.length, 16);
  assert.equal(parsedReport.contract_id, "motorinn.nvidia-it-synthetic-eval-prep.v1");
  assert.match(markdown, /NVIDIA IT Synthetic Eval And Fine-Tune Prep/);
});

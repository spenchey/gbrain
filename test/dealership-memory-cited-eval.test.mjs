import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EVAL_QUESTIONS,
  buildEvalReport,
  renderMarkdown,
  writeEvalReport,
} from "../scripts/run-dealership-memory-cited-eval.mjs";

function createInventoryFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dealership-memory-eval-"));
  const includedSources = EVAL_QUESTIONS.map((question, index) => {
    const filePath = path.join(root, question.expected_source_path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `# ${question.id}\n\n${question.question} ${question.keywords.join(" ")}. This local dealership workflow note gives enough cited context for the eval answer.\n`,
    );
    const sourceId = `local-doc-${String(index + 1).padStart(3, "0")}`;
    return {
      source_id: sourceId,
      path: filePath,
      relative_path: question.expected_source_path,
      citation_label: `${sourceId}:${question.expected_source_path}`,
    };
  });
  const inventoryPath = path.join(root, "inventory.json");
  fs.writeFileSync(
    inventoryPath,
    JSON.stringify(
      {
        contract_id: "dealership-memory-source-inventory",
        included_sources: includedSources,
      },
      null,
      2,
    ),
  );
  return { root, inventoryPath };
}

test("eval set has exactly 20 dealership workflow questions", () => {
  assert.equal(EVAL_QUESTIONS.length, 20);
  assert.equal(new Set(EVAL_QUESTIONS.map((question) => question.id)).size, 20);
});

test("cited eval passes when all expected sources exist", () => {
  const { inventoryPath } = createInventoryFixture();
  const report = buildEvalReport({ inventoryPath, generatedAt: "2026-06-02T00:00:00.000Z" });

  assert.equal(report.contract_id, "dealership-memory-eval");
  assert.equal(report.status, "pass");
  assert.equal(report.aggregate_score.total, 20);
  assert.equal(report.aggregate_score.passed, 20);
  assert.equal(report.questions.length, 20);
  assert.ok(report.questions.every((question) => question.pass));
  assert.ok(report.questions.every((question) => question.citations.length > 0));
});

test("eval report writes JSON and Markdown", () => {
  const { inventoryPath } = createInventoryFixture();
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dealership-memory-eval-report-"));
  const report = buildEvalReport({ inventoryPath, generatedAt: "2026-06-02T00:00:00.000Z" });
  const { jsonPath, markdownPath } = writeEvalReport(report, reportRoot);

  const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const markdown = fs.readFileSync(markdownPath, "utf8");
  assert.equal(parsed.aggregate_score.total, 20);
  assert.match(markdown, /Dealership Memory Cited-Answer Eval/);
  assert.match(renderMarkdown(report), /dmq-20/);
});

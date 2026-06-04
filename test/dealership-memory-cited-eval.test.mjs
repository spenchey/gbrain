import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EVAL_QUESTIONS,
  buildEvalReport,
  normalizeInventorySources,
  redactSecretLike,
  renderMarkdown,
  writeEvalReport,
} from "../scripts/run-dealership-memory-cited-eval.mjs";

function createLegacyInventoryFixture() {
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

function createRecordsInventoryFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dealership-memory-records-eval-"));
  const records = EVAL_QUESTIONS.map((question, index) => {
    const filePath = path.join(root, question.expected_source_path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `# ${question.id}\n\n${question.question} ${question.keywords.join(" ")}. This local dealership workflow note gives enough cited context for the eval answer.\n`,
    );
    return {
      status: "indexed",
      path: filePath,
      citation_id: `local-doc-${String(index + 1).padStart(3, "0")}`,
      citation_ready: true,
    };
  });
  const inventoryPath = path.join(root, "inventory.json");
  fs.writeFileSync(
    inventoryPath,
    JSON.stringify(
      {
        contract_version: "motorinn.dealership-local-doc-source-inventory.v1",
        records,
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

test("cited eval passes with the legacy included_sources inventory", () => {
  const { inventoryPath } = createLegacyInventoryFixture();
  const report = buildEvalReport({ inventoryPath, generatedAt: "2026-06-02T00:00:00.000Z" });

  assert.equal(report.contract_id, "dealership-memory-eval");
  assert.equal(report.status, "pass");
  assert.equal(report.aggregate_score.total, 20);
  assert.equal(report.aggregate_score.passed, 20);
  assert.equal(report.questions.length, 20);
  assert.ok(report.questions.every((question) => question.pass));
  assert.ok(report.questions.every((question) => question.citations.length > 0));
});

test("cited eval passes with the current records inventory contract", () => {
  const { inventoryPath } = createRecordsInventoryFixture();
  const report = buildEvalReport({ inventoryPath, generatedAt: "2026-06-02T00:00:00.000Z" });

  assert.equal(report.inventory_contract_id, "motorinn.dealership-local-doc-source-inventory.v1");
  assert.equal(report.status, "pass");
  assert.equal(report.aggregate_score.passed, 20);
  assert.ok(report.questions.every((question) => question.citations[0].relative_path.startsWith("docs/")));
  assert.deepEqual(normalizeInventorySources({}), []);
});

test("answer snippets redact token-like values", () => {
  assert.equal(redactSecretLike(`${"NVIDIA_API"}_KEY=secret-value`), "[REDACTED]");
  assert.equal(redactSecretLike(`token ${"nvapi-"}abcdefghijklmnopqrstuvwx`), "token [REDACTED]");
});

test("eval report writes JSON and Markdown", () => {
  const { inventoryPath } = createRecordsInventoryFixture();
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dealership-memory-eval-report-"));
  const report = buildEvalReport({ inventoryPath, generatedAt: "2026-06-02T00:00:00.000Z" });
  const { jsonPath, markdownPath } = writeEvalReport(report, reportRoot);

  const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const markdown = fs.readFileSync(markdownPath, "utf8");
  assert.equal(parsed.aggregate_score.total, 20);
  assert.match(markdown, /Dealership Memory Cited-Answer Eval/);
  assert.match(renderMarkdown(report), /dmq-20/);
});

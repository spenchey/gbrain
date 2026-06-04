import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  REQUIRED_PII_CATEGORIES,
  buildSampleMediaSummary,
  hasRawPii,
  validateMediaSummaryContract,
  writeValidationReport,
} from "../scripts/validate-nvidia-media-summary-contract.mjs";

test("sample NVIDIA media summary contract validates with write disabled", () => {
  const sample = buildSampleMediaSummary();
  const validation = validateMediaSummaryContract(sample);

  assert.equal(validation.valid, true);
  assert.equal(sample.gbrain_write.allowed_to_write, false);
  assert.equal(sample.pii_redaction.raw_pii_retained, false);
  assert.equal(sample.pii_redaction.review_required, true);
  assert.deepEqual(Object.keys(sample.pii_redaction.categories).sort(), REQUIRED_PII_CATEGORIES.sort());
});

test("contract rejects raw emails, phones, and plates in summary/write fields", () => {
  const sample = buildSampleMediaSummary();
  sample.nvidia_summary.full_summary = "Call Jane at 555-123-4567 or jane@example.com about plate ABC-1234.";
  const validation = validateMediaSummaryContract(sample);

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("raw emails")));
  assert.ok(validation.errors.some((error) => error.includes("raw phones")));
  assert.ok(validation.errors.some((error) => error.includes("raw plates")));
  assert.deepEqual(hasRawPii(sample.nvidia_summary).sort(), ["emails", "phones", "plates"]);
});

test("contract requires all PII categories and proof-only write gate", () => {
  const sample = buildSampleMediaSummary();
  delete sample.pii_redaction.categories.faces;
  sample.gbrain_write.allowed_to_write = true;
  const validation = validateMediaSummaryContract(sample);

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("faces.status")));
  assert.ok(validation.errors.some((error) => error.includes("allowed_to_write must be false")));
});

test("writes validation JSON and Markdown reports", () => {
  const sample = buildSampleMediaSummary();
  const validation = validateMediaSummaryContract(sample);
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nvidia-media-contract-"));
  const paths = writeValidationReport({ report: sample, validation }, reportRoot);

  const parsed = JSON.parse(fs.readFileSync(paths.jsonPath, "utf8"));
  const markdown = fs.readFileSync(paths.markdownPath, "utf8");
  assert.equal(parsed.validation.valid, true);
  assert.match(markdown, /NVIDIA Media Summary Write Contract/);
  assert.match(markdown, /Write allowed: `false`/);
});

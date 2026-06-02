import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildInventory,
  isIncludedLocalDoc,
  renderMarkdown,
  writeInventory,
} from "../scripts/export-dealership-memory-source-inventory.mjs";

function makeTempSourceRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dealership-memory-source-"));
  fs.mkdirSync(path.join(root, "docs", "generated"), { recursive: true });
  fs.mkdirSync(path.join(root, "motorinn-save-a-deal-automation", "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "motorinn-save-a-deal-automation", "schemas"), { recursive: true });
  fs.mkdirSync(path.join(root, ".firecrawl"), { recursive: true });
  fs.mkdirSync(path.join(root, "forensic-output"), { recursive: true });

  fs.writeFileSync(path.join(root, "README.md"), "# MotorInn docs\n");
  fs.writeFileSync(path.join(root, "docs", "dealervault-operations.md"), "Dealervault workflow and inventory notes.");
  fs.writeFileSync(path.join(root, "docs", "generated", "motorinn-daily-money-queue.json"), "{\"inventory\":true}");
  fs.writeFileSync(
    path.join(root, "motorinn-save-a-deal-automation", "docs", "save-a-deal-ingestion-contract.md"),
    "Save a deal workflow.",
  );
  fs.writeFileSync(
    path.join(root, "motorinn-save-a-deal-automation", "schemas", "save-a-deal-row.schema.json"),
    "{\"type\":\"object\"}",
  );
  fs.writeFileSync(path.join(root, ".firecrawl", "staff.json"), "{\"external\":true}");
  fs.writeFileSync(path.join(root, "forensic-output", "fraud-risk-report.md"), "forensic output");
  fs.writeFileSync(path.join(root, ".env"), "SECRET=1");
  return root;
}

test("path classifier includes curated local docs and excludes broad sources", () => {
  assert.equal(isIncludedLocalDoc("docs/dealervault-operations.md").included, true);
  assert.equal(isIncludedLocalDoc("docs/generated/motorinn-daily-money-queue.json").kind, "generated-local-report");
  assert.equal(isIncludedLocalDoc("motorinn-save-a-deal-automation/docs/save-a-deal-ingestion-contract.md").included, true);
  assert.equal(isIncludedLocalDoc(".firecrawl/staff.json").included, false);
  assert.equal(isIncludedLocalDoc("forensic-output/fraud-risk-report.md").included, false);
  assert.equal(isIncludedLocalDoc("docs/generated/compliance/twilio/customer-auth.txt").included, false);
  assert.equal(isIncludedLocalDoc("docs/generated/compliance/twilio/presigned-url.txt").included, false);
});

test("inventory lists included local docs and explicit excluded source policies", () => {
  const root = makeTempSourceRoot();
  const inventory = buildInventory({ sourceRoot: root, generatedAt: "2026-06-02T00:00:00.000Z" });

  assert.equal(inventory.contract_id, "dealership-memory-source-inventory");
  assert.equal(inventory.status, "pass");
  assert.ok(inventory.included_sources.length >= 5);
  assert.equal(inventory.boundaries.broad_google_drive_ingestion, false);
  assert.equal(inventory.boundaries.broad_email_ingestion, false);
  assert.equal(inventory.boundaries.broad_slack_ingestion, false);
  assert.equal(inventory.boundaries.broad_web_crawl_ingestion, false);
  assert.ok(inventory.excluded_sources.some((source) => source.source.includes("Google Drive")));
  assert.ok(inventory.included_sources.every((source) => source.citation_label.includes(source.relative_path)));
});

test("inventory writes JSON and Markdown reports for downstream eval", () => {
  const root = makeTempSourceRoot();
  const reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dealership-memory-report-"));
  const inventory = buildInventory({ sourceRoot: root, generatedAt: "2026-06-02T00:00:00.000Z" });
  const { jsonPath, markdownPath } = writeInventory(inventory, reportRoot);

  const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const markdown = fs.readFileSync(markdownPath, "utf8");
  assert.equal(parsed.included_sources.length, inventory.included_sources.length);
  assert.match(markdown, /Dealership Memory Source Inventory/);
  assert.match(renderMarkdown(inventory), /Cited Eval Support/);
});

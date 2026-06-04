#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONTRACT_ID = "motorinn.gbrain.nvidia-media-summary-write.v1";
const DEFAULT_REPORT_ROOT = "/Users/spencerheywood/nvidia-skills-upgrade/reports";
const REQUIRED_PII_CATEGORIES = ["names", "faces", "phones", "emails", "addresses", "plates"];
const REDACTION_STATUSES = new Set(["redacted", "none_detected", "needs_review"]);

const RAW_PII_PATTERNS = {
  emails: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  phones: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/,
  plates: /\b(?=[A-Z0-9\-\s]{4,9}\b)(?=[A-Z0-9\-\s]*[A-Z])(?=[A-Z0-9\-\s]*\d)[A-Z0-9]{2,4}[-\s]?[A-Z0-9]{2,4}\b/,
};

function parseArgs(argv) {
  const args = {
    reportRoot: DEFAULT_REPORT_ROOT,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.inputPath = argv[++index];
    } else if (arg === "--report-root" || arg === "--output-dir") {
      args.reportRoot = argv[++index];
    } else if (arg === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return "Usage: node scripts/validate-nvidia-media-summary-contract.mjs [--input PATH] [--report-root PATH]";
}

function textLeaves(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(textLeaves);
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !["source_uri", "source_path", "hash"].includes(key))
      .flatMap(([, child]) => textLeaves(child));
  }
  return [];
}

function hasRawPii(value) {
  const text = textLeaves(value)
    .join("\n")
    .replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?\b/g, "");
  return Object.entries(RAW_PII_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([category]) => category);
}

function categoryStatus(report, category) {
  return report?.pii_redaction?.categories?.[category]?.status;
}

function validateMediaSummaryContract(report) {
  const errors = [];
  const warnings = [];

  if (report.contract_id !== CONTRACT_ID) {
    errors.push(`contract_id must be ${CONTRACT_ID}`);
  }
  if (!report.source_media?.media_id) {
    errors.push("source_media.media_id is required");
  }
  if (!report.source_media?.media_type) {
    errors.push("source_media.media_type is required");
  }
  if (!report.nvidia_summary?.tool) {
    errors.push("nvidia_summary.tool is required");
  }
  if (!report.nvidia_summary?.full_summary) {
    errors.push("nvidia_summary.full_summary is required");
  }
  if (!report.gbrain_write?.target_slug?.startsWith("media/")) {
    errors.push("gbrain_write.target_slug must start with media/");
  }
  if (report.gbrain_write?.allowed_to_write !== false) {
    errors.push("gbrain_write.allowed_to_write must be false for this proof contract");
  }
  if (report.pii_redaction?.raw_pii_retained !== false) {
    errors.push("pii_redaction.raw_pii_retained must be false");
  }
  if (report.pii_redaction?.review_required !== true) {
    errors.push("pii_redaction.review_required must be true");
  }

  for (const category of REQUIRED_PII_CATEGORIES) {
    const status = categoryStatus(report, category);
    if (!status) {
      errors.push(`pii_redaction.categories.${category}.status is required`);
    } else if (!REDACTION_STATUSES.has(status)) {
      errors.push(`pii_redaction.categories.${category}.status must be one of ${Array.from(REDACTION_STATUSES).join(", ")}`);
    }
  }

  const rawPiiCategories = hasRawPii({
    summary: report.nvidia_summary,
    write: report.gbrain_write,
  });
  for (const category of rawPiiCategories) {
    errors.push(`raw ${category} pattern remains in summary/write fields`);
  }

  for (const category of REQUIRED_PII_CATEGORIES) {
    if (categoryStatus(report, category) === "needs_review") {
      warnings.push(`${category} still needs human review before any G-Brain write`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function buildSampleMediaSummary() {
  return {
    contract_id: CONTRACT_ID,
    source_media: {
      media_id: "motorinn-vss-sample-001",
      source_uri: "s3://redacted-media-bucket/sample.mp4",
      media_type: "video",
      captured_at: "2026-06-04T00:00:00.000Z",
      duration_seconds: 74,
      hash: "sha256:sample",
    },
    nvidia_summary: {
      tool: "nvidia-vss",
      endpoint_class: "hosted-or-local-proof",
      generated_at: "2026-06-04T00:00:00.000Z",
      full_summary:
        "A redacted dealership walkaround shows [PERSON_1] reviewing [VEHICLE_1] condition, missing media needs, and follow-up actions. No faces, phone numbers, emails, addresses, or plates are retained.",
      timeline_events: [
        {
          start_ms: 0,
          end_ms: 18000,
          summary: "[PERSON_1] introduces [VEHICLE_1] and notes the inspection objective.",
        },
        {
          start_ms: 18001,
          end_ms: 52000,
          summary: "The summary identifies visible merchandising gaps without retaining plate, face, or customer identifiers.",
        },
      ],
      detected_entities: [
        { type: "person", label_redacted: "[PERSON_1]", confidence: 0.82 },
        { type: "vehicle", label_redacted: "[VEHICLE_1]", confidence: 0.9 },
      ],
      safety_notes: ["Proof summary only; no write automation enabled."],
    },
    pii_redaction: {
      raw_pii_retained: false,
      review_required: true,
      categories: {
        names: { status: "redacted", replacements: [{ placeholder: "[PERSON_1]", reason: "person name" }] },
        faces: { status: "needs_review", face_count: 1, stored_face_embeddings: false },
        phones: { status: "none_detected", replacements: [] },
        emails: { status: "none_detected", replacements: [] },
        addresses: { status: "none_detected", replacements: [] },
        plates: { status: "redacted", replacements: [{ placeholder: "[PLATE_1]", reason: "license plate" }] },
      },
    },
    gbrain_write: {
      allowed_to_write: false,
      target_slug: "media/motorinn-vss-sample-001",
      page_type: "media",
      title: "Motor Inn VSS Sample 001",
      compiled_truth_markdown:
        "A redacted VSS summary is ready for human review before any G-Brain media page write.",
      timeline_append_markdown:
        "- 2026-06-04: NVIDIA VSS proof summary generated with PII redaction gate and write disabled.",
      citations: [{ label: "source_media", source_uri: "s3://redacted-media-bucket/sample.mp4" }],
    },
  };
}

function renderMarkdown({ report, validation }) {
  const lines = [
    "# NVIDIA Media Summary Write Contract",
    "",
    `- Contract: \`${report.contract_id}\``,
    `- Valid: \`${validation.valid}\``,
    `- Target slug: \`${report.gbrain_write?.target_slug ?? "missing"}\``,
    `- Write allowed: \`${report.gbrain_write?.allowed_to_write}\``,
    "",
    "## Required PII Categories",
    "",
  ];

  for (const category of REQUIRED_PII_CATEGORIES) {
    lines.push(`- ${category}: \`${categoryStatus(report, category) ?? "missing"}\``);
  }

  lines.push("", "## Validation", "");
  if (validation.errors.length) {
    for (const error of validation.errors) {
      lines.push(`- ERROR: ${error}`);
    }
  } else {
    lines.push("- No validation errors.");
  }
  for (const warning of validation.warnings) {
    lines.push(`- WARNING: ${warning}`);
  }

  lines.push(
    "",
    "## Boundary",
    "",
    "This contract is proof-only. It validates summary shape and redaction gates but does not write to G-Brain or enable live VSS automation.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function writeValidationReport({ report, validation }, reportRoot) {
  fs.mkdirSync(reportRoot, { recursive: true });
  const jsonPath = path.join(reportRoot, "nvidia-media-summary-write-contract.json");
  const markdownPath = path.join(reportRoot, "nvidia-media-summary-write-contract.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify({ report, validation }, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdown({ report, validation }));
  return { jsonPath, markdownPath };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const report = args.inputPath
    ? JSON.parse(fs.readFileSync(path.resolve(args.inputPath), "utf8"))
    : buildSampleMediaSummary();
  const validation = validateMediaSummaryContract(report);
  const paths = writeValidationReport({ report, validation }, path.resolve(args.reportRoot));
  console.log(JSON.stringify({ status: validation.valid ? "pass" : "fail", errors: validation.errors.length, warnings: validation.warnings.length, ...paths }, null, 2));
  return validation.valid ? 0 : 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}

export {
  CONTRACT_ID,
  REQUIRED_PII_CATEGORIES,
  buildSampleMediaSummary,
  hasRawPii,
  renderMarkdown,
  validateMediaSummaryContract,
  writeValidationReport,
};

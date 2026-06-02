#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_SOURCE_ROOT = "/Users/spencerheywood/Documents/New project";
const DEFAULT_REPORT_ROOT = "/Users/spencerheywood/nvidia-skills-upgrade/reports";
const CONTRACT_ID = "dealership-memory-source-inventory";
const INCLUDED_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv", ".tsv"]);
const EXCLUDED_DIRS = new Set([
  ".git",
  ".remote-dispatch",
  ".firecrawl",
  "node_modules",
  "output",
  "forensic-output",
  "launchd",
]);

const EXCLUDED_SOURCE_POLICIES = [
  {
    source: "Google Drive / Docs / Sheets / Slides",
    reason: "Excluded from this proof. Existing local docs are the first Dealership Memory source.",
  },
  {
    source: "Gmail / inbox / work email",
    reason: "Excluded from this proof to avoid broad personal or work-message ingestion.",
  },
  {
    source: "Slack history",
    reason: "Excluded from this proof. Slack remains coordination, not durable memory.",
  },
  {
    source: "Broad public web crawl and Firecrawl cache",
    reason: "Excluded from this proof; only curated local docs are indexed first.",
  },
  {
    source: "Secrets, env files, LaunchAgents, generated state, and forensic output",
    reason: "Excluded because they are credentials/runtime/transient artifacts, not dealership workflow memory docs.",
  },
];

function parseArgs(argv) {
  const args = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    reportRoot: DEFAULT_REPORT_ROOT,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source-root") {
      args.sourceRoot = argv[++index];
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
  return `Usage: node scripts/export-dealership-memory-source-inventory.mjs [--source-root PATH] [--report-root PATH]`;
}

function walkFiles(root) {
  const files = [];
  const excludedExamples = new Map();

  function noteExcluded(reason, filePath) {
    if (!excludedExamples.has(reason)) {
      excludedExamples.set(reason, []);
    }
    const examples = excludedExamples.get(reason);
    if (examples.length < 6) {
      examples.push(filePath);
    }
  }

  function visit(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      noteExcluded(`unreadable: ${error.message}`, current);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) {
          noteExcluded(`directory excluded: ${entry.name}`, fullPath);
          continue;
        }
        visit(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  visit(root);
  return { files, excludedExamples };
}

function isReadme(relativePath) {
  return path.basename(relativePath).toLowerCase() === "readme.md";
}

function isIncludedLocalDoc(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const extension = path.extname(normalized).toLowerCase();
  if (!INCLUDED_EXTENSIONS.has(extension)) {
    return { included: false, reason: `extension excluded: ${extension || "none"}` };
  }
  if (
    normalized.startsWith("docs/generated/compliance/") ||
    normalized.includes("presigned") ||
    normalized.includes("customer-auth") ||
    normalized.endsWith(".env") ||
    path.basename(normalized).startsWith(".env")
  ) {
    return { included: false, reason: "sensitive or compliance artifact excluded" };
  }
  if (normalized.startsWith("docs/")) {
    return { included: true, kind: normalized.startsWith("docs/generated/") ? "generated-local-report" : "local-doc" };
  }
  if (isReadme(normalized) && (normalized === "README.md" || normalized.startsWith("motorinn-"))) {
    return { included: true, kind: "project-readme" };
  }
  if (/^motorinn-[^/]+\/(docs|schemas|configs|fixtures)\//.test(normalized)) {
    return { included: true, kind: "motorinn-project-doc" };
  }
  if (normalized.startsWith("config/") && extension === ".json") {
    return { included: true, kind: "local-config-reference" };
  }
  if (normalized === "requirements-dealervault.txt") {
    return { included: true, kind: "dealervault-runtime-note" };
  }
  return { included: false, reason: "outside curated dealership doc paths" };
}

function classifyRelevance(relativePath, content) {
  const haystack = `${relativePath}\n${content.slice(0, 4000)}`.toLowerCase();
  const tags = [];
  for (const [tag, patterns] of [
    ["dealervault", ["dealervault", "dealer vault"]],
    ["inventory", ["inventory", "vauto", "vehicle", "vin"]],
    ["marketing", ["marketing", "meta", "facebook", "campaign", "content"]],
    ["messaging", ["twilio", "sms", "text", "message", "consent"]],
    ["service-to-sales", ["service", "appointment", "trade", "test drive"]],
    ["operations", ["daily money", "go live", "operator", "roadmap"]],
  ]) {
    if (patterns.some((pattern) => haystack.includes(pattern))) {
      tags.push(tag);
    }
  }
  return tags.length ? tags : ["general"];
}

function buildInventory({ sourceRoot, generatedAt }) {
  const resolvedRoot = path.resolve(sourceRoot);
  const { files, excludedExamples } = walkFiles(resolvedRoot);
  const includedSources = [];
  const excludedLocalSources = [];

  for (const filePath of files.sort()) {
    const relativePath = path.relative(resolvedRoot, filePath);
    const decision = isIncludedLocalDoc(relativePath);
    if (!decision.included) {
      if (excludedLocalSources.length < 100) {
        excludedLocalSources.push({
          path: filePath,
          relative_path: relativePath,
          reason: decision.reason,
        });
      }
      continue;
    }

    const content = fs.readFileSync(filePath);
    const textPreview = content.toString("utf8", 0, Math.min(content.length, 4096));
    const stat = fs.statSync(filePath);
    const sourceId = `local-doc-${String(includedSources.length + 1).padStart(3, "0")}`;
    includedSources.push({
      source_id: sourceId,
      path: filePath,
      relative_path: relativePath,
      kind: decision.kind,
      extension: path.extname(relativePath).toLowerCase(),
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      citation_label: `${sourceId}:${relativePath}`,
      relevance_tags: classifyRelevance(relativePath, textPreview),
    });
  }

  const excludedSources = [
    ...EXCLUDED_SOURCE_POLICIES,
    ...Array.from(excludedExamples.entries()).map(([reason, examples]) => ({
      source: reason,
      reason,
      examples,
    })),
  ];

  return {
    contract_id: CONTRACT_ID,
    generated_at: generatedAt,
    status: includedSources.length > 0 ? "pass" : "fail",
    source_root: resolvedRoot,
    included_sources: includedSources,
    excluded_sources: excludedSources,
    excluded_local_source_sample: excludedLocalSources,
    boundaries: {
      existing_local_docs_first: true,
      broad_google_drive_ingestion: false,
      broad_email_ingestion: false,
      broad_slack_ingestion: false,
      broad_web_crawl_ingestion: false,
      proof_only: true,
    },
    supports_next_issue: {
      linear_issue: "SPE-43",
      purpose: "20-question cited-answer eval for Dealership Memory",
      citation_field: "citation_label",
    },
    nvidia_concepts: [
      "rag-blueprint",
      "rag-eval",
      "nemo-retriever",
      "nemotron-retrieval-recipes",
    ],
  };
}

function renderMarkdown(inventory) {
  const lines = [
    "# Dealership Memory Source Inventory",
    "",
    `- Generated: \`${inventory.generated_at}\``,
    `- Status: \`${inventory.status}\``,
    `- Source root: \`${inventory.source_root}\``,
    `- Included local docs: \`${inventory.included_sources.length}\``,
    `- Excluded local sample: \`${inventory.excluded_local_source_sample.length}\``,
    "",
    "## Boundaries",
    "",
    "- Existing local docs are the first source.",
    "- No broad Google Drive, email, Slack, or web-crawl ingestion is included in this proof.",
    "- Secrets, LaunchAgents, generated state, and forensic output are excluded.",
    "",
    "## Included Sources",
    "",
    "| ID | Kind | Tags | Path |",
    "| --- | --- | --- | --- |",
  ];

  for (const source of inventory.included_sources) {
    lines.push(
      `| ${source.source_id} | ${source.kind} | ${source.relevance_tags.join(", ")} | \`${source.relative_path}\` |`,
    );
  }

  lines.push("", "## Excluded Sources", "");
  for (const source of inventory.excluded_sources) {
    lines.push(`- ${source.source}: ${source.reason}`);
  }

  lines.push("", "## Cited Eval Support", "");
  lines.push("Use `citation_label` from the JSON inventory as the stable citation handle for SPE-43.");
  return `${lines.join("\n")}\n`;
}

function writeInventory(inventory, reportRoot) {
  fs.mkdirSync(reportRoot, { recursive: true });
  const jsonPath = path.join(reportRoot, "dealership-memory-source-inventory.json");
  const markdownPath = path.join(reportRoot, "dealership-memory-source-inventory.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdown(inventory));
  return { jsonPath, markdownPath };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const generatedAt = new Date().toISOString();
  const inventory = buildInventory({ sourceRoot: args.sourceRoot, generatedAt });
  const { jsonPath, markdownPath } = writeInventory(inventory, path.resolve(args.reportRoot));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
  console.log(`Included ${inventory.included_sources.length} local docs`);
  return inventory.status === "pass" ? 0 : 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}

export {
  buildInventory,
  isIncludedLocalDoc,
  renderMarkdown,
  writeInventory,
};

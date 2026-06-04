#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_REPORT_ROOT = "/Users/spencerheywood/nvidia-skills-upgrade/reports";
const DEFAULT_MEMORY_EVAL = path.join(DEFAULT_REPORT_ROOT, "dealership-memory-eval.json");
const CONTRACT_ID = "motorinn.nvidia-it-synthetic-eval-prep.v1";

const ROLES = [
  {
    id: "mac",
    name: "Mac",
    focus: "Spark/local model infrastructure, failure triage, and rollout safety",
  },
  {
    id: "archie",
    name: "Archie",
    focus: "G-Brain RAG grounding, source contracts, and cited memory hygiene",
  },
  {
    id: "dev",
    name: "Dev",
    focus: "implementation review, test quality, and repo-level correctness",
  },
  {
    id: "eve",
    name: "Eve",
    focus: "evaluation QA, regression detection, and acceptance evidence",
  },
];

const TASK_TYPES = [
  {
    id: "pr_review",
    title: "PR review",
    objective: "Find behavioral risk, missing tests, and rollout hazards before merge.",
  },
  {
    id: "test_generation",
    title: "Test generation",
    objective: "Create focused tests from a workflow contract and cited source evidence.",
  },
  {
    id: "architecture_critique",
    title: "Architecture critique",
    objective: "Critique whether the proposed design keeps ownership, boundaries, and recovery paths clear.",
  },
  {
    id: "rag_grounding",
    title: "RAG grounding",
    objective: "Answer from local memory with citations and explicit missing-source notes.",
  },
];

const SECRET_PATTERNS = [
  /nvapi-[A-Za-z0-9_-]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /xapp-[A-Za-z0-9-]{10,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /(NVIDIA_API_KEY|SLACK_BOT_TOKEN|SLACK_APP_TOKEN)=\S+/g,
];

function parseArgs(argv) {
  const args = {
    memoryEvalPath: DEFAULT_MEMORY_EVAL,
    reportRoot: DEFAULT_REPORT_ROOT,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--memory-eval") {
      args.memoryEvalPath = argv[++index];
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
  return "Usage: node scripts/build-nvidia-it-synthetic-eval-prep.mjs [--memory-eval PATH] [--report-root PATH]";
}

function redactSecretLike(text) {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, "[REDACTED]"), text);
}

function compact(text, maxLength = 1100) {
  const normalized = redactSecretLike(String(text ?? "").replace(/\s+/g, " ").trim());
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3).trim()}...` : normalized;
}

function loadMemoryEval(memoryEvalPath) {
  const report = JSON.parse(fs.readFileSync(memoryEvalPath, "utf8"));
  if (!Array.isArray(report.questions) || report.questions.length < 20) {
    throw new Error("Memory eval report must contain at least 20 questions.");
  }
  return report;
}

function citationFromQuestion(question) {
  const citation = question.citations?.[0];
  if (!citation) {
    return {
      citation_label: "missing-citation",
      source_path: question.expected_source_path,
      question_id: question.id,
    };
  }
  return {
    citation_label: citation.citation_label,
    source_id: citation.source_id,
    source_path: citation.path,
    relative_path: citation.relative_path,
    question_id: question.id,
  };
}

function buildInstruction(role, taskType, question) {
  const base = `${role.name} owns ${role.focus}. ${taskType.title}: ${taskType.objective}`;
  if (taskType.id === "rag_grounding") {
    return `${base} Answer this dealership-memory question only from cited local context: ${question.question}`;
  }
  if (taskType.id === "pr_review") {
    return `${base} Review a proposed change that routes NVIDIA skill outputs into Hermes/G-Brain workflows. Focus on regressions, missing proof, and unsafe live activation.`;
  }
  if (taskType.id === "test_generation") {
    return `${base} Generate tests for a proof report contract that must parse cleanly and preserve citations.`;
  }
  return `${base} Critique whether a proposed agent workflow keeps human approval, citation grounding, and escalation ownership explicit.`;
}

function buildExpectedResponse(role, taskType, question) {
  const citationLabel = question.citations?.[0]?.citation_label ?? question.expected_source_path;
  if (taskType.id === "rag_grounding") {
    return compact(`Use the cited local source ${citationLabel}. Answer: ${question.answer} Include missing-source notes if citation evidence is absent.`);
  }
  if (taskType.id === "pr_review") {
    return compact(
      `Lead with findings. Require parsed JSON/Markdown proof, citation coverage, and explicit no-live-automation gates. Escalate infra failures to Mac, memory/source-contract issues to Archie, implementation defects to Dev, and eval gaps to Eve. Cite ${citationLabel} when referencing dealership workflow context.`,
    );
  }
  if (taskType.id === "test_generation") {
    return compact(
      `Create focused tests for contract shape, required fields, pass/fail scoring, citation presence, secret redaction, and no endpoint side effects. Use ${citationLabel} as the grounding citation for dealership context.`,
    );
  }
  return compact(
    `Call out unclear ownership, uncited claims, endpoint dependence, and any path from proof-only output into live automation. The acceptable design gives ${role.name} a bounded owner action and cites ${citationLabel}.`,
  );
}

function buildDatasetRows(memoryEval) {
  const rows = [];
  let questionIndex = 0;
  for (const role of ROLES) {
    for (const taskType of TASK_TYPES) {
      const question = memoryEval.questions[questionIndex % memoryEval.questions.length];
      questionIndex += 1;
      rows.push({
        id: `nvidia-it-${role.id}-${taskType.id}`,
        contract_id: CONTRACT_ID,
        dataset_kind: "synthetic_eval",
        agent_role: role.id,
        agent_name: role.name,
        task_type: taskType.id,
        task_title: taskType.title,
        instruction: buildInstruction(role, taskType, question),
        context: {
          role_focus: role.focus,
          dealership_memory_question_id: question.id,
          dealership_memory_question: question.question,
          dealership_memory_answer_excerpt: compact(question.answer, 700),
        },
        expected_response: buildExpectedResponse(role, taskType, question),
        citations: [citationFromQuestion(question)],
        acceptance_checks: [
          "answer cites local source evidence",
          "missing evidence is stated instead of invented",
          "no live automation or training job is enabled",
          "owner and escalation path are explicit",
        ],
        fine_tune_allowed: false,
        human_review_required: true,
      });
    }
  }
  return rows;
}

function buildPreferencePairs(rows) {
  return rows.map((row) => ({
    id: `${row.id}-preference`,
    contract_id: CONTRACT_ID,
    dataset_kind: "preference_pair",
    agent_role: row.agent_role,
    task_type: row.task_type,
    prompt: row.instruction,
    chosen: row.expected_response,
    rejected: "Proceed with the change and tune the model from this example without checking citations, tests, or live rollout impact.",
    preference_rationale:
      "Chosen response preserves citations, proof-only boundaries, owner routing, and human review. Rejected response skips grounding and implies blind fine-tuning.",
    fine_tune_allowed: false,
    human_review_required: true,
    citations: row.citations,
  }));
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    counts[item[field]] = (counts[item[field]] ?? 0) + 1;
    return counts;
  }, {});
}

function buildPrepReport({ memoryEvalPath, generatedAt }) {
  const memoryEval = loadMemoryEval(memoryEvalPath);
  const datasetRows = buildDatasetRows(memoryEval);
  const preferencePairs = buildPreferencePairs(datasetRows);
  return {
    contract_id: CONTRACT_ID,
    generated_at: generatedAt,
    status: datasetRows.length === 16 && preferencePairs.length === 16 ? "pass" : "fail",
    source_memory_eval: {
      path: memoryEvalPath,
      contract_id: memoryEval.contract_id,
      status: memoryEval.status,
      score: memoryEval.aggregate_score,
    },
    outputs: {
      synthetic_eval_rows: datasetRows.length,
      preference_pairs: preferencePairs.length,
      roles: countBy(datasetRows, "agent_role"),
      task_types: countBy(datasetRows, "task_type"),
    },
    fine_tune_gate: {
      blind_fine_tuning_allowed: false,
      training_job_created: false,
      required_before_training: [
        "human review of every row",
        "removal of private/customer-specific data",
        "offline eval pass against held-out tasks",
        "written approval for model and endpoint selection",
      ],
    },
    nvidia_concepts: [
      "nemo-data-designer",
      "rag-blueprint",
      "rag-eval",
      "nemo-retriever",
      "nemotron-retrieval-recipes",
      "fine-tuning-prep",
    ],
    datasetRows,
    preferencePairs,
  };
}

function toJsonl(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function renderMarkdown(report, paths) {
  const lines = [
    "# NVIDIA IT Synthetic Eval And Fine-Tune Prep",
    "",
    `- Generated: \`${report.generated_at}\``,
    `- Status: \`${report.status}\``,
    `- Source memory eval: \`${report.source_memory_eval.path}\``,
    `- Source score: \`${report.source_memory_eval.score?.passed}/${report.source_memory_eval.score?.total}\``,
    `- Synthetic eval rows: \`${report.outputs.synthetic_eval_rows}\``,
    `- Preference pairs: \`${report.outputs.preference_pairs}\``,
    "",
    "## Output Files",
    "",
    `- Dataset JSONL: \`${paths.datasetPath}\``,
    `- Preference pairs JSONL: \`${paths.preferencePath}\``,
    `- Prep JSON: \`${paths.reportPath}\``,
    "",
    "## Role Coverage",
    "",
  ];

  for (const role of ROLES) {
    lines.push(`- ${role.name}: ${role.focus}`);
  }

  lines.push(
    "",
    "## Fine-Tune Gate",
    "",
    "No blind fine-tuning is allowed from this packet. It is eval and preference-pair preparation only.",
    "",
  );

  for (const requirement of report.fine_tune_gate.required_before_training) {
    lines.push(`- ${requirement}`);
  }

  lines.push("", "## Dataset Rows", "");
  for (const row of report.datasetRows) {
    lines.push(`### ${row.id}`);
    lines.push("");
    lines.push(`- Role: \`${row.agent_name}\``);
    lines.push(`- Task: \`${row.task_type}\``);
    lines.push(`- Citation: \`${row.citations[0].citation_label}\``);
    lines.push(`- Human review required: \`${row.human_review_required}\``);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function writePrepReport(report, reportRoot) {
  fs.mkdirSync(reportRoot, { recursive: true });
  const datasetPath = path.join(reportRoot, "nvidia-it-synthetic-eval-dataset.jsonl");
  const preferencePath = path.join(reportRoot, "nvidia-it-preference-pairs.jsonl");
  const reportPath = path.join(reportRoot, "nvidia-it-finetune-prep.json");
  const markdownPath = path.join(reportRoot, "nvidia-it-finetune-prep.md");
  fs.writeFileSync(datasetPath, toJsonl(report.datasetRows));
  fs.writeFileSync(preferencePath, toJsonl(report.preferencePairs));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdown(report, { datasetPath, preferencePath, reportPath }));
  return { datasetPath, preferencePath, reportPath, markdownPath };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const report = buildPrepReport({
    memoryEvalPath: path.resolve(args.memoryEvalPath),
    generatedAt: new Date().toISOString(),
  });
  const paths = writePrepReport(report, path.resolve(args.reportRoot));
  console.log(JSON.stringify({ status: report.status, ...report.outputs, ...paths }, null, 2));
  return report.status === "pass" ? 0 : 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}

export {
  CONTRACT_ID,
  ROLES,
  TASK_TYPES,
  buildDatasetRows,
  buildPreferencePairs,
  buildPrepReport,
  compact,
  loadMemoryEval,
  redactSecretLike,
  renderMarkdown,
  writePrepReport,
};

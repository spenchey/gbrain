#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type SourceStatus = 'indexed' | 'excluded';

export type InventoryRecord = {
  status: SourceStatus;
  path: string;
  reason?: string;
  citation_id?: string;
  title?: string;
  file_type?: string;
  bytes?: number;
  modified_at?: string;
  heading_count?: number;
  has_frontmatter?: boolean;
  citation_ready?: boolean;
  citation_notes?: string[];
};

export type InventoryReport = {
  contract_version: 'motorinn.dealership-local-doc-source-inventory.v1';
  generated_at: string;
  roots: string[];
  indexed_count: number;
  excluded_count: number;
  citation_ready_count: number;
  records: InventoryRecord[];
  excluded_sources: InventoryRecord[];
  proof_only: true;
};

const DEFAULT_ROOTS = [
  '/Users/spencerheywood/gbrain',
  '/Users/spencerheywood/Documents/New project/docs',
  '/Users/spencerheywood/hermes-team-os/docs',
];

const ALLOWED_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.csv']);
const EXCLUDED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '__pycache__',
  'sessions',
  'logs',
  'state',
  'output',
  'auth',
]);

const SECRET_NAME_PATTERNS = [
  /\.env/i,
  /secret/i,
  /token/i,
  /credential/i,
  /auth\.json/i,
  /sessions?/i,
  /private[_-]?key/i,
];

const STRONG_DEALERSHIP_HINTS = [
  'motorinn',
  'motor inn',
  'dealership',
  'dealer',
  'inventory',
  'vehicle',
  'toyota',
  'vauto',
  'dealervault',
];

const WEAK_DEALERSHIP_HINTS = [
  'sales',
  'service',
  'customer follow-up',
  'offer language',
  'stale unit',
  'trade-in',
];

export function parseRoots(value: string | undefined): string[] {
  if (!value) return DEFAULT_ROOTS;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isSecretLike(filePath: string): boolean {
  const base = path.basename(filePath);
  return SECRET_NAME_PATTERNS.some((pattern) => pattern.test(base));
}

export function shouldExcludePath(filePath: string): string | null {
  const parts = filePath.split(path.sep);
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) return `excluded directory: ${part}`;
  }
  if (isSecretLike(filePath)) return 'secret-like filename';
  return null;
}

export function isDealershipRelevant(filePath: string, content: string): boolean {
  const haystack = `${filePath}\n${content.slice(0, 12000)}`.toLowerCase();
  if (STRONG_DEALERSHIP_HINTS.some((hint) => haystack.includes(hint))) return true;
  return WEAK_DEALERSHIP_HINTS.filter((hint) => haystack.includes(hint)).length >= 2;
}

export function titleFromContent(filePath: string, content: string): string {
  for (const line of content.split(/\r?\n/).slice(0, 80)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) return trimmed.replace(/^#\s+/, '').trim();
    const yamlTitle = trimmed.match(/^title:\s*["']?(.+?)["']?\s*$/i);
    if (yamlTitle) return yamlTitle[1].trim();
  }
  return path.basename(filePath);
}

export function citationId(root: string, filePath: string): string {
  const rel = path.relative(root, filePath) || path.basename(filePath);
  return rel
    .replaceAll(path.sep, '/')
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9/_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function citationNotes(record: Pick<InventoryRecord, 'title' | 'heading_count' | 'bytes' | 'file_type'>): string[] {
  const notes: string[] = [];
  if (!record.title) notes.push('missing title');
  if ((record.heading_count ?? 0) === 0 && record.file_type !== '.json' && record.file_type !== '.csv') notes.push('no markdown headings');
  if ((record.bytes ?? 0) < 80) notes.push('very small file');
  return notes;
}

async function walk(root: string, current: string, records: InventoryRecord[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    records.push({ status: 'excluded', path: current, reason: `unreadable: ${error instanceof Error ? error.message : String(error)}` });
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const exclusion = shouldExcludePath(fullPath);
    if (exclusion) {
      records.push({ status: 'excluded', path: fullPath, reason: exclusion });
      continue;
    }
    if (entry.isDirectory()) {
      await walk(root, fullPath, records);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      records.push({ status: 'excluded', path: fullPath, reason: `unsupported extension: ${ext || 'none'}` });
      continue;
    }
    const st = await stat(fullPath);
    let content = '';
    try {
      content = await readFile(fullPath, 'utf8');
    } catch (error) {
      records.push({ status: 'excluded', path: fullPath, reason: `unreadable: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (!isDealershipRelevant(fullPath, content)) {
      records.push({ status: 'excluded', path: fullPath, reason: 'no dealership relevance signal' });
      continue;
    }
    const title = titleFromContent(fullPath, content);
    const heading_count = (content.match(/^#{1,6}\s+/gm) ?? []).length;
    const base: InventoryRecord = {
      status: 'indexed',
      path: fullPath,
      citation_id: citationId(root, fullPath),
      title,
      file_type: ext,
      bytes: st.size,
      modified_at: st.mtime.toISOString(),
      heading_count,
      has_frontmatter: content.trimStart().startsWith('---'),
    };
    const notes = citationNotes(base);
    records.push({
      ...base,
      citation_ready: notes.length === 0,
      citation_notes: notes,
    });
  }
}

export async function buildInventory(roots: string[], generatedAt = new Date().toISOString()): Promise<InventoryReport> {
  const records: InventoryRecord[] = [];
  const existingRoots = roots.filter((root) => existsSync(root));
  for (const root of roots) {
    if (!existsSync(root)) {
      records.push({ status: 'excluded', path: root, reason: 'root missing' });
      continue;
    }
    await walk(root, root, records);
  }
  const indexed = records.filter((record) => record.status === 'indexed');
  const excluded = records.filter((record) => record.status === 'excluded');
  return {
    contract_version: 'motorinn.dealership-local-doc-source-inventory.v1',
    generated_at: generatedAt,
    roots: existingRoots,
    indexed_count: indexed.length,
    excluded_count: excluded.length,
    citation_ready_count: indexed.filter((record) => record.citation_ready).length,
    records: indexed,
    excluded_sources: excluded,
    proof_only: true,
  };
}

export function markdownFor(report: InventoryReport): string {
  const lines = [
    '# Dealership Local-Doc Source Inventory',
    '',
    `- Generated: \`${report.generated_at}\``,
    `- Indexed sources: \`${report.indexed_count}\``,
    `- Excluded sources: \`${report.excluded_count}\``,
    `- Citation-ready sources: \`${report.citation_ready_count}\``,
    `- Proof only: \`${String(report.proof_only)}\``,
    '',
    '## Roots',
    '',
    ...report.roots.map((root) => `- \`${root}\``),
    '',
    '## Indexed Sources',
    '',
    '| Citation ID | Title | Type | Citation Ready | Path |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const record of report.records) {
    lines.push(`| \`${record.citation_id}\` | ${record.title} | \`${record.file_type}\` | ${record.citation_ready ? 'yes' : 'no'} | \`${record.path}\` |`);
  }
  lines.push('', '## Excluded Sources', '');
  for (const record of report.excluded_sources.slice(0, 200)) {
    lines.push(`- \`${record.path}\`: ${record.reason}`);
  }
  if (report.excluded_sources.length > 200) {
    lines.push(`- ... ${report.excluded_sources.length - 200} more excluded sources omitted from Markdown; see JSON.`);
  }
  lines.push('', '## Boundary', '', 'Metadata-only proof. No document contents, secrets, or embeddings are written into this report.', '');
  return lines.join('\n');
}

export async function writeReport(report: InventoryReport, outputJson: string, outputMd: string): Promise<void> {
  await mkdir(path.dirname(outputJson), { recursive: true });
  await mkdir(path.dirname(outputMd), { recursive: true });
  await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(outputMd, markdownFor(report));
}

async function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--roots');
  const outputJsonIndex = args.indexOf('--output-json');
  const outputMdIndex = args.indexOf('--output-md');
  const roots = parseRoots(rootIndex >= 0 ? args[rootIndex + 1] : process.env.DEALERSHIP_DOC_ROOTS);
  const outputJson = outputJsonIndex >= 0 ? args[outputJsonIndex + 1] : '/Users/spencerheywood/nvidia-skills-upgrade/reports/dealership-memory-source-inventory.json';
  const outputMd = outputMdIndex >= 0 ? args[outputMdIndex + 1] : '/Users/spencerheywood/nvidia-skills-upgrade/reports/dealership-memory-source-inventory.md';
  const report = await buildInventory(roots);
  await writeReport(report, outputJson, outputMd);
  console.log(JSON.stringify({ status: 'ok', indexed: report.indexed_count, excluded: report.excluded_count, outputJson, outputMd }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'bun:test';

import {
  buildInventory,
  citationId,
  isSecretLike,
  markdownFor,
  shouldExcludePath,
  writeReport,
} from '../scripts/export-motorinn-dealership-source-inventory.ts';

describe('Motor Inn dealership source inventory', () => {
  test('indexes dealership docs and excludes secret-like files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docs-fixture-'));
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(
      join(root, 'docs', 'inventory-policy.md'),
      '# Inventory Policy\n\nMotor Inn Toyota inventory follow-up rules for dealership sales queues, source citations, and customer-safe workflow handoffs.\n',
    );
    await writeFile(join(root, 'docs', 'random.md'), '# Garden Notes\n\nTomatoes and basil.\n');
    await writeFile(join(root, '.env'), `${'NVIDIA_API'}_KEY=not-real\n`);

    const report = await buildInventory([root], '2026-06-04T00:00:00.000Z');

    expect(report.contract_version).toBe('motorinn.dealership-local-doc-source-inventory.v1');
    expect(report.indexed_count).toBe(1);
    expect(report.records[0].citation_id).toBe('docs/inventory-policy');
    expect(report.records[0].citation_ready).toBe(true);
    expect(report.excluded_sources.some((record) => record.path.endsWith('random.md') && record.reason === 'no dealership relevance signal')).toBe(true);
    expect(report.excluded_sources.some((record) => record.path.endsWith('.env') && record.reason === 'secret-like filename')).toBe(true);
  });

  test('citation helpers are stable and defensive', () => {
    expect(citationId('/repo', '/repo/docs/Motor Inn Sales Plan.md')).toBe('docs/motor-inn-sales-plan');
    expect(isSecretLike('/repo/.env')).toBe(true);
    expect(isSecretLike('/repo/token-notes.md')).toBe(true);
    expect(shouldExcludePath('/repo/node_modules/pkg/index.md')).toBe('excluded directory: node_modules');
  });

  test('writes metadata-only JSON and Markdown reports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docs-fixture-'));
    const output = await mkdtemp(join(tmpdir(), 'motorinn-source-output-'));
    await writeFile(join(root, 'service.md'), '# Service Lane\n\nDealership service and Toyota customer workflow.\n');

    const report = await buildInventory([root], '2026-06-04T00:00:00.000Z');
    const outputJson = join(output, 'inventory.json');
    const outputMd = join(output, 'inventory.md');
    await writeReport(report, outputJson, outputMd);

    const json = JSON.parse(await readFile(outputJson, 'utf8'));
    const markdown = await readFile(outputMd, 'utf8');
    expect(json.records[0].path).toEndWith('service.md');
    expect(markdown).toContain('Metadata-only proof');
    expect(markdownFor(report)).not.toContain('Toyota customer workflow');
  });
});

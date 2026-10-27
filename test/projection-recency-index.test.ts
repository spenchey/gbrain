import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { v278, PAGE_PROJECTION_RECENCY_INDEX } from '../src/core/schema-migrations/v278-page-projection-recency-index.ts';

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
}, 120_000);

afterAll(async () => { await engine?.disconnect(); });

async function indexState() {
  const [row] = await engine.executeRaw<{ valid: boolean; definition: string }>(
    `SELECT x.indisvalid AS valid, i.indexdef AS definition
       FROM pg_indexes i JOIN pg_index x ON x.indexrelid = to_regclass(i.indexname)
      WHERE i.tablename = 'page_projection_jobs' AND i.indexname = $1`,
    [PAGE_PROJECTION_RECENCY_INDEX.name],
  );
  return row;
}

test('fresh and upgraded brains index projection recency without changing jobs', async () => {
  expect(await indexState()).toMatchObject({ valid: true });
  expect((await indexState())!.definition).toContain('(updated_at DESC)');

  await engine.executeRaw('DROP INDEX idx_page_projection_jobs_updated_at_desc');
  expect(await indexState()).toBeUndefined();
  await v278.handler!(engine);
  expect(await indexState()).toMatchObject({ valid: true });
});

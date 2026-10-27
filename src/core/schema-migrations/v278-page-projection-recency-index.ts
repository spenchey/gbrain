import type { Migration } from './types.ts';
import { buildIndexOnline, migrationNotice } from './helpers.ts';

// The resident and idle probe read the newest queue rows and max(updated_at)
// on every tick. Without this index, both scan the entire activation backlog.
export const PAGE_PROJECTION_RECENCY_INDEX = {
  name: 'idx_page_projection_jobs_updated_at_desc',
  table: 'page_projection_jobs',
  sql: 'CREATE INDEX IF NOT EXISTS idx_page_projection_jobs_updated_at_desc ON page_projection_jobs (updated_at DESC)',
} as const;

export const v278: Migration = {
  version: 278,
  name: 'page_projection_recency_index',
  idempotent: true,
  transaction: false,
  sql: '',
  handler: async engine => {
    await buildIndexOnline(engine, 278, PAGE_PROJECTION_RECENCY_INDEX, { notice: migrationNotice });
  },
};

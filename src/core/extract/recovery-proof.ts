import type { BrainEngine } from '../engine.ts';

export interface HaltBucket { kind: string; source_id: string; day: string; halt_count: number | string }
export interface HaltSnapshot {
  version: 1; kind: string; source_id: string; captured_at: string;
  counts: Record<string, number>;
}

export async function captureHaltSnapshot(engine: BrainEngine, kind: string, sourceId: string): Promise<HaltSnapshot> {
  const rows = await engine.executeRaw<{ day: string; halt_count: number | string }>(
    `SELECT day::text, halt_count FROM extract_rollup_7d
      WHERE kind = $1 AND source_id = $2 AND day >= CURRENT_DATE - 7`, [kind, sourceId],
  );
  return { version: 1, kind, source_id: sourceId, captured_at: new Date().toISOString(),
    counts: Object.fromEntries(rows.map(r => [r.day, Number(r.halt_count)])) };
}

// Day/source counters, not the rollup's last-update timestamp, distinguish
// an old repaired failure from a new halt after a successful receipt.
export function hasNoNewHalts(snapshot: unknown, kind: string, sourceId: string, buckets: HaltBucket[]): boolean {
  const s = snapshot as HaltSnapshot | null;
  if (!s || s.version !== 1 || s.kind !== kind || s.source_id !== sourceId || !s.counts ||
      !Number.isFinite(Date.parse(s.captured_at))) return false;
  for (const b of buckets.filter(b => b.kind === kind && b.source_id === sourceId)) {
    const now = Number(b.halt_count), before = s.counts[b.day] ?? 0;
    if (!Number.isInteger(now) || now < 0 || !Number.isInteger(before) || before < 0 || now > before) return false;
  }
  return true;
}

export function kindRecovered(kind: string, receipts: Array<{source_id: string; snapshot: unknown}>, buckets: HaltBucket[]): boolean {
  const sources = [...new Set(buckets.filter(b => b.kind === kind && Number(b.halt_count) > 0).map(b => b.source_id))];
  return sources.length > 0 && sources.every(source => {
    const receipt = receipts.find(r => r.source_id === source);
    return !!receipt && hasNoNewHalts(receipt.snapshot, kind, source, buckets);
  });
}

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { doctorSource } from './helpers/doctor-source.ts';

describe('doctor current supervisor epoch', () => {
  test('resolved incidents before the latest successful start do not poison current health', () => {
    const source = doctorSource();
    expect(source).toContain("events.filter(e => e.event === 'started').pop()?.ts ?? null");
    expect(source).toMatch(
      /const currentRunEvents = lastStart\s*\n\s*\? events\.filter\(e => e\.ts >= lastStart\)\s*\n\s*: events/,
    );
    expect(source).toContain('summarizeCrashes(currentRunEvents)');
    expect(source).toContain("currentRunEvents.filter(e => e.event === 'max_crashes_exceeded')");
  });
});

describe('doctor accepted oversized pages', () => {
  test('embed_skip is the explicit acceptance state for non-embeddable pages', () => {
    const source = doctorSource();
    expect(source).toContain('EMBED_SKIP_FILTER_FRAGMENT');
    const filterSource = readFileSync(new URL('../src/core/embed-skip.ts', import.meta.url), 'utf8');
    expect(filterSource).toContain(
      "NOT (COALESCE(p.frontmatter, '{}'::jsonb) ? '${EMBED_SKIP_KEY}')",
    );
  });
});

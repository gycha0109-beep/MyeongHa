import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const migration = readFileSync(
  join(
    repositoryRoot,
    'supabase',
    'migrations',
    '1302_records_official_reading_archive_openable_state.sql',
  ),
  'utf8',
);

function sqlBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('Official Reading archive openable-state authority', () => {
  it('narrows only the archive detail authority to delivered states', () => {
    const detail = sqlBlock(
      migration,
      'create or replace function public.qry_official_reading_record_runtime_v1',
      'comment on function public.qry_official_reading_record_runtime_v1',
    );

    expect(detail).toContain(
      "rr.product_response_state in ('delivered', 'delivered_with_fallback')",
    );
    expect(detail).toContain("r.execution_status = 'succeeded'");
    expect(migration).not.toContain(
      'create or replace function public.qry_reading_history_v2',
    );
  });
});

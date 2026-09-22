import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const purchaseSelectionPath = new URL(
  '../apps/api/src/standard-reading-purchase-intent-create-command-v4.ts',
  import.meta.url,
);
const officialReaderAuthorityPath = new URL(
  '../supabase/migrations/1220_official_standard_reading_reader_interpretation_authority.sql',
  import.meta.url,
);
const recordsHandoffPath = new URL(
  '../apps/web/reading-history-handoff.js',
  import.meta.url,
);

function sqlBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('persisted Reading Reader re-entry selection authority gap', () => {
  it('keeps purchase-time eligibility dependent on an already-selected Reader candidate', async () => {
    const source = await readFile(purchaseSelectionPath, 'utf8');

    expect(source).toContain('readonly readerCharacterId: string;');
    expect(source).toContain('resolveEligibleReaderSelection(input: {');
    expect(source).toContain('readonly productId: string;');
    expect(source).toContain('readonly readerCharacterId: string;');
    expect(source).toContain('readerCharacterId: request.readerCharacterId');
  });

  it('preserves multi-Reader Official Reading provenance instead of implying one automatic Reader', async () => {
    const migration = await readFile(officialReaderAuthorityPath, 'utf8');
    const interpretations = sqlBlock(
      migration,
      'create table public.standard_reading_reader_interpretations',
      'comment on table public.standard_reading_reader_interpretations',
    );
    const access = sqlBlock(
      migration,
      'create table public.standard_reading_reader_access_grants',
      'comment on table public.standard_reading_reader_access_grants',
    );

    expect(interpretations).toContain(
      'primary key (official_reading_id, reader_character_id)',
    );
    expect(access).toContain('official_reading_id uuid not null');
    expect(access).toContain('reader_character_id text not null');
    expect(access).not.toContain('is_primary_reader');
    expect(access).not.toContain('is_last_reader');
  });

  it('keeps Records re-entry free of Reader and thread candidates', async () => {
    const handoff = await readFile(recordsHandoffPath, 'utf8');

    expect(handoff).toContain('readingId');
    expect(handoff).toContain('readingSessionId');
    expect(handoff).toContain('sajuDomain');
    expect(handoff).not.toContain('readerCharacterId');
    expect(handoff).not.toContain('threadId');
  });
});

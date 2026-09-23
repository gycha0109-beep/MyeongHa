import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const runtimeSource = readFileSync(
  join(repositoryRoot, 'apps', 'api', 'src', 'reading-history-http.ts'),
  'utf8',
);
const authorityMigration = readFileSync(
  join(
    repositoryRoot,
    'supabase',
    'migrations',
    '1301_records_official_reading_archive_runtime_authority.sql',
  ),
  'utf8',
);

describe('Reading History v2 runtime authority binding', () => {
  it('keeps the v0.10 HTTP projection on the DB authority that owns Reader provenance', () => {
    expect(runtimeSource).toContain("readAuthority: 'public.qry_reading_history_v2'");
    expect(runtimeSource).toContain('reader_character_ids as "readerCharacterIds"');
    expect(runtimeSource).toContain('from public.qry_reading_history_v2($1::uuid)');
    expect(runtimeSource).not.toContain('from public.qry_reading_history_v1($1::uuid)');

    expect(authorityMigration).toContain(
      'create or replace function public.qry_reading_history_v2(p_subject_id uuid)',
    );
    expect(authorityMigration).toContain('reader_character_ids text[]');
  });
});

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
    '1305_bounded_collection_read_runtime_authority.sql',
  ),
  'utf8',
);

describe('Reading History v3 bounded runtime authority binding', () => {
  it('keeps the v0.11 HTTP projection on the bounded DB authority that owns Reader provenance', () => {
    expect(runtimeSource).toContain("readAuthority: 'public.qry_reading_history_v3'");
    expect(runtimeSource).toContain('reader_character_ids as "readerCharacterIds"');
    expect(runtimeSource).toContain('from public.qry_reading_history_v3($1::uuid, $2::timestamptz, $3::timestamptz, $4::uuid, $5::integer)');
    expect(runtimeSource).not.toContain('from public.qry_reading_history_v2($1::uuid)');

    expect(authorityMigration).toContain(
      'create or replace function public.qry_reading_history_v3(',
    );
    expect(authorityMigration).toContain('reader_character_ids text[]');
    expect(authorityMigration).toContain('limit (p_page_size + 1)');
    expect(authorityMigration).toContain('p_page_size is null or p_page_size < 1 or p_page_size > 50');
  });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readingHistoryMigrationPath = new URL(
  '../supabase/migrations/0984_records_reading_history_runtime_authority.sql',
  import.meta.url,
);
const officialReadingMigrationPath = new URL(
  '../supabase/migrations/1220_official_standard_reading_reader_interpretation_authority.sql',
  import.meta.url,
);
const readerRuntimePath = new URL(
  '../apps/api/src/character-standard-reading-server-runtime-authority.ts',
  import.meta.url,
);
const chatOpenPath = new URL('../apps/api/src/chat-open-http.ts', import.meta.url);
const immutableCharacterAuthoringPath = new URL(
  '../packages/character-content/src/immutable-authoring-v1.ts',
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

describe('persisted Reading → Reader Scene entry authority boundary', () => {
  it('keeps Records Reading History free of Reader and Chat thread authority', async () => {
    const migration = await readFile(readingHistoryMigrationPath, 'utf8');
    const projection = sqlBlock(
      migration,
      'create or replace function public.qry_reading_history_v1',
      'revoke all on function public.qry_reading_history_v1',
    );

    expect(projection).toContain('reading_id uuid');
    expect(projection).toContain('reading_session_id uuid');
    expect(projection).not.toContain('thread_id');
    expect(projection).not.toContain('reader_character_id');
  });

  it('keeps the Official Reading Reader-independent and permits distinct Reader interpretations', async () => {
    const migration = await readFile(officialReadingMigrationPath, 'utf8');
    const officialBinding = sqlBlock(
      migration,
      'create table public.standard_reading_official_bindings',
      'comment on table public.standard_reading_official_bindings',
    );
    const interpretations = sqlBlock(
      migration,
      'create table public.standard_reading_reader_interpretations',
      'comment on table public.standard_reading_reader_interpretations',
    );

    expect(officialBinding).toContain('reading_id uuid primary key');
    expect(officialBinding).not.toContain('thread_id');
    expect(officialBinding).not.toContain('reader_character_id');
    expect(interpretations).toContain(
      'primary key (official_reading_id, reader_character_id)',
    );
  });

  it('derives Reader identity from the owner-authorized single-Character thread', async () => {
    const runtime = await readFile(readerRuntimePath, 'utf8');

    expect(runtime).toContain(
      'if (initialThreadBinding.participantCharacterIds.length !== 1)',
    );
    expect(runtime).toContain(
      'const readerCharacterId = initialThreadBinding.participantCharacterIds[0]',
    );
    expect(runtime).not.toContain('presentationReaderHint');
    expect(runtime).not.toContain('readerCatalog');
  });

  it('keeps approved canonical Character ids separate from Records Reader selection authority', async () => {
    const [chatOpen, immutableAuthoring, handoff] = await Promise.all([
      readFile(chatOpenPath, 'utf8'),
      readFile(immutableCharacterAuthoringPath, 'utf8'),
      readFile(recordsHandoffPath, 'utf8'),
    ]);

    expect(chatOpen).toContain("requestAuthority: 'canonical-character-id-only:v1'");
    expect(immutableAuthoring).toContain(
      'CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS',
    );
    for (const characterId of [
      'seyeon',
      'yeoul',
      'seorin',
      'rahyeon',
      'mira',
      'taegyeom',
      'yunho',
      'doyun',
      'baekheon',
    ]) {
      expect(immutableAuthoring).toContain(`  '${characterId}',`);
    }
    expect(immutableAuthoring).not.toContain("  'doyoon',");
    expect(handoff).toContain(
      "PERSISTED_READING_HANDOFF_SOURCE_V1 = 'records'",
    );
    expect(handoff).toContain('source: PERSISTED_READING_HANDOFF_SOURCE_V1');
    expect(handoff).toContain('readingId');
    expect(handoff).toContain('readingSessionId');
    expect(handoff).toContain('sajuDomain');
    expect(handoff).not.toContain('readerCharacterId');
    expect(handoff).not.toContain('threadId');
  });
});

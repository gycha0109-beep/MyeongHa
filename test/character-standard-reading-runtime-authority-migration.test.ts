import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../supabase/migrations/1240_character_standard_reading_knowledge_runtime_authority.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Character Standard Reading Production runtime authority migration', () => {
  it('grants only the transaction-bound runtime wrappers to the API executor', () => {
    expect(sql).toContain(
      'security definer',
    );
    expect(sql).toContain(
      'perform public.assert_myeongha_subject_context_v1(p_subject_id);',
    );
    expect(sql).toContain(
      'grant execute on function public.qry_character_standard_reading_access_runtime_v1',
    );
    expect(sql).toContain(
      'grant execute on function public.qry_standard_reading_artifact_source_runtime_v1',
    );
    expect(sql).toContain(
      'revoke all on function public.internal_qry_character_standard_reading_access_v1',
    );
    expect(sql).toContain(
      'revoke all on function public.internal_qry_standard_reading_artifact_source_v2',
    );
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.internal_qry_/iu,
    );
  });
});

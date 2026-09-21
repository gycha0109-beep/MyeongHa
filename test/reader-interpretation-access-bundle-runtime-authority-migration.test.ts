import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../supabase/migrations/1250_reader_interpretation_access_bundle_runtime_authority.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Reader Interpretation bundle-aware Production runtime authority migration', () => {
  it('keeps the bundle-aware source INTERNAL and grants only the transaction-bound runtime v2 wrapper', () => {
    expect(sql).toContain(
      'create or replace function public.internal_qry_character_standard_reading_access_v2',
    );
    expect(sql).toContain(
      'reader_content_bundle_id uuid',
    );
    expect(sql).toContain(
      'create or replace function public.qry_character_standard_reading_access_runtime_v2',
    );
    expect(sql).toContain(
      'security definer',
    );
    expect(sql).toContain(
      'perform public.assert_myeongha_subject_context_v1(p_subject_id);',
    );
    expect(sql).toContain(
      'grant execute on function public.qry_character_standard_reading_access_runtime_v2',
    );
    expect(sql).toContain(
      'revoke all on function public.internal_qry_character_standard_reading_access_v2',
    );
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.internal_qry_character_standard_reading_access_v2/iu,
    );
  });

  it('derives bundle provenance from the exact Reader access grant and active purchase entitlement', () => {
    expect(sql).toContain('public.standard_reading_reader_access_grants a');
    expect(sql).toContain('a.reader_content_bundle_id');
    expect(sql).toContain('a.reader_character_id = p_reader_character_id');
    expect(sql).toContain('public.entitlement_grants g');
    expect(sql).toContain("g.grant_source_type = 'purchase'");
    expect(sql).toContain("g.status = 'active'");
    expect(sql).toContain('g.valid_from <= p_effective_at');
  });
});

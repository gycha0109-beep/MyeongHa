import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/1735_records_official_reading_purchase_grant_reread.sql'),
  'utf8',
);
const fixture = readFileSync(
  join(process.cwd(), 'test/db/official_standard_reading_reader_interpretation.sql'),
  'utf8',
);

describe('Paid Records archive current-Grant authority', () => {
  it('preserves the owner-scoped server-only official Reading query without opening paid rights', () => {
    expect(migration).toContain('create or replace function public.qry_official_reading_record_runtime_v1');
    expect(migration).toContain('perform public.assert_myeongha_subject_context_v1(p_subject_id);');
    expect(migration).toContain("rr.product_response_state in ('delivered', 'delivered_with_fallback')");
    expect(migration).toContain('r.subject_id = p_subject_id');
    expect(migration).toContain('select 1 from public.standard_reading_official_bindings o');
    expect(migration).toContain('select 1 from public.standard_reading_unit_bindings b');
    expect(migration).toContain('internal_qry_standard_reading_artifact_source_v2(');
    expect(migration).toContain('internal_qry_standard_reading_artifact_source_v1(');
    // A migrated v2 official artifact must never be opened through an old
    // v1 unit grant when the last v2 Reader purchase was revoked.
    expect(migration).toMatch(
      /or \(\s*-- Once a Reading has a Reader-independent official binding,[\s\S]*?not exists \(\s*select 1 from public\.standard_reading_official_bindings official\s*where official\.reading_id = r\.id\s*\)\s*and exists \(\s*select 1\s*from public\.standard_reading_unit_bindings b/u,
    );
    expect(migration).toContain('paid.response_hash = rr.response_hash');
  });

  it('guards report-era Birth provenance behind the exact owner/paid Reading authority', () => {
    expect(migration).toContain('create or replace function public.qry_official_reading_birth_revision_status_v1(');
    expect(migration).toContain('perform public.assert_myeongha_subject_context_v1(p_subject_id);');
    expect(migration).toContain('select 1 from public.qry_official_reading_record_runtime_v1(');
    expect(migration).toContain('rs.source_birth_revision_id');
    expect(migration).toContain("bp.profile_kind = 'self'");
    expect(migration).toContain('bp.archived_at is null');
    expect(migration).toContain('when issued.id = active.id then \'current\'::text');
    expect(migration).toContain("else 'changed'::text");
    expect(migration).toContain("then 'unknown'::text");
    expect(migration).toContain('revoke all on function public.qry_official_reading_birth_revision_status_v1(uuid,uuid)');
    expect(migration).toContain('grant execute on function public.qry_official_reading_birth_revision_status_v1(uuid,uuid)');
    expect(migration).toContain("to myeongha_api_executor;");
  });

  it('retains executor-only access and tests final revoke, B2-active and independent-reader behavior', () => {
    expect(migration).toContain('revoke all on function public.qry_official_reading_record_runtime_v1');
    expect(migration).toContain('to myeongha_api_executor;');
    expect(migration).toContain("'anon'");
    expect(migration).toContain("'authenticated'");
    expect(fixture).toContain('Records paid archive denies a fully revoked official Reading');
    expect(fixture).toContain('Records rereads the same immutable official Reading with B2 exact active grant');
    expect(fixture).toContain('Records paid archive becomes inaccessible after last active Grant revoke');
  });
});

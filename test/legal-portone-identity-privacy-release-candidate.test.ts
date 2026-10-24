import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const load = (path: string): string =>
  readFileSync(new URL(path, root), 'utf8');

describe('LEGAL PortOne identity privacy migration candidate', () => {
  it('adds only two DELETE proposals without altering the approved 59-table privacy policy', () => {
    const approved = JSON.parse(load('docs/operations/ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json')) as {
      graphRef: { distinctReachableTableCount: number; fingerprintSha256: string };
      tableDispositions: Array<{ table: string; disposition: string }>;
    };
    const delta = JSON.parse(load('docs/operations/PORTONE_IDENTITY_PRIVACY_DISPOSITION_DELTA_CANDIDATE_V1.json')) as {
      executionAuthorized: boolean;
      existingApprovedGraphFingerprintSha256: string;
      additionalSubjectOwnedTables: Array<{ table: string; disposition: string }>;
    };
    expect(delta.executionAuthorized).toBe(false);
    expect(approved.graphRef.distinctReachableTableCount).toBe(59);
    expect(delta.existingApprovedGraphFingerprintSha256).toBe(approved.graphRef.fingerprintSha256);
    expect(delta.additionalSubjectOwnedTables.map(x => [x.table, x.disposition])).toEqual([
      ['legal_portone_identity_attempts_v1', 'DELETE'],
      ['legal_portone_verified_age_v1', 'DELETE'],
    ]);
    expect(approved.tableDispositions.filter(x => x.disposition === 'RETAIN')).toHaveLength(9);
    for (const entry of delta.additionalSubjectOwnedTables) {
      expect(approved.tableDispositions.some(x => x.table === entry.table)).toBe(false);
    }
  });

  it('keeps the staged SQL synced, access-restricted and out of automatic migrations', () => {
    const proposal = load('supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql');
    const candidate = load('supabase/release-candidates/1740_portone_identity_age_authority_v1.sql');
    expect(candidate.slice(candidate.indexOf('-- Legal L2 / PortOne V2:')))
      .toBe(proposal);
    expect(candidate).toContain('alter table public.legal_portone_verified_age_v1 enable row level security');
    expect(candidate).toContain('legal_portone_purge_on_subject_state_change_v1');
    expect(candidate).toContain('delete from public.legal_portone_verified_age_v1');
    expect(candidate).toContain('assert_myeongha_subject_context_v1');
    expect(existsSync(new URL('supabase/migrations/1740_portone_identity_age_authority_v1.sql', root))).toBe(false);
  });
});

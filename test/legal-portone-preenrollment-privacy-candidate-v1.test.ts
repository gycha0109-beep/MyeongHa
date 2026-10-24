import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read(
  'docs/operations/PORTONE_PREENROLLMENT_PRIVACY_DISPOSITION_CANDIDATE_V1.json',
)) as Record<string, any>;

describe('L2 A1 Privacy HOLD on subjectless identity proof', () => {
  it('does not silently change approved account-deletion policy', () => {
    expect(manifest.status).toBe('PROPOSED_NOT_APPLIED');
    expect(manifest.executionAuthorized).toBe(false);
    expect(manifest.operatingMode).toBe('OFF');
    expect(manifest.existingApprovedReachableTables).toBe(59);
    expect(manifest.existingApprovedDispositionCounts).toEqual({
      DELETE: 46, ANONYMIZE: 4, RETAIN: 9,
    });
    expect(manifest.existingApprovedGraphFingerprintSha256).toBe(
      'c745bacb0e9b2d13013c1048fc4273203af68b9c4816eef7b6c9fe37e4db167b',
    );
    expect(manifest.notSubjectOwnedTables).toHaveLength(1);
    expect(manifest.notSubjectOwnedTables[0]).toMatchObject({
      table: 'legal_portone_preenrollment_v1', disposition: 'DELETE',
      containsRawIdentityResult: false,
      containsRawBirthDate: false,
      containsIdentityNumbers: false,
      rawCookiePersisted: false,
      expiryDuration: 'PT10M',
      expiryPurgeMaxBatch: 250,
      expiryPurgeScheduled: false,
    });
    expect(manifest.backupHandling).toBe('P30D_EXISTING_CYCLE_UNCHANGED');
    expect(manifest.commerceEvidenceRetention).toBe('P5Y_EXISTING_CLASSES_UNCHANGED');
  });

  it('keeps proposed SQL byte-exact in a separately unactivated release package', () => {
    const proposal = read('supabase/proposals/1741_portone_preenrollment_age_authority_v1.proposed.sql');
    const release = read('supabase/release-candidates/1741_portone_preenrollment_age_authority_v1.sql');
    expect(release.slice(release.indexOf('-- Legal L2 A1:'))).toBe(proposal);
    expect(proposal).toContain('create table public.legal_portone_preenrollment_v1');
    expect(proposal).toContain('enable row level security');
    expect(proposal).toContain('public.cmd_create_verified_guest_session_v1');
    expect(proposal).toContain('public.cmd_bind_verified_member_preenrollment_v1');
    expect(proposal).toContain('for update skip locked');
    expect(proposal).toContain('public.internal_purge_legal_portone_preenrollment_v1');
    // A previously malformed string substitution duplicated SQL tails and
    // broke the PG17 shell regex. Enforce well-formed source-level invariants.
    expect(proposal.split('commit;')).toHaveLength(2);
    expect(proposal).not.toContain('commit;\\n then');
    expect(proposal).toContain("p_binding_digest !~ '^[a-f0-9]{64}$'");
    expect(proposal).toContain('public.qry_verified_legal_portone_preenrollment_v1');
    expect(proposal).toContain('public.cmd_bind_verified_member_preenrollment_v1');
    const pgSmoke = read('test/db/portone_identity_age_authority_pg17.sh');
    expect(pgSmoke).toContain("grep -E '^[tf]$'");
    expect(pgSmoke).toContain('guest_create "$binding_c"');
    expect(pgSmoke).toContain('bind_member "$member_d"');
    expect(read('supabase/release-candidates/1740_portone_identity_age_authority_v1.sql'))
      .toContain("check (verification_id ~ '^iv[a-f0-9]{32}$')");
  });
});

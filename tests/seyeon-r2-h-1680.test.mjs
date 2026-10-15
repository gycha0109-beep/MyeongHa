// Static fail-closed contract. Real DB tests live in disposable PG17 CI case.
// Watchtower-Track: ops
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gitBlobSha} from '../scripts/operations/verify-seyeon-r2-pending-migrations.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(resolve(root,path),'utf8');
const original=read('supabase/migrations/1680_seyeon_governed_guest_expiry_admission_guard_v1.sql');
const harness=read('test/db/seyeon_r2_h_1680_forward.sh');
const run=read('test/db/run_ci_case.sh');

describe('R2-H 1680 isolated guest expiry guard proof',()=>{
  it('retains immutable source, internally committed SQL and held prerequisites',()=>{
    expect(gitBlobSha(Buffer.from(original))).toBe('d1b63f472b620b3250153d59dfeab079c6585e23');
    expect(original).toMatch(/^begin;$/m);
    expect(original).toMatch(/^commit;$/m);
    const inv=JSON.parse(read('scripts/operations/seyeon-r2-pending-migration-inventory.json'));
    expect(inv.migrations.find(row=>row.version==='1680')).toMatchObject({
      requires:['1650','1670'],approval:'HOLD_OWNER_REVIEW',
    });
  });
  it('gates replay on CI-owned disposable PG17 and exact original source',()=>{
    expect(harness).toContain('GITHUB_ACTIONS');
    expect(harness).toContain('NOT_DISPOSABLE');
    expect(harness).toContain('SOURCE_1680_DRIFT');
    expect(harness).toContain('-f supabase/migrations/1680_seyeon_governed_guest_expiry_admission_guard_v1.sql');
    expect(harness).not.toContain('normalized_1680');
    expect(run).toContain('seyeon-r2-h-1680-forward)');
    const suites=JSON.parse(read('scripts/ci/db-suites.json'));
    expect(suites.postgres17.cases).toContain('seyeon-r2-h-1680-forward');
    expect(read('scripts/ci/run-db-track.mjs')).toContain('PASS_R2_H_1680_DISPOSABLE_DATABASE_DESTROYED');
  });
  it('tests OID/owner/ACL, valid guest/member, expired proof and lock order',()=>{
    for(const marker of [
      'SOURCE_COMMIT_OWNER_ACL_PRESERVED',
      'VALID_GUEST_GUARD','MEMBER_PATH','MISSING_GUEST_SESSION',
      'CROSS_SUBJECT_SESSION','EXPIRED_AFTER_RESOLUTION',
      'PROMOTION_NOT_LOCKED','PROMOTED_PROOF',
      'fundedAdmissionE2E=false','OWNER_APPROVAL_REQUIRED',
    ]) expect(harness).toContain(marker);
  });
});
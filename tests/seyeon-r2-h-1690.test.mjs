// R2-H 1690 static fail-closed contract; executable behavior in disposable PG17.
// Watchtower-Track: ops
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitBlobSha } from '../scripts/operations/verify-seyeon-r2-pending-migrations.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFileSync(resolve(root,path),'utf8');
const original = read('supabase/migrations/1690_seyeon_detached_cost_settlement_worker_v1.sql');
const harness = read('test/db/seyeon_r2_h_1690_forward.sh');
const dispatcher = read('test/db/run_ci_case.sh');

describe('R2-H 1690 exact COMMIT only in disposable PG17',()=>{
  it('pins immutable 1690 and the mandatory 1630 role dependency, Owner HOLD',()=>{
    expect(gitBlobSha(Buffer.from(original))).toBe('79026a10855fbafaf2e4465e0a382e37ce1a16cd');
    expect(original).toMatch(/^begin;$/m);
    expect(original).toMatch(/^commit;$/m);
    const manifest=JSON.parse(read('scripts/operations/seyeon-r2-pending-migration-inventory.json'));
    expect(manifest.migrations.find(row=>row.version==='1690')).toMatchObject({
      requires:['1590','1610','1630'],
      approval:'HOLD_OWNER_REVIEW',
    });
  });
  it('requires original SQL, service-local CI case and exact PG17, not outer rollback',()=>{
    for(const marker of ['GITHUB_ACTIONS','NOT_DISPOSABLE','PG_VERSION',
      'SOURCE_1590','SOURCE_1610','SOURCE_1630','SOURCE_1690',
      '-f supabase/migrations/1690_seyeon_detached_cost_settlement_worker_v1.sql']) {
      expect(harness).toContain(marker);
    }
    expect(harness).not.toMatch(/normalized_1690|transaction\.sql/u);
    expect(dispatcher).toContain('PASS_R2_H_1690_1630_ROLE_DEPENDENCY_CONFIRMED');
    expect(dispatcher).toContain('seyeon-r2-h-1690-forward)');
    expect(JSON.parse(read('scripts/ci/db-suites.json')).postgres17.cases).toContain('seyeon-r2-h-1690-forward');
    expect(read('scripts/ci/run-db-track.mjs')).toContain('seyeon-r2-h-1690-forward');
    expect(read('scripts/ci/run-db-track.mjs')).toContain('DISPOSABLE_DATABASE_DESTROYED');
  });
  it('checks role authority, transient grants, unreserved call, duplicate replay and HOLD',()=>{
    for(const marker of [
      'ORIGINAL_FORWARD_COMMIT_ROLE_ACL_OWNER','TRANSIENT_ROLE_MEMBERSHIP_REMAINED',
      'TRANSIENT_SCHEMA_CREATE_REMAINED','UNBOUNDED_WORKER_EXECUTE',
      'INVALID_INPUT', 'UNRESERVED_CALL', 'GOVERNED_DIRECT',
      'REPLAY_FAIL_CLOSED','OWNER_APPROVAL_REQUIRED','actualSettlementE2E=false',
    ])expect(harness).toContain(marker);
  });
});
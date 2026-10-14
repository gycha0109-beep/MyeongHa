// Static fail-closed preflight; real behavior belongs to the disposable PG17 case.
// Watchtower-Track: ops
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gitBlobSha} from '../scripts/operations/verify-seyeon-r2-pending-migrations.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(resolve(root,path),'utf8');
const sql=read('supabase/migrations/1670_seyeon_governed_guest_context_lock_v1.sql');
const test=read('test/db/seyeon_r2_h_1670_forward.sh');

describe('R2-H 1670 real forward replay CI-only barrier',()=>{
  it('pins the original source, transaction controls and 1630 role prerequisite',()=>{
    expect(gitBlobSha(Buffer.from(sql))).toBe('90bae4dd44811c07d81be8028c40da0cbb211891');
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    const inv=JSON.parse(read('scripts/operations/seyeon-r2-pending-migration-inventory.json'));
    expect(inv.migrations.find(x=>x.version==='1670')).toMatchObject({
      requires:['1630'],approval:'HOLD_OWNER_REVIEW',
    });
  });
  it('requires an exact CI-owned database and does not normalize or wrap SQL',()=>{
    expect(test).toContain('GITHUB_ACTIONS');
    expect(test).toContain('myeongha_ci_case_[0-9]+');
    expect(test).toContain('NOT_DISPOSABLE_DB');
    expect(test).toContain('90bae4dd44811c07d81be8028c40da0cbb211891');
    expect(test).toContain('-f supabase/migrations/1670_seyeon_governed_guest_context_lock_v1.sql');
    expect(test).not.toMatch(/normalized_1670|ROLLBACK.*-f supabase\/migrations\/1670/u);
  });
  it('runs two races, stale denial and fails closed on source re-apply',()=>{
    expect(test).toContain('PROMOTION_NOT_BLOCKED_BY_GUEST_SHARE');
    expect(test).toContain('GUEST_NOT_BLOCKED_BY_PROMOTION');
    expect(test).toContain('STALE_GUEST_AFTER_PROMOTION_ALLOWED');
    expect(test).toContain('UNEXPECTED_REPLAY_SUCCESS');
    expect(test).toContain('OWNER_APPROVAL_REQUIRED');
  });
  it('inherits the existing automatic create-drop lifecycle, no extra workflow',()=>{
    const runner=read('scripts/ci/run-db-track.mjs');
    const suites=JSON.parse(read('scripts/ci/db-suites.json'));
    expect(suites.postgres17.cases).toContain('seyeon-r2-h-1670-forward');
    expect(runner).toContain("execFileSync('createdb', [database]");
    expect(runner).toContain("execFileSync('dropdb', ['--if-exists', database]");
    expect(runner).toContain('PASS_R2_H_1670_DISPOSABLE_DATABASE_DESTROYED');
  });
});

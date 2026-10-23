// R2-H 1700 immutable original with explicit NULL-gap HOLD.
// Real database checks execute only inside a disposable PG17 CI case.
// Watchtower-Track: ops
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gitBlobSha} from '../scripts/operations/verify-seyeon-r2-pending-migrations.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(resolve(root,path),'utf8');
const sql=read('supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql');
const harness=read('test/db/seyeon_r2_h_1700_forward.sh');
const synthetic=read('test/db/seyeon_r2_h_1700_synthetic.sql');
describe('R2-H 1700 original Governor receipt pin isolation',()=>{
  it('retains exact source and required Governor table dependency as Owner HOLD',()=>{
    expect(gitBlobSha(Buffer.from(sql))).toBe('fb8803f8cdb3b6cfb76dd8e1faa2cc8dcdcf043f');
    expect(sql).not.toMatch(/^begin;$/im);
    expect(sql).not.toMatch(/^commit;$/im);
    const inv=JSON.parse(read('scripts/operations/seyeon-r2-pending-migration-inventory.json'));
    expect(inv.migrations.find(m=>m.version==='1700')).toMatchObject({
      requires:['1550','1580'],approval:'HOLD_OWNER_REVIEW',
    });
    expect(sql).toContain('seyeon_ai_governor_model_policies_v1');
  });
  it('enforces disposable PG17, authentic rollback then atomic original forward',()=>{
    for(const marker of ['GITHUB_ACTIONS','NOT_DISPOSABLE','SOURCE_1700_DRIFT',
      'ORIGINAL_ROLLBACK','ROLLBACK_CATALOG_DRIFT',
      '-1 -v ON_ERROR_STOP=1 -f supabase/migrations/1700_seyeon_governed_reservation_receipt_pin_v1.sql',
      'FORWARD_CATALOG_INVOKER_ACL','DISPOSABLE_SOURCE_VERIFIED']) {
       expect(harness).toContain(marker);
    }
    expect(read('test/db/run_ci_case.sh')).toContain('seyeon-r2-h-1700-forward)');
    expect(JSON.parse(read('scripts/ci/db-suites.json')).postgres17.cases)
      .toContain('seyeon-r2-h-1700-forward');
    const runner=read('scripts/ci/run-db-track.mjs');
    expect(runner).toContain('seyeon-r2-h-1700-forward');
    expect(runner).toContain('DISPOSABLE_DATABASE_DESTROYED');
  });
  it('tests pin success, denial and observable SQL-NULL CHECK gap without claiming remediation',()=>{
    for(const marker of ['SYNTHETIC_CORRECT_RATE_PIN','SYNTHETIC_MUTATION_BAD_RATE_UNGOVERNED_DENY',
      'HOLD_R2_H_1700_SQL_NULL_RECEIPT_SHAPE_GAP_REPRODUCED',
      'insert into synthetic_1700_shape',
      'current_date,clock_timestamp(),null,500000,4000000']) expect(synthetic).toContain(marker);
    expect(harness).toContain('sqlNullShapeGap=true');
    expect(harness).toContain('fundedAdmissionE2E=false');
    expect(sql).toContain('before update on public.seyeon_ai_call_cost_events');
  });
});
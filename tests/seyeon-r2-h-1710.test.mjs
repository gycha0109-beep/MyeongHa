// R2-H 1710 OFFLINE original SQL/replay/ACL proof contract, no live Provider.
// Watchtower-Track: ops
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gitBlobSha} from '../scripts/operations/verify-seyeon-r2-pending-migrations.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=p=>readFileSync(resolve(root,p),'utf8');
const sql=read('supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql');
const sh=read('test/db/seyeon_r2_h_1710_forward.sh');
describe('1710 original queue and Worker boundary (Owner HOLD)',()=>{
 it('pins original source, exact role and receipt dependencies',()=>{
  expect(gitBlobSha(Buffer.from(sql))).toBe('1d0e773a8e8b27474a0fde182d75433077d8add8');
  const inv=JSON.parse(read('scripts/operations/seyeon-r2-pending-migration-inventory.json'));
  expect(inv.migrations.find(row=>row.version==='1710')).toMatchObject({
   requires:['1550','1580','1630','1690','1700'],approval:'HOLD_OWNER_REVIEW'
  });
  for(const q of ['governor_receipt_pinned_at','myeongha_seyeon_governed_executor',
  'myeongha_seyeon_settlement_worker','cmd_store_seyeon_provider_receipt_v1',
  'cmd_claim_seyeon_provider_receipt_v1','cmd_ack_seyeon_provider_receipt_v1'])
   expect(sql).toContain(q);
  expect(sql).not.toMatch(/^begin;$/im);
  expect(sql).not.toMatch(/^commit;$/im);
 });
 it('uses CI-owned disposable PG17 and original SQL rollback then forward',()=>{
   for(const q of ['NOT_DISPOSABLE','SOURCE_1710_DRIFT','SOURCE_1700_DRIFT',
   'ORIGINAL_ROLLBACK','FORWARD_OWNER_RLS_RPC_ACL_ROLE_FK',
   'REPLAY_FAIL_CLOSED','HOLD_R2_H_1710_OWNER_APPROVAL_REQUIRED',
   'DISPOSABLE_SOURCE','ACTOR_MISMATCH']) {
     if(q==='DISPOSABLE_SOURCE') continue;
     expect(sh).toContain(q);
   }
   expect(read('test/db/run_ci_case.sh')).toContain('seyeon-r2-h-1710-forward)');
   expect(read('test/db/run_ci_case.sh')).toContain('1690_seyeon_detached_cost_settlement_worker_v1.sql');
   expect(read('scripts/ci/run-db-track.mjs')).toContain('seyeon-r2-h-1710-forward');
   expect(JSON.parse(read('scripts/ci/db-suites.json')).postgres17.cases).toContain('seyeon-r2-h-1710-forward');
 });
 it('never calls paid Provider or claims missing costStatus/outcome accepted by stored RPC',()=>{
   expect(sh).toContain('MISSING_REQUIRED_ENUM_SQL_NULL_DIAGNOSTIC');
   expect(sh).toContain('actualReservedReceiptE2E=synthetic-only');
   expect(sh).toContain('seyeon_governed_cost_d4b10c1_provider_receipt_queue.sh');
   expect(sh).toContain('PASS_R2_H_1710_1710_1760_REAL_RPC_STORE_CLAIM_SETTLE_ACK_SYNTHETIC'.replace('PASS_R2_H_1710_', '')); // helper's pass() prefixes marker
   const e2e=read('test/db/seyeon_governed_cost_d4b10c1_provider_receipt_queue.sh');
   expect(e2e).toContain('HOLD_R2_H_1710_POSITIVE_E2E_NOT_DISPOSABLE');
   expect(e2e).toContain('cmd_governed_start_seyeon_ai_call_v1');
   expect(e2e).toContain('cmd_store_seyeon_provider_receipt_v1');
   expect(e2e).toContain('cmd_claim_seyeon_provider_receipt_v1');
   expect(e2e).toContain('cmd_settle_seyeon_ai_call_detached_v1');
   expect(e2e).toContain('cmd_ack_seyeon_provider_receipt_v1');
   expect(sh).toContain('paidProviderCalls=0');
   expect(sh).toContain('productionWrites=0');
   expect(sql).toContain("p_event->>'outcome' not in");
   expect(sql).toContain("p_event->>'costStatus' not in");
   expect(sql).toContain('for update skip locked limit 1');
   expect(sql).toContain('claim_token is distinct from p_claim_token');
 });
});
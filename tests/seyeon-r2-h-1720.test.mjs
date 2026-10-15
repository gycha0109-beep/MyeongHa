// R2-H 1720 original D-01 Reader Product bridge is Owner HOLD.
// Watchtower-Track: ops
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gitBlobSha} from '../scripts/operations/verify-seyeon-r2-pending-migrations.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=p=>readFileSync(resolve(root,p),'utf8');
const sql=read('supabase/migrations/1720_standard_reader_product_scope_read_v1.sql');
const sh=read('test/db/seyeon_r2_h_1720_forward.sh');
describe('R2-H 1720 D-01 original scope bridge (Owner HOLD)',()=>{
 it('pins original source, read-only shape and source-dependency baseline',()=>{
  expect(gitBlobSha(Buffer.from(sql))).toBe('659df0d5a039d6617de20407ea129aab95fe1201');
  expect(JSON.parse(read('scripts/operations/seyeon-r2-pending-migration-inventory.json'))
    .migrations.find(x=>x.version==='1720')).toMatchObject({requires:[],approval:'HOLD_OWNER_REVIEW'});
  for(const fragment of ['standard_reading_product_specs', 'join public.products product',
    "spec.reader_selection_mode = 'required'", "spec.purchase_unit_mode = 'topic_reader_reading'",
    'myeongha_api_executor','security definer',"pg_catalog.has_function_privilege(\n      'public',"])
    expect(sql).toContain(fragment);
  expect(sql).not.toMatch(/^commit;$/im);
 });
 it('executes original only in disposable PG17 and verifies aborted DDL rollback',()=>{
  for(const fragment of ['NOT_DISPOSABLE','SOURCE_BLOB_DRIFT','NO_LITERAL_PUBLIC_ROLE',
    'ORIGINAL_FORWARD_ABORTED_ON_PUBLIC_PSEUDOROLE','FAILURE_ROLLS_BACK_FUNCTION_AND_ACL',
    'ORIGINAL_PUBLIC_PRIVILEGE_CHECK_BLOCKS_APPLY','drReady=false'])expect(sh).toContain(fragment);
  expect(read('test/db/run_ci_case.sh')).toContain('seyeon-r2-h-1720-forward)');
  expect(read('scripts/ci/run-db-track.mjs')).toContain('seyeon-r2-h-1720-forward');
  expect(JSON.parse(read('scripts/ci/db-suites.json')).postgres17.cases).toContain('seyeon-r2-h-1720-forward');
 });
});
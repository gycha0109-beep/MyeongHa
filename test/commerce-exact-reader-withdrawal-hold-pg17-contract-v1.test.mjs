import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {COMMERCE_EXACT_READER_SOURCE_SNAPSHOT_SQL_V1 as privateSourceSql}
 from '../scripts/operations/commerce-exact-reader-source-not-delivery-v1.mjs';
import {
 COMMERCE_EXACT_READER_PURCHASED_UNIT_SQL_V1 as sourceSql,
 COMMERCE_EXACT_READER_NOTICE_RELATION_PROBE_SQL_V1 as noticeProbeSql,
} from '../scripts/operations/commerce-exact-reader-withdrawal-evidence-hold-v1.mjs';
const matrix=JSON.parse(readFileSync('scripts/ci/db-suites.json','utf8'));
const runner=readFileSync('test/db/run_ci_case.sh','utf8');
const wrapper=readFileSync('test/db/commerce_exact_reader_withdrawal_hold_pg17.sh','utf8');
const generator=readFileSync('test/db/commerce_exact_reader_withdrawal_hold_pg17_generator.mjs','utf8');
const generated=execFileSync(process.execPath,[
 'test/db/commerce_exact_reader_withdrawal_hold_pg17_generator.mjs',
],{encoding:'utf8'});
describe('P4 exact Reader withdrawal evidence PG17 independent fixture contract',()=>{
 it('uses exact operational SQL source instead of copying an alternate query',()=>{
  expect(generator).toContain('COMMERCE_EXACT_READER_PURCHASED_UNIT_SQL_V1');
  expect(generated).toContain(sourceSql);
  expect(generated).toContain(privateSourceSql);
  expect(generated).toContain('execute source_q into strict source_row using');
  expect(generated).toContain('EXACT_READER_PRIVATE_SOURCE_B2_NOT_BOUND_TO_PAID_UNIT');
  expect(generated).toContain('EXACT_READER_PRIVATE_SOURCE_B3_BUNDLE_MISMATCH');
  expect(generated).toContain('EXACT_READER_PRIVATE_SOURCE_CROSS_PURCHASE_ACCEPTED');
  expect(generated).toContain('EXACT_READER_PRIVATE_SOURCE_CROSS_SUBJECT_ACCEPTED');
  expect(privateSourceSql).toContain('paid.entitlement_grant_id=$4::uuid');
  expect(privateSourceSql).toContain('paid.purchase_intent_id=$5::uuid');
  expect(privateSourceSql).toContain('paid.reader_content_bundle_id=$6::uuid');
  expect(generated).toContain(noticeProbeSql);
  expect(sourceSql).not.toContain(
   'digital_reading_checkout_notice_presentations_v1');
  expect(generated).toContain('execute notice_q into strict notice_state');
  expect(generated).toContain('OFFICIAL_READER_STAGED_NOTICE_UNEXPECTEDLY_INSTALLED');
  expect(sourceSql).toContain('join public.entitlement_grants egrant');
  expect(sourceSql).not.toMatch(/\\bjoin\\s+public\\.entitlement_grants\\s+grant\\b/iu);
  expect(generated).toContain('execute q into strict one using');
  expect(generated).toContain('COMMERCE_EXACT_READER_LEGAL_EVIDENCE_HOLD_PG17_PASS');
 });
 it('disambiguates the B3 Subject variable from the SQL table column',()=>{
  expect(generator).toContain('v_subject_id uuid;');
  expect(generator).toContain('into strict b2,b2_receipt,v_subject_id');
  expect(generated).toContain(
   'where a.entitlement_grant_id=b3 and a.subject_id=v_subject_id;');
  expect(generated).not.toMatch(/\ba\.subject_id\s*=\s*subject_id\b/iu);
  expect(generator).not.toMatch(/^\s*subject_id\s+uuid\s*;/mu);
 });
 it('proves B2 verified paid Reader lineage, denies B3 and wrong Receipt/Event',()=>{
  expect(generator).toContain('commerce_stored_portone_hmac_lineage_pg17_generator.mjs');
  expect(wrapper).toContain('commerce_stored_portone_hmac_lineage_pg17_generator.mjs --fixture');
  expect(generated).toContain('OFFICIAL_READER_CROSS_PURCHASE_GRANT_ACCEPTED');
  expect(generated).toContain('OFFICIAL_READER_WRONG_RECEIPT_ACCEPTED');
  expect(generated).toContain('OFFICIAL_READER_WRONG_PROVIDER_EVENT_ACCEPTED');
  expect(generated).toContain('one."readerContentBundleId" is null');
  expect(generated).toContain('OFFICIAL_READER_LEGAL_HOLD_MUTATED_GRANT');
 });
 it('is only in PostgreSQL 17 isolated CI case database',()=>{
  expect(matrix.postgres17.postgres).toBe(17);
  expect(matrix.postgres17.cases).toContain('commerce-exact-reader-withdrawal-hold-pg17');
  expect(matrix['commerce-payment'].cases).not.toContain('commerce-exact-reader-withdrawal-hold-pg17');
  expect(runner).toContain('commerce-exact-reader-withdrawal-hold-pg17)');
  expect(runner).toContain('HOLD_EXACT_READER_WITHDRAWAL_NOT_ISOLATED_PG17');
  expect(runner).toContain('apply_pg17_migrations_without_birth_authority');
  expect(wrapper).toContain('^myeongha_ci_case_[0-9]+$');
  expect(wrapper).toContain('^17[0-9]{4}$');
 });
 it('rolls back every synthetic change and never authorizes delivery or entitlement effects',()=>{
  expect(generated).toContain('begin;');
  expect(generated.trimEnd().endsWith('rollback;')).toBe(true);
  expect(generated).not.toMatch(/\bcommit\s*;/iu);
  expect(generated).not.toContain('internal_apply_entitlement_effect_v1(');
  expect(generated).not.toContain('https://api.portone.io');
 });
});

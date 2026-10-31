import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {
 COMMERCE_STORED_PORTONE_CANCEL_HMAC_SOURCE_SQL_V1 as liveQuery,
} from '../scripts/operations/commerce-stored-portone-cancellation-hmac-recheck-v1.mjs';

const generator='test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs';
const wrapper=readFileSync('test/db/commerce_stored_portone_hmac_lineage_pg17.sh','utf8');
const matrix=JSON.parse(readFileSync('scripts/ci/db-suites.json','utf8'));
const dispatch=readFileSync('test/db/run_ci_case.sh','utf8');
const generated=execFileSync(process.execPath,[generator],{encoding:'utf8'});
describe('P4 stored PortOne source-v2 -> exact Reader/Receipt full PostgreSQL17 database proof',()=>{
 it('uses the exact production-candidate query, no duplicated SQL copy',()=>{
  expect(generated).toContain(liveQuery);
  expect(generated).toContain('execute q into strict data_row using event_id,b2_grant');
  expect(generated).toContain('execute q into wrong_row using event_id,b3_grant');
  expect(generated).toContain('get diagnostics matched_rows = row_count');
 });
 it('is exclusively in a real PostgreSQL17 disposable CI case',()=>{
  expect(matrix.postgres17.postgres).toBe(17);
  expect(matrix.postgres17.cases).toContain('commerce-stored-portone-hmac-lineage-pg17');
  expect(dispatch).toContain('commerce-stored-portone-hmac-lineage-pg17)');
  expect(dispatch).toContain('HOLD_COMMERCE_HMAC_LINEAGE_NOT_ISOLATED_PG17');
  expect(dispatch).toContain('apply_pg17_migrations_without_birth_authority');
  expect(wrapper).toContain('^myeongha_ci_case_[0-9]+$');
  expect(wrapper).toContain('^17[0-9]{4}$');
 });
 it('reuses the real official two Reader purchase and Entitlement Grant DB fixture',()=>{
  expect(wrapper).toContain('official_standard_reading_reader_interpretation.sql');
  expect(generated).toContain("'12192300-0000-0000-0000-000000000002'");
  expect(generated).toContain("'12192300-0000-0000-0000-000000000003'");
  expect(generated).toContain('public.entitlement_grants');
  expect(generated).toContain('public.standard_reading_reader_access_grants');
  expect(generated).toContain('public.commerce_receipts');
  expect(generated).toContain('public.commerce_payment_attempts');
 });
 it('shows verified exact cancellation Event source cannot be rebound to B3 or unknown Event',()=>{
  expect(generated).toContain('SYNTHETIC_CROSS_READER_STORED_HMAC_SOURCE_ACCEPTED');
  expect(generated).toContain('SYNTHETIC_UNVERIFIED_EVENT_WAS_RESOLVED');
  expect(generated).toContain('SYNTHETIC_B2_STORED_PORTONE_SOURCE_NOT_BOUND_TO_EXACT_READER');
  expect(generated).toContain('COMMERCE_STORED_PORTONE_HMAC_LINEAGE_REAL_PG17_PASS');
 });
 it('never persists test-only Grant mutations or enables operational refund',()=>{
  expect(generated).toContain('begin;');
  expect(generated.trimEnd().endsWith('rollback;')).toBe(true);
  expect(generated).not.toMatch(/\bcommit\s*;/iu);
  expect(generated).not.toContain('internal_apply_entitlement_effect_v1(');
  expect(generated).not.toContain('https://api.portone.io');
  expect(generated).not.toMatch(/\bhttp_post\b/iu);
 });
});

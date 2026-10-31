import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
 COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1 as SOURCE_SQL,
} from '../scripts/operations/commerce-portone-cancellation-set-ledger-audit-v1.mjs';

const wrapper=readFileSync('test/db/commerce_portone_cancellation_set_pg17.sh','utf8');
const generator=readFileSync('test/db/commerce_portone_cancellation_set_pg17_generator.mjs','utf8');
const matrix=JSON.parse(readFileSync('scripts/ci/db-suites.json','utf8'));
const dispatch=readFileSync('test/db/run_ci_case.sh','utf8');
const partialWrapper=readFileSync('test/db/commerce_portone_cancellation_partial_set_pg17.sh','utf8');
const partialGenerator='test/db/commerce_portone_cancellation_partial_set_pg17_generator.mjs';
const partialGenerated=execFileSync(process.execPath,[partialGenerator],{encoding:'utf8'});
const generated=execFileSync(process.execPath,[
 'test/db/commerce_portone_cancellation_set_pg17_generator.mjs',
],{encoding:'utf8'});

describe('P4 canonical cancellation-item-set SQL on real isolated PostgreSQL17 schema',()=>{
 it('executes the exact production-candidate read-only SQL without maintaining test duplicate',()=>{
  expect(generator).toContain('COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1');
  expect(generated).toContain(SOURCE_SQL);
  expect(generated).toContain('execute query_text into strict b2 using receipt_b2');
  expect(generated).toContain('execute query_text into unexpected using receipt_b3');
  expect(generated).toContain('COMMERCE_PORTONE_CANCELLATION_SET_PG17_PASS');
 });
 it('reuses previously PG17-proven verified B2/B3 Reading purchase and event',()=>{
  expect(generator).toContain('commerce_stored_portone_hmac_lineage_pg17_generator.mjs');
  expect(wrapper).toContain('commerce_stored_portone_hmac_lineage_pg17_generator.mjs --fixture');
  expect(generated).toContain('12196200-0000-4000-8000-000000000002');
  expect(generated).toContain('SYNTHETIC_PORTONE_CANCEL_SET_CROSS_READER_LEAK');
  expect(generated).toContain('SYNTHETIC_PORTONE_CANCEL_SET_SOURCE_SQL_MISMATCH');
 });
 it('routes exclusively to PostgreSQL 17 disposable matrix and not PostgreSQL 15 commerce suite',()=>{
  expect(matrix.postgres17.postgres).toBe(17);
  expect(matrix.postgres17.cases).toContain('commerce-portone-cancellation-set-audit-pg17');
  expect(matrix['commerce-payment'].cases).not.toContain('commerce-portone-cancellation-set-audit-pg17');
  expect(dispatch).toContain('commerce-portone-cancellation-set-audit-pg17)');
  expect(dispatch).toContain('HOLD_COMMERCE_CANCELLATION_SET_NOT_ISOLATED_PG17');
  expect(dispatch).toContain('apply_pg17_migrations_without_birth_authority');
  expect(wrapper).toContain('^myeongha_ci_case_[0-9]+$');
  expect(wrapper).toContain('^17[0-9]{4}$');
 });
 it('does not mutate real entitlement or run PortOne refund',()=>{
  expect(generated).toContain('begin;');
  expect(generated.trimEnd().endsWith('rollback;')).toBe(true);
  expect(generated).not.toMatch(/\bcommit\s*;/iu);
  expect(generated).not.toContain('internal_apply_entitlement_effect_v1(');
  expect(generated).not.toContain('https://api.portone.io');
  expect(generated).not.toMatch(/\bhttp_post\b/iu);
  expect(generated).toContain('READ_ONLY_AUDIT_MUTATED_RIGHTS');
 });
 it('does not rely on event time or lexical provider ordering',()=>{
  expect(SOURCE_SQL).not.toContain('order by');
  expect(SOURCE_SQL).not.toContain('received_at');
  expect(SOURCE_SQL).not.toContain('provider_occurred_at');
  expect(generated).toContain('b2."orderingProven" is distinct from \'false\'');
  expect(generated).toContain('b2."providerOrderingKey" is not null');
 });

 it('covers two actually persisted distinct partial cancellation items in separate PG17 scratch schema',()=>{
  expect(matrix.postgres17.cases).toContain('commerce-portone-cancellation-partial-set-pg17');
  expect(dispatch).toContain('commerce-portone-cancellation-partial-set-pg17)');
  expect(partialWrapper).toContain('^myeongha_ci_case_[0-9]+$');
  expect(partialWrapper).toContain('^17[0-9]{4}$');
  expect(partialGenerated).toContain(SOURCE_SQL);
  expect(partialGenerated).toContain('PG17_CANCELLATION_PARTIAL_SET_NOT_COMPLETE');
  expect(partialGenerated).toContain('PG17_DUPLICATE_CANCELLATION_HMAC_NEGATIVE_CASE_MISSING');
  expect(partialGenerated).toContain('8900');
  expect(partialGenerated).toContain('3000');
  expect(partialGenerated).toContain('5900');
  expect(partialGenerated).toContain('rollback to savepoint duplicate_item_test;');
  expect(partialGenerated.trimEnd().endsWith('rollback;')).toBe(true);
  expect(partialGenerated).not.toMatch(/\bcommit\s*;/iu);
 });
});

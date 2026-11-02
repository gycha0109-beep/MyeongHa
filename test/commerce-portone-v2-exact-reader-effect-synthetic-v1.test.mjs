import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

const sql=readFileSync('test/db/commerce_portone_v2_exact_reader_effect_synthetic_v1.sql','utf8');
const shell=readFileSync('test/db/commerce_portone_v2_exact_reader_effect_synthetic_v1.sh','utf8');
const suite=readFileSync('test/db/run_authority_core.sh','utf8');

describe('P4 non-production PortOne source-v2 -> exact Reader EntitlementEffect SQL proof',()=>{
 it('never exposes a public grant mutation endpoint or creates a migration',()=>{
  expect(shell).toContain('^myeongha_[a-z0-9_]+$');
  expect(shell).toContain('"$db" == *production*');
  expect(shell).toContain('official_standard_reading_reader_interpretation.sql');
  expect(shell).toContain('commerce_portone_v2_exact_reader_effect_synthetic_v1.sql');
  expect(sql).toContain('begin;');
  expect(sql.trimEnd().endsWith('rollback;')).toBe(true);
  expect(sql).not.toMatch(/\bcommit\s*;/iu);
  expect(sql).not.toContain('https://api.portone.io');
 });
 it('feeds the real existing EntitlementEffect primitive with verified exact PortOne source identity',()=>{
  expect(sql).toContain('public.commerce_provider_events');
  expect(sql).toContain("event.provider='portone_v2'");
  expect(sql).toContain("event.event_type='Transaction.Cancelled'");
  expect(sql).toContain("event.environment='production'");
  expect(sql).toContain('source-v2');
  expect(sql).toContain("event.resolution_source_type='receipt'");
  expect(sql).toContain('event.external_original_transaction_id');
  expect(sql).toContain('v_provider.verified_amount_minor');
  expect(sql).toContain('v_provider.proof->>\'matchingCancellationStatus\'');
  expect(sql).toContain("is distinct from 'SUCCEEDED'");
  expect(sql).toContain('exactSucceededCancellationAmountMinor');
  expect(sql).toContain('observedCumulativeCancelledAmountMinor');
  expect(sql).toContain("v_provider.proof->>'currency'");
  expect(sql).toContain("from public.internal_apply_entitlement_effect_v1(");
  expect(sql).toContain("'provider_event',v_event_id,v_grant.id,null,");
  expect(sql).toContain('v_revision_before,v_grant.last_provider_ordering_key');
  expect(sql).toContain("'revoked',v_effective_at,'revoked'");
 });
 it('locks original event before exact Reader Grant and never rewrites other purchase',()=>{
  const event=sql.indexOf('for update of event;');
  const grant=sql.indexOf('for update of grant_row;');
  const apply=sql.indexOf('from public.internal_apply_entitlement_effect_v1(');
  expect(event).toBeGreaterThan(0);
  expect(grant).toBeGreaterThan(event);
  expect(apply).toBeGreaterThan(grant);
  expect(sql).toContain('access.purchase_intent_id=v_provider.purchase_intent_id');
  expect(sql).toContain('grant_row.source_receipt_id=v_provider.receipt_id');
  expect(sql).toContain('v_grant.source_receipt_id=v_other.source_receipt_id');
  expect(sql).toContain("where id=v_other_row_id and revision=v_other_revision");
  expect(sql).toContain("and status='active'");
 });
 it('checks one revoke, exact same event replay and cross Reader lineage denial',()=>{
  expect(sql).toContain('v_apply.result_entitlement_event_id is null');
  expect(sql).toContain('v_replay.result_replayed is distinct from true');
  expect(sql).toContain("source_provider_event_id=v_event_id)<>1");
  expect(sql).toContain('internal_entitlement_effect_provider_grant_lineage_mismatch');
  expect(sql).toContain('SYNTHETIC_CROSS_READER_GRANT_REVOKE_WAS_NOT_DENIED');
  expect(sql).toContain('SYNTHETIC_CROSS_READER_EFFECT_WROTE_WRONG_GRANT');
 });
 it('intentionally does not claim PortOne ordering, Legal, T2 or refund authority',()=>{
  expect(sql).toContain("'orderingProven',false");
  expect(sql).toContain("'refundExecutionAuthorized',false");
  expect(sql).toContain("'entitlementRevocationAuthorized',false");
  expect(sql).toContain('production release remains HOLD');
  expect(sql).toContain('not exposed to the application');
 });
 it('is wired to the actual PostgreSQL authority-core isolated fixture suite',()=>{
  expect(suite).toContain('run_isolated_case myeongha_portone_v2_exact_reader_effect_synthetic_test bash test/db/commerce_portone_v2_exact_reader_effect_synthetic_v1.sh');
 });
});

#!/usr/bin/env bash
# Executes ONLY after run_ci_case.sh set up the disposable PG17 schema + fixture.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true &&
   "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
   "${PGPORT:-}" == 5432 && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
  echo 'HOLD_LEGAL_COMMERCE_E2E_DISPOSABLE_PG17_ONLY' >&2; exit 1;
}
psql -X -v ON_ERROR_STOP=1 <<'SQL'
create or replace function pg_temp.ensure(label text, accepted boolean)
returns void language plpgsql as $$
begin
  if accepted is not true then raise exception 'FAIL legal-commerce %',label; end if;
  raise notice 'PASS legal-commerce %',label;
end $$;
-- Roles are changed with SET LOCAL ROLE during this disposable fixture.
-- PostgreSQL 17 may not give temporary helper functions PUBLIC EXECUTE.
grant execute on function pg_temp.ensure(text,boolean)
  to myeongha_api_executor,myeongha_commerce_internal_executor;

-- The fixture is an isolated enabled Reader and pinned Purchase Intent only.
select pg_temp.ensure('fixture', exists (
  select 1 from public.purchase_intent_reader_selections s
  where s.purchase_intent_id='11392300-0000-0000-0000-000000000001'
    and s.reader_character_id='test-standard-reader'
));

-- Payment Attempt checkout gate must reject a missing display+acknowledgement.
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',true);
select pg_temp.ensure('payment gate denies missing checkout notice',
  public.qry_legal_digital_reading_checkout_ready_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001')=false);
commit;

begin;
set local role myeongha_commerce_internal_executor;
select pg_temp.ensure('cannot deliver before verified provider receipt',
  public.cmd_record_digital_reading_delivery_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader',repeat('f',64))=false);
select pg_temp.ensure('notice displayed after sample/info sent',
  public.cmd_record_digital_reading_checkout_display_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader',
    'notice-test-v1','sample-test-v1','sample')=true);
select pg_temp.ensure('notice replay is not a second presentation',
  public.cmd_record_digital_reading_checkout_display_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader',
    'notice-test-v1','sample-test-v1','sample')=false);
select pg_temp.ensure('owner-isolated notice',
  public.cmd_record_digital_reading_checkout_display_v1(
    '11390000-0000-0000-0000-000000000002',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader',
    'notice-test-v1','sample-test-v1','sample')=false);
select pg_temp.ensure('explicit acknowledgement',
  public.cmd_record_digital_reading_checkout_ack_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader','notice-test-v1')=true);
commit;

-- Before provider payment, the owner can attempt checkout ONLY after
-- one server-presented notice and an explicit customer acknowledgement.
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',true);
select pg_temp.ensure('payment gate admits signed-off same-unit notice',
  public.qry_legal_digital_reading_checkout_ready_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001')=true);
select pg_temp.ensure('payment gate denies foreign Purchase Intent',
  public.qry_legal_digital_reading_checkout_ready_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000099')=false);
commit;

-- Simulated internally-created Payment Attempt. Even a historical/other
-- producer-created attempt must be denied PSP handoff without current notice.
insert into public.commerce_payment_attempts(
  id,purchase_intent_id,subject_id,product_offer_id,attempt_no,provider,
  environment,idempotency_key,provider_request_id,provider_transaction_id,
  status,failure_code,created_at,updated_at
) values (
  '11392500-0000-0000-0000-000000000001',
  '11392300-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  '11392200-0000-0000-0000-000000000001',
  1,'portone_v2','production','synthetic-legal-handoff-v1',
  'synthetic-legal-provider-request-v1',null,'created',null,
  clock_timestamp(),clock_timestamp()
);
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',true);
select pg_temp.ensure('PSP handoff requires owner and checkout proof',
  public.qry_legal_digital_reading_handoff_ready_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392500-0000-0000-0000-000000000001')=true);
select pg_temp.ensure('unrelated PSP attempt never gains paymentId',
  public.qry_legal_digital_reading_handoff_ready_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392500-0000-0000-0000-000000000099')=false);
commit;

-- Before a provider-verified receipt, client/T2 events cannot claim purchase.
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',true);
select pg_temp.ensure('prepayment returns no verified purchase',(
  select purchase_json is null and notice_json is not null and delivery_json is null
  from public.qry_owned_digital_reading_withdrawal_snapshot_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader')));
commit;

-- Simulated, disposable fixture of the existing *provider-verified receipt*
-- schema, never a real PSP operation, charge, webhook or merchant transaction.
update public.purchase_intents
set status='verified', updated_at=clock_timestamp()
where id='11392300-0000-0000-0000-000000000001';
insert into public.commerce_receipts (
  id,subject_id,purchase_intent_id,provider_account_link_id,product_offer_id,
  platform,provider,external_transaction_id,external_original_transaction_id,
  receipt_fingerprint,verification_status,verified_payload_jsonb,verified_at,
  created_at,environment,verifier_revision,verified_amount_minor,verified_currency
) values(
  '11392400-0000-0000-0000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  '11392300-0000-0000-0000-000000000001',null,
  '11392200-0000-0000-0000-000000000001',
  'web','portone_v2','synthetic-legal-e2e-provider-tx',null,
  'hmac-sha256:k1:'||repeat('a',64),
  'verified',null,clock_timestamp(),clock_timestamp(),
  'production','synthetic-offline-verifier-v1',1,'KRW'
);

-- The purchase alone still proves neither actual delivery nor valid notice.
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',true);
select pg_temp.ensure('PSP handoff stops after verified receipt',
  public.qry_legal_digital_reading_handoff_ready_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392500-0000-0000-0000-000000000001')=false);
select pg_temp.ensure('payment gate denies new attempt after verification',
  public.qry_legal_digital_reading_checkout_ready_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001')=false);
select pg_temp.ensure('verified receipt but undelivered',(
  select purchase_json->>'status'='verified' and delivery_json is null
  from public.qry_owned_digital_reading_withdrawal_snapshot_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader')));
commit;

begin;
set local role myeongha_commerce_internal_executor;
select pg_temp.ensure('exact verified unit delivered',
  public.cmd_record_digital_reading_delivery_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader',repeat('f',64))=true);
select pg_temp.ensure('delivery cannot replay',
  public.cmd_record_digital_reading_delivery_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader',repeat('f',64))=false);
commit;

begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id',
  '11390000-0000-0000-0000-000000000001',true);
select pg_temp.ensure('verified checkout-to-delivery exact unit',(
  select purchase_json->>'status'='verified'
    and notice_json->>'authority'='server_checkout_snapshot'
    and notice_json->>'acknowledged'='true'
    and notice_json->>'safeguardMethod'='sample'
    and delivery_json->>'state'='DELIVERED_PROVABLE'
    and (delivery_json->>'deliveredAt')::timestamptz >=
        (purchase_json->>'purchasedAt')::timestamptz
    and (notice_json->>'acknowledgedAt')::timestamptz <=
        (purchase_json->>'purchasedAt')::timestamptz
  from public.qry_owned_digital_reading_withdrawal_snapshot_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:test-standard-reader')));
select pg_temp.ensure('other purchased unit cannot inherit delivery',not exists(
  select 1 from public.qry_owned_digital_reading_withdrawal_snapshot_v1(
    '11390000-0000-0000-0000-000000000001',
    '11392300-0000-0000-0000-000000000001',
    'standard-reading:another-reader')));
commit;

select pg_temp.ensure('no direct customer table reads',
  not has_table_privilege('authenticated',
    'public.legal_digital_reading_checkout_evidence_v1','SELECT')
  and not has_table_privilege('authenticated',
    'public.legal_digital_reading_delivery_evidence_v1','SELECT')
  and not has_function_privilege('anon',
    'public.qry_owned_digital_reading_withdrawal_snapshot_v1(uuid,uuid,text)',
    'EXECUTE')
  and has_function_privilege('myeongha_api_executor',
    'public.qry_owned_digital_reading_withdrawal_snapshot_v1(uuid,uuid,text)',
    'EXECUTE')
  and not has_function_privilege('myeongha_api_executor',
    'public.cmd_record_digital_reading_delivery_v1(uuid,uuid,text,text)',
    'EXECUTE')
  and not has_function_privilege('anon',
    'public.qry_legal_digital_reading_checkout_ready_v1(uuid,uuid)',
    'EXECUTE')
  and has_function_privilege('myeongha_api_executor',
    'public.qry_legal_digital_reading_checkout_ready_v1(uuid,uuid)',
    'EXECUTE')
  and has_function_privilege('myeongha_api_executor',
    'public.qry_legal_digital_reading_handoff_ready_v1(uuid,uuid)',
    'EXECUTE')
  and not has_function_privilege('anon',
    'public.qry_legal_digital_reading_handoff_ready_v1(uuid,uuid)',
    'EXECUTE')
);
select 'PASS legal Commerce PG17 checkout-to-delivery E2E' as result;
SQL

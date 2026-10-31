\set ON_ERROR_STOP on

-- SYNTHETIC ONLY: run after official_standard_reading_reader_interpretation.sql
-- in a disposable PostgreSQL 17 database. This exercises the existing REAL
-- internal_apply_entitlement_effect_v1; it does NOT grant PortOne ordering,
-- statutory withdrawal, R2/T2 final disclosure, or production revoke authority.
begin;
set local statement_timeout='20s';

-- Reader B2 and B3 are separate paid Grants on the same Official Reading.
-- Restore both only in the disposable fixture so revoking B2 leaves B3 active.
update public.entitlement_grants g
set status='active',revision=g.revision+1,
    last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
from public.standard_reading_reader_access_grants access
where access.entitlement_grant_id=g.id
 and access.purchase_intent_id in (
 '12192300-0000-0000-0000-000000000002'::uuid,
 '12192300-0000-0000-0000-000000000003'::uuid
 );

-- PortOne-style event has a specific, single SUCCEEDED cancellation item,
-- not an inferred aggregate refund. All identifiers/data are synthetic.
insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 external_original_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select
 '12196000-0000-0000-0000-000000000081'::uuid,'portone_v2',
 'synthetic-portone-reader-b2-exact-cancel-v2','Transaction.Cancelled',
 cr.external_transaction_id,cr.external_transaction_id,
 cr.subject_id,'receipt',cr.id,
 'hmac-sha256:k1:'||repeat('a',64),null,null,
 jsonb_build_object(
  'schemaVersion','commerce-portone-cancellation-source-v2',
  'matchingCancellationStatus','SUCCEEDED',
  'cancellationIdHmac','hmac-sha256:k1:'||repeat('b',64),
  'signedPayloadHmac','hmac-sha256:k1:'||repeat('a',64),
  'providerReadbackHmac','hmac-sha256:k1:'||repeat('c',64),
  'exactSucceededCancellationAmountMinor',cr.verified_amount_minor,
  'observedCumulativeCancelledAmountMinor',cr.verified_amount_minor,
  'originalReceiptPaidAmountMinor',cr.verified_amount_minor,
  'currency',cr.verified_currency,
  'orderingProven',false,
  'refundExecutionAuthorized',false,
  'entitlementRevocationAuthorized',false
 ),'verified',clock_timestamp(),'production','synthetic-readback-v2'
from public.commerce_receipts cr
where cr.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid
  and cr.provider='portone_v2' and cr.environment='production'
  and cr.verification_status='verified';

do $synthetic$
declare
 v_event_id uuid:='12196000-0000-0000-0000-000000000081'::uuid;
 v_exact_purchase uuid:='12192300-0000-0000-0000-000000000002'::uuid;
 v_other_purchase uuid:='12192300-0000-0000-0000-000000000003'::uuid;
 v_provider record;
 v_grant public.entitlement_grants%rowtype;
 v_other public.entitlement_grants%rowtype;
 v_apply record;
 v_replay record;
 v_effective_at timestamptz:=transaction_timestamp();
 v_revision_before bigint;
 v_other_revision bigint;
 v_other_row_id uuid;
 v_actual_constraint text;
 v_wrong_grant_denied boolean:=false;
begin
 -- SOURCE (Event + original Receipt) before TARGET (exact Reader Grant).
 -- Reuse the same relative lock order as the existing EntitlementEffect writer.
 select event.id as event_id,event.resolved_receipt_id as receipt_id,
        receipt.subject_id,receipt.purchase_intent_id,
        receipt.verified_amount_minor,receipt.verified_currency,
        event.verified_payload_jsonb as proof,
        event.external_transaction_id,
        event.external_original_transaction_id
 into strict v_provider
 from public.commerce_provider_events event
 join public.commerce_receipts receipt
   on receipt.id=event.resolved_receipt_id
  and receipt.subject_id=event.resolved_subject_id
  and receipt.provider=event.provider
  and receipt.environment=event.environment
 where event.id=v_event_id and event.provider='portone_v2'
  and event.environment='production' and event.status='verified'
  and event.event_type='Transaction.Cancelled'
  and event.resolution_source_type='receipt'
  and receipt.verification_status='verified'
 for update of event;

 select grant_row.*
 into strict v_grant
 from public.entitlement_grants grant_row
 join public.standard_reading_reader_access_grants access
   on access.entitlement_grant_id=grant_row.id
  and access.subject_id=grant_row.subject_id
  and access.purchase_intent_id=v_provider.purchase_intent_id
 where grant_row.source_receipt_id=v_provider.receipt_id
   and grant_row.subject_id=v_provider.subject_id
   and grant_row.grant_source_type='purchase'
 for update of grant_row;

 select grant_row.*
 into strict v_other
 from public.entitlement_grants grant_row
 join public.standard_reading_reader_access_grants access
   on access.entitlement_grant_id=grant_row.id
 where access.purchase_intent_id=v_other_purchase
   and grant_row.grant_source_type='purchase';

 if v_provider.purchase_intent_id is distinct from v_exact_purchase
    or v_provider.external_original_transaction_id
       is distinct from v_provider.external_transaction_id
    or v_provider.verified_amount_minor<>1
    or v_provider.verified_currency is distinct from 'KRW'
    or v_provider.proof->>'schemaVersion'
       is distinct from 'commerce-portone-cancellation-source-v2'
    or v_provider.proof->>'matchingCancellationStatus'
       is distinct from 'SUCCEEDED'
    or v_provider.proof->>'exactSucceededCancellationAmountMinor'
       is distinct from v_provider.verified_amount_minor::text
    or v_provider.proof->>'observedCumulativeCancelledAmountMinor'
       is distinct from v_provider.verified_amount_minor::text
    or v_provider.proof->>'originalReceiptPaidAmountMinor'
       is distinct from v_provider.verified_amount_minor::text
    or v_provider.proof->>'currency'
       is distinct from v_provider.verified_currency
    or v_grant.status<>'active' or v_other.status<>'active'
    or v_grant.source_receipt_id=v_other.source_receipt_id
    or v_grant.id=v_other.id then
   raise exception 'SYNTHETIC_EXACT_CANCEL_ITEM_READER_LINEAGE_INVALID';
 end if;
 v_revision_before:=v_grant.revision;
 v_other_row_id:=v_other.id;
 v_other_revision:=v_other.revision;

 -- POSITIVE ENGINE PROOF only. The simulated authority is deliberately
 -- not exposed to the application; production release remains HOLD because
 -- orderingProven=false and legal/delivery/R2/T2 inputs are missing.
 select * into strict v_apply
 from public.internal_apply_entitlement_effect_v1(
  'provider_event',v_event_id,v_grant.id,null,
  v_revision_before,v_grant.last_provider_ordering_key,
  'revoked',v_effective_at,'revoked',
  v_grant.valid_from,v_grant.valid_until,
  'synthetic_portone_cancelled_reader_b2'
 );

 if v_apply.result_grant_id is distinct from v_grant.id
    or v_apply.result_replayed is distinct from false
    or v_apply.result_entitlement_event_id is null
    or v_apply.result_grant_revision<>v_revision_before+1 then
   raise exception 'SYNTHETIC_ENTITLEMENT_EFFECT_APPLY_RESULT_INCONSISTENT';
 end if;
 if (select status from public.entitlement_grants where id=v_grant.id)<>'revoked'
    or (select count(*) from public.entitlement_events
        where grant_id=v_grant.id
          and source_provider_event_id=v_event_id
          and event_type='revoked' and target_status='revoked')<>1
    or (select count(*) from public.entitlement_grants
        where id=v_other_row_id and revision=v_other_revision
          and status='active')<>1 then
   raise exception 'SYNTHETIC_EXACT_READER_REVOKE_AFFECTED_OTHER_PURCHASE';
 end if;

 -- Same event replay with stale CAS is allowed only as the EXACT same
 -- historical source semantics; it must not produce a second effect/outbox.
 select * into strict v_replay
 from public.internal_apply_entitlement_effect_v1(
  'provider_event',v_event_id,v_grant.id,null,
  v_revision_before,v_grant.last_provider_ordering_key,
  'revoked',v_effective_at,'revoked',
  v_grant.valid_from,v_grant.valid_until,
  'synthetic_portone_cancelled_reader_b2'
 );
 if v_replay.result_replayed is distinct from true
    or v_replay.result_entitlement_event_id
       is distinct from v_apply.result_entitlement_event_id
    or (select count(*) from public.entitlement_events
        where source_provider_event_id=v_event_id)<>1
    or (select revision from public.entitlement_grants where id=v_grant.id)
       <>v_revision_before+1 then
   raise exception 'SYNTHETIC_SAME_EVENT_REPLAY_DUPLICATED_EFFECT';
 end if;

 -- A signed event/Receipt for B2 must never revoke B3's separate Grant.
 begin
  perform public.internal_apply_entitlement_effect_v1(
   'provider_event',v_event_id,v_other.id,null,
   v_other_revision,v_other.last_provider_ordering_key,
   'revoked',v_effective_at,'revoked',
   v_other.valid_from,v_other.valid_until,
   'synthetic_wrong_grant'
  );
 exception when others then
  get stacked diagnostics v_actual_constraint=constraint_name;
  if v_actual_constraint<>'internal_entitlement_effect_provider_grant_lineage_mismatch' then
   raise;
  end if;
  v_wrong_grant_denied:=true;
 end;
 if not v_wrong_grant_denied then
  raise exception 'SYNTHETIC_CROSS_READER_GRANT_REVOKE_WAS_NOT_DENIED';
 end if;
 if (select status from public.entitlement_grants where id=v_other_row_id)<>'active'
    or (select count(*) from public.entitlement_events
        where grant_id=v_other_row_id and source_provider_event_id=v_event_id)<>0 then
  raise exception 'SYNTHETIC_CROSS_READER_EFFECT_WROTE_WRONG_GRANT';
 end if;

 raise notice 'PASS synthetic PortOne V2 exact event => one Reader Grant revoke + replay + other purchase unaffected';
end;
$synthetic$;

select 'COMMERCE_PORTONE_EXACT_READER_ENTITLEMENT_EFFECT_SYNTHETIC_PASS' as result;
-- Entire positive scenario (including inserted Event/Grant change/Effect)
-- is rolled back, even in the disposable fixture.
rollback;

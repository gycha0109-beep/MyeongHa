\set ON_ERROR_STOP on

-- Real PostgreSQL 17 schema + synthetic B2/B3 purchases, no network/Production.
-- Source persistence and actual Entitlement Effect writer run inside ROLLBACK.
-- This does NOT provide statutory refund, current Provider ordering, human
-- delivery proof or shared Reader R2/T2 admission for production.
begin;
set local statement_timeout='40s';
\ir ../../docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql

-- Synthetic positive effect needs an active purchased Grant to exercise CAS.
update public.entitlement_grants g
set status='active',revision=g.revision+1,
 last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
from public.standard_reading_reader_access_grants access
where access.entitlement_grant_id=g.id
 and access.purchase_intent_id in (
  '12192300-0000-0000-0000-000000000002'::uuid,
  '12192300-0000-0000-0000-000000000003'::uuid
 );

do $commerce_claim_e2e$
declare
 v_purchase uuid:='12192300-0000-0000-0000-000000000002'::uuid;
 v_other_purchase uuid:='12192300-0000-0000-0000-000000000003'::uuid;
 v_unit uuid:='12192400-0000-4000-8000-000000000002'::uuid;
 v_subject uuid;
 v_receipt public.commerce_receipts%rowtype;
 v_other_receipt public.commerce_receipts%rowtype;
 v_grant public.entitlement_grants%rowtype;
 v_other public.entitlement_grants%rowtype;
 v_claim uuid;
 v_claim_replay uuid;
 v_claim_replayed boolean;
 v_claim_replay_flag boolean;
 v_request_state text;
 v_cancel_event uuid;
 v_cancel_replayed boolean;
 v_applied record;
 v_applied_again record;
 v_original_grant_revision bigint;
 v_original_other_revision bigint;
 v_wrong_grant_rejected boolean:=false;
 v_constraint text;
 v_effective_at timestamptz:=transaction_timestamp();
begin
 -- Exact real verified paid Reading and pre-payment server notice.
 select cr.* into strict v_receipt
 from public.commerce_receipts cr
 where cr.purchase_intent_id=v_purchase and cr.provider='portone_v2'
  and cr.environment='production' and cr.verification_status='verified';
 select cr.* into strict v_other_receipt
 from public.commerce_receipts cr
 where cr.purchase_intent_id=v_other_purchase and cr.provider='portone_v2'
  and cr.environment='production' and cr.verification_status='verified';
 v_subject:=v_receipt.subject_id;
 if v_receipt.subject_id is distinct from v_other_receipt.subject_id
    or v_receipt.verified_amount_minor<>1
    or (select count(*) from public.digital_reading_checkout_notice_presentations_v1 p
      join public.digital_reading_checkout_notice_acknowledgments_v1 ack
       on ack.purchase_intent_id=p.purchase_intent_id
       and ack.unit_id=p.unit_id and ack.subject_id=p.subject_id
       and ack.submitted_challenge_sha256=p.challenge_sha256
      where p.purchase_intent_id=v_purchase and p.subject_id=v_subject
       and p.unit_id=v_unit and p.server_presented_at<v_receipt.verified_at)<>1
    or (select count(*) from public.digital_reading_checkout_notice_presentations_v1
      where purchase_intent_id=v_other_purchase)<>0 then
  raise exception 'CLAIM_E2E_EXACT_CHECKOUT_NOTICE_OR_VERIFIED_RECEIPT_INVALID';
 end if;

 -- The official Reader B2/B3 paid fixture uses a GUEST Subject because
 -- its own scope tests explicitly cover guest access. Customer withdrawal
 -- intake is MEMBER-only by design: prove guest denial, then synthesize the
 -- same Subject's member-auth identity only in this ROLLBACK transaction.
 perform pg_catalog.set_config('myeongha.subject_id',v_subject::text,true);
 if (select s.kind from public.subjects s where s.id=v_subject)<>'guest' then
  raise exception 'CLAIM_E2E_OFFICIAL_READER_FIXTURE_NOT_GUEST';
 end if;
 begin
  perform public.cmd_receive_digital_reading_withdrawal_claim_v1(
   v_subject,v_purchase,v_unit,'delivery_failed',
   'hmac-sha256:k1:'||repeat('e',64),
   'sha256:v1:'||repeat('f',64));
 exception when insufficient_privilege then
  v_wrong_grant_rejected:=true;
 end;
 if not v_wrong_grant_rejected
    or exists(select 1 from public.digital_reading_withdrawal_claims_private_v1
              where subject_id=v_subject) then
  raise exception 'CLAIM_E2E_GUEST_WAS_ALLOWED_TO_SUBMIT_WITHDRAWAL';
 end if;
 v_wrong_grant_rejected:=false;

 insert into auth.users(id)
 values ('1219a000-0000-4000-8000-000000000002'::uuid);
 update public.subjects
 set kind='member',auth_user_id='1219a000-0000-4000-8000-000000000002'::uuid,
     updated_at=clock_timestamp()
 where id=v_subject and kind='guest' and status='active'
  and auth_user_id is null;
 if not found or
    (select count(*) from public.subjects s
       join auth.users au on au.id=s.auth_user_id
       where s.id=v_subject and s.kind='member'
         and s.status='active')<>1 then
  raise exception 'CLAIM_E2E_SYNTHETIC_MEMBER_AUTH_BINDING_FAILED';
 end if;

 select t.claim_id,t.replayed into strict v_claim,v_claim_replayed
 from public.cmd_receive_digital_reading_withdrawal_claim_v1(
   v_subject,v_purchase,v_unit,'delivery_failed',
   'hmac-sha256:k1:'||repeat('e',64),
   'sha256:v1:'||repeat('f',64)
 ) t;
 if v_claim_replayed is distinct from false then
  raise exception 'CLAIM_E2E_INITIAL_CUSTOMER_CLAIM_ALREADY_REPLAYED';
 end if;
 select t.claim_id,t.replayed into strict v_claim_replay,v_claim_replay_flag
 from public.cmd_receive_digital_reading_withdrawal_claim_v1(
   v_subject,v_purchase,v_unit,'delivery_failed',
   'hmac-sha256:k1:'||repeat('e',64),
   'sha256:v1:'||repeat('f',64)
 ) t;
 if v_claim_replay is distinct from v_claim
    or v_claim_replay_flag is distinct from true then
  raise exception 'CLAIM_E2E_EXACT_CUSTOMER_INTAKE_REPLAY_CHANGED';
 end if;
 select s.request_state into strict v_request_state
 from public.qry_received_digital_reading_withdrawal_claim_v1(v_subject,v_claim) s;
 if v_request_state<>'received' then
  raise exception 'CLAIM_E2E_CUSTOMER_CLAIM_NOT_RECEIVED_ONLY';
 end if;

 -- Exact same Claim cannot be rebound to a different Reader purchase.
 begin
  perform public.cmd_receive_digital_reading_withdrawal_claim_v1(
   v_subject,v_other_purchase,v_unit,'delivery_failed',
   'hmac-sha256:k1:'||repeat('e',64),
   'sha256:v1:'||repeat('f',64));
 exception when check_violation then
  v_wrong_grant_rejected:=true;
 end;
 if not v_wrong_grant_rejected then
  raise exception 'CLAIM_E2E_OTHER_READER_PURCHASE_ACCEPTED';
 end if;
 v_wrong_grant_rejected:=false;

 -- New source event is persisted against B2 ORIGINAL receipt, not a
 -- manufactured event ID / client-provided Grant.
 select e.provider_event_id,e.replayed
 into strict v_cancel_event,v_cancel_replayed
 from public.internal_persist_portone_cancellation_event_v1(
  'synthetic-hmac-b2-payment','synthetic-claim-e2e-full-cancel',
  'Transaction.Cancelled',v_receipt.external_transaction_id,
  'full_cancel_shape_observed',
  'hmac-sha256:k1:'||repeat('a',64),
  'hmac-sha256:k1:'||repeat('b',64),
  'hmac-sha256:k1:'||repeat('c',64),
  v_receipt.verified_amount_minor,v_receipt.verified_amount_minor
 ) e;
 if v_cancel_replayed is distinct from false
    or (select count(*) from public.commerce_provider_events e
         where e.id=v_cancel_event and e.resolved_receipt_id=v_receipt.id
           and e.resolved_subject_id=v_subject
           and e.provider_ordering_key is null
           and e.verified_payload_jsonb->>'entitlementRevocationAuthorized'='false')<>1 then
  raise exception 'CLAIM_E2E_ORIGINAL_CANCEL_SOURCE_NOT_PINNED';
 end if;

 -- The existing writer is invoked ONLY under synthetic hypothetical
 -- authorization in this rolled-back verification. No production wrapper.
 select g.* into strict v_grant
 from public.entitlement_grants g
 join public.standard_reading_reader_access_grants access
  on access.entitlement_grant_id=g.id
 where g.source_receipt_id=v_receipt.id and g.grant_source_type='purchase'
   and access.purchase_intent_id=v_purchase
 for update of g;
 select g.* into strict v_other
 from public.entitlement_grants g
 join public.standard_reading_reader_access_grants access
  on access.entitlement_grant_id=g.id
 where g.source_receipt_id=v_other_receipt.id and g.grant_source_type='purchase'
   and access.purchase_intent_id=v_other_purchase;
 if v_grant.status<>'active' or v_other.status<>'active'
    or v_grant.id=v_other.id then
  raise exception 'CLAIM_E2E_READER_GRANT_IDENTITIES_INVALID';
 end if;
 v_original_grant_revision:=v_grant.revision;
 v_original_other_revision:=v_other.revision;
 select * into strict v_applied
 from public.internal_apply_entitlement_effect_v1(
  'provider_event',v_cancel_event,v_grant.id,null,
  v_original_grant_revision,v_grant.last_provider_ordering_key,
  'revoked',v_effective_at,'revoked',
  v_grant.valid_from,v_grant.valid_until,
  'synthetic_claim_e2e_exact_cancel'
 );
 select * into strict v_applied_again
 from public.internal_apply_entitlement_effect_v1(
  'provider_event',v_cancel_event,v_grant.id,null,
  v_original_grant_revision,v_grant.last_provider_ordering_key,
  'revoked',v_effective_at,'revoked',
  v_grant.valid_from,v_grant.valid_until,
  'synthetic_claim_e2e_exact_cancel'
 );
 if v_applied.result_replayed is distinct from false
    or v_applied_again.result_replayed is distinct from true
    or v_applied_again.result_entitlement_event_id
       is distinct from v_applied.result_entitlement_event_id
    or (select count(*) from public.entitlement_grants
        where id=v_grant.id and status='revoked'
          and revision=v_original_grant_revision+1)<>1
    or (select count(*) from public.entitlement_events
        where source_provider_event_id=v_cancel_event and grant_id=v_grant.id
          and event_type='revoked')<>1
    or (select count(*) from public.entitlement_grants
        where id=v_other.id and status='active'
          and revision=v_original_other_revision)<>1 then
  raise exception 'CLAIM_E2E_EXACT_READER_EFFECT_OR_REPLAY_BROKEN';
 end if;

 begin
  perform public.internal_apply_entitlement_effect_v1(
   'provider_event',v_cancel_event,v_other.id,null,
   v_original_other_revision,v_other.last_provider_ordering_key,
   'revoked',v_effective_at,'revoked',
   v_other.valid_from,v_other.valid_until,'synthetic_wrong_reader'
  );
 exception when others then
  get stacked diagnostics v_constraint=constraint_name;
  if v_constraint='internal_entitlement_effect_provider_grant_lineage_mismatch' then
   v_wrong_grant_rejected:=true;
  else raise;
  end if;
 end;
 if not v_wrong_grant_rejected then
  raise exception 'CLAIM_E2E_OTHER_READER_EFFECT_ALLOWED';
 end if;

 -- Immutable Claim and its response remain "received"; a provider Event and
 -- synthetic Entitlement Effect are not a refund legal decision or delivery.
 select s.request_state into strict v_request_state
 from public.qry_received_digital_reading_withdrawal_claim_v1(v_subject,v_claim) s;
 if v_request_state<>'received'
    or (select count(*) from public.digital_reading_withdrawal_claims_private_v1 c
        where c.id=v_claim and c.subject_id=v_subject
          and c.purchase_intent_id=v_purchase and c.unit_id=v_unit
          and c.reason_code='delivery_failed' and c.state='received')<>1
    or (select count(*) from public.digital_reading_withdrawal_claims_private_v1 c
        where c.purchase_intent_id=v_other_purchase)<>0
    or (select count(*) from public.commerce_provider_events e
        where e.resolved_receipt_id=v_other_receipt.id
          and e.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled'))<>0 then
  raise exception 'CLAIM_E2E_CROSS_READER_CLAIM_OR_STATE_CORRUPT';
 end if;
 raise notice 'PASS guest intake denied -> synthetic verified Member B2 + pre-payment notice + real private Claim intake/replay + original cancellation persistence + exact B2 Effect/replay + B3 preserved (ROLLED BACK)';
end;
$commerce_claim_e2e$;

select 'COMMERCE_VERIFIED_READER_CLAIM_CANCEL_EFFECT_SYNTHETIC_PG17_PASS' as result;
rollback;

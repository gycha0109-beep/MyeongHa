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
 v_wrong_grant_rejected boolean := false;
 v_refund_decision_id uuid:='1219d000-0000-4000-8000-000000000001'::uuid;
 v_claim_fingerprint text;
 v_refund_reservation record;
 v_recorded_response boolean;
 v_refund_confirm_denied boolean:=false;
 v_forged_refund_confirm_denied boolean:=false;
 v_unrevoked_refund_confirm_denied boolean:=false;
 v_positive_confirmed boolean:=false;
 v_positive_done boolean:=false;
 v_positive_at timestamptz;
 v_positive_event_at timestamptz;
 v_positive_effect record;
 v_other_event_revoke_denied boolean:=false;
 v_displaced_effect_time_denied boolean:=false;
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

 v_constraint text;
 v_scope record;
 v_scopes_locked integer:=0;
 v_other_subject uuid:='1219e000-0000-4000-8000-000000000001'::uuid;
 v_other_claim uuid;
 v_other_claim_replay boolean;
 v_deletion_job uuid:='1219f000-0000-4000-8000-000000000001'::uuid;
 v_deletion_outbox uuid:='1219f000-0000-4000-8000-000000000002'::uuid;
 v_lock_owner text:='commerce-reader-claim-delete-pg17';
 v_deleted record;
 v_deleted_replay record;
 v_preflight record;
 v_rows integer;
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

 -- The official Reader B2/B3 paid fixture is an authenticated Member
 -- under P0-CM-05. Claim intake remains Member-only; never rewrite historical
 -- Guest ownership to make a paid fixture eligible.
 perform pg_catalog.set_config('myeongha.subject_id',v_subject::text,true);
 if not exists (
  select 1
  from public.subjects s
  join auth.users au on au.id=s.auth_user_id
  where s.id=v_subject
    and s.kind='member'
    and s.status='active'
 ) then
  raise exception 'CLAIM_E2E_OFFICIAL_READER_FIXTURE_NOT_ACTIVE_MEMBER';
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


 -- One owner-approved MANUAL decision, created only in this disposable
 -- ROLLBACK fixture. This represents a prior legal adjudication; receiving
 -- a Claim alone never creates legal approval or initiates a PortOne POST.
 v_claim_fingerprint:='sha256:v1:'||pg_catalog.encode(
   pg_catalog.sha256(pg_catalog.convert_to(v_claim::text,'UTF8')),'hex'
 );
 insert into public.commerce_reader_full_refund_dispatches_v1(
   id,receipt_id,legal_decision_ref,legal_actor_ref,
   legal_approved_at,reason,retained_until,source_claim_fingerprint
 ) values (
   v_refund_decision_id,v_receipt.id,
   'sha256:v1:'||repeat('e',64),
   'operator:1219d000-0000-4000-8000-000000000002',
   pg_catalog.clock_timestamp()-interval '2 seconds',
   'non_delivery',pg_catalog.clock_timestamp()+interval '6 years',
   v_claim_fingerprint
 );
 select s.request_state into strict v_request_state
 from public.qry_received_digital_reading_withdrawal_claim_v1(v_subject,v_claim) s;
 if v_request_state<>'refund_decision_recorded'
    or (select count(*) from public.digital_reading_withdrawal_claims_private_v1
        where id=v_claim and state='received')<>1 then
   raise exception 'CLAIM_E2E_MANUAL_DECISION_NOT_REFLECTED_WITH_IMMUTABLE_CLAIM';
 end if;

 -- The existing internal reservation locks the SAME original B2 Receipt,
 -- Purchase Intent and unique original PortOne payment attempt. No network.
 select * into strict v_refund_reservation
 from public.internal_reserve_reader_full_refund_dispatch_v1(v_refund_decision_id);
 if v_refund_reservation.decision<>'dispatch'
    or v_refund_reservation.payment_id<>'synthetic-hmac-b2-payment'
    or v_refund_reservation.transaction_id is distinct from
       v_receipt.external_transaction_id
    or v_refund_reservation.original_amount_minor is distinct from
       v_receipt.verified_amount_minor
    or v_refund_reservation.original_currency is distinct from
       v_receipt.verified_currency
    or v_refund_reservation.known_cancellation_id is not null then
   raise exception 'CLAIM_E2E_OWNER_REFUND_RESERVED_WRONG_ORIGINAL_RECEIPT';
 end if;
 select s.request_state into strict v_request_state
 from public.qry_received_digital_reading_withdrawal_claim_v1(v_subject,v_claim) s;
 if v_request_state<>'refund_processing' then
   raise exception 'CLAIM_E2E_REFUND_RESERVATION_STATUS_NOT_VISIBLE';
 end if;
 -- Simulate the private worker saving its REQUESTED provider response.
 -- Do NOT contact PortOne, invent a successful cancellation or claim refund.
 select public.internal_record_reader_full_refund_response_v1(
   v_refund_decision_id,'synthetic-claim-b2-not-confirmed','REQUESTED'
 ) into strict v_recorded_response;
 select s.request_state into strict v_request_state
 from public.qry_received_digital_reading_withdrawal_claim_v1(v_subject,v_claim) s;
 if v_recorded_response is distinct from true
    or v_request_state<>'refund_processing'
    or (select count(*) from public.commerce_reader_full_refund_dispatches_v1
        where id=v_refund_decision_id and receipt_id=v_receipt.id
          and source_claim_fingerprint=v_claim_fingerprint
          and status='submitted' and provider_request_status='REQUESTED')<>1
 then
   raise exception 'CLAIM_E2E_SUBMITTED_REQUEST_WRONGLY_CLAIMED_CONFIRMED';
 end if;

 -- A genuine-looking exact PortOne GET-shaped cancellation still cannot
 -- confirm a refund BEFORE the corresponding Receipt's Reader Grant is
 -- revoked. This is separate from the wrong-amount forged-event regression.
 -- The nested exception subtransaction restores Receipt/Event after denial.
 begin
   update public.commerce_receipts
     set verification_status='revoked'
     where id=v_receipt.id and verification_status='verified';
   insert into public.commerce_provider_events(
     id,provider,external_event_id,event_type,external_transaction_id,
     resolved_subject_id,resolution_source_type,resolved_receipt_id,
     payload_fingerprint,provider_occurred_at,provider_ordering_key,
     verified_payload_jsonb,status,received_at,environment,verifier_revision
   ) values (
     '1219d000-0000-4000-8000-000000000009'::uuid,
     'portone_v2',
     'myeongha:portone-v2:full-cancel:v1:synthetic-claim-b2-not-confirmed',
     'Transaction.Cancelled',v_receipt.external_transaction_id,
     v_subject,'receipt',v_receipt.id,
     'hmac-sha256:k1:'||repeat('8',64),
     pg_catalog.clock_timestamp()-interval '1 second',null,
     pg_catalog.jsonb_build_object(
       'schemaVersion','portone-full-cancel-verified-v1',
       'paymentId',v_refund_reservation.payment_id,
       'transactionId',v_receipt.external_transaction_id,
       'cancellationId','synthetic-claim-b2-not-confirmed',
       'environment','production',
       'verifiedAmountMinor',v_receipt.verified_amount_minor,
       'verifiedCurrency',v_receipt.verified_currency,
       'evidenceFingerprint','hmac-sha256:k1:'||repeat('8',64),
       'verifierRevision','portone-v2-payment-full-cancel-lookup-v1'
     ),
     'verified',pg_catalog.clock_timestamp(),'production',
     'portone-v2-payment-full-cancel-lookup-v1'
   );
   perform public.internal_confirm_reader_full_refund_dispatch_v1(
     v_refund_decision_id,'synthetic-claim-b2-not-confirmed'
   );
 exception when check_violation then
   if sqlerrm='Refund receipt still unconfirmed by verified cancellation' then
     v_unrevoked_refund_confirm_denied:=true;
   else raise;
   end if;
 end;
 if not v_unrevoked_refund_confirm_denied
    or (select verification_status from public.commerce_receipts
        where id=v_receipt.id)<>'verified'
    or exists (select 1 from public.commerce_provider_events
        where id='1219d000-0000-4000-8000-000000000009'::uuid)
    or (select count(*) from public.entitlement_grants g
        where g.source_receipt_id=v_receipt.id
          and g.grant_source_type='purchase' and g.status='active')<1 then
   raise exception 'CLAIM_E2E_UNREVOKED_ORIGINAL_GRANT_REFUND_CONFIRMED';
 end if;

 -- S1 MUST be acquired BEFORE provider Event / Grant row locks of
 -- the legacy effect writer. Pin ALL original B2/B3 Reader access scopes in
 -- the same canonical DB sort order as the existing S2 dispatch logic.
 -- This is only a disposable synthetic transaction; no LIVE T2 admission.
 for v_scope in
   select distinct access.subject_id,access.official_reading_id,
                   access.reader_character_id
   from public.standard_reading_reader_access_grants access
   where access.purchase_intent_id in (v_purchase,v_other_purchase)
     and access.subject_id=v_subject
     and access.official_reading_id is not null
     and access.reader_character_id is not null
   order by access.subject_id,access.official_reading_id,
            access.reader_character_id
 loop
   perform public.internal_acquire_official_reader_scope_lock_v1(
     v_scope.subject_id,v_scope.official_reading_id,
     v_scope.reader_character_id
   );
   v_scopes_locked:=v_scopes_locked+1;
 end loop;
 if v_scopes_locked=0
    or not exists (
      select 1 from public.standard_reading_reader_access_grants access
      where access.purchase_intent_id=v_purchase and access.subject_id=v_subject)
    or not exists (
      select 1 from public.standard_reading_reader_access_grants access
      where access.purchase_intent_id=v_other_purchase and access.subject_id=v_subject)
 then
   raise exception 'CLAIM_E2E_READER_S1_SCOPE_LOCK_SET_INCOMPLETE';
 end if;

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
 -- Synthetic success must prove the same exact verified full-cancel Provider
 -- Event is responsible for BOTH the Grant revocation and refund confirmation.
 -- Exact same-Receipt events without matching effects are tested separately.
 -- Its inner subtransaction is rolled back before the independent baseline.
 begin
   v_positive_event_at:=pg_catalog.clock_timestamp();
   update public.commerce_receipts set verification_status='revoked'
     where id=v_receipt.id and verification_status='verified';
   insert into public.commerce_provider_events(
     id,provider,external_event_id,event_type,external_transaction_id,
     resolved_subject_id,resolution_source_type,resolved_receipt_id,
     payload_fingerprint,provider_occurred_at,provider_ordering_key,
     verified_payload_jsonb,status,received_at,environment,verifier_revision
   ) values (
     '1219d000-0000-4000-8000-000000000008'::uuid,'portone_v2',
     'myeongha:portone-v2:full-cancel:v1:synthetic-claim-b2-not-confirmed',
     'Transaction.Cancelled',v_receipt.external_transaction_id,
     v_subject,'receipt',v_receipt.id,
     'hmac-sha256:k1:'||repeat('8',64),
     v_positive_event_at,
     'portone-v2-fullcancel:'||pg_catalog.to_char(
       v_positive_event_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
     ),
     pg_catalog.jsonb_build_object(
       'schemaVersion','portone-full-cancel-verified-v1',
       'paymentId',v_refund_reservation.payment_id,
       'transactionId',v_receipt.external_transaction_id,
       'cancellationId','synthetic-claim-b2-not-confirmed',
       'environment','production',
       'verifiedAmountMinor',v_receipt.verified_amount_minor,
       'verifiedCurrency',v_receipt.verified_currency,
       'evidenceFingerprint','hmac-sha256:k1:'||repeat('8',64),
       'verifierRevision','portone-v2-payment-full-cancel-lookup-v1'
     ),'verified',pg_catalog.clock_timestamp(),'production',
     'portone-v2-payment-full-cancel-lookup-v1'
   );
   -- Legacy 1080 accepts a caller-provided effect clock; even if the
   -- Event ID is the SAME, a displaced effective_at must NOT grant refund
   -- confirmation. The inner failed confirmation rolls back this fake
   -- Grant/Event effect, leaving the source Event for the correct attempt.
   begin
     perform public.internal_apply_entitlement_effect_v1(
       'provider_event','1219d000-0000-4000-8000-000000000008'::uuid,
       v_grant.id,null,v_original_grant_revision,
       v_grant.last_provider_ordering_key,
       'revoked',v_positive_event_at+interval '1 microsecond','revoked',
       v_grant.valid_from,v_grant.valid_until,
       'synthetic_misaligned_provider_effect_time'
     );
     perform public.internal_confirm_reader_full_refund_dispatch_v1(
       v_refund_decision_id,'synthetic-claim-b2-not-confirmed'
     );
   exception when check_violation then
     if sqlerrm='Refund receipt still unconfirmed by verified cancellation' then
       v_displaced_effect_time_denied:=true;
     else raise;
     end if;
   end;
   if not v_displaced_effect_time_denied
      or (select count(*) from public.entitlement_grants
           where id=v_grant.id and status='active'
             and revision=v_original_grant_revision)<>1
      or (select count(*) from public.entitlement_events ee
           where ee.source_provider_event_id=
               '1219d000-0000-4000-8000-000000000008'::uuid
             and ee.grant_id=v_grant.id)<>0
      or (select count(*) from public.commerce_reader_full_refund_dispatches_v1
           where id=v_refund_decision_id and status='submitted')<>1
   then
     raise exception 'CLAIM_E2E_DISPLACED_PROVIDER_EFFECT_CLOCK_FALSE_REFUND_CONFIRMED';
   end if;

   -- The actual Writer produces the same Event's durable revoked effect.
   select * into strict v_positive_effect
   from public.internal_apply_entitlement_effect_v1(
     'provider_event','1219d000-0000-4000-8000-000000000008'::uuid,
     v_grant.id,null,v_original_grant_revision,
     v_grant.last_provider_ordering_key,
     'revoked',v_positive_event_at,'revoked',
     v_grant.valid_from,v_grant.valid_until,
     'verified_provider_full_cancellation'
   );
   if v_positive_effect.result_replayed is distinct from false
      or v_positive_effect.result_entitlement_event_id is null
      or (select count(*) from public.entitlement_events ee
          where ee.id=v_positive_effect.result_entitlement_event_id
            and ee.grant_id=v_grant.id and ee.subject_id=v_subject
            and ee.source_type='provider_event'
            and ee.source_provider_event_id=
                '1219d000-0000-4000-8000-000000000008'::uuid
            and ee.event_type='revoked')<>1 then
     raise exception 'CLAIM_E2E_EXACT_FULL_CANCEL_GRANT_EVENT_MISMATCH';
   end if;
   select public.internal_confirm_reader_full_refund_dispatch_v1(
     v_refund_decision_id,'synthetic-claim-b2-not-confirmed'
   ) into strict v_positive_confirmed;
   select confirmed_at into strict v_positive_at
     from public.commerce_reader_full_refund_dispatches_v1
     where id=v_refund_decision_id and receipt_id=v_receipt.id;
   if public.internal_confirm_reader_full_refund_dispatch_v1(
     v_refund_decision_id,'synthetic-claim-b2-not-confirmed'
   ) is distinct from true then
     raise exception 'CLAIM_E2E_POSITIVE_REFUND_REPLAY_DENIED';
   end if;
   select s.request_state into strict v_request_state
     from public.qry_received_digital_reading_withdrawal_claim_v1(
       v_subject,v_claim
     ) s;
   if v_positive_confirmed is distinct from true
      or v_positive_at is null
      or v_request_state<>'refund_confirmed'
      or (select count(*) from public.commerce_reader_full_refund_dispatches_v1
          where id=v_refund_decision_id and status='confirmed'
            and confirmed_at=v_positive_at)<>1
      or (select count(*) from public.entitlement_grants
          where id=v_grant.id and source_receipt_id=v_receipt.id
            and status='revoked')<>1
      or (select count(*) from public.entitlement_grants
          where id=v_other.id and source_receipt_id=v_other_receipt.id
            and status='active' and revision=v_original_other_revision)<>1
      or (select verification_status from public.commerce_receipts
          where id=v_other_receipt.id)<>'verified'
      or (select count(*) from public.digital_reading_withdrawal_claims_private_v1
          where id=v_claim and subject_id=v_subject and state='received')<>1
   then
     raise exception 'CLAIM_E2E_POSITIVE_REFUND_OR_INDEPENDENT_READER_FAILED';
   end if;
   raise exception 'CLAIM_E2E_POSITIVE_REFUND_FORCE_ROLLBACK';
 exception when raise_exception then
   if sqlerrm='CLAIM_E2E_POSITIVE_REFUND_FORCE_ROLLBACK' then
     v_positive_done:=true;
   else raise;
   end if;
 end;
 select s.request_state into strict v_request_state
   from public.qry_received_digital_reading_withdrawal_claim_v1(
     v_subject,v_claim
   ) s;
 if not v_positive_done or v_request_state<>'refund_processing'
    or (select verification_status from public.commerce_receipts
         where id=v_receipt.id)<>'verified'
    or (select count(*) from public.commerce_reader_full_refund_dispatches_v1
         where id=v_refund_decision_id and status='submitted'
           and confirmed_at is null)<>1
    or (select count(*) from public.entitlement_grants
        where id=v_grant.id and status='active'
          and revision=v_original_grant_revision)<>1
   or exists (select 1 from public.commerce_provider_events
         where id='1219d000-0000-4000-8000-000000000008'::uuid)
 then
   raise exception 'CLAIM_E2E_POSITIVE_REFUND_SAVEPOINT_LEAK';
 end if;

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


 -- Even a persisted source-v2 cancellation Event and a hypothetical exact
 -- Grant effect DO NOT confirm the manual refund while the original Receipt
 -- lacks the verified full cancellation + exact PortOne cancellation ID.
 -- This must remain refund_processing in the customer's own status GET.
 begin
   perform public.internal_confirm_reader_full_refund_dispatch_v1(
     v_refund_decision_id,'synthetic-claim-b2-not-confirmed'
   );
 exception when check_violation then
   if sqlerrm='Refund receipt still unconfirmed by verified cancellation' then
     v_refund_confirm_denied:=true;
   else
     raise;
   end if;
 end;
 select s.request_state into strict v_request_state
 from public.qry_received_digital_reading_withdrawal_claim_v1(v_subject,v_claim) s;
 if not v_refund_confirm_denied
    or v_request_state<>'refund_processing'
    or (select count(*) from public.commerce_reader_full_refund_dispatches_v1
        where id=v_refund_decision_id and status='submitted'
          and confirmed_at is null)<>1 then
   raise exception 'CLAIM_E2E_UNVERIFIED_REFUND_CONFIRMATION_ALLOWED';
 end if;


 -- Regression of the old 2310 false-positive: the exact cancellation ID and
 -- 'revoked' Receipt exist, but the stored provider event has a WRONG amount.
 -- A malicious/incorrect Event must not produce customer refund_confirmed.
 -- The nested SQL exception subtransaction rolls back its synthetic Receipt
 -- update + Event INSERT after the confirmer rejects the source.
 begin
   update public.commerce_receipts
      set verification_status='revoked'
    where id=v_receipt.id and verification_status='verified';
   insert into public.commerce_provider_events(
     id,provider,external_event_id,event_type,external_transaction_id,
     resolved_subject_id,resolution_source_type,resolved_receipt_id,
     payload_fingerprint,provider_occurred_at,provider_ordering_key,
     verified_payload_jsonb,status,received_at,environment,verifier_revision
   ) values (
     '1219d000-0000-4000-8000-000000000007'::uuid,
     'portone_v2',
     'myeongha:portone-v2:full-cancel:v1:synthetic-claim-b2-not-confirmed',
     'Transaction.Cancelled',v_receipt.external_transaction_id,
     v_subject,'receipt',v_receipt.id,
     'hmac-sha256:k1:'||repeat('7',64),
     pg_catalog.clock_timestamp()-interval '1 second',null,
     pg_catalog.jsonb_build_object(
       'schemaVersion','portone-full-cancel-verified-v1',
       'paymentId','synthetic-hmac-b2-payment',
       'transactionId',v_receipt.external_transaction_id,
       'cancellationId','synthetic-claim-b2-not-confirmed',
       'environment','production',
       'verifiedAmountMinor',v_receipt.verified_amount_minor+1,
       'verifiedCurrency',v_receipt.verified_currency,
       'evidenceFingerprint','hmac-sha256:k1:'||repeat('7',64),
       'verifierRevision','portone-v2-payment-full-cancel-lookup-v1'
     ),
     'verified',pg_catalog.clock_timestamp(),'production',
     'portone-v2-payment-full-cancel-lookup-v1'
   );
   perform public.internal_confirm_reader_full_refund_dispatch_v1(
     v_refund_decision_id,'synthetic-claim-b2-not-confirmed'
   );
 exception when check_violation then
   if sqlerrm='Refund receipt still unconfirmed by verified cancellation' then
     v_forged_refund_confirm_denied:=true;
   else
     raise;
   end if;
 end;
 if not v_forged_refund_confirm_denied
    or (select verification_status from public.commerce_receipts
        where id=v_receipt.id)<>'verified'
    or exists (
      select 1 from public.commerce_provider_events
      where id='1219d000-0000-4000-8000-000000000007'::uuid
    ) then
   raise exception 'CLAIM_E2E_WRONG_AMOUNT_FULL_CANCEL_FALSE_REFUND_CONFIRMED';
 end if;


 -- Regression: an arbitrary stored cancellation Event may already have
 -- revoked B2, but a DIFFERENT exact full-cancel GET Event did not produce
 -- that Grant effect. The correct refund must remain PROCESSING until exact
 -- provenance is reconciled (no borrowed status, Receipt or Event).
 begin
   update public.commerce_receipts set verification_status='revoked'
     where id=v_receipt.id and verification_status='verified';
   insert into public.commerce_provider_events(
     id,provider,external_event_id,event_type,external_transaction_id,
     resolved_subject_id,resolution_source_type,resolved_receipt_id,
     payload_fingerprint,provider_occurred_at,provider_ordering_key,
     verified_payload_jsonb,status,received_at,environment,verifier_revision
   ) values (
     '1219d000-0000-4000-8000-000000000008'::uuid,'portone_v2',
     'myeongha:portone-v2:full-cancel:v1:synthetic-claim-b2-not-confirmed',
     'Transaction.Cancelled',v_receipt.external_transaction_id,
     v_subject,'receipt',v_receipt.id,
     'hmac-sha256:k1:'||repeat('8',64),
     pg_catalog.clock_timestamp()-interval '1 second',null,
     pg_catalog.jsonb_build_object(
       'schemaVersion','portone-full-cancel-verified-v1',
       'paymentId',v_refund_reservation.payment_id,
       'transactionId',v_receipt.external_transaction_id,
       'cancellationId','synthetic-claim-b2-not-confirmed',
       'environment','production',
       'verifiedAmountMinor',v_receipt.verified_amount_minor,
       'verifiedCurrency',v_receipt.verified_currency,
       'evidenceFingerprint','hmac-sha256:k1:'||repeat('8',64),
       'verifierRevision','portone-v2-payment-full-cancel-lookup-v1'
     ),'verified',pg_catalog.clock_timestamp(),'production',
     'portone-v2-payment-full-cancel-lookup-v1'
   );
   perform public.internal_confirm_reader_full_refund_dispatch_v1(
     v_refund_decision_id,'synthetic-claim-b2-not-confirmed'
   );
 exception when check_violation then
   if sqlerrm='Refund receipt still unconfirmed by verified cancellation' then
     v_other_event_revoke_denied:=true;
   else raise;
   end if;
 end;
 select s.request_state into strict v_request_state
   from public.qry_received_digital_reading_withdrawal_claim_v1(
     v_subject,v_claim
   ) s;
 if not v_other_event_revoke_denied or v_request_state<>'refund_processing'
    or (select verification_status from public.commerce_receipts
         where id=v_receipt.id)<>'verified'
    or (select count(*) from public.commerce_reader_full_refund_dispatches_v1
         where id=v_refund_decision_id and status='submitted'
           and confirmed_at is null)<>1
    or exists (select 1 from public.commerce_provider_events
         where id='1219d000-0000-4000-8000-000000000008'::uuid)
 then
   raise exception 'CLAIM_E2E_OTHER_PROVIDER_EVENT_REVOKE_FALSE_REFUND_CONFIRMED';
 end if;

 -- The original Claim row remains 'received' even though its external
 -- status projection can now say refund_processing. The latter is not an
 -- immutable Claim mutation or a verified PortOne refund.
 select s.request_state into strict v_request_state
 from public.qry_received_digital_reading_withdrawal_claim_v1(v_subject,v_claim) s;
 if v_request_state<>'refund_processing'
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
 -- Privacy roadmap 4/5: the SAME Reader B2 Subject, actually paid,
 -- noticed, member-claimed, canonically cancelled and synthetically revoked,
 -- must be finalized through the REAL approved account deletion DB function.
 -- A separate Member's unlinked private Claim must survive untouched.
 insert into auth.users(id)
 values ('1219e000-0000-4000-8000-000000000002'::uuid);
 insert into public.subjects(
   id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
 ) values (
   v_other_subject,'member',
   '1219e000-0000-4000-8000-000000000002'::uuid,
   'active',null,clock_timestamp(),clock_timestamp()
 );
 perform pg_catalog.set_config('myeongha.subject_id',v_other_subject::text,true);
 select t.claim_id,t.replayed into strict v_other_claim,v_other_claim_replay
 from public.cmd_receive_digital_reading_withdrawal_claim_v1(
   v_other_subject,null,null,'not_provided',
   'hmac-sha256:k1:'||repeat('1',64),
   'sha256:v1:'||repeat('2',64)
 ) t;
 if v_other_claim_replay is distinct from false then
   raise exception 'CLAIM_E2E_UNRELATED_MEMBER_CLAIM_REPLAYED';
 end if;
 select s.request_state into strict v_request_state
 from public.qry_received_digital_reading_withdrawal_claim_v1(
   v_other_subject,v_other_claim
 ) s;
 if v_request_state<>'received' then
   raise exception 'CLAIM_E2E_OTHER_SUBJECT_REFUND_STATUS_LEAK';
 end if;
 perform pg_catalog.set_config('myeongha.subject_id',v_subject::text,true);

 perform public.cmd_start_account_deletion_v1(
   v_subject,v_deletion_job,
   'commerce-reader-claim-e2e-delete',
   v_deletion_outbox
 );
 update public.outbox_events
 set status='processing',locked_at=clock_timestamp(),
     lock_owner=v_lock_owner,
     lease_expires_at=clock_timestamp()+interval '10 minutes'
 where id=v_deletion_outbox and aggregate_type='data_deletion_job'
   and aggregate_id=v_deletion_job::text
   and event_type='ACCOUNT_DELETION_STARTED';
 get diagnostics v_rows=row_count;
 if v_rows<>1 then
   raise exception 'CLAIM_E2E_DELETE_WORKER_LEASE_NOT_BOUND';
 end if;

 -- The exact original B2/B3 purchase and the synthetic B2 revoke can emit
 -- pending ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED outbox work. The real account
 -- finalizer MUST refuse deletion while that same-Subject work is unfinished.
 select * into strict v_preflight
 from public.internal_account_deletion_finalization_preflight_v1(
   v_subject,v_deletion_job,v_lock_owner
 );
 if v_preflight.db_preconditions_met is distinct from false
    or v_preflight.blocking_outbox_count<1 then
   raise exception 'CLAIM_E2E_PENDING_ENTITLEMENT_OUTBOX_DID_NOT_BLOCK_DELETE';
 end if;

 -- Disposable ROLLBACK fixture only: represent the independent entitlement
 -- delivery worker completing its exact generated outbox events. This is NOT
 -- a production outbox worker, real consumer delivery, or a grant/revoke
 -- authorization. No other Subject or unexpected work may be fabricated
 -- as terminal to let the deletion preflight pass.
 if exists (
   select 1 from public.outbox_events oe
   where oe.id<>v_deletion_outbox
     and (
       oe.payload_jsonb->>'subjectId'=v_subject::text
       or (oe.aggregate_type='entitlement' and exists (
         select 1 from public.entitlements ent
         where ent.id::text=oe.aggregate_id and ent.subject_id=v_subject
       ))
       or (oe.aggregate_type='reading' and exists (
         select 1 from public.readings rd
         where rd.id::text=oe.aggregate_id and rd.subject_id=v_subject
       ))
       or (oe.aggregate_type='chat_turn' and exists (
         select 1 from public.chat_turns ct
         where ct.id::text=oe.aggregate_id and ct.subject_id=v_subject
       ))
       or (oe.aggregate_type='data_deletion_job' and exists (
         select 1 from public.data_deletion_jobs dj
         where dj.id::text=oe.aggregate_id and dj.subject_id=v_subject
       ))
     )
     and oe.status<>'processed'
     and not (
       (
         oe.aggregate_type='entitlement'
         and oe.event_type='ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
         and oe.status='pending'
         and oe.payload_jsonb->>'subjectId'=v_subject::text
         and exists (
           select 1 from public.entitlements ent
           where ent.id::text=oe.aggregate_id and ent.subject_id=v_subject
         )
       )
       or (
         oe.aggregate_type='reading'
         and oe.event_type='READING_FINALIZED'
         and oe.status='pending'
         and exists (
           select 1 from public.standard_reading_reader_access_grants access
           join public.readings rd
             on rd.id=access.official_reading_id
            and rd.subject_id=access.subject_id
           where rd.id::text=oe.aggregate_id
             and access.subject_id=v_subject
             and access.purchase_intent_id in (v_purchase,v_other_purchase)
         )
       )
     )
 ) then
   raise exception 'CLAIM_E2E_UNEXPECTED_SUBJECT_OUTBOX_BLOCKER';
 end if;
 update public.outbox_events oe
 set status='processed',processed_at=clock_timestamp()
 where oe.aggregate_type='entitlement'
   and oe.event_type='ENTITLEMENT_EFFECTIVE_RIGHT_CHANGED'
   and oe.status='pending'
   and oe.payload_jsonb->>'subjectId'=v_subject::text
   and exists (
     select 1 from public.entitlements ent
     where ent.id::text=oe.aggregate_id and ent.subject_id=v_subject
   );
 get diagnostics v_rows=row_count;
 if v_rows<1 then
   raise exception 'CLAIM_E2E_NO_EXACT_ENTITLEMENT_OUTBOX_SETTLED';
 end if;

 -- The preflight also links READING_FINALIZED by Reading aggregate even when
 -- no subjectId appears in its payload. The fixture's authorized Reader B2/B3
 -- finalization events must be independently completed, never silently ignored.
 -- Simulate only the exact two original official Reading outbox events inside
 -- this one ROLLBACK, without altering any production worker semantics.
 update public.outbox_events oe
 set status='processed',processed_at=clock_timestamp()
 where oe.aggregate_type='reading'
   and oe.event_type='READING_FINALIZED'
   and oe.status='pending'
   and exists (
     select 1 from public.standard_reading_reader_access_grants access
     join public.readings rd on rd.id=access.official_reading_id
                            and rd.subject_id=access.subject_id
     where rd.id::text=oe.aggregate_id
       and access.subject_id=v_subject
       and access.purchase_intent_id in (v_purchase,v_other_purchase)
   );
 get diagnostics v_rows=row_count;
 if v_rows<1 then
   raise exception 'CLAIM_E2E_NO_EXACT_READER_FINALIZED_OUTBOX_SETTLED';
 end if;
 select * into strict v_preflight
 from public.internal_account_deletion_finalization_preflight_v1(
   v_subject,v_deletion_job,v_lock_owner
 );
 if v_preflight.db_preconditions_met is distinct from true
    or v_preflight.blocking_outbox_count<>0 then
   raise exception 'CLAIM_E2E_ACCOUNT_DELETE_PREFLIGHT_STILL_BLOCKED: member=%, pending=%, job=%, running=%, start=%, auth=%, linked=%, blocking=%, ready=%; blockers=%',
     v_preflight.subject_member,v_preflight.subject_deletion_pending,
     v_preflight.deletion_job_found,v_preflight.deletion_job_account_running,
     v_preflight.account_start_outbox_ready,v_preflight.auth_mapping_present,
     v_preflight.linked_outbox_count,v_preflight.blocking_outbox_count,
     v_preflight.db_preconditions_met,
     (select coalesce(jsonb_agg(jsonb_build_object(
       'aggregateType',oe.aggregate_type,'eventType',oe.event_type,
       'status',oe.status,'isExactDeletionStart',oe.id=v_deletion_outbox
     )),'[]'::jsonb)
      from public.outbox_events oe
      where oe.status<>'processed'
        and (
          oe.payload_jsonb->>'subjectId'=v_subject::text
          or (oe.aggregate_type='chat_turn' and exists (
            select 1 from public.chat_turns ct
            where ct.id::text=oe.aggregate_id and ct.subject_id=v_subject
          ))
          or (oe.aggregate_type='reading' and exists (
            select 1 from public.readings rd
            where rd.id::text=oe.aggregate_id and rd.subject_id=v_subject
          ))
          or (oe.aggregate_type='data_deletion_job' and exists (
            select 1 from public.data_deletion_jobs dj
            where dj.id::text=oe.aggregate_id and dj.subject_id=v_subject
          ))
          or (oe.aggregate_type='entitlement' and exists (
            select 1 from public.entitlements ent
            where ent.id::text=oe.aggregate_id and ent.subject_id=v_subject
          ))
        ));
 end if;

 select finalized,replayed,auth_mapping_present
 into strict v_deleted
 from public.internal_finalize_account_deletion_db_v1(
   v_subject,v_deletion_job,v_lock_owner
 );
 if v_deleted.finalized is distinct from true
    or v_deleted.replayed is distinct from false
    or v_deleted.auth_mapping_present is distinct from true
    or (select count(*) from public.digital_reading_withdrawal_claims_private_v1
        where subject_id=v_subject)<>0
    or (select count(*) from public.digital_reading_withdrawal_claims_private_v1
        where id=v_other_claim and subject_id=v_other_subject
          and state='received')<>1
    or (select count(*) from public.commerce_receipts
        where id in (v_receipt.id,v_other_receipt.id)
          and subject_id=v_subject)<>2
    or (select count(*) from public.commerce_provider_events
        where id=v_cancel_event and resolved_receipt_id=v_receipt.id
          and resolved_subject_id=v_subject)<>1
    or (select count(*) from public.commerce_reader_full_refund_dispatches_v1
        where id=v_refund_decision_id and receipt_id=v_receipt.id
          and source_claim_fingerprint=v_claim_fingerprint
          and status='submitted' and confirmed_at is null
          and retained_until>pg_catalog.clock_timestamp()+interval '5 years')<>1
    or (select count(*) from public.standard_reading_reader_access_grants
        where subject_id=v_subject)<>0
    or (select count(*) from public.subjects
        where id=v_subject and status='deleted')<>1
 then
   raise exception 'CLAIM_E2E_ACCOUNT_PRIVACY_FINALIZER_RETENTION_OR_ISOLATION_FAILED';
 end if;
 select finalized,replayed,auth_mapping_present
 into strict v_deleted_replay
 from public.internal_finalize_account_deletion_db_v1(
   v_subject,v_deletion_job,v_lock_owner
 );
 if v_deleted_replay.finalized is distinct from true
    or v_deleted_replay.replayed is distinct from true
    or v_deleted_replay.auth_mapping_present is distinct from true
    or (select count(*) from public.digital_reading_withdrawal_claims_private_v1
        where subject_id=v_subject)<>0
    or (select count(*) from public.digital_reading_withdrawal_claims_private_v1
        where id=v_other_claim and subject_id=v_other_subject)<>1
 then
   raise exception 'CLAIM_E2E_ACCOUNT_PRIVACY_FINALIZER_REPLAY_REGRESSED';
 end if;

 raise notice 'PASS verified B2 notice + Member Claim + synthetic manual refund status transitions (received -> decision -> processing; synthetic same-full-cancel Event revoke + confirmed replay ROLLED BACK; other-Event revoke denied) + original cancellation + exact B2 revoke + B3 preservation + actual account deletion/replay + unrelated claim and retained financial disposition (ROLLED BACK)';
end;
$commerce_claim_e2e$;

select 'COMMERCE_VERIFIED_READER_CLAIM_CANCEL_EFFECT_SYNTHETIC_PG17_PASS' as result;
rollback;

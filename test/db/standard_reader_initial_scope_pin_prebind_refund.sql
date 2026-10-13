-- Runs AFTER synthetic S4 prefix and S5 issuance, BEFORE first bind.
\set ON_ERROR_STOP on
select pg_temp.assert_v2_true(
 'S5 initial verified purchase remains UNBOUND before Provider cancellation',
 (select count(*)=0 from public.standard_reading_official_bindings)
 and (select count(*)=0 from public.standard_reading_reader_access_grants)
 and (select count(*)=1 from public.standard_reader_initial_purchase_scope_pins_v1
   where receipt_id='b4230000-0000-4000-8000-000000000001'::uuid)
);

select pg_temp.assert_v2_fails(
 'S5 historical Reader purchase scope is append-only',
 $sql$
 update public.standard_reader_initial_purchase_scope_pins_v1
 set scope_identity='tampered'
 where receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
 $sql$,
 'standard_s5_initial_scope_pin_immutable'
);

select pg_temp.assert_v2_fails(
 'S5 private pin rejects nonexistent Receipt/Grant lineage despite no new P0 FKs',
 $sql$
 insert into public.standard_reader_initial_purchase_scope_pins_v1(
   receipt_id,purchase_intent_id,subject_id,product_id,
   source_birth_revision_id,entitlement_grant_id,
   approved_policy_revision,scope_identity
 ) values (
   'b4990000-0000-4000-8000-000000000001'::uuid,
   'b4220000-0000-4000-8000-000000000001'::uuid,
   '11390000-0000-0000-0000-000000000001'::uuid,
   '11392000-0000-0000-0000-000000000001'::uuid,
   '12101100-0000-0000-0000-000000000001'::uuid,
   'b4990000-0000-4000-8000-000000000002'::uuid,
   's4-initial-standard-test-only','forged-unpinned-scope'
 )
 $sql$,
 'standard_s5_pin_exact_immutable_authority_required'
);

insert into public.commerce_provider_events(
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,provider_occurred_at,provider_ordering_key,
 verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select
 'b4260000-0000-4000-8000-000000000001'::uuid,
 provider,'synthetic-s5-prebind-cancellation','payment.cancelled',
 external_transaction_id,subject_id,'receipt',id,
 'sha256:v1:5555555555555555555555555555555555555555555555555555555555555555',
 clock_timestamp(),'s5-order-1','{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
 'verified',clock_timestamp(),'production','test-only-s5'
from public.commerce_receipts
where id='b4230000-0000-4000-8000-000000000001'::uuid;

-- Simulate changed current Birth Revision and retired Offer AFTER purchase.
insert into public.birth_profile_revisions(
 id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,
 birth_time,time_known,is_leap_month,sex,input_hash,created_at
)
select 'b4270000-0000-4000-8000-000000000001'::uuid,
 birth_profile_id,subject_id,2,calendar_type,date '1996-01-10',
 birth_time,time_known,is_leap_month,sex,
 'sha256:test:s5-birth-revision-2',clock_timestamp()
from public.birth_profile_revisions
where id='12101100-0000-0000-0000-000000000001'::uuid;
update public.birth_profiles
set current_revision_id='b4270000-0000-4000-8000-000000000001'::uuid,
 updated_at=clock_timestamp()
where id='12101000-0000-0000-0000-000000000001'::uuid;
update public.product_offers set enabled=false
where id='11392200-0000-0000-0000-000000000001'::uuid;

select pg_temp.assert_v2_true(
 'S5 historical pin remains immutable after current Birth and Offer changes',
 (select count(*)=1 from public.standard_reader_initial_purchase_scope_pins_v1
   where receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
     and source_birth_revision_id='12101100-0000-0000-0000-000000000001'::uuid)
 and not exists (
   select 1 from public.internal_qry_official_reader_initial_scope_candidate_v1(
      '11390000-0000-0000-0000-000000000001'::uuid,
      'b4220000-0000-4000-8000-000000000001'::uuid)
   where source_birth_revision_id=
      '12101100-0000-0000-0000-000000000001'::uuid
 )
);

-- S5 exact first Reader cancellation on disposable PG15, before/after bind.
-- Includes S4 fixture in same SQL session; never a live provider event.
\set ON_ERROR_STOP on

select pg_temp.assert_v2_true(
  'S5 verified initial Receipt has ONE immutable purchase-time initial lock pin',
  (select count(*)=1 and bool_and(
    subject_id='11390000-0000-0000-0000-000000000001'::uuid
    and source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
    and source_birth_revision_id='12101100-0000-0000-0000-000000000001'::uuid
  ) from public.standard_reader_initial_purchase_scope_pins_v1
   where purchase_intent_id='b4220000-0000-4000-8000-000000000001'::uuid)
);

select pg_temp.assert_v2_fails(
  'S5 immutable initial purchase scope cannot be updated',
  $sql$update public.standard_reader_initial_purchase_scope_pins_v1
     set initial_scope_identity='counterfeit'
     where purchase_intent_id='b4220000-0000-4000-8000-000000000001'::uuid$sql$,
  'std_reader_s5_pin_append_only'
);

select pg_temp.assert_v2_true(
  'S5 private scope history and verified cancellation have no public EXECUTE',
  not pg_catalog.has_table_privilege('public',
    'public.standard_reader_initial_purchase_scope_pins_v1','SELECT')
  and not pg_catalog.has_function_privilege('public',
    'public.internal_execute_standard_reader_initial_verified_revoke_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)',
    'EXECUTE')
  and not exists (
    select 1 from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
      and pg_catalog.has_function_privilege(r.rolname,
        'public.internal_execute_standard_reader_initial_verified_revoke_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)',
        'EXECUTE')
  )
);

-- Synthetic payment.cancelled is exact receipt-linked, current provider event.
insert into public.commerce_provider_events(
  id,provider,external_event_id,event_type,external_transaction_id,
  resolved_subject_id,resolution_source_type,resolved_receipt_id,
  payload_fingerprint,provider_occurred_at,provider_ordering_key,
  verified_payload_jsonb,status,received_at,environment,verifier_revision
)
select
  'b4260000-0000-4000-8000-000000000001',
  cr.provider,'s5-initial-standard-cancel','payment.cancelled',
  cr.external_transaction_id,cr.subject_id,'receipt',cr.id,
  'sha256:v1:5555555555555555555555555555555555555555555555555555555555555555',
  clock_timestamp(),'s5-cancel-ordering-1',
  '{"schemaVersion":"commerce-evidence-v2"}'::jsonb,
  'verified',clock_timestamp(),'production','s5-test-only'
from public.commerce_receipts cr
where cr.id='b4230000-0000-4000-8000-000000000001'::uuid;

-- Not required for refund: the currently saleable Offer can be retired AFTER
-- purchase/binding; historical pinned initial scope remains resolvable.
\if :S5_BOUND
update public.product_offers
set enabled=false
where id='11392200-0000-0000-0000-000000000001'::uuid;
\endif

select pg_catalog.set_config('myeongha.subject_id','',false);

create temp table _s5_effect as
select * from public.internal_execute_standard_reader_initial_verified_revoke_v1(
 'b4260000-0000-4000-8000-000000000001'::uuid,
 (select g.id from public.entitlement_grants g
  where g.source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
    and g.grant_source_type='purchase'),
 (select g.revision from public.entitlement_grants g
  where g.source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
    and g.grant_source_type='purchase'),
 (select g.last_provider_ordering_key from public.entitlement_grants g
  where g.source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
    and g.grant_source_type='purchase'),
 clock_timestamp(),
 (select g.valid_from from public.entitlement_grants g
  where g.source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
    and g.grant_source_type='purchase'),
 (select g.valid_until from public.entitlement_grants g
  where g.source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
    and g.grant_source_type='purchase'),
 'synthetic_s5_refund'
);

select pg_temp.assert_v2_true(
  'S5 verified Provider cancellation uses original Commerce effect CAS',
  (select count(*)=1 and bool_and(result_replayed=false) from _s5_effect)
  and exists (
    select 1 from public.entitlement_grants g
    where g.source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid
      and g.status='revoked'
  )
  and exists (
    select 1 from public.entitlement_events e
    where e.source_provider_event_id='b4260000-0000-4000-8000-000000000001'::uuid
      and e.event_type='revoked' and e.target_status='revoked'
  )
  and coalesce(pg_catalog.current_setting('myeongha.subject_id',true),'')=''
);

\if :S5_BOUND
-- Provider bridge deliberately restores caller's EMPTY subject context;
-- authorized Reader-side visibility check must set its own verified Subject.
select pg_catalog.set_config(
  'myeongha.subject_id','11390000-0000-0000-0000-000000000001',false
);
select pg_temp.assert_v2_true(
  'S5 refunded bound initial Reader access is no longer current',
  (select count(*)=1 from public.standard_reading_reader_access_grants a
   where a.purchase_intent_id='b4220000-0000-4000-8000-000000000001'::uuid)
  and (select count(*)=0 from public.qry_character_standard_reading_access_runtime_v2(
    '11390000-0000-0000-0000-000000000001'::uuid,'seyeon',
    pg_catalog.clock_timestamp()
  ))
);
\else
select pg_catalog.set_config(
  'myeongha.subject_id','11390000-0000-0000-0000-000000000001',false
);
select pg_temp.assert_v2_fails(
  'S5 cancelled unbound initial Grant can never create a Reading',
  $sql$select * from public.internal_cmd_bind_standard_reader_initial_policy_locked_v1(
    '11390000-0000-0000-0000-000000000001',
    'b4220000-0000-4000-8000-000000000001',
    'b4240000-0000-4000-8000-000000000001',
    'b4250000-0000-4000-8000-000000000001',
    'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
    'standard-reading-access-bind-v2',
    '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b4220000-0000-4000-8000-000000000001"}'::jsonb
  )$sql$,
  'cmd_standard_reading_access_v2_entitlement_unavailable'
);
select pg_temp.assert_v2_true(
  'S5 refund-before-first-bind creates zero official Reading or Access',
  (select count(*)=0 from public.standard_reading_official_bindings)
  and (select count(*)=0 from public.standard_reading_reader_access_grants)
);
\endif

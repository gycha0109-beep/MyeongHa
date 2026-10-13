-- CAP-B2/R1 PRIVATE purchase-time Standard initial Scope provenance.
-- FORWARD-ONLY / NO PRODUCTION CALLER / NO PAID ACCESS / NO REFUND EFFECT.
-- Watchtower-Track: applizing
--
-- Capture MUST run in the trusted purchase-selection transaction BEFORE
-- payment verification and BEFORE a later Birth/Offer change. A missing pin
-- CANNOT be reconstructed from today's profile/product state.

create table public.standard_reader_initial_purchase_scope_pins_v1 (
  purchase_intent_id uuid primary key,
  subject_id uuid not null,
  product_offer_id uuid not null,
  product_id uuid not null,
  capability_set_id uuid not null,
  offer_snapshot_hash text not null,
  capability_snapshot_hash text not null,
  reader_character_id text not null,
  reader_content_bundle_id uuid not null,
  reader_selection_hash text not null,
  source_birth_profile_id uuid not null,
  source_birth_revision_id uuid not null,
  source_birth_input_hash text not null,
  topic_key text not null,
  saju_domain text not null,
  reading_period text not null,
  reading_variant text not null,
  product_spec_version text not null,
  domain_capability_version text not null,
  approved_policy_revision text not null,
  scope_identity text not null,
  capture_contract_version text not null
    default 'standard-reader-initial-scope-pin-v1',
  captured_at timestamptz not null default clock_timestamp(),
  constraint b2_r1_pin_purchase_subject_fk
    foreign key (purchase_intent_id,subject_id)
    references public.purchase_intents(id,subject_id),
  constraint b2_r1_pin_offer_fk foreign key (product_offer_id)
    references public.product_offers(id),
  constraint b2_r1_pin_product_fk foreign key (product_id)
    references public.standard_reading_product_specs(product_id),
  constraint b2_r1_pin_capability_fk foreign key (capability_set_id)
    references public.product_capability_sets(id),
  constraint b2_r1_pin_policy_fk
    foreign key (product_id,approved_policy_revision)
    references public.standard_reader_product_approved_rules_v1(product_id,approved_policy_revision),
  constraint b2_r1_pin_reader_bundle_fk
    foreign key (reader_character_id,reader_content_bundle_id)
    references public.character_runtime_catalog(character_id,content_bundle_id),
  constraint b2_r1_pin_contract check
    (capture_contract_version='standard-reader-initial-scope-pin-v1'),
  constraint b2_r1_pin_nonempty check
    (btrim(offer_snapshot_hash)<>'' and btrim(capability_snapshot_hash)<>''
     and btrim(reader_selection_hash)<>'' and btrim(source_birth_input_hash)<>''
     and btrim(approved_policy_revision)<>'' and btrim(scope_identity)<>'')
);

-- Do not force Birth history to survive privacy deletion by adding an FK
-- from retained Commerce provenance to birth_profile_revisions.
-- The sensitive birth identifiers in this new pin require explicit privacy
-- deletion/retention integration before activation.
create index b2_r1_pin_subject_scope_idx
  on public.standard_reader_initial_purchase_scope_pins_v1(subject_id,product_id);

create function public.tr_b2_r1_pin_update_immutable_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public
as $pin_immutable$
begin
  raise exception using errcode='23514',
    constraint='b2_r1_pin_append_only',
    message='Purchase-time initial Reading scope pin is immutable';
end
$pin_immutable$;

create trigger tr_b2_r1_pin_update_immutable_v1
before update on public.standard_reader_initial_purchase_scope_pins_v1
for each row execute function public.tr_b2_r1_pin_update_immutable_v1();

alter table public.standard_reader_initial_purchase_scope_pins_v1
  enable row level security;
revoke all on public.standard_reader_initial_purchase_scope_pins_v1 from public;
revoke all on function public.tr_b2_r1_pin_update_immutable_v1() from public;

-- Current-state candidate is valid ONLY during the pre-verification checkout
-- selection transaction; never use this candidate to locate refunded history.
create function public.internal_qry_b2_r1_initial_checkout_scope_candidate_v1(
  p_subject_id uuid, p_purchase_intent_id uuid
)
returns table (
  subject_id uuid, purchase_intent_id uuid,
  product_offer_id uuid, product_id uuid, capability_set_id uuid,
  offer_snapshot_hash text, capability_snapshot_hash text,
  reader_character_id text, reader_content_bundle_id uuid,
  reader_selection_hash text, source_birth_profile_id uuid,
  source_birth_revision_id uuid, source_birth_input_hash text,
  topic_key text, saju_domain text, reading_period text,
  reading_variant text, product_spec_version text,
  domain_capability_version text, scope_identity text
)
language sql volatile security invoker
set search_path=pg_catalog,public
as $pin_candidate$
  select pi.subject_id,pi.id,po.id,po.product_id,pi.capability_set_id,
    pi.offer_snapshot_hash,pi.capability_snapshot_hash,
    sel.reader_character_id,sel.reader_content_bundle_id,sel.selection_hash,
    bp.id,bp.current_revision_id,rev.input_hash,
    spec.topic_key,spec.saju_domain,spec.reading_period,
    spec.reading_variant,spec.spec_version,domain.capability_version,
    pg_catalog.jsonb_build_array(
      'myeongha:official-reading:initial-lock:v1',
      pi.subject_id,po.product_id,bp.current_revision_id,
      spec.topic_key,spec.saju_domain,spec.reading_period,
      spec.reading_variant,spec.spec_version,domain.capability_version
    )::text
  from public.purchase_intents pi
  join public.product_offers po
    on po.id=pi.product_offer_id and po.enabled=true
  join public.purchase_intent_reader_selections sel
    on sel.purchase_intent_id=pi.id and sel.product_id=po.product_id
  join public.standard_reading_offer_roles roles
    on roles.product_offer_id=po.id and roles.purchase_role='initial_reading'
       and roles.retired_at is null
  join public.standard_reading_product_specs spec
    on spec.product_id=po.product_id and spec.retired_at is null
       and spec.capability_set_id=pi.capability_set_id
       and spec.reader_selection_mode='required'
       and spec.purchase_unit_mode='topic_reader_reading'
  join public.standard_reading_delivery_policies policy
    on policy.product_id=spec.product_id and policy.retired_at is null
       and policy.reading_identity_mode='official_subject_product_scope_birth_authority'
       and policy.reader_interpretation_mode='per_reader_purchase_grant'
  join public.birth_profiles bp
    on bp.subject_id=pi.subject_id and bp.profile_kind='self'
       and bp.archived_at is null and bp.current_revision_id is not null
  join public.birth_profile_revisions rev
    on rev.id=bp.current_revision_id and rev.birth_profile_id=bp.id
       and rev.subject_id=pi.subject_id
  join public.saju_domain_runtime domain
    on domain.saju_domain=spec.saju_domain
       and domain.availability<>'unavailable'
       and domain.capability_version is not null
       and btrim(domain.capability_version)<>''
  where pi.id=p_purchase_intent_id and pi.subject_id=p_subject_id
    and pi.status in ('created','pending')
    and pi.capability_set_id is not null
    and pi.offer_snapshot_hash is not null
    and pi.capability_snapshot_hash is not null
    and sel.reader_character_id in (
      'seyeon','baekheon','yeoul','seorin','rahyeon',
      'mira','taegyeom','yunho','doyun'
    )
$pin_candidate$;
revoke all on function public.internal_qry_b2_r1_initial_checkout_scope_candidate_v1(uuid,uuid)
from public;

-- Capture uses S3 exact advisory key and Product-wide lock BEFORE locking
-- Birth row; post-wait fresh recheck protects against changed Birth revisions.
-- This is not a receipt issuer; it has no entitlement side effect.
create function public.internal_capture_b2_r1_initial_checkout_scope_pin_v1(
  p_subject_id uuid,p_purchase_intent_id uuid
)
returns table (pinned_scope_identity text,pinned_birth_revision_id uuid,
               pinned_product_id uuid,pinned_policy_revision text,
               replayed boolean)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $capture$
#variable_conflict use_column
declare
  v_pre record; v_post record; v_existing record;
  v_count integer; v_approved text; v_birth uuid;
begin
  if p_subject_id is null or p_purchase_intent_id is null then
    raise exception using errcode='23514',
      constraint='b2_r1_ids_required', message='Exact initial purchase required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',
      constraint='b2_r1_read_committed_required',
      message='R1 capture requires READ COMMITTED';
  end if;
  select count(*) into v_count
  from public.internal_qry_b2_r1_initial_checkout_scope_candidate_v1(
    p_subject_id,p_purchase_intent_id);
  if v_count<>1 then
    raise exception using errcode='P0001',
      constraint='b2_r1_single_precheckout_scope_required',
      message='Exactly one eligible initial checkout scope is required';
  end if;
  select * into strict v_pre
  from public.internal_qry_b2_r1_initial_checkout_scope_candidate_v1(
    p_subject_id,p_purchase_intent_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_pre.scope_identity,1830::bigint));
  perform public.internal_acquire_standard_reader_product_policy_lock_v1(v_pre.product_id);
  -- The Birth command updates this row FOR UPDATE. It cannot advance while
  -- the exact revision is snapshotted in this short checkout transaction.
  select bp.id into v_birth
  from public.birth_profiles bp
  where bp.id=v_pre.source_birth_profile_id
    and bp.subject_id=p_subject_id
  for share;
  if v_birth is null then
    raise exception using errcode='40001',
      constraint='b2_r1_birth_disappeared', message='Birth profile changed';
  end if;
  select count(*), (array_agg(r.approved_policy_revision))[1]
    into v_count,v_approved
  from public.qry_standard_reader_approved_rule_v1(
    v_pre.product_id,v_pre.product_spec_version,v_pre.saju_domain,
    pg_catalog.clock_timestamp()) r
  where r.policy_kind='standard_all_readers' and r.target_reader_id is null;
  if v_count<>1 or v_approved is null then
    raise exception using errcode='P0001',
      constraint='b2_r1_current_approved_standard_policy_required',
      message='A current approved Standard policy is required at capture';
  end if;
  select * into strict v_post
  from public.internal_qry_b2_r1_initial_checkout_scope_candidate_v1(
    p_subject_id,p_purchase_intent_id);
  if to_jsonb(v_post) is distinct from to_jsonb(v_pre) then
    raise exception using errcode='40001',
      constraint='b2_r1_checkout_scope_drift',
      message='Checkout authority changed during scope capture';
  end if;
  insert into public.standard_reader_initial_purchase_scope_pins_v1(
    purchase_intent_id,subject_id,product_offer_id,product_id,
    capability_set_id,offer_snapshot_hash,capability_snapshot_hash,
    reader_character_id,reader_content_bundle_id,reader_selection_hash,
    source_birth_profile_id,source_birth_revision_id,source_birth_input_hash,
    topic_key,saju_domain,reading_period,reading_variant,
    product_spec_version,domain_capability_version,
    approved_policy_revision,scope_identity)
  values (
    v_post.purchase_intent_id,v_post.subject_id,v_post.product_offer_id,
    v_post.product_id,v_post.capability_set_id,v_post.offer_snapshot_hash,
    v_post.capability_snapshot_hash,v_post.reader_character_id,
    v_post.reader_content_bundle_id,v_post.reader_selection_hash,
    v_post.source_birth_profile_id,v_post.source_birth_revision_id,
    v_post.source_birth_input_hash,v_post.topic_key,v_post.saju_domain,
    v_post.reading_period,v_post.reading_variant,v_post.product_spec_version,
    v_post.domain_capability_version,v_approved,v_post.scope_identity)
  on conflict (purchase_intent_id) do nothing;

  select * into strict v_existing
  from public.standard_reader_initial_purchase_scope_pins_v1 pin
  where pin.purchase_intent_id=p_purchase_intent_id;
  if v_existing.scope_identity is distinct from v_post.scope_identity
     or v_existing.source_birth_revision_id is distinct from
        v_post.source_birth_revision_id
     or v_existing.reader_character_id is distinct from v_post.reader_character_id
     or v_existing.reader_selection_hash is distinct from v_post.reader_selection_hash
     or v_existing.offer_snapshot_hash is distinct from v_post.offer_snapshot_hash
     or v_existing.capability_snapshot_hash is distinct from
        v_post.capability_snapshot_hash
     or v_existing.approved_policy_revision is distinct from v_approved then
    raise exception using errcode='23505',
      constraint='b2_r1_pin_conflict', message='Existing purchase pin differs';
  end if;
  return query select v_existing.scope_identity,
    v_existing.source_birth_revision_id,v_existing.product_id,
    v_existing.approved_policy_revision,
    (v_existing.captured_at < pg_catalog.clock_timestamp() - interval '1 second');
end
$capture$;
revoke all on function public.internal_capture_b2_r1_initial_checkout_scope_pin_v1(uuid,uuid)
from public;

-- Historic resolution intentionally has NO join to current Birth pointer,
-- enabled Offer, current Spec/Release, or current approval window.
-- Current authorization remains a completely separate check.
create function public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(
 p_receipt_id uuid
)
returns table (scope_identity text,subject_id uuid,product_id uuid,
 source_birth_revision_id uuid,approved_policy_revision text,
 purchase_intent_id uuid)
language sql volatile security invoker
set search_path=pg_catalog,public
as $receipt_scope$
 select pin.scope_identity,pin.subject_id,pin.product_id,
        pin.source_birth_revision_id,pin.approved_policy_revision,
        pin.purchase_intent_id
 from public.commerce_receipts cr
 join public.purchase_intents pi
   on pi.id=cr.purchase_intent_id and pi.subject_id=cr.subject_id
 join public.standard_reader_initial_purchase_scope_pins_v1 pin
   on pin.purchase_intent_id=pi.id and pin.subject_id=pi.subject_id
   and pin.product_offer_id=pi.product_offer_id
   and pin.offer_snapshot_hash=pi.offer_snapshot_hash
   and pin.capability_snapshot_hash=pi.capability_snapshot_hash
   and pin.capability_set_id=pi.capability_set_id
 join public.purchase_intent_reader_selections sel
   on sel.purchase_intent_id=pin.purchase_intent_id
   and sel.product_id=pin.product_id
   and sel.reader_character_id=pin.reader_character_id
   and sel.reader_content_bundle_id=pin.reader_content_bundle_id
   and sel.selection_hash=pin.reader_selection_hash
 where cr.id=p_receipt_id
   and cr.subject_id=pin.subject_id
   and cr.product_offer_id=pin.product_offer_id
   and cr.environment='production'
   and cr.verification_status in ('verified','revoked')
   and pi.status in ('verified','cancelled')
$receipt_scope$;
revoke all on function public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(uuid)
from public;

-- The event/Grant join supports zero Reader Access rows. It is only a
-- verified source resolver + advisory acquisition, NEVER a refund effect.
create function public.internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1(
 p_provider_event_id uuid,p_grant_id uuid
)
returns table (scope_identity text,subject_id uuid,product_id uuid,
 source_birth_revision_id uuid,approved_policy_revision text)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $cancel_scope$
declare v_before record;v_after record;v_count integer;
begin
 if p_provider_event_id is null or p_grant_id is null then
   raise exception using errcode='23514',
    constraint='b2_r1_cancel_identity_required',
    message='Exact verified cancellation and purchase Grant required';
 end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception using errcode='25001',
    constraint='b2_r1_cancel_read_committed_required',
    message='R1 cancellation lock requires READ COMMITTED';
 end if;
 select count(*) into v_count from (
   select s.*
   from public.commerce_provider_events pe
   join public.commerce_receipts cr
     on cr.id=pe.resolved_receipt_id
     and cr.subject_id=pe.resolved_subject_id
     and cr.provider=pe.provider
   join public.entitlement_grants g
     on g.id=p_grant_id and g.subject_id=cr.subject_id
     and g.source_receipt_id=cr.id and g.grant_source_type='purchase'
   join public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(cr.id) s
     on s.subject_id=cr.subject_id
   where pe.id=p_provider_event_id
     and pe.status in ('verified','processed')
     and pe.environment='production'
     and pe.resolution_source_type='receipt'
     and pe.event_type='payment.cancelled'
     and (pe.external_transaction_id is null
          or pe.external_transaction_id=cr.external_transaction_id)
 ) selected;
 if v_count<>1 then
   raise exception using errcode='P0001',
    constraint='b2_r1_verified_cancel_lineage_required',
    message='Unique verified cancellation-to-pinned-scope lineage required';
 end if;
 select s.* into strict v_before
 from public.commerce_provider_events pe
 join public.commerce_receipts cr
   on cr.id=pe.resolved_receipt_id
   and cr.subject_id=pe.resolved_subject_id
   and cr.provider=pe.provider
 join public.entitlement_grants g
   on g.id=p_grant_id and g.subject_id=cr.subject_id
   and g.source_receipt_id=cr.id and g.grant_source_type='purchase'
 join public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(cr.id) s
   on s.subject_id=cr.subject_id
 where pe.id=p_provider_event_id
   and pe.status in ('verified','processed')
   and pe.environment='production'
   and pe.resolution_source_type='receipt'
   and pe.event_type='payment.cancelled'
   and (pe.external_transaction_id is null
        or pe.external_transaction_id=cr.external_transaction_id);
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(v_before.scope_identity,1830::bigint));
 -- Revalidate ALL verified lineage after waiting for initial issuance/bind.
 select s.* into v_after
 from public.commerce_provider_events pe
 join public.commerce_receipts cr
   on cr.id=pe.resolved_receipt_id
   and cr.subject_id=pe.resolved_subject_id
   and cr.provider=pe.provider
 join public.entitlement_grants g
   on g.id=p_grant_id and g.subject_id=cr.subject_id
   and g.source_receipt_id=cr.id and g.grant_source_type='purchase'
 join public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(cr.id) s
   on s.subject_id=cr.subject_id
 where pe.id=p_provider_event_id
   and pe.status in ('verified','processed')
   and pe.environment='production'
   and pe.resolution_source_type='receipt'
   and pe.event_type='payment.cancelled'
   and (pe.external_transaction_id is null
        or pe.external_transaction_id=cr.external_transaction_id);
 if not found or to_jsonb(v_after) is distinct from to_jsonb(v_before) then
   raise exception using errcode='40001',
    constraint='b2_r1_cancel_scope_drift',
    message='Verified cancellation scope changed during lock acquisition';
 end if;
 return query select v_after.scope_identity,v_after.subject_id,
                     v_after.product_id,v_after.source_birth_revision_id,
                     v_after.approved_policy_revision;
end
$cancel_scope$;
revoke all on function public.internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1(uuid,uuid)
from public;

-- Explicitly deny all normal callers; no SECURITY DEFINER to bypass tenant
-- identity, no automatic trigger on the existing Commerce source tables.
do $acl$
declare r text;
begin
 for r in select rolname from pg_catalog.pg_roles where rolname in
 ('anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 loop
  execute format('revoke all on public.standard_reader_initial_purchase_scope_pins_v1 from %I',r);
  execute format('revoke all on function public.internal_qry_b2_r1_initial_checkout_scope_candidate_v1(uuid,uuid) from %I',r);
  execute format('revoke all on function public.internal_capture_b2_r1_initial_checkout_scope_pin_v1(uuid,uuid) from %I',r);
  execute format('revoke all on function public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(uuid) from %I',r);
  execute format('revoke all on function public.internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1(uuid,uuid) from %I',r);
 end loop;
end
$acl$;
comment on table public.standard_reader_initial_purchase_scope_pins_v1 is
 'CAP-B2 R1 PRIVATE sensitive purchase-time initial scope source. No live callers; not refund effect or access. Privacy deletion/retention Owner signoff required.';

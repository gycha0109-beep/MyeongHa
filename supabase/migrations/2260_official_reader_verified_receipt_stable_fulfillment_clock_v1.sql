-- Forward-only correction for verified Reader fulfillment webhook replay.
-- The prior private resolver derived Capability effective_at from a fresh
-- clock_timestamp on EACH replay, so an identical persisted Receipt could
-- re-enter the atomic bind with a different effect timestamp. Instead pin
-- that time to the immutable Commerce Receipt verified_at, including after
-- independent payment-completion retries. No new issuance authority, public
-- EXECUTE role, or Production activation. Original 1940 migration preserved.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_resolve_verified_reader_receipt_fulfillment_v1(
  p_receipt_id uuid
)
returns table (
  purchase_intent_id uuid,
  existing_official_reading_id uuid,
  capability_item_key text,
  validity_mode text,
  purchase_role text,
  prepared_at timestamptz
)
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $reader_receipt_fulfillment$
declare
  v_count integer;
begin
  if p_receipt_id is null then
    raise exception using errcode='23514',
      constraint='official_reader_fulfillment_receipt_required',
      message='Verified Reader fulfillment requires a stored Receipt';
  end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_fulfillment_read_committed_required',
      message='Verified Reader fulfillment requires READ COMMITTED';
  end if;

  -- Ordinary Commerce Receipts have no Reader selection and do not enter
  -- Reader issuance. A selected Reader with broken authority must fail,
  -- rather than silently recording a paid Receipt without issuing access.
  if not exists (
    select 1 from public.commerce_receipts cr
    join public.purchase_intent_reader_selections prs
      on prs.purchase_intent_id=cr.purchase_intent_id
    where cr.id=p_receipt_id
  ) then
    return;
  end if;

  return query
  select
    pi.id,
    coalesce(access.official_reading_id,o.reading_id),
    pci.item_key,
    pci.validity_mode,
    sor.purchase_role,
    cr.verified_at
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id=cr.purchase_intent_id
   and pi.subject_id=cr.subject_id
   and pi.product_offer_id=cr.product_offer_id
   and pi.status='verified'
  join public.product_offers po
    on po.id=pi.product_offer_id
  join public.purchase_intent_reader_selections prs
    on prs.purchase_intent_id=pi.id
   and prs.product_id=po.product_id
  join public.standard_reading_product_specs sp
    on sp.product_id=po.product_id
   and sp.capability_set_id=pi.capability_set_id
   and sp.reader_selection_mode='required'
   and sp.retired_at is null
  join public.standard_reading_delivery_policies dp
    on dp.product_id=sp.product_id
   and dp.retired_at is null
   and dp.reading_identity_mode='official_subject_product_scope_birth_authority'
   and dp.reader_interpretation_mode='per_reader_purchase_grant'
  join public.standard_reading_offer_roles sor
    on sor.product_offer_id=po.id
   and sor.retired_at is null
   and sor.purchase_role in ('initial_reading','additional_reader_interpretation')
  join public.product_capability_items pci
    on pci.capability_set_id=pi.capability_set_id
  join public.birth_profiles bp
    on bp.subject_id=pi.subject_id
   and bp.profile_kind='self'
   and bp.archived_at is null
   and bp.current_revision_id is not null
  join public.saju_domain_runtime sdr
    on sdr.saju_domain=sp.saju_domain
   and sdr.availability<>'unavailable'
   and sdr.capability_version is not null
  join public.character_capabilities cc
    on cc.character_id=prs.reader_character_id
   and cc.content_bundle_id=prs.reader_content_bundle_id
   and cc.saju_domain=sp.saju_domain
   and cc.can_initiate=true
  left join public.standard_reading_reader_access_grants access
    on access.purchase_intent_id=pi.id
   and access.subject_id=pi.subject_id
  left join public.standard_reading_official_bindings o
    on o.subject_id=pi.subject_id
   and o.product_id=po.product_id
   and o.source_birth_revision_id=bp.current_revision_id
   and o.topic_key=sp.topic_key
   and o.saju_domain=sp.saju_domain
   and o.reading_period=sp.reading_period
   and o.reading_variant=sp.reading_variant
   and o.product_spec_version=sp.spec_version
   and o.domain_capability_version=sdr.capability_version
  where cr.id=p_receipt_id
    and cr.environment='production'
    and cr.verification_status='verified'
    and cr.verified_at is not null;

  get diagnostics v_count=row_count;
  if v_count<>1 then
    raise exception using errcode='P0001',
      constraint='official_reader_fulfillment_authority_unavailable',
      message='Reader Receipt cannot resolve exactly one pinned purchase capability';
  end if;
end
$reader_receipt_fulfillment$;

revoke all on function public.internal_resolve_verified_reader_receipt_fulfillment_v1(uuid)
  from public;

do $reader_fulfillment_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_resolve_verified_reader_receipt_fulfillment_v1(uuid) from %I',
      v_role
    );
  end loop;
end
$reader_fulfillment_acl$;

grant execute on function public.internal_resolve_verified_reader_receipt_fulfillment_v1(uuid)
  to myeongha_commerce_internal_executor;

comment on function public.internal_resolve_verified_reader_receipt_fulfillment_v1(uuid) is
'Commerce-internal Reader fulfillment input resolver: canonical verified Receipt, selected Reader, pinned capability and current official Reading identity. No rights issue, public exposure or payment activation.';

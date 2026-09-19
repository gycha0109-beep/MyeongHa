begin;

-- Fail-closed runtime projection for Standard Reading Reader selection.
--
-- This slice resolves only already-authoritative Product spec, active-default
-- immutable content bundle, Character catalog state, and stored Character Unlock
-- projection. It does not create/evaluate unlock conditions, create an Offer,
-- activate checkout, execute Saju, or grant the v4 purchase command.
--
-- Product enabled state is deliberately not used here: the current Product remains
-- disabled during pre-launch integration. Saleability remains owned by Offer/Charge
-- Terms + cmd_create_standard_reading_purchase_intent_v4 activation gates.

create or replace function public.qry_standard_reading_reader_catalog_v4(
  p_product_id uuid,
  p_reader_character_id text
)
returns table (
  product_id uuid,
  topic_key text,
  spec_version text,
  reader_selection_mode text,
  purchase_unit_mode text,
  reader_character_id text,
  reader_content_bundle_id uuid,
  catalog_availability text,
  catalog_enabled boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    srps.product_id,
    srps.topic_key,
    srps.spec_version,
    srps.reader_selection_mode,
    srps.purchase_unit_mode,
    crc.character_id,
    crc.content_bundle_id,
    crc.availability,
    crc.enabled
  from public.standard_reading_product_specs srps
  join public.products p
    on p.id = srps.product_id
  join public.content_releases cr
    on cr.status = 'active'
   and cr.is_default = true
  join public.content_bundles cb
    on cb.id = cr.content_bundle_id
   and cb.retired_at is null
  join public.character_runtime_catalog crc
    on crc.content_bundle_id = cr.content_bundle_id
   and crc.character_id = p_reader_character_id
  join public.characters c
    on c.character_id = crc.character_id
   and c.retired_at is null
  where p_product_id is not null
    and p_reader_character_id is not null
    and btrim(p_reader_character_id) <> ''
    and srps.product_id = p_product_id
    and srps.retired_at is null
    and p.product_type = 'reading'
    and p.retired_at is null
    and (crc.release_at is null or crc.release_at <= statement_timestamp())
    and (crc.retire_at is null or crc.retire_at > statement_timestamp());
$$;

comment on function public.qry_standard_reading_reader_catalog_v4(uuid, text) is
  'Executor-only Standard Reading Reader catalog resolver. Pins the active-default immutable content bundle and returns Product spec + Character catalog authority without creating sale, unlock, payment, entitlement, or Saju side effects.';

create or replace function public.qry_standard_reading_reader_unlock_v4(
  p_subject_id uuid,
  p_reader_character_id text
)
returns table (
  status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_standard_reading_reader_unlock_subject_required',
      message = 'Standard Reading Reader unlock resolution requires a subject';
  end if;

  if p_reader_character_id is null or btrim(p_reader_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_standard_reading_reader_unlock_character_required',
      message = 'Standard Reading Reader unlock resolution requires a Character';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_standard_reading_reader_unlock_subject_ineligible',
      message = 'Standard Reading Reader unlock resolution requires an active canonical subject';
  end if;

  return query
  select cu.status
  from public.character_unlocks cu
  where cu.subject_id = p_subject_id
    and cu.character_id = p_reader_character_id;
end;
$$;

comment on function public.qry_standard_reading_reader_unlock_v4(uuid, text) is
  'Executor-only read of one already-stored current Character Unlock projection for Standard Reading Reader eligibility. Absence remains absence; no unlock condition is evaluated or mutated.';


-- Defense in depth for future purchase-command activation: an `unlockable` Reader
-- must already have an authoritative current `unlocked` projection for the
-- Purchase Intent owner. This trigger consumes stored state only; it never
-- evaluates or mutates unlock conditions.
create or replace function public.ct_validate_standard_reading_reader_unlock_v4()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_subject_id uuid;
  v_catalog_availability text;
begin
  select pi.subject_id, crc.availability
    into v_subject_id, v_catalog_availability
  from public.purchase_intents pi
  join public.character_runtime_catalog crc
    on crc.character_id = new.reader_character_id
   and crc.content_bundle_id = new.reader_content_bundle_id
  where pi.id = new.purchase_intent_id;

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reader_selection_unlock_authority_missing',
      message = 'Reader selection unlock authority could not resolve Purchase Intent owner and Reader catalog state';
  end if;

  if v_catalog_availability = 'available' then
    return new;
  end if;

  if v_catalog_availability is distinct from 'unlockable' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reader_selection_unlock_catalog_ineligible',
      message = 'Reader selection unlock authority accepts only available or unlockable Readers';
  end if;

  if not exists (
    select 1
    from public.character_unlocks cu
    where cu.subject_id = v_subject_id
      and cu.character_id = new.reader_character_id
      and cu.status = 'unlocked'
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'ct_reader_selection_unlock_required',
      message = 'unlockable Reader requires an already-stored unlocked projection for the Purchase Intent owner';
  end if;

  return new;
end;
$$;

drop trigger if exists ct_purchase_intent_reader_unlock_v4
  on public.purchase_intent_reader_selections;
create constraint trigger ct_purchase_intent_reader_unlock_v4
  after insert on public.purchase_intent_reader_selections
  deferrable initially immediate
  for each row execute function public.ct_validate_standard_reading_reader_unlock_v4();

revoke all on function public.qry_standard_reading_reader_catalog_v4(uuid, text)
  from public;
revoke all on function public.qry_standard_reading_reader_unlock_v4(uuid, text)
  from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_standard_reading_reader_catalog_v4(uuid,text) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_standard_reading_reader_unlock_v4(uuid,text) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_standard_reading_reader_catalog_v4(uuid, text)
  to myeongha_api_executor;
grant execute on function public.qry_standard_reading_reader_unlock_v4(uuid, text)
  to myeongha_api_executor;

-- Purchase execution remains intentionally unavailable until launch activation.
revoke execute on function public.cmd_create_standard_reading_purchase_intent_v4(
  uuid, uuid, uuid, uuid, text, text, jsonb, text, jsonb, text,
  uuid, text, uuid, text, jsonb, text
) from myeongha_api_executor;

commit;

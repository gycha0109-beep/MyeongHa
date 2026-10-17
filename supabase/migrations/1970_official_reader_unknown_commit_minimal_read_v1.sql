-- M1-17: approved minimal read-only Receipt reconciliation under API role.
-- No entitlement / Reader Writer permission and no source-table SELECT GRANT.
-- Deploy only with the reviewed 1050/1820/1900 migration baseline.
--
-- The caller is a trusted API backend that resolved a canonical subject via
-- begin_member_subject_context_v1 / begin_guest_subject_context_v1.
-- A user-provided UUID or writable GUC alone is NOT authentication.
--
-- The SECURITY DEFINER exposes only an enumeration; it never returns IDs,
-- provider payloads, hashes, timestamps, Reader text, counts or raw row data.
create or replace function public.qry_official_reader_unknown_commit_minimal_v1(
  p_subject_id uuid,
  p_receipt_id uuid
) returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $m117$
declare
  v_receipt record;
  v_item_count integer;
  v_grants integer;
  v_events integer;
  v_access integer;
  v_outbox integer;
  v_provider_effects integer;
  v_complete integer;
begin
  if p_subject_id is null or p_receipt_id is null then
    raise exception using errcode = '23514',
      message = 'M1-17 subject and receipt identity are required';
  end if;

  -- This enforces the ordinary server-resolved subject transaction contract.
  -- The backend, not the browser, must establish subject context first.
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if pg_catalog.current_setting('transaction_isolation') <> 'read committed'
     or pg_catalog.current_setting('transaction_read_only') <> 'on' then
    return 'STALE_SNAPSHOT_UNSUPPORTED';
  end if;

  select cr.id, cr.subject_id, cr.purchase_intent_id,
         pi.capability_set_id, pi.product_offer_id
    into v_receipt
  from public.commerce_receipts cr
  join public.purchase_intents pi
    on pi.id = cr.purchase_intent_id
   and pi.subject_id = cr.subject_id
   and pi.product_offer_id = cr.product_offer_id
   and pi.status = 'verified'
  join public.product_offers po on po.id = cr.product_offer_id
  join public.product_capability_sets pcs
    on pcs.id = pi.capability_set_id and pcs.product_id = po.product_id
  where cr.id = p_receipt_id and cr.subject_id = p_subject_id
    and cr.verification_status = 'verified'
    and cr.environment = 'production'
    and pi.capability_snapshot_hash is not null
    and pi.capability_snapshot_jsonb = pg_catalog.jsonb_build_object(
      'capabilitySetId',pcs.id::text,
      'definitionVersion',pcs.definition_version,
      'definitionHash',pcs.definition_hash
    );

  if not found then
    -- Same answer for unknown and someone else's Receipt (no enumeration).
    return 'SOURCE_UNAVAILABLE';
  end if;

  select count(*)::integer into v_item_count
  from public.product_capability_items pci
  where pci.capability_set_id = v_receipt.capability_set_id;

  if v_item_count <> 1 then
    return 'INCOMPLETE_OR_CONFLICTING_AUTHORITY';
  end if;

  select count(*)::integer into v_grants
  from public.entitlement_grants g
  where g.source_receipt_id = p_receipt_id;

  select count(*)::integer into v_events
  from public.entitlement_events e
  where e.source_type = 'receipt'
    and e.source_receipt_id = p_receipt_id and e.event_type = 'granted';

  select count(*)::integer into v_access
  from public.standard_reading_reader_access_grants a
  where a.purchase_intent_id = v_receipt.purchase_intent_id;

  select count(*)::integer into v_provider_effects
  from public.entitlement_events e
  join public.entitlement_grants g on g.id = e.grant_id
  where g.source_receipt_id = p_receipt_id
    and e.source_type = 'provider_event';

  select count(*)::integer into v_outbox
  from public.outbox_events ob
  join public.entitlement_events e
    on e.event_dedupe_key = ob.dedupe_key
  where e.source_type = 'receipt'
    and e.source_receipt_id = p_receipt_id
    and ob.aggregate_type = 'entitlement';

  if v_grants = 0 and v_events = 0 and v_access = 0
     and v_provider_effects = 0 and v_outbox = 0 then
    -- No visible effects may mean another first issuer is IN FLIGHT.
    -- This is strictly an observation, never permission to issue.
    return 'NO_COMMITTED_EFFECT_VISIBLE';
  end if;

  select count(*)::integer into v_complete
  from public.entitlement_grants g
  join public.product_capability_items pci
    on pci.capability_set_id = v_receipt.capability_set_id
   and pci.entitlement_key = g.entitlement_key
   and g.scope_key_norm = case when pci.scope_mode = 'global'
      then '__GLOBAL__' else pci.fixed_scope_key end
  join public.entitlement_events e on e.grant_id = g.id
    and e.source_type = 'receipt'
    and e.source_receipt_id = p_receipt_id and e.event_type = 'granted'
  join public.standard_reading_reader_access_grants a
    on a.entitlement_grant_id = g.id
   and a.purchase_intent_id = v_receipt.purchase_intent_id
   and a.subject_id = p_subject_id
  join public.purchase_intent_reader_selections sel
    on sel.purchase_intent_id = v_receipt.purchase_intent_id
   and sel.product_id = v_receipt.product_offer_id
  join public.standard_reading_official_bindings o
    on o.reading_id = a.official_reading_id and o.subject_id = p_subject_id
  where g.source_receipt_id = p_receipt_id
    and g.subject_id = p_subject_id
    and g.grant_source_type = 'purchase'
    and g.status = 'active'
    and g.valid_from <= pg_catalog.transaction_timestamp()
    and (g.valid_until is null
      or g.valid_until > pg_catalog.transaction_timestamp())
    and e.target_status = 'active'
    and e.target_valid_from is not distinct from g.valid_from
    and e.target_valid_until is not distinct from g.valid_until
    and e.effective_at is not null
    and e.event_dedupe_key is not null
    and pg_catalog.length(e.event_dedupe_key) > 0
    and a.reader_character_id = sel.reader_character_id
    and a.reader_content_bundle_id = sel.reader_content_bundle_id
    and a.request_contract_version = 'standard-reading-access-bind-v2'
    and a.request_hash ~ '^sha256:v1:[0-9a-f]{64}$';

  if v_grants = 1 and v_events = 1 and v_access = 1
     and v_provider_effects = 0 and v_outbox <= 1
     and v_complete = 1 then
    return 'COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY';
  end if;

  return 'INCOMPLETE_OR_CONFLICTING_AUTHORITY';
end;
$m117$;

comment on function public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)
is 'Read-only, subject-scoped HOLD reconciliation enum. No Receipt payload, purchase Grant IDs, timestamps, source tables or entitlement issuance exposed.';

-- SEC DEF function defaults to PUBLIC execute; close atomically in migration.
revoke all on function public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)
from public, anon, authenticated, service_role, myeongha_commerce_internal_executor;

-- User-approved narrow callable READ boundary. Underlying source tables
-- remain ACL DENY; private D2 and legacy Writer EXECUTEs remain DENY.
grant execute on function public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)
to myeongha_api_executor;

do $m117_acl$
begin
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)',
    'EXECUTE') then
    raise exception 'M1-17 API read EXECUTE missing';
  end if;
  if pg_catalog.has_function_privilege(
    'anon','public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)','EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated','public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)','EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role','public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)','EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'myeongha_commerce_internal_executor',
    'public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)','EXECUTE'
  ) then
    raise exception 'M1-17 private read leaked to public/commerce role';
  end if;
  if pg_catalog.has_table_privilege(
    'myeongha_api_executor','public.commerce_receipts','SELECT'
  ) or pg_catalog.has_table_privilege(
    'myeongha_api_executor','public.entitlement_grants','SELECT'
  ) or pg_catalog.has_table_privilege(
    'myeongha_api_executor','public.entitlement_events','SELECT'
  ) or pg_catalog.has_table_privilege(
    'myeongha_api_executor','public.standard_reading_reader_access_grants','SELECT'
  ) then
    raise exception 'M1-17 source table SELECT was broadened';
  end if;
end;
$m117_acl$;

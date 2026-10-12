-- S2 staged Provider Event revoke/expiry adapter for PURCHASE-backed Official Reader rights.
-- Watchtower-Track: db-authority-core
--
-- PRIVATE DB-owner candidate. Does not modify the original Commerce effect
-- writer and does not register with any live refund/payment callback.
-- Resolves the full set of already-bound Official Reading x Reader scopes from
-- the exact receipt-backed Grant. Scope advisory locks precede BOTH the
-- provider-event row and Grant row locks inside the original Commerce function.
--
-- Only provider_event revoked/expired transitions. Cannot cover rights created
-- after preflight by uncoordinated writers, unbound first Reading purchases,
-- or missing/ambiguous lineage. Every issuing/binding/revoking writer MUST
-- share this protocol before T2 or user-facing Reader access can be permitted.

create or replace function public.internal_apply_official_reader_provider_revoke_locked_v1(
  p_provider_event_id uuid,
  p_grant_id uuid,
  p_expected_revision bigint,
  p_expected_last_provider_ordering_key text,
  p_event_type text,
  p_effective_at timestamptz,
  p_target_status text,
  p_target_valid_from timestamptz,
  p_target_valid_until timestamptz,
  p_reason_code text
)
returns table (
  result_grant_id uuid,
  result_entitlement_event_id uuid,
  result_projection_id uuid,
  result_grant_revision bigint,
  result_projection_revision bigint,
  result_projection_changed boolean,
  result_outbox_event_id uuid,
  result_replayed boolean
)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $provider_reader_revoke$
declare
  v_subject_id uuid;
  v_receipt_id uuid;
  v_qualified_grant_id uuid;
  v_scopes_before jsonb;
  v_scopes_after jsonb;
  v_scope record;
begin
  if p_provider_event_id is null or p_grant_id is null
     or p_expected_revision is null
     or p_event_type not in ('revoked','expired')
     or p_target_status is distinct from p_event_type then
    raise exception using
      errcode = '23514',
      constraint = 'reader_provider_revoke_invalid_input',
      message = 'A qualified Provider revoke/expiry effect is required';
  end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '25001',
      constraint = 'reader_provider_revoke_requires_read_committed',
      message = 'Official Reader provider revocation requires READ COMMITTED';
  end if;

  -- Pre-lock lineage read: exact provider event -> verified receipt lineage ->
  -- original purchase Grant. The original Commerce writer re-validates every
  -- provider field, ordering key, CAS version, and entitlement transition.
  select g.subject_id, g.source_receipt_id, g.id
    into v_subject_id, v_receipt_id, v_qualified_grant_id
  from public.commerce_provider_events pe
  join public.commerce_receipts cr
    on cr.id = pe.resolved_receipt_id
   and cr.subject_id = pe.resolved_subject_id
   and cr.environment = 'production'
   and cr.verification_status in ('verified','revoked')
  join public.entitlement_grants g
    on g.id = p_grant_id
   and g.subject_id = pe.resolved_subject_id
   and g.source_receipt_id = cr.id
   and g.grant_source_type = 'purchase'
  where pe.id = p_provider_event_id
    and pe.environment = 'production'
    and pe.status in ('verified','processed')
    and pe.resolution_source_type = 'receipt'
    and pe.resolved_subject_id is not null
    and pe.resolved_receipt_id is not null;

  if v_qualified_grant_id is null or v_subject_id is null
     or v_receipt_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'reader_provider_revoke_receipt_lineage_unavailable',
      message = 'Verified Provider receipt and purchase Grant lineage is unavailable';
  end if;
  perform public.assert_myeongha_subject_context_v1(v_subject_id);

  -- Record the EXACT existing scope set. A purchase Grant can back multiple
  -- Reader access rows. Locking just the first match would be unsafe.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(a.official_reading_id::text, a.reader_character_id)
      order by a.official_reading_id, a.reader_character_id
    ), '[]'::jsonb
  ) into v_scopes_before
  from (
    select distinct a.official_reading_id, a.reader_character_id
    from public.standard_reading_reader_access_grants a
    where a.entitlement_grant_id = p_grant_id
      and a.subject_id = v_subject_id
      and a.official_reading_id is not null
      and a.reader_character_id is not null
      and pg_catalog.btrim(a.reader_character_id) <> ''
  ) a;

  if v_scopes_before = '[]'::jsonb then
    raise exception using
      errcode = 'P0001',
      constraint = 'reader_provider_revoke_unbound_scope_denied',
      message = 'Purchase Grant lacks a bound Official Reader scope';
  end if;

  -- Deterministic cross-scope lock ordering; no existing Receipt/Grant row
  -- lock has been acquired yet.
  for v_scope in
    select distinct a.official_reading_id, a.reader_character_id
    from public.standard_reading_reader_access_grants a
    where a.entitlement_grant_id = p_grant_id
      and a.subject_id = v_subject_id
    order by a.official_reading_id, a.reader_character_id
  loop
    perform public.internal_acquire_official_reader_scope_lock_v1(
      v_subject_id, v_scope.official_reading_id, v_scope.reader_character_id
    );
  end loop;

  -- Re-evaluate the complete affected-scope set AFTER all waits. A mutation
  -- of the access rows or Grant receipt lineage during the wait must fail.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(a.official_reading_id::text, a.reader_character_id)
      order by a.official_reading_id, a.reader_character_id
    ), '[]'::jsonb
  ) into v_scopes_after
  from (
    select distinct a.official_reading_id, a.reader_character_id
    from public.standard_reading_reader_access_grants a
    where a.entitlement_grant_id = p_grant_id
      and a.subject_id = v_subject_id
      and a.official_reading_id is not null
      and a.reader_character_id is not null
      and pg_catalog.btrim(a.reader_character_id) <> ''
  ) a;

  if v_scopes_after is distinct from v_scopes_before
     or not exists (
       select 1
       from public.commerce_provider_events pe
       join public.entitlement_grants g
         on g.id = p_grant_id
        and g.subject_id = pe.resolved_subject_id
        and g.source_receipt_id = pe.resolved_receipt_id
        and g.grant_source_type = 'purchase'
       where pe.id = p_provider_event_id
         and pe.resolved_receipt_id = v_receipt_id
         and pe.resolved_subject_id = v_subject_id
         and pe.resolution_source_type = 'receipt'
     ) then
    raise exception using
      errcode = '40001',
      constraint = 'reader_provider_revoke_scope_drift',
      message = 'Official Reader revocation scope changed during lock acquisition';
  end if;

  -- Original Commerce effect writer remains sole owner of CAS, ledger,
  -- projection/outbox and replay. No new direct Grant UPDATE here.
  return query
  select *
  from public.internal_apply_entitlement_effect_v1(
    'provider_event', p_provider_event_id, p_grant_id, null,
    p_expected_revision, p_expected_last_provider_ordering_key,
    p_event_type, p_effective_at, p_target_status,
    p_target_valid_from, p_target_valid_until, p_reason_code
  );
end
$provider_reader_revoke$;

revoke all on function public.internal_apply_official_reader_provider_revoke_locked_v1(
  uuid,uuid,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text
) from public;

do $private_reader_provider_revoke_acl$
declare
  v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
                      'myeongha_api_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_apply_official_reader_provider_revoke_locked_v1(uuid,uuid,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text) from %I',
      v_role
    );
  end loop;
end
$private_reader_provider_revoke_acl$;

comment on function public.internal_apply_official_reader_provider_revoke_locked_v1(
  uuid,uuid,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text
) is
'PRIVATE candidate for verified Provider revoked/expired Entitlement Effect on already-bound Official Reader access only. Deterministic all-scope advisory locks precede original Commerce provider/Grant locks. Unbound/initial Reading denied. Not wired to live callbacks; no T2/read permission.';

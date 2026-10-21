-- S2 forward-only fail-closed correction for MIXED bound/unbound purchase
-- Grants sharing ONE original verified Reader Receipt (1910, Draft).
-- Original 1770/1900 remain immutable. No PSP call, paid content, public
-- permission, or Production migration activation.
-- Watchtower-Track: db-authority-core

-- S2 actual multi-Grant dispatch entrypoint for an already VERIFIED and persisted
-- provider lifecycle event. This is NOT a webhook verifier or an API refund call.
-- Acquire every Reader scope in a single global order BEFORE any 1080 row lock.
-- Then apply each independent Receipt-backed Reader purchase Grant via 1770.
-- Non-Reader Commerce Grants are untouched (existing Commerce owner retains them).
create or replace function public.internal_dispatch_verified_official_reader_revoke_event_v1(
  p_provider_event_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=pg_catalog, public
as $reader_revoke_dispatch_s2$
declare
  v_subject uuid;
  v_receipt uuid;
  v_event_at timestamptz;
  v_scope record;
  v_grant record;
  v_scope_count integer := 0;
  v_effect_count integer := 0;
  v_effects jsonb := '[]'::jsonb;
  v_effect jsonb;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25001',
      constraint='official_reader_s2_dispatch_read_committed_required',
      message='Official Reader lifecycle dispatch requires READ COMMITTED';
  end if;
  if p_provider_event_id is null then
    raise exception using errcode='23514',
      constraint='official_reader_s2_dispatch_event_required',
      message='Verified provider event identity is required';
  end if;

  -- Stored, provider-verified lineage is the only source. Webhook signatures
  -- alone never supply cancellation authority; no caller-supplied Subject,
  -- Reading, Reader, Grant status or provider ordering may select an effect.
  select pe.resolved_subject_id, pe.resolved_receipt_id, pe.provider_occurred_at
    into v_subject, v_receipt, v_event_at
  from public.commerce_provider_events pe
  join public.commerce_receipts cr
    on cr.id=pe.resolved_receipt_id
   and cr.subject_id=pe.resolved_subject_id
   and cr.provider=pe.provider
   and cr.environment=pe.environment
  where pe.id=p_provider_event_id
    and pe.status in ('verified','processed')
    and pe.environment='production'
    and pe.resolution_source_type='receipt'
    and pe.event_type in ('Transaction.Cancelled','payment.cancelled')
    and cr.verification_status in ('verified','revoked')
    and (pe.external_transaction_id is null
      or pe.external_transaction_id=cr.external_transaction_id);
  if not found or v_subject is null or v_receipt is null
     or v_event_at is null or v_event_at>pg_catalog.clock_timestamp() then
    raise exception using errcode='P0001',
      constraint='official_reader_s2_dispatch_verified_cancellation_unavailable',
      message='Verified full-cancellation Receipt lineage is unavailable';
  end if;

  perform public.assert_myeongha_subject_context_v1(v_subject);

  -- One receipt may have several Capability Grants and several Readers.
  -- Deduplicate and sort across ALL grants so concurrent dispatches never
  -- reverse the scope-lock order through a different Grant traversal.
  for v_scope in
    select distinct a.subject_id,a.official_reading_id,a.reader_character_id
    from public.entitlement_grants eg
    join public.standard_reading_reader_access_grants a
      on a.entitlement_grant_id=eg.id and a.subject_id=eg.subject_id
    where eg.source_receipt_id=v_receipt
      and eg.subject_id=v_subject
      and eg.grant_source_type='purchase'
      and a.official_reading_id is not null
      and a.reader_character_id is not null
    order by a.subject_id,a.official_reading_id,a.reader_character_id
  loop
    perform public.internal_acquire_official_reader_scope_lock_v1(
      v_scope.subject_id,v_scope.official_reading_id,v_scope.reader_character_id
    );
    v_scope_count := v_scope_count+1;
  end loop;

  if v_scope_count=0 then
    -- No scope = no safe linearization point. Do NOT claim a successful
    -- refund or mark the event processed while purchase bind could race.
    raise exception using errcode='P0001',
      constraint='official_reader_s2_dispatch_no_reader_scope',
      message='No stored official Reader scope is available for lifecycle dispatch';
  end if;

  -- A single verified Receipt may contain several purchase Capability Grants,
  -- only SOME of which have immutable Reader Access. Previously the bound
  -- dispatch silently skipped unbound sibling Grants; its caller 1900 then
  -- marked the entire exact Receipt revoked while those rights stayed active.
  -- The original 1900 holds Purchase advisory and the ordered Reader S1 keys.
  -- Reject this mixed state BEFORE any 1080 effect. Do not partially revoke,
  -- invent a missing Reader scope, or take Receipt/Grant row locks before S1.
  -- Full mixed-Grant revocation needs a separately accepted Commerce/DB owner
  -- contract; preventing a false successful full cancellation is safe now.
  if exists (
    select 1 from public.entitlement_grants eg
    where eg.source_receipt_id=v_receipt
      and eg.subject_id=v_subject
      and eg.grant_source_type='purchase'
      and not exists (
        select 1 from public.standard_reading_reader_access_grants a
        where a.entitlement_grant_id=eg.id
          and a.subject_id=eg.subject_id
      )
  ) then
    raise exception using errcode='P0001',
      constraint='official_reader_s2_dispatch_mixed_grant_unbound_denied',
      message='Full Reader cancellation cannot skip unbound Grants of its exact Receipt';
  end if;

  -- Do not take any Grant or Receipt row lock before the ordered scope locks.
  -- Each 1770 call rereads authority AFTER scope locks, uses the existing
  -- Commerce 1080 effect/CAS and commits atomically with the whole dispatch.
  for v_grant in
    select eg.id,eg.revision,eg.last_provider_ordering_key,
           eg.last_effective_at,
           exists (
             select 1 from public.entitlement_events ee
             where ee.grant_id=eg.id
               and ee.source_provider_event_id=p_provider_event_id
               and ee.event_type='revoked'
           ) as already_applied
    from public.entitlement_grants eg
    where eg.source_receipt_id=v_receipt
      and eg.subject_id=v_subject
      and eg.grant_source_type='purchase'
      and exists (
        select 1 from public.standard_reading_reader_access_grants a
        where a.entitlement_grant_id=eg.id
          and a.subject_id=eg.subject_id
      )
    order by eg.id
  loop
    -- Existing 1080 delegates provider ordering to the caller. At minimum
    -- never rewrite an equal/newer committed Grant with an older full-cancel
    -- event. Exact provider ordering policy is still Commerce-owner territory.
    if v_grant.last_effective_at is not null
       and v_event_at<=v_grant.last_effective_at
       and not v_grant.already_applied then
      raise exception using errcode='40001',
        constraint='official_reader_s2_dispatch_stale_provider_event',
        message='Provider cancellation is not newer than the Grant lifecycle';
    end if;
    v_effect := public.internal_apply_official_reader_provider_revoke_under_scope_v1(
      p_provider_event_id,
      v_grant.id,
      v_grant.revision,
      v_grant.last_provider_ordering_key,
      v_event_at,
      'revoked',
      'verified_provider_full_cancellation'
    );
    v_effects := v_effects || pg_catalog.jsonb_build_array(v_effect);
    v_effect_count := v_effect_count+1;
  end loop;

  if v_effect_count=0 then
    raise exception using errcode='P0001',
      constraint='official_reader_s2_dispatch_grants_unavailable',
      message='No verified Reader purchase Grant is available for cancellation';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion','official-reader-s2-revoke-dispatch-v1',
    'providerEventId',p_provider_event_id,
    'scopeCount',v_scope_count,
    'grantCount',v_effect_count,
    'effects',v_effects
  );
end
$reader_revoke_dispatch_s2$;

-- No public, ordinary API, service-role or paid-reader execution permission.
revoke all on function public.internal_dispatch_verified_official_reader_revoke_event_v1(uuid)
  from public;

do $reader_s2_dispatch_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_dispatch_verified_official_reader_revoke_event_v1(uuid) from %I',
      v_role
    );
  end loop;
end
$reader_s2_dispatch_acl$;

comment on function public.internal_dispatch_verified_official_reader_revoke_event_v1(uuid) is
'Private S2 verified Reader full-cancel dispatch: acquire all bound Reader S1 locks first; deny mixed bound/unbound Grants within the SAME original Receipt before any effect to prevent partial rights revocation with a revoked Receipt. Existing 1080 remains sole effect writer; non-Reader receipts unchanged, no public activation.';

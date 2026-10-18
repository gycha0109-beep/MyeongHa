-- Existing paid Official Reading × Reader roadmap §3 S2:
-- Real verified provider-event purchase Grant REVOKE/EXPIRE writer.
-- Scope advisory lock MUST precede existing 1080 provider/Grant row locks.
-- Does not itself refund money, contact a provider, or authorize paid Reader.
-- Operate only on checked-in isolated/synthetic CI until production migration
-- history, original Owner/grantor and recovery approval are resolved.

create or replace function public.internal_apply_official_reader_provider_revoke_under_scope_v1(
  p_provider_event_id uuid,
  p_grant_id uuid,
  p_expected_revision bigint,
  p_expected_last_provider_ordering_key text,
  p_effective_at timestamptz,
  p_event_type text,
  p_reason_code text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=pg_catalog, public
as $reader_provider_revoke_s2$
declare
  v_subject uuid;
  v_scope record;
  v_scope_count bigint := 0;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_receipt_id uuid;
  v_status text;
  v_effect record;
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode='25001',
      constraint='official_reader_s2_revoke_read_committed_required',
      message='Reader purchase revoke requires a fresh READ COMMITTED snapshot';
  end if;
  if p_provider_event_id is null or p_grant_id is null or
     p_expected_revision is null or p_effective_at is null or
     (p_event_type is null or p_event_type not in ('revoked','expired')) or
     p_reason_code is null or pg_catalog.btrim(p_reason_code)='' then
    raise exception using
      errcode='23514',
      constraint='official_reader_s2_revoke_input_invalid',
      message='Reader revoke requires verified source, grant, CAS and reason';
  end if;

  -- These preliminary reads deliberately DO NOT take row locks. The original
  -- 1080 writer validates current immutable provider/receipt/Grant authority
  -- again AFTER the shared scope locks; never trust client-supplied scopes.
  select eg.subject_id,eg.source_receipt_id,eg.valid_from,eg.valid_until
    into v_subject,v_receipt_id,v_valid_from,v_valid_until
  from public.entitlement_grants eg
  where eg.id=p_grant_id and eg.grant_source_type='purchase';
  if not found or v_subject is null or v_receipt_id is null then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_revoke_purchase_grant_unavailable',
      message='Purchase-backed Reader Grant is unavailable';
  end if;

  perform public.assert_myeongha_subject_context_v1(v_subject);

  select pe.status into v_status
  from public.commerce_provider_events pe
  join public.commerce_receipts cr
    on cr.id=pe.resolved_receipt_id
   and cr.subject_id=pe.resolved_subject_id
   and cr.id=v_receipt_id
  where pe.id=p_provider_event_id
    and pe.resolution_source_type='receipt'
    and pe.resolved_subject_id=v_subject
    and pe.environment='production'
    and pe.status in ('verified','processed')
    -- Only a verified *full* cancellation can remove the entire purchase right.
    -- Partial/pending cancellations need a separate Commerce refund policy.
    and pe.event_type in ('Transaction.Cancelled','payment.cancelled')
    and cr.environment='production'
    and cr.verification_status in ('verified','revoked');
  if not found then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_revoke_provider_lineage_unavailable',
      message='Verified provider event to purchase Receipt lineage unavailable';
  end if;

  -- A single Grant can be attached to multiple Reader access records.
  -- Serialize ALL its stored official Reading × Reader scopes in a stable
  -- global ordering, before 1080 locks the provider event or Grant row.
  for v_scope in
    select distinct a.subject_id, a.official_reading_id,
           a.reader_character_id
    from public.standard_reading_reader_access_grants a
    where a.entitlement_grant_id=p_grant_id
      and a.subject_id=v_subject
      and a.official_reading_id is not null
      and a.reader_character_id is not null
    order by a.subject_id,a.official_reading_id,a.reader_character_id
  loop
    perform public.internal_acquire_official_reader_scope_lock_v1(
      v_scope.subject_id,v_scope.official_reading_id,
      v_scope.reader_character_id
    );
    v_scope_count:=v_scope_count+1;
  end loop;

  if v_scope_count=0 then
    raise exception using
      errcode='P0001',
      constraint='official_reader_s2_revoke_unbound_grant',
      message='A Reader refund requires at least one stored official access scope';
  end if;

  select * into strict v_effect
  from public.internal_apply_entitlement_effect_v1(
    'provider_event',
    p_provider_event_id,p_grant_id,null,
    p_expected_revision,p_expected_last_provider_ordering_key,
    p_event_type,p_effective_at,p_event_type,
    v_valid_from,v_valid_until,p_reason_code
  );

  return pg_catalog.jsonb_build_object(
    'contractVersion','official-reader-s2-provider-revoke-v1',
    'scopeCount',v_scope_count,
    'grantId',v_effect.result_grant_id,
    'entitlementEventId',v_effect.result_entitlement_event_id,
    'projectionId',v_effect.result_projection_id,
    'grantRevision',v_effect.result_grant_revision,
    'projectionRevision',v_effect.result_projection_revision,
    'projectionChanged',v_effect.result_projection_changed,
    'outboxEventId',v_effect.result_outbox_event_id,
    'replayed',v_effect.result_replayed
  );
end
$reader_provider_revoke_s2$;

revoke all on function public.internal_apply_official_reader_provider_revoke_under_scope_v1(
  uuid,uuid,bigint,text,timestamptz,text,text
) from public;

do $reader_s2_revoke_acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_seyeon_chat_runtime_owner')
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_apply_official_reader_provider_revoke_under_scope_v1(uuid,uuid,bigint,text,timestamptz,text,text) from %I',
      v_role
    );
  end loop;
end
$reader_s2_revoke_acl$;

comment on function public.internal_apply_official_reader_provider_revoke_under_scope_v1(
  uuid,uuid,bigint,text,timestamptz,text,text
) is
'Private actual provider-event -> Reader entitlement revoke/expire, locking all stored Subject × Official Reading × Reader scopes BEFORE the existing Commerce 1080 provider/Grant row locks. No provider refund call or public/paid permission. Older direct 1080 paths remain a migration/authority integration task.';


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
  select pe.resolved_subject_id, pe.resolved_receipt_id
    into v_subject, v_receipt
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
  if not found or v_subject is null or v_receipt is null then
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

  -- Do not take any Grant or Receipt row lock before the ordered scope locks.
  -- Each 1770 call rereads authority AFTER scope locks, uses the existing
  -- Commerce 1080 effect/CAS and commits atomically with the whole dispatch.
  for v_grant in
    select eg.id,eg.revision,eg.last_provider_ordering_key
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
    v_effect := public.internal_apply_official_reader_provider_revoke_under_scope_v1(
      p_provider_event_id,
      v_grant.id,
      v_grant.revision,
      v_grant.last_provider_ordering_key,
      pg_catalog.clock_timestamp(),
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
'Private S2 all-Reader-Grant dispatch for an already provider-verified full cancellation. Shared scope locks first, existing Commerce 1080 effects in one transaction. Other Commerce grants unchanged; no webhook verifier, no public runtime grant, no provider refund API.';

-- Forward-only replacement of existing 1770 S2 Reader scoped Effect writer.
-- Prevent a previously valid source Event from being replayed as a CURRENT
-- revoke after another event has superseded its Grant. Reuse 1080 row locks.
-- No new authority, provider call, public route, role, or production DB apply.
-- Watchtower-Track: commerce

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

  -- The 1080 Writer locks the original Provider Event then this Grant.
  -- Its idempotent replay path validates the HISTORICAL event but returns
  -- before its revision/CAS mutation branch. The same old revoked Event
  -- must not be accepted as a CURRENT revoke after a later restoration or
  -- newer effect changed this Grant. These reads are inside that lock.
  if v_effect.result_replayed is true
     and v_effect.result_entitlement_event_id is not null
     and not exists (
       select 1
       from public.entitlement_grants current_grant
       join public.entitlement_events original_effect
         on original_effect.id=v_effect.result_entitlement_event_id
        and original_effect.grant_id=current_grant.id
        and original_effect.subject_id=current_grant.subject_id
       join public.commerce_provider_events original_source
         on original_source.id=original_effect.source_provider_event_id
       where current_grant.id=p_grant_id
         and current_grant.subject_id=v_subject
         and current_grant.source_receipt_id=v_receipt_id
         and current_grant.grant_source_type='purchase'
         and current_grant.status=p_event_type
         and current_grant.last_effective_at=p_effective_at
         and current_grant.last_provider_ordering_key is not distinct from
             original_source.provider_ordering_key
         and original_effect.source_type='provider_event'
         and original_effect.source_provider_event_id=p_provider_event_id
         and original_effect.event_type=p_event_type
         and original_effect.effective_at=p_effective_at
         and original_effect.provider_ordering_key is not distinct from
             original_source.provider_ordering_key
     ) then
    raise exception using errcode='40001',
      constraint='official_reader_s2_replayed_effect_no_longer_current',
      message='Replayed Reader cancellation effect is not the current Grant state';
  end if;

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
'Private S2 Reader provider revoke/expire under canonical S1 locks and Commerce 1080 Provider/Grant row locks. A replayed historical Effect must still be the exact current Grant status, event clock and ordering provenance or fail atomically. Does not authorize public/paid access, refunds or production rollout.';



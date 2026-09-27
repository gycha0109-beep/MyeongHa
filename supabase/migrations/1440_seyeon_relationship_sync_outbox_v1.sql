-- MyeongHa PHASE O3: durable Se-yeon Production relationship sync request.
-- Watchtower-Track: character-memory
--
-- The generic outbox remains the only queue. This migration exposes narrow
-- SECURITY DEFINER wrappers that can enqueue/claim/complete only the Se-yeon
-- Production relationship sync event type. No new retry/dead-letter policy is
-- introduced; existing outbox lease claim/success completion semantics are reused.

grant select, insert, update
  on public.outbox_events
  to myeongha_relationship_apply_owner;

grant execute on function public.cmd_claim_outbox_event_v1(uuid,text,timestamptz)
  to myeongha_relationship_apply_owner;
grant execute on function public.cmd_complete_outbox_event_v1(uuid,text)
  to myeongha_relationship_apply_owner;

create or replace function public.cmd_enqueue_seyeon_relationship_sync_v1(
  p_subject_id uuid,
  p_outbox_event_id uuid,
  p_turn_id uuid,
  p_production_event_jsonb jsonb
)
returns table (
  outbox_event_id uuid,
  status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $seyeon_relationship_sync_enqueue$
declare
  v_now timestamptz := clock_timestamp();
  v_committed_message_id uuid;
  v_committed_character_id text;
  v_aggregate_id text;
  v_dedupe_key text;
  v_payload jsonb;
  v_existing public.outbox_events%rowtype;
  v_source_kind text;
  v_source_ref text;
  v_source_message_refs jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_subject_id is null
     or p_outbox_event_id is null
     or p_turn_id is null
     or jsonb_typeof(p_production_event_jsonb) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_seyeon_relationship_sync_enqueue_input_invalid',
      message = 'Se-yeon relationship sync enqueue input is incomplete';
  end if;

  select
    a.committed_message_id,
    ctc.character_id
  into
    v_committed_message_id,
    v_committed_character_id
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.id = t.committed_attempt_id
   and a.turn_id = t.id
   and a.subject_id = t.subject_id
   and a.state = 'committed'
  join public.conversation_messages m
    on m.id = a.committed_message_id
   and m.turn_id = t.id
   and m.subject_id = t.subject_id
   and m.sender_type = 'character'
  join public.conversation_thread_characters ctc
    on ctc.id = m.thread_character_id
   and ctc.thread_id = m.thread_id
  where t.id = p_turn_id
    and t.subject_id = p_subject_id
    and t.state in ('committed','delivered')
    and t.committed_at is not null;

  if not found
     or v_committed_message_id is null
     or v_committed_character_id is distinct from 'seyeon' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_seyeon_relationship_sync_turn_not_committed',
      message = 'relationship sync request requires an authoritative committed Se-yeon turn';
  end if;

  if p_production_event_jsonb ->> 'schemaVersion'
       is distinct from 'relationship-event-v1'
     or p_production_event_jsonb ->> 'authority'
       is distinct from 'authorized_relationship_event_v1'
     or p_production_event_jsonb ->> 'subjectId'
       is distinct from p_subject_id::text
     or p_production_event_jsonb ->> 'characterId'
       is distinct from 'seyeon'
     or p_production_event_jsonb ->> 'eventSchemaVersion'
       is distinct from '1'
     or nullif(btrim(p_production_event_jsonb ->> 'eventId'), '') is null
     or nullif(btrim(p_production_event_jsonb ->> 'dedupeKey'), '') is null
     or jsonb_typeof(p_production_event_jsonb -> 'source') is distinct from 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_seyeon_relationship_sync_event_invalid',
      message = 'outbox accepts only an admitted Production relationship Event for this Subject and Se-yeon';
  end if;

  v_source_kind := p_production_event_jsonb #>> '{source,sourceKind}';
  v_source_ref := p_production_event_jsonb #>> '{source,sourceRef}';
  v_source_message_refs :=
    p_production_event_jsonb #> '{source,sourceMessageRefs}';

  if jsonb_typeof(v_source_message_refs) is distinct from 'array' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_seyeon_relationship_sync_source_invalid',
      message = 'Production relationship Event sourceMessageRefs must be an explicit array';
  end if;

  if v_source_kind = 'conversation_turn'
     and v_source_ref is distinct from p_turn_id::text then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_seyeon_relationship_sync_source_invalid',
      message = 'conversation relationship Event must reference the exact committed turn';
  end if;

  if p_production_event_jsonb ->> 'eventKind' in (
       'CARE_ACCEPTED_BY_CHARACTER',
       'CARE_REQUESTED_BY_CHARACTER',
       'CHARACTER_SELF_DISCLOSURE',
       'CHARACTER_VULNERABILITY_REVEALED'
     )
     and not exists (
       select 1
       from jsonb_array_elements_text(v_source_message_refs) r(value)
       where r.value = v_committed_message_id::text
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_seyeon_relationship_sync_guarded_output_missing',
      message = 'character-output relationship Event must retain the exact committed Se-yeon message ref';
  end if;

  v_aggregate_id := p_subject_id::text || ':seyeon';
  v_dedupe_key := p_production_event_jsonb ->> 'dedupeKey';
  v_payload := jsonb_build_object(
    'schemaVersion','seyeon-production-relationship-sync-request-v1',
    'subjectId',p_subject_id::text,
    'characterId','seyeon',
    'turnId',p_turn_id::text,
    'committedAssistantMessageRef',v_committed_message_id::text,
    'productionEvent',p_production_event_jsonb
  );

  select oe.*
    into v_existing
  from public.outbox_events oe
  where oe.aggregate_type = 'character_relationship'
    and oe.aggregate_id = v_aggregate_id
    and oe.event_type = 'SEYEON_PRODUCTION_RELATIONSHIP_SYNC_REQUESTED'
    and oe.dedupe_key = v_dedupe_key;

  if found then
    if v_existing.event_schema_version is distinct from 'v1'
       or v_existing.payload_jsonb is distinct from v_payload then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_seyeon_relationship_sync_idempotency_conflict',
        message = 'relationship sync dedupe key already exists with different admitted Event material';
    end if;

    return query
    select v_existing.id, v_existing.status, true;
    return;
  end if;

  insert into public.outbox_events(
    id,
    aggregate_type,
    aggregate_id,
    event_type,
    event_schema_version,
    dedupe_key,
    payload_jsonb,
    status,
    attempt_count,
    available_at,
    created_at
  ) values (
    p_outbox_event_id,
    'character_relationship',
    v_aggregate_id,
    'SEYEON_PRODUCTION_RELATIONSHIP_SYNC_REQUESTED',
    'v1',
    v_dedupe_key,
    v_payload,
    'pending',
    0,
    v_now,
    v_now
  );

  return query
  select p_outbox_event_id, 'pending'::text, false;
end
$seyeon_relationship_sync_enqueue$;

create or replace function public.cmd_claim_seyeon_relationship_sync_v1(
  p_subject_id uuid,
  p_outbox_event_id uuid,
  p_lock_owner text,
  p_lease_expires_at timestamptz
)
returns table (
  outbox_event_id uuid,
  production_event_jsonb jsonb,
  status text,
  lock_owner text,
  lease_expires_at timestamptz,
  reclaimed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $seyeon_relationship_sync_claim$
declare
  v_row public.outbox_events%rowtype;
  v_claim record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select oe.*
    into v_row
  from public.outbox_events oe
  where oe.id = p_outbox_event_id;

  if not found
     or v_row.aggregate_type is distinct from 'character_relationship'
     or v_row.aggregate_id is distinct from (p_subject_id::text || ':seyeon')
     or v_row.event_type
          is distinct from 'SEYEON_PRODUCTION_RELATIONSHIP_SYNC_REQUESTED'
     or v_row.event_schema_version is distinct from 'v1'
     or v_row.payload_jsonb ->> 'schemaVersion'
          is distinct from 'seyeon-production-relationship-sync-request-v1'
     or v_row.payload_jsonb ->> 'subjectId'
          is distinct from p_subject_id::text
     or v_row.payload_jsonb ->> 'characterId'
          is distinct from 'seyeon'
     or jsonb_typeof(v_row.payload_jsonb -> 'productionEvent')
          is distinct from 'object' then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_seyeon_relationship_sync_claim_ineligible',
      message = 'outbox event is not an eligible Se-yeon Production relationship sync request';
  end if;

  select *
    into v_claim
  from public.cmd_claim_outbox_event_v1(
    p_outbox_event_id,
    p_lock_owner,
    p_lease_expires_at
  );

  return query
  select
    v_claim.outbox_event_id,
    v_row.payload_jsonb -> 'productionEvent',
    v_claim.status,
    v_claim.lock_owner,
    v_claim.lease_expires_at,
    v_claim.reclaimed;
end
$seyeon_relationship_sync_claim$;

create or replace function public.cmd_complete_seyeon_relationship_sync_v1(
  p_subject_id uuid,
  p_outbox_event_id uuid,
  p_lock_owner text
)
returns table (
  outbox_event_id uuid,
  status text,
  processed_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $seyeon_relationship_sync_complete$
declare
  v_row public.outbox_events%rowtype;
  v_completed record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select oe.*
    into v_row
  from public.outbox_events oe
  where oe.id = p_outbox_event_id;

  if not found
     or v_row.aggregate_type is distinct from 'character_relationship'
     or v_row.aggregate_id is distinct from (p_subject_id::text || ':seyeon')
     or v_row.event_type
          is distinct from 'SEYEON_PRODUCTION_RELATIONSHIP_SYNC_REQUESTED' then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_seyeon_relationship_sync_complete_ineligible',
      message = 'outbox event is not an eligible Se-yeon Production relationship sync request';
  end if;

  select *
    into v_completed
  from public.cmd_complete_outbox_event_v1(
    p_outbox_event_id,
    p_lock_owner
  );

  return query
  select
    v_completed.outbox_event_id,
    v_completed.status,
    v_completed.processed_at,
    v_completed.replayed;
end
$seyeon_relationship_sync_complete$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.cmd_enqueue_seyeon_relationship_sync_v1(
  uuid,uuid,uuid,jsonb
) owner to myeongha_relationship_apply_owner;
alter function public.cmd_claim_seyeon_relationship_sync_v1(
  uuid,uuid,text,timestamptz
) owner to myeongha_relationship_apply_owner;
alter function public.cmd_complete_seyeon_relationship_sync_v1(
  uuid,uuid,text
) owner to myeongha_relationship_apply_owner;

revoke all on function public.cmd_enqueue_seyeon_relationship_sync_v1(
  uuid,uuid,uuid,jsonb
) from public;
revoke all on function public.cmd_claim_seyeon_relationship_sync_v1(
  uuid,uuid,text,timestamptz
) from public;
revoke all on function public.cmd_complete_seyeon_relationship_sync_v1(
  uuid,uuid,text
) from public;

do $seyeon_relationship_sync_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_enqueue_seyeon_relationship_sync_v1(uuid,uuid,uuid,jsonb) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.cmd_claim_seyeon_relationship_sync_v1(uuid,uuid,text,timestamptz) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.cmd_complete_seyeon_relationship_sync_v1(uuid,uuid,text) from %I',
      v_role
    );
  end loop;
end
$seyeon_relationship_sync_acl$;

grant execute on function public.cmd_enqueue_seyeon_relationship_sync_v1(
  uuid,uuid,uuid,jsonb
) to myeongha_api_executor;
grant execute on function public.cmd_claim_seyeon_relationship_sync_v1(
  uuid,uuid,text,timestamptz
) to myeongha_api_executor;
grant execute on function public.cmd_complete_seyeon_relationship_sync_v1(
  uuid,uuid,text
) to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.cmd_enqueue_seyeon_relationship_sync_v1(
  uuid,uuid,uuid,jsonb
) is
  'PHASE O durable fallback: enqueue only an already-admitted generic Production Relationship Event for an authoritative committed Se-yeon turn.';

comment on function public.cmd_claim_seyeon_relationship_sync_v1(
  uuid,uuid,text,timestamptz
) is
  'PHASE O narrow wrapper over the existing outbox lease claim authority for Se-yeon Production relationship sync only.';

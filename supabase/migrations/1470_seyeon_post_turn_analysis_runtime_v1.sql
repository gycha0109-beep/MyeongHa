-- MyeongHa PHASE Q: durable Se-yeon post-turn analysis handoff.
-- Watchtower-Track: character-memory
--
-- The ordinary CHAT_TURN_COMMITTED outbox row remains available to its generic
-- downstream publisher. A second dedicated outbox row is inserted in the same
-- Chat commit transaction and is owned exclusively by the Se-yeon post-turn
-- worker. No failure/backoff/dead-letter policy is invented here; the existing
-- claim/reclaim + successful completion boundaries are reused.

DO $$
DECLARE
  v_owner_oid oid;
  v_server_version_num integer := current_setting('server_version_num')::integer;
  v_membership_count integer;
  v_expected_admin_count integer;
  v_current_user_superuser boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_seyeon_post_turn_owner'
  ) THEN
    CREATE ROLE myeongha_seyeon_post_turn_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  SELECT r.oid
  INTO v_owner_oid
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_seyeon_post_turn_owner'
    AND NOT r.rolcanlogin
    AND NOT r.rolsuper
    AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole
    AND NOT r.rolinherit
    AND NOT r.rolreplication
    AND NOT r.rolbypassrls;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'myeongha_seyeon_post_turn_owner is outside the least-privilege role contract';
  END IF;

  SELECT r.rolsuper
  INTO STRICT v_current_user_superuser
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = CURRENT_USER;

  SELECT count(*)
  INTO v_membership_count
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = v_owner_oid;

  IF v_server_version_num >= 160000 THEN
    IF v_current_user_superuser THEN
      IF v_membership_count <> 0 THEN
        RAISE EXCEPTION 'myeongha_seyeon_post_turn_owner has unexpected PostgreSQL 16+ superuser membership';
      END IF;
    ELSE
      SELECT count(*)
      INTO v_expected_admin_count
      FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles member_role
        ON member_role.oid = m.member
      JOIN pg_catalog.pg_roles grantor_role
        ON grantor_role.oid = m.grantor
      WHERE m.roleid = v_owner_oid
        AND member_role.rolname = CURRENT_USER
        AND m.admin_option
        AND NOT m.inherit_option
        AND NOT m.set_option
        AND grantor_role.rolsuper;

      IF v_membership_count <> 1 OR v_expected_admin_count <> 1 THEN
        RAISE EXCEPTION 'myeongha_seyeon_post_turn_owner has unexpected PostgreSQL 16+ creator membership';
      END IF;
    END IF;
  ELSIF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_seyeon_post_turn_owner has unexpected pre-PostgreSQL-16 membership';
  END IF;
END
$$;

grant usage on schema public to myeongha_seyeon_post_turn_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_seyeon_post_turn_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_seyeon_post_turn_owner;
grant execute on function public.cmd_claim_outbox_event_v1(uuid,text,timestamptz)
  to myeongha_seyeon_post_turn_owner;
grant execute on function public.cmd_complete_outbox_event_v1(uuid,text)
  to myeongha_seyeon_post_turn_owner;

grant select, update on public.outbox_events
  to myeongha_seyeon_post_turn_owner;
grant select on public.chat_turns
  to myeongha_seyeon_post_turn_owner;
grant select on public.chat_turn_attempts
  to myeongha_seyeon_post_turn_owner;
grant select on public.conversation_messages
  to myeongha_seyeon_post_turn_owner;
grant select on public.conversation_thread_characters
  to myeongha_seyeon_post_turn_owner;

drop policy if exists outbox_events_seyeon_post_turn_select_v1
  on public.outbox_events;
create policy outbox_events_seyeon_post_turn_select_v1
on public.outbox_events
for select
to myeongha_seyeon_post_turn_owner
using (
  aggregate_type = 'chat_turn'
  and event_type = 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
  and event_schema_version = 'v1'
  and dedupe_key = 'seyeon-post-turn-v1'
  and payload_jsonb ->> 'schemaVersion'
        = 'seyeon-post-turn-analysis-request-v1'
  and payload_jsonb ->> 'subjectId'
        = public.current_myeongha_subject_id()::text
  and payload_jsonb ->> 'characterId' = 'seyeon'
  and payload_jsonb ->> 'turnId' = aggregate_id
  and exists (
    select 1
    from public.chat_turns ct
    where ct.id::text = aggregate_id
      and ct.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists outbox_events_seyeon_post_turn_update_v1
  on public.outbox_events;
create policy outbox_events_seyeon_post_turn_update_v1
on public.outbox_events
for update
to myeongha_seyeon_post_turn_owner
using (
  aggregate_type = 'chat_turn'
  and event_type = 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
  and event_schema_version = 'v1'
  and dedupe_key = 'seyeon-post-turn-v1'
  and payload_jsonb ->> 'schemaVersion'
        = 'seyeon-post-turn-analysis-request-v1'
  and payload_jsonb ->> 'subjectId'
        = public.current_myeongha_subject_id()::text
  and payload_jsonb ->> 'characterId' = 'seyeon'
  and payload_jsonb ->> 'turnId' = aggregate_id
)
with check (
  aggregate_type = 'chat_turn'
  and event_type = 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
  and event_schema_version = 'v1'
  and dedupe_key = 'seyeon-post-turn-v1'
  and payload_jsonb ->> 'schemaVersion'
        = 'seyeon-post-turn-analysis-request-v1'
  and payload_jsonb ->> 'subjectId'
        = public.current_myeongha_subject_id()::text
  and payload_jsonb ->> 'characterId' = 'seyeon'
  and payload_jsonb ->> 'turnId' = aggregate_id
);

drop policy if exists chat_turns_seyeon_post_turn_select_v1
  on public.chat_turns;
create policy chat_turns_seyeon_post_turn_select_v1
on public.chat_turns
for select
to myeongha_seyeon_post_turn_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists chat_turn_attempts_seyeon_post_turn_select_v1
  on public.chat_turn_attempts;
create policy chat_turn_attempts_seyeon_post_turn_select_v1
on public.chat_turn_attempts
for select
to myeongha_seyeon_post_turn_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_messages_seyeon_post_turn_select_v1
  on public.conversation_messages;
create policy conversation_messages_seyeon_post_turn_select_v1
on public.conversation_messages
for select
to myeongha_seyeon_post_turn_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists conversation_thread_characters_seyeon_post_turn_select_v1
  on public.conversation_thread_characters;
create policy conversation_thread_characters_seyeon_post_turn_select_v1
on public.conversation_thread_characters
for select
to myeongha_seyeon_post_turn_owner
using (
  exists (
    select 1
    from public.conversation_threads ct
    where ct.id = conversation_thread_characters.thread_id
      and ct.subject_id = public.current_myeongha_subject_id()
  )
);

-- The Chat runtime owner already owns the validated Chat commit boundary. This
-- second INSERT policy allows it to atomically enqueue only the dedicated
-- post-turn analysis request for the exact committed Se-yeon turn.
drop policy if exists outbox_events_seyeon_post_turn_enqueue_v1
  on public.outbox_events;
create policy outbox_events_seyeon_post_turn_enqueue_v1
on public.outbox_events
for insert
to myeongha_seyeon_chat_runtime_owner
with check (
  aggregate_type = 'chat_turn'
  and event_type = 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
  and event_schema_version = 'v1'
  and dedupe_key = 'seyeon-post-turn-v1'
  and status = 'pending'
  and attempt_count = 0
  and payload_jsonb ->> 'schemaVersion'
        = 'seyeon-post-turn-analysis-request-v1'
  and payload_jsonb ->> 'subjectId'
        = public.current_myeongha_subject_id()::text
  and payload_jsonb ->> 'characterId' = 'seyeon'
  and payload_jsonb ->> 'turnId' = aggregate_id
  and payload_jsonb #>> '{snapshot,schemaVersion}'
        = 'seyeon-post-turn-analysis-snapshot-v1'
  and payload_jsonb #>> '{snapshot,turnId}' = aggregate_id
  and payload_jsonb #>> '{snapshot,userMessageId}'
        = payload_jsonb ->> 'userMessageId'
  and payload_jsonb #>> '{snapshot,assistantMessageId}'
        = payload_jsonb ->> 'assistantMessageId'
  and nullif(btrim(payload_jsonb ->> 'snapshotHash'), '') is not null
);

create or replace function public.cmd_commit_seyeon_chat_turn_runtime_v2(
  p_subject_id uuid,
  p_thread_id uuid,
  p_turn_id uuid,
  p_attempt_id uuid,
  p_message_id uuid,
  p_chat_outbox_event_id uuid,
  p_post_turn_outbox_event_id uuid,
  p_post_turn_snapshot_jsonb jsonb,
  p_post_turn_snapshot_hash text
)
returns table (
  turn_id uuid,
  attempt_id uuid,
  assistant_message_id uuid,
  sequence_no bigint,
  committed_at timestamptz,
  post_turn_outbox_event_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_seyeon_chat_turn_runtime_v2$
declare
  v_commit record;
  v_user_message_id uuid;
  v_existing public.outbox_events%rowtype;
  v_payload jsonb;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_post_turn_outbox_event_id is null
     or jsonb_typeof(p_post_turn_snapshot_jsonb) is distinct from 'object'
     or p_post_turn_snapshot_jsonb ->> 'schemaVersion'
          is distinct from 'seyeon-post-turn-analysis-snapshot-v1'
     or p_post_turn_snapshot_jsonb ->> 'turnId'
          is distinct from p_turn_id::text
     or p_post_turn_snapshot_jsonb ->> 'assistantMessageId'
          is distinct from p_message_id::text
     or nullif(btrim(p_post_turn_snapshot_hash), '') is null then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_post_turn_snapshot_invalid',
      message = 'Se-yeon post-turn analysis snapshot is incomplete or mismatched';
  end if;

  select *
  into strict v_commit
  from public.cmd_commit_seyeon_chat_turn_runtime_v1(
    p_subject_id,
    p_thread_id,
    p_turn_id,
    p_attempt_id,
    p_message_id,
    p_chat_outbox_event_id
  );

  select m.id
  into v_user_message_id
  from public.conversation_messages m
  where m.turn_id = v_commit.turn_id
    and m.subject_id = p_subject_id
    and m.sender_type = 'user'
    and m.redacted_at is null;

  if not found or v_user_message_id is null
     or p_post_turn_snapshot_jsonb ->> 'userMessageId'
          is distinct from v_user_message_id::text then
    raise exception using
      errcode = '23514',
      constraint = 'seyeon_post_turn_user_message_mismatch',
      message = 'Se-yeon post-turn snapshot does not bind the authoritative user message';
  end if;

  v_payload := jsonb_build_object(
    'schemaVersion','seyeon-post-turn-analysis-request-v1',
    'subjectId',p_subject_id::text,
    'characterId','seyeon',
    'turnId',v_commit.turn_id::text,
    'attemptId',v_commit.attempt_id::text,
    'userMessageId',v_user_message_id::text,
    'assistantMessageId',v_commit.assistant_message_id::text,
    'snapshotHash',btrim(p_post_turn_snapshot_hash),
    'snapshot',p_post_turn_snapshot_jsonb
  );

  select oe.*
  into v_existing
  from public.outbox_events oe
  where oe.aggregate_type = 'chat_turn'
    and oe.aggregate_id = v_commit.turn_id::text
    and oe.event_type = 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
    and oe.dedupe_key = 'seyeon-post-turn-v1';

  if found then
    if v_existing.event_schema_version is distinct from 'v1'
       or v_existing.payload_jsonb is distinct from v_payload then
      raise exception using
        errcode = '23514',
        constraint = 'seyeon_post_turn_enqueue_idempotency_conflict',
        message = 'Post-turn analysis request already exists with different immutable material';
    end if;

    return query
    select
      v_commit.turn_id,
      v_commit.attempt_id,
      v_commit.assistant_message_id,
      v_commit.sequence_no,
      v_commit.committed_at,
      v_existing.id,
      true;
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
    p_post_turn_outbox_event_id,
    'chat_turn',
    v_commit.turn_id::text,
    'SEYEON_POST_TURN_ANALYSIS_REQUESTED',
    'v1',
    'seyeon-post-turn-v1',
    v_payload,
    'pending',
    0,
    v_now,
    v_now
  );

  return query
  select
    v_commit.turn_id,
    v_commit.attempt_id,
    v_commit.assistant_message_id,
    v_commit.sequence_no,
    v_commit.committed_at,
    p_post_turn_outbox_event_id,
    v_commit.replayed;
end
$commit_seyeon_chat_turn_runtime_v2$;

create or replace function public.cmd_claim_seyeon_post_turn_analysis_v1(
  p_subject_id uuid,
  p_outbox_event_id uuid,
  p_lock_owner text,
  p_lease_expires_at timestamptz
)
returns table (
  outbox_event_id uuid,
  turn_id uuid,
  attempt_id uuid,
  user_message_id uuid,
  user_text text,
  assistant_message_id uuid,
  assistant_text text,
  committed_at timestamptz,
  snapshot_jsonb jsonb,
  snapshot_hash text,
  status text,
  lock_owner text,
  lease_expires_at timestamptz,
  reclaimed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $claim_seyeon_post_turn_analysis$
declare
  v_row public.outbox_events%rowtype;
  v_claim record;
  v_turn_id uuid;
  v_attempt_id uuid;
  v_user_message_id uuid;
  v_assistant_message_id uuid;
  v_user_text text;
  v_assistant_text text;
  v_committed_at timestamptz;
  v_character_id text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select oe.*
  into v_row
  from public.outbox_events oe
  where oe.id = p_outbox_event_id;

  if not found
     or v_row.aggregate_type is distinct from 'chat_turn'
     or v_row.event_type is distinct from 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
     or v_row.event_schema_version is distinct from 'v1'
     or v_row.dedupe_key is distinct from 'seyeon-post-turn-v1'
     or v_row.payload_jsonb ->> 'schemaVersion'
          is distinct from 'seyeon-post-turn-analysis-request-v1'
     or v_row.payload_jsonb ->> 'subjectId'
          is distinct from p_subject_id::text
     or v_row.payload_jsonb ->> 'characterId' is distinct from 'seyeon'
     or jsonb_typeof(v_row.payload_jsonb -> 'snapshot')
          is distinct from 'object'
     or nullif(btrim(v_row.payload_jsonb ->> 'snapshotHash'), '') is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_seyeon_post_turn_claim_ineligible',
      message = 'outbox event is not an eligible Se-yeon post-turn analysis request';
  end if;

  v_turn_id := (v_row.payload_jsonb ->> 'turnId')::uuid;
  v_attempt_id := (v_row.payload_jsonb ->> 'attemptId')::uuid;
  v_user_message_id := (v_row.payload_jsonb ->> 'userMessageId')::uuid;
  v_assistant_message_id := (v_row.payload_jsonb ->> 'assistantMessageId')::uuid;

  select
    t.committed_at,
    ctc.character_id,
    um.body_text,
    am.body_text
  into
    v_committed_at,
    v_character_id,
    v_user_text,
    v_assistant_text
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.id = v_attempt_id
   and a.turn_id = t.id
   and a.subject_id = t.subject_id
   and a.state = 'committed'
   and a.committed_message_id = v_assistant_message_id
  join public.conversation_messages um
    on um.id = v_user_message_id
   and um.turn_id = t.id
   and um.subject_id = t.subject_id
   and um.sender_type = 'user'
   and um.redacted_at is null
  join public.conversation_messages am
    on am.id = v_assistant_message_id
   and am.turn_id = t.id
   and am.subject_id = t.subject_id
   and am.sender_type = 'character'
   and am.redacted_at is null
  join public.conversation_thread_characters ctc
    on ctc.id = am.thread_character_id
   and ctc.thread_id = am.thread_id
  where t.id = v_turn_id
    and t.subject_id = p_subject_id
    and t.state in ('committed','delivered')
    and t.committed_attempt_id = v_attempt_id
    and t.committed_at is not null;

  if not found
     or v_character_id is distinct from 'seyeon'
     or v_committed_at is null
     or v_user_text is null
     or v_assistant_text is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_seyeon_post_turn_committed_material_invalid',
      message = 'Post-turn analysis request is not bound to an authoritative committed Se-yeon turn';
  end if;

  select *
  into strict v_claim
  from public.cmd_claim_outbox_event_v1(
    p_outbox_event_id,
    p_lock_owner,
    p_lease_expires_at
  );

  return query
  select
    v_claim.outbox_event_id,
    v_turn_id,
    v_attempt_id,
    v_user_message_id,
    v_user_text,
    v_assistant_message_id,
    v_assistant_text,
    v_committed_at,
    v_row.payload_jsonb -> 'snapshot',
    v_row.payload_jsonb ->> 'snapshotHash',
    v_claim.status,
    v_claim.lock_owner,
    v_claim.lease_expires_at,
    v_claim.reclaimed;
end
$claim_seyeon_post_turn_analysis$;

create or replace function public.cmd_complete_seyeon_post_turn_analysis_v1(
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
as $complete_seyeon_post_turn_analysis$
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
     or v_row.aggregate_type is distinct from 'chat_turn'
     or v_row.event_type is distinct from 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
     or v_row.event_schema_version is distinct from 'v1'
     or v_row.payload_jsonb ->> 'subjectId'
          is distinct from p_subject_id::text then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_seyeon_post_turn_complete_ineligible',
      message = 'outbox event is not an eligible Se-yeon post-turn analysis request';
  end if;

  select *
  into strict v_completed
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
$complete_seyeon_post_turn_analysis$;

-- Transfer the new wrappers to their dedicated owners.
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_commit_seyeon_chat_turn_runtime_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function public.cmd_commit_seyeon_chat_turn_runtime_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text
) from public;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;

grant myeongha_seyeon_post_turn_owner to current_user;
grant create on schema public to myeongha_seyeon_post_turn_owner;
alter function public.cmd_claim_seyeon_post_turn_analysis_v1(
  uuid,uuid,text,timestamptz
) owner to myeongha_seyeon_post_turn_owner;
alter function public.cmd_complete_seyeon_post_turn_analysis_v1(
  uuid,uuid,text
) owner to myeongha_seyeon_post_turn_owner;
revoke all on function public.cmd_claim_seyeon_post_turn_analysis_v1(
  uuid,uuid,text,timestamptz
) from public;
revoke all on function public.cmd_complete_seyeon_post_turn_analysis_v1(
  uuid,uuid,text
) from public;

DO $acl$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon','authenticated','service_role')
  LOOP
    execute pg_catalog.format(
      'revoke all on function public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.cmd_claim_seyeon_post_turn_analysis_v1(uuid,uuid,text,timestamptz) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.cmd_complete_seyeon_post_turn_analysis_v1(uuid,uuid,text) from %I',
      v_role
    );
  END LOOP;
END
$acl$;

grant execute on function public.cmd_commit_seyeon_chat_turn_runtime_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text
) to myeongha_api_executor;
grant execute on function public.cmd_claim_seyeon_post_turn_analysis_v1(
  uuid,uuid,text,timestamptz
) to myeongha_api_executor;
grant execute on function public.cmd_complete_seyeon_post_turn_analysis_v1(
  uuid,uuid,text
) to myeongha_api_executor;

revoke create on schema public from myeongha_seyeon_post_turn_owner;
revoke myeongha_seyeon_post_turn_owner from current_user;

DO $postcheck$
DECLARE
  v_owner oid;
  v_member_count integer;
BEGIN
  SELECT oid
  INTO STRICT v_owner
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_seyeon_post_turn_owner'
    AND NOT rolcanlogin
    AND NOT rolsuper
    AND NOT rolcreatedb
    AND NOT rolcreaterole
    AND NOT rolinherit
    AND NOT rolreplication
    AND NOT rolbypassrls;

  SELECT count(*)
  INTO v_member_count
  FROM pg_catalog.pg_auth_members
  WHERE roleid = v_owner;

  IF current_setting('server_version_num')::integer < 160000
     AND v_member_count <> 0 THEN
    RAISE EXCEPTION 'myeongha_seyeon_post_turn_owner retained unexpected membership';
  END IF;

  IF NOT has_schema_privilege(
    'myeongha_seyeon_post_turn_owner','public','USAGE'
  ) OR has_schema_privilege(
    'myeongha_seyeon_post_turn_owner','public','CREATE'
  ) THEN
    RAISE EXCEPTION 'myeongha_seyeon_post_turn_owner retained unexpected schema privilege';
  END IF;
END
$postcheck$;

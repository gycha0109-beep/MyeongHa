-- Watchtower-Track: character-memory
-- R3 G2 candidate: the REAL v2 -> v1 -> core Chat Commit + BOTH outboxes,
-- protected by exact original Grant, immutable DB SourceSet and the same Tx.
-- ONLY install in the isolated named CI PostgreSQL database.
-- Do NOT copy this 1640 trigger experiment into Production: Owner signoff,
-- SRC-25, full stage ancestry, DR and public Replay policy remain OPEN.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test'
     or current_setting('server_version_num')::integer < 150000
     or to_regprocedure('public.tr_seyeon_zero_source_pin_immutable_v1()') is null
     or to_regprocedure(
       'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)'
     ) is null then
    raise exception 'R3 positive real-v2 experiment requires the disposable reviewed baseline';
  end if;
end $guard$;

-- Inserted only by the DB-side SECURITY DEFINER G2 transaction after a
-- locked current-rights recheck. Never writable or readable by API executor.
create table seyeon_positive_candidate.actual_v2_commit_admissions_r3 (
  attempt_id uuid primary key references public.chat_turn_attempts(id),
  subject_id uuid not null references public.subjects(id),
  thread_id uuid not null references public.conversation_threads(id),
  turn_id uuid not null references public.chat_turns(id),
  source_selection_digest text not null
    check (source_selection_digest ~ '^sha256:v1:[a-f0-9]{64}$'),
  record_id uuid not null references public.memory_items(id),
  original_grant_id uuid not null references public.record_access_grants(id),
  pg_payload_digest text not null
    check (pg_payload_digest ~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'),
  admitted_at timestamptz not null default clock_timestamp()
);
create trigger immutable_actual_v2_commit_admission_r3
before update or delete on seyeon_positive_candidate.actual_v2_commit_admissions_r3
for each row execute function seyeon_positive_candidate.reject_r1_source_rewrite();

-- We REPLACE the existing 1640 trigger FUNCTION only in a disposable DB.
-- Zero-source validation remains exactly the existing 1640 rule.
-- Positive transitions require a DB-issued, unforgeable-to-API admission row
-- from the SAME transaction, immutable pinned source ancestry, and a matching
-- validation proof; direct v1/v2 API EXECUTE will also be removed.
create or replace function public.tr_seyeon_zero_source_pin_immutable_v1()
returns trigger language plpgsql security definer
set search_path = pg_catalog,public,seyeon_positive_candidate
as $r3_trigger$
declare
  v_admit seyeon_positive_candidate.actual_v2_commit_admissions_r3%rowtype;
  v_pin seyeon_positive_candidate.attempt_source_pins%rowtype;
  v_expected jsonb;
begin
  if old.seyeon_personal_source_pin_jsonb is not null and
     (old.seyeon_personal_source_pin_jsonb is distinct from
         new.seyeon_personal_source_pin_jsonb or
      old.seyeon_personal_source_pinned_at is distinct from
         new.seyeon_personal_source_pinned_at) then
    raise exception using errcode='23514',
      constraint='seyeon_source_pin_immutable',
      message='Se-yeon attempt source pin cannot be changed';
  end if;
  if old.seyeon_personal_source_pin_jsonb is null and
     new.seyeon_personal_source_pin_jsonb is not null and
     (old.state <> 'running' or new.state <> 'running') then
    raise exception using errcode='23514',
      constraint='seyeon_source_pin_must_precede_generation',
      message='Se-yeon source pin must be stored during running state';
  end if;

  if old.state = 'validated' and new.state = 'committed'
     and new.planner_version = 'seyeon-production-chat-planner-v1' then
    if old.seyeon_personal_source_pin_jsonb is not null then
      -- The original 1640 zero-only branch is intentionally unchanged.
      if old.seyeon_personal_source_pin_jsonb #> '{zeroProof,records}' <>
           '[]'::jsonb or
         old.validation_result_jsonb -> 'personalRecordProvenance'
           is distinct from old.seyeon_personal_source_pin_jsonb -> 'zeroProof'
      then
        raise exception using errcode='23514',
          constraint='seyeon_commit_requires_original_zero_source_pin';
      end if;
    else
      -- A positive source without DB-owned same-Tx admission is NEVER a
      -- substitute for a zero Pin. Reject missing/forged/uncommitted mode.
      select * into v_admit
      from seyeon_positive_candidate.actual_v2_commit_admissions_r3
      where attempt_id=old.id and subject_id=old.subject_id;
      select * into v_pin
      from seyeon_positive_candidate.attempt_source_pins
      where attempt_id=old.id and subject_id=old.subject_id
        and state='pinned';
      if v_admit.attempt_id is null or v_pin.attempt_id is null
         or v_admit.turn_id is distinct from old.turn_id
         or v_admit.record_id is distinct from v_pin.original_memory_id
         or v_admit.original_grant_id is distinct from v_pin.original_grant_id
         or v_admit.pg_payload_digest is distinct from v_pin.original_raw_digest
         or (select count(*) from seyeon_positive_candidate.source_edges_r1
             where attempt_id=old.id) <> 1 then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r3_requires_db_original_grant_admission';
      end if;
      v_expected := jsonb_build_object(
        'schemaVersion','offline-positive-original-source-proof-r3',
        'recordId',v_admit.record_id::text,
        'originalGrantId',v_admit.original_grant_id::text,
        'selectedSourcesDigest',v_admit.source_selection_digest,
        'pgPayloadDigest',v_admit.pg_payload_digest
      );
      if old.validation_result_jsonb -> 'personalRecordProvenance'
           is distinct from v_expected then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r3_validation_source_mismatch';
      end if;
    end if;
  end if;
  return new;
end $r3_trigger$;

-- The existing v2 remains the unchanged REAL production function;
-- this disposable wrapper is the only API-login positive Commit entrypoint.
-- Security order: Subject SHARE -> Thread UPDATE -> Turn UPDATE ->
-- Attempt UPDATE -> Source/Grant/Memory SHARE -> admission INSERT ->
-- *actual v2* -> core message + two outboxes, all ONE Postgres transaction.
create function seyeon_positive_candidate.commit_actual_v2_r3(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_message uuid,p_chat_outbox uuid,p_post_outbox uuid,
  p_snapshot jsonb,p_snapshot_hash text,p_selection_digest text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog,public,seyeon_positive_candidate
as $g2$
declare
  v_attempt record;
  v_pin seyeon_positive_candidate.attempt_source_pins%rowtype;
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_source record;
  v_expected jsonb;
  v_commit record;
  v_digest text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_thread is null or p_turn is null
    or p_attempt is null or p_message is null or
    p_chat_outbox is null or p_post_outbox is null
    or p_selection_digest is null
    or p_selection_digest !~ '^sha256:v1:[a-f0-9]{64}$' then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_request_invalid';
  end if;

  perform 1 from public.subjects s
  where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_subject_not_active';
  end if;
  perform 1 from public.conversation_threads th
  where th.id=p_thread and th.subject_id=p_subject and th.status='active'
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_thread_not_active';
  end if;
  perform 1 from public.chat_turns t
  where t.id=p_turn and t.thread_id=p_thread and t.subject_id=p_subject
    and t.state='validated'
  for update;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_turn_not_validated';
  end if;

  select a.id,a.state,a.planner_version,a.seyeon_personal_source_pin_jsonb,
         a.validation_result_jsonb
  into v_attempt
  from public.chat_turn_attempts a
  where a.id=p_attempt and a.subject_id=p_subject and a.turn_id=p_turn
  for update;
  if not found or v_attempt.state is distinct from 'validated'
    or v_attempt.planner_version is distinct from 'seyeon-production-chat-planner-v1'
    or v_attempt.seyeon_personal_source_pin_jsonb is not null then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_attempt_not_positive_validated';
  end if;

  select * into v_pin from seyeon_positive_candidate.attempt_source_pins
  where attempt_id=p_attempt and subject_id=p_subject and thread_id=p_thread
    and turn_id=p_turn and state='pinned' and original_record_kind='memory'
  for update;
  select * into v_set from seyeon_positive_candidate.source_sets_r1
  where attempt_id=p_attempt and subject_id=p_subject and thread_id=p_thread
    and turn_id=p_turn and source_count=1
    and selected_sources_digest=p_selection_digest
  for share;
  if v_pin.attempt_id is null or v_set.attempt_id is null
    or (select count(*) from seyeon_positive_candidate.source_edges_r1
        where attempt_id=p_attempt) <> 1 then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_missing_original_source_set';
  end if;
  select * into v_edge from seyeon_positive_candidate.source_edges_r1
  where attempt_id=p_attempt and ordinal=0 and record_kind='memory'
    and memory_id=v_pin.original_memory_id
    and original_grant_id=v_pin.original_grant_id
    and record_type=v_pin.original_record_type
    and schema_version=v_pin.original_schema_version
    and pg_payload_digest=v_pin.original_raw_digest
  for share;
  if v_edge.attempt_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_changed_source_ancestry';
  end if;

  select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
  into v_source
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=v_edge.original_grant_id and g.subject_id=p_subject
    and g.memory_item_id=v_edge.memory_id
    and g.grantee_character_id='seyeon' and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type='shared_detail' and m.schema_version='memory-v1'
  for share of g,m;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_original_grant_revoked';
  end if;
  v_digest:='sha256:pg-jsonb:v1:'||
    encode(sha256(convert_to(v_source.content_jsonb::text,'UTF8')),'hex');
  if v_source.granted_at is distinct from v_edge.original_granted_at
     or v_digest is distinct from v_edge.pg_payload_digest then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_original_source_changed';
  end if;

  v_expected:=jsonb_build_object(
    'schemaVersion','offline-positive-original-source-proof-r3',
    'recordId',v_edge.memory_id::text,
    'originalGrantId',v_edge.original_grant_id::text,
    'selectedSourcesDigest',v_set.selected_sources_digest,
    'pgPayloadDigest',v_edge.pg_payload_digest
  );
  if v_attempt.validation_result_jsonb -> 'personalRecordProvenance'
      is distinct from v_expected then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_unbound_validation';
  end if;

  insert into seyeon_positive_candidate.actual_v2_commit_admissions_r3(
    attempt_id,subject_id,thread_id,turn_id,source_selection_digest,
    record_id,original_grant_id,pg_payload_digest
  ) values(p_attempt,p_subject,p_thread,p_turn,v_set.selected_sources_digest,
           v_edge.memory_id,v_edge.original_grant_id,v_edge.pg_payload_digest);

  select * into strict v_commit
  from public.cmd_commit_seyeon_chat_turn_runtime_v2(
    p_subject,p_thread,p_turn,p_attempt,p_message,p_chat_outbox,
    p_post_outbox,p_snapshot,p_snapshot_hash
  );
  if v_commit.turn_id is distinct from p_turn
     or v_commit.attempt_id is distinct from p_attempt
     or v_commit.assistant_message_id is distinct from p_message
     or v_commit.post_turn_outbox_event_id is distinct from p_post_outbox
     or v_commit.replayed is distinct from false then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r3_real_v2_result_mismatch';
  end if;
  return jsonb_build_object(
    'turnId',v_commit.turn_id::text,
    'attemptId',v_commit.attempt_id::text,
    'assistantMessageId',v_commit.assistant_message_id::text,
    'postTurnOutboxEventId',v_commit.post_turn_outbox_event_id::text,
    'replayed',false
  );
end $g2$;

-- Restrict BOTH old wrapper routes for this disposable candidate;
-- the G2 owner wrapper above alone can invoke the unchanged real v2.
revoke execute on function public.cmd_commit_seyeon_chat_turn_runtime_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text
) from myeongha_api_executor;
revoke all on seyeon_positive_candidate.actual_v2_commit_admissions_r3
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function seyeon_positive_candidate.commit_actual_v2_r3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.commit_actual_v2_r3(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text
) to myeongha_api_executor;

do $acl$
begin
  if has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_chat_turn_runtime_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE')
    or has_table_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.actual_v2_commit_admissions_r3','INSERT')
    or has_function_privilege('public',
      'seyeon_positive_candidate.commit_actual_v2_r3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text)','EXECUTE')
  then
    raise exception 'offline actual v2 candidate accidentally leaked direct Commit capability';
  end if;
end $acl$;
commit;
\echo 'PASS: disposable G2 actual v2 atomic original Grant admission + zero-only-preserving 1640 candidate installed; Production untouched'

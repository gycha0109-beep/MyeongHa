-- Watchtower-Track: security
-- R5: CURRENT Original Grant DB-owned disclosure ONLY in disposable PostgreSQL.
-- Lifted/isolated from the unmerged #1985 candidate. NOT a Production migration.
-- This test proves READ COMMIT linearization, not the later HTTP byte-delivery race.
\set ON_ERROR_STOP on
begin;
do $precondition$
begin
 if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
   or current_setting('server_version_num')::integer<150000
   or to_regprocedure('seyeon_positive_candidate.commit_actual_v2_r3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text)') is null
   or to_regprocedure('seyeon_positive_candidate.pin_and_context_ready_r4(uuid,uuid,uuid,uuid,jsonb,text)') is null
   or to_regprocedure('public.qry_chat_thread_stream_v2(uuid,uuid,bigint,integer)') is null
 then raise exception 'R5 refuses non-disposable database or missing real v2 baseline';
 end if;
end $precondition$;

-- G3: no client-supplied attempt, message or historical authorization proof.
-- Only Subject/Thread/Turn are locators. Read authoritative committed
-- Turn+Attempt+message+DB-issued admission, then CURRENT original Grant/Record
-- under Subject SHARE -> locked provenance -> Grant+Memory SHARE.
-- The function returns body text only when all checks pass; else SQL NULL.
-- The DB read is the linearization point, NOT HTTP delivery or stream.
create function seyeon_positive_candidate.reveal_actual_v2_r5(
  p_subject uuid,p_thread uuid,p_turn uuid
)
returns text language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $g3$
declare
  v_attempt_id uuid;
  v_message_id uuid;
  v_message_text text;
  v_attempt_state text;
  v_validation jsonb;
  v_admission seyeon_positive_candidate.actual_v2_commit_admissions_r3%rowtype;
  v_pin seyeon_positive_candidate.attempt_source_pins%rowtype;
  v_set seyeon_positive_candidate.source_sets_r1%rowtype;
  v_edge seyeon_positive_candidate.source_edges_r1%rowtype;
  v_current record;
  v_expected jsonb;
  v_digest text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_thread is null or p_turn is null then
    return null;
  end if;

  perform 1 from public.subjects s
  where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then return null; end if;
  perform 1 from public.conversation_threads th
  where th.id=p_thread and th.subject_id=p_subject and th.status='active'
  for share;
  if not found then return null; end if;

  select t.committed_attempt_id into v_attempt_id
  from public.chat_turns t
  where t.id=p_turn and t.thread_id=p_thread and t.subject_id=p_subject
    and t.state in ('committed','delivered')
    and t.committed_at is not null
  for share;
  if not found or v_attempt_id is null then return null; end if;

  select a.state,a.committed_message_id,a.validation_result_jsonb
    into v_attempt_state,v_message_id,v_validation
  from public.chat_turn_attempts a
  where a.id=v_attempt_id and a.turn_id=p_turn and a.subject_id=p_subject
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.seyeon_personal_source_pin_jsonb is null
  for share;
  if not found or v_attempt_state is distinct from 'committed'
    or v_message_id is null then return null; end if;

  select * into v_admission
  from seyeon_positive_candidate.actual_v2_commit_admissions_r3 adm
  where adm.attempt_id=v_attempt_id and adm.subject_id=p_subject
    and adm.thread_id=p_thread and adm.turn_id=p_turn
  for share;
  select * into v_pin from seyeon_positive_candidate.attempt_source_pins p
  where p.attempt_id=v_attempt_id and p.subject_id=p_subject
    and p.thread_id=p_thread and p.turn_id=p_turn
    and p.state='pinned' and p.original_record_kind='memory'
  for share;
  select * into v_set from seyeon_positive_candidate.source_sets_r1 ss
  where ss.attempt_id=v_attempt_id and ss.subject_id=p_subject
    and ss.thread_id=p_thread and ss.turn_id=p_turn
    and ss.source_count=1
  for share;
  if v_admission.attempt_id is null or v_pin.attempt_id is null
    or v_set.attempt_id is null
    or v_set.selected_sources_digest is distinct from v_admission.source_selection_digest
    or v_pin.original_grant_id is distinct from v_admission.original_grant_id
    or v_pin.original_memory_id is distinct from v_admission.record_id
    or v_pin.original_raw_digest is distinct from v_admission.pg_payload_digest
  then return null; end if;

  select * into v_edge from seyeon_positive_candidate.source_edges_r1 e
  where e.attempt_id=v_attempt_id and e.ordinal=0 and e.record_kind='memory'
    and e.memory_id=v_admission.record_id
    and e.original_grant_id=v_admission.original_grant_id
    and e.pg_payload_digest=v_admission.pg_payload_digest
    and e.record_type=v_pin.original_record_type
    and e.schema_version=v_pin.original_schema_version
  for share;
  if v_edge.attempt_id is null or
    (select count(*) from seyeon_positive_candidate.source_edges_r1
      where attempt_id=v_attempt_id)<>1 then return null; end if;

  select m.memory_type,m.schema_version,m.content_jsonb,g.granted_at
    into v_current
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=v_admission.original_grant_id and g.subject_id=p_subject
    and g.memory_item_id=v_admission.record_id
    and g.grantee_character_id='seyeon' and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type='shared_detail' and m.schema_version='memory-v1'
  for share of g,m;
  if not found then return null; end if;

  v_digest:='sha256:pg-jsonb:v1:'||
    encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex');
  if v_current.memory_type is distinct from v_edge.record_type
    or v_current.schema_version is distinct from v_edge.schema_version
    or v_current.granted_at is distinct from v_edge.original_granted_at
    or v_digest is distinct from v_edge.pg_payload_digest then
    return null;
  end if;
  v_expected:=jsonb_build_object(
    'schemaVersion','offline-positive-original-source-proof-r3',
    'recordId',v_admission.record_id::text,
    'originalGrantId',v_admission.original_grant_id::text,
    'selectedSourcesDigest',v_admission.source_selection_digest,
    'pgPayloadDigest',v_admission.pg_payload_digest
  );
  if v_validation->'personalRecordProvenance' is distinct from v_expected then
    return null;
  end if;

  select m.body_text into v_message_text
  from public.conversation_messages m
  where m.id=v_message_id and m.turn_id=p_turn and m.thread_id=p_thread
    and m.subject_id=p_subject and m.sender_type='character'
    and m.redacted_at is null and m.body_text is not null
    and length(m.body_text)>0
  for share;
  if not found then return null; end if;
  return v_message_text;
end $g3$;

revoke all on function seyeon_positive_candidate.reveal_actual_v2_r5(
  uuid,uuid,uuid
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.reveal_actual_v2_r5(
  uuid,uuid,uuid
) to myeongha_api_executor;



-- Authoritative HTTP first/replay: checked CLIENT locators are compared
-- against server-owned committed Attempt + stored assistant message. Only
-- AFTER binding identity, call G3's current original Grant/Memory check.
create function seyeon_positive_candidate.reveal_http_r5(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,p_message uuid
)
returns text language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $api$
declare v_turn_attempt uuid;
        v_message uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_thread is null or p_turn is null
     or p_attempt is null or p_message is null then return null; end if;

  -- Lock using G3's ordering (Subject -> Thread -> Turn -> Attempt).
  perform 1 from public.subjects s where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null for share;
  if not found then return null; end if;
  perform 1 from public.conversation_threads th
  where th.id=p_thread and th.subject_id=p_subject and th.status='active'
  for share;
  if not found then return null; end if;

  select t.committed_attempt_id into v_turn_attempt
  from public.chat_turns t
  where t.id=p_turn and t.subject_id=p_subject and t.thread_id=p_thread
    and t.state in ('committed','delivered')
  for share;
  if not found or v_turn_attempt is distinct from p_attempt then
    return null;
  end if;
  select a.committed_message_id into v_message
  from public.chat_turn_attempts a
  where a.id=p_attempt and a.subject_id=p_subject and a.turn_id=p_turn
    and a.state='committed'
  for share;
  if not found or v_message is distinct from p_message then
    return null;
  end if;
  return seyeon_positive_candidate.reveal_actual_v2_r5(
    p_subject,p_thread,p_turn
  );
end $api$;

-- Owner-scope history page, shared with batch/polling "stream" surfaces.
-- Never return raw generic stream bytes for character content. Any unapproved
-- Character in the scanned page means HOLD THE ENTIRE PAGE, rather than
-- filtering and producing false pagination or a fake redaction timestamp.
-- We intentionally strip message payload for ALL results (including approved
-- Character), pending a separate D-03 payload/derived-output certification.
create function seyeon_positive_candidate.read_authorized_page_r5(
  p_subject uuid,p_thread uuid,p_after bigint,p_page integer
) returns table (
  message_id uuid,sequence_no bigint,sender_type text,character_id text,
  body_text text,message_payload_jsonb jsonb,message_schema_version text,
  created_at timestamptz,redacted boolean,redacted_at timestamptz
)
language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $history$
declare
  v_row record;
  v_turn uuid;
  v_approved text;
  v_count integer:=0;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  if p_subject is null or p_thread is null
     or p_after is null or p_after<0
     or p_page is null or p_page<1 or p_page>50 then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r5_page_invalid';
  end if;

  perform 1 from public.subjects s where s.id=p_subject and s.status='active'
    and s.merged_into_subject_id is null for share;
  if not found then
    raise exception using errcode='P0001',
      constraint='seyeon_offline_r5_subject_unavailable';
  end if;
  perform 1 from public.conversation_threads th
  where th.id=p_thread and th.subject_id=p_subject
    and th.status='active' for share;
  if not found then
    raise exception using errcode='P0001',
      constraint='seyeon_offline_r5_thread_unavailable';
  end if;
  if (select count(*) from public.conversation_thread_characters c
       where c.thread_id=p_thread and c.character_id='seyeon'
         and c.left_at is null)<>1 or
     exists(select 1 from public.conversation_thread_characters c
       where c.thread_id=p_thread and c.character_id<>'seyeon'
         and c.left_at is null) then
    raise exception using errcode='23514',
      constraint='seyeon_offline_r5_not_single_character';
  end if;

  for v_row in
    select * from public.qry_chat_thread_stream_v2(
      p_subject,p_thread,p_after,p_page
    )
  loop
    v_count:=v_count+1;
    message_id:=v_row.message_id;
    sequence_no:=v_row.sequence_no;
    sender_type:=v_row.sender_type;
    character_id:=v_row.character_id;
    message_schema_version:=v_row.message_schema_version;
    created_at:=v_row.created_at;
    redacted:=v_row.redacted;
    redacted_at:=v_row.redacted_at;
    message_payload_jsonb:=null; -- no unreviewed derived/provenance bytes
    body_text:=null;

    if v_row.redacted then
      if v_row.body_text is not null or v_row.message_payload_jsonb is not null then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r5_redaction_payload_unexpected';
      end if;
    elsif v_row.sender_type='character' and v_row.character_id='seyeon' then
      select m.turn_id into v_turn
      from public.conversation_messages m
      where m.id=v_row.message_id and m.thread_id=p_thread
        and m.subject_id=p_subject and m.sender_type='character'
        and m.redacted_at is null
      for share;
      if not found or v_turn is null then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r5_missing_committed_turn';
      end if;
      v_approved:=seyeon_positive_candidate.reveal_actual_v2_r5(
        p_subject,p_thread,v_turn
      );
      if v_approved is null or v_approved is distinct from v_row.body_text then
        raise exception using errcode='23514',
          constraint='seyeon_offline_r5_page_held';
      end if;
      body_text:=v_approved;
    elsif v_row.sender_type='user' and v_row.character_id is null then
      body_text:=v_row.body_text; -- same Subject's own explicit message
    else
      -- Do not disclose unreviewed generated/system payloads.
      raise exception using errcode='23514',
        constraint='seyeon_offline_r5_unreviewed_sender';
    end if;
    return next;
  end loop;
end $history$;

revoke all on function seyeon_positive_candidate.reveal_http_r5(
  uuid,uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function seyeon_positive_candidate.read_authorized_page_r5(
  uuid,uuid,bigint,integer
) from public,anon,authenticated,service_role;
grant execute on function seyeon_positive_candidate.reveal_http_r5(
  uuid,uuid,uuid,uuid,uuid
) to myeongha_api_executor;
grant execute on function seyeon_positive_candidate.read_authorized_page_r5(
  uuid,uuid,bigint,integer
) to myeongha_api_executor;



do $acl$
begin
  if has_function_privilege('public',
      'seyeon_positive_candidate.read_authorized_page_r5(uuid,uuid,bigint,integer)',
      'EXECUTE')
    or has_function_privilege('anon',
      'seyeon_positive_candidate.read_authorized_page_r5(uuid,uuid,bigint,integer)',
      'EXECUTE')
    or has_function_privilege('authenticated',
      'seyeon_positive_candidate.reveal_http_r5(uuid,uuid,uuid,uuid,uuid)',
      'EXECUTE')
    or not has_function_privilege('myeongha_api_executor',
      'seyeon_positive_candidate.read_authorized_page_r5(uuid,uuid,bigint,integer)',
      'EXECUTE')
    or has_table_privilege('myeongha_api_executor',
      'public.conversation_messages','SELECT')
  then
    raise exception 'R5 owner-only history/HTTP violated the closed read ACL';
  end if;
end $acl$;

do $final_acl$
begin
 if has_function_privilege('anon','seyeon_positive_candidate.reveal_actual_v2_r5(uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('authenticated','seyeon_positive_candidate.reveal_actual_v2_r5(uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('service_role','seyeon_positive_candidate.reveal_http_r5(uuid,uuid,uuid,uuid,uuid)','EXECUTE')
 or has_table_privilege('myeongha_api_executor','public.conversation_messages','SELECT')
 then raise exception 'R5 direct disclosure ACL not closed';
 end if;
end $final_acl$;
commit;
\echo 'PASS: R5 scratch-only current original Grant / real v2 first,replay,history page; HTTP remains HOLD'

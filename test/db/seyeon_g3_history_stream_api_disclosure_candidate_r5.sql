-- Watchtower-Track: character-memory
-- R5: Disposable-DB-only, offline G3 disclosure for history / stream / HTTP.
-- NEVER install in Production. It depends on the R3/R4 synthetic Owner gates.
-- Consent is sampled at one PostgreSQL transaction linearization point;
-- it is NOT proof of last-millisecond HTTP/stream delivery after revoke.
\set ON_ERROR_STOP on
begin;
do $guard$
begin
  if current_database()<>'myeongha_seyeon_positive_pin_candidate_test'
    or current_setting('server_version_num')::integer < 150000
    or to_regprocedure(
      'seyeon_positive_candidate.reveal_actual_v2_r4(uuid,uuid,uuid)'
    ) is null
    or to_regprocedure(
      'public.qry_chat_thread_stream_v2(uuid,uuid,bigint,integer)'
    ) is null then
    raise exception 'R5 requires named disposable G3 and generic stream baseline';
  end if;
end $guard$;

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
  return seyeon_positive_candidate.reveal_actual_v2_r4(
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
      v_approved:=seyeon_positive_candidate.reveal_actual_v2_r4(
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
commit;
\echo 'PASS: R5 disposable owner-only history/stream page + HTTP first/replay current original Grant installed; no Production wiring'

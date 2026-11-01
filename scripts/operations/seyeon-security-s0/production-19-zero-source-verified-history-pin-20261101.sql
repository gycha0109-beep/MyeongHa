-- Watchtower-Track: security
-- Pre-model original-source closure for zero-Personal Se-yeon follow-up turns.
-- Extends the installed 12-key owner function; does not rewrite 1640/17/18.
-- Historical User/Assistant IDs are tied to the original committed DB rows.
begin;

do $pre$
declare f record; h record;
begin
  if current_user <> 'postgres' then raise exception 'Expected postgres operator'; end if;
  select p.oid,pg_get_functiondef(p.oid) as def,p.prosecdef,pg_get_userbyid(p.proowner) as owner
    into f
    from pg_proc p
   where p.oid=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)');
  select p.oid,pg_get_functiondef(p.oid) as def,p.prosecdef,pg_get_userbyid(p.proowner) as owner
    into h
    from pg_proc p
   where p.oid=to_regprocedure('seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)');
  if f.oid is null or h.oid is null or f.prosecdef is distinct from true
    or h.prosecdef is distinct from true
    or f.owner is distinct from 'myeongha_seyeon_chat_runtime_owner'
    or h.owner is distinct from 'myeongha_seyeon_chat_runtime_owner'
    or position('v_selection_keys <> 12' in f.def)=0
    or position('v_selection -> ''selectedUnpinnedRecentSources'' is distinct from ''[]''::jsonb' in f.def)=0
    or position('v_census_digest:=''sha256:v1:''||encode(' in f.def)=0
    or position('  v_current_id text;' in f.def)=0
    or position('  -- The DB committed Attempt, not a message-provided sourceRef' in h.def)=0
    or position('v_pin jsonb;' in h.def)=0
    or not has_function_privilege('myeongha_api_executor',f.oid,'EXECUTE')
    or has_function_privilege('anon',f.oid,'EXECUTE')
    or has_function_privilege('authenticated',f.oid,'EXECUTE')
    or has_function_privilege('service_role',f.oid,'EXECUTE')
    or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
    or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','seyeon_private','CREATE')
    or not has_function_privilege('myeongha_seyeon_chat_runtime_owner',
      'seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)','EXECUTE')
    or not has_function_privilege('myeongha_seyeon_chat_runtime_owner',
      'seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)','EXECUTE')
  then raise exception 'Zero-source current and historical source authority prerequisites drifted'; end if;

  if (select count(*) from pg_auth_members m
     join pg_roles target on target.oid=m.roleid
     join pg_roles member on member.oid=m.member
     join pg_roles grantor on grantor.oid=m.grantor
     where target.rolname='myeongha_seyeon_chat_runtime_owner'
       and member.rolname=current_user and grantor.rolname='supabase_admin'
       and m.admin_option and not m.inherit_option and not m.set_option)<>1
  then raise exception 'Original runtime role grant changed'; end if;
end
$pre$;

grant create on schema public to myeongha_seyeon_chat_runtime_owner;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;
grant myeongha_seyeon_chat_runtime_owner to current_user with set true;
set local role myeongha_seyeon_chat_runtime_owner;

do $rewrite$
declare
 f text;
 h text;
 old_condition text := 'v_selection -> ''selectedUnpinnedRecentSources'' is distinct from ''[]''::jsonb';
 -- No interpolated SQL comes from a client or from a Conversation row.
 guard text := $guard$jsonb_typeof(v_selection -> 'selectedUnpinnedRecentSources') is distinct from 'array' or
     jsonb_array_length(v_selection -> 'selectedUnpinnedRecentSources') > 23$guard$;
 history text := $history$
  -- The DB selected the original messages. Match the exact final-model tail,
  -- not merely the message IDs claimed by an application or model.
  v_history:=v_selection->'selectedUnpinnedRecentSources';
  v_history_count:=jsonb_array_length(v_history);
  select coalesce(array_agg(selected.id::text order by selected.sequence_no),array[]::text[])
    into v_window_ids
  from (
    select m.id,m.sequence_no
    from public.conversation_messages m
    where m.subject_id=p_subject_id and m.thread_id=v_thread_id
      and m.redacted_at is null and m.body_text is not null
    order by m.sequence_no desc
    limit (v_history_count+1)
  ) selected;
  if coalesce(array_length(v_window_ids,1),0)<>v_history_count+1
     or v_window_ids[v_history_count+1] is distinct from v_current_id then
    raise exception using errcode='23514',
      constraint='seyeon_zero_source_pin_invalid',
      message='Se-yeon model recent sources are not the original thread tail';
  end if;

  v_history_payload:='[';
  for v_i in 0..v_history_count-1 loop
    v_item:=v_history->v_i;
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_item))<>4
       or v_item->>'messageId' is distinct from v_window_ids[v_i+1]
       or v_item->>'role' not in ('user','assistant')
       or v_item->'persistedBeforeModel' is distinct from 'false'::jsonb
       or coalesce(v_item->>'selectedModelMessageDigest','')
          !~ '^sha256:v1:[a-f0-9]{64}$' then
      raise exception using errcode='23514',
        constraint='seyeon_zero_source_pin_invalid',
        message='Se-yeon historical model source shape or sequence is invalid';
    end if;
    select m.body_text,m.sender_type,c.character_id
      into v_prior
    from public.conversation_messages m
    left join public.conversation_thread_characters c
      on c.id=m.thread_character_id and c.thread_id=m.thread_id
    where m.id::text=v_window_ids[v_i+1]
      and m.subject_id=p_subject_id and m.thread_id=v_thread_id
      and m.redacted_at is null and m.body_text is not null;
    if not found or length(btrim(v_prior.body_text))<1
       or length(btrim(v_prior.body_text))>8000 or
       (v_item->>'role'='user' and
          (v_prior.sender_type is distinct from 'user' or v_prior.character_id is not null)) or
       (v_item->>'role'='assistant' and
          (v_prior.sender_type is distinct from 'character' or v_prior.character_id is distinct from 'seyeon'))
    then
      raise exception using errcode='23514',
        constraint='seyeon_zero_source_pin_invalid',
        message='Se-yeon historical model source is not authorized';
    end if;

    -- These existing helpers check committed Member Turn and Assistant
    -- lineage, and hold original-source locks for the whole transaction.
    if v_item->>'role'='user' then
      perform seyeon_private.assert_current_original_member_user_message_v1(
        p_subject_id,v_thread_id,(v_item->>'messageId')::uuid);
    else
      perform seyeon_private.assert_current_original_assistant_lineage_v1(
        p_subject_id,v_thread_id,(v_item->>'messageId')::uuid);
    end if;
    v_prior_digest:='sha256:v1:'||encode(pg_catalog.sha256(pg_catalog.convert_to(
      '{"messageId":'||to_json(v_item->>'messageId')::text||
      ',"role":'||to_json(v_item->>'role')::text||
      ',"text":'||to_json(btrim(v_prior.body_text))::text||'}',
      'UTF8')),'hex');
    if v_item->>'selectedModelMessageDigest' is distinct from v_prior_digest then
      raise exception using errcode='23514',
        constraint='seyeon_zero_source_pin_invalid',
        message='Se-yeon historical model text digest is not its DB original';
    end if;
    if v_i>0 then v_history_payload:=v_history_payload||','; end if;
    v_history_payload:=v_history_payload||
      '{"messageId":'||to_json(v_item->>'messageId')::text||
      ',"persistedBeforeModel":false,"role":'||to_json(v_item->>'role')::text||
      ',"selectedModelMessageDigest":'||to_json(v_prior_digest)::text||'}';
  end loop;
  v_history_payload:=v_history_payload||']';

$history$;
 zero_branch text := $zero$
  -- The earlier production assistant may have been produced from exactly
  -- zero personal records. Accept its IMMUTABLE attempt pin only after
  -- the same committed lineage and guard-to-pin correlation as Positive G1.
  perform 1
    from public.conversation_messages msg
    join public.chat_turns t
      on t.id=msg.turn_id and t.subject_id=msg.subject_id
      and t.thread_id=msg.thread_id and t.committed_at is not null
      and t.state in ('committed','delivered')
    join public.chat_turn_attempts a
      on a.id=t.committed_attempt_id and a.turn_id=t.id
      and a.subject_id=t.subject_id and a.state='committed'
      and a.committed_message_id=msg.id
    join public.conversation_thread_characters c
      on c.id=msg.thread_character_id and c.thread_id=msg.thread_id
      and c.character_id='seyeon'
   where msg.id=p_assistant_message_id and msg.subject_id=p_subject_id
     and msg.thread_id=p_thread_id and msg.sender_type='character'
     and msg.redacted_at is null and msg.body_text is not null
     and a.planner_version='seyeon-production-chat-planner-v1'
     and a.seyeon_personal_source_pinned_at is not null
     and jsonb_typeof(a.seyeon_personal_source_pin_jsonb)='object'
     and (select count(*) from jsonb_object_keys(a.seyeon_personal_source_pin_jsonb))=2
     and a.seyeon_personal_source_pin_jsonb?'zeroProof'
     and a.seyeon_personal_source_pin_jsonb?'exactModelSourceSelection'
     and a.validation_result_jsonb->'personalRecordProvenance'
         =a.seyeon_personal_source_pin_jsonb->'zeroProof'
     and a.seyeon_personal_source_pin_jsonb#>>'{zeroProof,schemaVersion}'
         ='seyeon-attempt-zero-personal-proof-v1'
     and a.seyeon_personal_source_pin_jsonb#>>'{zeroProof,subjectId}'=p_subject_id::text
     and a.seyeon_personal_source_pin_jsonb#>>'{zeroProof,threadId}'=p_thread_id::text
     and a.seyeon_personal_source_pin_jsonb#>>'{zeroProof,turnId}'=t.id::text
     and a.seyeon_personal_source_pin_jsonb#>>'{zeroProof,attemptId}'=a.id::text
     and a.seyeon_personal_source_pin_jsonb#>'{zeroProof,recordCount}'='0'::jsonb
     and a.seyeon_personal_source_pin_jsonb#>'{zeroProof,records}'='[]'::jsonb
     and a.seyeon_personal_source_pin_jsonb#>'{exactModelSourceSelection,selectedPersonalRecordCount}'='0'::jsonb
     and a.seyeon_personal_source_pin_jsonb#>'{exactModelSourceSelection,selectedSources}'='[]'::jsonb;
  if found then return; end if;

$zero$;
begin
  select pg_get_functiondef(to_regprocedure(
    'public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)'
  )) into f;
  select pg_get_functiondef(to_regprocedure(
    'seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)'
  )) into h;
  if position(old_condition in f)=0
      or position('v_selection_keys <> 12' in f)=0
      or position('  v_current_id text;' in f)=0
      or position('  v_census_digest text;' in f)=0
      or position('  v_census_digest:=''sha256:v1:''||encode(' in f)=0
      or position('  -- The DB committed Attempt, not a message-provided sourceRef' in h)=0
  then raise exception 'Unexpected installed source function definitions'; end if;
  f:=replace(f,old_condition,guard);
  f:=replace(f,'  v_current_id text;',
     '  v_history jsonb;'||chr(10)||
     '  v_history_count integer;'||chr(10)||
     '  v_history_payload text;'||chr(10)||
     '  v_window_ids text[];'||chr(10)||
     '  v_item jsonb;'||chr(10)||
     '  v_i integer;'||chr(10)||
     '  v_prior record;'||chr(10)||
     '  v_prior_digest text;'||chr(10)||
     '  v_current_id text;');
  f:=replace(f,'  v_census_digest:=''sha256:v1:''||encode(',history||
     '  v_census_digest:=''sha256:v1:''||encode(');
  -- Existing first-response canonical digest remains identical when history=[].
  f:=replace(f,$census_old$"unpinnedRecentSources":[]}'$census_old$,
    $census_new$"unpinnedRecentSources":'||v_history_payload||'}'$census_new$);
  if position('v_history_payload' in f)=0 or position('v_history_payload||' in f)=0
    then raise exception 'Historical source census digest substitution failed'; end if;
  execute f;

  h:=replace(h,
    '  -- The DB committed Attempt, not a message-provided sourceRef',
    zero_branch||'  -- The DB committed Attempt, not a message-provided sourceRef');
  if position('The earlier production assistant may have been produced' in h)=0
     then raise exception 'Zero historical assistant lineage substitution failed'; end if;
  execute h;
end
$rewrite$;

reset role;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;

do $post$
declare f record; h record;
begin
  select pg_get_functiondef(p.oid) as def,p.prosecdef,pg_get_userbyid(p.proowner) as owner,p.oid
    into f from pg_proc p
   where p.oid=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)');
  select pg_get_functiondef(p.oid) as def,p.prosecdef,pg_get_userbyid(p.proowner) as owner,p.oid
    into h from pg_proc p
   where p.oid=to_regprocedure('seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)');
  if f.owner is distinct from 'myeongha_seyeon_chat_runtime_owner'
     or h.owner is distinct from 'myeongha_seyeon_chat_runtime_owner'
     or f.prosecdef is distinct from true or h.prosecdef is distinct from true
     or position('v_selection_keys <> 12' in f.def)=0
     or position('v_history_payload' in f.def)=0
     or position('The earlier production assistant may have been produced' in h.def)=0
     or not has_function_privilege('myeongha_api_executor',f.oid,'EXECUTE')
     or has_function_privilege('anon',f.oid,'EXECUTE')
     or has_function_privilege('authenticated',f.oid,'EXECUTE')
     or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','seyeon_private','CREATE')
     or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
  then raise exception 'Multi-turn original-source authority postconditions failed'; end if;
end
$post$;
commit;

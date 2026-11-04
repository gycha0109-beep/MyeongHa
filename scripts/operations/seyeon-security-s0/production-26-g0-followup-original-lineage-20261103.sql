-- Watchtower-Track: character-memory
-- Production G0 multi-turn: preserve canonical original row locks without
-- granting conversation_messages UPDATE to the no-login chat runtime owner.
-- Only a committed zero-personal-source assistant reply can be recalled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $pre$
DECLARE f oid; g oid; owner_oid oid;
BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::int < 170000 THEN
    RAISE EXCEPTION 'G0 follow-up operator/version mismatch';
  END IF;
  owner_oid:=to_regrole('myeongha_seyeon_chat_runtime_owner')::oid;
  f:=to_regprocedure('seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)')::oid;
  g:=to_regprocedure('seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)')::oid;
  IF f IS NULL OR g IS NULL OR owner_oid IS NULL
     OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE oid=owner_oid
       AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
     OR EXISTS(SELECT 1 FROM pg_proc WHERE oid IN (f,g)
       AND (proowner<>owner_oid OR NOT prosecdef))
     OR NOT has_function_privilege('myeongha_seyeon_chat_runtime_owner',f,'EXECUTE')
     OR NOT has_function_privilege('myeongha_seyeon_chat_runtime_owner',g,'EXECUTE')
     OR has_function_privilege('anon',f,'EXECUTE')
     OR has_function_privilege('authenticated',g,'EXECUTE')
     OR has_table_privilege('myeongha_seyeon_chat_runtime_owner',
                           'public.conversation_messages','UPDATE')
     OR to_regprocedure('seyeon_private.lock_g0_original_message_v1(uuid,uuid,uuid,text)') IS NOT NULL
     OR to_regprocedure('seyeon_private.assert_g0_zero_assistant_lineage_v1(uuid,uuid,uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'G0 original authority prerequisites drifted'; END IF;
END $pre$;

-- Privileged *lock only*; never returns body text and never accepts a
-- source reference, content digest or subject identity from model output.
-- This must stay private: runtime owner alone receives EXECUTE permission.
CREATE FUNCTION seyeon_private.lock_g0_original_message_v1(
  p_subject uuid,p_thread uuid,p_message uuid,p_sender text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET row_security=off
AS $lock$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_myeongha_subject_context_v1(p_subject);
  IF p_subject IS NULL OR p_thread IS NULL OR p_message IS NULL
     OR p_sender NOT IN ('user','character') THEN
    RAISE EXCEPTION USING errcode='42501',constraint='seyeon_g0_lock_invalid',
       message='Original source unavailable';
  END IF;
  SELECT m.id INTO v_id
  FROM public.conversation_messages m
  JOIN public.chat_turns t
    ON t.id=m.turn_id AND t.subject_id=m.subject_id
   AND t.thread_id=m.thread_id
  JOIN public.conversation_threads th
    ON th.id=m.thread_id AND th.subject_id=m.subject_id
  LEFT JOIN public.chat_turn_attempts a
    ON a.id=t.committed_attempt_id AND a.turn_id=t.id
   AND a.subject_id=t.subject_id
  LEFT JOIN public.conversation_thread_characters c
    ON c.id=m.thread_character_id AND c.thread_id=m.thread_id
  WHERE m.id=p_message AND m.subject_id=p_subject
    AND m.thread_id=p_thread AND m.sender_type=p_sender
    AND m.redacted_at IS NULL AND m.body_text IS NOT NULL
    AND nullif(btrim(m.content_hash),'') IS NOT NULL
    AND th.status IN ('active','archived')
    AND t.state IN ('committed','delivered')
    AND t.committed_attempt_id IS NOT NULL AND t.committed_at IS NOT NULL
    AND (
      (p_sender='user' AND m.thread_character_id IS NULL
        AND m.character_content_bundle_id IS NULL
        AND nullif(btrim(t.client_turn_id),'') IS NOT NULL
        AND nullif(btrim(t.request_hash),'') IS NOT NULL
        AND nullif(btrim(t.request_contract_version),'') IS NOT NULL
        AND jsonb_typeof(t.request_snapshot_jsonb)='object')
      OR (p_sender='character' AND c.character_id='seyeon'
        AND a.state='committed' AND a.committed_message_id=m.id
        AND m.body_text=a.generated_body_text)
    )
  FOR SHARE OF m,t,th;
  IF v_id IS DISTINCT FROM p_message THEN
    RAISE EXCEPTION USING errcode='42501',
      constraint='seyeon_g0_original_message_unverifiable',
      message='Original source unavailable';
  END IF;
END $lock$;
REVOKE ALL ON FUNCTION seyeon_private.lock_g0_original_message_v1(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role,myeongha_api_executor;
GRANT EXECUTE ON FUNCTION seyeon_private.lock_g0_original_message_v1(uuid,uuid,uuid,text)
  TO myeongha_seyeon_chat_runtime_owner;

-- Temporarily enable the established no-login function owner only for
-- replacement of its private routines. Preserve Supabase-managed membership.
GRANT CREATE ON SCHEMA seyeon_private TO myeongha_seyeon_chat_runtime_owner;
GRANT CREATE ON SCHEMA public TO myeongha_seyeon_chat_runtime_owner;
DO $member$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    EXECUTE 'GRANT myeongha_seyeon_chat_runtime_owner TO postgres
      WITH SET TRUE, INHERIT FALSE, ADMIN FALSE';
  END IF;
END $member$;
SET LOCAL ROLE myeongha_seyeon_chat_runtime_owner;

-- A prior *committed* zero-source assistant is authoritative only when its
-- original zero-proof and model-selection census match validated DB records.
CREATE FUNCTION seyeon_private.assert_g0_zero_assistant_lineage_v1(
  p_subject_id uuid,p_thread_id uuid,p_assistant_message_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $zero$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_myeongha_subject_context_v1(p_subject_id);
  SELECT m.id INTO v_id
  FROM public.conversation_messages m
  JOIN public.chat_turns t
    ON t.id=m.turn_id AND t.subject_id=m.subject_id
   AND t.thread_id=m.thread_id
  JOIN public.chat_turn_attempts a
    ON a.id=t.committed_attempt_id AND a.turn_id=t.id
   AND a.subject_id=t.subject_id AND a.state='committed'
   AND a.committed_message_id=m.id
  JOIN public.conversation_thread_characters c
    ON c.id=m.thread_character_id AND c.thread_id=m.thread_id
   AND c.character_id='seyeon'
  WHERE m.id=p_assistant_message_id AND m.subject_id=p_subject_id
    AND m.thread_id=p_thread_id AND m.sender_type='character'
    AND m.redacted_at IS NULL AND m.body_text IS NOT NULL
    AND m.body_text=a.generated_body_text
    AND t.state IN ('committed','delivered') AND t.committed_at IS NOT NULL
    AND a.seyeon_personal_source_pinned_at IS NOT NULL
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'schemaVersion'
      ='seyeon-attempt-zero-personal-proof-v1'
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'recordState'
      ='explicit_zero_admitted'
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'characterId'='seyeon'
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'subjectId'=p_subject_id::text
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'threadId'=p_thread_id::text
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'turnId'=t.id::text
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'attemptId'=a.id::text
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->'records'='[]'::jsonb
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->'recordCount'='0'::jsonb
    AND a.seyeon_personal_source_pin_jsonb->'zeroProof'->>'unsupportedSchemaCount'='0'
    AND a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->'selectedSources'='[]'::jsonb
    AND a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->>'selectedMemoryCount'='0'
    AND a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->>'selectedPersonalRecordCount'='0'
    AND a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->'selectedUnpinnedDerivedSources'='[]'::jsonb
    AND a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->'selectedUnpinnedRecentSources'='[]'::jsonb
    AND a.validation_result_jsonb->'passed'='true'::jsonb
    AND a.validation_result_jsonb->'personalRecordProvenance'
      =a.seyeon_personal_source_pin_jsonb->'zeroProof'
  FOR SHARE OF t,a;
  IF v_id IS DISTINCT FROM p_assistant_message_id THEN
    RAISE EXCEPTION USING errcode='42501',
      constraint='seyeon_g0_zero_assistant_unverifiable',
      message='Original source lineage is not available';
  END IF;
  PERFORM seyeon_private.lock_g0_original_message_v1(
    p_subject_id,p_thread_id,p_assistant_message_id,'character');
END $zero$;
REVOKE ALL ON FUNCTION seyeon_private.assert_g0_zero_assistant_lineage_v1(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,myeongha_api_executor;
GRANT EXECUTE ON FUNCTION seyeon_private.assert_g0_zero_assistant_lineage_v1(uuid,uuid,uuid)
 TO myeongha_seyeon_chat_runtime_owner;

DO $patch$
DECLARE f text; g text; source_start integer; source_end integer;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)'))
  INTO f;
  source_start:=position('  select msg.id into v_id' IN f);
  IF source_start=0 THEN RAISE EXCEPTION 'G0 Member original SELECT missing'; END IF;
  source_end:=position('  end if;' IN substring(f from source_start));
  IF f IS NULL OR source_end=0
     OR position('for share of msg,t,thread;' IN f)=0
     OR position('constraint=''seyeon_g0_user_origin_unverifiable''' IN f)=0
  THEN RAISE EXCEPTION 'G0 Member original function drifted'; END IF;
  -- The previous invoker-visible SELECT was filtered by runtime-owner RLS,
  -- and its SHARE of msg required UPDATE privilege. Replace that entire
  -- proof with a narrowly scoped, lock-only table-owner proof carrying
  -- the SAME canonical Member/Turn/Thread predicates.
  source_end:=source_start+source_end-2+length('  end if;');
  f:=substring(f from 1 for source_start-1)||
     '  perform seyeon_private.lock_g0_original_message_v1('||
     'p_subject_id,p_thread_id,p_user_message_id,''user'');'||chr(10)||
     substring(f from source_end+1);
  EXECUTE f;

  SELECT pg_get_functiondef(to_regprocedure(
    'seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)'))
  INTO g;
  IF g IS NULL OR position('-- The DB committed Attempt, not a message-provided sourceRef' IN g)=0
    OR position('seyeon_private.assert_g0_zero_assistant_lineage_v1' IN g)>0 THEN
    RAISE EXCEPTION 'G0 Assistant original function drifted';
  END IF;
  g:=replace(g,
    '  -- The DB committed Attempt, not a message-provided sourceRef',
    $branch$
  -- Branch only on an already DB-committed original zero Pin.
  -- Never infer zero scope from conversation prose or missing rows.
  if exists (
    select 1 from public.conversation_messages m
    join public.chat_turns t on t.id=m.turn_id
      and t.subject_id=m.subject_id and t.thread_id=m.thread_id
    join public.chat_turn_attempts a on a.id=t.committed_attempt_id
      and a.turn_id=t.id and a.subject_id=t.subject_id
    where m.id=p_assistant_message_id and m.subject_id=p_subject_id
      and m.thread_id=p_thread_id
      and a.seyeon_personal_source_pin_jsonb ? 'zeroProof'
  ) then
    perform seyeon_private.assert_g0_zero_assistant_lineage_v1(
      p_subject_id,p_thread_id,p_assistant_message_id);
    return;
  end if;

  -- The DB committed Attempt, not a message-provided sourceRef$branch$);
  EXECUTE g;

  -- The context window must not read an explicitly abandoned User Turn.
  -- Exclude only preserved, uncommitted abandoned records; every other
  -- historical source is still independently proven or fails closed.
  SELECT pg_get_functiondef(to_regprocedure(
    'public.qry_seyeon_g0_current_source_recent_messages_v1(uuid,uuid,uuid,integer)'))
    INTO g;
  IF g IS NULL OR position('and src.redacted_at is null and src.body_text is not null' IN g)=0
     OR position('order by src.sequence_no desc limit p_limit' IN g)=0
     OR position('seyeon_g0_historical_source_unverifiable' IN g)=0
     OR position('and not exists (select 1 from public.chat_turns ignored' IN g)>0
  THEN RAISE EXCEPTION 'G0 recent history source definition drifted'; END IF;
  g:=replace(g,
    'and src.redacted_at is null and src.body_text is not null',
    $excluded$and src.redacted_at is null and src.body_text is not null
        and not exists (
          select 1 from public.chat_turns ignored
          where ignored.id=src.turn_id and ignored.subject_id=src.subject_id
            and ignored.thread_id=src.thread_id
            and ignored.state='abandoned'
            and ignored.committed_attempt_id is null
            and ignored.committed_at is null
            and src.sender_type='user'
        )$excluded$);
  EXECUTE g;
END $patch$;
RESET ROLE;

DO $cleanup$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    EXECUTE 'REVOKE myeongha_seyeon_chat_runtime_owner FROM postgres GRANTED BY postgres';
  END IF;
END $cleanup$;
REVOKE CREATE ON SCHEMA public FROM myeongha_seyeon_chat_runtime_owner;
REVOKE CREATE ON SCHEMA seyeon_private FROM myeongha_seyeon_chat_runtime_owner;

DO $post$
DECLARE f oid; g oid; h oid; z oid;
BEGIN
  f:=to_regprocedure('seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)')::oid;
  g:=to_regprocedure('seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)')::oid;
  h:=to_regprocedure('seyeon_private.lock_g0_original_message_v1(uuid,uuid,uuid,text)')::oid;
  z:=to_regprocedure('seyeon_private.assert_g0_zero_assistant_lineage_v1(uuid,uuid,uuid)')::oid;
  IF f IS NULL OR g IS NULL OR h IS NULL OR z IS NULL
    OR pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid=h))<>'postgres'
    OR EXISTS(SELECT 1 FROM pg_proc WHERE oid IN (f,g,z)
       AND (pg_get_userbyid(proowner)<>'myeongha_seyeon_chat_runtime_owner'
         OR NOT prosecdef))
    OR EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_seyeon_subject_login') AND
      (has_function_privilege(r.rolname,h,'EXECUTE') OR
       has_function_privilege(r.rolname,z,'EXECUTE')))
    OR NOT has_function_privilege('myeongha_seyeon_chat_runtime_owner',h,'EXECUTE')
    OR NOT has_function_privilege('myeongha_seyeon_chat_runtime_owner',z,'EXECUTE')
    OR has_table_privilege('myeongha_seyeon_chat_runtime_owner',
                           'public.conversation_messages','UPDATE')
    OR has_schema_privilege('myeongha_seyeon_chat_runtime_owner',
                           'seyeon_private','CREATE')
    OR has_schema_privilege('myeongha_seyeon_chat_runtime_owner',
                           'public','CREATE')
  THEN RAISE EXCEPTION 'G0 continuation source authority postcondition failed'; END IF;
END $post$;
COMMIT;

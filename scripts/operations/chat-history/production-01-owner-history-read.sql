-- Watchtower-Track: frontend-integration
-- Common owner-scoped, currently authorized chat history. Historical rows
-- are NOT equivalent to authorization to reveal their source contents.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
  IF current_user <> 'postgres'
    OR to_regprocedure('public.qry_chat_thread_owner_visible_history_v1(uuid,uuid,bigint,integer)') IS NOT NULL
    OR to_regprocedure('seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)') IS NULL
    OR to_regnamespace('chat_private') IS NOT NULL
    OR (SELECT pg_get_userbyid(p.proowner)
        FROM pg_proc p WHERE p.oid=
        'seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)'::regprocedure)
       IS DISTINCT FROM 'myeongha_seyeon_chat_runtime_owner'
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles operator
      LEFT JOIN pg_auth_members membership
        ON membership.member=operator.oid
       AND membership.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
      WHERE operator.rolname='postgres'
        AND (operator.rolsuper OR (
          membership.admin_option
          AND NOT membership.set_option
          AND NOT membership.inherit_option
        ))
    )
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='myeongha_api_executor'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR has_table_privilege('myeongha_api_executor','public.conversation_messages','SELECT')
  THEN RAISE EXCEPTION 'Common Chat history read prerequisites drifted'; END IF;
END $guard$;

-- The web's public API function stays SECURITY INVOKER. A separate, private
-- DEFINER is owned by a non-login, non-bypass, read-only role, not postgres.
-- Postgres RLS remains active for every protected table.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='myeongha_chat_history_reader_v1')
  THEN
    EXECUTE 'CREATE ROLE myeongha_chat_history_reader_v1 NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles r
    WHERE r.rolname='myeongha_chat_history_reader_v1'
      AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND NOT r.rolinherit AND NOT r.rolcreaterole AND NOT r.rolcreatedb
  ) OR EXISTS (
    SELECT 1 FROM pg_auth_members a
    WHERE a.member='myeongha_chat_history_reader_v1'::regrole
  ) THEN RAISE EXCEPTION 'Chat history reader role privilege drift'; END IF;
END $role$;

-- PostgreSQL 17 does not give a non-superuser CREATEROLE operator SET
-- membership in a newly created role. Temporarily permit owner transfer
-- inside this single transaction, then revoke SET before commit.
GRANT myeongha_chat_history_reader_v1 TO postgres
  WITH INHERIT FALSE, SET TRUE;

CREATE SCHEMA chat_private;
REVOKE ALL ON SCHEMA chat_private FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA chat_private TO myeongha_api_executor;
-- PostgreSQL 17 requires CREATE for the new owner at ALTER FUNCTION time.
GRANT CREATE ON SCHEMA chat_private TO myeongha_chat_history_reader_v1;
GRANT USAGE ON SCHEMA seyeon_private TO myeongha_chat_history_reader_v1;
GRANT EXECUTE ON FUNCTION public.assert_myeongha_subject_context_v1(uuid)
  TO myeongha_chat_history_reader_v1;
GRANT EXECUTE ON FUNCTION public.current_myeongha_subject_id()
  TO myeongha_chat_history_reader_v1;
-- The original source checker belongs to the Se-yeon runtime owner, not
-- the managed migration role. Grant ONLY this checker's EXECUTE from its
-- actual owner, with transaction-scoped SET privileges immediately revoked.
GRANT myeongha_seyeon_chat_runtime_owner TO postgres
  WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE myeongha_seyeon_chat_runtime_owner;
GRANT EXECUTE ON FUNCTION seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)
  TO myeongha_chat_history_reader_v1;
RESET ROLE;
REVOKE SET OPTION FOR myeongha_seyeon_chat_runtime_owner FROM postgres;

-- Column-limited read rights. API executor receives none of these.
GRANT SELECT(id,status,merged_into_subject_id) ON public.subjects
  TO myeongha_chat_history_reader_v1;
GRANT SELECT(id,subject_id,status) ON public.conversation_threads
  TO myeongha_chat_history_reader_v1;
GRANT SELECT(id,subject_id,thread_id,turn_id,sequence_no,sender_type,
             thread_character_id,body_text,message_schema_version,created_at,redacted_at)
  ON public.conversation_messages TO myeongha_chat_history_reader_v1;
GRANT SELECT(id,thread_id,character_id) ON public.conversation_thread_characters
  TO myeongha_chat_history_reader_v1;
GRANT SELECT(id,subject_id,thread_id,state,delivered_at,committed_attempt_id)
  ON public.chat_turns TO myeongha_chat_history_reader_v1;
GRANT SELECT(id,subject_id,turn_id,state,committed_message_id,
             seyeon_positive_delivery_received_at)
  ON public.chat_turn_attempts TO myeongha_chat_history_reader_v1;

-- These RLS policies match the verified, transaction-scoped Subject.
CREATE POLICY chat_history_subject_reader_v1 ON public.subjects
  FOR SELECT TO myeongha_chat_history_reader_v1
  USING(id=public.current_myeongha_subject_id());
CREATE POLICY chat_history_thread_reader_v1 ON public.conversation_threads
  FOR SELECT TO myeongha_chat_history_reader_v1
  USING(subject_id=public.current_myeongha_subject_id());
CREATE POLICY chat_history_message_reader_v1 ON public.conversation_messages
  FOR SELECT TO myeongha_chat_history_reader_v1
  USING(subject_id=public.current_myeongha_subject_id());
CREATE POLICY chat_history_participant_reader_v1 ON public.conversation_thread_characters
  FOR SELECT TO myeongha_chat_history_reader_v1
  USING(EXISTS (
    SELECT 1 FROM public.conversation_threads thread
    WHERE thread.id=thread_id
      AND thread.subject_id=public.current_myeongha_subject_id()
  ));

CREATE FUNCTION chat_private.qry_chat_thread_owner_visible_history_v1(
  p_subject_id uuid,p_thread_id uuid,p_after_sequence_no bigint,p_page_size integer
)
RETURNS TABLE(
  message_id uuid,sequence_no bigint,sender_type text,character_id text,
  body_text text,message_payload_jsonb jsonb,message_schema_version text,
  created_at timestamptz,redacted boolean,redacted_at timestamptz,turn_state text
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' SET row_security=on
AS $history$
DECLARE
  v_row record;
  v_hide boolean;
BEGIN
  IF p_subject_id IS NULL OR p_thread_id IS NULL
    OR p_after_sequence_no IS NULL OR p_after_sequence_no<0
    OR p_page_size IS NULL OR p_page_size<1 OR p_page_size>50
  THEN
    RAISE EXCEPTION USING errcode='22023',
      constraint='chat_history_invalid_request',message='Invalid Chat history request';
  END IF;
  -- The subject is determined by the verified server-side login transaction.
  -- Never accept client-supplied subject or principal as authorization.
  PERFORM public.assert_myeongha_subject_context_v1(p_subject_id);
  PERFORM 1 FROM public.subjects s
    WHERE s.id=p_subject_id AND s.status='active'
      AND s.merged_into_subject_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='42501',
      constraint='chat_history_subject_unavailable',
      message='Chat history unavailable';
  END IF;
  PERFORM 1 FROM public.conversation_threads t
    WHERE t.id=p_thread_id AND t.subject_id=p_subject_id
      AND t.status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='42501',
      constraint='chat_history_thread_unavailable',
      message='Chat history unavailable';
  END IF;

  -- Page over original message sequence without returning raw JSON payloads.
  -- User messages are retained even on failed/abandoned turns. Character
  -- messages must have committed, delivered and (for Se-yeon) ACKed output.
  FOR v_row IN
    SELECT m.id,m.sequence_no,m.sender_type,
      CASE WHEN m.sender_type='character' THEN c.character_id ELSE NULL END AS character_id,
      m.body_text,m.message_schema_version,m.created_at,m.redacted_at,
      m.turn_id,t.state AS stored_turn_state,t.id AS matched_turn,
      a.id AS committed_attempt,a.state AS attempt_state,
      a.committed_message_id,a.seyeon_positive_delivery_received_at,
      t.delivered_at
    FROM public.conversation_messages m
    LEFT JOIN public.chat_turns t
      ON t.id=m.turn_id AND t.subject_id=m.subject_id AND t.thread_id=m.thread_id
    LEFT JOIN public.chat_turn_attempts a
      ON a.id=t.committed_attempt_id AND a.turn_id=t.id
      AND a.subject_id=t.subject_id
    LEFT JOIN public.conversation_thread_characters c
      ON c.id=m.thread_character_id AND c.thread_id=m.thread_id
    WHERE m.subject_id=p_subject_id AND m.thread_id=p_thread_id
      AND m.sequence_no>p_after_sequence_no
      -- Internal system messages are not user-visible conversation turns.
      AND m.sender_type IN ('user','character')
      AND (m.turn_id IS NULL OR t.id IS NOT NULL)
      AND (
        m.sender_type='user' OR
        (m.sender_type='character' AND c.character_id IS NOT NULL AND (
          (t.state='delivered' AND t.delivered_at IS NOT NULL
            AND a.id IS NOT NULL AND a.state='committed'
            AND a.committed_message_id=m.id
            AND (c.character_id<>'seyeon'
              OR a.seyeon_positive_delivery_received_at IS NOT NULL))
          OR (m.turn_id IS NULL AND c.character_id<>'seyeon')
        ))
      )
    ORDER BY m.sequence_no ASC
    LIMIT (p_page_size+1)
  LOOP
    v_hide:=v_row.redacted_at IS NOT NULL;
    -- Current source authority is checked afresh on each history read:
    -- a revoked memory grant must never be replayed as a visible answer.
    IF NOT v_hide AND v_row.sender_type='character'
      AND v_row.character_id='seyeon' THEN
      BEGIN
        PERFORM seyeon_private.assert_current_original_assistant_lineage_v1(
          p_subject_id,p_thread_id,v_row.id);
      EXCEPTION WHEN OTHERS THEN
        -- Keep the original position as an unavailable/redacted placeholder.
        -- Never return a protected assistant body or raw error detail.
        v_hide:=true;
      END;
    END IF;
    message_id:=v_row.id;
    sequence_no:=v_row.sequence_no;
    sender_type:=v_row.sender_type;
    character_id:=v_row.character_id;
    body_text:=CASE WHEN v_hide THEN NULL ELSE v_row.body_text END;
    message_payload_jsonb:=NULL;
    message_schema_version:=v_row.message_schema_version;
    created_at:=v_row.created_at;
    redacted:=v_hide;
    redacted_at:=CASE WHEN v_hide THEN
      coalesce(v_row.redacted_at,transaction_timestamp()) ELSE NULL END;
    turn_state:=CASE WHEN v_row.sender_type='user'
      THEN coalesce(v_row.stored_turn_state,'recorded') ELSE NULL END;
    RETURN NEXT;
  END LOOP;
END $history$;

REVOKE ALL ON FUNCTION chat_private.qry_chat_thread_owner_visible_history_v1(uuid,uuid,bigint,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION chat_private.qry_chat_thread_owner_visible_history_v1(uuid,uuid,bigint,integer)
  TO myeongha_api_executor;

-- The public RPC surface is an invoker-only delegate, without table reads.
CREATE FUNCTION public.qry_chat_thread_owner_visible_history_v1(
  p_subject_id uuid,p_thread_id uuid,p_after_sequence_no bigint,p_page_size integer
)
RETURNS TABLE(
  message_id uuid,sequence_no bigint,sender_type text,character_id text,
  body_text text,message_payload_jsonb jsonb,message_schema_version text,
  created_at timestamptz,redacted boolean,redacted_at timestamptz,turn_state text
)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $wrapper$
  SELECT * FROM chat_private.qry_chat_thread_owner_visible_history_v1(
    p_subject_id,p_thread_id,p_after_sequence_no,p_page_size);
$wrapper$;

REVOKE ALL ON FUNCTION public.qry_chat_thread_owner_visible_history_v1(uuid,uuid,bigint,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.qry_chat_thread_owner_visible_history_v1(uuid,uuid,bigint,integer)
  TO myeongha_api_executor;

-- Finish all grants while the deployer owns the objects; transfer ownership
-- last, and remove temporary SET rights before the transaction commits.
ALTER FUNCTION chat_private.qry_chat_thread_owner_visible_history_v1(uuid,uuid,bigint,integer)
  OWNER TO myeongha_chat_history_reader_v1;
ALTER SCHEMA chat_private OWNER TO myeongha_chat_history_reader_v1;
REVOKE SET OPTION FOR myeongha_chat_history_reader_v1 FROM postgres;

DO $post$
DECLARE f oid; private_f oid;
BEGIN
  f:=to_regprocedure('public.qry_chat_thread_owner_visible_history_v1(uuid,uuid,bigint,integer)')::oid;
  -- Read the catalog after ownership transfer: deployer intentionally has
  -- no USAGE on the private schema, so to_regprocedure would be denied.
  SELECT proc.oid INTO private_f
  FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace
  WHERE ns.nspname='chat_private'
    AND proc.proname='qry_chat_thread_owner_visible_history_v1'
    AND proc.pronargs=4
    AND proc.proargtypes[0]='uuid'::regtype
    AND proc.proargtypes[1]='uuid'::regtype
    AND proc.proargtypes[2]='bigint'::regtype
    AND proc.proargtypes[3]='integer'::regtype;
  IF f IS NULL
    OR (SELECT proowner FROM pg_proc WHERE oid=f) <> to_regrole('postgres')::oid
    OR (SELECT prosecdef FROM pg_proc WHERE oid=f)
    OR private_f IS NULL
    OR (SELECT nspowner FROM pg_namespace WHERE nspname='chat_private')
       <> to_regrole('myeongha_chat_history_reader_v1')::oid
    OR (SELECT proowner FROM pg_proc WHERE oid=private_f)
       <> to_regrole('myeongha_chat_history_reader_v1')::oid
    OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=private_f)
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=private_f
        AND 'row_security=on'=ANY(proconfig)
        AND 'search_path=""'=ANY(proconfig))
    OR EXISTS (SELECT 1 FROM pg_auth_members a
      WHERE a.roleid='myeongha_chat_history_reader_v1'::regrole
        AND a.member='postgres'::regrole AND a.set_option)
    OR EXISTS (SELECT 1 FROM pg_auth_members a
        WHERE a.member='postgres'::regrole
          AND a.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
          AND a.set_option)
    OR NOT has_function_privilege('myeongha_chat_history_reader_v1',
       'seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated',
       'seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)', 'EXECUTE')
    OR has_schema_privilege('myeongha_api_executor','chat_private','CREATE')
    OR NOT has_function_privilege('myeongha_api_executor',private_f,'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN
         ('anon','authenticated','service_role')
         AND has_function_privilege(r.oid,private_f,'EXECUTE'))
    OR NOT has_function_privilege('myeongha_api_executor',f,'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN
      ('anon','authenticated','service_role')
      AND has_function_privilege(r.oid,f,'EXECUTE'))
    OR has_table_privilege('myeongha_api_executor','public.conversation_messages','SELECT')
  THEN RAISE EXCEPTION 'Common Chat history postcondition failed'; END IF;
END $post$;
COMMIT;
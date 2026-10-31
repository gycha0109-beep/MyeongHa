-- Watchtower-Track: security
-- Read-only operator readiness for the four original-source G0 functions.
-- Use from the production DB operator console before attempting an
-- authenticated first-reply send. Does not read private user records.
WITH required(signature, application_execute) AS (
  VALUES
    ('public.qry_seyeon_g0_current_source_recent_messages_v1(uuid,uuid,uuid,integer)',true),
    ('public.qry_seyeon_g0_current_source_relationship_history_v1(uuid,text,bigint)',true),
    ('seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)',false),
    ('seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)',false)
),
checks AS (
  SELECT required.signature,
    to_regprocedure(required.signature)::oid AS function_oid,
    required.application_execute
  FROM required
)
SELECT signature,
       function_oid IS NOT NULL AS installed,
       CASE WHEN function_oid IS NULL THEN false ELSE
         (SELECT p.prosecdef AND
           pg_catalog.pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'
          FROM pg_catalog.pg_proc p WHERE p.oid=function_oid)
       END AS approved_owner_and_definer,
       CASE WHEN function_oid IS NULL THEN false ELSE
         has_function_privilege('myeongha_api_executor',function_oid,'EXECUTE')=application_execute
       END AS executor_boundary,
       CASE WHEN function_oid IS NULL THEN false ELSE
         NOT has_function_privilege('anon',function_oid,'EXECUTE')
         AND NOT has_function_privilege('authenticated',function_oid,'EXECUTE')
         AND NOT has_function_privilege('service_role',function_oid,'EXECUTE')
       END AS restricted_public_roles
FROM checks
ORDER BY signature;

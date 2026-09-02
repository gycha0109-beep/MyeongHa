-- Production runtime function ACL hardening.
--
-- Supabase production grants explicit EXECUTE privileges to API-facing roles through
-- default privileges. REVOKE ... FROM PUBLIC does not remove those explicit grants.
-- Ordinary MyeongHa user-data execution is server-resolved and must flow only through
-- the dedicated NOBYPASSRLS myeongha_api_executor role. Reassert that boundary for
-- every current production runtime function explicitly entrusted to that executor.
--
-- Trigger/constraint helper functions are intentionally outside this list: they are
-- not ordinary runtime RPC surfaces granted explicitly to myeongha_api_executor.

revoke all on function public.current_myeongha_subject_id() from public;
revoke all on function public.assert_myeongha_subject_context_v1(uuid) from public;
revoke all on function public.begin_member_subject_context_v1(uuid) from public;
revoke all on function public.begin_guest_subject_context_v1(text) from public;
revoke all on function public.qry_subject_profile_current_v1(uuid) from public;
revoke all on function public.cmd_create_guest_session_runtime_v1(uuid, uuid, text, timestamptz) from public;
revoke all on function public.qry_guest_bootstrap_current_v1(uuid) from public;
revoke all on function public.qry_birth_profile_current_revision_v1(uuid, uuid) from public;

DO $$
DECLARE
  v_role text;
  v_signature text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    FOREACH v_signature IN ARRAY ARRAY[
      'public.current_myeongha_subject_id()',
      'public.assert_myeongha_subject_context_v1(uuid)',
      'public.begin_member_subject_context_v1(uuid)',
      'public.begin_guest_subject_context_v1(text)',
      'public.qry_subject_profile_current_v1(uuid)',
      'public.cmd_create_guest_session_runtime_v1(uuid,uuid,text,timestamptz)',
      'public.qry_guest_bootstrap_current_v1(uuid)',
      'public.qry_birth_profile_current_revision_v1(uuid,uuid)'
    ]
    LOOP
      EXECUTE pg_catalog.format(
        'revoke all on function %s from %I',
        v_signature,
        v_role
      );
    END LOOP;
  END LOOP;
END
$$;

grant execute on function public.current_myeongha_subject_id()
to myeongha_api_executor;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
to myeongha_api_executor;
grant execute on function public.begin_member_subject_context_v1(uuid)
to myeongha_api_executor;
grant execute on function public.begin_guest_subject_context_v1(text)
to myeongha_api_executor;
grant execute on function public.qry_subject_profile_current_v1(uuid)
to myeongha_api_executor;
grant execute on function public.cmd_create_guest_session_runtime_v1(uuid, uuid, text, timestamptz)
to myeongha_api_executor;
grant execute on function public.qry_guest_bootstrap_current_v1(uuid)
to myeongha_api_executor;
grant execute on function public.qry_birth_profile_current_revision_v1(uuid, uuid)
to myeongha_api_executor;

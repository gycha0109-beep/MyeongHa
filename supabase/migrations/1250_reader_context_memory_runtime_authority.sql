-- Production Reader Chat Memory context runtime authority.
--
-- Reader follow-up preflight already admits only current non-revoked Memory
-- Items with an explicit active grant to the active Reader. This migration
-- opens only the SECURITY INVOKER reads required for that server-side
-- composition under the transaction-local canonical subject.
--
-- No Memory creation/regrant/revoke authority is added here.

alter table public.record_access_grants enable row level security;

drop policy if exists record_access_grants_api_current_select_v1
  on public.record_access_grants;
create policy record_access_grants_api_current_select_v1
  on public.record_access_grants
  for select
  to myeongha_api_executor
  using (subject_id = public.current_myeongha_subject_id());

revoke select on public.record_access_grants from myeongha_api_executor;

grant select (
  id,
  subject_id,
  memory_item_id,
  grantee_character_id,
  grant_reason,
  granted_at,
  revoked_at
) on public.record_access_grants to myeongha_api_executor;

revoke all on function public.qry_memory_items_v1(uuid) from public;
revoke all on function public.qry_memory_active_grants_v1(uuid, uuid) from public;

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
      'public.qry_memory_items_v1(uuid)',
      'public.qry_memory_active_grants_v1(uuid,uuid)'
    ]
    LOOP
      EXECUTE pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
    END LOOP;
  END LOOP;
END
$$;

grant execute on function public.qry_memory_items_v1(uuid)
  to myeongha_api_executor;
grant execute on function public.qry_memory_active_grants_v1(uuid, uuid)
  to myeongha_api_executor;

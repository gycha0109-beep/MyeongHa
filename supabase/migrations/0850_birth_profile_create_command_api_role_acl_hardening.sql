-- Birth Profile create remains a server-only command until its production
-- fingerprint/key and PostgreSQL write execution authority are explicitly activated.
--
-- Supabase may add explicit EXECUTE grants for API roles after a function is
-- created. REVOKE FROM PUBLIC does not remove those role-specific grants.
-- Remove the latent API-role command surface without granting the production
-- API executor any Birth Profile write authority.

revoke all on function public.cmd_create_birth_profile_v1(
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  time,
  boolean,
  boolean,
  text,
  text
) from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format(
        'revoke all on function public.cmd_create_birth_profile_v1(uuid, uuid, uuid, text, text, date, time, boolean, boolean, text, text) from %I',
        api_role
      );
    end if;
  end loop;
end
$$;

-- Deliberately no GRANT to myeongha_api_executor here.
-- POST /api/birth-profiles stays inactive until the fingerprint/key contract
-- and subject-scoped PostgreSQL write authority are separately closed.

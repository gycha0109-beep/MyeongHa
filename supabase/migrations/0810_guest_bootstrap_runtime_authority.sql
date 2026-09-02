-- Production Guest bootstrap authority after P0-AUTH-01.
--
-- Fresh Guest creation is the one user-data ingress that cannot begin with an
-- already-resolved canonical subject. The ordinary API execution role therefore
-- receives no raw DML on subjects/guest_sessions and no EXECUTE on the historical
-- source-safe core command. Instead it may call only this narrow SECURITY DEFINER
-- wrapper, which accepts the server-generated ids/expiry and only the exact
-- production HMAC verifier format before delegating atomically to the core command.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_api_executor'
      AND NOT r.rolcanlogin
      AND NOT r.rolsuper
      AND NOT r.rolcreatedb
      AND NOT r.rolcreaterole
      AND NOT r.rolinherit
      AND NOT r.rolreplication
      AND NOT r.rolbypassrls
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor is missing or outside the production least-privilege contract';
  END IF;
END
$$;

create or replace function public.cmd_create_guest_session_runtime_v1(
  p_subject_id uuid,
  p_guest_session_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (
  subject_id uuid,
  guest_session_id uuid,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_token_hash is null
     or p_token_hash !~ '^myeongha-guest-bearer-hmac-sha256-v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'guest_bootstrap_runtime_verifier_format',
      message = 'production guest verifier fingerprint is invalid';
  end if;

  return query
  select core.subject_id,
         core.guest_session_id,
         core.expires_at,
         core.replayed
  from public.cmd_create_guest_session_v1(
    p_subject_id,
    p_guest_session_id,
    p_token_hash,
    p_expires_at
  ) core;
end;
$$;

-- Supabase may grant explicit function EXECUTE to API-facing roles through default
-- privileges. CI's plain PostgreSQL fixture does not create those roles, so revoke
-- them only when present while always removing PUBLIC access.
revoke all on function public.cmd_create_guest_session_runtime_v1(
  uuid, uuid, text, timestamptz
) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_create_guest_session_runtime_v1(uuid,uuid,text,timestamptz) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_create_guest_session_runtime_v1(
  uuid, uuid, text, timestamptz
) to myeongha_api_executor;

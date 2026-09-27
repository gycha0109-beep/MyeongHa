-- SEC-02 C1: dormant PostgreSQL Member Auth abuse-admission foundation.
--
-- This migration does not wire any HTTP route. It creates one ephemeral UNLOGGED
-- counter table and one narrow SECURITY DEFINER admission command. Raw client IP
-- addresses are never accepted by this database boundary; only 32-byte HMAC
-- fingerprints may enter.

DO $$
DECLARE
  v_role record;
  v_marker text;
  v_expected_marker constant text := 'myeongha:member-auth-rate-limit-owner:v1';
BEGIN
  SELECT
    oid,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
  INTO v_role
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_member_auth_rate_limit_owner';

  IF NOT FOUND THEN
    CREATE ROLE myeongha_member_auth_rate_limit_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;

    COMMENT ON ROLE myeongha_member_auth_rate_limit_owner IS
      'myeongha:member-auth-rate-limit-owner:v1';
  ELSE
    v_marker := pg_catalog.shobj_description(v_role.oid, 'pg_authid');

    IF v_marker IS DISTINCT FROM v_expected_marker THEN
      RAISE EXCEPTION 'myeongha_member_auth_rate_limit_owner exists without the managed role marker';
    END IF;

    IF v_role.rolcanlogin
       OR v_role.rolsuper
       OR v_role.rolcreatedb
       OR v_role.rolcreaterole
       OR v_role.rolinherit
       OR v_role.rolreplication
       OR v_role.rolbypassrls THEN
      RAISE EXCEPTION 'managed Member Auth rate-limit owner violates least-privilege role shape';
    END IF;
  END IF;
END
$$;

create unlogged table if not exists public.member_auth_rate_limit_buckets (
  action text not null,
  client_fingerprint bytea not null,
  window_started_at timestamptz not null,
  reset_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null,
  constraint member_auth_rate_limit_buckets_pkey
    primary key (action, client_fingerprint),
  constraint member_auth_rate_limit_action_valid
    check (action in ('sign-in', 'sign-up', 'refresh')),
  constraint member_auth_rate_limit_fingerprint_32_bytes
    check (pg_catalog.octet_length(client_fingerprint) = 32),
  constraint member_auth_rate_limit_request_count_bounded
    check (request_count between 1 and 31),
  constraint member_auth_rate_limit_window_valid
    check (reset_at > window_started_at)
);

create index if not exists member_auth_rate_limit_buckets_reset_at_idx
  on public.member_auth_rate_limit_buckets(reset_at);

comment on table public.member_auth_rate_limit_buckets is
  'Ephemeral UNLOGGED Member Auth abuse-admission counters keyed only by endpoint action and a 32-byte server-derived HMAC fingerprint. Raw network identifiers are forbidden.';

grant myeongha_member_auth_rate_limit_owner to current_user;
grant create on schema public to myeongha_member_auth_rate_limit_owner;

alter table public.member_auth_rate_limit_buckets
  owner to myeongha_member_auth_rate_limit_owner;

create or replace function public.cmd_admit_member_auth_request_v1(
  p_action text,
  p_client_fingerprint bytea
)
returns table (
  allowed boolean,
  request_count integer,
  reset_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $member_auth_rate_limit$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request_count integer;
  v_reset_at timestamptz;
begin
  if p_action is null
     or p_action not in ('sign-in', 'sign-up', 'refresh') then
    raise exception using
      errcode = '23514',
      constraint = 'member_auth_rate_limit_action_required',
      message = 'Member Auth rate-limit action must be sign-in, sign-up, or refresh';
  end if;

  if p_client_fingerprint is null
     or pg_catalog.octet_length(p_client_fingerprint) <> 32 then
    raise exception using
      errcode = '23514',
      constraint = 'member_auth_rate_limit_fingerprint_required',
      message = 'Member Auth rate-limit client fingerprint must be exactly 32 bytes';
  end if;

  -- Bounded opportunistic cleanup. One request must never inherit unbounded
  -- maintenance work from historical client keys.
  delete from public.member_auth_rate_limit_buckets as stale_bucket
  where stale_bucket.ctid in (
    select candidate.ctid
    from public.member_auth_rate_limit_buckets as candidate
    where candidate.reset_at < v_now - interval '5 minutes'
    order by candidate.reset_at asc
    limit 8
  );

  insert into public.member_auth_rate_limit_buckets as current_bucket (
    action,
    client_fingerprint,
    window_started_at,
    reset_at,
    request_count,
    updated_at
  )
  values (
    p_action,
    p_client_fingerprint,
    v_now,
    v_now + interval '60 seconds',
    1,
    v_now
  )
  on conflict (action, client_fingerprint)
  do update
  set
    window_started_at = case
      when current_bucket.reset_at <= v_now then v_now
      else current_bucket.window_started_at
    end,
    reset_at = case
      when current_bucket.reset_at <= v_now then v_now + interval '60 seconds'
      else current_bucket.reset_at
    end,
    request_count = case
      when current_bucket.reset_at <= v_now then 1
      else least(current_bucket.request_count + 1, 31)
    end,
    updated_at = v_now
  returning
    current_bucket.request_count,
    current_bucket.reset_at
  into v_request_count, v_reset_at;

  return query
  select
    (v_request_count <= 30),
    v_request_count,
    v_reset_at;
end;
$member_auth_rate_limit$;

alter function public.cmd_admit_member_auth_request_v1(text, bytea)
  owner to myeongha_member_auth_rate_limit_owner;

revoke all on table public.member_auth_rate_limit_buckets from public;
revoke all on function public.cmd_admit_member_auth_request_v1(text, bytea) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN (
      'anon',
      'authenticated',
      'service_role',
      'myeongha_runtime',
      'myeongha_worker_runtime',
      'myeongha_system_executor'
    )
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_admit_member_auth_request_v1(text,bytea) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on table public.member_auth_rate_limit_buckets from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_admit_member_auth_request_v1(text, bytea)
  to myeongha_api_executor;

revoke all on table public.member_auth_rate_limit_buckets
  from myeongha_api_executor;

revoke create on schema public from myeongha_member_auth_rate_limit_owner;
revoke myeongha_member_auth_rate_limit_owner from current_user;

DO $$
DECLARE
  v_table_owner text;
  v_table_persistence "char";
  v_function_owner text;
  v_security_definer boolean;
BEGIN
  select owner_role.rolname, c.relpersistence
    into v_table_owner, v_table_persistence
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles owner_role on owner_role.oid = c.relowner
  where n.nspname = 'public'
    and c.relname = 'member_auth_rate_limit_buckets'
    and c.relkind = 'r';

  IF v_table_owner IS DISTINCT FROM 'myeongha_member_auth_rate_limit_owner'
     OR v_table_persistence IS DISTINCT FROM 'u' THEN
    RAISE EXCEPTION 'Member Auth rate-limit table lost dedicated ownership or UNLOGGED persistence';
  END IF;

  select owner_role.rolname, p.prosecdef
    into v_function_owner, v_security_definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
  where n.nspname = 'public'
    and p.oid = 'public.cmd_admit_member_auth_request_v1(text,bytea)'::pg_catalog.regprocedure;

  IF v_function_owner IS DISTINCT FROM 'myeongha_member_auth_rate_limit_owner'
     OR v_security_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Member Auth rate-limit command lost its dedicated SECURITY DEFINER owner';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_admit_member_auth_request_v1(text,bytea)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor cannot execute the Member Auth rate-limit command';
  END IF;

  IF pg_catalog.has_schema_privilege(
    'myeongha_member_auth_rate_limit_owner',
    'public',
    'CREATE'
  ) THEN
    RAISE EXCEPTION 'Member Auth rate-limit owner unexpectedly retains CREATE on public schema';
  END IF;

  IF pg_catalog.has_table_privilege(
      'myeongha_api_executor',
      'public.member_auth_rate_limit_buckets',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      'myeongha_api_executor',
      'public.member_auth_rate_limit_buckets',
      'INSERT'
    )
    OR pg_catalog.has_table_privilege(
      'myeongha_api_executor',
      'public.member_auth_rate_limit_buckets',
      'UPDATE'
    )
    OR pg_catalog.has_table_privilege(
      'myeongha_api_executor',
      'public.member_auth_rate_limit_buckets',
      'DELETE'
    ) THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly has direct Member Auth rate-limit table authority';
  END IF;
END
$$;

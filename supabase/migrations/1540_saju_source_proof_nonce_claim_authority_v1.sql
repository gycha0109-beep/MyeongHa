-- MyeongHa Saju transport proof replay register: DB Authority, 2B-3C-7B.
-- Watchtower-Track: saju-bridge
--
-- This does NOT grant Source semantic/Production Interpretation, Product,
-- Release, Character or Commerce authority. The protected HTTP proof path
-- remains unmounted and the default client fails closed without DB privileges.
--
-- A client-side nonce must never be used as the raw database primary key.
-- The API adapter inserts a domain-separated SHA-256 digest only.
-- Origin/service credential and HMAC proof key live outside PostgreSQL.

create table public.saju_source_proof_nonce_claims (
  replay_key_digest text primary key
    constraint saju_source_proof_nonce_digest_format_v1
      check (replay_key_digest ~ '^[0-9a-f]{64}$'),
  retained_until timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint saju_source_proof_nonce_retention_after_creation_v1
    check (retained_until > created_at)
);

create index saju_source_proof_nonce_expiration_v1
  on public.saju_source_proof_nonce_claims(retained_until);

alter table public.saju_source_proof_nonce_claims enable row level security;
alter table public.saju_source_proof_nonce_claims force row level security;

do $saju_source_proof_nonce_roles$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'myeongha_saju_proof_nonce_runtime'
  ) then
    create role myeongha_saju_proof_nonce_runtime
      nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'myeongha_saju_proof_nonce_gc'
  ) then
    create role myeongha_saju_proof_nonce_gc
      nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;

  if exists (
    select 1 from pg_catalog.pg_roles
    where rolname in (
      'myeongha_saju_proof_nonce_runtime',
      'myeongha_saju_proof_nonce_gc'
    )
    and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
      or rolinherit or rolreplication or rolbypassrls)
  ) then
    raise exception
      'Saju source proof nonce roles must remain no-login, no-inherit and least-privileged';
  end if;
end
$saju_source_proof_nonce_roles$;

-- PUBLIC and browser/Data API roles have no direct registry access.
revoke all on public.saju_source_proof_nonce_claims from public;
do $saju_source_proof_nonce_api_acl$
declare
  v_role text;
begin
  for v_role in
    select rolname
    from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  loop
    execute pg_catalog.format(
      'revoke all on public.saju_source_proof_nonce_claims from %I',
      v_role
    );
  end loop;
end
$saju_source_proof_nonce_api_acl$;

grant usage on schema public
  to myeongha_saju_proof_nonce_runtime,
     myeongha_saju_proof_nonce_gc;

-- Runtime can issue ONE immutable claim per digest, not inspect the nonce
-- registry's timestamp or mutate/delete any existing claim.
grant select (replay_key_digest),
      insert (replay_key_digest, retained_until)
  on public.saju_source_proof_nonce_claims
  to myeongha_saju_proof_nonce_runtime;

create policy saju_source_proof_nonce_runtime_select_v1
  on public.saju_source_proof_nonce_claims
  for select to myeongha_saju_proof_nonce_runtime
  using (true);

create policy saju_source_proof_nonce_runtime_insert_v1
  on public.saju_source_proof_nonce_claims
  for insert to myeongha_saju_proof_nonce_runtime
  with check (
    retained_until > clock_timestamp()
    and retained_until <= clock_timestamp() + interval '165 seconds'
  );

-- Dedicated GC authority may view/delete EXPIRED rows only.
-- API runtime cannot DELETE. No automatic cron job or API route is activated.
grant select (replay_key_digest, retained_until),
      delete
  on public.saju_source_proof_nonce_claims
  to myeongha_saju_proof_nonce_gc;

create policy saju_source_proof_nonce_gc_select_expired_v1
  on public.saju_source_proof_nonce_claims
  for select to myeongha_saju_proof_nonce_gc
  using (retained_until < clock_timestamp());

create policy saju_source_proof_nonce_gc_delete_expired_v1
  on public.saju_source_proof_nonce_claims
  for delete to myeongha_saju_proof_nonce_gc
  using (retained_until < clock_timestamp());

comment on table public.saju_source_proof_nonce_claims is
  'Saju Preview transport proof atomic replay registry. Digest only; no Subject/Birth, raw nonce, signature or Reading payload. Operational activation and key provisioning are separate gates.';

comment on column public.saju_source_proof_nonce_claims.retained_until is
  'Signed proof expiry plus 30-second anti-replay retention margin; GC is a separately governed operation.';

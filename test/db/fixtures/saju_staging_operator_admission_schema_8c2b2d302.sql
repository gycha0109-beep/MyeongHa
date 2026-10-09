-- Ephemeral PG15/PG17-only authority fixture. Not a deployment migration.
-- Watchtower-Track: saju-bridge. Existing Permit V1 table is untouched.
create role myeongha_saju_staging_admission_issuer
  nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role myeongha_saju_staging_admission_runtime
  nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role myeongha_saju_staging_admission_revoker
  nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;

create table public.saju_staging_operator_admission_permits_v2 (
  permit_id uuid primary key,
  manifest_digest text not null check (manifest_digest ~ '^[a-f0-9]{64}$'),
  connection_plan_digest text not null check (connection_plan_digest ~ '^[a-f0-9]{64}$'),
  environment_id text not null check (environment_id ~ '^myeongha-staging-[a-z0-9][a-z0-9-]*$'),
  myeongha_commit_sha text not null check (myeongha_commit_sha ~ '^[a-f0-9]{40}$'),
  saju_commit_sha text not null check (saju_commit_sha ~ '^[a-f0-9]{40}$'),
  approved_operator_id text not null check (approved_operator_id ~ '^[A-Za-z0-9._:-]{3,128}$'),
  approval_signature_key_id text not null check (approval_signature_key_id ~ '^[A-Za-z0-9._:-]{3,128}$'),
  issued_at_ms bigint not null,
  expires_at_ms bigint not null,
  consumed_at_ms bigint,
  status text not null,
  constraint staging_admission_v2_ttl check (
    issued_at_ms >= 0 and expires_at_ms > issued_at_ms
    and expires_at_ms - issued_at_ms <= 900000
  ),
  constraint staging_admission_v2_state check (
    (status in ('ISSUED','REVOKED') and consumed_at_ms is null)
    or (status = 'CONSUMED' and consumed_at_ms >= issued_at_ms
      and consumed_at_ms < expires_at_ms)
  )
);

alter table public.saju_staging_operator_admission_permits_v2 enable row level security;
alter table public.saju_staging_operator_admission_permits_v2 force row level security;
revoke all on public.saju_staging_operator_admission_permits_v2 from public;

do $acl$
declare role_name text;
begin
  for role_name in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_saju_proof_nonce_runtime')
  loop
    execute pg_catalog.format(
      'revoke all on public.saju_staging_operator_admission_permits_v2 from %I', role_name
    );
  end loop;
end
$acl$;

grant usage on schema public to
  myeongha_saju_staging_admission_issuer,
  myeongha_saju_staging_admission_runtime,
  myeongha_saju_staging_admission_revoker;

grant insert (
  permit_id, manifest_digest, connection_plan_digest,
  environment_id, myeongha_commit_sha, saju_commit_sha, approved_operator_id,
  approval_signature_key_id, issued_at_ms, expires_at_ms, consumed_at_ms, status
) on public.saju_staging_operator_admission_permits_v2
  to myeongha_saju_staging_admission_issuer;

create policy staging_admission_v2_issuer_insert
  on public.saju_staging_operator_admission_permits_v2
  for insert to myeongha_saju_staging_admission_issuer
  with check (
    status = 'ISSUED' and consumed_at_ms is null
    and issued_at_ms <= floor(extract(epoch from clock_timestamp()) * 1000)::bigint
    and expires_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  );

grant select (
  permit_id, manifest_digest, connection_plan_digest, environment_id,
  myeongha_commit_sha, saju_commit_sha, approved_operator_id,
  approval_signature_key_id, issued_at_ms, expires_at_ms, consumed_at_ms, status
) on public.saju_staging_operator_admission_permits_v2
  to myeongha_saju_staging_admission_runtime;

grant update (status, consumed_at_ms)
  on public.saju_staging_operator_admission_permits_v2
  to myeongha_saju_staging_admission_runtime;

create policy staging_admission_v2_runtime_read
  on public.saju_staging_operator_admission_permits_v2
  for select to myeongha_saju_staging_admission_runtime using (true);

create policy staging_admission_v2_runtime_consume
  on public.saju_staging_operator_admission_permits_v2
  for update to myeongha_saju_staging_admission_runtime
  using (
    status = 'ISSUED' and consumed_at_ms is null
    and issued_at_ms <= floor(extract(epoch from clock_timestamp()) * 1000)::bigint
    and expires_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  )
  with check (
    status = 'CONSUMED' and consumed_at_ms >= issued_at_ms
    and consumed_at_ms < expires_at_ms
  );

grant select (permit_id, status, consumed_at_ms)
  on public.saju_staging_operator_admission_permits_v2
  to myeongha_saju_staging_admission_revoker;
grant update (status)
  on public.saju_staging_operator_admission_permits_v2
  to myeongha_saju_staging_admission_revoker;

create policy staging_admission_v2_revoker_read
  on public.saju_staging_operator_admission_permits_v2
  for select to myeongha_saju_staging_admission_revoker using (true);
create policy staging_admission_v2_revoker_update
  on public.saju_staging_operator_admission_permits_v2
  for update to myeongha_saju_staging_admission_revoker
  using (status = 'ISSUED' and consumed_at_ms is null)
  with check (status = 'REVOKED' and consumed_at_ms is null);

comment on table public.saju_staging_operator_admission_permits_v2
  is 'Ephemeral CI-only Permit V2 authority contract; no deployed login memberships or operator key authority';

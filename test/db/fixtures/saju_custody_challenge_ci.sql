-- Watchtower-Track: saju-bridge
-- 3-04-02 isolated synthetic PG fixture; never a production migration.
-- No keys, secrets, operating Root, Runner, or live storage.
create schema saju_custody_ci;
revoke all on schema saju_custody_ci from public;

create role myeongha_saju_custody_floor_ci nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role myeongha_saju_challenge_issuer_ci nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role myeongha_saju_challenge_consumer_ci nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role myeongha_saju_challenge_revoker_ci nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
grant usage on schema saju_custody_ci to myeongha_saju_custody_floor_ci,
 myeongha_saju_challenge_issuer_ci,myeongha_saju_challenge_consumer_ci,myeongha_saju_challenge_revoker_ci;

create table saju_custody_ci.revision_floor (
 environment_id text primary key,
 root_key_id text not null,
 pinned_spki_sha256 text not null check (pinned_spki_sha256 ~ '^[a-f0-9]{64}$'),
 minimum_revision bigint not null check (minimum_revision >= 1),
 updated_at timestamptz not null default clock_timestamp()
);
-- Seed only by disposable DB owner, not through an API or a caller-supplied pin.
insert into saju_custody_ci.revision_floor values
 ('myeongha-staging-ci','ci-root-id',repeat('a',64),10,clock_timestamp());

create table saju_custody_ci.permit_challenge (
 challenge_id uuid primary key,
 challenge_digest text not null unique check (challenge_digest ~ '^[a-f0-9]{64}$'),
 nonce_digest text not null unique check (nonce_digest ~ '^[a-f0-9]{64}$'),
 environment_id text not null,
 permit_id uuid not null,
 manifest_digest text not null check (manifest_digest ~ '^[a-f0-9]{64}$'),
 connection_plan_digest text not null check (connection_plan_digest ~ '^[a-f0-9]{64}$'),
 myeongha_sha text not null check (myeongha_sha ~ '^[a-f0-9]{40}$'),
 saju_sha text not null check (saju_sha ~ '^[a-f0-9]{40}$'),
 issued_at_ms bigint not null,
 expires_at_ms bigint not null,
 consumed_at_ms bigint,
 state text not null check (state in ('ISSUED','CONSUMED','REVOKED')),
 constraint saju_challenge_ttl check (expires_at_ms>issued_at_ms and expires_at_ms-issued_at_ms<=60000),
 constraint saju_challenge_state check (
 (state in ('ISSUED','REVOKED') and consumed_at_ms is null)
 or (state='CONSUMED' and consumed_at_ms>=issued_at_ms and consumed_at_ms<expires_at_ms)
 )
);
create unique index permit_challenge_one_per_permit on saju_custody_ci.permit_challenge
 (environment_id,permit_id);
alter table saju_custody_ci.revision_floor enable row level security;
alter table saju_custody_ci.revision_floor force row level security;
alter table saju_custody_ci.permit_challenge enable row level security;
alter table saju_custody_ci.permit_challenge force row level security;
revoke all on all tables in schema saju_custody_ci from public;

-- A maximum-only high-water operation. External registry signature verification
-- MUST precede calling this. Result is not Root custody or release authority.
create function saju_custody_ci.advance_floor(
 p_env text,p_root_id text,p_pin text,p_revision bigint
) returns bigint language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare out_revision bigint;
begin
 if p_revision is null or p_revision<1 then return null; end if;
 update saju_custody_ci.revision_floor f
 set minimum_revision=greatest(f.minimum_revision,p_revision),updated_at=clock_timestamp()
 where f.environment_id=p_env and f.root_key_id=p_root_id
   and f.pinned_spki_sha256=p_pin and p_revision>=f.minimum_revision
 returning minimum_revision into out_revision;
 return out_revision;
end $$;

-- Only the independent issuer role can request an internally random 256-bit
-- challenge. Caller never chooses nonce or expected challenge digest.
create function saju_custody_ci.issue_challenge(
 p_env text,p_permit uuid,p_manifest text,p_plan text,p_msha text,p_ssha text,
 p_ttl_ms bigint
) returns table(challenge_id uuid,challenge_digest text)
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare n bytea; now_ms bigint; id uuid; cd text; nd text;
begin
 if p_env !~ '^myeongha-staging-[a-z0-9][a-z0-9-]*$'
 or p_permit is null or p_manifest !~ '^[a-f0-9]{64}$'
 or p_plan !~ '^[a-f0-9]{64}$' or p_msha !~ '^[a-f0-9]{40}$'
 or p_ssha !~ '^[a-f0-9]{40}$' or p_ttl_ms is null
 or p_ttl_ms<1 or p_ttl_ms>60000 then return; end if;
 n:=decode(replace(gen_random_uuid()::text,'-','') ||
 replace(gen_random_uuid()::text,'-','') ||
 replace(gen_random_uuid()::text,'-',''),'hex');
 nd:=encode(sha256(n),'hex');
 id:=gen_random_uuid();
 now_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 cd:=encode(sha256(convert_to('myeongha/saju/staging/challenge/v1','UTF8') ||
   decode('00','hex') || convert_to(
   jsonb_build_array(id,p_env,p_permit,p_manifest,p_plan,p_msha,p_ssha,now_ms,p_ttl_ms)::text,'UTF8') || n),'hex');
 insert into saju_custody_ci.permit_challenge values
 (id,cd,nd,p_env,p_permit,p_manifest,p_plan,p_msha,p_ssha,
  now_ms,now_ms+p_ttl_ms,null,'ISSUED');
 return query select id,cd;
end $$;

-- Single conditional SQL UPDATE; row lock and post-lock clock evaluation
-- ensure two concurrent consumers cannot both return true.
create function saju_custody_ci.consume_challenge(
 p_id uuid,p_digest text,p_env text,p_permit uuid,p_manifest text,p_plan text,
 p_msha text,p_ssha text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare affected integer; now_ms bigint;
begin
 update saju_custody_ci.permit_challenge c
 set state='CONSUMED',consumed_at_ms=floor(extract(epoch from clock_timestamp())*1000)::bigint
 where c.challenge_id=p_id and c.challenge_digest=p_digest
 and c.environment_id=p_env and c.permit_id=p_permit
 and c.manifest_digest=p_manifest and c.connection_plan_digest=p_plan
 and c.myeongha_sha=p_msha and c.saju_sha=p_ssha
 and c.state='ISSUED' and c.consumed_at_ms is null
 and c.issued_at_ms<=floor(extract(epoch from clock_timestamp())*1000)::bigint
 and c.expires_at_ms>floor(extract(epoch from clock_timestamp())*1000)::bigint;
 get diagnostics affected=row_count;
 return affected=1;
end $$;

create function saju_custody_ci.revoke_challenge(p_id uuid)
returns boolean language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare affected integer;
begin
 update saju_custody_ci.permit_challenge
 set state='REVOKED' where challenge_id=p_id and state='ISSUED';
 get diagnostics affected=row_count;
 return affected=1;
end $$;

revoke all on all functions in schema saju_custody_ci from public;
grant execute on function saju_custody_ci.advance_floor(text,text,text,bigint)
 to myeongha_saju_custody_floor_ci;
grant execute on function saju_custody_ci.issue_challenge(text,uuid,text,text,text,text,bigint)
 to myeongha_saju_challenge_issuer_ci;
grant execute on function saju_custody_ci.consume_challenge(uuid,text,text,uuid,text,text,text,text)
 to myeongha_saju_challenge_consumer_ci;
grant execute on function saju_custody_ci.revoke_challenge(uuid)
 to myeongha_saju_challenge_revoker_ci;
comment on schema saju_custody_ci is
 'CI-only 3-04-02 storage mechanism probe; not an approved operating authority';

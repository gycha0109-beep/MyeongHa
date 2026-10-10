-- Watchtower-Track: saju-bridge
-- SO-2 isolated PostgreSQL test only. Never deploy/migrate or use operating keys.
-- "VERIFIED" is an assertion from a separate synthetic verifier ROLE, NOT
-- cryptographic verification by PostgreSQL and NOT custody provenance.
create schema saju_so2_registry_ci;
revoke all on schema saju_so2_registry_ci from public;
create role myeongha_so2_registry_verifier_ci nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role myeongha_so2_registry_consumer_ci nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
create role myeongha_so2_registry_revoker_ci nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
grant usage on schema saju_so2_registry_ci to
 myeongha_so2_registry_verifier_ci,myeongha_so2_registry_consumer_ci,myeongha_so2_registry_revoker_ci;

create table saju_so2_registry_ci.pinned_root (
 environment_id text primary key,
 root_key_id text not null,
 root_spki_sha256 text not null check (root_spki_sha256 ~ '^[a-f0-9]{64}$'),
 minimum_revision bigint not null check (minimum_revision >= 1),
 revoked boolean not null default false
);
create table saju_so2_registry_ci.recovery_anchor (
 environment_id text primary key references saju_so2_registry_ci.pinned_root(environment_id),
 highest_revision bigint not null check (highest_revision >= 1)
);
create table saju_so2_registry_ci.registry_receipt (
 receipt_id uuid primary key,
 environment_id text not null references saju_so2_registry_ci.pinned_root(environment_id),
 root_key_id text not null,
 root_spki_sha256 text not null check (root_spki_sha256 ~ '^[a-f0-9]{64}$'),
 registry_digest_sha256 text not null check (registry_digest_sha256 ~ '^[a-f0-9]{64}$'),
 candidate_revision bigint not null check (candidate_revision>=1),
 state text not null check (state in ('VERIFIED_CLAIM','APPLIED'))
);
insert into saju_so2_registry_ci.pinned_root values
 ('myeongha-staging-so2','so2-root-id',repeat('a',64),10,false);
insert into saju_so2_registry_ci.recovery_anchor values
 ('myeongha-staging-so2',10);
alter table saju_so2_registry_ci.pinned_root enable row level security;
alter table saju_so2_registry_ci.pinned_root force row level security;
alter table saju_so2_registry_ci.recovery_anchor enable row level security;
alter table saju_so2_registry_ci.recovery_anchor force row level security;
alter table saju_so2_registry_ci.registry_receipt enable row level security;
alter table saju_so2_registry_ci.registry_receipt force row level security;
revoke all on all tables in schema saju_so2_registry_ci from public;

-- Only a SEPARATE role may assert prior Ed25519 validation (verified in TS).
-- The DB cannot distinguish a dishonest verifier: it is NOT an operating anchor.
create function saju_so2_registry_ci.record_claim(
 p_env text,p_root_id text,p_pin text,p_digest text,p_revision bigint
) returns uuid language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare id uuid;
begin
 if p_env is null or p_env !~ '^myeongha-staging-[a-z0-9][a-z0-9-]*$'
  or p_root_id is null or p_root_id !~ '^[A-Za-z0-9._:-]{3,128}$'
  or p_pin is null or p_pin !~ '^[a-f0-9]{64}$'
  or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
  or p_revision is null or p_revision<1 then return null; end if;
 if not exists (
  select 1 from saju_so2_registry_ci.pinned_root p
  join saju_so2_registry_ci.recovery_anchor a using(environment_id)
  where p.environment_id=p_env and p.root_key_id=p_root_id
  and p.root_spki_sha256=p_pin and p.revoked=false
  and p.minimum_revision>=a.highest_revision
  and p_revision>=p.minimum_revision
 ) then return null; end if;
 id:=gen_random_uuid();
 insert into saju_so2_registry_ci.registry_receipt values
 (id,p_env,p_root_id,p_pin,p_digest,p_revision,'VERIFIED_CLAIM');
 return id;
end $$;

-- Atomic CAS of the trusted pin, recovery high-water and one-use receipt.
-- The claimed detached signature/digest is checked in TypeScript before record_claim.
-- A READ-only API cannot call either function. UNKNOWN COMMIT never authorizes retry.
create function saju_so2_registry_ci.consume_verified_claim(
 p_id uuid,p_env text,p_root_id text,p_pin text,p_digest text,p_revision bigint
) returns boolean language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare rec saju_so2_registry_ci.registry_receipt%rowtype; updated_revision bigint;
begin
 select * into rec from saju_so2_registry_ci.registry_receipt r
 where r.receipt_id=p_id and r.state='VERIFIED_CLAIM'
   and r.environment_id=p_env and r.root_key_id=p_root_id
   and r.root_spki_sha256=p_pin and r.registry_digest_sha256=p_digest
   and r.candidate_revision=p_revision
 for update;
 if not found then return false; end if;

 update saju_so2_registry_ci.pinned_root p
 set minimum_revision=p_revision
 from saju_so2_registry_ci.recovery_anchor a
 where p.environment_id=rec.environment_id and a.environment_id=p.environment_id
   and p.root_key_id=rec.root_key_id and p.root_spki_sha256=rec.root_spki_sha256
   and p.revoked=false and p.minimum_revision>=a.highest_revision
   and p.minimum_revision<=rec.candidate_revision
 returning p.minimum_revision into updated_revision;
 if not found or updated_revision is distinct from p_revision then return false; end if;

 update saju_so2_registry_ci.recovery_anchor
 set highest_revision=greatest(highest_revision,p_revision)
 where environment_id=p_env;
 if not found then raise exception 'missing high-water anchor'; end if;
 update saju_so2_registry_ci.registry_receipt
 set state='APPLIED' where receipt_id=p_id and state='VERIFIED_CLAIM';
 if not found then raise exception 'receipt state lost'; end if;
 return true;
end $$;

create function saju_so2_registry_ci.revoke_root(
 p_env text,p_root_id text,p_pin text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare n integer;
begin
 update saju_so2_registry_ci.pinned_root
 set revoked=true where environment_id=p_env and root_key_id=p_root_id
 and root_spki_sha256=p_pin and revoked=false;
 get diagnostics n=row_count;
 return n=1;
end $$;

revoke all on all functions in schema saju_so2_registry_ci from public;
grant execute on function saju_so2_registry_ci.record_claim(text,text,text,text,bigint)
 to myeongha_so2_registry_verifier_ci;
grant execute on function saju_so2_registry_ci.consume_verified_claim(uuid,text,text,text,text,bigint)
 to myeongha_so2_registry_consumer_ci;
grant execute on function saju_so2_registry_ci.revoke_root(text,text,text)
 to myeongha_so2_registry_revoker_ci;
comment on schema saju_so2_registry_ci is
 'SO-2 CI synthetic proof receipt CAS, not operational Root custody or signed Registry verification';

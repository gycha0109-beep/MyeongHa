-- S3 -> S5 PRIVATE official Saju Production proof binding.
-- The current Saju #2410 only publishes a Preview transport proof. This
-- migration deliberately creates NO proof issuer, positive owner approval,
-- EXECUTE grant, or production paid-content capability.
--
-- A protected S5 answer cannot be written even after its current-Grant
-- precommit HOLD is separately resolved unless a one-to-one DB-recognized
-- Production source attestation matches the exact Subject/Reading/Reader/
-- Content Release/Product/response digest and semantic/output authority.
--
-- No user-provided boolean, synthetic Preview proof, transport-only HMAC,
-- unsigned source-ref, receipt existence or API header can create an S3 row.
-- The future Saju Owner production issuer/verification path must install
-- its own versioned verifier and private least-privilege Writer.
-- Watchtower-Track: db-authority-core

create table public.official_reader_s3_source_authority_receipts_v1 (
  id uuid primary key,
  subject_id uuid not null,
  official_reading_id uuid not null,
  reader_character_id text not null,
  reader_content_bundle_id uuid not null,
  content_release_id uuid not null,
  product_id uuid not null,
  product_spec_version text not null,
  official_artifact_response_hash text not null,
  source_response_hash text not null,
  source_attestation_ref text not null unique,
  issuer_id text not null,
  issuer_key_id text not null,
  source_proof_fingerprint text not null,
  attestation_contract_version text not null,
  production_interpretation_authority text not null,
  source_coverage_authority text not null,
  semantic_guard_version text not null,
  output_guard_version text not null,
  source_verified_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),

  constraint reader_s3_source_subject_fk
    foreign key(subject_id)
      references public.subjects(id) on delete cascade,
  constraint reader_s3_source_official_fk
    foreign key(official_reading_id,subject_id)
      references public.standard_reading_official_bindings(reading_id,subject_id),
  constraint reader_s3_source_catalog_fk
    foreign key(reader_character_id,reader_content_bundle_id)
      references public.character_runtime_catalog(character_id,content_bundle_id),
  constraint reader_s3_source_release_fk
    foreign key(content_release_id,reader_content_bundle_id)
      references public.content_releases(id,content_bundle_id),
  constraint reader_s3_source_product_fk
    foreign key(product_id)
      references public.standard_reading_product_specs(product_id),
  constraint reader_s3_source_ref_shape_check
    check (
      pg_catalog.length(source_attestation_ref) between 8 and 256
      and source_attestation_ref=pg_catalog.btrim(source_attestation_ref)
      and pg_catalog.length(issuer_id) between 3 and 128
      and issuer_id=pg_catalog.btrim(issuer_id)
      and pg_catalog.length(issuer_key_id) between 3 and 128
      and issuer_key_id=pg_catalog.btrim(issuer_key_id)
      and pg_catalog.length(product_spec_version) between 1 and 256
      and pg_catalog.length(semantic_guard_version) between 1 and 256
      and pg_catalog.length(output_guard_version) between 1 and 256
    ),
  constraint reader_s3_source_proof_hash_check
    check (
      source_proof_fingerprint ~ '^sha256:v1:[0-9a-f]{64}$'
      and source_response_hash ~ '^sha256:v1:[0-9a-f]{64}$'
      and pg_catalog.btrim(official_artifact_response_hash)<>''
    ),
  constraint reader_s3_source_production_lifecycle_check
    check (
      attestation_contract_version='official-reader-saju-production-source-proof-v1'
      and production_interpretation_authority='verified'
      and source_coverage_authority='complete'
    ),
  constraint reader_s3_source_time_check
    check(revoked_at is null or revoked_at>=source_verified_at),
  constraint reader_s3_source_identity_unique
    unique(
      id,subject_id,official_reading_id,reader_character_id,
      reader_content_bundle_id,content_release_id,product_id
    )
);

create index official_reader_s3_source_authority_scope_idx
  on public.official_reader_s3_source_authority_receipts_v1(
    subject_id,official_reading_id,reader_character_id,
    reader_content_bundle_id
  );

alter table public.official_reader_s3_source_authority_receipts_v1
  enable row level security;
alter table public.official_reader_s3_source_authority_receipts_v1
  force row level security;
revoke all on table public.official_reader_s3_source_authority_receipts_v1
  from public;

do $reader_s3_source_no_runtime_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_system_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on table public.official_reader_s3_source_authority_receipts_v1 from %I',
      v_role
    );
  end loop;
end
$reader_s3_source_no_runtime_acl$;

-- Defense in depth for the already-private S5 Writer. The row must have
-- been issued by a future independently authenticated Saju Production
-- verifier. Until then NO rows can be minted by application roles.
create or replace function public.internal_assert_official_reader_s3_source_receipt_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $official_reader_s3_source_receipt$
begin
  if not exists (
    select 1
    from public.official_reader_s3_source_authority_receipts_v1 proof
    where proof.source_attestation_ref=new.source_attestation_ref
      and proof.subject_id=new.subject_id
      and proof.official_reading_id=new.official_reading_id
      and proof.reader_character_id=new.reader_character_id
      and proof.reader_content_bundle_id=new.reader_content_bundle_id
      and proof.content_release_id=new.content_release_id
      and proof.product_id=new.product_id
      and proof.product_spec_version=new.product_spec_version
      and proof.official_artifact_response_hash=
        new.official_artifact_response_hash
      and proof.source_response_hash=new.source_response_hash
      and proof.semantic_guard_version=new.semantic_guard_version
      and proof.output_guard_version=new.output_guard_version
      and proof.attestation_contract_version=
        'official-reader-saju-production-source-proof-v1'
      and proof.production_interpretation_authority='verified'
      and proof.source_coverage_authority='complete'
      and proof.revoked_at is null
      and proof.source_verified_at<=pg_catalog.clock_timestamp()
  ) then
    raise exception using
      errcode='23514',
      constraint='reader_s5_missing_verified_saju_production_source',
      message='Official Reader protected answer needs exact verified Production source authority';
  end if;
  return new;
end
$official_reader_s3_source_receipt$;

revoke all on function public.internal_assert_official_reader_s3_source_receipt_v1()
  from public;

create trigger official_reader_paid_answer_s3_source_proof_guard_v1
before insert or update of
  source_attestation_ref,source_response_hash,
  official_artifact_response_hash,official_reading_id,subject_id,
  reader_character_id,reader_content_bundle_id,content_release_id,
  product_id,product_spec_version,semantic_guard_version,output_guard_version
on public.official_reader_paid_answer_bodies
for each row execute function public.internal_assert_official_reader_s3_source_receipt_v1();

comment on table public.official_reader_s3_source_authority_receipts_v1 is
'Private future Saju Production issuer evidence. NO Source Owner issuer exists under #2410, NO runtime may write rows, S5 source receipt guard is fail-closed. This table is not an approved Production source proof or permission to store, publish, sell or retrieve Reader paid answers.';

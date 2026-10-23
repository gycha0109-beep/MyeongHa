-- S3/S4 private source-proof lifecycle:
--   * Production evidence is immutable once issued; revocation is one-way.
--   * When S4 permanently deletes the LAST protected answer referencing a
--     proof, its private proof receipt/fingerprints are also physically erased.
-- This does not change Commerce P5Y evidence or any ordinary Chat safe marker.
-- Saju #2410 Production source issuance still HOLD; no runtime grants.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_immutable_official_reader_s3_source_proof_v1()
returns trigger
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_s3_immutable$
begin
  -- No rekeying, cross-Subject reassignment, altered signed bytes, policy
  -- rewriting or restoring an already revoked proof to usable state.
  if (pg_catalog.to_jsonb(new)-'revoked_at')
       is distinct from (pg_catalog.to_jsonb(old)-'revoked_at')
     or (old.revoked_at is not null
       and new.revoked_at is distinct from old.revoked_at)
     or (new.revoked_at is not null
       and new.revoked_at<old.source_verified_at) then
    raise exception using errcode='23514',
      constraint='reader_s3_production_proof_immutable',
      message='Authenticated Saju source authority cannot be rewritten';
  end if;
  return new;
end
$reader_s3_immutable$;

revoke all on function public.internal_immutable_official_reader_s3_source_proof_v1()
  from public;

create trigger official_reader_s3_proof_monotonic_v1
before update on public.official_reader_s3_source_authority_receipts_v1
for each row execute function
  public.internal_immutable_official_reader_s3_source_proof_v1();

create or replace function public.internal_purge_orphaned_reader_s3_source_proof_v1()
returns trigger
language plpgsql
volatile security definer
set search_path=pg_catalog,public
as $reader_s3_orphan_cleanup$
begin
  -- The original Reader protected body was erased by an authorized private
  -- deletion path. Only remove the linked proof after the LAST body has gone.
  -- Do not infer an Entitlement or read permission from residual hashes.
  delete from public.official_reader_s3_source_authority_receipts_v1 proof
  where proof.source_attestation_ref=old.source_attestation_ref
    and proof.subject_id=old.subject_id
    and proof.official_reading_id=old.official_reading_id
    and proof.reader_character_id=old.reader_character_id
    and not exists (
      select 1
      from public.official_reader_paid_answer_bodies surviving
      where surviving.source_attestation_ref=proof.source_attestation_ref
        and surviving.subject_id=proof.subject_id
    );
  return old;
end
$reader_s3_orphan_cleanup$;

revoke all on function public.internal_purge_orphaned_reader_s3_source_proof_v1()
  from public;

create trigger official_reader_s3_proof_after_last_answer_purge_v1
after delete on public.official_reader_paid_answer_bodies
for each row execute function
  public.internal_purge_orphaned_reader_s3_source_proof_v1();

comment on function public.internal_purge_orphaned_reader_s3_source_proof_v1()
is 'S4 DELETE-class retention: remove private Source Owner attestation fingerprint/identity only after final referencing paid ciphertext is physically erased, before archived backups are reconciled. No commercial receipt or current Grant is touched.';

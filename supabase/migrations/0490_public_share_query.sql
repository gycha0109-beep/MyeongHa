-- MyeongHa public Share Artifact read boundary.
--
-- API_CONTRACT §12 defines GET /s/:publicToken as a public-safe snapshot read only.
-- AUTH_RLS_PRIVACY_SPEC §12 requires the raw token to be verified/fingerprinted by the API
-- before database lookup, and only an active, unexpired artifact may reveal its minimized
-- immutable snapshot. A public share token is never authority for the private Reading.
--
-- This query intentionally exposes neither subject/Reading identity nor token/snapshot
-- provenance hashes. It does not create Share Artifacts, does not mutate clock-expired rows
-- into the expired state, and does not resolve the still-blocked Share Create idempotency gap.
--
-- P0-AUTH-01 remains unresolved. The HTTP route may be public, but direct database execution
-- is not: SECURITY INVOKER is retained and PUBLIC EXECUTE is revoked so token fingerprinting
-- remains an API boundary responsibility.

create or replace function public.qry_public_share_artifact_v1(
  p_public_token_hash text
)
returns table (
  artifact_version text,
  snapshot_jsonb jsonb
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_public_token_hash is null or btrim(p_public_token_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_public_share_token_hash_required',
      message = 'public share token fingerprint is required';
  end if;

  return query
  select
    sa.artifact_version,
    sa.snapshot_jsonb
  from public.share_artifacts sa
  where sa.public_token_hash = p_public_token_hash
    and sa.status = 'active'
    and (sa.expires_at is null or sa.expires_at > current_timestamp);

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_public_share_unavailable',
      message = 'public share artifact is unavailable';
  end if;
end;
$$;

revoke execute on function public.qry_public_share_artifact_v1(text) from public;

-- Source-bounded CharacterCapability + SajuDomainRuntime component projection.
--
-- The Use Case Capability Gate combines CharacterCapability, UserConsent,
-- SajuDomainAvailability, WorldState, and ProductPolicy before producing an
-- allowed/rejected decision. This function intentionally exposes only the two
-- Product DB authorities that are already relationally defined:
--   1. bundle-pinned CharacterCapability rows; and
--   2. the current Saju-domain runtime row, when one exists.
--
-- It does NOT resolve subject rollout, client compatibility, Character Unlock,
-- consent, world state, product policy, per-character emergency availability,
-- or a final effective capability decision. A missing runtime row is returned as
-- NULL runtime fields rather than being reinterpreted as available/unavailable.
-- Retired immutable bundles remain readable for pinned historical reproduction,
-- while Saju runtime fields intentionally reflect current operational state.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_character_bundle_saju_runtime_components_v1(
  p_content_bundle_id uuid,
  p_character_id text
)
returns table (
  saju_domain text,
  role text,
  can_initiate boolean,
  character_capability_version text,
  runtime_availability text,
  runtime_capability_version text,
  required_engine_version text,
  runtime_updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_content_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_bundle_saju_runtime_components_bundle_required',
      message = 'content bundle is required';
  end if;

  if p_character_id is null or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_bundle_saju_runtime_components_character_required',
      message = 'character id is required';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_bundle_saju_runtime_components_bundle_unavailable',
      message = 'content bundle was not found';
  end if;

  if not exists (
    select 1
    from public.character_runtime_catalog crc
    where crc.content_bundle_id = p_content_bundle_id
      and crc.character_id = p_character_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_bundle_saju_runtime_components_character_unavailable',
      message = 'character was not found in this content bundle';
  end if;

  return query
  select
    cc.saju_domain,
    cc.role,
    cc.can_initiate,
    cc.capability_version,
    runtime.availability,
    runtime.capability_version,
    runtime.required_engine_version,
    runtime.updated_at
  from public.character_capabilities cc
  left join public.saju_domain_runtime runtime
    on runtime.saju_domain = cc.saju_domain
  where cc.content_bundle_id = p_content_bundle_id
    and cc.character_id = p_character_id
  order by cc.saju_domain;
end;
$$;

revoke execute on function public.qry_character_bundle_saju_runtime_components_v1(uuid, text) from public;

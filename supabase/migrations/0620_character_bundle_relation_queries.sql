-- MyeongHa bundle-pinned Character-to-Character canon authority read.
--
-- Character relations are directed/asymmetric immutable canon projections owned by
-- an explicit content bundle. This function deliberately does NOT resolve a
-- subject's current release, user-to-character relationship stage/score, Character
-- Unlock state, Episode progress, or any LLM-derived relation inference.
--
-- relation_payload_jsonb is returned as the validated canon projection recorded in
-- the requested bundle. Retired bundles remain readable so pinned thread/progress
-- provenance can reproduce the same official world history.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_character_bundle_relations_v1(
  p_content_bundle_id uuid
)
returns table (
  from_character_id text,
  to_character_id text,
  relation_key text,
  relation_payload_jsonb jsonb
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
      constraint = 'qry_character_bundle_relations_bundle_required',
      message = 'content bundle is required';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_bundle_relations_bundle_unavailable',
      message = 'content bundle was not found';
  end if;

  return query
  select
    cr.from_character_id,
    cr.to_character_id,
    cr.relation_key,
    cr.relation_payload_jsonb
  from public.character_relations cr
  where cr.content_bundle_id = p_content_bundle_id
  order by cr.from_character_id, cr.to_character_id, cr.relation_key;
end;
$$;

revoke execute on function public.qry_character_bundle_relations_v1(uuid) from public;

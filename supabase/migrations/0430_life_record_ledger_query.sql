-- MyeongHa Life Record owner-ledger read authority.
--
-- API_CONTRACT §13 exposes GET /api/life-record. RELATIONSHIP_MEMORY_POLICY_SPEC
-- defines Life Fact as structured current-life fact history, forbids current-row
-- overwrite, and models change as supersession append plus explicit revocation.
-- Therefore this database query preserves the authoritative Life Fact ledger,
-- including superseded and revoked rows with their lifecycle/provenance fields.
--
-- This is not an invented "current active facts" reducer and is not the final
-- HTTP wire DTO. Consumer projection/minimization can be layered only where the
-- API contract explicitly defines it. Memory proposals, grants, and destructive
-- privacy deletion are outside this read boundary (SRC-05 / SRC-06 remain open).
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_life_record_ledger_v1(
  p_subject_id uuid
)
returns table (
  life_fact_id uuid,
  fact_type text,
  schema_version text,
  value_jsonb jsonb,
  valid_from timestamptz,
  valid_to timestamptz,
  source_kind text,
  source_message_id uuid,
  source_merge_action_id uuid,
  supersedes_fact_id uuid,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_life_record_ledger_subject_required',
      message = 'life record subject is required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_life_record_ledger_subject_ineligible',
      message = 'life record read requires an active canonical subject';
  end if;

  return query
  select
    lf.id,
    lf.fact_type,
    lf.schema_version,
    lf.value_jsonb,
    lf.valid_from,
    lf.valid_to,
    lf.source_kind,
    lf.source_message_id,
    lf.source_merge_action_id,
    lf.supersedes_fact_id,
    lf.confirmed_at,
    lf.revoked_at,
    lf.created_at
  from public.life_facts lf
  where lf.subject_id = p_subject_id
  order by lf.confirmed_at desc, lf.created_at desc, lf.id;
end;
$$;

revoke execute on function public.qry_life_record_ledger_v1(uuid) from public;

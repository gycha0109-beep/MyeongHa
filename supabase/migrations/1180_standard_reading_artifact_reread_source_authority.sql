-- Fail-closed source read authority for one completed Reader-bound Standard Reading artifact.
--
-- This function is intentionally INTERNAL. It may expose the immutable stored
-- ProductReadingResponse snapshot to a later source-authorized projector, but no
-- ordinary API/Supabase role receives EXECUTE here. Public delivery remains HOLD
-- until a consumer-safe ProductReadingResponse projection is authorized.
--
-- Access is tied to the exact purchase-backed Entitlement Grant consumed by the
-- Standard Reading binding. A different active Grant for the same entitlement key
-- does not keep a refunded/revoked/expired purchase artifact readable.

create or replace function public.internal_qry_standard_reading_artifact_source_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_effective_at timestamptz
)
returns table (
  purchase_intent_id uuid,
  product_id uuid,
  entitlement_grant_id uuid,
  reader_character_id text,
  reader_content_bundle_id uuid,
  reading_session_id uuid,
  reading_id uuid,
  reading_contract_version text,
  product_response_state text,
  response_snapshot_jsonb jsonb,
  response_hash text,
  completed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_subject_kind text;
begin
  if p_subject_id is null or p_reading_id is null or p_effective_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'internal_standard_reading_artifact_source_input_required',
      message = 'Standard Reading artifact source read requires subject, Reading, and evaluation time';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select s.kind
    into v_subject_kind
  from public.subjects s
  where s.id = p_subject_id
    and s.kind in ('guest', 'member')
    and s.status = 'active'
    and s.merged_into_subject_id is null
    and (s.kind <> 'member' or s.auth_user_id is not null);

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'internal_standard_reading_artifact_source_subject_ineligible',
      message = 'Standard Reading artifact source read requires an active canonical Guest or Member subject';
  end if;

  return query
  with source_subjects(subject_id) as (
    select p_subject_id
    union all
    select s.id
    from public.subjects s
    where v_subject_kind = 'member'
      and s.kind = 'guest'
      and s.status = 'merged'
      and s.merged_into_subject_id = p_subject_id
  )
  select
    b.purchase_intent_id,
    b.product_id,
    b.entitlement_grant_id,
    b.reader_character_id,
    b.reader_content_bundle_id,
    b.reading_session_id,
    b.reading_id,
    rr.reading_contract_version,
    rr.product_response_state,
    rr.response_snapshot_jsonb,
    rr.response_hash,
    r.completed_at
  from public.standard_reading_unit_bindings b
  join source_subjects src
    on src.subject_id = b.subject_id
  join public.entitlement_grants g
    on g.id = b.entitlement_grant_id
   and g.subject_id = b.subject_id
   and g.grant_source_type = 'purchase'
  join public.readings r
    on r.id = b.reading_id
   and r.reading_session_id = b.reading_session_id
   and r.subject_id = b.subject_id
   and r.execution_status = 'succeeded'
   and r.committed_execution_attempt_id is not null
   and r.completed_at is not null
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  where b.reading_id = p_reading_id
    and g.status = 'active'
    and g.valid_from <= p_effective_at
    and (g.valid_until is null or g.valid_until > p_effective_at)
    and rr.response_snapshot_jsonb is not null
    and btrim(rr.reading_contract_version) <> ''
    and btrim(rr.product_response_state) <> ''
    and btrim(rr.response_hash) <> '';
end;
$$;

comment on function public.internal_qry_standard_reading_artifact_source_v1(uuid, uuid, timestamptz)
is 'Internal exact-purchase-grant-gated Standard Reading artifact source projection. Raw response snapshot is not public delivery authority.';

revoke all on function public.internal_qry_standard_reading_artifact_source_v1(uuid, uuid, timestamptz)
from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_qry_standard_reading_artifact_source_v1(uuid,uuid,timestamptz) from %I',
      v_role
    );
  END LOOP;
END
$$;

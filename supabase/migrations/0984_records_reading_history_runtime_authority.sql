-- Production owner-scoped Reading History authority for Records.
--
-- Exposes only immutable, committed ProductReadingResponse metadata needed by
-- GET /api/readings. It deliberately does not expose response_snapshot_jsonb,
-- provider transport payloads, engine-internal claims, hashes, or grounding
-- internals. Execution is SECURITY INVOKER under the transaction-local
-- myeongha_api_executor role and current-subject RLS context.

alter table public.readings enable row level security;
alter table public.reading_refs enable row level security;

drop policy if exists readings_api_current_history_select_v1 on public.readings;
create policy readings_api_current_history_select_v1
on public.readings
for select
to myeongha_api_executor
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists reading_refs_api_current_history_select_v1 on public.reading_refs;
create policy reading_refs_api_current_history_select_v1
on public.reading_refs
for select
to myeongha_api_executor
using (subject_id = public.current_myeongha_subject_id());

-- Match the existing Records relation-authority pattern: remove any accidental
-- table-wide SELECT first, then reopen only the columns consumed by the narrow
-- SECURITY INVOKER projection. No INSERT/UPDATE/DELETE authority is granted.
revoke select on public.readings from myeongha_api_executor;
revoke select on public.reading_refs from myeongha_api_executor;

grant select (
  id,
  reading_session_id,
  subject_id,
  saju_domain,
  execution_status,
  committed_execution_attempt_id,
  created_at,
  completed_at
)
on public.readings
to myeongha_api_executor;

grant select (
  reading_id,
  subject_id,
  execution_attempt_id,
  reading_contract_version,
  product_response_state
)
on public.reading_refs
to myeongha_api_executor;

create or replace function public.qry_reading_history_v1(p_subject_id uuid)
returns table (
  reading_id uuid,
  reading_session_id uuid,
  saju_domain text,
  reading_contract_version text,
  product_response_state text,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reading_history_subject_required',
      message = 'Reading History subject is required.';
  end if;

  return query
  select
    r.id,
    r.reading_session_id,
    r.saju_domain,
    rr.reading_contract_version,
    rr.product_response_state,
    r.created_at,
    r.completed_at
  from public.readings r
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  where r.subject_id = p_subject_id
    and r.execution_status = 'succeeded'
    and r.committed_execution_attempt_id is not null
    and r.completed_at is not null
  order by r.completed_at desc, r.created_at desc, r.id desc;
end
$$;

revoke all on function public.qry_reading_history_v1(uuid) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_reading_history_v1(uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_reading_history_v1(uuid)
to myeongha_api_executor;

DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_reading_history_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lost qry_reading_history_v1 EXECUTE';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'public.qry_reading_history_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_reading_history_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supabase API roles unexpectedly retain Reading History EXECUTE';
  END IF;
END
$$;
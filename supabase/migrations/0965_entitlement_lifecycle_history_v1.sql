-- Privacy-safe Entitlement lifecycle history read authority.
--
-- This DB-only projection exposes server-authoritative Entitlement lifecycle facts
-- without inventing provider/refund semantics. In particular, event_type='revoked'
-- remains a revoked Entitlement ledger fact; this query does not reinterpret it as a
-- provider refund, cancellation, chargeback, or any other payment-rail state.
--
-- Canonical active Guest subjects read only their own lifecycle rows. Canonical active
-- Member subjects read their own rows plus historical rows still owned by directly
-- merged Guest subjects. Historical ownership is never rewritten and recursive merge
-- ancestry is not inferred.
--
-- Provider/receipt ids, source actor refs, provider ordering keys, payloads, reason_code,
-- grant ids, Subject ids, and internal normalized scope sentinels are intentionally not
-- returned. Legacy event-v1 rows may have NULL target effect fields; those NULLs are
-- preserved rather than backfilled with fabricated meaning.

create or replace function public.qry_entitlement_lifecycle_history_v1(
  p_subject_id uuid
)
returns table (
  entitlement_key text,
  scope_key text,
  event_type text,
  effective_at timestamptz,
  target_status text,
  target_valid_from timestamptz,
  target_valid_until timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_kind text;
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_entitlement_lifecycle_history_v1_subject_required',
      message = 'entitlement lifecycle history subject identity is required';
  end if;

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
      constraint = 'qry_entitlement_lifecycle_history_v1_subject_ineligible',
      message = 'entitlement lifecycle history requires an active canonical Guest or Member subject';
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
    e.entitlement_key,
    g.scope_key,
    e.event_type,
    e.effective_at,
    e.target_status,
    e.target_valid_from,
    e.target_valid_until
  from public.entitlement_events e
  join source_subjects src
    on src.subject_id = e.subject_id
  join public.entitlement_grants g
    on g.id = e.grant_id
   and g.subject_id = e.subject_id
   and g.entitlement_key = e.entitlement_key
   and g.scope_key_norm = e.scope_key_norm
  order by e.effective_at desc, e.created_at desc, e.id desc;
end;
$$;

comment on function public.qry_entitlement_lifecycle_history_v1(uuid)
is 'DB-only privacy-safe Entitlement lifecycle ledger projection for canonical Guest/Member plus direct merged Guest lineage. No provider/refund inference or mutation.';

revoke execute on function public.qry_entitlement_lifecycle_history_v1(uuid) from public;

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
      'revoke execute on function public.qry_entitlement_lifecycle_history_v1(uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

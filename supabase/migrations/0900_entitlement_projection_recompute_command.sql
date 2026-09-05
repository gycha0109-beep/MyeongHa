-- Provider-neutral effective Entitlement projection recompute authority.
--
-- Commerce Architecture section 17 defines Effective Entitlement as a derived aggregate
-- over independent entitlement_grants at one transaction-scoped as_of. This migration
-- implements only that aggregate/rebuild primitive.
--
-- It intentionally does NOT:
-- - verify provider evidence
-- - create or mutate entitlement grants
-- - append entitlement events
-- - generate event_dedupe_key values
-- - interpret provider ordering
-- - create outbox messages
-- - expose a general API/client rights-mutation surface
--
-- transaction_timestamp() is stable for the entire caller transaction, so a future
-- verified apply command can invoke this primitive and share the same authoritative
-- as_of without accepting a caller-controlled timestamp.

create or replace function public.internal_recompute_entitlement_projection_v1(
  p_subject_id uuid,
  p_entitlement_key text,
  p_scope_key text
)
returns table (
  projection_id uuid,
  projection_status text,
  projection_active_grant_count integer,
  projection_effective_valid_until timestamptz,
  projection_revision bigint,
  projection_changed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_scope_key_norm text;
  v_as_of timestamptz := transaction_timestamp();
  v_grant_history_count integer;
  v_active_grant_count integer;
  v_any_unbounded boolean;
  v_max_valid_until timestamptz;
  v_target_status text;
  v_target_valid_until timestamptz;

  v_projection_id uuid;
  v_projection_status text;
  v_projection_active_grant_count integer;
  v_projection_effective_valid_until timestamptz;
  v_projection_revision bigint;
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_entitlement_projection_subject_required',
      message = 'entitlement projection recompute requires a subject id';
  end if;

  if p_entitlement_key is null or btrim(p_entitlement_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_entitlement_projection_key_required',
      message = 'entitlement projection recompute requires a non-empty entitlement key';
  end if;

  if p_scope_key = '__GLOBAL__' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_entitlement_projection_scope_reserved',
      message = 'reserved global scope sentinel cannot be supplied as a resource scope';
  end if;

  v_scope_key_norm := coalesce(p_scope_key, '__GLOBAL__');

  -- Stabilize the logical grant set before deriving the projection. Future verified
  -- apply commands already lock their target Grant first; acquiring SHARE locks for the
  -- logical set here preserves Grant -> projection lock order while preventing a
  -- concurrent grant mutation from changing the aggregate underneath this recompute.
  perform g.id
  from public.entitlement_grants g
  where g.subject_id = p_subject_id
    and g.entitlement_key = p_entitlement_key
    and g.scope_key_norm = v_scope_key_norm
  order by g.id
  for share;

  select count(*)::integer,
         count(*) filter (
           where g.status = 'active'
             and g.valid_from <= v_as_of
             and (g.valid_until is null or v_as_of < g.valid_until)
         )::integer,
         coalesce(
           bool_or(g.valid_until is null) filter (
             where g.status = 'active'
               and g.valid_from <= v_as_of
               and (g.valid_until is null or v_as_of < g.valid_until)
           ),
           false
         ),
         max(g.valid_until) filter (
           where g.status = 'active'
             and g.valid_from <= v_as_of
             and (g.valid_until is null or v_as_of < g.valid_until)
         )
    into v_grant_history_count,
         v_active_grant_count,
         v_any_unbounded,
         v_max_valid_until
  from public.entitlement_grants g
  where g.subject_id = p_subject_id
    and g.entitlement_key = p_entitlement_key
    and g.scope_key_norm = v_scope_key_norm;

  -- Architecture creates a logical projection only after authoritative Grant history
  -- exists. An arbitrary key with no Grant history must not manufacture an entitlement
  -- row, even an inactive one.
  if v_grant_history_count = 0 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_entitlement_projection_grant_history_required',
      message = 'entitlement projection recompute requires authoritative grant history';
  end if;

  if v_active_grant_count = 0 then
    v_target_status := 'inactive';
    v_target_valid_until := null;
  else
    v_target_status := 'active';
    if v_any_unbounded then
      v_target_valid_until := null;
    else
      v_target_valid_until := v_max_valid_until;
    end if;
  end if;

  insert into public.entitlements as e (
    id,
    subject_id,
    entitlement_key,
    scope_key,
    status,
    active_grant_count,
    effective_valid_until,
    revision,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    p_subject_id,
    p_entitlement_key,
    p_scope_key,
    v_target_status,
    v_active_grant_count,
    v_target_valid_until,
    0,
    v_as_of,
    v_as_of
  )
  on conflict on constraint entitlements_logical_unique
  do update set
    status = excluded.status,
    active_grant_count = excluded.active_grant_count,
    effective_valid_until = excluded.effective_valid_until,
    revision = e.revision + 1,
    updated_at = v_as_of
  where row(e.status, e.active_grant_count, e.effective_valid_until)
        is distinct from
        row(excluded.status, excluded.active_grant_count, excluded.effective_valid_until)
  returning e.id,
            e.status,
            e.active_grant_count,
            e.effective_valid_until,
            e.revision
    into v_projection_id,
         v_projection_status,
         v_projection_active_grant_count,
         v_projection_effective_valid_until,
         v_projection_revision;

  if found then
    return query
      select v_projection_id,
             v_projection_status,
             v_projection_active_grant_count,
             v_projection_effective_valid_until,
             v_projection_revision,
             true;
    return;
  end if;

  -- ON CONFLICT ... WHERE deliberately returns no row for an exact no-op. Re-read the
  -- existing projection without touching revision or updated_at.
  select e.id,
         e.status,
         e.active_grant_count,
         e.effective_valid_until,
         e.revision
    into v_projection_id,
         v_projection_status,
         v_projection_active_grant_count,
         v_projection_effective_valid_until,
         v_projection_revision
  from public.entitlements e
  where e.subject_id = p_subject_id
    and e.entitlement_key = p_entitlement_key
    and e.scope_key_norm = v_scope_key_norm;

  if not found then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_entitlement_projection_conflict_missing',
      message = 'entitlement projection conflict winner could not be resolved';
  end if;

  return query
    select v_projection_id,
           v_projection_status,
           v_projection_active_grant_count,
           v_projection_effective_valid_until,
           v_projection_revision,
           false;
end;
$$;

comment on function public.internal_recompute_entitlement_projection_v1(uuid, text, text)
is 'Internal provider-neutral rebuild of one Effective Entitlement projection from authoritative Grant state at transaction_timestamp(); not an API/client mutation surface.';

revoke all on function public.internal_recompute_entitlement_projection_v1(uuid, text, text)
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
      'revoke all on function public.internal_recompute_entitlement_projection_v1(uuid,text,text) from %I',
      v_role
    );
  END LOOP;
END
$$;
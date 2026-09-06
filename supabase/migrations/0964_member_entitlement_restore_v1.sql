-- Provider-independent Member entitlement restore authority.
--
-- UC-27 requires server-authoritative purchase restore after login. PSP/provider
-- verification remains unresolved, so this runtime performs only the portion that is
-- currently authoritative: rebuild Effective Entitlement projections from existing
-- entitlement_grants for the canonical Member plus directly merged Guest subjects.
--
-- It intentionally does NOT verify receipts/provider events, create or mutate Grants,
-- append Entitlement Events, rewrite historical subject ownership, infer recursive merge
-- ancestry, seed paid catalog data, or activate payments. Provider revalidation is
-- explicitly reported as false until a future provider-specific authority exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_entitlement_restore_owner'
  ) THEN
    CREATE ROLE myeongha_entitlement_restore_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_entitlement_restore_owner'
      AND NOT r.rolcanlogin
      AND NOT r.rolsuper
      AND NOT r.rolcreatedb
      AND NOT r.rolcreaterole
      AND NOT r.rolinherit
      AND NOT r.rolreplication
      AND NOT r.rolbypassrls
  ) THEN
    RAISE EXCEPTION 'myeongha_entitlement_restore_owner is outside the least-privilege role contract';
  END IF;
END
$$;

grant usage on schema public to myeongha_entitlement_restore_owner;
grant execute on function public.current_myeongha_subject_id()
to myeongha_entitlement_restore_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
to myeongha_entitlement_restore_owner;
grant execute on function public.internal_recompute_entitlement_projection_v1(uuid, text, text)
to myeongha_entitlement_restore_owner;

-- The restore owner can see only the current canonical subject and a directly merged
-- Guest child of that subject through Subjects RLS. auth_user_id is read only to enforce
-- the logged-in Member precondition; it is never returned by the restore command.
grant select (id, kind, status, auth_user_id, merged_into_subject_id)
on public.subjects
to myeongha_entitlement_restore_owner;

drop policy if exists subjects_entitlement_restore_select_v1 on public.subjects;
create policy subjects_entitlement_restore_select_v1
on public.subjects
for select
to myeongha_entitlement_restore_owner
using (
  id = public.current_myeongha_subject_id()
  or (
    kind = 'guest'
    and status = 'merged'
    and merged_into_subject_id = public.current_myeongha_subject_id()
  )
);

-- Source Grant authority is read-only. The owner receives exactly the columns consumed
-- by the existing provider-neutral recompute primitive and the direct-lineage enumerator.
grant select (
  subject_id,
  entitlement_key,
  scope_key,
  scope_key_norm,
  status,
  valid_from,
  valid_until
)
on public.entitlement_grants
to myeongha_entitlement_restore_owner;

-- The existing 0900 primitive is the sole projection mutation path. These grants are
-- intentionally column-scoped and do not include DELETE or any Grant/Event mutation.
grant select (
  id,
  subject_id,
  entitlement_key,
  scope_key,
  scope_key_norm,
  status,
  active_grant_count,
  effective_valid_until,
  revision,
  created_at,
  updated_at
)
on public.entitlements
to myeongha_entitlement_restore_owner;

grant insert (
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
)
on public.entitlements
to myeongha_entitlement_restore_owner;

grant update (
  status,
  active_grant_count,
  effective_valid_until,
  revision,
  updated_at
)
on public.entitlements
to myeongha_entitlement_restore_owner;

create or replace function public.cmd_restore_entitlements_runtime_v1(
  p_subject_id uuid
)
returns table (
  recomputed_projection_count integer,
  changed_projection_count integer,
  provider_revalidation_performed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recomputed integer := 0;
  v_changed integer := 0;
  v_source record;
  v_projection_changed boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.kind = 'member'
      and s.status = 'active'
      and s.auth_user_id is not null
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_restore_entitlements_member_ineligible',
      message = 'entitlement restore requires an active canonical authenticated Member subject';
  end if;

  -- Historical ownership remains immutable. Recompute each authoritative logical Grant
  -- stream on the Member or a direct merged Guest only; no recursive ancestry is inferred.
  for v_source in
    with source_subjects(subject_id) as (
      select p_subject_id
      union all
      select s.id
      from public.subjects s
      where s.kind = 'guest'
        and s.status = 'merged'
        and s.merged_into_subject_id = p_subject_id
    )
    select distinct
      g.subject_id,
      g.entitlement_key,
      g.scope_key,
      g.scope_key_norm
    from public.entitlement_grants g
    join source_subjects src
      on src.subject_id = g.subject_id
    order by g.subject_id, g.entitlement_key, g.scope_key_norm
  loop
    select r.projection_changed
      into v_projection_changed
    from public.internal_recompute_entitlement_projection_v1(
      v_source.subject_id,
      v_source.entitlement_key,
      v_source.scope_key
    ) r;

    v_recomputed := v_recomputed + 1;
    if v_projection_changed then
      v_changed := v_changed + 1;
    end if;
  end loop;

  return query
  select v_recomputed, v_changed, false;
end;
$$;

comment on function public.cmd_restore_entitlements_runtime_v1(uuid)
is 'Logged-in Member server-entitlement restore: recompute projections from existing Member + direct merged Guest Grant authority only. No provider revalidation or Grant/Event mutation.';

-- Transfer the SECURITY DEFINER wrapper to the narrow owner. Temporary membership and
-- schema CREATE exist only for ownership transfer and are revoked in this migration.
grant myeongha_entitlement_restore_owner to current_user;
grant create on schema public to myeongha_entitlement_restore_owner;

alter function public.cmd_restore_entitlements_runtime_v1(uuid)
owner to myeongha_entitlement_restore_owner;

revoke all on function public.cmd_restore_entitlements_runtime_v1(uuid) from public;

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
      'revoke all on function public.cmd_restore_entitlements_runtime_v1(uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_restore_entitlements_runtime_v1(uuid)
to myeongha_api_executor;

revoke create on schema public from myeongha_entitlement_restore_owner;
revoke myeongha_entitlement_restore_owner from current_user;

-- Assert this slice did not widen ordinary API table mutation authority.
DO $$
BEGIN
  IF has_table_privilege('myeongha_api_executor', 'public.entitlement_grants', 'INSERT')
     OR has_table_privilege('myeongha_api_executor', 'public.entitlement_grants', 'UPDATE')
     OR has_table_privilege('myeongha_api_executor', 'public.entitlement_grants', 'DELETE') THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly gained entitlement_grants mutation privilege';
  END IF;

  IF has_table_privilege('myeongha_api_executor', 'public.entitlements', 'INSERT')
     OR has_table_privilege('myeongha_api_executor', 'public.entitlements', 'UPDATE')
     OR has_table_privilege('myeongha_api_executor', 'public.entitlements', 'DELETE') THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly gained direct entitlements mutation privilege';
  END IF;

  IF has_table_privilege('myeongha_entitlement_restore_owner', 'public.entitlement_grants', 'INSERT')
     OR has_table_privilege('myeongha_entitlement_restore_owner', 'public.entitlement_grants', 'UPDATE')
     OR has_table_privilege('myeongha_entitlement_restore_owner', 'public.entitlement_grants', 'DELETE') THEN
    RAISE EXCEPTION 'restore owner unexpectedly gained entitlement_grants mutation privilege';
  END IF;

  IF has_table_privilege('myeongha_entitlement_restore_owner', 'public.entitlement_events', 'INSERT')
     OR has_table_privilege('myeongha_entitlement_restore_owner', 'public.entitlement_events', 'UPDATE')
     OR has_table_privilege('myeongha_entitlement_restore_owner', 'public.entitlement_events', 'DELETE') THEN
    RAISE EXCEPTION 'restore owner unexpectedly gained entitlement_events mutation privilege';
  END IF;
END
$$;
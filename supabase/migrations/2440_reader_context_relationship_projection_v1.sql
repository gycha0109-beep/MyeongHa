-- MyeongHa Phase 1: transaction-Subject-bound current relationship projection.
-- Watchtower-Track: character-memory
--
-- The legacy qry_character_relationship_v1 SECURITY INVOKER query does not
-- itself assert the transaction-local Subject. This narrow wrapper uses the
-- existing NOLOGIN/NOBYPASSRLS relationship owner, verifies the exact Subject
-- binding, and reads only the already-stored current projection.
-- It never creates a baseline or recalculates relationship state.

create or replace function public.qry_reader_context_relationship_projection_v1(
  p_subject_id uuid,
  p_character_id text
)
returns table (
  state_id uuid,
  character_id text,
  closeness integer,
  trust integer,
  friction integer,
  relationship_stage text,
  policy_version text,
  revision bigint,
  last_interaction_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $reader_context_relationship_projection$
declare
  v_subject_status text;
  v_subject_merged_into uuid;
begin
  if p_subject_id is null
     or p_character_id is null
     or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reader_context_relationship_identity_required',
      message = 'Reader relationship context requires canonical Subject and Character identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_subject_merged_into
  from public.subjects s
  where s.id = p_subject_id;

  if not found
     or v_subject_status is distinct from 'active'
     or v_subject_merged_into is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_reader_context_relationship_subject_ineligible',
      message = 'Reader relationship context requires an active canonical Subject';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.character_id = p_character_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_reader_context_relationship_character_not_found',
      message = 'Reader relationship Character is unavailable';
  end if;

  return query
  select
    s.id,
    s.character_id,
    s.closeness,
    s.trust,
    s.friction,
    s.relationship_stage,
    s.policy_version,
    s.revision,
    s.last_interaction_at,
    s.updated_at
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = p_character_id;
end
$reader_context_relationship_projection$;

-- The existing relationship owner is NOLOGIN/NOBYPASSRLS and has only the
-- current-projection read/write grants plus the Subject-bound RLS policies.
grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.qry_reader_context_relationship_projection_v1(
  uuid, text
) owner to myeongha_relationship_apply_owner;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

revoke all on function public.qry_reader_context_relationship_projection_v1(
  uuid, text
) from public;

do $reader_context_relationship_projection_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_reader_context_relationship_projection_v1(uuid,text) from %I',
      v_role
    );
  end loop;
end
$reader_context_relationship_projection_acl$;

grant execute on function public.qry_reader_context_relationship_projection_v1(
  uuid, text
) to myeongha_api_executor;

comment on function public.qry_reader_context_relationship_projection_v1(
  uuid, text
) is
'Server-only read of the existing current relationship projection. Requires the transaction-local canonical Subject and never creates or recalculates relationship state.';

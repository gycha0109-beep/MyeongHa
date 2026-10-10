-- D-05: dormant, read-only Member x Reader existing thread discovery.
--
-- Discover at most two candidates under the canonical transaction-scoped
-- Member. A second candidate is deliberate evidence of ambiguity; callers
-- MUST deny instead of choosing first/newest/default. This never checks or
-- grants purchase entitlement, never creates a thread, and never exposes an
-- Official Reading. Public Reader admission and disclosure remain OFF.
--
-- The existing SECURITY INVOKER / RLS authority for known-thread reads is
-- preserved. There is no new table privilege or SECURITY DEFINER bypass.

create or replace function public.qry_member_single_character_thread_locator_v1(
  p_subject_id uuid,
  p_character_id text
)
returns table (thread_id uuid)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_character_id is null
     or btrim(p_character_id) = ''
     or p_character_id <> btrim(p_character_id) then
    raise exception using
      errcode = '23514',
      constraint = 'qry_member_single_character_thread_locator_input_required',
      message = 'Member Reader thread locator requires a canonical subject and Reader';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.kind = 'member'
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_member_single_character_thread_locator_member_required',
      message = 'Member Reader thread locator requires an active canonical Member';
  end if;

  -- Match the existing Member thread open command's candidate definition:
  -- any active single-Character thread with this active participant.
  -- Do NOT filter by bundle or primary shape here: a malformed historical
  -- thread must be surfaced for the downstream known-thread binding to
  -- reject, not silently excluded in favor of a different candidate.
  return query
    select ct.id
    from public.conversation_threads ct
    where ct.subject_id = p_subject_id
      and ct.thread_type = 'single_character'
      and ct.status = 'active'
      and ct.deleted_at is null
      and exists (
        select 1
        from public.conversation_thread_characters ctc
        where ctc.thread_id = ct.id
          and ctc.character_id = p_character_id
          and ctc.left_at is null
      )
    order by ct.id
    limit 2;
end;
$$;

comment on function public.qry_member_single_character_thread_locator_v1(uuid, text) is
'D-05 internal existing Member x Reader thread candidate locator (max 2). No Grant check, Chat creation, Reader admission or public authority.';

revoke all on function public.qry_member_single_character_thread_locator_v1(uuid, text) from public;

DO $$
DECLARE v_role text;
BEGIN
  FOR v_role IN
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  LOOP
    execute pg_catalog.format(
      'revoke all on function public.qry_member_single_character_thread_locator_v1(uuid,text) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_member_single_character_thread_locator_v1(uuid, text)
  to myeongha_api_executor;

DO $$
BEGIN
  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_member_single_character_thread_locator_v1(uuid,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'public',
    'public.qry_member_single_character_thread_locator_v1(uuid,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception 'D-05 member thread locator EXECUTE ACL mismatch';
  end if;
  if (select p.prosecdef
      from pg_catalog.pg_proc p
      where p.oid = 'public.qry_member_single_character_thread_locator_v1(uuid,text)'::pg_catalog.regprocedure) then
    raise exception 'D-05 member thread locator cannot become SECURITY DEFINER';
  end if;
END
$$;

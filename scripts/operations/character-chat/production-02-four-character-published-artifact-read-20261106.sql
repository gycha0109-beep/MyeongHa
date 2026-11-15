-- Watchtower-Track: character-memory
-- OPTIONAL Production operation AFTER production-01. NOT an automatic migration.
-- Read only: exact active non-default Character publication from a canonical
-- Member-owned, immutable pinned chat thread. No AI/Model content is produced.
-- An independent artifact loader must validate these DB-proven artifact bytes
-- before a Character receives any Model context. No Se-yeon default fallback.

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'myeongha_chat_thread_open_owner'
      AND rolcanlogin = false AND rolsuper = false
      AND rolcreaterole = false AND rolcreatedb = false
      AND rolinherit = false AND rolbypassrls = false
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'myeongha_api_executor'
  ) OR to_regprocedure(
    'public.cmd_open_member_single_character_thread_v1(uuid,text,uuid,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Four-Character source-read requires installed Member chat owner authority';
  END IF;
END
$preflight$;

-- The existing NOBYPASSRLS owner can already read the subject/thread,
-- participants, release, and Character catalog. Grant only published bundle
-- metadata fields, never bundle mutation or unrestricted API table SELECT.
-- Existing chat-open owner can inspect release id/status/default, but this
-- stricter source reader also checks the release retirement timestamp.
grant select (retired_at) on public.content_releases
  to myeongha_chat_thread_open_owner;
grant select (
  content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version
) on public.content_bundles to myeongha_chat_thread_open_owner;

create or replace function public.qry_four_character_published_artifact_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_character_id text,
  p_release_id uuid,
  p_bundle_id uuid
)
returns table (
  character_id text,
  release_id uuid,
  bundle_id uuid,
  content_version text,
  content_hash text,
  artifact_ref text,
  artifact_schema_version text,
  min_client_capability text,
  asset_manifest_hash text,
  cue_schema_version text
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $source$
declare
  v_member_ok boolean;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_subject_id is null or p_thread_id is null
     or p_release_id is null or p_bundle_id is null
     or p_character_id not in ('baekheon', 'yeoul', 'rahyeon', 'taegyeom')
     or p_character_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'four_character_published_artifact_unavailable',
      message = 'Published Character source is unavailable';
  end if;

  select exists(
    select 1 from public.subjects s
    where s.id = p_subject_id
      and s.kind = 'member'
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) into v_member_ok;

  if not v_member_ok then
    raise exception using
      errcode = 'P0001',
      constraint = 'four_character_published_artifact_unavailable',
      message = 'Published Character source is unavailable';
  end if;

  return query
  select
    p_character_id,
    cr.id,
    cb.id,
    cb.content_version,
    cb.content_hash,
    cb.artifact_ref,
    cb.artifact_schema_version,
    cb.min_client_capability,
    cb.asset_manifest_hash,
    cb.cue_schema_version
  from public.conversation_threads ct
  join public.conversation_thread_characters ctc
    on ctc.thread_id = ct.id
   and ctc.character_id = p_character_id
   and ctc.content_bundle_id = ct.active_content_bundle_id
   and ctc.role = 'primary'
   and ctc.left_at is null
  join public.content_releases cr
    on cr.id = ct.active_content_release_id
   and cr.content_bundle_id = ct.active_content_bundle_id
   and cr.id = p_release_id
   and cr.status = 'active'
   and cr.is_default = false
   and cr.retired_at is null
  join public.content_bundles cb
    on cb.id = cr.content_bundle_id
   and cb.id = p_bundle_id
   and cb.retired_at is null
  join public.character_runtime_catalog crc
    on crc.character_id = ctc.character_id
   and crc.content_bundle_id = cb.id
   and crc.availability = 'available'
   and crc.enabled = true
   and (crc.release_at is null or crc.release_at <= clock_timestamp())
   and (crc.retire_at is null or crc.retire_at > clock_timestamp())
  join public.characters c
    on c.character_id = crc.character_id
   and c.retired_at is null
  where ct.id = p_thread_id
    and ct.subject_id = p_subject_id
    and ct.thread_type = 'single_character'
    and ct.status = 'active'
    and ct.deleted_at is null
    and ct.active_content_release_id = p_release_id
    and ct.active_content_bundle_id = p_bundle_id
    and not exists (
      select 1
      from public.conversation_thread_characters other
      where other.thread_id = ct.id
        and other.left_at is null
        and other.id <> ctc.id
    );

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'four_character_published_artifact_unavailable',
      message = 'Published Character source is unavailable';
  end if;
end
$source$;

-- Match the installed PostgreSQL 17-safe owner transfer pattern. The
-- temporary CREATE and SET privileges are removed before the operation exits.
grant myeongha_chat_thread_open_owner to current_user;
grant create on schema public to myeongha_chat_thread_open_owner;
alter function public.qry_four_character_published_artifact_v1(
  uuid,uuid,text,uuid,uuid
) owner to myeongha_chat_thread_open_owner;
revoke all on function public.qry_four_character_published_artifact_v1(
  uuid,uuid,text,uuid,uuid
) from public;
DO $acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_four_character_published_artifact_v1(uuid,uuid,text,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$acl$;
grant execute on function public.qry_four_character_published_artifact_v1(
  uuid,uuid,text,uuid,uuid
) to myeongha_api_executor;
revoke create on schema public from myeongha_chat_thread_open_owner;
revoke myeongha_chat_thread_open_owner from current_user;

DO $postflight$
begin
  if not has_function_privilege(
    'myeongha_api_executor',
    'public.qry_four_character_published_artifact_v1(uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'public',
    'public.qry_four_character_published_artifact_v1(uuid,uuid,text,uuid,uuid)',
    'EXECUTE'
  ) or has_schema_privilege(
    'myeongha_chat_thread_open_owner','public','CREATE'
  ) or (select r.rolbypassrls or r.rolcanlogin
        from pg_catalog.pg_roles r
        where r.rolname='myeongha_chat_thread_open_owner') then
    raise exception 'Four-Character source read ACL postflight failed';
  end if;
end
$postflight$;

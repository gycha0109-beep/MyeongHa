-- RR-03/04/09 S1: dormant transaction-scoped Official Reader scope lock.
-- Watchtower-Track: db-authority-core
--
-- PRIVATE, NOT a paid access/Grant authority and NOT an approved T2 Writer.
-- Call only in an explicit short PostgreSQL transaction *before* all current
-- Grant/Reader/Reading checks; Commerce bind/revoke/receipt writers do not yet
-- participate, so this migration cannot serialize paid access by itself.
-- No new tables/subject-owned persistent data or public runtime grants.
-- Production migrations remain HOLD pending governed recovery.
--
-- Lock scope: canonical Subject x Official Reading x Reader, intentionally
-- omitting individual purchase Grants and bundle so NEW INSERTs and alternate
-- bundles contend on the same scope when every relevant writer participates.
--
-- 64-bit hash collision can cause extra wait (never an access grant). The
-- identifier namespace and hashing scheme must not silently change between
-- participating writers.

create or replace function public.internal_acquire_official_reader_scope_lock_v1(
  p_subject_id uuid,
  p_reading_ref uuid,
  p_reader_character_id text
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $rr_scope_lock$
declare
  v_lock_identity text;
begin
  if p_subject_id is null
     or p_reading_ref is null
     or p_reader_character_id is null
     or btrim(p_reader_character_id) = ''
     or p_reader_character_id <> btrim(p_reader_character_id)
     or length(p_reader_character_id) > 256
     or p_reader_character_id ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '23514',
      constraint = 'official_reader_scope_lock_input_invalid',
      message = 'Official Reader scope lock input is invalid';
  end if;

  -- Never accept an arbitrary caller-supplied Subject as a lock authority.
  -- The approved caller must also independently verify Reading/Reader owners.
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- The length-prefix makes even delimiter-bearing Reader IDs unambiguous.
  -- Advisory keys must be identical across EVERY grant/bind/revoke/T2 writer.
  v_lock_identity := 'myeongha:official-reader:scope-lock:v1:'
    || p_subject_id::text || ':'
    || p_reading_ref::text || ':'
    || octet_length(p_reader_character_id)::text || ':'
    || p_reader_character_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_lock_identity, 1827::bigint)
  );
end
$rr_scope_lock$;

revoke all on function public.internal_acquire_official_reader_scope_lock_v1(
  uuid, uuid, text
) from public;

do $rr_scope_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_seyeon_chat_runtime_owner'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_acquire_official_reader_scope_lock_v1(uuid,uuid,text) from %I',
      v_role
    );
  end loop;
end
$rr_scope_acl$;

comment on function public.internal_acquire_official_reader_scope_lock_v1(
  uuid, uuid, text
) is
'Private S1 transaction-scoped scope-lock primitive ONLY; no Grant, Product, Reading or reveal permission is issued. No paid Writer integration or public roles. Mandatory all-path Commerce/DB T2 lock ordering and actual two-connection race tests remain S2.';

-- S6: private Chat marker -> paid-answer identity resolver.
-- Always delegates ciphertext read to the current-Grant scoped S6 reader.
-- No runtime EXECUTE or HTTP response permission is granted.
-- Watchtower-Track: db-authority-core

create or replace function public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_safe_message_id uuid
)
returns table (
  body_id uuid,
  thread_id uuid,
  turn_id uuid,
  attempt_id uuid,
  safe_message_id uuid,
  official_reading_id uuid,
  reader_character_id text,
  reader_content_bundle_id uuid,
  content_release_id uuid,
  originating_entitlement_grant_id uuid,
  product_id uuid,
  source_response_hash text,
  encryption_scheme_version text,
  encryption_key_ref text,
  encryption_iv bytea,
  encryption_auth_tag bytea,
  encrypted_body bytea,
  committed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path=pg_catalog,public
as $official_paid_marker_read$
declare v_body_id uuid;
begin
  if p_subject_id is null or p_thread_id is null or p_safe_message_id is null then
    raise exception using errcode='23514',
      constraint='official_reader_s6_paid_marker_identity_required',
      message='Paid Reader Chat marker read requires the complete identity';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- A marker is just an opaque selector. The first lookup confers NO access;
  -- the second query obtains the shared S1 lock and re-reads current Grants.
  select b.id into v_body_id
  from public.official_reader_paid_answer_bodies b
  join public.conversation_messages m
    on m.id=b.safe_message_id and m.thread_id=b.thread_id
   and m.subject_id=b.subject_id and m.turn_id=b.turn_id
   and m.sender_type='system'
   and m.body_text='유료 해설 기록이 있습니다.'
   and m.message_payload_jsonb is null and m.redacted_at is null
  where b.subject_id=p_subject_id
    and b.thread_id=p_thread_id
    and b.safe_message_id=p_safe_message_id;

  if not found then return; end if;

  return query
  select r.*
  from public.internal_qry_official_reader_paid_answer_ciphertext_v1(
    p_subject_id,v_body_id
  ) r
  where r.thread_id=p_thread_id
    and r.safe_message_id=p_safe_message_id;
end
$official_paid_marker_read$;

revoke all on function public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(uuid,uuid,uuid) from public;

do $official_paid_marker_acl$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner','myeongha_system_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on function public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(uuid,uuid,uuid) from %I',
      v_role
    );
  end loop;
end
$official_paid_marker_acl$;

comment on function public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(
  uuid,uuid,uuid
) is 'S6 private paid Chat safe marker resolver, rechecks exact current Grant via shared S1 lock before any ciphertext read. Not granted to any application role pending Saju and Privacy Owner approval.';

-- Watchtower-Track: security
-- One-time, owner-admin-only G0 incident recovery.
-- ARCHIVE (never DELETE) the one legacy active Se-yeon thread so the
-- already-authoritative POST /api/chat can open a fresh, empty thread.
-- Historical User/Assistant messages and failed attempts remain immutable.
-- This is not a reusable general user-facing archive API.
begin;

do $seyeon_archive_legacy$
declare
  v_subject uuid;
  v_thread uuid;
  v_owner_count integer;
  v_active_count integer;
  v_before_messages bigint;
  v_before_turns bigint;
  v_before_attempts bigint;
  v_old_failed_count integer;
  v_other_active_count integer;
  v_unsafe_count integer;
  v_changed integer;
begin
  -- Exactly one registered owner-admin; no lookup by email/JWT claims.
  select count(*) into v_owner_count
  from public.myeongha_owner_administrators_v1 o
  join auth.users u on u.id=o.auth_user_id
  join public.subjects s on s.auth_user_id=u.id
  where o.credit_exempt and s.kind='member' and s.status='active'
    and s.merged_into_subject_id is null;
  if v_owner_count<>1 then
    raise exception 'Expected exactly one active owner-admin Member';
  end if;

  select s.id into strict v_subject
  from public.myeongha_owner_administrators_v1 o
  join public.subjects s on s.auth_user_id=o.auth_user_id
  where o.credit_exempt and s.kind='member' and s.status='active'
    and s.merged_into_subject_id is null
  for update of s;

  -- The existing open-thread command holds this same Subject lock, thus
  -- no concurrent open/create can create a second active Se-yeon thread.
  select count(distinct t.id) into v_active_count
  from public.conversation_threads t
  join public.conversation_thread_characters c on c.thread_id=t.id
  where t.subject_id=v_subject and t.thread_type='single_character'
    and t.status='active' and t.deleted_at is null
    and c.character_id='seyeon' and c.left_at is null;
  if v_active_count<>1 then
    raise exception 'Expected exactly one active owner Se-yeon thread';
  end if;

  select t.id into strict v_thread
  from public.conversation_threads t
  join public.conversation_thread_characters c on c.thread_id=t.id
  where t.subject_id=v_subject and t.thread_type='single_character'
    and t.status='active' and t.deleted_at is null
    and c.character_id='seyeon' and c.role='primary' and c.left_at is null
  for update of t;

  select count(*) into v_other_active_count
  from public.conversation_thread_characters c
  where c.thread_id=v_thread and c.left_at is null and c.character_id<>'seyeon';
  if v_other_active_count<>0 then
    raise exception 'Cannot archive a mixed-character thread';
  end if;

  select count(*) into v_old_failed_count
  from public.chat_turns t
  where t.subject_id=v_subject and t.thread_id=v_thread
    and t.state='failed_retryable';
  if v_old_failed_count<>1 then
    raise exception 'Legacy thread failed-turn census drifted';
  end if;

  -- Never archive an attempt with live inference/uncertain receipt.
  select count(*) into v_unsafe_count
  from public.chat_turn_attempts a
  join public.chat_turns t on t.id=a.turn_id
  where t.subject_id=v_subject and t.thread_id=v_thread
    and (a.state in('running','generated','validated')
      or (a.seyeon_positive_delivery_issued_at is not null
          and a.seyeon_positive_delivery_received_at is null));
  if v_unsafe_count<>0 then
    raise exception 'An attempt is still running or awaiting a protected receipt';
  end if;

  select count(*) into v_unsafe_count
  from public.seyeon_ai_call_cost_events e
  join public.chat_turns t on t.id=e.turn_id
  where t.subject_id=v_subject and t.thread_id=v_thread
    and e.lifecycle_state<>'settled';
  if v_unsafe_count<>0 then
    raise exception 'Unsettled AI governor call exists';
  end if;

  select count(*) into v_before_messages
  from public.conversation_messages m
  where m.subject_id=v_subject and m.thread_id=v_thread;
  select count(*) into v_before_turns
  from public.chat_turns t
  where t.subject_id=v_subject and t.thread_id=v_thread;
  select count(*) into v_before_attempts
  from public.chat_turn_attempts a
  join public.chat_turns t on t.id=a.turn_id
  where t.subject_id=v_subject and t.thread_id=v_thread;

  update public.conversation_threads
  set status='archived', updated_at=clock_timestamp()
  where id=v_thread and subject_id=v_subject and status='active'
    and deleted_at is null;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then
    raise exception 'Legacy archive update lost its Subject-scoped lock';
  end if;

  if (select count(*) from public.conversation_messages m
      where m.subject_id=v_subject and m.thread_id=v_thread)<>v_before_messages
     or (select count(*) from public.chat_turns t
      where t.subject_id=v_subject and t.thread_id=v_thread)<>v_before_turns
     or (select count(*) from public.chat_turn_attempts a
      join public.chat_turns t on t.id=a.turn_id
      where t.subject_id=v_subject and t.thread_id=v_thread)<>v_before_attempts
     or (select count(*) from public.conversation_threads t
      where t.id=v_thread and t.status='archived' and t.deleted_at is null)<>1 then
    raise exception 'Legacy archive preservation check failed';
  end if;
end
$seyeon_archive_legacy$;
commit;

-- Watchtower-Track: security
-- G3: metadata-only historical Se-yeon participant authority.
-- Unlike the active binding this includes LEFT participants and old bundles.
-- Does not return transcript, user text, Memory, Grant, or participant IDs.
begin;

create function public.qry_seyeon_thread_ever_involved_v1(
  p_subject_id uuid,
  p_thread_id uuid
)
returns table(ever_involved boolean)
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $guard$
begin
  if p_subject_id is null or p_thread_id is null then
    raise exception using
      errcode='23514',
      constraint='seyeon_history_presence_input_required',
      message='Canonical Subject and Thread identifiers are required';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.subjects s
    where s.id=p_subject_id
      and s.status='active'
      and s.merged_into_subject_id is null;
  if not found then
    raise exception using
      errcode='P0001',
      constraint='seyeon_history_presence_subject_ineligible',
      message='Canonical Subject unavailable';
  end if;
  -- Serialize the historical-participant verdict against new participant
  -- references. FOR UPDATE conflicts with the FK's KEY SHARE lock when
  -- another TX joins a Character to this Thread; the lock remains until
  -- this caller's owning HTTP read transaction ends.
  perform 1 from public.conversation_threads t
    where t.id=p_thread_id
      and t.subject_id=p_subject_id
      and t.status in ('active','archived')
    for update;
  if not found then
    raise exception using
      errcode='P0001',
      constraint='seyeon_history_presence_thread_unavailable',
      message='Owned Thread unavailable';
  end if;

  -- The Thread lock prevents new participant INSERTs through its FK.
  -- Lock every existing participant row too: a concurrent UPDATE can
  -- replace character_id or left_at without taking another FK KEY SHARE
  -- on the Thread. Keep both locks through the owner's HTTP read TX.
  perform 1 from public.conversation_thread_characters ctc
    where ctc.thread_id=p_thread_id
    for share;

  return query
    select exists(
      select 1
      from public.conversation_thread_characters ctc
      where ctc.thread_id=p_thread_id
        and ctc.character_id='seyeon'
    );
end
$guard$;

revoke all on function public.qry_seyeon_thread_ever_involved_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.qry_seyeon_thread_ever_involved_v1(uuid,uuid)
  to myeongha_api_executor;
commit;

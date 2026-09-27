-- MyeongHa PHASE M2: least-privilege runtime owner for Production relationship apply.
-- Watchtower-Track: character-memory
--
-- Ordinary API execution keeps no direct relationship DML. The SECURITY DEFINER
-- functions introduced in PHASE M are owned by this NOLOGIN/NOBYPASSRLS role.

do $relationship_apply_owner$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles r
    where r.rolname = 'myeongha_relationship_apply_owner'
  ) then
    create role myeongha_relationship_apply_owner
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      nobypassrls;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles r
    where r.rolname = 'myeongha_relationship_apply_owner'
      and not r.rolcanlogin
      and not r.rolsuper
      and not r.rolcreatedb
      and not r.rolcreaterole
      and not r.rolinherit
      and not r.rolreplication
      and not r.rolbypassrls
  ) then
    raise exception 'myeongha_relationship_apply_owner is outside the least-privilege role contract';
  end if;
end
$relationship_apply_owner$;

grant usage on schema public to myeongha_relationship_apply_owner;
grant execute on function public.current_myeongha_subject_id()
  to myeongha_relationship_apply_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_relationship_apply_owner;

-- Lock/read authority.
grant select (id, kind, status, merged_into_subject_id)
  on public.subjects to myeongha_relationship_apply_owner;
grant update (id)
  on public.subjects to myeongha_relationship_apply_owner;

grant select
  on public.characters,
     public.relationship_policy_artifacts,
     public.relationship_policy_activations,
     public.chat_turns,
     public.chat_turn_attempts,
     public.conversation_threads,
     public.conversation_thread_characters,
     public.conversation_messages,
     public.world_events,
     public.subject_merge_jobs,
     public.subject_merge_actions
  to myeongha_relationship_apply_owner;

-- Projection authority. No DELETE is granted.
grant select, insert, update
  on public.user_character_states
  to myeongha_relationship_apply_owner;

-- Append-only relationship history authority. Corrections/retractions stay read-only
-- until PHASE N adds their governed mutation commands.
grant select, insert
  on public.relationship_history_entries,
     public.relationship_event_records,
     public.relationship_event_links,
     public.relationship_event_provenance_refs
  to myeongha_relationship_apply_owner;

grant select
  on public.relationship_event_adjustments
  to myeongha_relationship_apply_owner;

-- Subject root.
drop policy if exists relationship_apply_subject_select_v1 on public.subjects;
create policy relationship_apply_subject_select_v1
on public.subjects
for select
to myeongha_relationship_apply_owner
using (id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_subject_lock_v1 on public.subjects;
create policy relationship_apply_subject_lock_v1
on public.subjects
for update
to myeongha_relationship_apply_owner
using (id = public.current_myeongha_subject_id())
with check (id = public.current_myeongha_subject_id());

-- Global immutable authorities.
drop policy if exists relationship_apply_character_select_v1 on public.characters;
create policy relationship_apply_character_select_v1
on public.characters
for select
to myeongha_relationship_apply_owner
using (true);

drop policy if exists relationship_apply_policy_artifact_select_v1
on public.relationship_policy_artifacts;
create policy relationship_apply_policy_artifact_select_v1
on public.relationship_policy_artifacts
for select
to myeongha_relationship_apply_owner
using (true);

drop policy if exists relationship_apply_policy_activation_select_v1
on public.relationship_policy_activations;
create policy relationship_apply_policy_activation_select_v1
on public.relationship_policy_activations
for select
to myeongha_relationship_apply_owner
using (true);

-- Current projection.
drop policy if exists relationship_apply_state_select_v1
on public.user_character_states;
create policy relationship_apply_state_select_v1
on public.user_character_states
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_state_insert_v1
on public.user_character_states;
create policy relationship_apply_state_insert_v1
on public.user_character_states
for insert
to myeongha_relationship_apply_owner
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_state_update_v1
on public.user_character_states;
create policy relationship_apply_state_update_v1
on public.user_character_states
for update
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

-- Append-only relationship history.
drop policy if exists relationship_apply_history_select_v1
on public.relationship_history_entries;
create policy relationship_apply_history_select_v1
on public.relationship_history_entries
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_history_insert_v1
on public.relationship_history_entries;
create policy relationship_apply_history_insert_v1
on public.relationship_history_entries
for insert
to myeongha_relationship_apply_owner
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_event_select_v1
on public.relationship_event_records;
create policy relationship_apply_event_select_v1
on public.relationship_event_records
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_event_insert_v1
on public.relationship_event_records;
create policy relationship_apply_event_insert_v1
on public.relationship_event_records
for insert
to myeongha_relationship_apply_owner
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_adjustment_select_v1
on public.relationship_event_adjustments;
create policy relationship_apply_adjustment_select_v1
on public.relationship_event_adjustments
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_link_select_v1
on public.relationship_event_links;
create policy relationship_apply_link_select_v1
on public.relationship_event_links
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_link_insert_v1
on public.relationship_event_links;
create policy relationship_apply_link_insert_v1
on public.relationship_event_links
for insert
to myeongha_relationship_apply_owner
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_provenance_select_v1
on public.relationship_event_provenance_refs;
create policy relationship_apply_provenance_select_v1
on public.relationship_event_provenance_refs
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_provenance_insert_v1
on public.relationship_event_provenance_refs;
create policy relationship_apply_provenance_insert_v1
on public.relationship_event_provenance_refs
for insert
to myeongha_relationship_apply_owner
with check (subject_id = public.current_myeongha_subject_id());

-- Source authority tables.
drop policy if exists relationship_apply_turn_select_v1 on public.chat_turns;
create policy relationship_apply_turn_select_v1
on public.chat_turns
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_attempt_select_v1 on public.chat_turn_attempts;
create policy relationship_apply_attempt_select_v1
on public.chat_turn_attempts
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_thread_select_v1 on public.conversation_threads;
create policy relationship_apply_thread_select_v1
on public.conversation_threads
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_thread_character_select_v1
on public.conversation_thread_characters;
create policy relationship_apply_thread_character_select_v1
on public.conversation_thread_characters
for select
to myeongha_relationship_apply_owner
using (
  exists (
    select 1
    from public.conversation_threads t
    where t.id = conversation_thread_characters.thread_id
      and t.subject_id = public.current_myeongha_subject_id()
  )
);

drop policy if exists relationship_apply_message_select_v1
on public.conversation_messages;
create policy relationship_apply_message_select_v1
on public.conversation_messages
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_world_select_v1 on public.world_events;
create policy relationship_apply_world_select_v1
on public.world_events
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_apply_merge_job_select_v1
on public.subject_merge_jobs;
create policy relationship_apply_merge_job_select_v1
on public.subject_merge_jobs
for select
to myeongha_relationship_apply_owner
using (
  guest_subject_id = public.current_myeongha_subject_id()
  or member_subject_id = public.current_myeongha_subject_id()
);

drop policy if exists relationship_apply_merge_action_select_v1
on public.subject_merge_actions;
create policy relationship_apply_merge_action_select_v1
on public.subject_merge_actions
for select
to myeongha_relationship_apply_owner
using (
  exists (
    select 1
    from public.subject_merge_jobs j
    where j.id = subject_merge_actions.merge_job_id
      and (
        j.guest_subject_id = public.current_myeongha_subject_id()
        or j.member_subject_id = public.current_myeongha_subject_id()
      )
  )
);

comment on role myeongha_relationship_apply_owner is
  'NOLOGIN/NOBYPASSRLS owner for the PHASE M atomic Production relationship apply functions.';

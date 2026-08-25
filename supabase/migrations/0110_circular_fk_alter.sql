-- Circular pointer constraints are added after both sides exist.

alter table public.birth_profiles
  add constraint birth_profiles_current_revision_fk
  foreign key (current_revision_id, id)
  references public.birth_profile_revisions(id, birth_profile_id)
  deferrable initially deferred;

alter table public.chat_turns
  add constraint chat_turns_committed_attempt_fk
  foreign key (committed_attempt_id, id, subject_id)
  references public.chat_turn_attempts(id, turn_id, subject_id)
  deferrable initially immediate;

alter table public.reading_sessions
  add constraint reading_sessions_current_reading_fk
  foreign key (current_reading_id, id, subject_id)
  references public.readings(id, reading_session_id, subject_id)
  deferrable initially deferred;

alter table public.readings
  add constraint readings_committed_execution_attempt_fk
  foreign key (committed_execution_attempt_id, id, subject_id)
  references public.reading_execution_attempts(id, reading_id, subject_id)
  deferrable initially deferred;

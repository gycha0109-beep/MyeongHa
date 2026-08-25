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

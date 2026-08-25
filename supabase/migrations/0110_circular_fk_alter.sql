-- Circular pointer constraints are added after both sides exist.

alter table public.chat_turns
  add constraint chat_turns_committed_attempt_fk
  foreign key (committed_attempt_id, id, subject_id)
  references public.chat_turn_attempts(id, turn_id, subject_id)
  deferrable initially immediate;

-- S4: a protected paid answer is NEVER silently erased by an ordinary Chat
-- or Reader parent cascade. Physical deletion requires its own off-primary
-- tombstone and key lifecycle; the account finalizer explicitly deletes
-- this child first inside its existing claimed Worker transaction.
-- Forward-only; legacy migrations are left unchanged.
-- Watchtower-Track: db-authority-core

alter table public.official_reader_paid_answer_bodies
  drop constraint official_reader_paid_answer_thread_fk,
  drop constraint official_reader_paid_answer_turn_fk,
  drop constraint official_reader_paid_answer_attempt_fk,
  drop constraint official_reader_paid_answer_marker_fk,
  drop constraint official_reader_paid_answer_participation_fk;

alter table public.official_reader_paid_answer_bodies
  add constraint official_reader_paid_answer_thread_fk
    foreign key (thread_id,subject_id)
    references public.conversation_threads(id,subject_id)
    on delete restrict,
  add constraint official_reader_paid_answer_turn_fk
    foreign key (turn_id,thread_id,subject_id)
    references public.chat_turns(id,thread_id,subject_id)
    on delete restrict,
  add constraint official_reader_paid_answer_attempt_fk
    foreign key (attempt_id,turn_id,subject_id)
    references public.chat_turn_attempts(id,turn_id,subject_id)
    on delete restrict,
  add constraint official_reader_paid_answer_marker_fk
    foreign key (safe_message_id,turn_id,subject_id)
    references public.conversation_messages(id,turn_id,subject_id)
    on delete restrict,
  add constraint official_reader_paid_answer_participation_fk
    foreign key (thread_character_id,thread_id,reader_content_bundle_id)
    references public.conversation_thread_characters(id,thread_id,content_bundle_id)
    on delete restrict;

comment on table public.official_reader_paid_answer_bodies is
'Protected S4 paid Reader ciphertext. All personal Chat parent relationships are RESTRICT rather than CASCADE; explicit owner-scoped deletion with outside-backup Privacy ledger and irreversible key erasure is required. Historical Commerce Grant is retained, but current access always requires independent live Reader purchase scope.';

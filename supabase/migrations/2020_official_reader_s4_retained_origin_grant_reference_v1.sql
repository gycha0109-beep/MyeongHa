-- S4: preserve historically delivered paid content when the originating
-- Reader access binding is removed but a same-scope sibling purchase survives.
-- Historical purchase evidence (entitlement_grants) is RETAIN P5Y; current
-- access is ALWAYS rechecked against the live Reader binding/Grant set.
-- Removing a purchase must never silently CASCADE-delete paid ciphertext
-- without the outside-backup deletion ledger/key owner.
-- Forward-only; no public role or payment activation.
-- Watchtower-Track: db-authority-core

alter table public.official_reader_paid_answer_bodies
  drop constraint official_reader_paid_answer_grant_fk;

alter table public.official_reader_paid_answer_bodies
  add constraint official_reader_paid_answer_retained_origin_grant_fk
  foreign key (originating_entitlement_grant_id)
  references public.entitlement_grants(id)
  on delete restrict;

-- A live Reader binding may disappear during refund, without destroying the
-- retained answer when another independent Grant remains. Keep historical
-- Reader/Reading identity and exact current-scope checks in S6.
comment on constraint official_reader_paid_answer_retained_origin_grant_fk
  on public.official_reader_paid_answer_bodies is
'Immutable originating retained Commerce Grant reference, independent of the disposable Reader access binding. Never CASCADE-delete encrypted paid content on a single refund: use the privacy-fenced last-Grant purge with its outside-backup tombstone/key-erasure workflow.';

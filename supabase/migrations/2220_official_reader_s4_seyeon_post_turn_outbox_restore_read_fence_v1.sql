-- S4: Stop resurrected paid Reader Chat turns at the existing Se-yeon
-- post-turn analysis Consumer boundary, not only during new Outbox inserts.
--
-- A restored PostgreSQL backup may hold a previously enqueued generic
-- SEYEON_POST_TURN_ANALYSIS_REQUESTED Outbox for a turn that the protected
-- S5 safe system marker now identifies as private paid Reader material.
-- Migration 2190 blocks newly inserted/updated derived Outbox events and
-- 2200 holds restore quarantine on historical rows; this separate *read*
-- fence ensures the legacy post-turn Worker cannot claim or process them
-- even before an operator completes the existing Privacy reconciliation.
--
-- The existing myeongha_seyeon_post_turn_owner already has SELECT on
-- conversation_messages, an exact canonical Subject GUC and a narrowly
-- governed Outbox SELECT/UPDATE policy (1500). Add RESTRICTIVE policies:
-- all existing permissive predicates remain mandatory; only S5 marker
-- provenance is removed from this Worker. No new role, EXECUTE grant, new
-- post-turn job, paid content query or production activation.
-- Watchtower-Track: db-authority-core

drop policy if exists outbox_events_seyeon_s4_paid_marker_read_fence_v1
  on public.outbox_events;

create policy outbox_events_seyeon_s4_paid_marker_read_fence_v1
on public.outbox_events
as restrictive
for select
to myeongha_seyeon_post_turn_owner
using (
  -- The existing Worker only claims its own Se-yeon analysis events. Keep
  -- every other legal Outbox type unchanged if policy composition grows.
  aggregate_type is distinct from 'chat_turn'
  or event_type is distinct from 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
  or not exists (
    select 1 from public.conversation_messages marker
    where marker.subject_id=public.current_myeongha_subject_id()
      and marker.turn_id::text=outbox_events.aggregate_id
      and marker.sender_type='system'
      and marker.content_hash=
        'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
  )
);

drop policy if exists outbox_events_seyeon_s4_paid_marker_update_fence_v1
  on public.outbox_events;

create policy outbox_events_seyeon_s4_paid_marker_update_fence_v1
on public.outbox_events
as restrictive
for update
to myeongha_seyeon_post_turn_owner
using (
  aggregate_type is distinct from 'chat_turn'
  or event_type is distinct from 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
  or not exists (
    select 1 from public.conversation_messages marker
    where marker.subject_id=public.current_myeongha_subject_id()
      and marker.turn_id::text=outbox_events.aggregate_id
      and marker.sender_type='system'
      and marker.content_hash=
        'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
  )
)
with check (
  aggregate_type is distinct from 'chat_turn'
  or event_type is distinct from 'SEYEON_POST_TURN_ANALYSIS_REQUESTED'
  or not exists (
    select 1 from public.conversation_messages marker
    where marker.subject_id=public.current_myeongha_subject_id()
      and marker.turn_id::text=outbox_events.aggregate_id
      and marker.sender_type='system'
      and marker.content_hash=
        'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
  )
);

comment on policy outbox_events_seyeon_s4_paid_marker_read_fence_v1
on public.outbox_events
is 'S4 additional restrictive Se-yeon post-turn Worker read fence: exclude any restored analysis Outbox sourced from an immutable S5 protected system Chat marker before claiming or summary/Memory generation; ordinary events retain existing policy.';
comment on policy outbox_events_seyeon_s4_paid_marker_update_fence_v1
on public.outbox_events
is 'S4 additional restrictive Worker claim/checkpoint/complete fence: no mutation of a restored analysis Outbox for an S5 paid Reader turn, even when the legacy permissive Worker policy would have admitted the row.';

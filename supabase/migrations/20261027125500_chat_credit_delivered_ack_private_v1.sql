-- Watchtower-Track: commerce-payment
-- Approved 10-credit delivery ACK authority. This is a private, unmounted
-- candidate: there is NO API, REST, service_role or browser execution grant.
-- A client-reported ACK never substitutes for canonical DB delivery evidence.
begin;

create function public.internal_cmd_chat_credit_ack_delivered_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_client_turn_id uuid,
  p_reservation_id uuid,
  p_committed_turn_id uuid,
  p_assistant_message_id uuid
)
returns text
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $ack$
declare
  v_reservation public.chat_credit_turn_reservations_v1%rowtype;
  v_credits bigint;
  v_state text;
begin
  if p_subject_id is null or p_thread_id is null or p_client_turn_id is null
     or p_reservation_id is null or p_committed_turn_id is null
     or p_assistant_message_id is null then
    raise exception 'Credit acknowledgement requires all original correlation identifiers';
  end if;

  -- The caller must run under its verified canonical Member subject context.
  -- A trusted internal transaction alone is not authority to choose the owner.
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Same lock order as reservation/finalization: Subject -> Reservation ->
  -- Turn/Attempt/Assistant. Concurrent tab retries cannot double charge.
  perform 1 from public.subjects s
   where s.id=p_subject_id and s.kind='member' and s.status='active'
   for update;
  if not found then
    raise exception 'Credit ACK requires the active canonical Member';
  end if;

  select * into v_reservation
    from public.chat_credit_turn_reservations_v1 r
    where r.id=p_reservation_id and r.subject_id=p_subject_id
      and r.thread_id=p_thread_id and r.client_turn_id=p_client_turn_id
      and r.required_credits=10
    for update;
  if not found or v_reservation.state='released' then
    raise exception 'Credit ACK has no matching open or settled reservation';
  end if;
  if v_reservation.state='settled' and (
       v_reservation.delivered_turn_id is distinct from p_committed_turn_id
       or v_reservation.finalized_at is null
     ) then
    raise exception 'Credit ACK replay changes its original committed Turn';
  end if;

  -- Assert the persisted original delivered Turn, its committed Attempt and
  -- the exact, still-present assistant Message, all for the same owner/thread.
  -- For an S0 Positive source, the server-issued first Reply MUST additionally
  -- have an acknowledged protected HTTP delivery receipt. A mere socket
  -- handoff or forged user JSON cannot qualify for those private-source turns.
  perform 1
    from public.chat_turns t
    join public.chat_turn_attempts a
      on a.id=t.committed_attempt_id and a.turn_id=t.id
      and a.subject_id=t.subject_id and a.state='committed'
      and a.committed_message_id=p_assistant_message_id
    join public.conversation_messages m
      on m.id=p_assistant_message_id
      and m.turn_id=t.id and m.thread_id=t.thread_id
      and m.subject_id=t.subject_id and m.sender_type='character'
      and m.redacted_at is null
    where t.id=p_committed_turn_id and t.thread_id=p_thread_id
      and t.subject_id=p_subject_id
      and t.client_turn_id=p_client_turn_id::text
      and t.state='delivered' and t.committed_at is not null
      and t.delivered_at is not null
      and (
        coalesce(a.seyeon_personal_source_pin_jsonb ? 'positiveProof',false)=false
        or nullif(to_jsonb(a)->>'seyeon_positive_delivery_received_at','') is not null
      )
    for share of t,a,m;
  if not found then
    raise exception 'Credit ACK lacks matching original DB-delivered assistant proof';
  end if;

  select coalesce(sum(a.credits),0)::bigint into v_credits
    from public.chat_credit_turn_allocations_v1 a
    join public.chat_credit_lots_v1 l
      on l.id=a.lot_id and l.subject_id=p_subject_id
    where a.reservation_id=p_reservation_id;
  if v_credits<>10 then
    raise exception 'Credit ACK allocation must equal the approved ten credits';
  end if;

  v_state:=public.internal_cmd_chat_credit_finalize_v1(
    p_subject_id,p_reservation_id,true,p_committed_turn_id
  );
  if v_state is distinct from 'settled' then
    raise exception 'Credit ACK finalization did not settle';
  end if;
  return 'settled';
end
$ack$;

-- The authenticated HTTP receipt boundary and runtime wiring are separate
-- work. In particular, nobody receives EXECUTE until that independent
-- identity, proof and delivery integration is implemented and exercised.
revoke all on function public.internal_cmd_chat_credit_ack_delivered_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;

commit;

-- Watchtower-Track: security
-- Source candidate: isolated PostgreSQL only; no Production migration.
-- This RPC only follows an already authenticated, persisted S0 receipt.
-- The browser supplies ONLY its one-use receipt to the S0 ACK authority.
begin;

create function public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(
  p_received_attempt_id uuid
)
returns text
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $settle$
declare
  v_subject uuid;
  v_thread uuid;
  v_client_turn uuid;
  v_committed_turn uuid;
  v_assistant uuid;
  v_reservation uuid;
  v_status text;
begin
  if p_received_attempt_id is null then
    raise exception 'G4 receipt settlement requires original Attempt';
  end if;

  -- Read ONLY identity pointers first. Lock order then matches the ACK:
  -- canonical Subject -> exact Reservation -> original Turn/Attempt/Message.
  select a.subject_id,t.thread_id,t.client_turn_id::uuid,
         t.id,a.committed_message_id
    into v_subject,v_thread,v_client_turn,v_committed_turn,v_assistant
  from public.chat_turn_attempts a
  join public.chat_turns t on t.id=a.turn_id
      and t.subject_id=a.subject_id and t.committed_attempt_id=a.id
  where a.id=p_received_attempt_id
    and a.state='committed'
    and a.committed_message_id is not null
    and a.seyeon_personal_source_pin_jsonb ? 'positiveProof'
    and nullif(to_jsonb(a)->>'seyeon_positive_delivery_received_at','') is not null
    and t.state='delivered'
    and t.committed_at is not null and t.delivered_at is not null;
  if not found then
    raise exception 'G4 receipt settlement requires original acknowledged positive delivery';
  end if;

  perform 1 from public.subjects
  where id=v_subject and kind='member' and status='active'
  for update;
  if not found then
    raise exception 'G4 receipt settlement requires an active original Member';
  end if;

  select r.id into v_reservation
  from public.chat_credit_turn_reservations_v1 r
  where r.subject_id=v_subject and r.thread_id=v_thread
    and r.client_turn_id=v_client_turn and r.required_credits=10
    and r.state in ('reserved','settled')
  for update;
  if not found then
    raise exception 'G4 receipt settlement requires the exact original credit reservation';
  end if;

  -- Only the server-owned Commerce role may execute this function.
  -- Bind the already persisted Member identity transaction-locally.
  perform pg_catalog.set_config('myeongha.subject_id',v_subject::text,true);

  -- The existing ACK still checks original DB-delivered Turn, committed
  -- assistant, persisted S0 receipt and 10-credit allocation under locks.
  v_status:=public.internal_cmd_chat_credit_ack_delivered_proven_v2(
    v_subject,v_thread,v_client_turn,v_reservation,v_committed_turn,v_assistant
  );
  if v_status is distinct from 'settled' then
    raise exception 'G4 receipt settlement did not settle original credits';
  end if;
  return 'settled';
end
$settle$;

revoke all on function public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(
  uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;

grant execute on function public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(
  uuid
) to myeongha_commerce_internal_executor;
commit;

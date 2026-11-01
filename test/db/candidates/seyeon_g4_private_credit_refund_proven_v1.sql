-- Watchtower-Track: security
-- Candidate-only, isolated CI PostgreSQL. NEVER a production migration.
-- Do not grant generic finalize or wallet tables to the Commerce role.
begin;

create function public.internal_cmd_seyeon_g4_credit_refund_proven_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_client_turn_id uuid,
  p_reservation_id uuid
)
returns text
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $refund$
declare
  v_state text;
begin
  if p_subject_id is null or p_thread_id is null
     or p_client_turn_id is null or p_reservation_id is null then
    raise exception 'G4 refund requires original Member, Thread, Turn and reservation';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Same lock order as private delivered ACK V2: owner -> reservation -> Turn.
  perform 1 from public.subjects s
   where s.id=p_subject_id and s.kind='member' and s.status='active'
   for update;
  if not found then
    raise exception 'G4 refund requires active canonical Member';
  end if;

  perform 1 from public.chat_credit_turn_reservations_v1 r
   where r.id=p_reservation_id and r.subject_id=p_subject_id
     and r.thread_id=p_thread_id and r.client_turn_id=p_client_turn_id
     and r.required_credits=10 and r.state='reserved'
   for update;
  if not found then
    raise exception 'G4 refund requires exact still-reserved credit';
  end if;

  -- Never release retryable, in-flight, committed, or delivered attempts.
  -- Only terminal original DB failure with NO commit/delivery may refund.
  perform 1 from public.chat_turns t
   where t.subject_id=p_subject_id and t.thread_id=p_thread_id
     and t.client_turn_id=p_client_turn_id::text
     and t.state in ('failed_final','abandoned')
     and t.committed_at is null and t.committed_attempt_id is null
     and t.delivered_at is null
   for share of t;
  if not found then
    raise exception 'G4 refund requires terminal uncommitted undelivered Turn';
  end if;

  v_state:=public.internal_cmd_chat_credit_finalize_v1(
    p_subject_id,p_reservation_id,false,null
  );
  if v_state is distinct from 'released' then
    raise exception 'G4 refund private finalization did not release';
  end if;
  return 'released';
end $refund$;

revoke all on function public.internal_cmd_seyeon_g4_credit_refund_proven_v1(
  uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;

grant execute on function public.internal_cmd_seyeon_g4_credit_refund_proven_v1(
  uuid,uuid,uuid,uuid
) to myeongha_commerce_internal_executor;

commit;

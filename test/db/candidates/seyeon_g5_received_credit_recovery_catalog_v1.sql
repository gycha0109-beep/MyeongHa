-- Watchtower-Track: security
-- G5 candidate only. Install in named disposable PostgreSQL 17/Commerce clones.
-- Select ONLY original already-received S0 positive Attempts with an OPEN
-- 10-credit reservation older than five minutes. No public/Member visibility.
begin;

create function public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(
  p_limit integer,
  p_test_as_of timestamptz default null
)
returns table(attempt_id uuid)
language plpgsql volatile security definer
set search_path=pg_catalog,public
set row_security=off
as $catalog$
declare v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_limit is null or p_limit<1 or p_limit>25 then
    raise exception 'G5 recovery lookup limit must be between 1 and 25';
  end if;
  -- A virtual clock is permitted ONLY in the exact disposable Actions case
  -- database. Production cannot shift time or rewrite protected receipts.
  if p_test_as_of is not null then
    if pg_catalog.current_database() !~ '^myeongha_ci_case_[0-9]+$'
       or p_test_as_of < v_now
       or p_test_as_of > v_now + interval '15 minutes' then
      raise exception 'G5 recovery test clock requires isolated bounded CI database';
    end if;
    v_now:=p_test_as_of;
  end if;

  return query
    select a.id
      from public.chat_credit_turn_reservations_v1 r
      join public.chat_turns t
        on t.subject_id=r.subject_id and t.thread_id=r.thread_id
        and t.client_turn_id=r.client_turn_id::text
        and t.state='delivered' and t.committed_at is not null
        and t.delivered_at is not null
      join public.chat_turn_attempts a
        on a.id=t.committed_attempt_id and a.turn_id=t.id
        and a.subject_id=t.subject_id and a.state='committed'
        and a.committed_message_id is not null
      join public.conversation_messages m
        on m.id=a.committed_message_id and m.turn_id=t.id
        and m.subject_id=t.subject_id and m.thread_id=t.thread_id
        and m.sender_type='character' and m.redacted_at is null
      join public.subjects s
        on s.id=t.subject_id and s.kind='member' and s.status='active'
      where r.state='reserved' and r.required_credits=10
        and a.seyeon_personal_source_pin_jsonb ? 'positiveProof'
        and a.seyeon_positive_delivery_issued_at is not null
        and a.seyeon_positive_delivery_receipt_hash is not null
        and a.seyeon_positive_delivery_received_at is not null
        and a.seyeon_positive_delivery_received_at
             <= v_now-interval '5 minutes'
      order by a.seyeon_positive_delivery_received_at,a.id
      limit p_limit;
end
$catalog$;

revoke all on function public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)
  from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)
  to myeongha_commerce_internal_executor;
commit;

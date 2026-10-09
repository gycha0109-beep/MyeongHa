-- Subject-scoped model cost and unresolved-call observability for Se-yeon.
-- Watchtower-Track: character-memory
-- No browser route and no new storage/FKs. UNKNOWN is never coalesced to free.
create function public.qry_seyeon_ai_model_cost_v1(
  p_subject_id uuid, p_turn_id uuid
)
returns table (
  provider_key text,
  model_key text,
  call_count bigint,
  unsettled_calls bigint,
  known_cost_micro_usd numeric,
  unknown_cost_calls bigint,
  total_estimated_cost_micro_usd numeric
)
language plpgsql stable security definer
set search_path=pg_catalog, public
as $model_cost$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if not exists (
    select 1 from public.chat_turns t
    where t.id=p_turn_id and t.subject_id=p_subject_id
  ) then
    raise exception using errcode='23514',
      constraint='seyeon_ai_model_cost_turn_not_owned',
      message='Model cost query requires an authoritative owned turn';
  end if;

  return query
  select
    e.provider_key,
    e.model_key,
    count(*)::bigint,
    count(*) filter(where e.lifecycle_state='started')::bigint,
    coalesce(sum(e.estimated_cost_micro_usd),0)::numeric,
    count(*) filter(where e.estimated_cost_micro_usd is null)::bigint,
    case
      when count(*) filter(where e.estimated_cost_micro_usd is null)=0
        then coalesce(sum(e.estimated_cost_micro_usd),0)::numeric
      else null::numeric
    end
  from public.seyeon_ai_call_cost_events e
  where e.subject_id=p_subject_id and e.turn_id=p_turn_id
  group by e.provider_key,e.model_key
  order by e.provider_key,e.model_key;
end
$model_cost$;

create function public.qry_seyeon_ai_unsettled_calls_v1(
  p_subject_id uuid, p_turn_id uuid
)
returns table (
  call_id uuid,
  provider_key text,
  model_key text,
  purpose text,
  started_at timestamptz
)
language plpgsql stable security definer
set search_path=pg_catalog,public
as $unsettled_calls$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if not exists (
    select 1 from public.chat_turns t
    where t.id=p_turn_id and t.subject_id=p_subject_id
  ) then
    raise exception using errcode='23514',
      constraint='seyeon_ai_pending_cost_turn_not_owned',
      message='Pending call query requires an authoritative owned turn';
  end if;
  return query
  select e.call_id,e.provider_key,e.model_key,e.purpose,e.created_at
  from public.seyeon_ai_call_cost_events e
  where e.subject_id=p_subject_id
    and e.turn_id=p_turn_id
    and e.lifecycle_state='started'
  order by e.created_at,e.call_id;
end
$unsettled_calls$;

grant myeongha_seyeon_cost_meter_owner to current_user;
grant create on schema public to myeongha_seyeon_cost_meter_owner;
alter function public.qry_seyeon_ai_model_cost_v1(uuid,uuid)
  owner to myeongha_seyeon_cost_meter_owner;
alter function public.qry_seyeon_ai_unsettled_calls_v1(uuid,uuid)
  owner to myeongha_seyeon_cost_meter_owner;
revoke all on function public.qry_seyeon_ai_model_cost_v1(uuid,uuid) from public;
revoke all on function public.qry_seyeon_ai_unsettled_calls_v1(uuid,uuid) from public;
do $acl$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute format(
      'revoke all on function public.qry_seyeon_ai_model_cost_v1(uuid,uuid) from %I',v_role);
    execute format(
      'revoke all on function public.qry_seyeon_ai_unsettled_calls_v1(uuid,uuid) from %I',v_role);
  end loop;
end $acl$;
grant execute on function public.qry_seyeon_ai_model_cost_v1(uuid,uuid)
  to myeongha_api_executor;
grant execute on function public.qry_seyeon_ai_unsettled_calls_v1(uuid,uuid)
  to myeongha_api_executor;
revoke create on schema public from myeongha_seyeon_cost_meter_owner;
revoke myeongha_seyeon_cost_meter_owner from current_user;

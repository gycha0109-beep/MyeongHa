-- D4B-10B server-owned, atomic admission receipt (OFFLINE-only).
-- Watchtower-Track: character-memory
-- Keep receipt in the existing ledger: its deletion trigger already erases PII.
alter table public.seyeon_ai_call_cost_events
  add column governor_receipt_pinned_at timestamptz,
  add column governor_input_rate_micro_usd_per_million bigint,
  add column governor_cached_input_rate_micro_usd_per_million bigint,
  add column governor_output_rate_micro_usd_per_million bigint,
  add constraint seyeon_ai_governor_receipt_pin_shape_v1 check (
    (governor_receipt_pinned_at is null
     and governor_input_rate_micro_usd_per_million is null
     and governor_cached_input_rate_micro_usd_per_million is null
     and governor_output_rate_micro_usd_per_million is null)
    or
    (governor_receipt_pinned_at is not null
     and governor_bucket_utc_date is not null
     and governor_input_rate_micro_usd_per_million > 0
     and governor_cached_input_rate_micro_usd_per_million >= 0
     and governor_output_rate_micro_usd_per_million > 0)
  );

create function public.pin_seyeon_governed_reservation_receipt_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $pin$
declare
  v_rate public.seyeon_ai_governor_model_policies_v1%rowtype;
  v_ceiling numeric;
begin
  if old.governor_bucket_utc_date is not null then
    if row(new.subject_id,new.thread_id,new.turn_id,new.attempt_id,
      new.phase,new.purpose,new.provider_key,new.model_key,
      new.governor_bucket_utc_date,new.governor_policy_version,
      new.governor_price_version,new.governor_ceiling_micro_usd,
      new.governor_input_bound_tokens,new.governor_output_cap_tokens,
      new.governor_receipt_pinned_at,new.governor_input_rate_micro_usd_per_million,
      new.governor_cached_input_rate_micro_usd_per_million,
      new.governor_output_rate_micro_usd_per_million)
    is distinct from
    row(old.subject_id,old.thread_id,old.turn_id,old.attempt_id,
      old.phase,old.purpose,old.provider_key,old.model_key,
      old.governor_bucket_utc_date,old.governor_policy_version,
      old.governor_price_version,old.governor_ceiling_micro_usd,
      old.governor_input_bound_tokens,old.governor_output_cap_tokens,
      old.governor_receipt_pinned_at,old.governor_input_rate_micro_usd_per_million,
      old.governor_cached_input_rate_micro_usd_per_million,
      old.governor_output_rate_micro_usd_per_million)
    then
      raise exception using errcode='23514',
        constraint='seyeon_governed_receipt_immutable',
        message='Approved AI reservation evidence cannot be rewritten';
    end if;
    return new;
  end if;
  if new.governor_bucket_utc_date is null then
    if new.governor_receipt_pinned_at is not null
      or new.governor_input_rate_micro_usd_per_million is not null
      or new.governor_cached_input_rate_micro_usd_per_million is not null
      or new.governor_output_rate_micro_usd_per_million is not null then
      raise exception 'Cannot attach a receipt without governed admission';
    end if;
    return new;
  end if;
  if old.lifecycle_state is distinct from 'started'
    or new.lifecycle_state is distinct from 'started'
    or new.governor_receipt_pinned_at is not null
    or new.governor_input_rate_micro_usd_per_million is not null
    or new.governor_cached_input_rate_micro_usd_per_million is not null
    or new.governor_output_rate_micro_usd_per_million is not null then
    raise exception 'Only a fresh governed Start can pin a receipt';
  end if;
  select m.* into v_rate from public.seyeon_ai_governor_model_policies_v1 m
  where m.provider_key=new.provider_key and m.model_key=new.model_key
    and m.policy_version=new.governor_policy_version
    and m.price_version=new.governor_price_version;
  if not found then raise exception 'No immutable reservation rate card'; end if;
  v_ceiling:=ceil((
    new.governor_input_bound_tokens::numeric *
      greatest(v_rate.input_micro_usd_per_million,
               v_rate.cached_input_micro_usd_per_million)::numeric
    + new.governor_output_cap_tokens::numeric *
      v_rate.output_micro_usd_per_million::numeric) / 1000000::numeric);
  if v_ceiling is distinct from new.governor_ceiling_micro_usd::numeric then
    raise exception 'Reservation ceiling does not match authoritative rate';
  end if;
  new.governor_input_rate_micro_usd_per_million:=v_rate.input_micro_usd_per_million;
  new.governor_cached_input_rate_micro_usd_per_million:=v_rate.cached_input_micro_usd_per_million;
  new.governor_output_rate_micro_usd_per_million:=v_rate.output_micro_usd_per_million;
  new.governor_receipt_pinned_at:=clock_timestamp();
  return new;
end $pin$;

create trigger pin_seyeon_governed_reservation_receipt_v1
before update on public.seyeon_ai_call_cost_events
for each row execute function public.pin_seyeon_governed_reservation_receipt_v1();
revoke all on function public.pin_seyeon_governed_reservation_receipt_v1() from public;

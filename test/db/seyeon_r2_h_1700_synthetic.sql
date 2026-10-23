-- Synthetic PG17 ONLY. NO real people, providers, or paid usage.
-- This file runs solely after the original 1700 on CI-owned disposable DB.
-- Watchtower-Track: ops
insert into public.seyeon_ai_governor_model_policies_v1(
  provider_key,model_key,policy_version,price_version,allowed_purposes,
  context_window_tokens,maximum_input_tokens,maximum_output_tokens,
  maximum_serialized_request_bytes,input_micro_usd_per_million,
  cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active)
values ('synthetic1700','offline','p1','r1',array['dialogue_render'],
  8192,4096,1024,100000,2000000,500000,4000000,true);

create temporary table synthetic_1700_ledger (
 id uuid primary key,
 subject_id uuid,thread_id uuid,turn_id uuid,attempt_id uuid,
 phase text,purpose text,provider_key text,model_key text,
 lifecycle_state text,
 governor_bucket_utc_date date,governor_policy_version text,
 governor_price_version text,governor_ceiling_micro_usd bigint,
 governor_input_bound_tokens bigint,governor_output_cap_tokens bigint,
 governor_receipt_pinned_at timestamptz,
 governor_input_rate_micro_usd_per_million bigint,
 governor_cached_input_rate_micro_usd_per_million bigint,
 governor_output_rate_micro_usd_per_million bigint
);
create trigger pin_synthetic_1700 before update on synthetic_1700_ledger
for each row execute function public.pin_seyeon_governed_reservation_receipt_v1();
insert into synthetic_1700_ledger(
 id,subject_id,thread_id,turn_id,attempt_id,phase,purpose,provider_key,
 model_key,lifecycle_state)
select ('e7000000-0000-0000-0000-00000000000'||n)::uuid,
'e7010000-0000-0000-0000-000000000001',
'e7020000-0000-0000-0000-000000000001',
'e7030000-0000-0000-0000-000000000001',
'e7040000-0000-0000-0000-000000000001',
'chat','dialogue_render','synthetic1700','offline','started'
from generate_series(1,3) n;

-- Rate calculation: (100*2,000,000 + 40*4,000,000)/1,000,000 = 360.
update synthetic_1700_ledger set
 governor_bucket_utc_date=current_date,governor_policy_version='p1',
 governor_price_version='r1',governor_ceiling_micro_usd=360,
 governor_input_bound_tokens=100,governor_output_cap_tokens=40
where id='e7000000-0000-0000-0000-000000000001';
do $positive$
begin
 if not exists(select 1 from synthetic_1700_ledger
   where id='e7000000-0000-0000-0000-000000000001'
     and governor_receipt_pinned_at is not null
     and governor_input_rate_micro_usd_per_million=2000000
     and governor_cached_input_rate_micro_usd_per_million=500000
     and governor_output_rate_micro_usd_per_million=4000000)
 then raise exception 'HOLD_1700_SYNTHETIC_PIN_NOT_ATOMIC'; end if;
end $positive$;
\echo PASS_R2_H_1700_SYNTHETIC_CORRECT_RATE_PIN

do $negative$
begin
 begin
  update synthetic_1700_ledger set purpose='mutated'
   where id='e7000000-0000-0000-0000-000000000001';
  raise exception 'HOLD_1700_PINNED_RECEIPT_MUTATED';
 exception when check_violation then
  if sqlerrm not like '%Approved AI reservation evidence cannot be rewritten%'
  then raise; end if;
 end;
 begin
  update synthetic_1700_ledger set
    governor_bucket_utc_date=current_date,
    governor_policy_version='p1',governor_price_version='r1',
    governor_ceiling_micro_usd=359,governor_input_bound_tokens=100,
    governor_output_cap_tokens=40
  where id='e7000000-0000-0000-0000-000000000002';
  raise exception 'HOLD_1700_BAD_CEILING_ACCEPTED';
 exception when others then
  if sqlerrm not like '%Reservation ceiling does not match authoritative rate%'
  then raise; end if;
 end;
 begin
  update synthetic_1700_ledger set
    governor_receipt_pinned_at=clock_timestamp()
  where id='e7000000-0000-0000-0000-000000000003';
  raise exception 'HOLD_1700_UNGOVERNED_RECEIPT_ACCEPTED';
 exception when others then
  if sqlerrm not like '%Cannot attach a receipt without governed admission%'
  then raise; end if;
 end;
end $negative$;
\echo PASS_R2_H_1700_SYNTHETIC_MUTATION_BAD_RATE_UNGOVERNED_DENY

-- Independent null-shape diagnostic: this CHECK predicate is copied exactly
-- from the Git-blob-pinned 1700 original. PostgreSQL CHECK accepts UNKNOWN.
-- The source attaches the trigger on UPDATE, not INSERT. This is a limited
-- SQL-level reproduction; it does not prove browser/API direct table access.
create temporary table synthetic_1700_shape (
  governor_bucket_utc_date date,
  governor_receipt_pinned_at timestamptz,
  governor_input_rate_micro_usd_per_million bigint,
  governor_cached_input_rate_micro_usd_per_million bigint,
  governor_output_rate_micro_usd_per_million bigint,
  constraint exact_1700_shape check (
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
  )
);
insert into synthetic_1700_shape values (
  current_date,clock_timestamp(),null,500000,4000000);
do $gap$
begin
 if (select count(*) from synthetic_1700_shape) <> 1
 then raise exception 'HOLD_1700_NULL_SHAPE_REPRODUCTION_INCONCLUSIVE'; end if;
end $gap$;
\echo HOLD_R2_H_1700_SQL_NULL_RECEIPT_SHAPE_GAP_REPRODUCED

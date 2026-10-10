-- D4A synthetic only; a disposable database with a committed attempt is required.
-- Watchtower-Track: character-memory
\set ON_ERROR_STOP on
create role myeongha_seyeon_d4_login_ci
  login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant myeongha_seyeon_governed_executor to myeongha_seyeon_d4_login_ci;
insert into public.seyeon_ai_governor_model_policies_v1(
 provider_key,model_key,policy_version,price_version,allowed_purposes,
 context_window_tokens,maximum_input_tokens,maximum_output_tokens,
 maximum_serialized_request_bytes,input_micro_usd_per_million,
 cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active
) values (
 'openai-responses','d4-offline-no-network-model','d4-policy-v1','d4-rate-v1',
 array['event_extraction']::text[],2000,1200,800,20000,
 1000000,250000,4000000,true
);
insert into public.seyeon_ai_governor_daily_budgets_v1(
 bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd
) values ((clock_timestamp() at time zone 'UTC')::date,3700,3700);

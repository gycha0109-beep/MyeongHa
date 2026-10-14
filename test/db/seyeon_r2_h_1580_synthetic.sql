-- R2-H synthetic-only policy integrity probes; disposable PG17 transaction.
-- Watchtower-Track: ops
DO $r2h1580$
DECLARE blocked boolean;
BEGIN
 INSERT INTO public.seyeon_ai_governor_model_policies_v1
  (provider_key,model_key,policy_version,price_version,allowed_purposes,
   context_window_tokens,maximum_input_tokens,maximum_output_tokens,
   maximum_serialized_request_bytes,input_micro_usd_per_million,
   cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active)
 VALUES ('synthetic-provider','synthetic-model','v1','p1',ARRAY['event_extraction'],
  4096,1000,512,4000,10000,5000,20000,true);
 blocked:=false;
 BEGIN
  INSERT INTO public.seyeon_ai_governor_model_policies_v1
   (provider_key,model_key,policy_version,price_version,allowed_purposes,
    context_window_tokens,maximum_input_tokens,maximum_output_tokens,
    maximum_serialized_request_bytes,input_micro_usd_per_million,
    cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active)
  VALUES ('synthetic-provider','synthetic-model','v2','p2',ARRAY['event_extraction'],
   4096,1000,512,4000,10000,5000,20000,true);
 EXCEPTION WHEN unique_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1580_PARALLEL_ACTIVE_MODEL_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN
  INSERT INTO public.seyeon_ai_governor_model_policies_v1
   (provider_key,model_key,policy_version,price_version,allowed_purposes,
    context_window_tokens,maximum_input_tokens,maximum_output_tokens,
    maximum_serialized_request_bytes,input_micro_usd_per_million,
    cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active)
  VALUES ('synthetic-provider','invalid-model','v1','p1',ARRAY['event_extraction'],
   100,100,100,4000,10000,5000,20000,false);
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1580_CONTEXT_WINDOW_VIOLATION_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN
  INSERT INTO public.seyeon_ai_governor_daily_budgets_v1
   (bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd)
  VALUES ('2026-01-01',0,100);
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1580_ZERO_BUDGET_ACCEPTED'; END IF;
 DELETE FROM public.seyeon_ai_governor_model_policies_v1
  WHERE provider_key='synthetic-provider' AND model_key='synthetic-model';
 IF EXISTS(SELECT 1 FROM public.seyeon_ai_governor_model_policies_v1)
   OR EXISTS(SELECT 1 FROM public.seyeon_ai_governor_daily_budgets_v1)
 THEN RAISE EXCEPTION 'HOLD_R2_H_1580_SYNTHETIC_SEED_LEFT_BEHIND'; END IF;
END
$r2h1580$;

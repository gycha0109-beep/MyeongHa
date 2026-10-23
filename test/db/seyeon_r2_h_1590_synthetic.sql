-- R2-H synthetic-only stored effective cost transitions, all rolled back.
-- Watchtower-Track: ops
DO $r2h1590$
DECLARE v_call uuid:='ab000000-0000-4000-8000-000000001590';
BEGIN
 INSERT INTO public.seyeon_ai_call_cost_events(
  call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,
  purpose,provider_key,model_key,outcome,cost_status,lifecycle_state,settled_at,
  governor_bucket_utc_date,governor_policy_version,governor_price_version,
  governor_ceiling_micro_usd,governor_input_bound_tokens,governor_output_cap_tokens)
 VALUES (v_call,'ab000000-0000-4000-8000-000000000001',
         'ab000000-0000-4000-8000-000000000002',
         'ab000000-0000-4000-8000-000000000003',
         'ab000000-0000-4000-8000-000000000004',
         'chat','{}'::jsonb,'conversation','synthetic','model',
         'not_dispatched','usage_unknown','started',NULL,
         current_date,'v1','p1',500,1000,512);
 IF (SELECT governor_effective_micro_usd FROM public.seyeon_ai_call_cost_events WHERE call_id=v_call) IS DISTINCT FROM 500
 THEN RAISE EXCEPTION 'HOLD_R2_H_1590_STARTED_RESERVATION_NOT_CONSERVATIVE'; END IF;
 UPDATE public.seyeon_ai_call_cost_events
 SET outcome='response_received',cost_status='estimated',price_version='p1',
     estimated_cost_micro_usd=300,lifecycle_state='settled',settled_at=clock_timestamp()
 WHERE call_id=v_call;
 IF (SELECT governor_effective_micro_usd FROM public.seyeon_ai_call_cost_events WHERE call_id=v_call) IS DISTINCT FROM 300
 THEN RAISE EXCEPTION 'HOLD_R2_H_1590_SETTLED_COST_NOT_EFFECTIVE'; END IF;
 DELETE FROM public.seyeon_ai_call_cost_events WHERE call_id=v_call;
 IF EXISTS(SELECT 1 FROM public.seyeon_ai_call_cost_events WHERE call_id=v_call)
 THEN RAISE EXCEPTION 'HOLD_R2_H_1590_SYNTHETIC_COST_LEFT_BEHIND'; END IF;
END
$r2h1590$;

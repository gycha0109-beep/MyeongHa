-- R2-H cost-foundation isolated PG17 synthetic data; always rolled back.
-- Watchtower-Track: ops
DO $cost1550$
DECLARE blocked boolean;
BEGIN
 INSERT INTO public.seyeon_ai_call_cost_events(
 call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,
 purpose,provider_key,model_key,outcome,cost_status)
 VALUES ('11111111-1111-4111-8111-111111111111',
         '22222222-2222-4222-8222-222222222222',
         '33333333-3333-4333-8333-333333333333',
         '44444444-4444-4444-8444-444444444444',
         '55555555-5555-4555-8555-555555555555',
         'chat','{}'::jsonb,'conversation','synthetic','fixture','response_received','usage_unknown');
 blocked:=false;
 BEGIN
  INSERT INTO public.seyeon_ai_call_cost_events(
  call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,purpose,
  provider_key,model_key,outcome,cost_status,estimated_cost_micro_usd)
  VALUES ('66666666-6666-4666-8666-666666666666',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
          'chat','{}'::jsonb,'conversation','synthetic','fixture',
          'response_received','usage_unknown',1);
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1550_UNKNOWN_COST_WAS_ESTIMATED'; END IF;
 blocked:=false;
 BEGIN
  INSERT INTO public.seyeon_ai_call_cost_events(
  call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,
  purpose,provider_key,model_key,outcome,cost_status)
  VALUES ('11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
          'chat','{}'::jsonb,'conversation','synthetic','fixture',
          'response_received','usage_unknown');
 EXCEPTION WHEN unique_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1550_DUPLICATE_CALL_ACCEPTED'; END IF;
END
$cost1550$;

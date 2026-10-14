-- 1560 must migrate legacy settled rows and enforce started/settled partition.
-- Watchtower-Track: ops
DO $cost1560$
DECLARE blocked boolean;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM public.seyeon_ai_call_cost_events
  WHERE call_id='11111111-1111-4111-8111-111111111111'
    AND lifecycle_state='settled' AND settled_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'HOLD_R2_H_1560_LEGACY_SETTLEMENT_BACKFILL_MISSING'; END IF;
 INSERT INTO public.seyeon_ai_call_cost_events(
 call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,
 purpose,provider_key,model_key,outcome,cost_status,lifecycle_state,settled_at)
 VALUES ('77777777-7777-4777-8777-777777777777',
         '22222222-2222-4222-8222-222222222222',
         '33333333-3333-4333-8333-333333333333',
         '44444444-4444-4444-8444-444444444444',
         '55555555-5555-4555-8555-555555555555',
         'chat','{}'::jsonb,'conversation','synthetic','fixture','not_dispatched',
         'usage_unknown','started',NULL);
 blocked:=false;
 BEGIN
  INSERT INTO public.seyeon_ai_call_cost_events(
  call_id,subject_id,thread_id,turn_id,attempt_id,phase,event_jsonb,
  purpose,provider_key,model_key,outcome,cost_status,lifecycle_state,settled_at)
  VALUES ('88888888-8888-4888-8888-888888888888',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
          'chat','{}'::jsonb,'conversation','synthetic','fixture',
          'response_received','usage_unknown','started',NULL);
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1560_STARTED_WITH_RESPONSE_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN
  UPDATE public.seyeon_ai_call_cost_events
  SET lifecycle_state='settled',settled_at=clock_timestamp()
  WHERE call_id='77777777-7777-4777-8777-777777777777';
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1560_SETTLED_WITHOUT_DISPATCH_ACCEPTED'; END IF;
END
$cost1560$;

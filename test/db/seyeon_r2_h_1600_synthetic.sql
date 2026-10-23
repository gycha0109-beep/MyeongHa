-- 1600 rate-card update/delete, only synthetic row in outer ROLLBACK.
-- Expected 23514 check violations must be caught; any acceptance fails closed.
-- Watchtower-Track: ops
DO $synthetic1600$
DECLARE blocked boolean;
BEGIN
 INSERT INTO public.seyeon_ai_governor_model_policies_v1(
  provider_key,model_key,policy_version,price_version,allowed_purposes,
  context_window_tokens,maximum_input_tokens,maximum_output_tokens,
  maximum_serialized_request_bytes,input_micro_usd_per_million,
  cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active)
 VALUES('fixture-1600','fixture-1600','v1','p1',ARRAY['event_extraction'],4096,1000,512,5000,2000,1000,3000,false);
 UPDATE public.seyeon_ai_governor_model_policies_v1
  SET is_active=true WHERE provider_key='fixture-1600';
 IF NOT EXISTS(SELECT 1 FROM public.seyeon_ai_governor_model_policies_v1
     WHERE provider_key='fixture-1600' AND is_active)
 THEN RAISE EXCEPTION 'HOLD_R2_H_1600_ACTIVATION_TOGGLE_REJECTED'; END IF;

 blocked:=false;
 BEGIN
  UPDATE public.seyeon_ai_governor_model_policies_v1
   SET output_micro_usd_per_million=9000 WHERE provider_key='fixture-1600';
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1600_RATE_MUTATION_ACCEPTED'; END IF;

 blocked:=false;
 BEGIN
  UPDATE public.seyeon_ai_governor_model_policies_v1
   SET price_version='p2' WHERE provider_key='fixture-1600';
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1600_PRICE_VERSION_MUTATION_ACCEPTED'; END IF;

 blocked:=false;
 BEGIN
  DELETE FROM public.seyeon_ai_governor_model_policies_v1 WHERE provider_key='fixture-1600';
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1600_RATE_CARD_DELETE_ACCEPTED'; END IF;
END
$synthetic1600$;

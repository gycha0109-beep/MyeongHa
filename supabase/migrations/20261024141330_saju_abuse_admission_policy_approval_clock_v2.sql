-- Preserve v1 as history: its rounded 13:00 timestamp was not the actual approval
-- receipt/application time. Register immutable v2 versions using the DB clock;
-- never rewrite a policy's signed content or erase its audit history.
UPDATE public.saju_abuse_admission_policies_v1 SET enabled=false
WHERE policy_version IN ('canary-20261024-v1','production-20261024-v1');
INSERT INTO public.saju_abuse_admission_policies_v1
  (route_id,policy_version,window_seconds,request_limit,blocked_count_saturation,
   retry_after_maximum_seconds,cleanup_retention_seconds,approval_ref,approved_at,enabled)
SELECT route_id,replace(policy_version,'-v1','-v2'),window_seconds,request_limit,
  blocked_count_saturation,retry_after_maximum_seconds,cleanup_retention_seconds,
  approval_ref,clock_timestamp(),policy_version='canary-20261024-v1'
FROM public.saju_abuse_admission_policies_v1
WHERE policy_version IN ('canary-20261024-v1','production-20261024-v1');

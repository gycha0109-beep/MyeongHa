-- Explicit delegated Product policy authority: user requested completion of policy
-- selection, Production DB application, enforcement and alert activation on 2026-10-24.
-- This is an initial product ceiling, NOT a measured organic traffic percentile.
-- Canary is enabled only while public runtime release switch remains off.
INSERT INTO public.saju_abuse_admission_policies_v1
  (route_id,policy_version,window_seconds,request_limit,blocked_count_saturation,
   retry_after_maximum_seconds,cleanup_retention_seconds,approval_ref,approved_at,enabled)
VALUES
  ('api.me.saju.calculation','canary-20261024-v1',60,2,3,60,3600,
   'docs/security/SECURITY_PRODUCTION_ACTIVATION_20261024.md','2026-10-24T13:00:00Z',true),
  ('api.me.saju.preview-reading','canary-20261024-v1',60,2,3,60,3600,
   'docs/security/SECURITY_PRODUCTION_ACTIVATION_20261024.md','2026-10-24T13:00:00Z',true),
  ('api.me.saju.calculation','production-20261024-v1',60,60,61,60,3600,
   'docs/security/SECURITY_PRODUCTION_ACTIVATION_20261024.md','2026-10-24T13:00:00Z',false),
  ('api.me.saju.preview-reading','production-20261024-v1',60,20,21,60,3600,
   'docs/security/SECURITY_PRODUCTION_ACTIVATION_20261024.md','2026-10-24T13:00:00Z',false);
